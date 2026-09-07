import 'reflect-metadata';
import { createServer } from 'node:http';
import { setTimeout } from 'node:timers/promises';
import { loadConfig } from './config';
import { dataSource } from './persistence/data-source';
import { Jobs } from './persistence/jobs';
import { ProviderGate } from './workflow/gate';
import { WorkflowStore } from './workflow/store';
import { WorkflowRunner } from './workflow/runner';
import { logEvent } from './http';
async function main() {
  const config = loadConfig(), db = dataSource(config), gate = new ProviderGate(config);
  const abort = new AbortController();
  const runner = new WorkflowRunner(config, new WorkflowStore(db, config), new Jobs(db), gate);
  let lastPoll = 0;
  const health = createServer((req, res) => {
    const ready = !abort.signal.aborted && gate.client.isReady && Date.now() - lastPoll < Math.max(5000, config.pollMs * 3);
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = req.url === '/health/live' ? 200 : req.url === '/health/ready' ? (ready ? 200 : 503) : 404;
    res.end(JSON.stringify({ status: res.statusCode === 200 ? 'ok' : 'unavailable' }));
  });
  const stop = () => { abort.abort(); void runner.stop(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    await db.initialize();
    // Redis reconnects in the background; unavailable coordination defers durable jobs.
    void gate.open().catch(() => logEvent({ event: 'redis_unavailable', code: 'REDIS_UNAVAILABLE' }));
    await new Promise<void>((resolve, reject) => { health.once('error', reject); health.listen(config.port, '0.0.0.0', resolve); });
    while (!abort.signal.aborted) {
      try { await runner.tick(); lastPoll = Date.now(); }
      catch { lastPoll = 0; logEvent({ event: 'poll_failed', code: 'PERSISTENCE_UNAVAILABLE' }); }
      await setTimeout(config.pollMs, undefined, { signal: abort.signal }).catch(() => {});
    }
  } finally {
    await runner.stop();
    health.closeAllConnections();
    if (health.listening) await new Promise<void>(resolve => health.close(() => resolve()));
    if (gate.client.isOpen) await gate.close();
    if (db.isInitialized) await db.destroy();
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
  }
}
void main().catch(() => { logEvent({ event: 'worker_startup_failed', code: 'CONFIGURATION_OR_DEPENDENCY_ERROR' }); process.exitCode = 1; });
