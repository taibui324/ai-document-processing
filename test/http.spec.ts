import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { boundedJson } from '../src/integrations/bounded-http';
it('bounds HTTP connection/body lifetime and size, honors abort, and never follows redirects', async () => {
  let openBodyClosed = false, redirected = false;
  const server = createServer((req, res) => {
    if (req.url === '/open') { res.writeHead(200); res.write('{'); res.on('close', () => { openBodyClosed = true; }); return; }
    if (req.url === '/big') { res.end('x'.repeat(2048)); return; }
    if (req.url === '/rate') { res.writeHead(429, { 'Retry-After': '7' }); res.end('secret upstream text'); return; }
    if (req.url === '/redirect') { res.writeHead(302, { Location: '/target' }); res.end(); return; }
    if (req.url === '/target') redirected = true;
    res.end(JSON.stringify({ ok: true }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  const options = { stage: 'AI' as const, timeoutMs: 100, maxBytes: 1024 };
  try {
    await expect(boundedJson(base, {}, options)).resolves.toEqual({ ok: true });
    await expect(boundedJson(base + '/open', {}, options)).rejects.toMatchObject({ code: 'AI_TIMEOUT', retryable: true });
    await new Promise(resolve => setTimeout(resolve, 20)); expect(openBodyClosed).toBe(true);
    await expect(boundedJson(base + '/big', {}, options)).rejects.toMatchObject({ code: 'AI_UNUSABLE_RESULT' });
    await expect(boundedJson(base + '/rate', {}, options)).rejects.toMatchObject({ code: 'AI_RATE_LIMITED', retryAfter: '7', httpStatus: 429 });
    await expect(boundedJson(base + '/redirect', {}, options)).rejects.toMatchObject({ retryable: false }); expect(redirected).toBe(false);
    await expect(boundedJson(base, {}, { ...options, signal: AbortSignal.abort() })).rejects.toMatchObject({ code: 'AI_CANCELLED' });
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
