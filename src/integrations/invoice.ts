import { z } from 'zod';
const money = z.string().regex(/^(0|[1-9]\d{0,11})\.\d{2}$/);
export const invoiceSchema = z.strictObject({
  documentType: z.literal('invoice'), documentNumber: z.string().trim().min(1).max(100),
  documentDate: z.iso.date(), totalAmount: money, currency: z.enum(['HKD', 'VND', 'USD']),
  items: z.array(z.strictObject({ description: z.string().trim().min(1).max(300), quantity: z.number().int().min(1).max(1000000), amount: money })).min(1).max(100),
});
export const invoiceJsonSchema = z.toJSONSchema(invoiceSchema, { target: 'draft-7' });
export type Invoice = z.infer<typeof invoiceSchema>;
