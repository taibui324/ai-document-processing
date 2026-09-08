import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { GeminiClient } from '../src/integrations/gemini';
import { testConfig } from './helpers';
it('extracts through REST with a fixed schema and rejects unusable, blocked, or truncated output', async () => {
  const invoice = { documentType: 'invoice', documentNumber: 'SYNTHETIC', documentDate: '2024-02-29', totalAmount: '1.00', currency: 'HKD', items: [{ description: 'Synthetic', quantity: 1, amount: '1.00' }] };
  let response: unknown = { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(invoice) }] } }] };
  let received: Record<string, unknown> = {};
  const server = createServer(async (req, res) => { const chunks = []; for await (const chunk of req) chunks.push(chunk as Buffer); received = JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>; res.end(JSON.stringify(response)); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const client = new GeminiClient(testConfig({ GEMINI_BASE_URL: 'http://127.0.0.1:' + (server.address() as AddressInfo).port }));
  try {
    await expect(client.extract(Buffer.from('%PDF-synthetic'), 'job', 1000)).resolves.toEqual(invoice);
    expect(received).toHaveProperty('generationConfig.responseJsonSchema'); expect(received).not.toHaveProperty('generationConfig.thinkingConfig');
    expect(received).toHaveProperty('systemInstruction'); expect(received).not.toHaveProperty('tools');
    for (const bad of [{}, { candidates: [] }, { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '' }] } }] },
      { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{secret invalid' }] } }] },
      { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: JSON.stringify(invoice) }] } }] }]) {
      response = bad; await expect(client.extract(Buffer.from('pdf'), 'job', 1000)).rejects.toMatchObject({ code: 'AI_UNUSABLE_RESULT', unusable: true });
    }
    response = { promptFeedback: { blockReason: 'SAFETY' } };
    await expect(client.extract(Buffer.from('pdf'), 'job', 1000)).rejects.toMatchObject({ code: 'AI_BLOCKED', retryable: false });
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
