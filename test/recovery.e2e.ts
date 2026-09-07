import { mockServer } from '../mock/server';
import { WorkflowRunner } from '../src/workflow/runner';
import { WorkflowStore } from '../src/workflow/store';
import { harness } from './harness';

it.each(['accepted', 'active-ai', 'extracted', 'remote-accepted'])('recovers at %s using persisted state and budgets', async checkpoint => {
  const h = await harness(checkpoint === 'remote-accepted' ? 'vendor-accept-then-drop' : 'happy');
  let replacement: ReturnType<typeof mockServer> | undefined;
  let resumed: WorkflowRunner | undefined;
  try {
    const id = await h.submit();
    let stale;
    if (checkpoint === 'active-ai') {
      stale = (await h.store.claim())!;
      await h.store.start(stale);
      await h.db.query('UPDATE document_jobs SET lease_expires_at=DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 1 SECOND) WHERE id=?', [id]);
    }
    if (checkpoint === 'extracted' || checkpoint === 'remote-accepted') { await h.runner.tick(); await h.runner.idle(); }
    if (checkpoint === 'remote-accepted') {
      await h.runner.tick(); await h.runner.idle();
      const [receipt] = await h.db.query('SELECT COUNT(*) AS n FROM mock_vendor_receipts WHERE idempotency_key=?', [id + ':invoice-v1']);
      expect(Number(receipt.n)).toBe(1);
      expect((await h.jobs.get(id)).status).toBe('RETRY_WAIT');
    }
    const before = await h.jobs.get(id);
    await h.runner.stop();
    h.mock.closeAllConnections(); await new Promise<void>(resolve => h.mock.close(() => resolve()));
    await h.db.destroy(); await h.db.initialize();
    replacement = mockServer(h.db, h.config, checkpoint === 'remote-accepted' ? 'vendor-accept-then-drop' : 'happy');
    await new Promise<void>(resolve => replacement!.listen(Number(new URL(h.config.vendorOrigin).port), '127.0.0.1', resolve));
    const store = new WorkflowStore(h.db, h.config);
    resumed = new WorkflowRunner(h.config, store, h.jobs, h.gate);
    const end = Date.now() + 5000;
    let saved = await h.jobs.get(id);
    while (saved.status !== 'COMPLETED' && Date.now() < end) {
      await resumed.tick(); await resumed.idle();
      saved = await h.jobs.get(id);
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    expect(saved.status).toBe('COMPLETED');
    expect(saved.ai_attempts).toBe(checkpoint === 'active-ai' ? 2 : 1);
    expect(saved.vendor_attempts).toBe(checkpoint === 'remote-accepted' ? 2 : 1);
    if (before.ai_deadline) expect(saved.ai_deadline).toEqual(before.ai_deadline);
    if (before.vendor_deadline) expect(saved.vendor_deadline).toEqual(before.vendor_deadline);
    if (before.extraction_json) expect(saved.extraction_json).toEqual(before.extraction_json);
    if (stale) {
      expect(await store.extracted(stale, { stale: true })).toBe(false);
      const [attempt] = await h.db.query("SELECT outcome FROM job_attempts WHERE job_id=? AND stage='AI' AND attempt_number=1", [id]);
      expect(attempt.outcome).toBe('ABANDONED');
    }
    const [receipt] = await h.db.query('SELECT COUNT(*) AS n FROM mock_vendor_receipts WHERE idempotency_key=?', [saved.vendor_idempotency_key]);
    expect(Number(receipt.n)).toBe(1);
  } finally {
    await resumed?.stop();
    if (replacement) { replacement.closeAllConnections(); await new Promise<void>(resolve => replacement!.close(() => resolve())); }
    await h.close();
  }
}, 15000);
