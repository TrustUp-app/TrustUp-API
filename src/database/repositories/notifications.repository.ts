import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { SupabaseService } from "../supabase.client";

export interface NotificationRecord {
  id: string;
  user_wallet: string;
  type: string;
  title: string;
  message: string;
  data: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
}

@Injectable()
export class NotificationsRepository {
  constructor(private readonly supabaseService: SupabaseService) {}

  async findByUser(
    wallet: string,
    options: { limit: number; offset: number; unread?: boolean; type?: string },
  ): Promise<{ notifications: NotificationRecord[]; total: number }> {
    let query = this.supabaseService
      .getServiceRoleClient()
      .from("notifications")
      .select("id, type, title, message, data, is_read, created_at, read_at", {
        count: "exact",
      })
      .eq("user_wallet", wallet)
      .order("created_at", { ascending: false })
      .range(options.offset, options.offset + options.limit - 1);

    if (options.unread) query = query.eq("is_read", false);
    if (options.type) query = query.eq("type", options.type);

    const { data, error, count } = await query;
    this.throwOnError(error);
    return {
      notifications: (data ?? []) as NotificationRecord[],
      total: count ?? 0,
    };
  }

  async findById(
    id: string,
  ): Promise<Pick<
    NotificationRecord,
    "id" | "user_wallet" | "is_read"
  > | null> {
    const { data, error } = await this.supabaseService
      .getServiceRoleClient()
      .from("notifications")
      .select("id, user_wallet, is_read")
      .eq("id", id)
      .maybeSingle();

    this.throwOnError(error);
    return data as Pick<
      NotificationRecord,
      "id" | "user_wallet" | "is_read"
    > | null;
  }

  async countUnread(wallet: string): Promise<number> {
    const { count, error } = await this.supabaseService
      .getServiceRoleClient()
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_wallet", wallet)
      .eq("is_read", false);

    this.throwOnError(error);
    return count ?? 0;
  }

  async markAsRead(id: string, now: string): Promise<void> {
    const { error } = await this.supabaseService
      .getServiceRoleClient()
      .from("notifications")
      .update({ is_read: true, read_at: now, updated_at: now })
      .eq("id", id);

    this.throwOnError(error);
  }

  async markAllAsRead(wallet: string, now: string): Promise<number> {
    const { data, error } = await this.supabaseService
      .getServiceRoleClient()
      .from("notifications")
      .update({ is_read: true, read_at: now, updated_at: now })
      .eq("user_wallet", wallet)
      .eq("is_read", false)
      .select("id");

    this.throwOnError(error);
    return data?.length ?? 0;
  }

  async create(
    notification: Omit<NotificationRecord, "id" | "created_at" | "read_at">,
  ): Promise<void> {
    const { error } = await this.supabaseService
      .getServiceRoleClient()
      .from("notifications")
      .insert(notification);

    this.throwOnError(error);
  }

  private throwOnError(error: { message?: string } | null): void {
    if (error) {
      throw new InternalServerErrorException({
        code: "DATABASE_QUERY_ERROR",
        message: error.message,
      });
    }
  }
}
