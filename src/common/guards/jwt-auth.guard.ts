import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';

/**
 * PLACEHOLDER — This file will be fully implemented in API-03.
 *
 * The final implementation will:
 *  - Extend AuthGuard('jwt') from @nestjs/passport
 *  - Validate the JWT using JwtStrategy (passport-jwt)
 *  - Extract the wallet address from the payload
 *  - Set req.user = { wallet: string }
 *  - Throw UnauthorizedException for invalid/missing tokens
 *
 * DO NOT implement business logic here — wait for API-03.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
    canActivate(_context: ExecutionContext): boolean {
        throw new UnauthorizedException('JwtAuthGuard not yet implemented — pending API-03');
    }
}
