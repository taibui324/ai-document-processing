import { loadConfig } from '../config';
import { dataSource } from './data-source';
async function main() {
  const db = dataSource(loadConfig());
  await db.initialize();
  try { await db.runMigrations(); console.log(JSON.stringify({ event: 'migrations_complete' })); }
  finally { await db.destroy(); }
}
void main().catch(() => { console.error('Migration failed'); process.exitCode = 1; });
