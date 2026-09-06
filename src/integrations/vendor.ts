import { Config } from '../config';
import { Job } from '../persistence/jobs';
import { boundedJson } from './bounded-http';
import { ProviderFailure } from '../workflow/retry';
import { z } from 'zod';
export const receiptSchema = z.strictObject({ submissionId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/), status: z.literal('accepted') });
export class VendorClient {
  constructor(readonly config: Config) {}
  async deliver(job: Job, timeoutMs: number, signal?: AbortSignal): Promise<string> {
    const response = await boundedJson(this.config.vendorOrigin + '/submissions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': job.vendor_idempotency_key, 'X-Vendor-Key': this.config.vendorSecret },
      body: JSON.stringify({ jobId: job.id, schemaVersion: job.schema_version, extraction: job.extraction_json }),
    }, { stage: 'VENDOR', timeoutMs, maxBytes: 65536, signal });
    const result = receiptSchema.safeParse(response);
    if (!result.success) throw new ProviderFailure('VENDOR_UNUSABLE_RESULT', true, 200);
    return result.data.submissionId;
  }
}
