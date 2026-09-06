import { ProviderFailure, retryDecision } from '../src/workflow/retry';
it('honors Retry-After plus jitter and ends attempts at the original deadline', () => {
  const now = Date.UTC(2026, 0, 1);
  const input = { now, deadline: now + 900000, attempts: 1, maxAttempts: 5, stage: 'AI' as const, unusableResults: 0, random: () => 0.5 };
  expect(retryDecision(new ProviderFailure('AI_RATE_LIMITED', true, 429, '3'), input).retryAt).toBe(now + 4000);
  expect(retryDecision(new ProviderFailure('AI_RATE_LIMITED', true, 429, new Date(now + 6000).toUTCString()), input).retryAt).toBe(now + 7000);
  for (const header of ['bad', '-1', '1.5', new Date(now - 1000).toUTCString()]) expect(retryDecision(new ProviderFailure('AI_RATE_LIMITED', true, 429, header), input).retryAt).toBe(now + 1000);
  expect(retryDecision(new ProviderFailure('AI_RATE_LIMITED', true, 429, '901'), input).retryAt).toBeNull();
  expect(retryDecision(new ProviderFailure('AI_TIMEOUT', true), { ...input, now: now + 900001 }).retryAt).toBeNull();
  expect(retryDecision(new ProviderFailure('AI_TIMEOUT', true), { ...input, attempts: 5 }).retryAt).toBeNull();
  expect(retryDecision(new ProviderFailure('AI_BLOCKED', false), input).retryAt).toBeNull();
  expect(retryDecision(new ProviderFailure('AI_UNUSABLE_RESULT', true, 200, undefined, true), { ...input, unusableResults: 2 }).retryAt).toBeNull();
});
