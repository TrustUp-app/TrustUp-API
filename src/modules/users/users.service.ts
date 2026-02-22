import { Injectable } from '@nestjs/common';
import { UsersRepository, UserPreferencesRecord } from '../../database/repositories/users.repository';
import { UserProfileDto, UserPreferencesDto } from './dto/user-response.dto';

/**
 * Handles all business logic for the users module.
 * Coordinates with UsersRepository for data access.
 */
@Injectable()
export class UsersService {
    constructor(private readonly usersRepository: UsersRepository) { }

    /**
     * Retrieves the authenticated user's profile including preferences.
     *
     * Handles three cases:
     * 1. Returning user with preferences → return as-is
     * 2. First login (no user row) → create user + create default preferences
     * 3. Legacy user without preferences row → create default preferences on the fly
     *
     * @param wallet - Stellar wallet address extracted from the JWT by JwtAuthGuard (API-03)
     */
    async getOrCreateProfile(wallet: string): Promise<UserProfileDto> {
        let user = await this.usersRepository.findByWallet(wallet);
        let preferences: UserPreferencesRecord;

        if (!user) {
            // Case 2: First login — create user, then create default preferences
            user = await this.usersRepository.create(wallet);
            preferences = await this.usersRepository.createDefaultPreferences(user.id);
        } else if (!user.user_preferences) {
            // Case 3: Legacy user with no preferences row yet
            preferences = await this.usersRepository.createDefaultPreferences(user.id);
        } else {
            // Case 1: Happy path
            preferences = user.user_preferences;
        }

        return {
            wallet: user.wallet_address,
            name: user.display_name,
            avatar: user.avatar_url,
            preferences: this.mapPreferences(preferences),
            createdAt: user.created_at,
        };
    }

    private mapPreferences(prefs: UserPreferencesRecord): UserPreferencesDto {
        return {
            notifications: prefs.notifications_enabled,
            theme: prefs.theme,
            language: prefs.language,
        };
    }
}
