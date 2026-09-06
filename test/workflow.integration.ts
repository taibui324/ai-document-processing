import { randomUUID } from 'node:crypto';
import { dataSource } from '../src/persistence/data-source';
import { Jobs } from '../src/persistence/jobs';
import { WorkflowStore } from '../src/workflow/store';
import { testConfig } from './helpers';
import { ProviderFailure } from '../src/workflow/retry';
it('allows only one live lease for a due job across two MySQL workers', async () => {
  const config = testConfig(); const db = dataSource(config); await db.initialize(); await db.runMigrations();
  try {
    // Isolated test DB only; keep jobs from earlier tests ineligible for this claim test.
    await db.query("UPDATE document_jobs SET next_attempt_at=DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL 1 DAY) WHERE status NOT IN ('COMPLETED','FAILED')");
    const { job } = await new Jobs(db).accept(Buffer.from('%PDF-synthetic-test'), randomUUID(), randomUUID());
    const a = new WorkflowStore(db, config), b = new WorkflowStore(db, config);
    const claims = await Promise.all([a.claim(), b.claim()]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(claims.find(Boolean)).toMatchObject({ id: job.id, stage: 'AI', ai_attempts: 0 });
    expect(await a.claim()).toBeNull();
  } finally { await db.destroy(); }
});
it('persists retry timing, consumes no attempt on gate deferral, and sweeps expired waiting jobs', async () => {
  const config = testConfig(); const db = dataSource(config); await db.initialize();
  try {
    await db.query("UPDATE document_jobs SET next_attempt_at=DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL 1 DAY) WHERE status NOT IN ('COMPLETED','FAILED')");
    const jobs = new Jobs(db); const { job } = await jobs.accept(Buffer.from('%PDF-retry'), randomUUID(), randomUUID());
    const store = new WorkflowStore(db, config); const claim = (await store.claim())!;
    await store.start(claim);
    expect(await store.failed(claim, new ProviderFailure('AI_RATE_LIMITED', true, 429, '2'))).toBe(true);
    const retry = await jobs.get(job.id);
    expect(retry.status).toBe('RETRY_WAIT'); expect(retry.ai_attempts).toBe(1);
    expect(retry.next_attempt_at!.getTime() - retry.updated_at.getTime()).toBeGreaterThanOrEqual(2000);
    expect(await store.claim()).toBeNull();
    await db.query('UPDATE document_jobs SET next_attempt_at=CURRENT_TIMESTAMP(3) WHERE id=?', [job.id]);
    const gateClaim = (await store.claim())!;
    expect(await store.defer(gateClaim, 5000, 'REDIS_UNAVAILABLE')).toBe(true);
    expect((await jobs.get(job.id)).ai_attempts).toBe(1);
    await db.query('UPDATE document_jobs SET ai_deadline=DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 901 SECOND) WHERE id=?', [job.id]);
    expect(await store.sweep()).toBeGreaterThanOrEqual(1);
    expect(await jobs.get(job.id)).toMatchObject({ status: 'FAILED', last_error_code: 'AI_DEADLINE_EXHAUSTED', ai_attempts: 1 });
    expect(await store.extracted(gateClaim, {})).toBe(false);
  } finally { await db.destroy(); }
});
it('recovers an abandoned attempt without resetting its budget and rejects a stale extraction', async () => {
  const config = testConfig(); const db = dataSource(config); await db.initialize();
  try {
    await db.query("UPDATE document_jobs SET next_attempt_at=DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL 1 DAY) WHERE status NOT IN ('COMPLETED','FAILED')");
    const { job } = await new Jobs(db).accept(Buffer.from('%PDF-recovery'), randomUUID(), randomUUID());
    const store = new WorkflowStore(db, config);
    const old = (await store.claim())!;
    const started = (await store.start(old))!;
    expect(started.job.ai_attempts).toBe(1);
    await db.query('UPDATE document_jobs SET lease_expires_at=DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 1 SECOND) WHERE id=?', [job.id]);
    const recovered = (await store.claim())!;
    expect(recovered.ai_deadline).toEqual(old.ai_deadline);
    expect(recovered.ai_attempts).toBe(1);
    expect(await store.extracted(old, { stale: true })).toBe(false);
    await store.start(recovered);
    expect(await store.extracted(recovered, { valid: true })).toBe(true);
    const saved = await new Jobs(db).get(job.id);
    expect(saved).toMatchObject({ stage: 'VENDOR', status: 'VENDOR_PENDING', ai_attempts: 2, extraction_json: { valid: true } });
    const audit = await db.query('SELECT outcome FROM job_attempts WHERE job_id=? ORDER BY attempt_number', [job.id]);
    expect(audit).toEqual([{ outcome: 'ABANDONED' }, { outcome: 'SUCCEEDED' }]);
  } finally { await db.destroy(); }
});
