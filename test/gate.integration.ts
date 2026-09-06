import { randomUUID } from 'node:crypto';
import { ProviderGate } from '../src/workflow/gate';
import { testConfig } from './helpers';
it('coordinates paced starts and only extends shared cooldowns across clients', async () => {
  const config = testConfig({ PACE_MS: '1000' }); const a = new ProviderGate(config), b = new ProviderGate(config);
  await Promise.all([a.open(), b.open()]);
  try {
    const scope = 'test:' + randomUUID();
    const starts = await Promise.all([a.enter(scope), b.enter(scope)]);
    expect(starts.filter(v => v === 0)).toHaveLength(1);
    expect(Math.max(...starts)).toBeGreaterThan(0);
    await a.cooldown(scope, 3000); await b.cooldown(scope, 100);
    expect(await b.enter(scope)).toBeGreaterThan(2000);
  } finally { await a.close(); await b.close(); }
});
