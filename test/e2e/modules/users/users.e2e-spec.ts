import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe, UnauthorizedException } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ConfigModule } from '@nestjs/config';
import { UsersModule } from '../../../../src/modules/users/users.module';
import { UsersService } from '../../../../src/modules/users/users.service';
import { JwtAuthGuard } from '../../../../src/common/guards/jwt-auth.guard';
import { SupabaseService } from '../../../../src/database/supabase.client';

/**
 * E2E tests for GET /users/me (API-04) and PATCH /users/me (API-05).
 *
 * JwtAuthGuard is mocked here since it is owned by API-03.
 * We test that:
 *  - With a valid (mocked) token → 200 + expected envelope
 *  - Without a token → 401
 */
describe('UsersController (e2e)', () => {
  let app: NestFastifyApplication;

  const testWallet = 'GABC123XYZ456DEF789ABCDEF0123456789ABCDEF0123456789ABCDEFGHIJ';

  const mockUserProfile = {
    wallet: testWallet,
    name: null,
    avatar: null,
    preferences: { notifications: true, theme: 'system', language: 'en' },
    createdAt: '2026-02-19T14:00:00.000Z',
  };

  const mockUpdatedProfile = {
    wallet: testWallet,
    name: 'Maria Garcia',
    avatar: null,
    preferences: { notifications: true, theme: 'system', language: 'en' },
    updatedAt: '2026-02-20T10:00:00.000Z',
  };

  const mockUsersService = {
    getOrCreateProfile: jest.fn().mockResolvedValue(mockUserProfile),
    updateProfile: jest.fn().mockResolvedValue(mockUpdatedProfile),
    becomeLp: jest.fn().mockResolvedValue({
      wallet: testWallet,
      role: 'lp_provider',
      message: 'User role successfully updated to lp_provider.',
    }),
  };

  // Mock guard that simulates API-03's JwtAuthGuard behavior:
  // throws UnauthorizedException when no Bearer token is present,
  // otherwise sets req.user = { wallet } and allows the request through.
  const mockJwtAuthGuard = {
    canActivate: jest.fn((context) => {
      const req = context.switchToHttp().getRequest();
      const authHeader = req.headers['authorization'];
      if (!authHeader?.startsWith('Bearer ')) {
        throw new UnauthorizedException('No token provided');
      }
      req.user = { wallet: testWallet };
      return true;
    }),
  };

  const mockSupabaseService = {
    getServiceRoleClient: jest.fn(),
    getClient: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), UsersModule],
    })

      .overrideProvider(UsersService)
      .useValue(mockUsersService)
      .overrideProvider(SupabaseService)
      .useValue(mockSupabaseService)
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockUsersService.getOrCreateProfile.mockResolvedValue(mockUserProfile);
    mockUsersService.updateProfile.mockResolvedValue(mockUpdatedProfile);
    mockJwtAuthGuard.canActivate.mockImplementation((context) => {
      const req = context.switchToHttp().getRequest();
      const authHeader = req.headers['authorization'];
      if (!authHeader?.startsWith('Bearer ')) {
        throw new UnauthorizedException('No token provided');
      }
      req.user = { wallet: testWallet };
      return true;
    });
  });

  // ---------------------------------------------------------------------------
  // GET /users/me (API-04)
  // ---------------------------------------------------------------------------
  describe('GET /users/me', () => {
    it('should return 200 with user profile when a valid token is provided', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/users/me',
        headers: { authorization: 'Bearer valid.jwt.token' },
      });

      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.payload);
      expect(body).toEqual({
        success: true,
        data: mockUserProfile,
        message: 'User retrieved successfully',
      });
      expect(mockUsersService.getOrCreateProfile).toHaveBeenCalledWith(testWallet);
    });

    it('should return 401 when no token is provided', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/users/me',
      });

      expect(res.statusCode).toBe(401);
      expect(mockUsersService.getOrCreateProfile).not.toHaveBeenCalled();
    });

    it('should return 401 when Authorization header is malformed', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/users/me',
        headers: { authorization: 'InvalidScheme token123' },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH /users/me (API-05)
  // ---------------------------------------------------------------------------
  describe('PATCH /users/me', () => {
    it('should return 401 when no authorization token is provided', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/users/me',
        payload: { name: 'Maria Garcia' },
      });

      expect(res.statusCode).toBe(401);
      expect(mockUsersService.updateProfile).not.toHaveBeenCalled();
    });

    it('should return 200 with response envelope when valid token is provided', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/users/me',
        headers: { authorization: 'Bearer valid.jwt.token' },
        payload: { name: 'Maria Garcia' },
      });

      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.payload);
      expect(body).toEqual({
        success: true,
        data: mockUpdatedProfile,
        message: 'Profile updated successfully',
      });
      expect(mockUsersService.updateProfile).toHaveBeenCalledWith(
        testWallet,
        expect.objectContaining({ name: 'Maria Garcia' }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // POST /users/me/become-lp
  // ---------------------------------------------------------------------------
  describe('POST /users/me/become-lp', () => {
    it('should return 200 with lp_provider role when token is provided', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/users/me/become-lp',
        headers: { authorization: 'Bearer valid.jwt.token' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.data.role).toBe('lp_provider');
      expect(mockUsersService.becomeLp).toHaveBeenCalledWith(testWallet);
    });

    it('should return 401 when no token is provided', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/users/me/become-lp',
      });

      expect(res.statusCode).toBe(401);
      expect(mockUsersService.becomeLp).not.toHaveBeenCalled();
    });
  });
});
