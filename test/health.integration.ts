import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureHttp } from '../src/http';
import { dataSource } from '../src/persistence/data-source';
import { testConfig } from './helpers';
it('distinguishes process liveness from bounded dependency readiness', async () => {
  const config = testConfig(); const db = dataSource(config); await db.initialize();
  const mod = await Test.createTestingModule({ imports: [AppModule.register(config, db)] }).compile();
  const app = mod.createNestApplication(); configureHttp(app, config); await app.init();
  try {
    await request(app.getHttpServer()).get('/health/ready').expect(200);
    await db.destroy();
    await request(app.getHttpServer()).get('/health/live').expect(200);
    await request(app.getHttpServer()).get('/health/ready').expect(503);
  } finally { await app.close(); if (db.isInitialized) await db.destroy(); }
});
