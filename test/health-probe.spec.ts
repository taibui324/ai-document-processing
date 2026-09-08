import { ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { HealthController } from '../src/health/health.controller';
import { ProviderGate } from '../src/workflow/gate';

it('shares a stalled readiness probe until it settles, then refreshes it', async () => {
  jest.useFakeTimers();
  let settle!: () => void;
  const stalled = new Promise<void>(resolve => { settle = resolve; });
  const db = { isInitialized: true, query: jest.fn().mockReturnValue(stalled) } as unknown as DataSource;
  const gate = { ready: jest.fn().mockResolvedValue('PONG') } as unknown as ProviderGate;
  const health = new HealthController(db, gate);

  try {
    const first = health.ready();
    const concurrent = health.ready();
    const firstFailure = expect(first).rejects.toBeInstanceOf(ServiceUnavailableException);
    const concurrentFailure = expect(concurrent).rejects.toBeInstanceOf(ServiceUnavailableException);
    await jest.advanceTimersByTimeAsync(1000);
    await firstFailure;
    await concurrentFailure;

    const repeated = health.ready();
    expect(db.query).toHaveBeenCalledTimes(1);
    const repeatedFailure = expect(repeated).rejects.toBeInstanceOf(ServiceUnavailableException);
    await jest.advanceTimersByTimeAsync(1000);
    await repeatedFailure;

    settle();
    await jest.advanceTimersByTimeAsync(0);
    await expect(health.ready()).resolves.toEqual({ status: 'ready' });
    expect(db.query).toHaveBeenCalledTimes(2);
  } finally {
    jest.useRealTimers();
  }
});
