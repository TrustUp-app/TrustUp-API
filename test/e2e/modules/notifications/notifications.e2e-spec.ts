import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { NotificationsModule } from '../../../../src/modules/notifications/notifications.module';
import { SupabaseService } from '../../../../src/database/supabase.client';
import { JwtAuthGuard } from '../../../../src/common/guards/jwt-auth.guard';

describe('NotificationsController (e2e)', () => {
  let app: NestFastifyApplication;

  const validWallet = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';

  const mockSupabaseClient = {
    from: jest.fn(),
  };

  const mockSupabaseService = {
    getServiceRoleClient: jest.fn(() => mockSupabaseClient),
    getClient: jest.fn(() => mockSupabaseClient),
  };

  const mockJwtAuthGuard = {
    canActivate: jest.fn((context) => {
      const req = context.switchToHttp().getRequest();
      const authHeader = req.headers['authorization'];

      if (!authHeader?.startsWith('Bearer ')) {
        throw new UnauthorizedException('No token provided');
      }

      req.user = { wallet: validWallet };
      return true;
    }),
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), NotificationsModule],
    })
      .overrideProvider(SupabaseService)
      .useValue(mockSupabaseService)
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseService.getServiceRoleClient.mockReturnValue(mockSupabaseClient);
    mockJwtAuthGuard.canActivate.mockImplementation((context) => {
      const req = context.switchToHttp().getRequest();
      const authHeader = req.headers['authorization'];

      if (!authHeader?.startsWith('Bearer ')) {
        throw new UnauthorizedException('No token provided');
      }

      req.user = { wallet: validWallet };
      return true;
    });
  });

  describe('GET /notifications', () => {
    it('should return paginated notifications with unread count', async () => {
      const listBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: [
            {
              id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
              type: 'loan_reminder',
              title: 'Payment Reminder',
              message: 'Your next payment is due in 2 days.',
              data: { loan_id: 'loan-123', amount: 150 },
              is_read: false,
              created_at: '2026-04-20T10:00:00.000Z',
              read_at: null,
            },
          ],
          error: null,
          count: 1,
        }),
      };

      const unreadBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn(),
      };

      unreadBuilder.eq
        .mockImplementationOnce(() => unreadBuilder)
        .mockResolvedValueOnce({ count: 1, error: null });

      // First call: notifications list query. Second call: unread count query.
      mockSupabaseClient.from
        .mockReturnValueOnce(listBuilder)
        .mockReturnValueOnce(unreadBuilder);

      const res = await app.inject({
        method: 'GET',
        url: '/notifications?limit=20&offset=0',
        headers: { authorization: 'Bearer valid.jwt.token' },
      });

      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.payload);
      expect(body).toEqual({
        success: true,
        data: [
          {
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            type: 'loan_reminder',
            title: 'Payment Reminder',
            message: 'Your next payment is due in 2 days.',
            data: { loan_id: 'loan-123', amount: 150 },
            isRead: false,
            createdAt: '2026-04-20T10:00:00.000Z',
            readAt: null,
          },
        ],
        pagination: {
          limit: 20,
          offset: 0,
          total: 1,
        },
        unreadCount: 1,
      });

      expect(mockSupabaseClient.from).toHaveBeenNthCalledWith(1, 'notifications');
      expect(mockSupabaseClient.from).toHaveBeenNthCalledWith(2, 'notifications');
      expect(listBuilder.eq).toHaveBeenCalledWith('user_wallet', validWallet);
      expect(listBuilder.range).toHaveBeenCalledWith(0, 19);
      expect(unreadBuilder.eq).toHaveBeenCalledWith('user_wallet', validWallet);
      expect(unreadBuilder.eq).toHaveBeenCalledWith('is_read', false);
    });

    it('should return 401 when no bearer token is provided', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/notifications',
      });

      expect(res.statusCode).toBe(401);
    });

    it('should return 400 for invalid query params', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/notifications?limit=101&offset=-1&unread=not-boolean',
        headers: { authorization: 'Bearer valid.jwt.token' },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('PATCH /notifications/read-all', () => {
    it('should mark all unread notifications as read and return updated count', async () => {
      const markAllBuilder = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue({
          data: [{ id: 'n-1' }, { id: 'n-2' }],
          error: null,
        }),
      };

      mockSupabaseClient.from.mockReturnValueOnce(markAllBuilder);

      const res = await app.inject({
        method: 'PATCH',
        url: '/notifications/read-all',
        headers: { authorization: 'Bearer valid.jwt.token' },
      });

      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.payload);
      expect(body).toEqual({ success: true, updatedCount: 2 });

      expect(markAllBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          is_read: true,
          read_at: expect.any(String),
          updated_at: expect.any(String),
        }),
      );
      expect(markAllBuilder.eq).toHaveBeenCalledWith('user_wallet', validWallet);
      expect(markAllBuilder.eq).toHaveBeenCalledWith('is_read', false);
      expect(markAllBuilder.select).toHaveBeenCalledWith('id');
    });
  });

  describe('PATCH /notifications/:id/read', () => {
    it('should mark a single notification as read', async () => {
      const fetchBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            user_wallet: validWallet,
            is_read: false,
          },
          error: null,
        }),
      };

      const updateBuilder = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ error: null }),
      };

      mockSupabaseClient.from
        .mockReturnValueOnce(fetchBuilder)
        .mockReturnValueOnce(updateBuilder);

      const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

      const res = await app.inject({
        method: 'PATCH',
        url: `/notifications/${id}/read`,
        headers: { authorization: 'Bearer valid.jwt.token' },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload)).toEqual({ success: true, updatedCount: 1 });

      expect(updateBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          is_read: true,
          read_at: expect.any(String),
          updated_at: expect.any(String),
        }),
      );
      expect(updateBuilder.eq).toHaveBeenCalledWith('id', id);
    });

    it('should return 404 when notification does not exist', async () => {
      const fetchBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
      };

      mockSupabaseClient.from.mockReturnValueOnce(fetchBuilder);

      const res = await app.inject({
        method: 'PATCH',
        url: '/notifications/a1b2c3d4-e5f6-7890-abcd-ef1234567890/read',
        headers: { authorization: 'Bearer valid.jwt.token' },
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body).toHaveProperty('message');
    });

    it('should return 403 when notification belongs to another wallet', async () => {
      const fetchBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            user_wallet: 'GZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ',
            is_read: false,
          },
          error: null,
        }),
      };

      mockSupabaseClient.from.mockReturnValueOnce(fetchBuilder);

      const res = await app.inject({
        method: 'PATCH',
        url: '/notifications/a1b2c3d4-e5f6-7890-abcd-ef1234567890/read',
        headers: { authorization: 'Bearer valid.jwt.token' },
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.payload);
      expect(body).toHaveProperty('message');
    });
  });
});
