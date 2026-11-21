import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from '../../../../src/modules/auth/auth.controller';
import { AuthService } from '../../../../src/modules/auth/auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  const expectedTokens = {
    accessToken: 'mock.access.token',
    refreshToken: 'mock.refresh.token',
    expiresIn: 900,
    tokenType: 'Bearer',
  };

  const mockAuthService = {
    register: jest.fn(),
    generateNonce: jest.fn(),
    verifySignature: jest.fn().mockResolvedValue(undefined),
    generateTokens: jest.fn().mockResolvedValue(expectedTokens),
    refreshTokens: jest.fn().mockResolvedValue(expectedTokens),
    logout: jest.fn().mockResolvedValue(undefined),
    listSessions: jest.fn(),
    revokeSession: jest.fn().mockResolvedValue(undefined),
    revokeAllSessions: jest.fn().mockResolvedValue(undefined),
  };

  const validWallet = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // POST /auth/register
  // ---------------------------------------------------------------------------
  describe('register', () => {
    const registerDto = {
      walletAddress: validWallet,
      username: 'testuser',
      displayName: 'Test User',
      termsAccepted: 'true',
    };

    it('should register successfully with a valid profile image', async () => {
      const imageBuffer = Buffer.from('fake-image-bytes');
      const mockReq = {
        isMultipart: () => true,
        file: jest.fn().mockResolvedValue({
          mimetype: 'image/png',
          filename: 'avatar.png',
          toBuffer: jest.fn().mockResolvedValue(imageBuffer),
        }),
      } as any;

      const mockResponse = {
        user: {
          id: 'user-uuid',
          walletAddress: validWallet,
          username: 'testuser',
          displayName: 'Test User',
          avatarUrl: 'https://supabase.co/storage/v1/object/public/avatars/avatar.png',
          createdAt: new Date().toISOString(),
        },
        ...expectedTokens,
      };

      mockAuthService.register.mockResolvedValue(mockResponse);

      const result = await controller.register(mockReq, registerDto);

      expect(result).toEqual(mockResponse);
      expect(result.user.avatarUrl).toBe(
        'https://supabase.co/storage/v1/object/public/avatars/avatar.png',
      );
      expect(authService.register).toHaveBeenCalledWith(
        registerDto,
        {
          buffer: imageBuffer,
          mimetype: 'image/png',
          filename: 'avatar.png',
          originalname: 'avatar.png',
        },
        { deviceInfo: null, ipAddress: null },
      );
    });

    it('should register successfully without a profile image (avatarUrl is null)', async () => {
      const mockReq = {
        isMultipart: () => false,
      } as any;

      const mockResponse = {
        user: {
          id: 'user-uuid',
          walletAddress: validWallet,
          username: 'testuser',
          displayName: 'Test User',
          avatarUrl: null,
          createdAt: new Date().toISOString(),
        },
        ...expectedTokens,
      };

      mockAuthService.register.mockResolvedValue(mockResponse);

      const result = await controller.register(mockReq, registerDto);

      expect(result).toEqual(mockResponse);
      expect(result.user.avatarUrl).toBeNull();
      expect(authService.register).toHaveBeenCalledWith(registerDto, undefined, {
        deviceInfo: null,
        ipAddress: null,
      });
    });

    it('should throw BadRequestException (400) with code FILE_INVALID_TYPE when file MIME type is invalid', async () => {
      const mockReq = {
        isMultipart: () => true,
        file: jest.fn().mockResolvedValue({
          mimetype: 'application/pdf',
          filename: 'doc.pdf',
          toBuffer: jest.fn(),
        }),
      } as any;

      await expect(controller.register(mockReq, registerDto)).rejects.toThrow(BadRequestException);

      try {
        await controller.register(mockReq, registerDto);
      } catch (err: any) {
        expect(err.getResponse()).toEqual({
          code: 'FILE_INVALID_TYPE',
          message: 'Invalid file type. Allowed types: image/jpeg, image/png, image/webp',
        });
      }
    });
  });

  // ---------------------------------------------------------------------------
  // POST /auth/nonce
  // ---------------------------------------------------------------------------
  describe('getNonce', () => {
    it('should return nonce and expiresAt', async () => {
      const expectedResult = {
        nonce: 'a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890',
        expiresAt: '2026-02-13T10:05:00.000Z',
      };

      mockAuthService.generateNonce.mockResolvedValue(expectedResult);

      const dto = { wallet: validWallet };
      const result = await controller.getNonce(dto);

      expect(result).toEqual(expectedResult);
      expect(authService.generateNonce).toHaveBeenCalledWith(validWallet);
      expect(authService.generateNonce).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /auth/verify
  // ---------------------------------------------------------------------------
  describe('verify', () => {
    const validNonce = 'a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890';
    const validSignature = Buffer.alloc(64).toString('base64');

    it('should return JWT tokens on valid input', async () => {
      const dto = { wallet: validWallet, nonce: validNonce, signature: validSignature };
      const result = await controller.verify(dto);

      expect(result).toEqual(expectedTokens);
    });

    it('should call verifySignature with the full DTO and generateTokens with the wallet', async () => {
      const dto = { wallet: validWallet, nonce: validNonce, signature: validSignature };
      await controller.verify(dto);

      expect(authService.verifySignature).toHaveBeenCalledWith(dto);
      expect(authService.verifySignature).toHaveBeenCalledTimes(1);
      expect(authService.generateTokens).toHaveBeenCalledWith(validWallet, {});
      expect(authService.generateTokens).toHaveBeenCalledTimes(1);
    });

    it('should pass the client User-Agent and IP to generateTokens', async () => {
      const dto = { wallet: validWallet, nonce: validNonce, signature: validSignature };
      const req = { headers: { 'user-agent': 'Mozilla/5.0 (Test)' }, ip: '203.0.113.42' } as any;
      await controller.verify(dto, req);

      expect(authService.generateTokens).toHaveBeenCalledWith(validWallet, {
        deviceInfo: 'Mozilla/5.0 (Test)',
        ipAddress: '203.0.113.42',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // POST /auth/refresh
  // ---------------------------------------------------------------------------
  describe('refresh', () => {
    it('should return new JWT tokens on valid refresh token', async () => {
      const dto = { refreshToken: 'valid.refresh.token' };
      const result = await controller.refresh(dto);

      expect(result).toEqual(expectedTokens);
      expect(authService.refreshTokens).toHaveBeenCalledWith(dto.refreshToken, {});
      expect(authService.refreshTokens).toHaveBeenCalledTimes(1);
    });

    it('should pass the client User-Agent and IP to refreshTokens', async () => {
      const dto = { refreshToken: 'valid.refresh.token' };
      const req = { headers: { 'user-agent': 'Mozilla/5.0 (Test)' }, ip: '203.0.113.42' } as any;
      await controller.refresh(dto, req);

      expect(authService.refreshTokens).toHaveBeenCalledWith(dto.refreshToken, {
        deviceInfo: 'Mozilla/5.0 (Test)',
        ipAddress: '203.0.113.42',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /auth/logout
  // ---------------------------------------------------------------------------
  describe('logout', () => {
    it('should log out successfully', async () => {
      const dto = { refreshToken: 'valid.refresh.token' };
      const result = await controller.logout(dto);

      expect(result).toBeUndefined();
      expect(authService.logout).toHaveBeenCalledWith(dto.refreshToken);
      expect(authService.logout).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // /auth/sessions
  // ---------------------------------------------------------------------------
  describe('sessions', () => {
    const user = { wallet: validWallet };

    it('GET /auth/sessions should list sessions of the current user', async () => {
      const sessions = [
        {
          id: 'session-1',
          deviceInfo: 'Mozilla/5.0',
          ipAddress: '203.0.113.42',
          createdAt: '2026-02-13T10:00:00.000Z',
          expiresAt: '2026-02-20T10:00:00.000Z',
        },
      ];
      mockAuthService.listSessions.mockResolvedValue(sessions);

      await expect(controller.listSessions(user)).resolves.toEqual(sessions);
      expect(authService.listSessions).toHaveBeenCalledWith(validWallet);
    });

    it('DELETE /auth/sessions/:id should revoke the given session', async () => {
      await expect(controller.revokeSession(user, 'session-1')).resolves.toBeUndefined();
      expect(authService.revokeSession).toHaveBeenCalledWith(validWallet, 'session-1');
    });

    it('DELETE /auth/sessions should revoke all sessions of the current user', async () => {
      await expect(controller.revokeAllSessions(user)).resolves.toBeUndefined();
      expect(authService.revokeAllSessions).toHaveBeenCalledWith(validWallet);
    });
  });
});
