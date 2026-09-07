import { randomUUID } from 'node:crypto';
import { AddressInfo } from 'node:net';
import { PDFDocument } from 'pdf-lib';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureHttp } from '../src/http';
import { dataSource } from '../src/persistence/data-source';
import { Jobs } from '../src/persistence/jobs';
import { ProviderGate } from '../src/workflow/gate';
import { WorkflowStore } from '../src/workflow/store';
import { WorkflowRunner } from '../src/workflow/runner';
import { mockServer } from '../mock/server';
import { testConfig } from './helpers';
it('completes a synthetic PDF through the HTTP API, durable worker, Gemini adapter and one vendor receipt', async () => {
  const db = dataSource(testConfig()); await db.initialize(); await db.runMigrations();
  await db.query("UPDATE document_jobs SET next_attempt_at=DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL 1 DAY) WHERE status NOT IN ('COMPLETED','FAILED')");
  const mock = mockServer(db, testConfig()); await new Promise<void>(resolve => mock.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + (mock.address() as AddressInfo).port;
  const config = testConfig({ GEMINI_BASE_URL: origin, VENDOR_BASE_URL: origin });
  const mod = await Test.createTestingModule({ imports: [AppModule.register(config, db)] }).compile();
  const app = mod.createNestApplication(); configureHttp(app, config); await app.init();
  const gate = new ProviderGate(config); await gate.open();
  const jobs = new Jobs(db); const runner = new WorkflowRunner(config, new WorkflowStore(db, config), jobs, gate);
  try {
    const pdf = await PDFDocument.create(); pdf.addPage(); const bytes = Buffer.from(await pdf.save()); const key = randomUUID();
    const post = () => request(app.getHttpServer()).post('/api/v1/document-jobs').set('X-API-Key', config.apiSecret).set('Idempotency-Key', key).attach('document', bytes, { filename: 'synthetic.pdf', contentType: 'application/pdf' });
    const accepted = await post().expect(202); const id = accepted.body.jobId as string;
    await runner.tick(); await runner.idle();
    expect((await jobs.get(id)).status).toBe('VENDOR_PENDING');
    await runner.tick(); await runner.idle();
    await request(app.getHttpServer()).get('/api/v1/document-jobs/' + id).set('X-API-Key', config.apiSecret).expect(200).expect(r => {
      expect(r.body.status).toBe('COMPLETED'); expect(r.body.attempts).toEqual({ ai: 1, vendor: 1 }); expect(r.body.vendorReceiptId).toBeTruthy();
    });
    const replay = await post().expect(200); expect(replay.body.jobId).toBe(id);
    const [row] = await db.query('SELECT COUNT(*) AS n FROM mock_vendor_receipts WHERE idempotency_key=?', [id + ':invoice-v1']); expect(Number(row.n)).toBe(1);
  } finally { await runner.stop(); await gate.close(); await app.close(); mock.closeAllConnections(); await new Promise<void>(resolve => mock.close(() => resolve())); await db.destroy(); }
});
