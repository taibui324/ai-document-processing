import { DataSource } from 'typeorm';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { invoiceSchema } from '../src/integrations/invoice';
import { sha256 } from '../src/persistence/jobs';
const submissionSchema = z.strictObject({ jobId: z.uuid(), schemaVersion: z.literal('invoice-v1'), extraction: invoiceSchema });
export async function acceptReceipt(db: DataSource, key: string, payload: unknown): Promise<{ submissionId: string; status: 'accepted' }> {
  const parsed = submissionSchema.safeParse(payload);
  if (!parsed.success || !/^[\x20-\x7e]{1,128}$/.test(key)) throw new BadRequestException('INVALID_SUBMISSION');
  // Zod reconstructs this fixed schema in a stable property order; arrays retain their meaningful order.
  const hash = sha256(JSON.stringify(parsed.data)), id = randomUUID();
  try {
    await db.query('INSERT INTO mock_vendor_receipts (idempotency_key,payload_hash,receipt_id) VALUES (?,?,?)', [key, hash, id]);
    return { submissionId: id, status: 'accepted' };
  } catch (error) {
    if ((error as { driverError?: { code?: string } }).driverError?.code !== 'ER_DUP_ENTRY') throw error;
    const [receipt]: { payload_hash: string; receipt_id: string }[] = await db.query('SELECT payload_hash,receipt_id FROM mock_vendor_receipts WHERE idempotency_key=?', [key]);
    if (!receipt || receipt.payload_hash !== hash) throw new ConflictException('IDEMPOTENCY_CONFLICT');
    return { submissionId: receipt.receipt_id, status: 'accepted' };
  }
}
