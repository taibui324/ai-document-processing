import { loadConfig } from '../src/config';
const local = { APP_ENV: 'local', AI_MODE: 'mock', API_SECRET: 'synthetic-api-key-for-tests', DB_PASSWORD: 'test-only', VENDOR_SECRET: 'synthetic-vendor-key-for-tests' };
it('starts mock mode without Gemini credentials and validates real mode and lease safety', () => {
  expect(loadConfig(local)).toMatchObject({ aiMode: 'mock', aiTimeoutMs: 60000, leaseMs: 90000 });
  expect(() => loadConfig({ ...local, AI_MODE: 'real' })).toThrow('Invalid configuration');
  expect(() => loadConfig({ ...local, LEASE_MS: '60000' })).toThrow('Invalid configuration');
  expect(() => loadConfig({ ...local, APP_ENV: 'production' })).toThrow('Invalid configuration');
});
it('rejects unsupported outbound protocols and model IDs that cannot be checkpointed', () => {
  expect(() => loadConfig({ ...local, GEMINI_BASE_URL: 'ftp://example.com' })).toThrow('Invalid configuration');
  expect(() => loadConfig({ ...local, VENDOR_BASE_URL: 'file:///' })).toThrow('Invalid configuration');
  expect(() => loadConfig({ ...local, GEMINI_MODEL: 'x'.repeat(101) })).toThrow('Invalid configuration');
});
it('allows real Gemini with the local mock vendor while production still requires HTTPS', () => {
  const realLocal = { ...local, AI_MODE: 'real', GEMINI_API_KEY: 'synthetic-gemini-key', GEMINI_MODEL: 'gemini-3.6-flash' };
  expect(loadConfig(realLocal)).toMatchObject({ aiMode: 'real', vendorOrigin: 'http://127.0.0.1:4000' });
  expect(() => loadConfig({ ...realLocal, APP_ENV: 'production' })).toThrow('Invalid configuration');
});
