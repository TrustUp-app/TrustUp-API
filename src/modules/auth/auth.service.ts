import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { Keypair, StrKey } from 'stellar-sdk';
import { SupabaseService } from '../../database/supabase.client';
import { UsersRepository } from '../../database/repositories/users.repository';
import { SessionsRepository, SessionRecord } from '../../database/repositories/sessions.repository';
import { NonceResponseDto } from './dto/nonce-response.dto';
import { VerifyRequestDto } from './dto/verify-request.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { RegisterRequestDto } from './dto/register-request.dto';
import { SessionResponseDto } from './dto/session-response.dto';
import {
  ACCESS_TOKEN_EXPIRATION,
  ACCESS_TOKEN_EXPIRATION_SECONDS,
  REFRESH_TOKEN_EXPIRATION,
  REFRESH_TOKEN_EXPIRATION_MS,
} from '../../config/jwt.config';

/** Nonce expiration time in seconds (5 minutes) */
const NONCE_EXPIRATION_SECONDS = 300;

/** Maximum stored length of the client's User-Agent string */
const DEVICE_INFO_MAX_LENGTH = 512;

interface RefreshTokenPayload {
  wallet: string;
  type: 'refresh';
  jti?: string;
  iat?: number;
  exp?: number;
}

/**
 * Client metadata recorded on a session so users can recognise their devices.
 */
