import { randomUUID } from 'node:crypto';
import { dataSource } from '../src/persistence/data-source';
import { testConfig } from './helpers';
import { acceptReceipt } from '../mock/receipts';
it('durably deduplicates concurrent vendor requests and detects changed payloads', async () => {
  const db = dataSource(testConfig()); await db.initialize(); await db.runMigrations();
  const key = randomUUID();
  const payload = { jobId: randomUUID(), schemaVersion: 'invoice-v1', extraction: { documentType: 'invoice', documentNumber: 'synthetic', documentDate: '2024-02-29', totalAmount: '1.00', currency: 'HKD', items: [{ description: 'test', quantity: 1, amount: '1.00' }] } };
  try {
    const results = await Promise.all([acceptReceipt(db, key, payload), acceptReceipt(db, key, payload)]);
    expect(results[0].submissionId).toMatch(/^[a-f0-9-]{36}$/); expect(results[0]).toEqual(results[1]);
    expect(await acceptReceipt(db, key, { extraction: payload.extraction, schemaVersion: payload.schemaVersion, jobId: payload.jobId })).toEqual(results[0]);
    await expect(acceptReceipt(db, key, { ...payload, jobId: randomUUID() })).rejects.toMatchObject({ status: 409 });
    await db.destroy(); await db.initialize();
    expect(await acceptReceipt(db, key, payload)).toEqual(results[0]);
    const [count] = await db.query('SELECT COUNT(*) AS n FROM mock_vendor_receipts WHERE idempotency_key=?', [key]); expect(Number(count.n)).toBe(1);
  } finally { if (db.isInitialized) await db.destroy(); }
});
