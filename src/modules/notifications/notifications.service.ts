import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { NotificationsRepository } from "../../database/repositories/notifications.repository";
import { NotificationListQueryDto } from "./dto/notification-list-query.dto";
import {
  NotificationItemDto,
  NotificationListResponseDto,
} from "./dto/notification-list-response.dto";
import { MarkAsReadResponseDto } from "./dto/mark-as-read-response.dto";

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly notificationsRepository: NotificationsRepository,
  ) {}

  async getNotifications(
    wallet: string,
    query: NotificationListQueryDto,
  ): Promise<NotificationListResponseDto> {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const [{ notifications, total }, unreadCount] = await Promise.all([
      this.notificationsRepository.findByUser(wallet, {
        limit,
        offset,
        unread: query.unread,
        type: query.type,
      }),
      this.notificationsRepository.countUnread(wallet),
    ]);

    const data: NotificationItemDto[] = (notifications ?? []).map((n) => ({
      id: n.id,
      type: n.type as NotificationItemDto["type"],
      title: n.title,
      message: n.message,
      data: n.data ?? {},
      isRead: n.is_read,
      createdAt: n.created_at,
      readAt: n.read_at ?? null,
    }));

    return {
      data,
      pagination: {
        limit,
        offset,
        total,
      },
      unreadCount,
    };
  }

  async markAsRead(
    wallet: string,
    notificationId: string,
  ): Promise<MarkAsReadResponseDto> {
    const notification =
      await this.notificationsRepository.findById(notificationId);

    if (!notification) {
      throw new NotFoundException({
        code: "NOTIFICATION_NOT_FOUND",
        message: "Notification not found",
      });
    }

    if (notification.user_wallet !== wallet) {
      throw new ForbiddenException({
        code: "NOTIFICATION_FORBIDDEN",
        message: "You do not have permission to update this notification",
      });
    }

    if (notification.is_read) {
      return { success: true, updatedCount: 0 };
    }

    const now = new Date().toISOString();
    await this.notificationsRepository.markAsRead(notificationId, now);

    return { success: true, updatedCount: 1 };
  }

  async markAllAsRead(wallet: string): Promise<MarkAsReadResponseDto> {
    const now = new Date().toISOString();
    const updatedCount = await this.notificationsRepository.markAllAsRead(
      wallet,
      now,
    );

    return { success: true, updatedCount };
  }
}
