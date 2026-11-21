import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FastifyRequest } from 'fastify';
import { AuthService, SessionClientInfo } from './auth.service';
import { NonceRequestDto } from './dto/nonce-request.dto';
import { NonceResponseDto } from './dto/nonce-response.dto';
import { VerifyRequestDto } from './dto/verify-request.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { RegisterRequestDto } from './dto/register-request.dto';
import { RefreshTokenDto, RefreshTokenSchema } from './dto/refresh-token.dto';
import { SessionResponseDto } from './dto/session-response.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ALLOWED_MIME_TYPES } from '../../config/env';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Register a new user account with complete profile',
    description:
      'Creates a new user account. Accepts multipart/form-data with wallet address, username, display name, terms acceptance, and an optional profile image (max 5MB, JPEG/PNG/WebP). Issues JWT tokens immediately on success.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: RegisterRequestDto })
  @ApiResponse({
    status: 201,
    description: 'User successfully registered and authenticated',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed or invalid image upload format/size',
  })
  @ApiResponse({ status: 409, description: 'Wallet address or username already exists' })
  async register(@Req() req: FastifyRequest, @Body() dto: RegisterRequestDto): Promise<any> {
    let profileFile:
      | { buffer: Buffer; mimetype: string; filename: string; originalname: string }
      | undefined;

    if (req.isMultipart && req.isMultipart()) {
      const part = await req.file();
      if (part) {
        if (!ALLOWED_MIME_TYPES.includes(part.mimetype)) {
          throw new BadRequestException({
            code: 'FILE_INVALID_TYPE',
            message: 'Invalid file type. Allowed types: image/jpeg, image/png, image/webp',
          });
        }
        const buffer = await part.toBuffer();
        profileFile = {
          buffer,
          mimetype: part.mimetype,
          filename: part.filename,
          originalname: part.filename,
        };
      }
    }

    return this.authService.register(dto, profileFile, getClientInfo(req));
  }

  @Post('nonce')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Generate nonce for wallet authentication',
    description:
      'Creates a cryptographically secure nonce for the given wallet. The client must sign this nonce with their wallet and submit it to POST /auth/verify to receive JWT tokens.',
  })
  @ApiResponse({
    status: 201,
    description: 'Nonce generated successfully',
    schema: {
      example: {
        nonce: 'a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890',
        expiresAt: '2026-02-13T10:05:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid wallet address format' })
  async getNonce(@Body() dto: NonceRequestDto): Promise<NonceResponseDto> {
    return this.authService.generateNonce(dto.wallet);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Verify wallet signature and issue JWT tokens',
    description:
      'Validates the Ed25519 signature of the nonce using the Stellar wallet public key. On success, issues a JWT access token (15 min) and a refresh token (7 days).',
  })
  @ApiResponse({
    status: 200,
    description: 'Signature verified — JWT tokens issued',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request body or field format' })
  @ApiResponse({
    status: 401,
    description: 'Nonce not found, expired, already used, invalid signature, or blocked account',
  })
  async verify(
    @Body() dto: VerifyRequestDto,
    @Req() req?: FastifyRequest,
  ): Promise<AuthResponseDto> {
    await this.authService.verifySignature(dto);
    return this.authService.generateTokens(dto.wallet, getClientInfo(req));
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Refresh JWT access token using a refresh token',
    description:
      'Validates the refresh token and rotates it: the presented token is marked as used and a new access token (15 min) and refresh token (7 days) are issued. Each refresh token can be used only once — presenting an already-used refresh token is treated as token theft and revokes every token of that session (device).',
  })
  @ApiResponse({
    status: 200,
    description: 'Tokens refreshed successfully',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request body or validation failed' })
  @ApiResponse({
    status: 401,
    description:
      'Invalid, expired, or revoked refresh token, or reuse of an already-rotated refresh token (the whole session is then revoked)',
  })
  async refresh(
    @Body(new ZodValidationPipe(RefreshTokenSchema)) dto: RefreshTokenDto,
    @Req() req?: FastifyRequest,
  ): Promise<AuthResponseDto> {
    return this.authService.refreshTokens(dto.refreshToken, getClientInfo(req));
  }

  @Delete('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Log out user by revoking the refresh token',
    description:
      'Validates the refresh token and revokes the associated session (device). Logout is possible even when the access token is expired.',
  })
  @ApiResponse({
    status: 204,
    description: 'User successfully logged out',
  })
  @ApiResponse({ status: 400, description: 'Invalid request body or validation failed' })
  @ApiResponse({ status: 401, description: 'Invalid refresh token signature' })
  async logout(
    @Body(new ZodValidationPipe(RefreshTokenSchema)) dto: RefreshTokenDto,
  ): Promise<void> {
    await this.authService.logout(dto.refreshToken);
  }

  @Get('sessions')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'List active sessions (devices) of the current user',
    description:
      'Returns one entry per logged-in device: sessions that are neither revoked nor expired, most recent first.',
  })
  @ApiResponse({
    status: 200,
    description: 'Active sessions retrieved successfully',
    type: SessionResponseDto,
    isArray: true,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid JWT' })
  async listSessions(@CurrentUser() user: { wallet: string }): Promise<SessionResponseDto[]> {
    return this.authService.listSessions(user.wallet);
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Revoke a specific session (log out one device)',
    description:
      'Revokes the given session of the current user. Every refresh token issued for that device stops working.',
  })
  @ApiParam({ name: 'id', description: 'Session ID from GET /auth/sessions', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Session revoked' })
  @ApiResponse({ status: 400, description: 'Session ID is not a valid UUID' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid JWT' })
  @ApiResponse({ status: 404, description: 'Session not found or not owned by the current user' })
  async revokeSession(
    @CurrentUser() user: { wallet: string },
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.authService.revokeSession(user.wallet, id);
  }

  @Delete('sessions')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Log out from all devices',
    description:
      'Revokes every session of the current user. All refresh tokens stop working; access tokens already issued remain valid until they expire (15 min).',
  })
  @ApiResponse({ status: 204, description: 'All sessions revoked' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid JWT' })
  async revokeAllSessions(@CurrentUser() user: { wallet: string }): Promise<void> {
    await this.authService.revokeAllSessions(user.wallet);
  }
}

/**
 * Extracts the client's User-Agent and IP address from the request so they can be
 * recorded on the session.
 */
function getClientInfo(req?: FastifyRequest): SessionClientInfo {
  if (!req) return {};
  const userAgent = req.headers?.['user-agent'];
  return {
    deviceInfo: typeof userAgent === 'string' && userAgent.length > 0 ? userAgent : null,
    ipAddress: req.ip || null,
  };
}
