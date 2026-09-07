import { Controller, DynamicModule, Get, Inject, Module, Optional, ServiceUnavailableException } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { Config } from './config';
import { JobsController, ApiGuard } from './jobs/controller';
import { Jobs } from './persistence/jobs';
import { ProviderGate } from './workflow/gate';
@Controller('health')
class HealthController {
  constructor(@Optional() @Inject(DataSource) private readonly db?: DataSource, @Optional() private readonly gate?: ProviderGate) {}
  @Get('live') live() { return { status: 'ok' }; }
  @Get('ready') async ready() {
    let timer: NodeJS.Timeout | undefined;
    try {
      if (!this.db?.isInitialized || !this.gate) throw new Error('Dependencies unavailable');
      await Promise.race([Promise.all([this.db.query('SELECT 1'), this.gate.ready()]), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Readiness timeout')), 1000); })]);
      return { status: 'ready' };
    } catch { throw new ServiceUnavailableException('DEPENDENCIES_UNAVAILABLE'); }
    finally { clearTimeout(timer); }
  }
}
@Module({ controllers: [HealthController] })
export class AppModule {
  static register(config: Config, db: DataSource): DynamicModule {
    // Busboy emits partsLimit when the boundary reaches the limit; files/fields enforce the actual single-file contract.
    return { module: AppModule, imports: [MulterModule.register({ limits: { fileSize: config.uploadMaxBytes, files: 1, fields: 0, parts: 2 } })],
      controllers: [JobsController], providers: [{ provide: 'CONFIG', useValue: config }, { provide: DataSource, useValue: db }, { provide: ProviderGate, useFactory: () => new ProviderGate(config) }, Jobs, ApiGuard] };
  }
}
