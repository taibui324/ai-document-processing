import { Controller, Get, Inject, Optional, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ProviderGate } from '../workflow/gate';

@Controller('health')
export class HealthController {
  private readinessProbe?: Promise<unknown>;

  constructor(@Optional() @Inject(DataSource) private readonly db?: DataSource, @Optional() private readonly gate?: ProviderGate) {}

  @Get('live')
  live() { return { status: 'ok' }; }

  @Get('ready')
  async ready() {
    let timer: NodeJS.Timeout | undefined;
    try {
      if (!this.db?.isInitialized || !this.gate) throw new Error('Dependencies unavailable');
      if (!this.readinessProbe) {
        const dependencies = [this.db.query('SELECT 1'), this.gate.ready()];
        this.readinessProbe = Promise.all(dependencies);
        void Promise.allSettled(dependencies).then(() => { this.readinessProbe = undefined; });
      }
      await Promise.race([
        this.readinessProbe,
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Readiness timeout')), 1000); }),
      ]);
      return { status: 'ready' };
    } catch {
      throw new ServiceUnavailableException('DEPENDENCIES_UNAVAILABLE');
    } finally {
      clearTimeout(timer);
    }
  }
}
