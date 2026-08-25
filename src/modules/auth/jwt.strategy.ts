import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersRepository } from '../../database/repositories/users.repository';
import { UserRole } from '../../common/enums/user-role.enum';

interface JwtPayload {
  wallet: string;
  type: string;
  iat: number;
  exp: number;
}

/**
 * Passport JWT strategy for validating access tokens.
 *
 * Extracts the Bearer token from the Authorization header, verifies its
 * signature using JWT_SECRET, and returns the wallet address as req.user.
 *
 * Only tokens with type === 'access' are accepted to prevent refresh tokens
 * from being used to authenticate API requests.
 *
 * The user's role is resolved from the database and included in req.user
 * so that RolesGuard can enforce RBAC without a second DB query.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersRepository: UsersRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  /**
   * Called by Passport after the token signature is verified.
   * The returned value is injected into req.user.
   *
   * Resolves the user's role from the database so that RolesGuard
   * can enforce RBAC without an additional query per request.
   *
   * @param payload - Decoded JWT payload
   * @returns User object containing the wallet address and role
   */
  async validate(payload: JwtPayload): Promise<{ wallet: string; role: UserRole }> {
    if (payload.type !== 'access') {
      throw new UnauthorizedException({
        code: 'AUTH_TOKEN_INVALID',
        message: 'Invalid or missing access token.',
      });
    }

    const user = await this.usersRepository.findByWallet(payload.wallet);

    // Default to 'borrower' if no user found (edge case: token exists but user was deleted)
    const role = (user?.role as UserRole) ?? UserRole.BORROWER;

    return { wallet: payload.wallet, role };
  }
}
