import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { NotificationsService } from '../../../../src/modules/notifications/notifications.service';
import { SupabaseService } from '../../../../src/database/supabase.client';
import { NotificationListQueryDto } from '../../../../src/modules/notifications/dto/notification-list-query.dto';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let mockSupabaseClient: any;
  let mockSupabaseService: any;

  const validWallet = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';
  const notificationId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

  const mockNotifications = [
    {
      id: 'notif-1',
      type: 'loan_reminder',
      title: 'Payment Due Soon',
      message: 'Your loan payment of $150.00 is due in 3 days.',
      data: { loan_id: 'loan123', amount: 150 },
      is_read: false,
      created_at: '2026-03-20T10:00:00.000Z',
      read_at: null,
      user_wallet: validWallet,
    },
    {
      id: 'notif-2',
      type: 'loan_completed',
      title: 'Loan Completed',
      message: 'Your loan has been successfully completed.',
      data: { loan_id: 'loan456', amount: 200 },
      is_read: true,
      created_at: '2026-03-19T15:30:00.000Z',
      read_at: '2026-03-19T16:00:00.000Z',
      user_wallet: validWallet,
    },
    {
      id: 'notif-3',
      type: 'reputation_changed',
      title: 'Reputation Updated',
      message: 'Your reputation score has increased.',
      data: { old_score: 750, new_score: 780 },
      is_read: false,
      created_at: '2026-03-18T09:15:00.000Z',
      read_at: null,
      user_wallet: validWallet,
    },
  ];

  beforeEach(async () => {
    // Mock Supabase client chain
    const mockSelect = jest.fn();
    const mockEq = jest.fn();
    const mockOrder = jest.fn();
    const mockRange = jest.fn();
    const mockSingle = jest.fn();
    const mockUpdate = jest.fn();
    const mockFrom = jest.fn();

    mockSelect.mockReturnValue({ eq: mockEq, single: mockSingle });
    mockEq.mockReturnValue({ eq: mockEq, single: mockSingle, update: mockUpdate });
    mockOrder.mockReturnValue({ range: mockRange });
    mockRange.mockResolvedValue({ data: mockNotifications, error: null, count: 3 });
    mockSingle.mockResolvedValue({ data: mockNotifications[0], error: null });
    mockUpdate.mockReturnValue({ eq: mockEq, select: mockSelect });
    mockFrom.mockReturnValue({
      select: mockSelect,
      eq: mockEq,
      order: mockOrder,
      range: mockRange,
      update: mockUpdate,
    });

    mockSupabaseClient = {
      from: mockFrom,
    };

    mockSupabaseService = {
      getServiceRoleClient: jest.fn(() => mockSupabaseClient),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: SupabaseService, useValue: mockSupabaseService },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // getNotifications - Test notification listing functionality
  // ---------------------------------------------------------------------------
  describe('getNotifications', () => {
    const mockQuery: NotificationListQueryDto = {
      limit: 20,
      offset: 0,
    };

    it('should return paginated notifications with unread count', async () => {
      const mockNotificationsQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: mockNotifications,
          error: null,
          count: 3,
        }),
      };

      const mockUnreadQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          count: 2,
          error: null,
        }),
      };

      mockSupabaseClient.from
        .mockReturnValueOnce(mockNotificationsQuery)
        .mockReturnValueOnce(mockUnreadQuery);

      const result = await service.getNotifications(validWallet, mockQuery);

      expect(result).toEqual({
        data: expect.arrayContaining([
          expect.objectContaining({
            id: 'notif-1',
            type: 'loan_reminder',
            title: 'Payment Due Soon',
            message: 'Your loan payment of $150.00 is due in 3 days.',
            data: { loan_id: 'loan123', amount: 150 },
            isRead: false,
            createdAt: '2026-03-20T10:00:00.000Z',
            readAt: null,
          }),
        ]),
        pagination: {
          limit: 20,
          offset: 0,
          total: 3,
        },
        unreadCount: 2,
      });
    });

    it('should filter notifications by unread status when unread=true', async () => {
      const unreadQuery = { ...mockQuery, unread: true };
      const mockNotificationsQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockImplementation((field, value) => {
          if (field === 'user_wallet') return mockNotificationsQuery;
          if (field === 'is_read' && value === false) return mockNotificationsQuery;
          return mockNotificationsQuery;
        }),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: mockNotifications.filter(n => !n.is_read),
          error: null,
          count: 2,
        }),
      };

      const mockUnreadQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          count: 2,
          error: null,
        }),
      };

      mockSupabaseClient.from
        .mockReturnValueOnce(mockNotificationsQuery)
        .mockReturnValueOnce(mockUnreadQuery);

      const result = await service.getNotifications(validWallet, unreadQuery);

      expect(mockNotificationsQuery.eq).toHaveBeenCalledWith('is_read', false);
      expect(result.data).toHaveLength(2);
      expect(result.data.every(n => !n.isRead)).toBe(true);
    });

    it('should use default pagination when no limit/offset provided', async () => {
      const queryWithoutPagination = {};
      const mockNotificationsQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: mockNotifications,
          error: null,
          count: 3,
        }),
      };

      const mockUnreadQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          count: 2,
          error: null,
        }),
      };

      mockSupabaseClient.from
        .mockReturnValueOnce(mockNotificationsQuery)
        .mockReturnValueOnce(mockUnreadQuery);

      await service.getNotifications(validWallet, queryWithoutPagination);

      expect(mockNotificationsQuery.range).toHaveBeenCalledWith(0, 19);
    });

    it('should handle custom pagination correctly', async () => {
      const customQuery = { limit: 10, offset: 20 };
      const mockNotificationsQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: mockNotifications,
          error: null,
          count: 3,
        }),
      };

      const mockUnreadQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          count: 2,
          error: null,
        }),
      };

      mockSupabaseClient.from
        .mockReturnValueOnce(mockNotificationsQuery)
        .mockReturnValueOnce(mockUnreadQuery);

      await service.getNotifications(validWallet, customQuery);

      expect(mockNotificationsQuery.range).toHaveBeenCalledWith(20, 29);
    });

    it('should return empty list when user has no notifications', async () => {
      const mockNotificationsQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: [],
          error: null,
          count: 0,
        }),
      };

      const mockUnreadQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          count: 0,
          error: null,
        }),
      };

      mockSupabaseClient.from
        .mockReturnValueOnce(mockNotificationsQuery)
        .mockReturnValueOnce(mockUnreadQuery);

      const result = await service.getNotifications(validWallet, mockQuery);

      expect(result.data).toEqual([]);
      expect(result.pagination.total).toBe(0);
      expect(result.unreadCount).toBe(0);
    });

    it('should handle database errors when fetching notifications', async () => {
      const mockNotificationsQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database connection failed' },
          count: null,
        }),
      };

      mockSupabaseClient.from.mockReturnValue(mockNotificationsQuery);

      await expect(service.getNotifications(validWallet, mockQuery)).rejects.toThrow(
        'Database connection failed',
      );
    });

    it('should handle database errors when fetching unread count', async () => {
      const mockNotificationsQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: mockNotifications,
          error: null,
          count: 3,
        }),
      };

      const mockUnreadQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          count: null,
          error: { message: 'Unread count query failed' },
        }),
      };

      mockSupabaseClient.from
        .mockReturnValueOnce(mockNotificationsQuery)
        .mockReturnValueOnce(mockUnreadQuery);

      await expect(service.getNotifications(validWallet, mockQuery)).rejects.toThrow(
        'Unread count query failed',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // markAsRead - Test marking individual notification as read
  // ---------------------------------------------------------------------------
  describe('markAsRead', () => {
    it('should mark notification as read successfully', async () => {
      const mockFetchQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: notificationId,
            user_wallet: validWallet,
            is_read: false,
          },
          error: null,
        }),
      };

      const mockUpdateQuery = {
        eq: jest.fn().mockResolvedValue({
          error: null,
        }),
      };

      mockSupabaseClient.from
        .mockReturnValueOnce(mockFetchQuery)
        .mockReturnValueOnce({
          update: jest.fn().mockReturnValue(mockUpdateQuery),
        });

      const result = await service.markAsRead(validWallet, notificationId);

      expect(result).toEqual({ success: true, updatedCount: 1 });
      expect(mockFetchQuery.eq).toHaveBeenCalledWith('id', notificationId);
      expect(mockUpdateQuery.eq).toHaveBeenCalledWith('id', notificationId);
    });

    it('should return updatedCount: 0 when notification is already read', async () => {
      const mockFetchQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: notificationId,
            user_wallet: validWallet,
            is_read: true,
          },
          error: null,
        }),
      };

      mockSupabaseClient.from.mockReturnValue(mockFetchQuery);

      const result = await service.markAsRead(validWallet, notificationId);

      expect(result).toEqual({ success: true, updatedCount: 0 });
    });

    it('should throw NotFoundException when notification does not exist', async () => {
      const mockFetchQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'No rows found' },
        }),
      };

      mockSupabaseClient.from.mockReturnValue(mockFetchQuery);

      await expect(service.markAsRead(validWallet, 'non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when notification belongs to another user', async () => {
      const otherWallet = 'GBCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLM';
      const mockFetchQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: notificationId,
            user_wallet: otherWallet,
            is_read: false,
          },
          error: null,
        }),
      };

      mockSupabaseClient.from.mockReturnValue(mockFetchQuery);

      await expect(service.markAsRead(validWallet, notificationId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should handle database errors when updating notification', async () => {
      const mockFetchQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: notificationId,
            user_wallet: validWallet,
            is_read: false,
          },
          error: null,
        }),
      };

      const mockUpdateQuery = {
        eq: jest.fn().mockResolvedValue({
          error: { message: 'Update failed' },
        }),
      };

      mockSupabaseClient.from
        .mockReturnValueOnce(mockFetchQuery)
        .mockReturnValueOnce({
          update: jest.fn().mockReturnValue(mockUpdateQuery),
        });

      await expect(service.markAsRead(validWallet, notificationId)).rejects.toThrow(
        'Update failed',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // markAllAsRead - Test marking all notifications as read
  // ---------------------------------------------------------------------------
  describe('markAllAsRead', () => {
    it('should mark all unread notifications as read successfully', async () => {
      const mockUpdateQuery = {
        eq: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue({
          data: [
            { id: 'notif-1' },
            { id: 'notif-3' },
          ],
          error: null,
        }),
      };

      mockSupabaseClient.from.mockReturnValue({
        update: jest.fn().mockReturnValue(mockUpdateQuery),
      });

      const result = await service.markAllAsRead(validWallet);

      expect(result).toEqual({ success: true, updatedCount: 2 });
      expect(mockUpdateQuery.eq).toHaveBeenCalledWith('user_wallet', validWallet);
      expect(mockUpdateQuery.eq).toHaveBeenCalledWith('is_read', false);
    });

    it('should return updatedCount: 0 when no unread notifications exist', async () => {
      const mockUpdateQuery = {
        eq: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };

      mockSupabaseClient.from.mockReturnValue({
        update: jest.fn().mockReturnValue(mockUpdateQuery),
      });

      const result = await service.markAllAsRead(validWallet);

      expect(result).toEqual({ success: true, updatedCount: 0 });
    });

    it('should handle database errors when marking all as read', async () => {
      const mockUpdateQuery = {
        eq: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Bulk update failed' },
        }),
      };

      mockSupabaseClient.from.mockReturnValue({
        update: jest.fn().mockReturnValue(mockUpdateQuery),
      });

      await expect(service.markAllAsRead(validWallet)).rejects.toThrow(
        'Bulk update failed',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Edge Cases and Error Handling
  // ---------------------------------------------------------------------------
  describe('Edge Cases', () => {
    it('should handle null data in notifications gracefully', async () => {
      const notificationWithNullData = {
        ...mockNotifications[0],
        data: null,
      };

      const mockNotificationsQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: [notificationWithNullData],
          error: null,
          count: 1,
        }),
      };

      const mockUnreadQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          count: 1,
          error: null,
        }),
      };

      mockSupabaseClient.from
        .mockReturnValueOnce(mockNotificationsQuery)
        .mockReturnValueOnce(mockUnreadQuery);

      const result = await service.getNotifications(validWallet, { limit: 20, offset: 0 });

      expect(result.data[0].data).toEqual({});
    });

    it('should handle maximum pagination limits', async () => {
      const maxLimitQuery = { limit: 100, offset: 0 };
      const mockNotificationsQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: mockNotifications,
          error: null,
          count: 3,
        }),
      };

      const mockUnreadQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          count: 2,
          error: null,
        }),
      };

      mockSupabaseClient.from
        .mockReturnValueOnce(mockNotificationsQuery)
        .mockReturnValueOnce(mockUnreadQuery);

      await service.getNotifications(validWallet, maxLimitQuery);

      expect(mockNotificationsQuery.range).toHaveBeenCalledWith(0, 99);
    });

    it('should handle large offset values correctly', async () => {
      const largeOffsetQuery = { limit: 20, offset: 1000 };
      const mockNotificationsQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: [],
          error: null,
          count: 0,
        }),
      };

      const mockUnreadQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          count: 0,
          error: null,
        }),
      };

      mockSupabaseClient.from
        .mockReturnValueOnce(mockNotificationsQuery)
        .mockReturnValueOnce(mockUnreadQuery);

      await service.getNotifications(validWallet, largeOffsetQuery);

      expect(mockNotificationsQuery.range).toHaveBeenCalledWith(1000, 1019);
    });
  });

  // ---------------------------------------------------------------------------
  // Ownership Validation Tests
  // ---------------------------------------------------------------------------
  describe('Ownership Validation', () => {
    it('should validate wallet ownership in getNotifications', async () => {
      const mockNotificationsQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: mockNotifications,
          error: null,
          count: 3,
        }),
      };

      const mockUnreadQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          count: 2,
          error: null,
        }),
      };

      mockSupabaseClient.from
        .mockReturnValueOnce(mockNotificationsQuery)
        .mockReturnValueOnce(mockUnreadQuery);

      await service.getNotifications(validWallet, { limit: 20, offset: 0 });

      expect(mockNotificationsQuery.eq).toHaveBeenCalledWith('user_wallet', validWallet);
      expect(mockUnreadQuery.eq).toHaveBeenCalledWith('user_wallet', validWallet);
    });

    it('should validate wallet ownership in markAllAsRead', async () => {
      const mockUpdateQuery = {
        eq: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue({
          data: [{ id: 'notif-1' }],
          error: null,
        }),
      };

      mockSupabaseClient.from.mockReturnValue({
        update: jest.fn().mockReturnValue(mockUpdateQuery),
      });

      await service.markAllAsRead(validWallet);

      expect(mockUpdateQuery.eq).toHaveBeenCalledWith('user_wallet', validWallet);
    });
  });
});
