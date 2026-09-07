import { createServer, connect, Socket, AddressInfo } from 'node:net';
import request from 'supertest';
import { harness } from './harness';
it('durably defers during a Redis network outage and resumes without spending an attempt', async () => {
  const sockets = new Set<Socket>();
  const proxy = createServer(socket => {
    const upstream = connect(16379, '127.0.0.1');
    sockets.add(socket); sockets.add(upstream);
    socket.on('error', () => upstream.destroy()); upstream.on('error', () => socket.destroy());
    socket.on('close', () => { upstream.destroy(); sockets.delete(socket); }); upstream.on('close', () => sockets.delete(upstream));
    socket.pipe(upstream).pipe(socket);
  });
  await new Promise<void>(resolve => proxy.listen(0, '127.0.0.1', resolve));
  const port = (proxy.address() as AddressInfo).port;
  const h = await harness('happy', { REDIS_URL: 'redis://127.0.0.1:' + port });
  try {
    const id = await h.submit();
    const stopped = new Promise<void>(resolve => proxy.close(() => resolve()));
    for (const socket of sockets) socket.destroy(); await stopped;
    await h.runner.tick(); await h.runner.idle();
    const deferred = await h.jobs.get(id);
    expect(deferred).toMatchObject({ status: 'RETRY_WAIT', ai_attempts: 0, last_error_code: 'REDIS_UNAVAILABLE' });
    expect(deferred.next_attempt_at!.getTime() - deferred.updated_at.getTime()).toBe(5000);
    await request(h.app.getHttpServer()).get('/health/ready').expect(503);
    await new Promise<void>(resolve => proxy.listen(port, '127.0.0.1', resolve));
    const readyBy = Date.now() + 3000;
    while (!h.gate.client.isReady && Date.now() < readyBy) await new Promise(resolve => setTimeout(resolve, 20));
    expect(h.gate.client.isReady).toBe(true);
    await h.db.query('UPDATE document_jobs SET next_attempt_at=CURRENT_TIMESTAMP(3) WHERE id=?', [id]);
    const completed = await h.settle(id);
    expect(completed).toMatchObject({ status: 'COMPLETED', ai_attempts: 1, vendor_attempts: 1 });
    expect(completed.ai_deadline).toEqual(deferred.ai_deadline);
  } finally {
    await h.close(); for (const socket of sockets) socket.destroy();
    if (proxy.listening) await new Promise<void>(resolve => proxy.close(() => resolve()));
  }
});
