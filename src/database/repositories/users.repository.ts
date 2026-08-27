import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { UpdateUserDto } from '../../modules/users/dto/update-user.dto';
import { UserRole } from '../../common/enums/user-role.enum';
import { BaseRepository } from './base.repository';

export interface UserPreferencesRecord {
  notifications_enabled: boolean;
  language: string;
  theme: string;
}

export interface UserRecord {
  id: string;
  wallet_address: string;
  username?: string | null;
  display_name: string | null;
  avatar_url: string | null;
  status: 'active' | 'blocked';
  role: UserRole;
  created_at: string;
  /** Nested from user_preferences table — null if row does not exist yet */
  user_preferences: UserPreferencesRecord | null;
}

/**
 * Encapsulates all Supabase queries for the `users` table.
 *
 * The service-role client is used for write operations so that
 * Row Level Security does not block the auto-creation on first login.
 */
@Injectable()
export class UsersRepository extends BaseRepository {
  /**
   * Returns the user row (with nested preferences) matching the wallet,
   * or null if no matching row exists yet.
   *
   * Note: Supabase nested selects always return the relation as an array,
   * even for 1-to-1 relations. We normalize it to a single record here.
   */
  async findByWallet(wallet: string): Promise<UserRecord | null> {
    const { data, error } = await this.supabaseService
      .getServiceRoleClient()
      .from('users')
      .select(
        'id, wallet_address, username, display_name, avatar_url, status, role, created_at, user_preferences(notifications_enabled, language, theme)',
      )
      .eq('wallet_address', wallet)
      .maybeSingle();

    this.throwOnError(error);
    if (!data) return null;

    // Normalize: Supabase returns the nested relation as an array
    const raw = data as unknown as Omit<UserRecord, 'user_preferences'> & {
      user_preferences: UserPreferencesRecord[];
    };

    return {
      ...raw,
      user_preferences: raw.user_preferences?.[0] ?? null,
    };
  }

  /**
   * Inserts a new user row with default values for the given wallet address.
   * Called automatically on the user's first authenticated request.
   */
  async create(wallet: string): Promise<UserRecord> {
    const { data, error } = await this.supabaseService
      .getServiceRoleClient()
      .from('users')
      .insert({ wallet_address: wallet })
      .select('id, wallet_address, username, display_name, avatar_url, status, role, created_at')
      .single();

    this.throwOnError(error);

    return {
      ...(data as Omit<UserRecord, 'user_preferences'>),
      user_preferences: null,
    } as UserRecord;
  }

  /**
   * Inserts a default user_preferences row for the given user ID.
   * Called when a user exists but has no preferences row yet (first-access or legacy users).
   */
  async createDefaultPreferences(userId: string): Promise<UserPreferencesRecord> {
    const { data, error } = await this.supabaseService
      .getServiceRoleClient()
      .from('user_preferences')
      .insert({ user_id: userId })
      .select('notifications_enabled, language, theme')
      .single();

    this.throwOnError(error);
    return data as UserPreferencesRecord;
  }

  /**
   * Updates the user's profile fields and/or preferences.
   * Uses upsert so the row is created if it doesn't exist yet.
   * `updated_at` is maintained automatically by the DB trigger.
   *
   * @param wallet - Stellar wallet address (from JWT via JwtAuthGuard)
   * @param data   - Validated and sanitized update payload (API-05)
   */
  async update(
    wallet: string,
    data: UpdateUserDto,
  ): Promise<{
    wallet_address: string;
    display_name: string | null;
    avatar_url: string | null;
    updated_at: string;
    id: string;
  }> {
    const client = this.supabaseService.getServiceRoleClient();

    // Build the users table payload — only include provided fields
    const userPayload: Record<string, unknown> = { wallet_address: wallet };
    if (data.name !== undefined) userPayload.display_name = data.name;
    if (data.avatar !== undefined) userPayload.avatar_url = data.avatar;

    const { data: user, error: userError } = await client
      .from('users')
      .upsert(userPayload, { onConflict: 'wallet_address' })
      .select('id, wallet_address, display_name, avatar_url, updated_at')
      .single();

    if (userError || !user) {
      throw new InternalServerErrorException({
        code: 'DATABASE_USER_UPDATE_FAILED',
        message: 'Failed to update user profile.',
      });
    }

    // Update preferences if provided
    if (data.preferences !== undefined) {
      const prefPayload: Record<string, unknown> = { user_id: user.id };
      if (data.preferences.notifications !== undefined)
        prefPayload.notifications_enabled = data.preferences.notifications;
      if (data.preferences.theme !== undefined) prefPayload.theme = data.preferences.theme;
      if (data.preferences.language !== undefined) prefPayload.language = data.preferences.language;

      const { error: prefError } = await client
        .from('user_preferences')
        .upsert(prefPayload, { onConflict: 'user_id' });

      if (prefError) {
        throw new InternalServerErrorException({
          code: 'DATABASE_PREFERENCES_UPDATE_FAILED',
          message: 'Failed to update user preferences.',
        });
      }
    }

    return user as {
      wallet_address: string;
      display_name: string | null;
      avatar_url: string | null;
      updated_at: string;
      id: string;
    };
  }

