import { BadRequestException, Controller, Get, Headers, Inject, Param, ParseUUIDPipe, Post, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiHeader, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Config } from '../config';
import { logEvent } from '../http';
import { Jobs } from '../persistence/jobs';
import { ApiKeyGuard } from './api-key.guard';
import { acceptedContract, errorContract, jobContract } from './contracts';
import { publicJob } from './job.presenter';
import { validatePdf } from './pdf';

@ApiTags('document-jobs')
@ApiSecurity('apiKey')
@ApiResponse({ status: 400, description: 'Invalid input.', schema: errorContract })
@ApiResponse({ status: 401, description: 'Invalid API credential.', schema: errorContract })
@ApiResponse({ status: 503, description: 'Persistence unavailable.', schema: errorContract })
@UseGuards(ApiKeyGuard)
@Controller('api/v1/document-jobs')
export class JobsController {
  constructor(private readonly jobs: Jobs, @Inject('CONFIG') private readonly config: Config) {}

  @Post()
  @UseInterceptors(FileInterceptor('document'))
  @ApiConsumes('multipart/form-data')
  @ApiHeader({ name: 'Idempotency-Key', required: true, schema: { type: 'string', minLength: 1, maxLength: 128 } })
  @ApiBody({ schema: { type: 'object', required: ['document'], properties: { document: { type: 'string', format: 'binary' } } } })
  @ApiResponse({ status: 202, description: 'Durably accepted; processing is asynchronous.', schema: acceptedContract })
  @ApiResponse({ status: 200, description: 'Exact replay of an accepted request.', schema: acceptedContract })
  @ApiResponse({ status: 409, description: 'The key already identifies different bytes.', schema: errorContract })
  @ApiResponse({ status: 413, description: 'Document exceeds the byte limit.', schema: errorContract })
  @ApiResponse({ status: 415, description: 'Only PDF is supported.', schema: errorContract })
  async submit(@UploadedFile() file: { buffer: Buffer; mimetype: string } | undefined, @Headers('idempotency-key') key: string | undefined, @Res({ passthrough: true }) res: Response) {
    const started = performance.now();
    if (!key || !/^[\x20-\x7e]{1,128}$/.test(key)) throw new BadRequestException('INVALID_IDEMPOTENCY_KEY');
    if (!file) throw new BadRequestException('DOCUMENT_REQUIRED');
    await validatePdf(file.buffer, file.mimetype, this.config.pdfMaxPages, this.config.pdfTimeoutMs);
    const { job, replay } = await this.jobs.accept(file.buffer, key, res.locals.correlationId as string);
    logEvent({ event: replay ? 'job_replayed' : 'job_accepted', correlationId: res.locals.correlationId as string, jobId: job.id,
      stage: job.stage, status: job.status, durationMs: Math.round(performance.now() - started) });
    const statusUrl = '/api/v1/document-jobs/' + job.id;
    res.status(replay ? 200 : 202).setHeader('Location', statusUrl);
    return { jobId: job.id, status: job.status, statusUrl, createdAt: job.created_at };
  }

  @Get(':jobId')
  @ApiResponse({ status: 200, description: 'Durable stage, attempts, retry schedule, and validated result when available.', schema: jobContract })
  @ApiResponse({ status: 404, description: 'Unknown job.' })
  async get(@Param('jobId', new ParseUUIDPipe()) id: string) { return publicJob(await this.jobs.get(id)); }
}
