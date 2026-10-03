import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqualString } from '../utils/timing-safe';

@Injectable()
export class AdminApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('ADMIN_API_KEY');
    if (!expected) {
      throw new UnauthorizedException({
        code: 'ADMIN_NOT_CONFIGURED',
        message: 'ADMIN_API_KEY is not configured.',
      });
    }
    const request = context.switchToHttp().getRequest();
    const provided = request.headers['x-admin-key'];
    if (typeof provided !== 'string' || !timingSafeEqualString(provided, expected)) {
      throw new ForbiddenException({
        code: 'ADMIN_FORBIDDEN',
        message: 'Invalid admin API key.',
      });
    }
    return true;
  }
}