  // --- REGISTRATION METHODS ---

  async checkUsernameExists(username: string): Promise<boolean> {
    const { data, error } = await this.supabaseService
      .getServiceRoleClient()
      .from('users')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    this.throwOnError(error);
    return !!data;
  }

  async createProfile(data: {
    wallet: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  }): Promise<UserRecord> {
    const { data: user, error } = await this.supabaseService
      .getServiceRoleClient()
      .from('users')
      .insert({
        wallet_address: data.wallet,
        username: data.username,
        display_name: data.displayName,
        avatar_url: data.avatarUrl,
        status: 'active',
      })
      .select('id, wallet_address, username, display_name, avatar_url, status, role, created_at')
      .single();

    if (error) {
      throw new InternalServerErrorException({
        code: 'DATABASE_INSERT_ERROR',
        message: `Failed to create user profile: ${error.message}`,
      });
    }

    return {
      ...(user as Omit<UserRecord, 'user_preferences'>),
      user_preferences: null,
    } as UserRecord;
  }

  async uploadAvatar(
    walletAddress: string,
    file: { buffer: Buffer; mimetype: string; originalname?: string; filename?: string },
  ): Promise<string> {
    const name = file.originalname || file.filename || 'avatar.png';
    const fileExt = name.split('.').pop() || 'png';
    const fileName = `${walletAddress}-${Date.now()}.${fileExt}`;
    const client = this.supabaseService.getServiceRoleClient();

    const { error } = await client.storage.from('avatars').upload(fileName, file.buffer, {
      contentType: file.mimetype,
      upsert: true,
    });

    if (error) {
      throw new InternalServerErrorException({
        code: 'STORAGE_UPLOAD_FAILED',
        message: `Failed to upload avatar: ${error.message}`,
      });
    }

    const { data } = client.storage.from('avatars').getPublicUrl(fileName);
    return data.publicUrl;
  }

  /**
   * Updates the role of a user identified by their ID.
   * Used by admin endpoints for role management.
   *
   * @param userId - The user's UUID
   * @param role - The new role to assign
   * @returns Updated user record
   */
  async updateRole(
    userId: string,
    role: UserRole,
  ): Promise<{ id: string; wallet_address: string; role: UserRole }> {
    const { data, error } = await this.supabaseService
      .getServiceRoleClient()
      .from('users')
      .update({ role })
      .eq('id', userId)
      .select('id, wallet_address, role')
      .single();

    if (error || !data) {
      throw new InternalServerErrorException({
        code: 'DATABASE_ROLE_UPDATE_FAILED',
        message: 'Failed to update user role.',
      });
    }

    return data as { id: string; wallet_address: string; role: UserRole };
  }

  /**
   * Finds a user by their internal UUID.
   * Used by admin endpoints.
   */
  async findById(userId: string): Promise<UserRecord | null> {
    const { data, error } = await this.supabaseService
      .getServiceRoleClient()
      .from('users')
      .select(
        'id, wallet_address, username, display_name, avatar_url, status, role, created_at, user_preferences(notifications_enabled, language, theme)',
      )
      .eq('id', userId)
      .maybeSingle();

    this.throwOnError(error);
    if (!data) return null;

    const raw = data as unknown as Omit<UserRecord, 'user_preferences'> & {
      user_preferences: UserPreferencesRecord[];
    };

    return {
      ...raw,
      user_preferences: raw.user_preferences?.[0] ?? null,
    };
  }
}
