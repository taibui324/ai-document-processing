import { harness } from './harness';
it.each(['happy', 'ai-invalid'])('records safe acceptance and workflow logs for %s', async scenario => {
  const captured: string[] = [];
  const spy = jest.spyOn(console, 'log').mockImplementation(line => captured.push(String(line)));
  let h: Awaited<ReturnType<typeof harness>> | undefined;
  try {
    h = await harness(scenario);
    const id = await h.submit(); await h.settle(id);
    const logs = captured.map(line => JSON.parse(line) as Record<string, unknown>);
    expect(logs.some(log => log.event === 'job_accepted' && log.jobId === id)).toBe(true);
    expect(logs.some(log => log.event === 'stage_completed' || log.event === 'stage_failed')).toBe(true);
    const all = captured.join('\n');
    for (const secret of [h.config.apiSecret, h.config.vendorSecret, '%PDF-', 'synthetic.pdf', 'SYNTHETIC-001', 'documentNumber', 'malformed']) expect(all).not.toContain(secret);
  } finally { spy.mockRestore(); await h?.close(); }
});