export interface SessionClientInfo {
  deviceInfo?: string | null;
  ipAddress?: string | null;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersRepository: UsersRepository,
    private readonly sessionsRepository: SessionsRepository,
  ) {}

  /**
   * Registers a new user with comprehensive profile information.
   * Handles duplicate checking, optional image upload, user creation, and issues JWT tokens.
   */
  async register(
    dto: RegisterRequestDto,
    profileImage?: { buffer: Buffer; mimetype: string; originalname?: string; filename?: string },
    clientInfo?: SessionClientInfo,
  ): Promise<any> {
    // 1. Check if wallet address already exists
    const existingWallet = await this.usersRepository.findByWallet(dto.walletAddress);
    if (existingWallet) {
      throw new ConflictException({
        code: 'AUTH_WALLET_EXISTS',
        message: 'Wallet address is already registered.',
      });
    }

    // 2. Check if username is already taken
    const usernameTaken = await this.usersRepository.checkUsernameExists(dto.username);
    if (usernameTaken) {
      throw new ConflictException({
        code: 'AUTH_USERNAME_TAKEN',
        message: 'Username is already taken.',
      });
    }

    // 3. Handle optional profile image upload to Supabase Storage
    let avatarUrl: string | null = null;
    if (profileImage) {
      avatarUrl = await this.usersRepository.uploadAvatar(dto.walletAddress, profileImage);
    }

    // 4. Create the new user record in the database
    const user = await this.usersRepository.createProfile({
      wallet: dto.walletAddress,
      username: dto.username,
      displayName: dto.displayName,
      avatarUrl,
    });

    // 5. Generate and return JWT tokens (this seamlessly re-uses existing session logic)
    const tokens = await this.generateTokens(dto.walletAddress, clientInfo);

    return {
      user: {
        id: user.id,
        walletAddress: user.wallet_address,
        username: user.username,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        createdAt: user.created_at,
      },
      ...tokens,
    };
  }

  /**
   * Generates a cryptographically secure nonce for wallet signature authentication.
   * Stores the nonce in the database with a 5-minute expiration.
   *
   * @param wallet - Stellar wallet address (validated by DTO)
   * @returns Nonce and expiration timestamp
   */
  async generateNonce(wallet: string): Promise<NonceResponseDto> {
    const nonce = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + NONCE_EXPIRATION_SECONDS * 1000);

    const client = this.supabaseService.getServiceRoleClient();

    const { error } = await client.from('nonces').insert({
      wallet_address: wallet,
      nonce,
      expires_at: expiresAt.toISOString(),
    });

    if (error) {
      throw new InternalServerErrorException({
        code: 'DATABASE_NONCE_INSERT_FAILED',
        message: 'Failed to generate nonce. Please try again.',
      });
    }

    return {
      nonce,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Verifies a Stellar wallet signature against a previously issued nonce.
   * Validates that the nonce exists, has not expired, has not been used, and
   * that the Ed25519 signature was produced by the wallet's private key.
   * Marks the nonce as used on success to prevent replay attacks.
   *
   * Throws UnauthorizedException on any validation or signature failure.
   * Returns void — call generateTokens(wallet) afterwards to issue JWT tokens.
   *
   * @param dto - Wallet address, nonce, and base64-encoded signature
   */
  async verifySignature(dto: VerifyRequestDto): Promise<void> {
    const client = this.supabaseService.getServiceRoleClient();

    // 1. Fetch nonce — must exist, not yet used, and belong to this wallet
    const { data: nonceRecord, error: nonceError } = await client
      .from('nonces')
      .select('id, expires_at')
      .eq('wallet_address', dto.wallet)
      .eq('nonce', dto.nonce)
      .is('used_at', null)
      .single();

    if (nonceError || !nonceRecord) {
      throw new UnauthorizedException({
        code: 'AUTH_NONCE_NOT_FOUND',
        message: 'Nonce not found or already used. Please request a new nonce.',
      });
    }

    // 2. Check nonce expiration
    if (new Date(nonceRecord.expires_at) < new Date()) {
      throw new UnauthorizedException({
        code: 'AUTH_NONCE_EXPIRED',
        message: 'Nonce has expired. Please request a new nonce.',
      });
    }

    // 3. Verify Ed25519 signature using Stellar SDK
    // StrKey validates the public key format before passing to Keypair
    if (!StrKey.isValidEd25519PublicKey(dto.wallet)) {
      throw new UnauthorizedException({
        code: 'AUTH_SIGNATURE_INVALID',
        message: 'Invalid signature. Verification failed.',
      });
    }

    try {
      const keypair = Keypair.fromPublicKey(dto.wallet);
      const isValid = keypair.verify(Buffer.from(dto.nonce), Buffer.from(dto.signature, 'base64'));

      if (!isValid) {
        throw new UnauthorizedException({
          code: 'AUTH_SIGNATURE_INVALID',
          message: 'Invalid signature. Verification failed.',
        });
      }
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException({
        code: 'AUTH_SIGNATURE_INVALID',
        message: 'Invalid signature. Verification failed.',
      });
    }

    // 4. Mark nonce as used to prevent replay attacks
    await client
      .from('nonces')
      .update({ used_at: new Date().toISOString() })
      .eq('id', nonceRecord.id);
  }

  /**
   * Upserts the user record for the given wallet (creates on first login, updates
   * last_seen_at on subsequent logins) and returns the internal user ID.
   * Throws UnauthorizedException if the account is blocked.
   *
   * @param wallet - Stellar wallet address
   * @returns Internal user UUID
   */
  private async findOrCreateUser(wallet: string): Promise<string> {
    const client = this.supabaseService.getServiceRoleClient();

    const { data: user, error } = await client
      .from('users')
      .upsert(
        {
          wallet_address: wallet,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'wallet_address' },
      )
      .select('id, status')
      .single();

    if (error || !user) {
      throw new InternalServerErrorException({
        code: 'DATABASE_USER_UPSERT_FAILED',
        message: 'Failed to create or update user record.',
      });
    }

    if (user.status === 'blocked') {
      throw new UnauthorizedException({
        code: 'AUTH_USER_BLOCKED',
        message: 'This account has been suspended.',
      });
    }

    return user.id;
  }

  /**
   * Generates a signed JWT access token and refresh token for the given wallet,
   * hashes the refresh token with SHA-256, and persists a new session (a new
   * token family, i.e. a new device/login) in the database.
   *
   * Access token payload:  `{ wallet, type: 'access', iat, exp }`
   * Refresh token payload: `{ wallet, type: 'refresh', jti, iat, exp }`
   * Refresh token hash: SHA-256 hex digest (per sessions table schema)
   *
   * Call verifySignature(dto) before this method to authenticate the wallet.
   *
   * @param wallet - Stellar wallet address (identity claim in JWT payload)
   * @param clientInfo - Optional User-Agent / IP of the client, stored on the session
   * @returns Signed access token, refresh token, expiration, and token type
   */
  async generateTokens(wallet: string, clientInfo?: SessionClientInfo): Promise<AuthResponseDto> {
    const userId = await this.findOrCreateUser(wallet);
    return this.issueSession(wallet, userId, randomUUID(), clientInfo);
  }

  /**
   * Signs a new access/refresh token pair and inserts a new session row for it
   * in the given token family.
   */
  private async issueSession(
    wallet: string,
    userId: string,
    tokenFamily: string,
    clientInfo?: SessionClientInfo,
  ): Promise<AuthResponseDto> {
    const accessToken = this.jwtService.sign(
      { wallet, type: 'access' },
      {
        secret: this.configService.get<string>('JWT_SECRET'),
        expiresIn: ACCESS_TOKEN_EXPIRATION,
      },
    );

    // A unique jti guarantees a unique token (and hash) even when two refresh
    // tokens are issued for the same wallet within the same second.
    const refreshToken = this.jwtService.sign(
      { wallet, type: 'refresh', jti: randomUUID() },
      {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: REFRESH_TOKEN_EXPIRATION,
      },
    );

    // Hash refresh token with SHA-256 before storage (per sessions table schema)
    const refreshTokenHash = this.hashToken(refreshToken);
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRATION_MS);

    await this.sessionsRepository.create({
      userId,
      refreshTokenHash,
      expiresAt: refreshExpiresAt.toISOString(),
      tokenFamily,
      deviceInfo: clientInfo?.deviceInfo?.slice(0, DEVICE_INFO_MAX_LENGTH) || undefined,
      ipAddress: clientInfo?.ipAddress || undefined,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_EXPIRATION_SECONDS,
      tokenType: 'Bearer',
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Refreshes access and refresh tokens using a valid refresh token (token rotation).
   *
   * The presented session row is marked as rotated (`revoked_at` set) and a NEW
   * session row is inserted in the same token family. The old row is kept, so if
   * the old refresh token is ever presented again it is recognised as reuse and
   * the entire family is revoked (stolen refresh token detection).
   */
  async refreshTokens(
    refreshToken: string,
    clientInfo?: SessionClientInfo,
  ): Promise<AuthResponseDto> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'TokenExpiredError') {
        throw new UnauthorizedException({
          code: 'AUTH_TOKEN_EXPIRED',
          message: 'Refresh token has expired.',
        });
      }
      throw new UnauthorizedException({
        code: 'AUTH_TOKEN_INVALID',
        message: 'Invalid or expired refresh token signature.',
      });
    }

    if (!payload || payload.type !== 'refresh' || !payload.wallet) {
      throw new UnauthorizedException({
        code: 'AUTH_TOKEN_INVALID',
        message: 'Invalid refresh token payload.',
      });
    }

    const session = await this.sessionsRepository.findByHash(this.hashToken(refreshToken));

    if (!session) {
      throw new UnauthorizedException({
        code: 'AUTH_TOKEN_REVOKED',
        message: 'Refresh token not found or already revoked.',
      });
    }

    if (session.revoked_at !== null) {
      // An already-rotated (or revoked) token was replayed
      await this.handleTokenReuse(session);
    }

    if (new Date(session.expires_at) < new Date()) {
      // Clean up the expired session from the DB
      // Note: A scheduled cron job or database trigger typically performs background cleanup
      // of all expired/revoked sessions. We do it here opportunistically.
      await this.sessionsRepository.delete(session.id);
      throw new UnauthorizedException({
        code: 'AUTH_TOKEN_EXPIRED',
        message: 'Refresh token has expired.',
      });
    }

    const user = await this.usersRepository.findByWallet(payload.wallet);
    if (!user || user.id !== session.user_id) {
      throw new UnauthorizedException({
        code: 'AUTH_USER_NOT_FOUND',
        message: 'User associated with this token was not found.',
      });
    }

    if (user.status === 'blocked') {
      throw new UnauthorizedException({
        code: 'AUTH_USER_BLOCKED',
        message: 'This account has been suspended.',
      });
    }

    // Rotate: atomically consume the presented session (kept as a rotated row,
    // never overwritten). If a concurrent request already consumed it, the same
    // token was presented twice — treat it as reuse.
    const claimed = await this.sessionsRepository.markRotated(session.id);
    if (!claimed) {
      await this.handleTokenReuse(session);
    }

    // Insert a new session row in the same family for the new refresh token
    return this.issueSession(user.wallet_address, user.id, session.token_family, {
      deviceInfo: clientInfo?.deviceInfo ?? session.device_info,
      ipAddress: clientInfo?.ipAddress ?? session.ip_address,
    });
  }

  /**
   * Called when an already-rotated or revoked refresh token is presented.
   * Revokes every session in the token family and rejects the request.
   */
  private async handleTokenReuse(session: SessionRecord): Promise<never> {
    this.logger.warn(
      `Refresh token reuse detected (family ${session.token_family}, user ${session.user_id}); revoking token family`,
    );
    await this.sessionsRepository.revokeFamily(session.token_family);
    throw new UnauthorizedException({
      code: 'AUTH_TOKEN_REVOKED',
      message: 'Refresh token has been revoked.',
    });
  }

  /**
   * Explicitly logs out a user session by revoking the session (token family) the
   * refresh token belongs to. Rows are kept so a later replay of any token from
   * this session is rejected.
   */
  async logout(refreshToken: string): Promise<void> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'TokenExpiredError') {
        const decoded = this.jwtService.decode(refreshToken) as RefreshTokenPayload | null;
        if (decoded && decoded.type === 'refresh') {
          await this.sessionsRepository.deleteByHash(this.hashToken(refreshToken));
        }
        return;
      }
      throw new UnauthorizedException({
        code: 'AUTH_TOKEN_INVALID',
        message: 'Invalid refresh token signature.',
      });
    }

    if (!payload || payload.type !== 'refresh') {
      throw new UnauthorizedException({
        code: 'AUTH_TOKEN_INVALID',
        message: 'Invalid refresh token payload.',
      });
    }

    const session = await this.sessionsRepository.findByHash(this.hashToken(refreshToken));
    if (session) {
      await this.sessionsRepository.revokeFamily(session.token_family);
    }
  }

  /**
   * Lists the active sessions (one per device/login) of the authenticated user.
   *
   * @param wallet - Wallet address of the authenticated user (from the access token)
   */
  async listSessions(wallet: string): Promise<SessionResponseDto[]> {
    const userId = await this.resolveUserId(wallet);
    const sessions = await this.sessionsRepository.findActiveByUserId(userId);

    return sessions.map((session) => ({
      id: session.id,
      deviceInfo: session.device_info,
      ipAddress: session.ip_address,
      createdAt: session.created_at,
      expiresAt: session.expires_at,
    }));
  }

  /**
   * Revokes a single session/device of the authenticated user. The whole token
   * family is revoked, so every refresh token issued for that device stops working.
   *
   * @param wallet - Wallet address of the authenticated user (from the access token)
   * @param sessionId - Session ID as returned by GET /auth/sessions
   */
  async revokeSession(wallet: string, sessionId: string): Promise<void> {
    const userId = await this.resolveUserId(wallet);
    const session = await this.sessionsRepository.findByIdForUser(sessionId, userId);

    if (!session) {
      throw new NotFoundException({
        code: 'AUTH_SESSION_NOT_FOUND',
        message: 'Session not found.',
      });
    }

    await this.sessionsRepository.revokeFamily(session.token_family);
  }

  /**
   * Revokes every session of the authenticated user ("log out from all devices").
   *
   * @param wallet - Wallet address of the authenticated user (from the access token)
   */
  async revokeAllSessions(wallet: string): Promise<void> {
    const userId = await this.resolveUserId(wallet);
    await this.sessionsRepository.revokeAllForUser(userId);
  }

  private async resolveUserId(wallet: string): Promise<string> {
    const user = await this.usersRepository.findByWallet(wallet);
    if (!user) {
      throw new UnauthorizedException({
        code: 'AUTH_USER_NOT_FOUND',
        message: 'User associated with this token was not found.',
      });
    }
    return user.id;
  }
}
