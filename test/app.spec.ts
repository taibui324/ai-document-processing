import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
it('serves process liveness without external dependencies', async () => {
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = module.createNestApplication();
  await app.init();
  try { await request(app.getHttpServer()).get('/health/live').expect(200).expect({ status: 'ok' }); }
  finally { await app.close(); }
});
