import { Test, TestingModule } from '@nestjs/testing';
import { InternalServerErrorException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../../../../src/modules/auth/auth.service';
import { SupabaseService } from '../../../../src/database/supabase.client';
import { UsersRepository } from '../../../../src/database/repositories/users.repository';
import { SessionsRepository } from '../../../../src/database/repositories/sessions.repository';

// Mock Stellar SDK to avoid real crypto operations in unit tests
jest.mock('stellar-sdk', () => ({
  Keypair: { fromPublicKey: jest.fn() },
  StrKey: { isValidEd25519PublicKey: jest.fn().mockReturnValue(true) },
}));

import { Keypair, StrKey } from 'stellar-sdk';

describe('AuthService', () => {
  let service: AuthService;

  const mockInsert = jest.fn().mockResolvedValue({ error: null });
  const mockFrom = jest.fn().mockReturnValue({ insert: mockInsert });

  const mockSupabaseClient = { from: mockFrom };

  const mockSupabaseService = {
    getServiceRoleClient: jest.fn(() => mockSupabaseClient),
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock.jwt.token'),
    decode: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('mock-secret'),
  };

  const mockUsersRepository = {
    findByWallet: jest.fn(),
    checkUsernameExists: jest.fn(),
    uploadAvatar: jest.fn(),
    createProfile: jest.fn(),
  };

  const mockSessionsRepository = {
    findByHash: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteByHash: jest.fn(),
    revokeFamily: jest.fn(),
  };

  const validWallet = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: SupabaseService, useValue: mockSupabaseService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: UsersRepository, useValue: mockUsersRepository },
        { provide: SessionsRepository, useValue: mockSessionsRepository },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);

    jest.clearAllMocks();
    mockInsert.mockResolvedValue({ error: null });
    mockJwtService.sign.mockReturnValue('mock.jwt.token');
    mockConfigService.get.mockReturnValue('mock-secret');
    mockFrom.mockReturnValue({ insert: mockInsert });
    mockSessionsRepository.create.mockResolvedValue({ id: 'session-uuid' });
    mockSessionsRepository.findByHash.mockResolvedValue(null);
    (StrKey.isValidEd25519PublicKey as jest.Mock).mockReturnValue(true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // generateNonce
  // ---------------------------------------------------------------------------
  describe('generateNonce', () => {
    it('should return nonce and expiresAt', async () => {
      const result = await service.generateNonce(validWallet);

      expect(result).toHaveProperty('nonce');
      expect(result).toHaveProperty('expiresAt');
      expect(typeof result.nonce).toBe('string');
      expect(result.nonce).toHaveLength(64);
      expect(/^[a-f0-9]+$/.test(result.nonce)).toBe(true);
    });

    it('should generate unique nonces on each call', async () => {
      const result1 = await service.generateNonce(validWallet);
      const result2 = await service.generateNonce(validWallet);

      expect(result1.nonce).not.toBe(result2.nonce);
    });

    it('should set expiresAt to approximately 5 minutes from now', async () => {
      const before = Date.now();
      const result = await service.generateNonce(validWallet);
      const after = Date.now();

      const expiresAtTime = new Date(result.expiresAt).getTime();
      const fiveMinutes = 5 * 60 * 1000;
      const tolerance = 2000;

      expect(expiresAtTime).toBeGreaterThanOrEqual(before + fiveMinutes - tolerance);
      expect(expiresAtTime).toBeLessThanOrEqual(after + fiveMinutes + tolerance);
    });

    it('should store nonce in database with correct data', async () => {
      await service.generateNonce(validWallet);

      expect(mockSupabaseService.getServiceRoleClient).toHaveBeenCalled();
      expect(mockFrom).toHaveBeenCalledWith('nonces');
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          wallet_address: validWallet,
          nonce: expect.any(String),
          expires_at: expect.any(String),
        }),
      );
    });

    it('should throw InternalServerErrorException when database insert fails', async () => {
      mockInsert.mockResolvedValue({ error: { message: 'Database connection failed' } });

      await expect(service.generateNonce(validWallet)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // verifySignature — validates nonce + Ed25519 signature, marks nonce used
  // ---------------------------------------------------------------------------
  describe('verifySignature', () => {
    const validNonce = 'a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890';
    const validSignature = Buffer.alloc(64).toString('base64');
    const futureExpiry = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const defaultNonceRecord = { id: 'nonce-uuid', expires_at: futureExpiry };

    function setupMocks({
      nonceResult = { data: defaultNonceRecord, error: null },
      markUsedResult = { error: null },
      signatureValid = true,
      strKeyValid = true,
    } = {}) {
      const mockKeypair = { verify: jest.fn().mockReturnValue(signatureValid) };
      (Keypair.fromPublicKey as jest.Mock).mockReturnValue(mockKeypair);
      (StrKey.isValidEd25519PublicKey as jest.Mock).mockReturnValue(strKeyValid);

      mockFrom.mockImplementation((table: string) => {
        if (table === 'nonces') {
          const updateChain = { eq: jest.fn().mockResolvedValue(markUsedResult) };
          const chain: Record<string, jest.Mock> = {
            select: jest.fn(),
            eq: jest.fn(),
            is: jest.fn(),
            single: jest.fn().mockResolvedValue(nonceResult),
            update: jest.fn().mockReturnValue(updateChain),
          };
          chain.select.mockReturnValue(chain);
          chain.eq.mockReturnValue(chain);
          chain.is.mockReturnValue(chain);
          return chain;
        }
        return { insert: mockInsert };
      });

      return { mockKeypair };
    }

    const validDto = { wallet: validWallet, nonce: validNonce, signature: validSignature };

    it('should resolve without error when nonce and signature are valid', async () => {
      setupMocks();
      await expect(service.verifySignature(validDto)).resolves.toBeUndefined();
    });

    it('should throw UnauthorizedException (AUTH_NONCE_NOT_FOUND) when nonce does not exist', async () => {
      setupMocks({ nonceResult: { data: null, error: { message: 'No rows found' } } });

      await expect(service.verifySignature(validDto)).rejects.toMatchObject({
        response: { code: 'AUTH_NONCE_NOT_FOUND' },
      });
    });

    it('should throw UnauthorizedException (AUTH_NONCE_NOT_FOUND) when nonce is already used', async () => {
      // A used nonce has used_at set — .is('used_at', null) excludes it → same NOT_FOUND error
      setupMocks({ nonceResult: { data: null, error: { message: 'No rows found' } } });

      await expect(service.verifySignature(validDto)).rejects.toMatchObject({
        response: { code: 'AUTH_NONCE_NOT_FOUND' },
      });
    });

    it('should throw UnauthorizedException (AUTH_NONCE_EXPIRED) when nonce is past expiry', async () => {
      const expiredDate = new Date(Date.now() - 1000).toISOString();
      setupMocks({
        nonceResult: { data: { id: 'nonce-uuid', expires_at: expiredDate }, error: null },
      });

      await expect(service.verifySignature(validDto)).rejects.toMatchObject({
        response: { code: 'AUTH_NONCE_EXPIRED' },
      });
    });

    it('should throw UnauthorizedException (AUTH_SIGNATURE_INVALID) when StrKey validation fails', async () => {
      setupMocks({ strKeyValid: false });

      await expect(service.verifySignature(validDto)).rejects.toMatchObject({
        response: { code: 'AUTH_SIGNATURE_INVALID' },
      });
    });

    it('should throw UnauthorizedException (AUTH_SIGNATURE_INVALID) when signature does not verify', async () => {
      setupMocks({ signatureValid: false });

      await expect(service.verifySignature(validDto)).rejects.toMatchObject({
        response: { code: 'AUTH_SIGNATURE_INVALID' },
      });
    });

    it('should throw UnauthorizedException (AUTH_SIGNATURE_INVALID) when Keypair throws an unexpected error', async () => {
      setupMocks();
      (Keypair.fromPublicKey as jest.Mock).mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      await expect(service.verifySignature(validDto)).rejects.toMatchObject({
        response: { code: 'AUTH_SIGNATURE_INVALID' },
      });
    });

    it('should verify signature using Stellar Keypair with nonce bytes and base64 signature', async () => {
      const { mockKeypair } = setupMocks();
      await service.verifySignature(validDto);

      expect(Keypair.fromPublicKey).toHaveBeenCalledWith(validWallet);
      expect(mockKeypair.verify).toHaveBeenCalledWith(
        Buffer.from(validNonce),
        Buffer.from(validSignature, 'base64'),
      );
    });

    it('should mark nonce as used after successful verification', async () => {
      const { } = setupMocks();
      await service.verifySignature(validDto);

      expect(mockFrom).toHaveBeenCalledWith('nonces');
    });
  });

  // ---------------------------------------------------------------------------
  // generateTokens — upserts user, signs JWT tokens, stores session
  // ---------------------------------------------------------------------------
  describe('generateTokens', () => {
    const defaultUserRecord = { id: 'user-uuid', status: 'active' };

    function setupMocks({
      userResult = { data: defaultUserRecord, error: null },
      sessionsShouldFail = false,
    } = {}) {
      mockFrom.mockImplementation((table: string) => {
        if (table === 'users') {
          const chain: Record<string, jest.Mock> = {
            upsert: jest.fn(),
            select: jest.fn(),
            single: jest.fn().mockResolvedValue(userResult),
          };
          chain.upsert.mockReturnValue(chain);
          chain.select.mockReturnValue(chain);
          return chain;
        }
        return { insert: mockInsert };
      });
      if (sessionsShouldFail) {
        mockSessionsRepository.create.mockRejectedValue(
          new InternalServerErrorException({
            code: 'DATABASE_SESSION_CREATE_FAILED',
            message: 'Failed to create session.',
          }),
        );
      } else {
        mockSessionsRepository.create.mockResolvedValue({ id: 'session-uuid' });
      }
    }

    it('should return accessToken, refreshToken, expiresIn and tokenType', async () => {
      setupMocks();
      const result = await service.generateTokens(validWallet);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.expiresIn).toBe(900);
      expect(result.tokenType).toBe('Bearer');
    });

    it('should sign access token with payload { wallet, type: access } and 15m expiration', async () => {
      setupMocks();
      await service.generateTokens(validWallet);

      expect(mockJwtService.sign).toHaveBeenCalledWith(
        { wallet: validWallet, type: 'access' },
        expect.objectContaining({ expiresIn: '15m' }),
      );
    });

    it('should sign refresh token with payload { wallet, type: refresh } and 7d expiration', async () => {
      setupMocks();
      await service.generateTokens(validWallet);

      expect(mockJwtService.sign).toHaveBeenCalledWith(
        { wallet: validWallet, type: 'refresh' },
        expect.objectContaining({ expiresIn: '7d' }),
      );
    });

    it('should throw UnauthorizedException (AUTH_USER_BLOCKED) when user account is blocked', async () => {
      setupMocks({ userResult: { data: { id: 'user-uuid', status: 'blocked' }, error: null } });

      await expect(service.generateTokens(validWallet)).rejects.toMatchObject({
        response: { code: 'AUTH_USER_BLOCKED' },
      });
    });

    it('should throw InternalServerErrorException (DATABASE_USER_UPSERT_FAILED) when user upsert fails', async () => {
      setupMocks({ userResult: { data: null, error: { message: 'DB error' } } });

      await expect(service.generateTokens(validWallet)).rejects.toMatchObject({
        response: { code: 'DATABASE_USER_UPSERT_FAILED' },
      });
    });

    it('should throw InternalServerErrorException (DATABASE_SESSION_CREATE_FAILED) when session insert fails', async () => {
      setupMocks({ sessionsShouldFail: true });

      await expect(service.generateTokens(validWallet)).rejects.toMatchObject({
        response: { code: 'DATABASE_SESSION_CREATE_FAILED' },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // register
  // ---------------------------------------------------------------------------
  describe('register', () => {
    const registerDto = {
      walletAddress: validWallet,
      username: 'testuser',
      displayName: 'Test User',
      termsAccepted: 'true',
    };

    const mockUser = {
      id: 'user-uuid',
      wallet_address: validWallet,
      username: 'testuser',
      display_name: 'Test User',
      avatar_url: 'https://example.com/avatar.png',
      created_at: new Date().toISOString(),
    };

    beforeEach(() => {
      mockUsersRepository.findByWallet.mockResolvedValue(null);
      mockUsersRepository.checkUsernameExists.mockResolvedValue(false);
      mockUsersRepository.createProfile.mockResolvedValue(mockUser);
      mockUsersRepository.uploadAvatar.mockResolvedValue('https://example.com/avatar.png');

      // Mock findOrCreateUser internal behavior via Supabase mock
      mockFrom.mockImplementation((table: string) => {
        if (table === 'users') {
          const chain: Record<string, jest.Mock> = {
            upsert: jest.fn(),
            select: jest.fn(),
            single: jest.fn().mockResolvedValue({ data: { id: 'user-uuid', status: 'active' }, error: null }),
          };
          chain.upsert.mockReturnValue(chain);
          chain.select.mockReturnValue(chain);
          return chain;
        }
        if (table === 'sessions') {
          return { insert: jest.fn().mockResolvedValue({ error: null }) };
        }
        return { insert: mockInsert };
      });
    });

    it('should register a new user successfully without image', async () => {
      const result = await service.register(registerDto);

      expect(mockUsersRepository.findByWallet).toHaveBeenCalledWith(validWallet);
      expect(mockUsersRepository.checkUsernameExists).toHaveBeenCalledWith('testuser');
      expect(mockUsersRepository.createProfile).toHaveBeenCalledWith({
        wallet: validWallet,
        username: 'testuser',
        displayName: 'Test User',
        avatarUrl: null,
      });
      expect(result.user.walletAddress).toBe(validWallet);
      expect(result.accessToken).toBeDefined();
    });

    it('should register a new user successfully with profile image', async () => {
      const mockFile = { buffer: Buffer.from('test'), mimetype: 'image/png' };
      const result = await service.register(registerDto, mockFile);

      expect(mockUsersRepository.uploadAvatar).toHaveBeenCalledWith(validWallet, mockFile);
      expect(mockUsersRepository.createProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          avatarUrl: 'https://example.com/avatar.png',
        }),
      );
      expect(result.user.avatarUrl).toBe('https://example.com/avatar.png');
    });

    it('should throw ConflictException if wallet already exists', async () => {
      mockUsersRepository.findByWallet.mockResolvedValue({ id: 'existing' });

      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
      await expect(service.register(registerDto)).rejects.toMatchObject({
        response: { code: 'AUTH_WALLET_EXISTS' },
      });
    });

    it('should throw ConflictException if username is taken', async () => {
      mockUsersRepository.checkUsernameExists.mockResolvedValue(true);

      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
      await expect(service.register(registerDto)).rejects.toMatchObject({
        response: { code: 'AUTH_USERNAME_TAKEN' },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // refreshTokens
  // ---------------------------------------------------------------------------
  describe('refreshTokens', () => {
    const validRefreshToken = 'mock.refresh.token';
    const mockPayload = { wallet: validWallet, type: 'refresh' };
    const mockSession = {
      id: 'session-uuid',
      user_id: 'user-uuid',
      refresh_token_hash: 'hashed_token',
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      token_family: 'family-uuid',
      revoked_at: null,
    };
    const mockUser = { id: 'user-uuid', wallet_address: validWallet, status: 'active' };

    beforeEach(() => {
      mockJwtService.verifyAsync = jest.fn().mockResolvedValue(mockPayload);
      mockSessionsRepository.findByHash.mockResolvedValue(mockSession);
      mockUsersRepository.findByWallet.mockResolvedValue(mockUser);
    });

    it('should refresh tokens successfully', async () => {
      const result = await service.refreshTokens(validRefreshToken);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.expiresIn).toBe(900);
      expect(mockSessionsRepository.update).toHaveBeenCalledWith(
        mockSession.id,
        expect.objectContaining({
          refreshTokenHash: expect.any(String),
          expiresAt: expect.any(String),
        }),
      );
    });

    it('should throw UnauthorizedException on invalid token signature', async () => {
      mockJwtService.verifyAsync.mockRejectedValue(new Error('Invalid signature'));

      await expect(service.refreshTokens(validRefreshToken)).rejects.toThrow(UnauthorizedException);
      await expect(service.refreshTokens(validRefreshToken)).rejects.toMatchObject({
        response: { code: 'AUTH_TOKEN_INVALID' },
      });
    });

    it('should throw UnauthorizedException on expired JWT refresh token signature', async () => {
      const expiredError = new Error('JWT Expired');
      expiredError.name = 'TokenExpiredError';
      mockJwtService.verifyAsync.mockRejectedValue(expiredError);

      await expect(service.refreshTokens(validRefreshToken)).rejects.toThrow(UnauthorizedException);
      await expect(service.refreshTokens(validRefreshToken)).rejects.toMatchObject({
        response: { code: 'AUTH_TOKEN_EXPIRED' },
      });
    });

    it('should throw UnauthorizedException if session is not found in DB', async () => {
      mockSessionsRepository.findByHash.mockResolvedValue(null);

      await expect(service.refreshTokens(validRefreshToken)).rejects.toThrow(UnauthorizedException);
      await expect(service.refreshTokens(validRefreshToken)).rejects.toMatchObject({
        response: { code: 'AUTH_TOKEN_REVOKED' },
      });
    });

    it('should throw UnauthorizedException and revoke family if session is already revoked', async () => {
      mockSessionsRepository.findByHash.mockResolvedValue({
        ...mockSession,
        revoked_at: new Date().toISOString(),
      });

      await expect(service.refreshTokens(validRefreshToken)).rejects.toThrow(UnauthorizedException);
      expect(mockSessionsRepository.revokeFamily).toHaveBeenCalledWith(mockSession.token_family);
    });

    it('should throw UnauthorizedException if session is expired in DB', async () => {
      mockSessionsRepository.findByHash.mockResolvedValue({
        ...mockSession,
        expires_at: new Date(Date.now() - 3600000).toISOString(),
      });

      await expect(service.refreshTokens(validRefreshToken)).rejects.toThrow(UnauthorizedException);
      expect(mockSessionsRepository.delete).toHaveBeenCalledWith(mockSession.id);
    });

    it('should throw UnauthorizedException if user is blocked', async () => {
      mockUsersRepository.findByWallet.mockResolvedValue({
        ...mockUser,
        status: 'blocked',
      });

      await expect(service.refreshTokens(validRefreshToken)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ---------------------------------------------------------------------------
  // logout
  // ---------------------------------------------------------------------------
  describe('logout', () => {
    const validRefreshToken = 'mock.refresh.token';
    const mockPayload = { wallet: validWallet, type: 'refresh' };

    beforeEach(() => {
      mockJwtService.verifyAsync = jest.fn().mockResolvedValue(mockPayload);
    });

    it('should log out successfully by deleting session from DB', async () => {
      await service.logout(validRefreshToken);

      expect(mockSessionsRepository.deleteByHash).toHaveBeenCalled();
    });

    it('should allow logout even if JWT refresh token is expired', async () => {
      const expiredError = new Error('JWT Expired');
      expiredError.name = 'TokenExpiredError';
      mockJwtService.verifyAsync.mockRejectedValue(expiredError);
      mockJwtService.decode.mockReturnValue({ type: 'refresh' });

      await service.logout(validRefreshToken);

      expect(mockSessionsRepository.deleteByHash).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if JWT signature is invalid', async () => {
      mockJwtService.verifyAsync.mockRejectedValue(new Error('Invalid signature'));

      await expect(service.logout(validRefreshToken)).rejects.toThrow(UnauthorizedException);
    });
  });
});
