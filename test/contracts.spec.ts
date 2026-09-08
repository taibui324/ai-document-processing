import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';
import { dataSource } from '../src/persistence/data-source';
import { testConfig } from './helpers';
it('publishes acceptance and durable result schemas in OpenAPI', async () => {
  const config = testConfig();
  const mod = await Test.createTestingModule({ imports: [AppModule.register(config, dataSource(config))] }).compile();
  const app = mod.createNestApplication();
  try {
    const doc = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('API').setVersion('1').build());
    expect(doc.paths['/api/v1/document-jobs'].post?.responses['202']).toHaveProperty('content.application/json.schema.properties.jobId');
    expect(doc.paths['/api/v1/document-jobs/{jobId}'].get?.responses['200']).toHaveProperty('content.application/json.schema.properties.extraction');
  } finally { await app.close(); }
});
