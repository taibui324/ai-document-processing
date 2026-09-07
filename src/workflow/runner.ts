import { Config } from '../config';
import { Job, Jobs } from '../persistence/jobs';
import { ProviderGate } from './gate';
import { WorkflowStore } from './store';
import { GeminiClient } from '../integrations/gemini';
import { VendorClient } from '../integrations/vendor';
import { ProviderFailure, retryAfterMs } from './retry';
import { logEvent } from '../http';
export class WorkflowRunner {
  private readonly active = new Set<Promise<void>>();
  private readonly abort = new AbortController();
  constructor(readonly config: Config, readonly store: WorkflowStore, readonly jobs: Jobs, readonly gate: ProviderGate) {}
  async tick(): Promise<void> {
    if (this.abort.signal.aborted) return;
    const swept = await this.store.sweep();
    if (swept) logEvent({ event: 'deadlines_exhausted', code: 'DEADLINE_EXHAUSTED' });
    // Limit each poll as well as concurrent calls so fast failures cannot create an unbounded claim loop.
    const available = this.config.concurrency - this.active.size;
    for (let i = 0; i < available && !this.abort.signal.aborted; i++) {
      const claim = await this.store.claim(); if (!claim) break;
      const work = this.process(claim).catch(() => logEvent({ event: 'worker_error', jobId: claim.id, stage: claim.stage, code: 'PERSISTENCE_UNAVAILABLE' })).finally(() => this.active.delete(work));
      this.active.add(work);
    }
  }
  async idle(): Promise<void> { await Promise.all(this.active); }
  async stop(): Promise<void> { this.abort.abort(); await this.idle(); }
  private async process(claim: Job) {
    const scope = claim.stage === 'AI' ? this.config.geminiOrigin + ':' + this.config.geminiModel : this.config.vendorOrigin;
    let wait: number;
    try { wait = await this.gate.enter(scope); }
    catch { await this.store.defer(claim, 5000, 'REDIS_UNAVAILABLE'); await this.report(claim, 'provider_deferred'); return; }
    if (wait > 0 || this.abort.signal.aborted) { await this.store.defer(claim, Math.max(1, wait), 'PROVIDER_PACED'); await this.report(claim, 'provider_deferred'); return; }
    const startTime = performance.now();
    const started = await this.store.start(claim); if (!started) return;
    const { job, now } = started;
    try {
      const pdf = job.stage === 'AI' ? await this.jobs.document(job.id) : undefined;
      const remaining = Math.min((job.stage === 'AI' ? job.ai_deadline : job.vendor_deadline)!.getTime(), job.lease_expires_at!.getTime()) - now.getTime() - (performance.now() - startTime);
      if (remaining <= 0) throw new ProviderFailure(job.stage + '_DEADLINE_EXHAUSTED', false);
      const timeout = Math.min(remaining, job.stage === 'AI' ? this.config.aiTimeoutMs : this.config.vendorTimeoutMs);
      const stored = job.stage === 'AI'
        ? await this.store.extracted(job, await new GeminiClient(this.config).extract(pdf!, job.id, timeout, this.abort.signal))
        : await this.store.acknowledged(job, await new VendorClient(this.config).deliver(job, timeout, this.abort.signal));
      await this.report(job, stored ? 'stage_completed' : 'stale_result_discarded', performance.now() - startTime);
    } catch (error) {
      if (!(error instanceof ProviderFailure)) throw error;
      if (error.httpStatus === 429) {
        try {
          const [{ now: dbNow }]: { now: Date }[] = await this.store.db.query('SELECT CURRENT_TIMESTAMP(3) AS now');
          await this.gate.cooldown(scope, Math.max(this.config.paceMs, retryAfterMs(error.retryAfter, dbNow.getTime())));
        } catch { logEvent({ event: 'cooldown_unavailable', jobId: job.id, stage: job.stage, code: 'REDIS_UNAVAILABLE' }); }
      }
      const stored = await this.store.failed(job, error);
      await this.report(job, stored ? 'stage_failed' : 'stale_result_discarded', performance.now() - startTime);
    }
  }
  private async report(job: Job, event: string, durationMs?: number) {
    const saved = await this.jobs.get(job.id);
    logEvent({ event, correlationId: saved.correlation_id, jobId: saved.id, stage: job.stage,
      attempt: job.stage === 'AI' ? saved.ai_attempts : saved.vendor_attempts, durationMs: durationMs === undefined ? undefined : Math.round(durationMs),
      status: saved.status, code: saved.last_error_code ?? undefined, nextAttemptAt: saved.status === 'RETRY_WAIT' ? saved.next_attempt_at!.toISOString() : null });
  }
}
