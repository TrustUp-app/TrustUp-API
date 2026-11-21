import { Test, TestingModule } from '@nestjs/testing';
import {
  InternalServerErrorException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
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
    verifyAsync: jest.fn(),
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
    delete: jest.fn(),
    deleteByHash: jest.fn(),
    revokeFamily: jest.fn(),
    markRotated: jest.fn(),
    findActiveByUserId: jest.fn(),
    findByIdForUser: jest.fn(),
    revokeAllForUser: jest.fn(),
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
      const {} = setupMocks();
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
        { wallet: validWallet, type: 'refresh', jti: expect.any(String) },
        expect.objectContaining({ expiresIn: '7d' }),
      );
    });

    it('should create a new session in a new token family with device info and IP', async () => {
      setupMocks();
      await service.generateTokens(validWallet, {
        deviceInfo: 'Mozilla/5.0 (TestAgent)',
        ipAddress: '203.0.113.42',
      });

      expect(mockSessionsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-uuid',
          refreshTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          tokenFamily: expect.any(String),
          deviceInfo: 'Mozilla/5.0 (TestAgent)',
          ipAddress: '203.0.113.42',
        }),
      );
    });

    it('should truncate very long device info', async () => {
      setupMocks();
      await service.generateTokens(validWallet, { deviceInfo: 'x'.repeat(2000) });

      const created = mockSessionsRepository.create.mock.calls[0][0];
      expect(created.deviceInfo).toHaveLength(512);
      expect(created.ipAddress).toBeUndefined();
    });

    it('should use a different token family for each login', async () => {
      setupMocks();
      await service.generateTokens(validWallet);
      await service.generateTokens(validWallet);

      const [first, second] = mockSessionsRepository.create.mock.calls.map((c) => c[0]);
      expect(first.tokenFamily).not.toBe(second.tokenFamily);
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
            single: jest
              .fn()
              .mockResolvedValue({ data: { id: 'user-uuid', status: 'active' }, error: null }),
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
      device_info: 'Mozilla/5.0 (OldAgent)',
      ip_address: '198.51.100.7',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      token_family: 'family-uuid',
      revoked_at: null,
    };
    const mockUser = { id: 'user-uuid', wallet_address: validWallet, status: 'active' };

    beforeEach(() => {
      mockJwtService.verifyAsync = jest.fn().mockResolvedValue(mockPayload);
      mockSessionsRepository.findByHash.mockResolvedValue(mockSession);
      mockSessionsRepository.markRotated.mockResolvedValue(true);
      mockUsersRepository.findByWallet.mockResolvedValue(mockUser);
    });

    it('should refresh tokens successfully', async () => {
      const result = await service.refreshTokens(validRefreshToken);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.expiresIn).toBe(900);
    });

    it('should rotate by marking the old session used and inserting a new row in the same family', async () => {
      await service.refreshTokens(validRefreshToken);

      // Old row is marked rotated, not overwritten or deleted
      expect(mockSessionsRepository.markRotated).toHaveBeenCalledWith(mockSession.id);
      expect(mockSessionsRepository.delete).not.toHaveBeenCalled();
      expect(mockSessionsRepository.deleteByHash).not.toHaveBeenCalled();

      // New row in the same token family
      expect(mockSessionsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUser.id,
          tokenFamily: mockSession.token_family,
          refreshTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          expiresAt: expect.any(String),
        }),
      );
      expect(mockSessionsRepository.revokeFamily).not.toHaveBeenCalled();

      // Rotation must happen before the new session is created
      const markOrder = mockSessionsRepository.markRotated.mock.invocationCallOrder[0];
      const createOrder = mockSessionsRepository.create.mock.invocationCallOrder[0];
      expect(markOrder).toBeLessThan(createOrder);
    });

    it('should record the current device info/IP on the rotated session', async () => {
      await service.refreshTokens(validRefreshToken, {
        deviceInfo: 'Mozilla/5.0 (NewAgent)',
        ipAddress: '203.0.113.42',
      });

      expect(mockSessionsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceInfo: 'Mozilla/5.0 (NewAgent)',
          ipAddress: '203.0.113.42',
        }),
      );
    });

    it('should keep the previous device info/IP when the request has none', async () => {
      await service.refreshTokens(validRefreshToken);

      expect(mockSessionsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceInfo: mockSession.device_info,
          ipAddress: mockSession.ip_address,
        }),
      );
    });

    it('should detect reuse of an already-rotated token and revoke the whole family', async () => {
      // Simulate the DB state after a successful rotation: the old row is kept with revoked_at set
      mockSessionsRepository.findByHash.mockResolvedValue({
        ...mockSession,
        revoked_at: new Date().toISOString(),
      });

      await expect(service.refreshTokens(validRefreshToken)).rejects.toMatchObject({
        response: { code: 'AUTH_TOKEN_REVOKED' },
      });
      expect(mockSessionsRepository.revokeFamily).toHaveBeenCalledWith(mockSession.token_family);
      expect(mockSessionsRepository.markRotated).not.toHaveBeenCalled();
      expect(mockSessionsRepository.create).not.toHaveBeenCalled();
    });

    it('should treat a lost rotation race (concurrent replay) as reuse and revoke the family', async () => {
      mockSessionsRepository.markRotated.mockResolvedValue(false);

      await expect(service.refreshTokens(validRefreshToken)).rejects.toMatchObject({
        response: { code: 'AUTH_TOKEN_REVOKED' },
      });
      expect(mockSessionsRepository.revokeFamily).toHaveBeenCalledWith(mockSession.token_family);
      expect(mockSessionsRepository.create).not.toHaveBeenCalled();
    });

    it('should reject a token whose session belongs to a different user', async () => {
      mockUsersRepository.findByWallet.mockResolvedValue({ ...mockUser, id: 'other-user' });

      await expect(service.refreshTokens(validRefreshToken)).rejects.toMatchObject({
        response: { code: 'AUTH_USER_NOT_FOUND' },
      });
      expect(mockSessionsRepository.markRotated).not.toHaveBeenCalled();
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

    it('should log out successfully by revoking the session family', async () => {
      mockSessionsRepository.findByHash.mockResolvedValue({
        id: 'session-uuid',
        token_family: 'family-uuid',
        revoked_at: null,
      });

      await service.logout(validRefreshToken);

      expect(mockSessionsRepository.revokeFamily).toHaveBeenCalledWith('family-uuid');
    });

    it('should succeed silently when the session no longer exists', async () => {
      mockSessionsRepository.findByHash.mockResolvedValue(null);

      await expect(service.logout(validRefreshToken)).resolves.toBeUndefined();
      expect(mockSessionsRepository.revokeFamily).not.toHaveBeenCalled();
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

  // ---------------------------------------------------------------------------
  // Session management (multi-device)
  // ---------------------------------------------------------------------------
  describe('session management', () => {
    const mockUser = { id: 'user-uuid', wallet_address: validWallet, status: 'active' };
    const activeSession = {
      id: 'session-1',
      user_id: 'user-uuid',
      refresh_token_hash: 'hash-1',
      device_info: 'Mozilla/5.0 (Phone)',
      ip_address: '203.0.113.1',
      created_at: '2026-02-13T10:00:00.000Z',
      expires_at: '2026-02-20T10:00:00.000Z',
      token_family: 'family-1',
      revoked_at: null,
    };

    beforeEach(() => {
      mockUsersRepository.findByWallet.mockResolvedValue(mockUser);
    });

    describe('listSessions', () => {
      it('should return active sessions of the user without the token hash', async () => {
        mockSessionsRepository.findActiveByUserId.mockResolvedValue([activeSession]);

        const result = await service.listSessions(validWallet);

        expect(mockSessionsRepository.findActiveByUserId).toHaveBeenCalledWith('user-uuid');
        expect(result).toEqual([
          {
            id: 'session-1',
            deviceInfo: 'Mozilla/5.0 (Phone)',
            ipAddress: '203.0.113.1',
            createdAt: '2026-02-13T10:00:00.000Z',
            expiresAt: '2026-02-20T10:00:00.000Z',
          },
        ]);
        expect(result[0]).not.toHaveProperty('refreshTokenHash');
      });

      it('should throw AUTH_USER_NOT_FOUND when the wallet has no user', async () => {
        mockUsersRepository.findByWallet.mockResolvedValue(null);

        await expect(service.listSessions(validWallet)).rejects.toMatchObject({
          response: { code: 'AUTH_USER_NOT_FOUND' },
        });
      });
    });

    describe('revokeSession', () => {
      it('should revoke the token family of a session owned by the user', async () => {
        mockSessionsRepository.findByIdForUser.mockResolvedValue(activeSession);

        await service.revokeSession(validWallet, 'session-1');

        expect(mockSessionsRepository.findByIdForUser).toHaveBeenCalledWith(
          'session-1',
          'user-uuid',
        );
        expect(mockSessionsRepository.revokeFamily).toHaveBeenCalledWith('family-1');
      });

      it('should throw NotFoundException when the session does not belong to the user', async () => {
        mockSessionsRepository.findByIdForUser.mockResolvedValue(null);

        await expect(service.revokeSession(validWallet, 'session-x')).rejects.toThrow(
          NotFoundException,
        );
        await expect(service.revokeSession(validWallet, 'session-x')).rejects.toMatchObject({
          response: { code: 'AUTH_SESSION_NOT_FOUND' },
        });
        expect(mockSessionsRepository.revokeFamily).not.toHaveBeenCalled();
      });
    });

    describe('revokeAllSessions', () => {
      it('should revoke every session of the user', async () => {
        await service.revokeAllSessions(validWallet);

        expect(mockSessionsRepository.revokeAllForUser).toHaveBeenCalledWith('user-uuid');
      });
    });
  });
});
