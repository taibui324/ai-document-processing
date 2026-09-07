import { createServer } from 'node:http';
import { DataSource } from 'typeorm';
import { Config } from '../src/config';
import { acceptReceipt } from './receipts';
import { HttpException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { sha256 } from '../src/persistence/jobs';
import { scenarios } from './scenarios';
export const syntheticInvoice = { documentType: 'invoice', documentNumber: 'SYNTHETIC-001', documentDate: '2024-02-29', totalAmount: '12.50', currency: 'HKD', items: [{ description: 'Synthetic item', quantity: 1, amount: '12.50' }] };
export function mockServer(db: DataSource, config: Config, scenario = 'happy') {
  if (config.appEnv === 'production' || config.aiMode !== 'mock') throw new Error('Mock service requires explicit local/test mock mode');
  if (!(scenarios as readonly string[]).includes(scenario)) throw new Error('Unknown mock scenario');
  const counts = new Map<string, number>();
  return createServer((req, res) => { void (async () => {
    if (req.method === 'GET' && req.url === '/health/live') { res.end('{"status":"ok"}'); return; }
    if (req.method !== 'POST') { res.writeHead(404); res.end(); return; }
    const isGemini = /^\/v1beta\/models\/[a-zA-Z0-9.-]+:generateContent$/.test(req.url ?? '');
    if (!isGemini && req.url !== '/submissions') { res.writeHead(404); res.end(); return; }
    if (!isGemini && !timingSafeEqual(Buffer.from(sha256(String(req.headers['x-vendor-key'] ?? ''))), Buffer.from(sha256(config.vendorSecret)))) { res.writeHead(401); res.end(); return; }
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > (isGemini ? 8 * 1024 * 1024 : 65536)) { res.writeHead(413); res.end(); req.destroy(); return; }
      chunks.push(chunk as Buffer);
    }
    const payload: unknown = JSON.parse(Buffer.concat(chunks).toString());
    res.setHeader('Content-Type', 'application/json');
    const identity = String(isGemini ? req.headers['x-mock-job-id'] : req.headers['idempotency-key']);
    const countKey = (isGemini ? 'AI:' : 'VENDOR:') + identity;
    const count = (counts.get(countKey) ?? 0) + 1; counts.set(countKey, count);
    if (isGemini && (scenario === 'ai-429-exhausted' || (scenario === 'ai-429-then-success' && count <= 2))) {
      res.writeHead(429, { 'Retry-After': config.backoffBaseMs < 2000 ? '0' : '2' }); res.end('{"error":"MOCK_RATE_LIMIT"}'); return;
    }
    if (isGemini && scenario === 'ai-slow') { res.writeHead(200); res.write('{'); return; }
    if (isGemini && (scenario === 'ai-empty' || scenario === 'ai-invalid')) {
      res.end(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: scenario === 'ai-empty' ? '' : '{"malformed":"synthetic"}' }] } }] })); return;
    }
    if (isGemini) { res.end(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(syntheticInvoice) }] } }] })); return; }
    if (scenario === 'vendor-503-exhausted' || (scenario === 'vendor-503-then-success' && count <= 2)) { res.writeHead(503); res.end('{"error":"MOCK_UNAVAILABLE"}'); return; }
    if (scenario === 'vendor-reset' && count === 1) { req.socket.destroy(); return; }
    const key = String(req.headers['idempotency-key'] ?? '');
    const existed = scenario === 'vendor-accept-then-drop' ? (await db.query('SELECT receipt_id FROM mock_vendor_receipts WHERE idempotency_key=?', [key])).length > 0 : false;
    const receipt = await acceptReceipt(db, String(req.headers['idempotency-key'] ?? ''), payload);
    if (scenario === 'vendor-accept-then-drop' && !existed) { req.socket.destroy(); return; }
    if (scenario === 'vendor-invalid') { res.end('{}'); return; }
    res.end(JSON.stringify(receipt));
  })().catch(error => { if (!res.headersSent) res.writeHead(error instanceof HttpException ? error.getStatus() : 400); res.end('{"error":"MOCK_REQUEST_FAILED"}'); }); });
}
