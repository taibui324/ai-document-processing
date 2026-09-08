import { z } from 'zod';
import { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { invoiceSchema } from '../integrations/invoice';
const status: SchemaObject = { type: 'string', enum: ['RECEIVED', 'AI_PROCESSING', 'RETRY_WAIT', 'VENDOR_PENDING', 'VENDOR_SUBMITTING', 'COMPLETED', 'FAILED'] };
const timestamp: SchemaObject = { type: 'string', format: 'date-time' };
export const errorContract: SchemaObject = { type: 'object', properties: {
  error: { type: 'object', required: ['code', 'message', 'retryable'], properties: { code: { type: 'string' }, message: { type: 'string' }, retryable: { type: 'boolean' } } },
  correlationId: { type: 'string', format: 'uuid' },
} };
export const acceptedContract: SchemaObject = { type: 'object', required: ['jobId', 'status', 'statusUrl', 'createdAt'], properties: {
  jobId: { type: 'string', format: 'uuid' }, status, statusUrl: { type: 'string' }, createdAt: timestamp,
} };
export const jobContract: SchemaObject = { type: 'object', required: ['jobId', 'status', 'stage', 'attempts', 'createdAt', 'updatedAt', 'completedAt', 'nextAttemptAt', 'error'], properties: {
  jobId: { type: 'string', format: 'uuid' }, status, stage: { type: 'string', enum: ['AI', 'VENDOR'] },
  attempts: { type: 'object', required: ['ai', 'vendor'], properties: { ai: { type: 'integer', minimum: 0 }, vendor: { type: 'integer', minimum: 0 } } },
  createdAt: timestamp, updatedAt: timestamp, completedAt: { ...timestamp, nullable: true }, nextAttemptAt: { ...timestamp, nullable: true },
  error: { ...errorContract.properties!.error, nullable: true },
  extraction: z.toJSONSchema(invoiceSchema, { target: 'openapi-3.0' }) as SchemaObject,
  schemaVersion: { type: 'string', enum: ['invoice-v1'] }, delivery: { type: 'string', enum: ['accepted', 'unconfirmed'] }, vendorReceiptId: { type: 'string', nullable: true },
} };
