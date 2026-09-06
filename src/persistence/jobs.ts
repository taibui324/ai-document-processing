import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
export const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export type Stage = 'AI' | 'VENDOR';
export type JobStatus = 'RECEIVED' | 'AI_PROCESSING' | 'RETRY_WAIT' | 'VENDOR_PENDING' | 'VENDOR_SUBMITTING' | 'COMPLETED' | 'FAILED';
export interface Job {
  id: string; correlation_id: string; document_sha256: string; status: JobStatus; stage: Stage;
  ai_attempts: number; vendor_attempts: number; unusable_results: number;
  lease_token: string | null; lease_expires_at: Date | null; next_attempt_at: Date | null;
  ai_deadline: Date | null; vendor_deadline: Date | null; extraction_json: unknown;
  schema_version: string | null; model_id: string | null; vendor_idempotency_key: string;
  vendor_receipt_id: string | null; last_error_code: string | null;
  created_at: Date; updated_at: Date; completed_at: Date | null;
}
@Injectable()
export class Jobs {
  constructor(readonly db: DataSource) {}
  async accept(bytes: Buffer, key: string, correlationId: string) {
    const keyHash = sha256(key), contentHash = sha256(bytes), id = randomUUID();
    try {
      await this.db.transaction(async tx => {
        await tx.query('INSERT INTO document_jobs (id,correlation_id,idempotency_key_hash,document_sha256,mime_type,size_bytes,vendor_idempotency_key) VALUES (?,?,?,?,?,?,?)',
          [id, correlationId, keyHash, contentHash, 'application/pdf', bytes.length, id + ':invoice-v1']);
        await tx.query('INSERT INTO documents (job_id,content) VALUES (?,?)', [id, bytes]);
      });
      return { job: await this.get(id), replay: false };
    } catch (error) {
      if ((error as { driverError?: { code?: string } }).driverError?.code !== 'ER_DUP_ENTRY') throw error;
      const [job]: Job[] = await this.db.query('SELECT * FROM document_jobs WHERE idempotency_key_hash=?', [keyHash]);
      if (!job || job.document_sha256 !== contentHash) throw new ConflictException('IDEMPOTENCY_CONFLICT');
      return { job, replay: true };
    }
  }
  async get(id: string): Promise<Job> {
    const [job]: Job[] = await this.db.query('SELECT * FROM document_jobs WHERE id=?', [id]);
    if (!job) throw new NotFoundException('JOB_NOT_FOUND');
    return job;
  }
  async document(id: string): Promise<Buffer> {
    const [row]: { content: Buffer }[] = await this.db.query('SELECT content FROM documents WHERE job_id=?', [id]);
    if (!row) throw new NotFoundException('JOB_NOT_FOUND');
    return row.content;
  }
}
export function publicJob(job: Job) {
  return {
    jobId: job.id, status: job.status, stage: job.stage,
    attempts: { ai: job.ai_attempts, vendor: job.vendor_attempts },
    createdAt: job.created_at, updatedAt: job.updated_at, completedAt: job.completed_at,
    nextAttemptAt: job.status === 'RETRY_WAIT' ? job.next_attempt_at : null,
    error: job.last_error_code ? { code: job.last_error_code, message: job.stage === 'VENDOR' && job.status === 'FAILED'
      ? 'Delivery is unconfirmed; remote acceptance may have occurred. Reconciliation may be required.'
      : 'Processing could not finish this stage.', retryable: job.status === 'RETRY_WAIT' } : null,
    ...(job.extraction_json ? { extraction: job.extraction_json, schemaVersion: job.schema_version,
      delivery: job.status === 'COMPLETED' ? 'accepted' : 'unconfirmed', vendorReceiptId: job.vendor_receipt_id } : {}),
  };
}
