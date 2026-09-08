import { Job } from '../persistence/jobs';

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
