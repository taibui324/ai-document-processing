import { harness } from './harness';
it.each([['ai-429-then-success', 'COMPLETED', 3], ['ai-429-exhausted', 'FAILED', 5]])('handles %s with bounded persisted attempts', async (scenario, status, attempts) => {
  const h = await harness(scenario);
  try {
    const job = await h.settle(await h.submit());
    expect(job.status).toBe(status); expect(job.ai_attempts).toBe(attempts);
    expect(job.vendor_attempts).toBe(status === 'COMPLETED' ? 1 : 0);
    const audit = await h.db.query('SELECT outcome,http_status,next_attempt_at,ended_at FROM job_attempts WHERE job_id=? AND stage=\'AI\' ORDER BY attempt_number', [job.id]);
    expect(audit[0].http_status).toBe(429); expect(audit[0].next_attempt_at.getTime()).toBeGreaterThanOrEqual(audit[0].ended_at.getTime());
  } finally { await h.close(); }
});
it.each([['vendor-503-then-success', 'COMPLETED', 3], ['vendor-reset', 'COMPLETED', 2], ['vendor-accept-then-drop', 'COMPLETED', 2], ['vendor-503-exhausted', 'FAILED', 6], ['vendor-invalid', 'FAILED', 6]])('handles %s without repeating extraction', async (scenario, status, attempts) => {
  const h = await harness(scenario);
  try {
    const job = await h.settle(await h.submit());
    expect(job.status).toBe(status); expect(job.vendor_attempts).toBe(attempts); expect(job.ai_attempts).toBe(1); expect(job.extraction_json).toBeTruthy();
    const [row] = await h.db.query('SELECT COUNT(*) AS n FROM mock_vendor_receipts WHERE idempotency_key=?', [job.vendor_idempotency_key]);
    expect(Number(row.n)).toBe(status === 'COMPLETED' || scenario === 'vendor-invalid' ? 1 : 0);
  } finally { await h.close(); }
});
it.each([['ai-empty', 2], ['ai-invalid', 2], ['ai-slow', 5]])('rejects %s without any vendor delivery', async (scenario, attempts) => {
  const h = await harness(scenario, scenario === 'ai-slow' ? { AI_TIMEOUT_MS: '100' } : {});
  try {
    const job = await h.settle(await h.submit());
    expect(job.status).toBe('FAILED'); expect(job.ai_attempts).toBe(attempts); expect(job.vendor_attempts).toBe(0);
    expect(job.extraction_json).toBeNull();
    const [row] = await h.db.query('SELECT COUNT(*) AS n FROM mock_vendor_receipts WHERE idempotency_key=?', [job.vendor_idempotency_key]); expect(Number(row.n)).toBe(0);
  } finally { await h.close(); }
});
