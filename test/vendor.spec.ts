import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { VendorClient } from '../src/integrations/vendor';
import { Job } from '../src/persistence/jobs';
import { testConfig } from './helpers';
it('reuses the persisted key and extraction and accepts only a valid acknowledgement', async () => {
  let acknowledgement: unknown = { submissionId: 'receipt-1', status: 'accepted' };
  const keys: string[] = [], payloads: unknown[] = [];
  const server = createServer(async (req, res) => { keys.push(req.headers['idempotency-key'] as string); const chunks = []; for await (const chunk of req) chunks.push(chunk as Buffer); payloads.push(JSON.parse(Buffer.concat(chunks).toString())); res.end(JSON.stringify(acknowledgement)); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const client = new VendorClient(testConfig({ VENDOR_BASE_URL: 'http://127.0.0.1:' + (server.address() as AddressInfo).port }));
  const job = { id: 'job', vendor_idempotency_key: 'stable-key', schema_version: 'invoice-v1', extraction_json: { documentNumber: 'synthetic' } } as Job;
  try {
    await expect(client.deliver(job, 1000)).resolves.toBe('receipt-1');
    acknowledgement = { status: 'accepted' };
    await expect(client.deliver(job, 1000)).rejects.toMatchObject({ code: 'VENDOR_UNUSABLE_RESULT', retryable: true });
    expect(keys).toEqual(['stable-key', 'stable-key']); expect(payloads[0]).toEqual(payloads[1]);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
