import { 
  Controller, 
  Post, 
  Delete,
  Body, 
  HttpCode, 
  HttpStatus,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FastifyRequest } from 'fastify';
import { AuthService } from './auth.service';
import { NonceRequestDto } from './dto/nonce-request.dto';
import { NonceResponseDto } from './dto/nonce-response.dto';
import { VerifyRequestDto } from './dto/verify-request.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { RegisterRequestDto } from './dto/register-request.dto';
import { RefreshTokenDto, RefreshTokenSchema } from './dto/refresh-token.dto';
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
    description: 'Creates a new user account. Accepts multipart/form-data with wallet address, username, display name, terms acceptance, and an optional profile image (max 5MB, JPEG/PNG/WebP). Issues JWT tokens immediately on success.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: RegisterRequestDto })
  @ApiResponse({
    status: 201,
    description: 'User successfully registered and authenticated',
  })
  @ApiResponse({ status: 400, description: 'Validation failed or invalid image upload format/size' })
  @ApiResponse({ status: 409, description: 'Wallet address or username already exists' })
  async register(
    @Req() req: FastifyRequest,
    @Body() dto: RegisterRequestDto,
  ): Promise<any> {
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

    return this.authService.register(dto, profileFile);
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
  async verify(@Body() dto: VerifyRequestDto): Promise<AuthResponseDto> {
    await this.authService.verifySignature(dto);
    return this.authService.generateTokens(dto.wallet);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Refresh JWT access token using a refresh token',
    description:
      'Validates the refresh token. If valid, deletes the old session and generates a new access token (15 min) and a new refresh token (7 days). Aligns with refresh token rotation.',
  })
  @ApiResponse({
    status: 200,
    description: 'Tokens refreshed successfully',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request body or validation failed' })
  @ApiResponse({ status: 401, description: 'Invalid, expired, or revoked refresh token' })
  async refresh(
    @Body(new ZodValidationPipe(RefreshTokenSchema)) dto: RefreshTokenDto,
  ): Promise<AuthResponseDto> {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  @Delete('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Log out user by revoking the refresh token',
    description:
      'Validates the refresh token and deletes the associated session from the database. Logout is possible even when the access token is expired.',
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
}
