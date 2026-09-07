import { createClient } from 'redis';
import { Config } from '../config';
import { sha256 } from '../persistence/jobs';
export class ProviderGate {
  readonly client;
  constructor(readonly config: Config) {
    this.client = createClient({ url: config.redisUrl, disableOfflineQueue: true, socket: { connectTimeout: config.redisTimeoutMs, reconnectStrategy: () => 200 } });
    this.client.on('error', () => {});
  }
  async open() {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([this.client.connect(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('REDIS_UNAVAILABLE')), this.config.redisTimeoutMs); })]);
    } finally { clearTimeout(timer); }
  }
  async close() { if (this.client.isOpen) this.client.destroy(); }
  async onModuleInit() { try { await this.open(); } catch { /* Readiness remains degraded while the client reconnects. */ } }
  async onModuleDestroy() { await this.close(); }
  async ready() { return this.client.withCommandOptions({ timeout: this.config.redisTimeoutMs }).ping(); }
  async enter(scope: string): Promise<number> {
    const prefix = 'medicon:gate:{' + sha256(scope) + '}';
    return Number(await this.client.withCommandOptions({ timeout: this.config.redisTimeoutMs }).eval(`
      local cooldown = redis.call('PTTL', KEYS[1])
      if cooldown > 0 then return cooldown end
      if redis.call('SET', KEYS[2], '1', 'NX', 'PX', ARGV[1]) then return 0 end
      return math.max(1, redis.call('PTTL', KEYS[2]))
    `, { keys: [prefix + ':cooldown', prefix + ':pace'], arguments: [String(this.config.paceMs)] }));
  }
  async cooldown(scope: string, delayMs: number): Promise<void> {
    if (delayMs <= 0) return;
    // A nonsensically large header still blocks longer than any configured stage budget.
    const ttl = Math.min(2147483647, Math.ceil(delayMs));
    await this.client.withCommandOptions({ timeout: this.config.redisTimeoutMs }).eval(`
      local current = redis.call('PTTL', KEYS[1])
      if current < tonumber(ARGV[1]) then redis.call('SET', KEYS[1], '1', 'PX', ARGV[1]) end
      return 1
    `, { keys: ['medicon:gate:{' + sha256(scope) + '}:cooldown'], arguments: [String(ttl)] });
  }
}
