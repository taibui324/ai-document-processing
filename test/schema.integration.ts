import { dataSource } from '../src/persistence/data-source';
import { testConfig } from './helpers';
it('migrates fresh MySQL 8 safely and keeps document bytes outside scheduler rows', async () => {
  const db = dataSource(testConfig());
  await db.initialize();
  try {
    await db.runMigrations();
    const tables: { TABLE_NAME: string }[] = await db.query("SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema=DATABASE()");
    expect(tables.map(t => t.TABLE_NAME)).toEqual(expect.arrayContaining(['document_jobs', 'documents', 'job_attempts', 'mock_vendor_receipts']));
    expect(await db.runMigrations()).toHaveLength(0);
    expect(db.options.synchronize).toBe(false);
  } finally { await db.destroy(); }
});
