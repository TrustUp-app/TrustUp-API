import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe, UnauthorizedException } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ConfigModule } from '@nestjs/config';
import { NotificationsModule } from '../../../../src/modules/notifications/notifications.module';
import { AuthModule } from '../../../../src/modules/auth/auth.module';
import { JwtAuthGuard } from '../../../../src/common/guards/jwt-auth.guard';
import { NotificationsRepository } from '../../../../src/database/repositories/notifications.repository';

describe('NotificationsController (e2e)', () => {
  let app: NestFastifyApplication;

  const validWallet = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';
  const notificationId = '22222222-3333-4444-5555-666666666666';

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

  const mockNotificationsRepository = {
    findByUser: jest.fn(),
    findById: jest.fn(),
    countUnread: jest.fn(),
    markAsRead: jest.fn(),
    markAllAsRead: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), NotificationsModule, AuthModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .overrideProvider(NotificationsRepository)
      .useValue(mockNotificationsRepository)
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockNotificationsRepository.findByUser.mockResolvedValue({ notifications: [], total: 0 });
    mockNotificationsRepository.countUnread.mockResolvedValue(0);
    mockNotificationsRepository.findById.mockResolvedValue(null);
    mockNotificationsRepository.markAsRead.mockResolvedValue(undefined);
    mockNotificationsRepository.markAllAsRead.mockResolvedValue(2);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('GET /notifications', () => {
    it('should return paginated notifications for authenticated user', async () => {
      const now = new Date().toISOString();
      mockNotificationsRepository.findByUser.mockResolvedValue({
        notifications: [{
          id: notificationId, user_wallet: validWallet, type: 'loan_reminder',
          title: 'Payment Reminder', message: 'Your loan payment of $102.66 is due',
          data: { loanId: 'loan-1', amount: 102.66 }, is_read: false,
          created_at: now, read_at: null,
        }],
        total: 1,
      });
      mockNotificationsRepository.countUnread.mockResolvedValue(1);

      const res = await app.inject({
        method: 'GET', url: '/notifications',
        headers: { authorization: 'Bearer valid.jwt.token' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        id: notificationId, type: 'loan_reminder',
        title: 'Payment Reminder', isRead: false,
      });
      expect(body.pagination.total).toBe(1);
      expect(body.unreadCount).toBe(1);
    });

    it('should return 401 without authentication', async () => {
      const res = await app.inject({ method: 'GET', url: '/notifications' });
      expect(res.statusCode).toBe(401);
    });

    it('should filter by unread only', async () => {
      await app.inject({
        method: 'GET', url: '/notifications?unread=true',
        headers: { authorization: 'Bearer valid.jwt.token' },
      });
      expect(mockNotificationsRepository.findByUser).toHaveBeenCalledWith(validWallet, {
        limit: 20, offset: 0, unread: true, type: undefined,
      });
    });
  });

  describe('PATCH /notifications/:id/read', () => {
    it('should mark a notification as read', async () => {
      mockNotificationsRepository.findById.mockResolvedValue({
        id: notificationId, user_wallet: validWallet, is_read: false,
      });

      const res = await app.inject({
        method: 'PATCH', url: `/notifications/${notificationId}/read`,
        headers: { authorization: 'Bearer valid.jwt.token' },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).success).toBe(true);
    });

    it('should return 403 for notification owned by another user', async () => {
      mockNotificationsRepository.findById.mockResolvedValue({
        id: notificationId, user_wallet: 'GOTHERWALLET...', is_read: false,
      });

      const res = await app.inject({
        method: 'PATCH', url: `/notifications/${notificationId}/read`,
        headers: { authorization: 'Bearer valid.jwt.token' },
      });

      expect(res.statusCode).toBe(403);
    });

    it('should return 404 for non-existent notification', async () => {
      const res = await app.inject({
        method: 'PATCH', url: `/notifications/00000000-0000-0000-0000-000000000000/read`,
        headers: { authorization: 'Bearer valid.jwt.token' },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('PATCH /notifications/read-all', () => {
    it('should mark all notifications as read', async () => {
      const res = await app.inject({
        method: 'PATCH', url: '/notifications/read-all',
        headers: { authorization: 'Bearer valid.jwt.token' },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).updatedCount).toBe(2);
    });

    it('should return 401 without authentication', async () => {
      const res = await app.inject({ method: 'PATCH', url: '/notifications/read-all' });
      expect(res.statusCode).toBe(401);
    });
  });
});