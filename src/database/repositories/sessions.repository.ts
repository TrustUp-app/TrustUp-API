import { Injectable } from '@nestjs/common';
import { BaseRepository } from './base.repository';

export interface SessionRecord {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  device_info: string | null;
  ip_address: string | null;
  expires_at: string;
  created_at: string;
  token_family: string;
  revoked_at: string | null;
}

/**
 * Encapsulates all Supabase queries for the `sessions` table.
 */
@Injectable()
export class SessionsRepository extends BaseRepository {
  /**
   * Finds a session by its refresh token hash.
   */
  async findByHash(hash: string): Promise<SessionRecord | null> {
    const { data, error } = await this.supabaseService
      .getServiceRoleClient()
      .from('sessions')
      .select(
        'id, user_id, refresh_token_hash, device_info, ip_address, expires_at, created_at, token_family, revoked_at',
      )
      .eq('refresh_token_hash', hash)
      .maybeSingle();

    this.throwOnError(error);
    return data;
  }

  /**
   * Creates a new session record.
   */
  async create(session: {
    userId: string;
    refreshTokenHash: string;
    expiresAt: string;
    tokenFamily?: string;
    deviceInfo?: string;
    ipAddress?: string;
  }): Promise<SessionRecord> {
    const insertData: {
      user_id: string;
      refresh_token_hash: string;
      expires_at: string;
      token_family?: string;
      device_info?: string;
      ip_address?: string;
    } = {
      user_id: session.userId,
      refresh_token_hash: session.refreshTokenHash,
      expires_at: session.expiresAt,
    };
    if (session.tokenFamily) {
      insertData.token_family = session.tokenFamily;
    }
    if (session.deviceInfo) {
      insertData.device_info = session.deviceInfo;
    }
    if (session.ipAddress) {
      insertData.ip_address = session.ipAddress;
    }

    const { data, error } = await this.supabaseService
      .getServiceRoleClient()
      .from('sessions')
      .insert(insertData)
      .select('*')
      .single();

    this.throwOnError(error);
    return data;
  }

  /**
   * Deletes a session by its ID.
   */
  async delete(id: string): Promise<void> {
    const { error } = await this.supabaseService
      .getServiceRoleClient()
      .from('sessions')
      .delete()
      .eq('id', id);

    this.throwOnError(error);
  }

  /**
   * Deletes a session by its refresh token hash.
   */
  async deleteByHash(hash: string): Promise<void> {
    const { error } = await this.supabaseService
      .getServiceRoleClient()
      .from('sessions')
      .delete()
      .eq('refresh_token_hash', hash);

    this.throwOnError(error);
  }

  /**
   * Revokes all still-active sessions belonging to the given token family.
   * This is used to invalidate the family if a reused refresh token is detected,
   * and to end a single device's session (one family = one login/device).
   * Rows that are already revoked/rotated keep their original `revoked_at`.
   */
  async revokeFamily(tokenFamily: string): Promise<void> {
    const { error } = await this.supabaseService
      .getServiceRoleClient()
      .from('sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token_family', tokenFamily)
      .is('revoked_at', null);

    this.throwOnError(error);
  }

  /**
   * Marks a session as rotated (consumed) by setting `revoked_at`, but only if
   * it is still active. The row is kept so that a later replay of its refresh
   * token is detected as reuse.
   *
   * The conditional update makes rotation atomic: when two requests race with the
   * same refresh token, only one of them can claim the row.
   *
   * @returns true if this call claimed the session, false if it was already revoked
   */
  async markRotated(id: string): Promise<boolean> {
    const { data, error } = await this.supabaseService
      .getServiceRoleClient()
      .from('sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id)
      .is('revoked_at', null)
      .select('id');

    this.throwOnError(error);
    return Array.isArray(data) && data.length > 0;
  }

  /**
   * Lists the active (not revoked, not expired) sessions of a user,
   * most recently created first. Each row represents one device/login.
   */
  async findActiveByUserId(userId: string): Promise<SessionRecord[]> {
    const { data, error } = await this.supabaseService
      .getServiceRoleClient()
      .from('sessions')
      .select(
        'id, user_id, refresh_token_hash, device_info, ip_address, expires_at, created_at, token_family, revoked_at',
      )
      .eq('user_id', userId)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    this.throwOnError(error);
    return data ?? [];
  }

  /**
   * Finds a session by ID, scoped to the given user.
   */
  async findByIdForUser(id: string, userId: string): Promise<SessionRecord | null> {
    const { data, error } = await this.supabaseService
      .getServiceRoleClient()
      .from('sessions')
      .select(
        'id, user_id, refresh_token_hash, device_info, ip_address, expires_at, created_at, token_family, revoked_at',
      )
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    this.throwOnError(error);
    return data;
  }

  /**
   * Revokes every active session of a user ("log out from all devices").
   */
  async revokeAllForUser(userId: string): Promise<void> {
    const { error } = await this.supabaseService
      .getServiceRoleClient()
      .from('sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('revoked_at', null);

    this.throwOnError(error);
  }
}
