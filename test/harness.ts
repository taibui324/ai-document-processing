import { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
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
export async function harness(scenario = 'happy', overrides: NodeJS.ProcessEnv = {}) {
  const db = dataSource(testConfig()); await db.initialize(); await db.runMigrations();
  await db.query("UPDATE document_jobs SET next_attempt_at=DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL 1 DAY) WHERE status NOT IN ('COMPLETED','FAILED')");
  const mock = mockServer(db, testConfig(), scenario); await new Promise<void>(resolve => mock.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + (mock.address() as AddressInfo).port;
  const config = testConfig({ GEMINI_BASE_URL: origin, VENDOR_BASE_URL: origin, AI_TIMEOUT_MS: '2000', VENDOR_TIMEOUT_MS: '2000', ...overrides });
  const mod = await Test.createTestingModule({ imports: [AppModule.register(config, db)] }).compile();
  const app = mod.createNestApplication(); configureHttp(app, config); await app.init();
  const gate = new ProviderGate(config); await gate.open();
  const jobs = new Jobs(db), store = new WorkflowStore(db, config);
  const runner = new WorkflowRunner(config, store, jobs, gate);
  async function submit() {
    const pdf = await PDFDocument.create(); pdf.addPage();
    const res = await request(app.getHttpServer()).post('/api/v1/document-jobs').set('X-API-Key', config.apiSecret).set('Idempotency-Key', randomUUID())
      .attach('document', Buffer.from(await pdf.save()), { filename: 'synthetic.pdf', contentType: 'application/pdf' }).expect(202);
    return res.body.jobId as string;
  }
  async function settle(id: string) {
    const end = Date.now() + 10000;
    while (Date.now() < end) {
      await runner.tick(); await runner.idle();
      const job = await jobs.get(id);
      if (job.status === 'FAILED' || job.status === 'COMPLETED') return job;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('Test workflow did not finish within 10 seconds');
  }
  async function close() { await runner.stop(); await gate.close(); await app.close(); mock.closeAllConnections(); await new Promise<void>(resolve => mock.close(() => resolve())); await db.destroy(); }
  return { db, mock, config, app, jobs, store, gate, runner, submit, settle, close };
}
