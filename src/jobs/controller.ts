import { BadRequestException, CanActivate, Controller, ExecutionContext, Get, Headers, Inject, Injectable, Param, ParseUUIDPipe, Post, Res, UnauthorizedException, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiHeader, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { timingSafeEqual } from 'node:crypto';
import { Request, Response } from 'express';
import { Config } from '../config';
import { Jobs, publicJob, sha256 } from '../persistence/jobs';
import { validatePdf } from './pdf';
@Injectable()
export class ApiGuard implements CanActivate {
  constructor(@Inject('CONFIG') private readonly config: Config) {}
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    if (!timingSafeEqual(Buffer.from(sha256(req.get('X-API-Key') ?? '')), Buffer.from(sha256(this.config.apiSecret)))) throw new UnauthorizedException('UNAUTHORIZED');
    return true;
  }
}
@ApiTags('document-jobs')
@ApiSecurity('apiKey')
@UseGuards(ApiGuard)
@Controller('api/v1/document-jobs')
export class JobsController {
  constructor(private readonly jobs: Jobs, @Inject('CONFIG') private readonly config: Config) {}
  @Post()
  @UseInterceptors(FileInterceptor('document'))
  @ApiConsumes('multipart/form-data')
  @ApiHeader({ name: 'Idempotency-Key', required: true, schema: { type: 'string', minLength: 1, maxLength: 128 } })
  @ApiBody({ schema: { type: 'object', required: ['document'], properties: { document: { type: 'string', format: 'binary' } } } })
  @ApiResponse({ status: 202, description: 'Durably accepted; processing is asynchronous.' })
  @ApiResponse({ status: 200, description: 'Exact replay of an accepted request.' })
  @ApiResponse({ status: 409, description: 'The key already identifies different bytes.' })
  async submit(@UploadedFile() file: { buffer: Buffer; mimetype: string } | undefined, @Headers('idempotency-key') key: string | undefined, @Res({ passthrough: true }) res: Response) {
    if (!key || !/^[\x20-\x7e]{1,128}$/.test(key)) throw new BadRequestException('INVALID_IDEMPOTENCY_KEY');
    if (!file) throw new BadRequestException('DOCUMENT_REQUIRED');
    await validatePdf(file.buffer, file.mimetype, this.config.pdfMaxPages, this.config.pdfTimeoutMs);
    const { job, replay } = await this.jobs.accept(file.buffer, key, res.locals.correlationId as string);
    const statusUrl = '/api/v1/document-jobs/' + job.id;
    res.status(replay ? 200 : 202).setHeader('Location', statusUrl);
    return { jobId: job.id, status: job.status, statusUrl, createdAt: job.created_at };
  }
  @Get(':jobId')
  @ApiResponse({ status: 200, description: 'Durable stage, attempts, retry schedule, and validated result when available.' })
  @ApiResponse({ status: 404, description: 'Unknown job.' })
  async get(@Param('jobId', new ParseUUIDPipe()) id: string) { return publicJob(await this.jobs.get(id)); }
}
