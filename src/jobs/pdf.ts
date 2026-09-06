import { BadRequestException, UnsupportedMediaTypeException } from '@nestjs/common';
import { Worker } from 'node:worker_threads';

export async function validatePdf(bytes: Buffer, mime: string, maxPages = 20, timeoutMs = 5000): Promise<void> {
  if (mime !== 'application/pdf') throw new UnsupportedMediaTypeException('UNSUPPORTED_DOCUMENT');
  if (!bytes.length || bytes.subarray(0, 5).toString() !== '%PDF-') throw new BadRequestException('INVALID_PDF');
  await new Promise<void>((resolve, reject) => {
    const worker = new Worker(`
      const { workerData, parentPort } = require('node:worker_threads');
      const { PDFDocument } = require(workerData.library);
      PDFDocument.load(workerData.bytes, { ignoreEncryption: false, throwOnInvalidObject: true, updateMetadata: false })
        .then(pdf => parentPort.postMessage(!pdf.isEncrypted && pdf.getPageCount() >= 1 && pdf.getPageCount() <= workerData.maxPages))
        .catch(() => parentPort.postMessage(false));
    `, { eval: true, workerData: { bytes, maxPages, library: require.resolve('pdf-lib') }, resourceLimits: { maxOldGenerationSizeMb: 64, stackSizeMb: 4 }, stdout: true, stderr: true });
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true; clearTimeout(timer); void worker.terminate();
      if (ok) resolve(); else reject(new BadRequestException('INVALID_PDF'));
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    worker.once('message', ok => finish(ok === true));
    worker.once('error', () => finish(false)); worker.once('exit', () => finish(false));
  });
}
