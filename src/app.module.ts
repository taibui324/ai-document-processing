import { Controller, DynamicModule, Get, Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { Config } from './config';
import { JobsController, ApiGuard } from './jobs/controller';
import { Jobs } from './persistence/jobs';
@Controller('health')
class HealthController {
  @Get('live') live() { return { status: 'ok' }; }
}
@Module({ controllers: [HealthController] })
export class AppModule {
  static register(config: Config, db: DataSource): DynamicModule {
    // Busboy emits partsLimit when the boundary reaches the limit; files/fields enforce the actual single-file contract.
    return { module: AppModule, imports: [MulterModule.register({ limits: { fileSize: config.uploadMaxBytes, files: 1, fields: 0, parts: 2 } })],
      controllers: [JobsController], providers: [{ provide: 'CONFIG', useValue: config }, { provide: DataSource, useValue: db }, Jobs, ApiGuard] };
  }
}
