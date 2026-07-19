import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { NotificationsRepository } from "../../../../src/database/repositories/notifications.repository";
import { NotificationsService } from "../../../../src/modules/notifications/notifications.service";

describe("NotificationsService", () => {
  let service: NotificationsService;
  const wallet = "GUSER1234567890";
  const notification = {
    id: "notification-1",
    user_wallet: wallet,
    type: "loan_reminder",
    title: "Payment Due Soon",
    message: "Your loan payment is due in 3 days.",
    data: { loanId: "loan-1", amount: 108 },
    is_read: false,
    created_at: "2026-05-26T10:00:00.000Z",
    read_at: null,
  };
  const repository = {
    findByUser: jest.fn(),
    countUnread: jest.fn(),
    findById: jest.fn(),
    markAsRead: jest.fn(),
    markAllAsRead: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: NotificationsRepository, useValue: repository },
      ],
    }).compile();
    service = module.get(NotificationsService);
    jest.clearAllMocks();
  });

  it("lists notifications and unread count", async () => {
    repository.findByUser.mockResolvedValue({
      notifications: [notification],
      total: 1,
    });
    repository.countUnread.mockResolvedValue(3);

    await expect(service.getNotifications(wallet, {})).resolves.toEqual({
      data: [
        {
          id: notification.id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          data: notification.data,
          isRead: false,
          createdAt: notification.created_at,
          readAt: null,
        },
      ],
      pagination: { limit: 20, offset: 0, total: 1 },
      unreadCount: 3,
    });
    expect(repository.findByUser).toHaveBeenCalledWith(wallet, {
      limit: 20,
      offset: 0,
      unread: undefined,
      type: undefined,
    });
  });

  it("passes notification filters to the repository", async () => {
    repository.findByUser.mockResolvedValue({ notifications: [], total: 0 });
    repository.countUnread.mockResolvedValue(0);

    await service.getNotifications(wallet, {
      limit: 10,
      offset: 20,
      unread: true,
      type: "loan_reminder",
    });

    expect(repository.findByUser).toHaveBeenCalledWith(wallet, {
      limit: 10,
      offset: 20,
      unread: true,
      type: "loan_reminder",
    });
  });

  it("marks an owned unread notification as read", async () => {
    repository.findById.mockResolvedValue({
      id: notification.id,
      user_wallet: wallet,
      is_read: false,
    });

    await expect(service.markAsRead(wallet, notification.id)).resolves.toEqual({
      success: true,
      updatedCount: 1,
    });
    expect(repository.markAsRead).toHaveBeenCalledWith(
      notification.id,
      expect.any(String),
    );
  });

  it("does not update an already read notification", async () => {
    repository.findById.mockResolvedValue({
      id: notification.id,
      user_wallet: wallet,
      is_read: true,
    });

    await expect(service.markAsRead(wallet, notification.id)).resolves.toEqual({
      success: true,
      updatedCount: 0,
    });
    expect(repository.markAsRead).not.toHaveBeenCalled();
  });

  it("rejects missing and foreign notifications", async () => {
    repository.findById.mockResolvedValueOnce(null);
    await expect(service.markAsRead(wallet, notification.id)).rejects.toThrow(
      NotFoundException,
    );

    repository.findById.mockResolvedValueOnce({
      id: notification.id,
      user_wallet: "GOTHER",
      is_read: false,
    });
    await expect(service.markAsRead(wallet, notification.id)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("marks all unread notifications as read", async () => {
    repository.markAllAsRead.mockResolvedValue(2);

    await expect(service.markAllAsRead(wallet)).resolves.toEqual({
      success: true,
      updatedCount: 2,
    });
    expect(repository.markAllAsRead).toHaveBeenCalledWith(
      wallet,
      expect.any(String),
    );
  });
});
