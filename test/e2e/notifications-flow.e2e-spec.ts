/**
 * Notifications Flow E2E Test Suite
 *
 * Tests the notification system:
 * - Creating notifications (via job trigger)
 * - Retrieving user notifications
 * - Marking individual notifications as read
 * - Marking all notifications as read
 * - Filtering by read/unread status
 *
 * This test validates the notification delivery and management system.
 */

import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createE2ETestApp, createTestUser, cleanupTestData, authHeader, waitFor } from '../helpers/e2e.helpers';
import { createNotificationData, expectedNotificationStructure } from '../fixtures/e2e.fixtures';

describe('Notifications Flow (E2E)', () => {
  let app: INestApplication;
  let testWallets: string[] = [];

  beforeAll(async () => {
    app = await createE2ETestApp();
  });

  afterAll(async () => {
    await cleanupTestData(app, testWallets);
    await app.close();
  });

  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  describe('Get Notifications', () => {
    it('should retrieve paginated notifications for authenticated user', async () => {
      const user = await createTestUser(app);
      testWallets.push(user.wallet);

      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/notifications',
          headers: authHeader(user.accessToken),
        });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      
      expect(data.success).toBe(true);
      expect(data.data).toBeInstanceOf(Array);
      expect(data).toHaveProperty('total');
      expect(data).toHaveProperty('unreadCount');
      expect(data).toHaveProperty('limit');
      expect(data).toHaveProperty('offset');
      
      // Verify unreadCount is a number
      expect(typeof data.unreadCount).toBe('number');
    });

    it('should filter notifications by unread status', async () => {
      const user = await createTestUser(app);
      testWallets.push(user.wallet);

      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/notifications?unread=true',
          headers: authHeader(user.accessToken),
        });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      
      expect(data.success).toBe(true);
      
      // All notifications should be unread
      data.data.forEach((notification: any) => {
        expect(notification.isRead).toBe(false);
      });
    });

    it('should support pagination parameters', async () => {
      const user = await createTestUser(app);
      testWallets.push(user.wallet);

      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/notifications?limit=5&offset=0',
          headers: authHeader(user.accessToken),
        });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      
      expect(data.success).toBe(true);
      expect(data.limit).toBe(5);
      expect(data.offset).toBe(0);
      expect(data.data.length).toBeLessThanOrEqual(5);
    });

    it('should require authentication', async () => {
      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/notifications',
        });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('Mark Notification as Read', () => {
    it('should mark a single notification as read', async () => {
      const user = await createTestUser(app);
      testWallets.push(user.wallet);

      // First, create a notification for this user
      const configService = app.get(ConfigService);
      const { createClient } = await import('@supabase/supabase-js');
      
      const supabase = createClient(
        configService.get<string>('SUPABASE_URL')!,
        configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
      );

      const notificationData = createNotificationData({
        type: 'loan_reminder',
        title: 'Test Notification',
        message: 'This is a test notification',
      });

      const { data: notification } = await supabase
        .from('notifications')
        .insert({
          wallet_address: user.wallet,
          type: notificationData.type,
          title: notificationData.title,
          message: notificationData.message,
          metadata: notificationData.metadata,
          is_read: false,
        })
        .select()
        .single();

      expect(notification).toBeDefined();
      const notificationId = notification!.id;

      // Now mark it as read
      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PATCH',
          url: `/notifications/${notificationId}/read`,
          headers: authHeader(user.accessToken),
        });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      
      expect(data.success).toBe(true);
      expect(data.message).toContain('marked as read');
    });

    it('should return 404 for non-existent notification', async () => {
      const user = await createTestUser(app);
      testWallets.push(user.wallet);

      const fakeId = '00000000-0000-0000-0000-000000000000';

      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PATCH',
          url: `/notifications/${fakeId}/read`,
          headers: authHeader(user.accessToken),
        });

      expect(response.statusCode).toBe(404);
    });

    it('should require authentication', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PATCH',
          url: `/notifications/${fakeId}/read`,
        });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('Mark All Notifications as Read', () => {
    it('should mark all unread notifications as read', async () => {
      const user = await createTestUser(app);
      testWallets.push(user.wallet);

      // Create multiple notifications
      const configService = app.get(ConfigService);
      const { createClient } = await import('@supabase/supabase-js');
      
      const supabase = createClient(
        configService.get<string>('SUPABASE_URL')!,
        configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
      );

      const notifications = [
        createNotificationData({ title: 'Notification 1' }),
        createNotificationData({ title: 'Notification 2' }),
        createNotificationData({ title: 'Notification 3' }),
      ];

      for (const notif of notifications) {
        await supabase.from('notifications').insert({
          wallet_address: user.wallet,
          type: notif.type,
          title: notif.title,
          message: notif.message,
          metadata: notif.metadata,
          is_read: false,
        });
      }

      // Mark all as read
      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PATCH',
          url: '/notifications/read-all',
          headers: authHeader(user.accessToken),
        });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      
      expect(data.success).toBe(true);
      expect(data.message).toContain('marked as read');

      // Verify all are read
      const checkResponse = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/notifications?unread=true',
          headers: authHeader(user.accessToken),
        });

      const checkData = JSON.parse(checkResponse.payload);
      expect(checkData.unreadCount).toBe(0);
    });

    it('should require authentication', async () => {
      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PATCH',
          url: '/notifications/read-all',
        });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('Complete Notification Flow', () => {
    it('should complete notification lifecycle: create → retrieve → mark read → verify', async () => {
      const user = await createTestUser(app, {
        username: `notif_user_${Date.now()}`,
        displayName: 'Notification Test User',
      });
      testWallets.push(user.wallet);

      // Step 1: Create notification manually (simulating job trigger)
      const configService = app.get(ConfigService);
      const { createClient } = await import('@supabase/supabase-js');
      
      const supabase = createClient(
        configService.get<string>('SUPABASE_URL')!,
        configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
      );

      const notificationData = createNotificationData({
        type: 'loan_reminder',
        title: 'Payment Due Soon',
        message: 'Your loan payment is due in 3 days',
      });

      const { data: notification } = await supabase
        .from('notifications')
        .insert({
          wallet_address: user.wallet,
          type: notificationData.type,
          title: notificationData.title,
          message: notificationData.message,
          metadata: { loanId: 'test-loan-id', daysUntilDue: 3 },
          is_read: false,
        })
        .select()
        .single();

      expect(notification).toBeDefined();
      const notificationId = notification!.id;

      // Step 2: Retrieve notifications
      const getResponse = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/notifications',
          headers: authHeader(user.accessToken),
        });

      expect(getResponse.statusCode).toBe(200);
      const getData = JSON.parse(getResponse.payload);
      
      expect(getData.success).toBe(true);
      expect(getData.data.length).toBeGreaterThan(0);
      expect(getData.unreadCount).toBeGreaterThan(0);
      
      const createdNotification = getData.data.find((n: any) => n.id === notificationId);
      expect(createdNotification).toBeDefined();
      expect(createdNotification.isRead).toBe(false);
      expect(createdNotification).toMatchObject(expectedNotificationStructure);

      // Step 3: Mark as read
      const markReadResponse = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PATCH',
          url: `/notifications/${notificationId}/read`,
          headers: authHeader(user.accessToken),
        });

      expect(markReadResponse.statusCode).toBe(200);

      // Step 4: Verify it's marked as read
      const verifyResponse = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/notifications',
          headers: authHeader(user.accessToken),
        });

      const verifyData = JSON.parse(verifyResponse.payload);
      const readNotification = verifyData.data.find((n: any) => n.id === notificationId);
      
      expect(readNotification).toBeDefined();
      expect(readNotification.isRead).toBe(true);
    });

    it('should show correct unread count badge', async () => {
      const user = await createTestUser(app);
      testWallets.push(user.wallet);

      // Create some notifications
      const configService = app.get(ConfigService);
      const { createClient } = await import('@supabase/supabase-js');
      
      const supabase = createClient(
        configService.get<string>('SUPABASE_URL')!,
        configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
      );

      // Create 3 unread notifications
      for (let i = 0; i < 3; i++) {
        await supabase.from('notifications').insert({
          wallet_address: user.wallet,
          type: 'loan_reminder',
          title: `Notification ${i + 1}`,
          message: 'Test message',
          metadata: {},
          is_read: false,
        });
      }

      // Get notifications
      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/notifications',
          headers: authHeader(user.accessToken),
        });

      const data = JSON.parse(response.payload);
      expect(data.unreadCount).toBe(3);

      // Mark all as read
      await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'PATCH',
          url: '/notifications/read-all',
          headers: authHeader(user.accessToken),
        });

      // Check count is now zero
      const afterResponse = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/notifications',
          headers: authHeader(user.accessToken),
        });

      const afterData = JSON.parse(afterResponse.payload);
      expect(afterData.unreadCount).toBe(0);
    });
  });
});
