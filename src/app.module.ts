import { DynamicModule, Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { Config } from './config';
import { HealthController } from './health/health.controller';
import { ApiKeyGuard } from './jobs/api-key.guard';
import { JobsController } from './jobs/jobs.controller';
import { Jobs } from './persistence/jobs';
import { ProviderGate } from './workflow/gate';

@Module({ controllers: [HealthController] })
export class AppModule {
  static register(config: Config, db: DataSource): DynamicModule {
    // Busboy emits partsLimit when the boundary reaches the limit; files/fields enforce the actual single-file contract.
    return {
      module: AppModule,
      imports: [MulterModule.register({
        limits: { fileSize: config.uploadMaxBytes, files: 1, fields: 0, parts: 2 },
      })],
      controllers: [JobsController],
      providers: [
        { provide: 'CONFIG', useValue: config },
        { provide: DataSource, useValue: db },
        { provide: ProviderGate, useFactory: () => new ProviderGate(config) },
        Jobs,
        ApiKeyGuard,
      ],
    };
  }
}
