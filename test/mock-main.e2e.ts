import { spawn, ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { AddressInfo } from 'node:net';

it('reports a bind failure through the startup error handler', async () => {
  const occupied = createServer();
  await new Promise<void>(resolve => occupied.listen(0, '0.0.0.0', resolve));
  const port = (occupied.address() as AddressInfo).port;
  let child: ChildProcess | undefined;
  try {
    child = spawn(process.execPath, ['dist/mock/main.js'], {
      env: {
        ...process.env,
        APP_ENV: 'test', AI_MODE: 'mock', PORT: String(port),
        API_SECRET: 'synthetic-api-key-for-tests', VENDOR_SECRET: 'synthetic-vendor-key-for-tests',
        DB_HOST: '127.0.0.1', DB_PORT: '13316', DB_NAME: 'medicon_test', DB_USER: 'root', DB_PASSWORD: 'test-only-root',
        REDIS_URL: 'redis://127.0.0.1:16379',
      },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr?.on('data', chunk => { stderr += String(chunk); });
    expect(await once(child, 'exit')).toEqual([1, null]);
    expect(stderr).toContain('Mock startup failed');
    expect(stderr).not.toContain('EADDRINUSE');
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await new Promise<void>(resolve => occupied.close(() => resolve()));
  }
}, 10000);
