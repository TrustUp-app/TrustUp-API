import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from '../../../../src/modules/users/users.controller';
import { UsersService } from '../../../../src/modules/users/users.service';
import { JwtAuthGuard } from '../../../../src/common/guards/jwt-auth.guard';

describe('UsersController', () => {
  let controller: UsersController;
  let service: UsersService;

  const mockWallet = 'GABC123XYZ456DEF789ABCDEF0123456789ABCDEF0123456789ABCDEFGHIJ';
  const mockCurrentUser = { wallet: mockWallet };

  const mockUserProfile = {
    wallet: mockWallet,
    name: null,
    avatar: null,
    preferences: { notifications: true, theme: 'system', language: 'en' },
    createdAt: '2026-02-19T14:00:00.000Z',
  };

  const mockUpdatedProfile = {
    wallet: mockWallet,
    name: 'Maria Garcia',
    avatar: 'https://example.com/avatar.jpg',
    preferences: { notifications: true, theme: 'dark', language: 'en' },
    updatedAt: '2026-02-20T10:00:00.000Z',
  };

  const mockUsersService = {
    getOrCreateProfile: jest.fn(),
    updateProfile: jest.fn(),
    becomeLp: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: mockUsersService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<UsersController>(UsersController);
    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // GET /users/me (API-04)
  // ---------------------------------------------------------------------------
  describe('getMe', () => {
    it('should call getOrCreateProfile with the wallet from the current user', async () => {
      mockUsersService.getOrCreateProfile.mockResolvedValue(mockUserProfile);

      await controller.getMe(mockCurrentUser);

      expect(service.getOrCreateProfile).toHaveBeenCalledTimes(1);
      expect(service.getOrCreateProfile).toHaveBeenCalledWith(mockWallet);
    });

    it('should return the standard success response envelope', async () => {
      mockUsersService.getOrCreateProfile.mockResolvedValue(mockUserProfile);

      const result = await controller.getMe(mockCurrentUser);

      expect(result).toEqual({
        success: true,
        data: mockUserProfile,
        message: 'User retrieved successfully',
      });
    });

    it('should propagate errors from the service', async () => {
      mockUsersService.getOrCreateProfile.mockRejectedValue(new Error('Service error'));

      await expect(controller.getMe(mockCurrentUser)).rejects.toThrow('Service error');
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH /users/me (API-05)
  // ---------------------------------------------------------------------------
  describe('updateProfile', () => {
    it('should return the standard success response envelope with updated data', async () => {
      mockUsersService.updateProfile.mockResolvedValue(mockUpdatedProfile);
      const dto = { name: 'Maria Garcia', avatar: 'https://example.com/avatar.jpg' };

      const result = await controller.updateProfile(mockCurrentUser, dto);

      expect(result).toEqual({
        success: true,
        data: mockUpdatedProfile,
        message: 'Profile updated successfully',
      });
      expect(service.updateProfile).toHaveBeenCalledWith(mockWallet, dto);
      expect(service.updateProfile).toHaveBeenCalledTimes(1);
    });

    it('should pass the wallet from @CurrentUser to the service', async () => {
      mockUsersService.updateProfile.mockResolvedValue(mockUpdatedProfile);

      await controller.updateProfile(mockCurrentUser, {});

      expect(service.updateProfile).toHaveBeenCalledWith(mockWallet, {});
    });
  });

  // ---------------------------------------------------------------------------
  // POST /users/me/become-lp
  // ---------------------------------------------------------------------------
  describe('becomeLp', () => {
    it('should upgrade role to lp_provider and return success response', async () => {
      mockUsersService.becomeLp = jest.fn().mockResolvedValue({
        wallet: mockWallet,
        role: 'lp_provider',
        message: 'User role successfully updated to lp_provider.',
      });

      const result = await controller.becomeLp(mockCurrentUser);

      expect(result).toEqual({
        success: true,
        data: { wallet: mockWallet, role: 'lp_provider' },
        message: 'User role successfully updated to lp_provider.',
      });
      expect(mockUsersService.becomeLp).toHaveBeenCalledWith(mockWallet);
    });
  });
});
