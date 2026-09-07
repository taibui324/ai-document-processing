import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { dataSource } from '../src/persistence/data-source';
import { testConfig } from './helpers';
import { configureHttp } from '../src/http';
it('durably accepts concurrent keyed PDFs, replays once, and rejects conflicting content', async () => {
  const config = testConfig(); const db = dataSource(config); await db.initialize(); await db.runMigrations();
  const mod = await Test.createTestingModule({ imports: [AppModule.register(config, db)] }).compile();
  const app = mod.createNestApplication(); configureHttp(app, config); await app.init();
  try {
    const pdf = await PDFDocument.create(); pdf.addPage(); const bytes = Buffer.from(await pdf.save()); const key = randomUUID();
    const submit = (body: Buffer) => request(app.getHttpServer()).post('/api/v1/document-jobs').set('X-API-Key', config.apiSecret).set('Idempotency-Key', key).attach('document', body, { filename: 'synthetic.pdf', contentType: 'application/pdf' });
    const responses = await Promise.all([submit(bytes), submit(bytes)]);
    expect(responses.map(r => r.status).sort()).toEqual([200, 202]);
    expect(responses[0].body.jobId).toBe(responses[1].body.jobId);
    const id = responses[0].body.jobId as string;
    await request(app.getHttpServer()).get('/api/v1/document-jobs/' + id).set('X-API-Key', config.apiSecret).expect(200).expect(r => expect(r.body.status).toBe('RECEIVED'));
    pdf.addPage(); await submit(Buffer.from(await pdf.save())).expect(409);
    await request(app.getHttpServer()).post('/api/v1/document-jobs').attach('document', Buffer.from('hostile'), 'bad.pdf').expect(401);
    await request(app.getHttpServer()).get('/api/v1/document-jobs/invalid').set('X-API-Key', config.apiSecret).expect(400);
    await request(app.getHttpServer()).get('/api/v1/document-jobs/' + randomUUID()).set('X-API-Key', config.apiSecret).expect(404);
  } finally { await app.close(); await db.destroy(); }
});
it('bounds upload input, validates correlation IDs, and returns safe 503 when acceptance cannot commit', async () => {
  const config = testConfig({ UPLOAD_MAX_BYTES: '1024' }); const db = dataSource(config); await db.initialize();
  const mod = await Test.createTestingModule({ imports: [AppModule.register(config, db)] }).compile();
  const app = mod.createNestApplication(); configureHttp(app, config); await app.init();
  try {
    const post = () => request(app.getHttpServer()).post('/api/v1/document-jobs').set('X-API-Key', config.apiSecret).set('Idempotency-Key', randomUUID());
    await post().expect(400);
    await post().attach('document', Buffer.alloc(1025), { filename: 'sensitive-name.pdf', contentType: 'application/pdf' }).expect(413);
    await post().attach('document', Buffer.from('image'), { filename: 'image.pdf', contentType: 'image/png' }).expect(415);
    await post().field('url', 'https://untrusted.invalid').expect(400);
    await post().set('X-Correlation-Id', 'hostile\"value').expect(400);
    const pdf = await PDFDocument.create(); pdf.addPage(); const bytes = Buffer.from(await pdf.save());
    await post().attach('document', bytes, 'one.pdf').attach('document', bytes, 'two.pdf').expect(400);
    const correlation = randomUUID();
    await post().set('X-Correlation-Id', correlation).attach('document', bytes, { filename: 'synthetic.pdf', contentType: 'application/pdf' }).expect(202).expect('X-Correlation-Id', correlation);
    await db.destroy();
    const response = await post().attach('document', bytes, { filename: 'sensitive-name.pdf', contentType: 'application/pdf' }).expect(503);
    expect(JSON.stringify(response.body)).not.toContain('sensitive-name'); expect(JSON.stringify(response.body)).not.toContain(config.apiSecret);
  } finally { await app.close(); if (db.isInitialized) await db.destroy(); }
});
