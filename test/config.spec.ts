import { loadConfig } from '../src/config';
const local = { APP_ENV: 'local', AI_MODE: 'mock', API_SECRET: 'synthetic-api-key-for-tests', DB_PASSWORD: 'test-only', VENDOR_SECRET: 'synthetic-vendor-key-for-tests' };
it('starts mock mode without Gemini credentials and validates real mode and lease safety', () => {
  expect(loadConfig(local)).toMatchObject({ aiMode: 'mock', aiTimeoutMs: 60000, leaseMs: 90000 });
  expect(() => loadConfig({ ...local, AI_MODE: 'real' })).toThrow('Invalid configuration');
  expect(() => loadConfig({ ...local, LEASE_MS: '60000' })).toThrow('Invalid configuration');
  expect(() => loadConfig({ ...local, APP_ENV: 'production' })).toThrow('Invalid configuration');
});
