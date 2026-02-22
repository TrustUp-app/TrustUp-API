import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from '../../../../src/modules/users/users.service';
import { UsersRepository } from '../../../../src/database/repositories/users.repository';

describe('UsersService', () => {
    let service: UsersService;
    let repository: UsersRepository;

    const mockPreferences = {
        notifications_enabled: true,
        language: 'en',
        theme: 'system',
    };

    const mockExistingUser = {
        id: 'uuid-123',
        wallet_address: 'GABC123XYZ456DEF789ABCDEF0123456789ABCDEF0123456789ABCDEFGHIJ',
        display_name: 'Maria Garcia',
        avatar_url: 'https://example.com/avatar.png',
        status: 'active' as const,
        created_at: '2026-02-13T10:00:00.000Z',
        user_preferences: mockPreferences,
    };

    const mockNewUser = {
        id: 'uuid-456',
        wallet_address: 'GNEW123XYZ456DEF789ABCDEF0123456789ABCDEF0123456789ABCDEFGHIJ',
        display_name: null,
        avatar_url: null,
        status: 'active' as const,
        created_at: '2026-02-19T14:00:00.000Z',
        user_preferences: null,
    };

    const mockUsersRepository = {
        findByWallet: jest.fn(),
        create: jest.fn(),
        createDefaultPreferences: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                UsersService,
                {
                    provide: UsersRepository,
                    useValue: mockUsersRepository,
                },
            ],
        }).compile();

        service = module.get<UsersService>(UsersService);
        repository = module.get<UsersRepository>(UsersRepository);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('getOrCreateProfile', () => {
        it('Case 1: returns existing user profile with preferences (no writes)', async () => {
            mockUsersRepository.findByWallet.mockResolvedValue(mockExistingUser);

            const result = await service.getOrCreateProfile(mockExistingUser.wallet_address);

            expect(repository.findByWallet).toHaveBeenCalledWith(mockExistingUser.wallet_address);
            expect(repository.create).not.toHaveBeenCalled();
            expect(repository.createDefaultPreferences).not.toHaveBeenCalled();
            expect(result).toEqual({
                wallet: mockExistingUser.wallet_address,
                name: mockExistingUser.display_name,
                avatar: mockExistingUser.avatar_url,
                preferences: {
                    notifications: mockPreferences.notifications_enabled,
                    theme: mockPreferences.theme,
                    language: mockPreferences.language,
                },
                createdAt: mockExistingUser.created_at,
            });
        });

        it('Case 2: creates new user and default preferences on first login', async () => {
            mockUsersRepository.findByWallet.mockResolvedValue(null);
            mockUsersRepository.create.mockResolvedValue(mockNewUser);
            mockUsersRepository.createDefaultPreferences.mockResolvedValue(mockPreferences);

            const result = await service.getOrCreateProfile(mockNewUser.wallet_address);

            expect(repository.findByWallet).toHaveBeenCalledWith(mockNewUser.wallet_address);
            expect(repository.create).toHaveBeenCalledWith(mockNewUser.wallet_address);
            expect(repository.createDefaultPreferences).toHaveBeenCalledWith(mockNewUser.id);
            expect(result.wallet).toBe(mockNewUser.wallet_address);
            expect(result.preferences.notifications).toBe(mockPreferences.notifications_enabled);
        });

        it('Case 3: creates default preferences for legacy user missing preferences row', async () => {
            const legacyUser = { ...mockExistingUser, user_preferences: null };
            mockUsersRepository.findByWallet.mockResolvedValue(legacyUser);
            mockUsersRepository.createDefaultPreferences.mockResolvedValue(mockPreferences);

            const result = await service.getOrCreateProfile(legacyUser.wallet_address);

            expect(repository.create).not.toHaveBeenCalled();
            expect(repository.createDefaultPreferences).toHaveBeenCalledWith(legacyUser.id);
            expect(result.preferences.theme).toBe(mockPreferences.theme);
        });

        it('should propagate errors from findByWallet', async () => {
            mockUsersRepository.findByWallet.mockRejectedValue(new Error('DB error'));
            await expect(service.getOrCreateProfile('GABC...')).rejects.toThrow('DB error');
        });

        it('should propagate errors from createDefaultPreferences', async () => {
            mockUsersRepository.findByWallet.mockResolvedValue(null);
            mockUsersRepository.create.mockResolvedValue(mockNewUser);
            mockUsersRepository.createDefaultPreferences.mockRejectedValue(new Error('Prefs error'));
            await expect(service.getOrCreateProfile(mockNewUser.wallet_address)).rejects.toThrow('Prefs error');
        });
    });
});
