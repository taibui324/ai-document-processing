import { spawn, ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { harness } from './harness';
import { mockServer } from '../mock/server';
import { availablePort } from './helpers';

it('bounds an outbound call by the remaining lease as well as the stage budget', async () => {
  const h = await harness('ai-slow');
  const start = h.store.start.bind(h.store);
  jest.spyOn(h.store, 'start').mockImplementation(async claim => {
    const started = await start(claim);
    if (started) {
      // Simulate a claim whose lease was mostly spent before dispatch.
      started.job.lease_expires_at = new Date(started.now.getTime() + 300);
      await h.db.query('UPDATE document_jobs SET lease_expires_at=? WHERE id=?', [started.job.lease_expires_at, claim.id]);
    }
    return started;
  });
  try {
    const id = await h.submit(); const began = performance.now();
    await h.runner.tick(); await h.runner.idle();
    expect(performance.now() - began).toBeLessThan(1500);
    expect((await h.jobs.get(id)).extraction_json).toBeNull();
  } finally { await h.close(); }
});

it('runs the worker executable and releases resources on SIGTERM', async () => {
  const h = await harness();
  const port = await availablePort();
  let child: ChildProcess | undefined;
  try {
    const id = await h.submit();
    child = spawn(process.execPath, ['dist/src/worker.js'], {
      env: { ...process.env, APP_ENV: 'test', AI_MODE: 'mock', API_SECRET: h.config.apiSecret, VENDOR_SECRET: h.config.vendorSecret,
        DB_HOST: h.config.db.host, DB_PORT: String(h.config.db.port), DB_USER: h.config.db.username, DB_PASSWORD: h.config.db.password, DB_NAME: h.config.db.database,
        REDIS_URL: h.config.redisUrl, GEMINI_BASE_URL: h.config.geminiOrigin, VENDOR_BASE_URL: h.config.vendorOrigin, POLL_MS: '20', PACE_MS: '1', PORT: String(port) },
      stdio: 'ignore',
    });
    const end = Date.now() + 5000;
    let job = await h.jobs.get(id);
    while (job.status !== 'COMPLETED' && Date.now() < end) {
      await new Promise(resolve => setTimeout(resolve, 50));
      job = await h.jobs.get(id);
    }
    expect(job.status).toBe('COMPLETED');
    expect(await fetch(`http://127.0.0.1:${port}/health/ready`).then(r => r.status)).toBe(200);
    const exited = once(child, 'exit'); child.kill('SIGTERM');
    expect(await exited).toEqual([0, null]);
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await h.close();
  }
}, 15000);
it('aborts an active HTTP request on shutdown and resumes its original budget after restart', async () => {
  const h = await harness('ai-slow');
  let child: ChildProcess | undefined;
  let replacement: ReturnType<typeof mockServer> | undefined;
  const port = await availablePort();
  const start = () => spawn(process.execPath, ['dist/src/worker.js'], { env: { ...process.env,
    APP_ENV: 'test', AI_MODE: 'mock', API_SECRET: h.config.apiSecret, VENDOR_SECRET: h.config.vendorSecret,
    DB_HOST: h.config.db.host, DB_PORT: String(h.config.db.port), DB_USER: h.config.db.username, DB_PASSWORD: h.config.db.password, DB_NAME: h.config.db.database,
    REDIS_URL: h.config.redisUrl, GEMINI_BASE_URL: h.config.geminiOrigin, VENDOR_BASE_URL: h.config.vendorOrigin,
    POLL_MS: '20', PACE_MS: '1', BACKOFF_BASE_MS: '10', PORT: String(port), AI_TIMEOUT_MS: '10000',
  }, stdio: 'ignore' });
  try {
    const id = await h.submit(); let requested = false;
    h.mock.on('request', req => { if (req.url?.includes(':generateContent')) requested = true; });
    child = start();
    const startBy = Date.now() + 8000;
    while (!requested && Date.now() < startBy) await new Promise(resolve => setTimeout(resolve, 20));
    expect(requested).toBe(true);
    const before = await h.jobs.get(id);
    const exited = once(child, 'exit'); child.kill('SIGTERM'); expect(await exited).toEqual([0, null]);
    const stopped = await h.jobs.get(id);
    expect(stopped).toMatchObject({ status: 'RETRY_WAIT', ai_attempts: 1, last_error_code: 'AI_CANCELLED' });
    h.mock.closeAllConnections(); await new Promise<void>(resolve => h.mock.close(() => resolve()));
    replacement = mockServer(h.db, h.config);
    await new Promise<void>(resolve => replacement!.listen(Number(new URL(h.config.geminiOrigin).port), '127.0.0.1', resolve));
    child = start();
    const finishBy = Date.now() + 8000; let saved = await h.jobs.get(id);
    while (saved.status !== 'COMPLETED' && Date.now() < finishBy) { await new Promise(resolve => setTimeout(resolve, 20)); saved = await h.jobs.get(id); }
    expect(saved).toMatchObject({ status: 'COMPLETED', ai_attempts: 2, vendor_attempts: 1 }); expect(saved.ai_deadline).toEqual(before.ai_deadline);
    const done = once(child, 'exit'); child.kill('SIGTERM'); expect(await done).toEqual([0, null]);
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) { const dead = once(child, 'exit'); child.kill('SIGKILL'); await dead; }
    if (replacement) { replacement.closeAllConnections(); await new Promise<void>(resolve => replacement!.close(() => resolve())); }
    await h.close();
  }
}, 25000);
it('accepts another document while AI is blocked and stops new claims after shutdown', async () => {
  const h = await harness('ai-slow', { AI_TIMEOUT_MS: '10000', CONCURRENCY: '1' });
  try {
    let requested = false; h.mock.on('request', req => { if (req.url?.includes(':generateContent')) requested = true; });
    const first = await h.submit(); await h.runner.tick();
    const readyBy = Date.now() + 3000;
    while (!requested && Date.now() < readyBy) await new Promise(resolve => setTimeout(resolve, 10));
    expect(requested).toBe(true);
    const began = Date.now(); const second = await h.submit();
    expect(Date.now() - began).toBeLessThan(2000); expect((await h.jobs.get(first)).status).toBe('AI_PROCESSING');
    await h.runner.stop(); await h.runner.tick();
    expect(await h.jobs.get(second)).toMatchObject({ status: 'RECEIVED', ai_attempts: 0 });
  } finally { await h.close(); }
});
