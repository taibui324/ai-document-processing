import { Stage } from '../persistence/jobs';
export class ProviderFailure extends Error {
  constructor(readonly code: string, readonly retryable: boolean, readonly httpStatus?: number, readonly retryAfter?: string, readonly unusable = false) { super(code); }
}
export interface RetryInput { now: number; deadline: number; attempts: number; maxAttempts: number; stage: Stage; unusableResults: number; baseMs?: number; random?: () => number }
export function retryAfterMs(header: string | undefined, now: number): number {
  if (!header) return 0;
  if (/^\d+$/.test(header)) return Number(header) * 1000;
  if (!/^[A-Za-z]{3},?\s/.test(header)) return 0;
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - now) : 0;
}
export function retryDecision(error: ProviderFailure, input: RetryInput): { retryAt: number | null; code: string } {
  if (!error.retryable || (error.unusable && input.unusableResults >= 2)) return { retryAt: null, code: error.code };
  if (input.now >= input.deadline) return { retryAt: null, code: input.stage + '_DEADLINE_EXHAUSTED' };
  if (input.attempts >= input.maxAttempts) return { retryAt: null, code: input.stage + '_ATTEMPTS_EXHAUSTED' };
  const cap = input.stage === 'AI' ? 60000 : 120000;
  const jitter = Math.floor((input.random ?? Math.random)() * Math.min(cap, (input.baseMs ?? 2000) * 2 ** (input.attempts - 1)));
  const retryAt = input.now + retryAfterMs(error.retryAfter, input.now) + jitter;
  return retryAt >= input.deadline ? { retryAt: null, code: input.stage + '_DEADLINE_EXHAUSTED' } : { retryAt, code: error.code };
}
