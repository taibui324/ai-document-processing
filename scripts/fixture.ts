import { mkdir, writeFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
async function main() {
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText('SYNTHETIC INVOICE\nInvoice number: SYNTHETIC-001\nDate: 2024-02-29\nCurrency: HKD\nItem: Synthetic item, quantity 1, amount 12.50\nTotal amount: 12.50\nNOT PATIENT DATA', { x: 40, y: 700, size: 14 });
  await mkdir('.tmp', { recursive: true }); await writeFile('.tmp/invoice.pdf', await pdf.save());
  console.log('.tmp/invoice.pdf');
}
void main().catch(() => { console.error('Fixture generation failed'); process.exitCode = 1; });
