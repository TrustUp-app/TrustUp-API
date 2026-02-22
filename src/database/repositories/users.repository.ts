import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase.client';

export interface UserPreferencesRecord {
    notifications_enabled: boolean;
    language: string;
    theme: string;
}

export interface UserRecord {
    id: string;
    wallet_address: string;
    display_name: string | null;
    avatar_url: string | null;
    status: 'active' | 'blocked';
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
export class UsersRepository {
    constructor(private readonly supabaseService: SupabaseService) { }

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
                'id, wallet_address, display_name, avatar_url, status, created_at, user_preferences(notifications_enabled, language, theme)',
            )
            .eq('wallet_address', wallet)
            .maybeSingle();

        if (error) {
            throw new InternalServerErrorException({
                code: 'DATABASE_QUERY_ERROR',
                message: error.message,
            });
        }
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
            .select('id, wallet_address, display_name, avatar_url, status, created_at')
            .single();

        if (error) {
            throw new InternalServerErrorException({
                code: 'DATABASE_QUERY_ERROR',
                message: error.message,
            });
        }

        return { ...(data as Omit<UserRecord, 'user_preferences'>), user_preferences: null };
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

        if (error) {
            throw new InternalServerErrorException({
                code: 'DATABASE_QUERY_ERROR',
                message: error.message,
            });
        }
        return data as UserPreferencesRecord;

    }
}
