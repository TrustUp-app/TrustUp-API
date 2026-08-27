import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from '../../../../src/modules/admin/admin.controller';
import { AdminService } from '../../../../src/modules/admin/admin.service';
import { UserRole } from '../../../../src/common/enums/user-role.enum';

describe('AdminController', () => {
  let controller: AdminController;
  let adminService: jest.Mocked<AdminService>;

  const mockUserId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  const mockAdminWallet = 'GAADMIN777777777777777777777777777777777777777777777777777';
  const mockWallet = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';
  const mockAppId = 'b1b2c3d4-e5f6-7890-abcd-ef1234567890';
  const mockLoanId = 'l1b2c3d4-e5f6-7890-abcd-ef1234567890';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        {
          provide: AdminService,
          useValue: {
            updateUserRole: jest.fn(),
            getSystemHealth: jest.fn(),
            listMerchantApplications: jest.fn(),
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
  // GET /admin/merchants/applications
  // ---------------------------------------------------------------------------
  describe('listMerchantApplications', () => {
    it('should return merchant applications list', async () => {
      const mockResult = {
        applications: [],
        total: 0,
        limit: 20,
        offset: 0,
      };
      adminService.listMerchantApplications.mockResolvedValue(mockResult);

      const result = await controller.listMerchantApplications({
        status: 'pending',
        limit: 20,
        offset: 0,
      });

      expect(result).toEqual({
        success: true,
        data: mockResult,
        message: 'Merchant applications retrieved successfully',
      });
      expect(adminService.listMerchantApplications).toHaveBeenCalledWith('pending', 20, 0);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /admin/loans/:id/override
  // ---------------------------------------------------------------------------
  describe('overrideLoan', () => {
    it('should return loan override response', async () => {
      const mockResponse = {
        loanId: mockLoanId,
        previousStatus: 'active',
        status: 'completed',
        action: 'FORCE_SETTLE',
        reason: 'Proof of wire payment received',
        overriddenBy: mockAdminWallet,
        timestamp: '2026-08-27T10:00:00.000Z',
      };

      adminService.overrideLoan.mockResolvedValue(mockResponse);

      const result = await controller.overrideLoan(
        mockLoanId,
        {
          targetStatus: 'completed',
          reason: 'Proof of wire payment received',
          action: 'FORCE_SETTLE',
        },
        { wallet: mockAdminWallet },
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResponse);
      expect(adminService.overrideLoan).toHaveBeenCalledWith(
        mockLoanId,
        {
          targetStatus: 'completed',
          reason: 'Proof of wire payment received',
          action: 'FORCE_SETTLE',
        },
        mockAdminWallet,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH /admin/merchants/:id/approve
  // ---------------------------------------------------------------------------
  describe('approveMerchant', () => {
    it('should return merchant approval response', async () => {
      const mockResponse = {
        applicationId: mockAppId,
        wallet: mockWallet,
        status: 'approved',
        message: 'Merchant application has been approved and activated.',
        merchantId: 'merchant-uuid-1',
      };

      adminService.approveMerchant.mockResolvedValue(mockResponse);

      const result = await controller.approveMerchant(
        mockAppId,
        { approved: true },
        { wallet: mockAdminWallet },
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResponse);
      expect(adminService.approveMerchant).toHaveBeenCalledWith(
        mockAppId,
        { approved: true },
        mockAdminWallet,
      );
    });
  });
});
