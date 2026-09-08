import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { Request } from 'express';
import { sha256 } from '../common/sha256';
import { Config } from '../config';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(@Inject('CONFIG') private readonly config: Config) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const supplied = Buffer.from(sha256(request.get('X-API-Key') ?? ''));
    const expected = Buffer.from(sha256(this.config.apiSecret));
    if (!timingSafeEqual(supplied, expected)) throw new UnauthorizedException('UNAUTHORIZED');
    return true;
  }
}
