import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from '../../../../src/modules/admin/admin.controller';
import { AdminService } from '../../../../src/modules/admin/admin.service';
import { UserRole } from '../../../../src/common/enums/user-role.enum';

describe('AdminController', () => {
  let controller: AdminController;
  let adminService: jest.Mocked<AdminService>;

  const mockUserId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  const mockWallet = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        {
          provide: AdminService,
          useValue: {
            updateUserRole: jest.fn(),
            getSystemHealth: jest.fn(),
            overrideLoan: jest.fn(),
            approveMerchant: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AdminController>(AdminController);
    adminService = module.get(AdminService);
  });

  // ---------------------------------------------------------------------------
  // PATCH /admin/users/:id/role
  // ---------------------------------------------------------------------------
  describe('updateUserRole', () => {
    it('should return success response with updated role', async () => {
      adminService.updateUserRole.mockResolvedValue({
        id: mockUserId,
        walletAddress: mockWallet,
        role: UserRole.MERCHANT,
      });

      const result = await controller.updateUserRole(mockUserId, {
        role: UserRole.MERCHANT,
      });

      expect(result).toEqual({
        success: true,
        data: {
          id: mockUserId,
          walletAddress: mockWallet,
          role: UserRole.MERCHANT,
        },
        message: 'User role updated successfully',
      });
      expect(adminService.updateUserRole).toHaveBeenCalledWith(mockUserId, UserRole.MERCHANT);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /admin/system/health
  // ---------------------------------------------------------------------------
  describe('getSystemHealth', () => {
    it('should return system health data wrapped in success envelope', async () => {
      const healthData = {
        status: 'ok',
        uptime: 86400,
        timestamp: '2026-08-20T10:00:00.000Z',
        database: 'connected',
        redis: 'connected',
        stellarNetwork: 'connected',
        version: '0.1.0',
      };

      adminService.getSystemHealth.mockResolvedValue(healthData);

      const result = await controller.getSystemHealth();

      expect(result).toEqual({
        success: true,
        data: healthData,
        message: 'System health retrieved successfully',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // POST /admin/loans/:id/override
  // ---------------------------------------------------------------------------
  describe('overrideLoan', () => {
    it('should return loan override response', async () => {
      adminService.overrideLoan.mockResolvedValue({
        loanId: mockUserId,
        status: 'override_pending',
        message: `Loan override for ${mockUserId} is pending implementation.`,
      });

      const result = await controller.overrideLoan(mockUserId);

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('override_pending');
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH /admin/merchants/:id/approve
  // ---------------------------------------------------------------------------
  describe('approveMerchant', () => {
    it('should return merchant approval response', async () => {
      adminService.approveMerchant.mockResolvedValue({
        merchantId: mockUserId,
        status: 'approved',
        message: `Merchant ${mockUserId} has been approved (stub).`,
      });

      const result = await controller.approveMerchant(mockUserId);

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('approved');
    });
  });
});
