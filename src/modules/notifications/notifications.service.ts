import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.client';
import { NotificationListQueryDto } from './dto/notification-list-query.dto';
import {
  NotificationItemDto,
  NotificationListResponseDto,
} from './dto/notification-list-response.dto';
import { MarkAsReadResponseDto } from './dto/mark-as-read-response.dto';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async getNotifications(
    wallet: string,
    query: NotificationListQueryDto,
  ): Promise<NotificationListResponseDto> {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const client = this.supabaseService.getServiceRoleClient();

    // Get user_id from wallet
    const { data: user, error: userError } = await client
      .from('users')
      .select('id')
      .eq('wallet_address', wallet)
      .single();

    if (userError || !user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }

    const userId = user.id;

    let notificationsQuery = client
      .from('notifications')
      .select('id, type, title, message, data, is_read, created_at, read_at', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (query.unread === true) {
      notificationsQuery = notificationsQuery.eq('is_read', false);
    }

    const { data: notifications, error, count } = await notificationsQuery;

    if (error) {
      this.logger.error(`Failed to fetch notifications for ${wallet}: ${error.message}`);
      throw new Error(error.message);
    }

    const { count: unreadCount, error: unreadError } = await client
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (unreadError) {
      this.logger.error(`Failed to fetch unread count for ${wallet}: ${unreadError.message}`);
      throw new Error(unreadError.message);
    }

    const data: NotificationItemDto[] = (notifications ?? []).map((n) => ({
      id: n.id,
      type: n.type,
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
        total: count ?? 0,
      },
      unreadCount: unreadCount ?? 0,
    };
  }

  async markAsRead(wallet: string, notificationId: string): Promise<MarkAsReadResponseDto> {
    const client = this.supabaseService.getServiceRoleClient();

    // Get user_id from wallet
    const { data: user, error: userError } = await client
      .from('users')
      .select('id')
      .eq('wallet_address', wallet)
      .single();

    if (userError || !user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }

    const userId = user.id;

    const { data: notification, error: fetchError } = await client
      .from('notifications')
      .select('id, user_id, is_read')
      .eq('id', notificationId)
      .single();

    if (fetchError || !notification) {
      throw new NotFoundException({
        code: 'NOTIFICATION_NOT_FOUND',
        message: 'Notification not found',
      });
    }

    if (notification.user_id !== userId) {
      throw new ForbiddenException({
        code: 'NOTIFICATION_FORBIDDEN',
        message: 'You do not have permission to update this notification',
      });
    }

    if (notification.is_read) {
      return { success: true, updatedCount: 0 };
    }

    const now = new Date().toISOString();
    const { error: updateError } = await client
      .from('notifications')
      .update({ is_read: true, read_at: now, updated_at: now })
      .eq('id', notificationId);

    if (updateError) {
      this.logger.error(`Failed to mark notification ${notificationId} as read: ${updateError.message}`);
      throw new Error(updateError.message);
    }

    return { success: true, updatedCount: 1 };
  }

  async markAllAsRead(wallet: string): Promise<MarkAsReadResponseDto> {
    const client = this.supabaseService.getServiceRoleClient();

    // Get user_id from wallet
    const { data: user, error: userError } = await client
      .from('users')
      .select('id')
      .eq('wallet_address', wallet)
      .single();

    if (userError || !user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }

    const userId = user.id;

    const now = new Date().toISOString();
    const { data, error } = await client
      .from('notifications')
      .update({ is_read: true, read_at: now, updated_at: now })
      .eq('user_id', userId)
      .eq('is_read', false)
      .select('id');

    if (error) {
      this.logger.error(`Failed to mark all notifications as read for ${wallet}: ${error.message}`);
      throw new Error(error.message);
    }

    return { success: true, updatedCount: data?.length ?? 0 };
  }
}
