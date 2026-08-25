import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from '../../../../src/modules/admin/admin.service';
import { UsersRepository } from '../../../../src/database/repositories/users.repository';
import { UserRole } from '../../../../src/common/enums/user-role.enum';
import { NotFoundException } from '@nestjs/common';

describe('AdminService', () => {
  let service: AdminService;
  let usersRepository: jest.Mocked<UsersRepository>;

  const mockUserId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  const mockWallet = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: UsersRepository,
          useValue: {
            findById: jest.fn(),
            updateRole: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    usersRepository = module.get(UsersRepository);
  });

  // ---------------------------------------------------------------------------
  // updateUserRole
  // ---------------------------------------------------------------------------
  describe('updateUserRole', () => {
    it('should update user role successfully', async () => {
      usersRepository.findById.mockResolvedValue({
        id: mockUserId,
        wallet_address: mockWallet,
        username: null,
        display_name: null,
        avatar_url: null,
        status: 'active',
        role: UserRole.BORROWER,
        created_at: '2026-01-01T00:00:00.000Z',
        user_preferences: null,
      });

      usersRepository.updateRole.mockResolvedValue({
        id: mockUserId,
        wallet_address: mockWallet,
        role: UserRole.MERCHANT,
      });

      const result = await service.updateUserRole(mockUserId, UserRole.MERCHANT);

      expect(result).toEqual({
        id: mockUserId,
        walletAddress: mockWallet,
        role: UserRole.MERCHANT,
      });
      expect(usersRepository.findById).toHaveBeenCalledWith(mockUserId);
      expect(usersRepository.updateRole).toHaveBeenCalledWith(mockUserId, UserRole.MERCHANT);
    });

    it('should throw NotFoundException when user does not exist', async () => {
      usersRepository.findById.mockResolvedValue(null);

      await expect(service.updateUserRole(mockUserId, UserRole.ADMIN))
        .rejects
        .toThrow(NotFoundException);
    });

    it('should allow changing role to admin', async () => {
      usersRepository.findById.mockResolvedValue({
        id: mockUserId,
        wallet_address: mockWallet,
        username: null,
        display_name: null,
        avatar_url: null,
        status: 'active',
        role: UserRole.BORROWER,
        created_at: '2026-01-01T00:00:00.000Z',
        user_preferences: null,
      });

      usersRepository.updateRole.mockResolvedValue({
        id: mockUserId,
        wallet_address: mockWallet,
        role: UserRole.ADMIN,
      });

      const result = await service.updateUserRole(mockUserId, UserRole.ADMIN);
      expect(result.role).toBe(UserRole.ADMIN);
    });
  });

  // ---------------------------------------------------------------------------
  // getSystemHealth
  // ---------------------------------------------------------------------------
  describe('getSystemHealth', () => {
    it('should return system health data', async () => {
      const result = await service.getSystemHealth();

      expect(result).toEqual(
        expect.objectContaining({
          status: 'ok',
          database: 'connected',
          redis: 'connected',
          stellarNetwork: 'connected',
          version: '0.1.0',
        }),
      );
      expect(typeof result.uptime).toBe('number');
      expect(typeof result.timestamp).toBe('string');
    });
  });

  // ---------------------------------------------------------------------------
  // overrideLoan (stub)
  // ---------------------------------------------------------------------------
  describe('overrideLoan', () => {
    it('should return pending override status (stub)', async () => {
      const result = await service.overrideLoan(mockUserId, 'override');
      expect(result.status).toBe('override_pending');
      expect(result.loanId).toBe(mockUserId);
    });
  });

  // ---------------------------------------------------------------------------
  // approveMerchant (stub)
  // ---------------------------------------------------------------------------
  describe('approveMerchant', () => {
    it('should return approved status when approved=true (stub)', async () => {
      const result = await service.approveMerchant(mockUserId, true);
      expect(result.status).toBe('approved');
    });

    it('should return rejected status when approved=false (stub)', async () => {
      const result = await service.approveMerchant(mockUserId, false);
      expect(result.status).toBe('rejected');
    });
  });
});
