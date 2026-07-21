import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SupabaseService } from '../../../../src/database/supabase.client';
import { NotificationsRepository } from '../../../../src/database/repositories/notifications.repository';
import { NotificationsService } from '../../../../src/modules/notifications/notifications.service';

type SupabaseResult<T> = {
  data?: T;
  error?: { message: string } | null;
  count?: number | null;
};

function createQueryBuilder<T>(result: SupabaseResult<T>) {
  const query: Record<string, jest.Mock> = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(result),
    maybeSingle: jest.fn().mockResolvedValue(result),
    then: jest.fn((resolve, reject) =>
      Promise.resolve(result).then(resolve, reject),
    ),
  };

  return query;
}

describe('NotificationsService', () => {
  let service: NotificationsService;

  const wallet = 'GUSER1234567890';
  const otherWallet = 'GOTHER1234567890';
  const now = '2026-05-27T10:00:00.000Z';

  const mockSupabaseService = {
    getServiceRoleClient: jest.fn(),
  };

  const mockNotification = {
    id: 'notification-1',
    type: 'loan_reminder',
    title: 'Payment Due Soon',
    message: 'Your loan payment is due in 3 days.',
    data: { loanId: 'loan-1', amount: 108 },
    is_read: false,
    created_at: '2026-05-26T10:00:00.000Z',
    read_at: null,
  };

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(new Date(now));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: SupabaseService, useValue: mockSupabaseService },
        NotificationsRepository,
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  function mockClientWithQueries(...queries: Record<string, jest.Mock>[]) {
    const client = {
      from: jest.fn(() => {
        const query = queries.shift();
        if (!query) {
          throw new Error('Unexpected Supabase query');
        }
        return query;
      }),
    };

    mockSupabaseService.getServiceRoleClient.mockReturnValue(client);
    return client;
  }

  describe('getNotifications', () => {
    function setupListQuery(
      notifications: unknown[] = [mockNotification],
      count = notifications.length,
      unreadCount = 3,
    ) {
      const listQuery = createQueryBuilder({
        data: notifications,
        error: null,
        count,
      });
      const unreadCountQuery = createQueryBuilder({
        data: null,
        error: null,
        count: unreadCount,
      });
      const client = mockClientWithQueries(listQuery, unreadCountQuery);

      return { client, listQuery, unreadCountQuery };
    }

    it('lists notifications for a user with default pagination and unread count', async () => {
      const { client, listQuery, unreadCountQuery } = setupListQuery();

      const result = await service.getNotifications(wallet, {});

      expect(client.from).toHaveBeenCalledWith('notifications');
      expect(listQuery.select).toHaveBeenCalledWith(
        'id, type, title, message, data, is_read, created_at, read_at',
        { count: 'exact' },
      );
      expect(listQuery.eq).toHaveBeenCalledWith('user_wallet', wallet);
      expect(listQuery.order).toHaveBeenCalledWith('created_at', {
        ascending: false,
      });
      expect(listQuery.range).toHaveBeenCalledWith(0, 19);
      expect(unreadCountQuery.select).toHaveBeenCalledWith('id', {
        count: 'exact',
        head: true,
      });
      expect(unreadCountQuery.eq).toHaveBeenCalledWith('user_wallet', wallet);
      expect(unreadCountQuery.eq).toHaveBeenCalledWith('is_read', false);
      expect(result).toEqual({
        data: [
          {
            id: 'notification-1',
            type: 'loan_reminder',
            title: 'Payment Due Soon',
            message: 'Your loan payment is due in 3 days.',
            data: { loanId: 'loan-1', amount: 108 },
            isRead: false,
            createdAt: '2026-05-26T10:00:00.000Z',
            readAt: null,
          },
        ],
        pagination: {
          limit: 20,
          offset: 0,
          total: 1,
        },
        unreadCount: 3,
      });
    });

    it('filters notifications by unread status', async () => {
      const { listQuery } = setupListQuery();

      await service.getNotifications(wallet, { unread: true });

      expect(listQuery.eq).toHaveBeenCalledWith('is_read', false);
    });

    it('does not apply an unread filter when unread is false', async () => {
      const { listQuery } = setupListQuery();

      await service.getNotifications(wallet, { unread: false });

      expect(listQuery.eq).not.toHaveBeenCalledWith('is_read', false);
    });

    it('filters notifications by type', async () => {
      const { listQuery } = setupListQuery();

      await service.getNotifications(wallet, { type: 'loan_reminder' });

      expect(listQuery.eq).toHaveBeenCalledWith('type', 'loan_reminder');
    });

    it('applies limit and offset pagination', async () => {
      const { listQuery } = setupListQuery([mockNotification], 25, 4);

      const result = await service.getNotifications(wallet, {
        limit: 10,
        offset: 20,
      });

      expect(listQuery.range).toHaveBeenCalledWith(20, 29);
      expect(result.pagination).toEqual({
        limit: 10,
        offset: 20,
        total: 25,
      });
    });

    it('returns empty data and zero totals when no notifications exist', async () => {
      const { listQuery } = setupListQuery([], 0, 0);

      const result = await service.getNotifications(wallet, {});

      expect(listQuery.range).toHaveBeenCalledWith(0, 19);
      expect(result).toEqual({
        data: [],
        pagination: {
          limit: 20,
          offset: 0,
          total: 0,
        },
        unreadCount: 0,
      });
    });

    it('uses an empty object when notification data is null', async () => {
      setupListQuery([
        {
          ...mockNotification,
          data: null,
          read_at: '2026-05-27T09:00:00.000Z',
        },
      ]);

      const result = await service.getNotifications(wallet, {});

      expect(result.data[0]).toMatchObject({
        data: {},
        readAt: '2026-05-27T09:00:00.000Z',
      });
    });

    it('throws when the notification list query fails', async () => {
      const listQuery = createQueryBuilder({
        data: null,
        error: { message: 'list failed' },
        count: null,
      });
      const unreadCountQuery = createQueryBuilder({
        data: null,
        error: null,
        count: 0,
      });
      mockClientWithQueries(listQuery, unreadCountQuery);

      await expect(service.getNotifications(wallet, {})).rejects.toThrow(
        'list failed',
      );
    });

    it('throws when unread count calculation fails', async () => {
      const listQuery = createQueryBuilder({
        data: [mockNotification],
        error: null,
        count: 1,
      });
      const unreadCountQuery = createQueryBuilder({
        data: null,
        error: { message: 'count failed' },
        count: null,
      });
      mockClientWithQueries(listQuery, unreadCountQuery);

      await expect(service.getNotifications(wallet, {})).rejects.toThrow(
        'count failed',
      );
    });
  });

  describe('markAsRead', () => {
    it('marks an owned unread notification as read', async () => {
      const fetchQuery = createQueryBuilder({
        data: { id: 'notification-1', user_wallet: wallet, is_read: false },
        error: null,
      });
      const updateQuery = createQueryBuilder({ error: null });
      mockClientWithQueries(fetchQuery, updateQuery);

      const result = await service.markAsRead(wallet, 'notification-1');

      expect(fetchQuery.select).toHaveBeenCalledWith(
        'id, user_wallet, is_read',
      );
      expect(fetchQuery.eq).toHaveBeenCalledWith('id', 'notification-1');
      expect(updateQuery.update).toHaveBeenCalledWith({
        is_read: true,
        read_at: now,
        updated_at: now,
      });
      expect(updateQuery.eq).toHaveBeenCalledWith('id', 'notification-1');
      expect(result).toEqual({ success: true, updatedCount: 1 });
    });

    it('returns zero updates when an owned notification is already read', async () => {
      const fetchQuery = createQueryBuilder({
        data: { id: 'notification-1', user_wallet: wallet, is_read: true },
        error: null,
      });
      mockClientWithQueries(fetchQuery);

      const result = await service.markAsRead(wallet, 'notification-1');

      expect(result).toEqual({ success: true, updatedCount: 0 });
    });

    it('validates notification ownership before updating', async () => {
      const fetchQuery = createQueryBuilder({
        data: {
          id: 'notification-1',
          user_wallet: otherWallet,
          is_read: false,
        },
        error: null,
      });
      mockClientWithQueries(fetchQuery);

      await expect(
        service.markAsRead(wallet, 'notification-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException for non-existent notification IDs', async () => {
      const fetchQuery = createQueryBuilder({
        data: null,
        error: null,
      });
      mockClientWithQueries(fetchQuery);

      await expect(
        service.markAsRead(wallet, 'missing-notification'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws when updating an unread notification fails', async () => {
      const fetchQuery = createQueryBuilder({
        data: { id: 'notification-1', user_wallet: wallet, is_read: false },
        error: null,
      });
      const updateQuery = createQueryBuilder({
        error: { message: 'update failed' },
      });
      mockClientWithQueries(fetchQuery, updateQuery);

      await expect(
        service.markAsRead(wallet, 'notification-1'),
      ).rejects.toThrow('update failed');
    });
  });

  describe('markAllAsRead', () => {
    it('marks all unread notifications for a user as read', async () => {
      const updateQuery = createQueryBuilder({
        data: [{ id: 'notification-1' }, { id: 'notification-2' }],
        error: null,
      });
      mockClientWithQueries(updateQuery);

      const result = await service.markAllAsRead(wallet);

      expect(updateQuery.update).toHaveBeenCalledWith({
        is_read: true,
        read_at: now,
        updated_at: now,
      });
      expect(updateQuery.eq).toHaveBeenCalledWith('user_wallet', wallet);
      expect(updateQuery.eq).toHaveBeenCalledWith('is_read', false);
      expect(updateQuery.select).toHaveBeenCalledWith('id');
      expect(result).toEqual({ success: true, updatedCount: 2 });
    });

    it('returns zero when no unread notifications exist', async () => {
      const updateQuery = createQueryBuilder({
        data: [],
        error: null,
      });
      mockClientWithQueries(updateQuery);

      const result = await service.markAllAsRead(wallet);

      expect(result).toEqual({ success: true, updatedCount: 0 });
    });

    it('throws when marking all notifications as read fails', async () => {
      const updateQuery = createQueryBuilder({
        data: null,
        error: { message: 'bulk update failed' },
      });
      mockClientWithQueries(updateQuery);

      await expect(service.markAllAsRead(wallet)).rejects.toThrow(
        'bulk update failed',
      );
    });
  });
});
