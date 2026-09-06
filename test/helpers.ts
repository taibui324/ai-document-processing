import { loadConfig } from '../src/config';
export const testConfig = (overrides: NodeJS.ProcessEnv = {}) => loadConfig({
  APP_ENV: 'test', AI_MODE: 'mock', API_SECRET: 'synthetic-api-key-for-tests', VENDOR_SECRET: 'synthetic-vendor-key-for-tests',
  DB_HOST: '127.0.0.1', DB_PORT: '13316', DB_NAME: 'medicon_test', DB_USER: 'root', DB_PASSWORD: 'test-only-root',
  REDIS_URL: 'redis://127.0.0.1:16379', PACE_MS: '1', POLL_MS: '20', BACKOFF_BASE_MS: '10',
  ...overrides,
});
