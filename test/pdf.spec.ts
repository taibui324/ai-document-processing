import { PDFDocument, PDFName } from 'pdf-lib';
import { validatePdf } from '../src/jobs/pdf';
it('accepts only structurally valid, unencrypted, bounded PDFs and terminates slow parsing', async () => {
  const pdf = await PDFDocument.create(); pdf.addPage();
  const bytes = Buffer.from(await pdf.save());
  await expect(validatePdf(bytes, 'application/pdf')).resolves.toBeUndefined();
  await expect(validatePdf(bytes, 'image/png')).rejects.toMatchObject({ status: 415 });
  await expect(validatePdf(Buffer.from('not a pdf'), 'application/pdf')).rejects.toMatchObject({ status: 400 });
  await expect(validatePdf(Buffer.from('%PDF-1.7 broken'), 'application/pdf')).rejects.toMatchObject({ status: 400 });
  await expect(validatePdf(bytes, 'application/pdf', 20, 1)).rejects.toMatchObject({ status: 400 });
  pdf.addPage();
  await expect(validatePdf(Buffer.from(await pdf.save()), 'application/pdf', 1)).rejects.toMatchObject({ status: 400 });
  pdf.context.trailerInfo.Encrypt = pdf.context.register(pdf.context.obj({ Filter: PDFName.of('Standard') }));
  await expect(validatePdf(Buffer.from(await pdf.save()), 'application/pdf')).rejects.toMatchObject({ status: 400 });
});
