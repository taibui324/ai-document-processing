import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadConfig } from './config';
import { dataSource } from './persistence/data-source';
import { configureHttp } from './http';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
async function main() {
  const config = loadConfig();
  const db = dataSource(config); await db.initialize();
  const app = await NestFactory.create(AppModule.register(config, db), { logger: false });
  configureHttp(app, config);
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('Document processing').setVersion('1').addApiKey({ type: 'apiKey', in: 'header', name: 'X-API-Key' }, 'apiKey').build()));
  await app.listen(config.port, '0.0.0.0');
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void (async () => { await app.close(); await db.destroy(); })().catch(() => { process.exitCode = 1; }); });
}
void main().catch(() => { console.error('API startup failed: verify configuration and dependencies'); process.exitCode = 1; });
