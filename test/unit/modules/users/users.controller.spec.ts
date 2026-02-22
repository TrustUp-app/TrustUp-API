import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from '../../../../src/modules/users/users.controller';
import { UsersService } from '../../../../src/modules/users/users.service';

describe('UsersController', () => {
    let controller: UsersController;
    let service: UsersService;

    const mockUserProfile = {
        wallet: 'GABC123XYZ456DEF789ABCDEF0123456789ABCDEF0123456789ABCDEFGHIJ',
        name: null,
        avatar: null,
        preferences: {
            notifications: true,
            theme: 'system',
            language: 'en',
        },
        createdAt: '2026-02-19T14:00:00.000Z',
    };

    const mockUsersService = {
        getOrCreateProfile: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [UsersController],
            providers: [
                {
                    provide: UsersService,
                    useValue: mockUsersService,
                },
            ],
        }).compile();

        controller = module.get<UsersController>(UsersController);
        service = module.get<UsersService>(UsersService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    describe('getMe', () => {
        it('should call getOrCreateProfile with the wallet from the current user', async () => {
            mockUsersService.getOrCreateProfile.mockResolvedValue(mockUserProfile);
            const mockCurrentUser = { wallet: mockUserProfile.wallet };

            await controller.getMe(mockCurrentUser);

            expect(service.getOrCreateProfile).toHaveBeenCalledTimes(1);
            expect(service.getOrCreateProfile).toHaveBeenCalledWith(mockUserProfile.wallet);
        });

        it('should return the standard success response envelope', async () => {
            mockUsersService.getOrCreateProfile.mockResolvedValue(mockUserProfile);
            const mockCurrentUser = { wallet: mockUserProfile.wallet };

            const result = await controller.getMe(mockCurrentUser);

            expect(result).toEqual({
                success: true,
                data: mockUserProfile,
                message: 'User retrieved successfully',
            });
        });

        it('should propagate errors from the service', async () => {
            mockUsersService.getOrCreateProfile.mockRejectedValue(new Error('Service error'));
            const mockCurrentUser = { wallet: 'GABC...' };

            await expect(controller.getMe(mockCurrentUser)).rejects.toThrow('Service error');
        });
    });
});
