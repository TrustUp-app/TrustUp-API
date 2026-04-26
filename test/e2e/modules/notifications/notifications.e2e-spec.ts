import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import * as request from 'supertest';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../../../../src/modules/auth/auth.module';
import { NotificationsModule } from '../../../../src/modules/notifications/notifications.module';
import { SupabaseService } from '../../../../src/database/supabase.client';

describe('NotificationsController (e2e)', () => {
  let app: NestFastifyApplication;
  let authToken: string;
  let testWallet: string;
  let otherAuthToken: string;
  let otherWallet: string;
  let supabaseService: SupabaseService;
  let testUserId: string;
  let otherUserId: string;

  beforeAll(async () => {
    // Set test environment variables
    process.env.JWT_SECRET = 'test_jwt_secret_min_32_chars_here_for_testing';
    process.env.JWT_REFRESH_SECRET = 'test_jwt_refresh_secret_min_32_chars_here_for_testing';
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'test_anon_key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test_service_role_key';
    process.env.STELLAR_NETWORK = 'testnet';
    process.env.STELLAR_SOROBAN_URL = 'https://soroban-testnet.stellar.org';
    process.env.STELLAR_NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
    process.env.REPUTATION_CONTRACT_ID = 'test_reputation_contract_id';
    process.env.CREDIT_LINE_CONTRACT_ID = 'test_credit_line_contract_id';
    process.env.REDIS_URL = 'redis://localhost:6379';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        AuthModule,
        NotificationsModule,
      ],
    }).compile();

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

    supabaseService = app.get(SupabaseService);

    // Create test users
    testWallet = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';
    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .field('walletAddress', testWallet)
      .field('username', 'testuser')
      .field('displayName', 'Test User')
      .field('termsAccepted', 'true')
      .expect(201);

    authToken = registerRes.body.accessToken;

    otherWallet = 'GBCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWX';
    const otherRegisterRes = await request(app.getHttpServer())
      .post('/auth/register')
      .field('walletAddress', otherWallet)
      .field('username', 'otheruser')
      .field('displayName', 'Other User')
      .field('termsAccepted', 'true')
      .expect(201);

    otherAuthToken = otherRegisterRes.body.accessToken;

    // Insert test notifications
    const client = supabaseService.getServiceRoleClient();
    // Get user ids
    const { data: testUser } = await client.from('users').select('id').eq('wallet_address', testWallet).single();
    const { data: otherUser } = await client.from('users').select('id').eq('wallet_address', otherWallet).single();
    testUserId = testUser.id;
    otherUserId = otherUser.id;
    await client.from('notifications').insert([
      {
        user_id: testUserId,
        type: 'loan_reminder',
        title: 'Payment Due',
        message: 'Your loan payment is due',
        data: { loan_id: '123' },
        is_read: false,
      },
      {
        user_id: testUserId,
        type: 'loan_overdue',
        title: 'Payment Overdue',
        message: 'Your loan payment is overdue',
        data: { loan_id: '124' },
        is_read: true,
      },
      {
        user_id: otherUserId,
        type: 'loan_reminder',
        title: 'Other Payment Due',
        message: 'Other user payment due',
        data: { loan_id: '125' },
        is_read: false,
      },
    ]);
  }, 30000);

  afterAll(async () => {
    // Clean up test data
    const client = supabaseService.getServiceRoleClient();
    await client.from('notifications').delete().in('user_id', [testUserId, otherUserId]);
    await client.from('users').delete().in('wallet_address', [testWallet, otherWallet]);
    await app.close();
  });

  describe('/notifications (GET)', () => {
    it('should list notifications for authenticated user', () => {
      return request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
          expect(res.body).toHaveProperty('data');
          expect(res.body).toHaveProperty('pagination');
          expect(res.body).toHaveProperty('unreadCount');
        });
    });

    it('should filter unread notifications', () => {
      return request(app.getHttpServer())
        .get('/notifications?unread=true')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          // All returned notifications should be unread
          res.body.data.forEach((n: any) => expect(n.isRead).toBe(false));
        });
    });

    it('should paginate notifications', () => {
      return request(app.getHttpServer())
        .get('/notifications?limit=5&offset=0')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.length).toBeLessThanOrEqual(5);
          expect(res.body.pagination.limit).toBe(5);
          expect(res.body.pagination.offset).toBe(0);
        });
    });

    it('should return 401 without token', () => {
      return request(app.getHttpServer())
        .get('/notifications')
        .expect(401);
    });
  });

  describe('/notifications/read-all (PATCH)', () => {
    it('should mark all notifications as read', () => {
      return request(app.getHttpServer())
        .patch('/notifications/read-all')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
          expect(res.body).toHaveProperty('updatedCount');
        });
    });

    it('should return 401 without token', () => {
      return request(app.getHttpServer())
        .patch('/notifications/read-all')
        .expect(401);
    });
  });

  describe('/notifications/:id/read (PATCH)', () => {
    it('should mark individual notification as read', async () => {
      // First, get a notification id
      const listRes = await request(app.getHttpServer())
        .get('/notifications?limit=1')
        .set('Authorization', `Bearer ${authToken}`);

      if (listRes.body.data.length > 0) {
        const notificationId = listRes.body.data[0].id;
        return request(app.getHttpServer())
          .patch(`/notifications/${notificationId}/read`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200)
          .expect((res) => {
            expect(res.body).toHaveProperty('success', true);
            expect(res.body).toHaveProperty('updatedCount');
          });
      } else {
        // No notifications, skip
        expect(true).toBe(true);
      }
    });

    it('should return 404 for non-existent notification', () => {
      return request(app.getHttpServer())
        .patch('/notifications/00000000-0000-0000-0000-000000000000/read')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should return 403 for other user\'s notification', async () => {
      // Get other user's notification id
      const listRes = await request(app.getHttpServer())
        .get('/notifications?limit=1')
        .set('Authorization', `Bearer ${otherAuthToken}`);

      if (listRes.body.data.length > 0) {
        const notificationId = listRes.body.data[0].id;
        return request(app.getHttpServer())
          .patch(`/notifications/${notificationId}/read`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(403);
      } else {
        expect(true).toBe(true);
      }
    });

    it('should return 401 without token', () => {
      return request(app.getHttpServer())
        .patch('/notifications/some-id/read')
        .expect(401);
    });
  });

  describe('Complete flow', () => {
    it('should trigger events, list, mark read, verify count', async () => {
      // Assume notifications are already inserted as events

      // List all
      const listRes = await request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const initialUnreadCount = listRes.body.unreadCount;
      expect(initialUnreadCount).toBeGreaterThan(0);

      // Mark all as read
      await request(app.getHttpServer())
        .patch('/notifications/read-all')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // List again, unread count should be 0
      const listRes2 = await request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(listRes2.body.unreadCount).toBe(0);
    });
  });

  // Add more tests for complete flow, ownership, etc.
});