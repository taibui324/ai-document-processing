import { ArgumentsHost, Catch, ExceptionFilter, HttpException, INestApplication } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { Config } from './config';

export function logEvent(fields: { event: string; correlationId?: string; jobId?: string; stage?: string; attempt?: number; durationMs?: number; status?: string | number; code?: string; nextAttemptAt?: string | null }) {
  console.log(JSON.stringify(fields));
}
@Catch()
class SafeErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (res.headersSent) return;
    const status = error instanceof HttpException ? error.getStatus() : 503;
    const message = error instanceof HttpException ? error.message : '';
    const code = /^[A-Z][A-Z_]{1,79}$/.test(message) ? message : ({ 400: 'INVALID_REQUEST', 401: 'UNAUTHORIZED', 404: 'NOT_FOUND', 413: 'DOCUMENT_TOO_LARGE', 415: 'UNSUPPORTED_DOCUMENT' } as Record<number, string>)[status] ?? 'SERVICE_UNAVAILABLE';
    logEvent({ event: 'request_failed', correlationId: res.locals.correlationId as string, status, code });
    res.status(status).json({ error: { code, message: 'The request could not be completed.', retryable: false }, correlationId: res.locals.correlationId });
  }
}
export function configureHttp(app: INestApplication, config: Config) {
  app.useGlobalFilters(new SafeErrors());
  app.use((req: Request, res: Response, next: NextFunction) => {
    const incoming = req.get('X-Correlation-Id');
    const valid = !incoming || /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(incoming);
    res.locals.correlationId = valid && incoming ? incoming : randomUUID();
    res.setHeader('X-Correlation-Id', res.locals.correlationId as string);
    if (!valid) { res.status(400).json({ error: { code: 'INVALID_CORRELATION_ID', message: 'Invalid correlation ID.', retryable: false } }); return; }
    if (req.method === 'POST') {
      const timer = setTimeout(() => {
        if (!res.headersSent) res.status(408).json({ error: { code: 'UPLOAD_TIMEOUT', message: 'Request timed out.', retryable: false } });
        req.destroy();
      }, config.uploadTimeoutMs);
      req.once('end', () => clearTimeout(timer)); res.once('close', () => clearTimeout(timer));
    }
    next();
  });
}
