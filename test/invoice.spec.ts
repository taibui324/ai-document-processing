import { invoiceJsonSchema, invoiceSchema } from '../src/integrations/invoice';
export const invoice = { documentType: 'invoice', documentNumber: 'SYNTHETIC-001', documentDate: '2024-02-29', totalAmount: '12.50', currency: 'HKD', items: [{ description: 'Synthetic item', quantity: 1, amount: '12.50' }] };
it('validates bounded invoices with decimal-string money, real dates, and no unexpected fields', () => {
  expect(invoiceSchema.parse(invoice)).toEqual(invoice);
  const invalid = [null, {}, { ...invoice, extra: 'untrusted' }, { ...invoice, documentDate: '2025-02-29' }, { ...invoice, documentDate: '2024-04-31' },
    { ...invoice, totalAmount: 12.5 }, { ...invoice, totalAmount: '-1.00' }, { ...invoice, totalAmount: '9999999999999.00' },
    { ...invoice, documentNumber: '' }, { ...invoice, currency: 'EUR' }, { ...invoice, items: [] },
    { ...invoice, items: [{ description: 'x', quantity: 0, amount: '1.00' }] }];
  for (const value of invalid) expect(invoiceSchema.safeParse(value).success).toBe(false);
});
it('derives only JSON Schema keywords supported by Gemini structured output', () => {
  const serialized = JSON.stringify(invoiceJsonSchema);
  for (const keyword of ['$schema', 'const', 'pattern', 'minLength', 'maxLength', 'minItems', 'maxItems']) expect(serialized).not.toContain(`"${keyword}"`);
  expect(invoiceJsonSchema).toHaveProperty('properties.documentType.enum', ['invoice']);
});
