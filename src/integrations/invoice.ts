import { z } from 'zod';
const money = z.string().regex(/^(0|[1-9]\d{0,11})\.\d{2}$/);
export const invoiceSchema = z.strictObject({
  documentType: z.literal('invoice'), documentNumber: z.string().trim().min(1).max(100),
  documentDate: z.iso.date(), totalAmount: money, currency: z.enum(['HKD', 'VND', 'USD']),
  items: z.array(z.strictObject({ description: z.string().trim().min(1).max(300), quantity: z.number().int().min(1).max(1000000), amount: money })).min(1).max(100),
});
function geminiSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(geminiSchema);
  if (!value || typeof value !== 'object') return value;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (['$schema', 'pattern', 'minLength', 'maxLength', 'minItems', 'maxItems'].includes(key)) continue;
    if (key === 'const') output.enum = [child];
    else output[key] = geminiSchema(child);
  }
  return output;
}
export const invoiceJsonSchema = geminiSchema(z.toJSONSchema(invoiceSchema, { target: 'draft-07' })) as Record<string, unknown>;
export type Invoice = z.infer<typeof invoiceSchema>;
