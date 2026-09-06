import { Stage } from '../persistence/jobs';
import { ProviderFailure } from '../workflow/retry';
export interface HttpOptions { stage: Stage; timeoutMs: number; maxBytes: number; signal?: AbortSignal }
export async function boundedJson(url: string, init: RequestInit, options: HttpOptions): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, options.timeoutMs));
  const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
  const unusable = () => new ProviderFailure(options.stage + '_UNUSABLE_RESULT', true, 200, undefined, options.stage === 'AI');
  try {
    const response = await fetch(url, { ...init, redirect: 'manual', signal });
    if (!response.ok) {
      const status = response.status;
      const code = status === 429 ? '_RATE_LIMITED' : status >= 300 && status < 400 ? '_REDIRECT_REJECTED' : '_HTTP_ERROR';
      throw new ProviderFailure(options.stage + code, status === 429 || status === 408 || status >= 500, status, response.headers.get('retry-after') ?? undefined);
    }
    if (Number(response.headers.get('content-length')) > options.maxBytes) throw unusable();
    if (!response.body) throw unusable();
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > options.maxBytes) throw unusable();
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; }
    catch { throw unusable(); }
  } catch (error) {
    if (error instanceof ProviderFailure) throw error;
    if (signal.aborted) throw new ProviderFailure(options.stage + (options.signal?.aborted ? '_CANCELLED' : '_TIMEOUT'), true);
    throw new ProviderFailure(options.stage + '_NETWORK_ERROR', true);
  } finally { clearTimeout(timer); controller.abort(); }
}
