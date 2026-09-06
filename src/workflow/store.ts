import { DataSource, EntityManager } from 'typeorm';
import { Config } from '../config';
import { Job } from '../persistence/jobs';
import { randomUUID } from 'node:crypto';
import { ProviderFailure, retryDecision } from './retry';
export class WorkflowStore {
  constructor(readonly db: DataSource, readonly config: Config) {}
  async failed(claim: Job, error: ProviderFailure): Promise<boolean> {
    return (await this.fenced(claim, async (tx, job, now) => {
      const unusable = job.unusable_results + (error.unusable && job.stage === 'AI' ? 1 : 0);
      const result = retryDecision(error, { now: now.getTime(), deadline: (job.stage === 'AI' ? job.ai_deadline : job.vendor_deadline)!.getTime(),
        attempts: job.stage === 'AI' ? job.ai_attempts : job.vendor_attempts, maxAttempts: job.stage === 'AI' ? this.config.aiMaxAttempts : this.config.vendorMaxAttempts,
        stage: job.stage, unusableResults: unusable, baseMs: this.config.backoffBaseMs });
      const retryAt = result.retryAt === null ? null : new Date(result.retryAt);
      await this.audit(tx, job, now, retryAt ? 'RETRY' : 'FAILED', error.code, retryAt, error.httpStatus ?? null);
      await tx.query(`UPDATE document_jobs SET status=?,next_attempt_at=?,last_error_code=?,unusable_results=?,
        lease_token=NULL,lease_expires_at=NULL,completed_at=?,updated_at=? WHERE id=?`,
        [retryAt ? 'RETRY_WAIT' : 'FAILED', retryAt ?? now, result.code, unusable, retryAt ? null : now, now, job.id]);
      return true;
    })) ?? false;
  }
  async defer(claim: Job, delayMs: number, code: string): Promise<boolean> {
    return (await this.fenced(claim, async (tx, job, now) => {
      const deadline = (job.stage === 'AI' ? job.ai_deadline : job.vendor_deadline)!;
      const due = new Date(now.getTime() + delayMs), exhausted = due >= deadline;
      await tx.query(`UPDATE document_jobs SET status=?,next_attempt_at=?,last_error_code=?,lease_token=NULL,lease_expires_at=NULL,completed_at=?,updated_at=? WHERE id=?`,
        [exhausted ? 'FAILED' : 'RETRY_WAIT', due, exhausted ? job.stage + '_DEADLINE_EXHAUSTED' : code, exhausted ? now : null, now, job.id]);
      return true;
    })) ?? false;
  }
  async sweep(): Promise<number> {
    return this.db.transaction('READ COMMITTED', async tx => {
      const jobs: Job[] = await tx.query(`SELECT * FROM document_jobs WHERE status NOT IN ('FAILED','COMPLETED') AND
        ((stage='AI' AND ai_deadline<=CURRENT_TIMESTAMP(3)) OR (stage='VENDOR' AND vendor_deadline<=CURRENT_TIMESTAMP(3))) LIMIT 100 FOR UPDATE SKIP LOCKED`);
      const [{ now }]: { now: Date }[] = await tx.query('SELECT CURRENT_TIMESTAMP(3) AS now');
      for (const job of jobs) {
        const code = job.stage + '_DEADLINE_EXHAUSTED';
        await this.audit(tx, job, now, 'FAILED', code);
        await tx.query("UPDATE document_jobs SET status='FAILED',last_error_code=?,lease_token=NULL,lease_expires_at=NULL,updated_at=?,completed_at=? WHERE id=?", [code, now, now, job.id]);
      }
      return jobs.length;
    });
  }
  private async fenced<T>(claim: Job, action: (tx: EntityManager, job: Job, now: Date) => Promise<T>): Promise<T | null> {
    return this.db.transaction('READ COMMITTED', async tx => {
      const [job]: Job[] = await tx.query(`SELECT * FROM document_jobs WHERE id=? AND stage=? AND lease_token=?
        AND lease_expires_at>CURRENT_TIMESTAMP(3) AND status NOT IN ('COMPLETED','FAILED') FOR UPDATE`, [claim.id, claim.stage, claim.lease_token]);
      if (!job) return null;
      const [{ now }]: { now: Date }[] = await tx.query('SELECT CURRENT_TIMESTAMP(3) AS now');
      return action(tx, job, now);
    });
  }
  private async audit(tx: EntityManager, job: Job, now: Date, outcome: string, code: string | null = null, retryAt: Date | null = null, httpStatus: number | null = null) {
    await tx.query(`UPDATE job_attempts SET outcome=?,error_code=?,http_status=?,ended_at=?,
      duration_ms=GREATEST(0,TIMESTAMPDIFF(MICROSECOND,started_at,?)/1000),next_attempt_at=?
      WHERE job_id=? AND stage=? AND outcome='STARTED'`, [outcome, code, httpStatus, now, now, retryAt, job.id, job.stage]);
  }
  async start(claim: Job): Promise<{ job: Job; now: Date } | null> {
    return this.fenced(claim, async (tx, job, now) => {
      const column = job.stage === 'AI' ? 'ai_attempts' : 'vendor_attempts';
      const deadline = job.stage === 'AI' ? job.ai_deadline : job.vendor_deadline;
      const cap = job.stage === 'AI' ? this.config.aiMaxAttempts : this.config.vendorMaxAttempts;
      if (!deadline || now >= deadline || job[column] >= cap) {
        const code = job.stage + (deadline && now < deadline ? '_ATTEMPTS_EXHAUSTED' : '_DEADLINE_EXHAUSTED');
        await tx.query("UPDATE document_jobs SET status='FAILED',last_error_code=?,lease_token=NULL,lease_expires_at=NULL,completed_at=?,updated_at=? WHERE id=?", [code, now, now, job.id]);
        return null;
      }
      await tx.query(`UPDATE document_jobs SET ${column}=${column}+1,updated_at=? WHERE id=?`, [now, job.id]);
      await tx.query("INSERT INTO job_attempts (job_id,stage,attempt_number,outcome,started_at) VALUES (?,?,?,'STARTED',?)", [job.id, job.stage, job[column] + 1, now]);
      job[column]++;
      return { job, now };
    });
  }
  async extracted(claim: Job, value: unknown): Promise<boolean> {
    if (claim.stage !== 'AI') return false;
    return (await this.fenced(claim, async (tx, job, now) => {
      if (!job.ai_deadline || now >= job.ai_deadline || job.ai_attempts === 0) return false;
      await this.audit(tx, job, now, 'SUCCEEDED');
      await tx.query(`UPDATE document_jobs SET extraction_json=?,schema_version='invoice-v1',model_id=?,stage='VENDOR',status='VENDOR_PENDING',
        vendor_deadline=?,next_attempt_at=?,lease_token=NULL,lease_expires_at=NULL,last_error_code=NULL,updated_at=? WHERE id=?`,
        [JSON.stringify(value), this.config.geminiModel, new Date(now.getTime() + this.config.vendorBudgetMs), now, now, job.id]);
      return true;
    })) ?? false;
  }
  async claim(): Promise<Job | null> {
    return this.db.transaction('READ COMMITTED', async tx => {
      const [job]: Job[] = await tx.query(`SELECT * FROM document_jobs WHERE status NOT IN ('COMPLETED','FAILED')
        AND next_attempt_at <= CURRENT_TIMESTAMP(3) AND (lease_expires_at IS NULL OR lease_expires_at <= CURRENT_TIMESTAMP(3))
        ORDER BY next_attempt_at, id LIMIT 1 FOR UPDATE SKIP LOCKED`);
      if (!job) return null;
      const [{ now }]: { now: Date }[] = await tx.query('SELECT CURRENT_TIMESTAMP(3) AS now');
      await this.audit(tx, job, now, 'ABANDONED', 'LEASE_EXPIRED');
      const deadline = job.stage === 'AI' ? job.ai_deadline ?? new Date(now.getTime() + this.config.aiBudgetMs) : job.vendor_deadline;
      const token = randomUUID();
      await tx.query(`UPDATE document_jobs SET lease_token=?, lease_expires_at=?, ai_deadline=COALESCE(ai_deadline,?),
        status=?, updated_at=? WHERE id=?`, [token, new Date(now.getTime() + this.config.leaseMs), job.stage === 'AI' ? deadline : job.ai_deadline,
        job.stage === 'AI' ? 'AI_PROCESSING' : 'VENDOR_SUBMITTING', now, job.id]);
      const [claimed]: Job[] = await tx.query('SELECT * FROM document_jobs WHERE id=?', [job.id]);
      return claimed;
    });
  }
}
