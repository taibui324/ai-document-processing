import { z } from 'zod';

const integer = (fallback: number, max = 86400000) => z.coerce.number().int().positive().max(max).default(fallback);
const schema = z.object({
  APP_ENV: z.enum(['local', 'test', 'production']).default('production'), AI_MODE: z.enum(['mock', 'real']),
  PORT: integer(3000, 65535), API_SECRET: z.string().min(16), VENDOR_SECRET: z.string().min(16),
  DB_HOST: z.string().default('127.0.0.1'), DB_PORT: integer(3306, 65535),
  DB_USER: z.string().default('medicon'), DB_PASSWORD: z.string().min(1), DB_NAME: z.string().regex(/^[a-zA-Z0-9_]+$/).default('medicon'),
  REDIS_URL: z.url().default('redis://127.0.0.1:6379'),
  GEMINI_API_KEY: z.string().optional(), GEMINI_MODEL: z.string().regex(/^[a-zA-Z0-9.-]+$/).optional(),
  GEMINI_BASE_URL: z.url().default('https://generativelanguage.googleapis.com'), VENDOR_BASE_URL: z.url().default('http://127.0.0.1:4000'),
  UPLOAD_MAX_BYTES: integer(5242880, 5242880), PDF_MAX_PAGES: integer(20, 20), PDF_TIMEOUT_MS: integer(5000, 5000), UPLOAD_TIMEOUT_MS: integer(10000, 30000),
  POLL_MS: integer(1000, 10000), CONCURRENCY: integer(2, 16), LEASE_MS: integer(90000),
  AI_TIMEOUT_MS: integer(60000, 60000), VENDOR_TIMEOUT_MS: integer(15000, 15000), AI_BUDGET_MS: integer(900000), VENDOR_BUDGET_MS: integer(1800000),
  AI_MAX_ATTEMPTS: integer(5, 20), VENDOR_MAX_ATTEMPTS: integer(6, 20), PACE_MS: integer(1000, 60000), REDIS_TIMEOUT_MS: integer(500, 2000), BACKOFF_BASE_MS: integer(2000, 2000),
});

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) throw new Error(`Invalid configuration: ${parsed.error.issues.map(i => i.path.join('.')).join(', ')}`);
  const e = parsed.data;
  const gemini = new URL(e.GEMINI_BASE_URL), vendor = new URL(e.VENDOR_BASE_URL);
  if (Math.max(e.AI_TIMEOUT_MS, e.VENDOR_TIMEOUT_MS) + e.REDIS_TIMEOUT_MS + 1000 >= e.LEASE_MS ||
      (e.APP_ENV === 'production' && e.AI_MODE !== 'real') ||
      (e.AI_MODE === 'real' && (!e.GEMINI_API_KEY || !e.GEMINI_MODEL || gemini.origin !== 'https://generativelanguage.googleapis.com' || vendor.protocol !== 'https:')) ||
      [gemini, vendor].some(u => u.username || u.password || u.search || u.hash || u.pathname !== '/') ||
      !['redis:', 'rediss:'].includes(new URL(e.REDIS_URL).protocol)) throw new Error('Invalid configuration: mode, origins, credentials, or timeout/lease safety');
  return {
    appEnv: e.APP_ENV, aiMode: e.AI_MODE, port: e.PORT, apiSecret: e.API_SECRET, vendorSecret: e.VENDOR_SECRET,
    db: { host: e.DB_HOST, port: e.DB_PORT, username: e.DB_USER, password: e.DB_PASSWORD, database: e.DB_NAME },
    redisUrl: e.REDIS_URL, geminiKey: e.GEMINI_API_KEY, geminiModel: e.GEMINI_MODEL ?? 'mock-invoice-v1',
    geminiOrigin: e.AI_MODE === 'mock' && !env.GEMINI_BASE_URL ? 'http://127.0.0.1:4000' : gemini.origin,
    vendorOrigin: vendor.origin, uploadMaxBytes: e.UPLOAD_MAX_BYTES, pdfMaxPages: e.PDF_MAX_PAGES, pdfTimeoutMs: e.PDF_TIMEOUT_MS, uploadTimeoutMs: e.UPLOAD_TIMEOUT_MS,
    pollMs: e.POLL_MS, concurrency: e.CONCURRENCY, leaseMs: e.LEASE_MS, aiTimeoutMs: e.AI_TIMEOUT_MS, vendorTimeoutMs: e.VENDOR_TIMEOUT_MS,
    aiBudgetMs: e.AI_BUDGET_MS, vendorBudgetMs: e.VENDOR_BUDGET_MS, aiMaxAttempts: e.AI_MAX_ATTEMPTS, vendorMaxAttempts: e.VENDOR_MAX_ATTEMPTS,
    paceMs: e.PACE_MS, redisTimeoutMs: e.REDIS_TIMEOUT_MS, backoffBaseMs: e.BACKOFF_BASE_MS,
  };
}
export type Config = ReturnType<typeof loadConfig>;
