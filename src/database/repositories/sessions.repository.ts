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
   * Revokes all sessions belonging to the given token family.
   * This is used to invalidate the family if a reused refresh token is detected.
   */
  async revokeFamily(tokenFamily: string): Promise<void> {
    const { error } = await this.supabaseService
      .getServiceRoleClient()
      .from('sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token_family', tokenFamily);

    this.throwOnError(error);
  }

  /**
   * Marks a single session as revoked (used for logout of a specific device).
   */
  async revokeById(id: string): Promise<void> {
    const { error } = await this.supabaseService
      .getServiceRoleClient()
      .from('sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id);

    this.throwOnError(error);
  }

  /**
   * Revokes every active session belonging to a user ("logout all devices").
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

  /**
   * Lists the active (non-revoked, non-expired) sessions for a user.
   * The refresh token hash is intentionally never returned to callers.
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
   * Marks a session as rotated/used by revoking it. Rotation inserts a brand
   * new session row (see `create`) and revokes the previous one instead of
   * overwriting its hash, so a replayed old token still resolves to a row and
   * can trigger family revocation.
   */
  async markRotated(id: string): Promise<void> {
    const { error } = await this.supabaseService
      .getServiceRoleClient()
      .from('sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id);

    this.throwOnError(error);
  }

  /**
   * Updates an existing session by ID.
   */
  async update(
    id: string,
    updateData: {
      refreshTokenHash: string;
      expiresAt: string;
    },
  ): Promise<SessionRecord> {
    const { data, error } = await this.supabaseService
      .getServiceRoleClient()
      .from('sessions')
      .update({
        refresh_token_hash: updateData.refreshTokenHash,
        expires_at: updateData.expiresAt,
      })
      .eq('id', id)
      .select('*')
      .single();

    this.throwOnError(error);
    return data;
  }
}
