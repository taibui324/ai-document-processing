import { loadConfig } from '../src/config';
import { dataSource } from '../src/persistence/data-source';
import { mockServer } from './server';
async function main() {
  const config = loadConfig(), db = dataSource(config); await db.initialize();
  const server = mockServer(db, config, process.env.MOCK_SCENARIO ?? 'happy');
  server.requestTimeout = 10000; server.headersTimeout = 10000;
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(config.port, '0.0.0.0', resolve);
    });
  } catch (error) {
    await db.destroy();
    throw error;
  }
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { server.closeAllConnections(); server.close(() => { void db.destroy(); }); });
}
void main().catch(() => { console.error('Mock startup failed'); process.exitCode = 1; });
