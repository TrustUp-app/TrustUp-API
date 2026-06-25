import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase.client';

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
export class SessionsRepository {
  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Finds a session by its refresh token hash.
   */
  async findByHash(hash: string): Promise<SessionRecord | null> {
    const { data, error } = await this.supabaseService
      .getServiceRoleClient()
      .from('sessions')
      .select('id, user_id, refresh_token_hash, device_info, ip_address, expires_at, created_at, token_family, revoked_at')
      .eq('refresh_token_hash', hash)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException({
        code: 'DATABASE_QUERY_ERROR',
        message: error.message,
      });
    }
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
    const insertData: any = {
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

    if (error) {
      throw new InternalServerErrorException({
        code: 'DATABASE_QUERY_ERROR',
        message: error.message,
      });
    }
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

    if (error) {
      throw new InternalServerErrorException({
        code: 'DATABASE_QUERY_ERROR',
        message: error.message,
      });
    }
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

    if (error) {
      throw new InternalServerErrorException({
        code: 'DATABASE_QUERY_ERROR',
        message: error.message,
      });
    }
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

    if (error) {
      throw new InternalServerErrorException({
        code: 'DATABASE_QUERY_ERROR',
        message: error.message,
      });
    }
  }

  /**
   * Updates an existing session by ID (used for atomic token rotation).
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

    if (error) {
      throw new InternalServerErrorException({
        code: 'DATABASE_QUERY_ERROR',
        message: error.message,
      });
    }
    return data;
  }
}
