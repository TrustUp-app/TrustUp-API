import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from '../../../../src/modules/admin/admin.service';
import { UsersRepository } from '../../../../src/database/repositories/users.repository';
import { MerchantApplicationsRepository } from '../../../../src/database/repositories/merchant-applications.repository';
import { MerchantsRepository } from '../../../../src/database/repositories/merchants.repository';
import { LoansRepository } from '../../../../src/database/repositories/loans.repository';
import { UserRole } from '../../../../src/common/enums/user-role.enum';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('AdminService', () => {
  let service: AdminService;
  let usersRepository: jest.Mocked<UsersRepository>;
  let merchantApplicationsRepository: jest.Mocked<MerchantApplicationsRepository>;
  let merchantsRepository: jest.Mocked<MerchantsRepository>;
  let loansRepository: jest.Mocked<LoansRepository>;

  const mockUserId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  const mockAdminWallet = 'GAADMIN777777777777777777777777777777777777777777777777777';
  const mockUserWallet = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';
  const mockAppId = 'b1b2c3d4-e5f6-7890-abcd-ef1234567890';
  const mockLoanId = 'l1b2c3d4-e5f6-7890-abcd-ef1234567890';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: UsersRepository,
          useValue: {
            findById: jest.fn(),
            findByWallet: jest.fn(),
            updateRole: jest.fn(),
          },
        },
        {
          provide: MerchantApplicationsRepository,
          useValue: {
            create: jest.fn(),
            findById: jest.fn(),
            findPendingByWallet: jest.fn(),
            findAll: jest.fn(),
            updateStatus: jest.fn(),
          },
        },
        {
          provide: MerchantsRepository,
          useValue: {
            findById: jest.fn(),
            findByWallet: jest.fn(),
            upsertMerchant: jest.fn(),
          },
        },
        {
          provide: LoansRepository,
          useValue: {
            findDetailedById: jest.fn(),
            applyLoanOverride: jest.fn(),
            recordOverride: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    usersRepository = module.get(UsersRepository);
    merchantApplicationsRepository = module.get(MerchantApplicationsRepository);
    merchantsRepository = module.get(MerchantsRepository);
    loansRepository = module.get(LoansRepository);
  });

  // ---------------------------------------------------------------------------
  // updateUserRole
  // ---------------------------------------------------------------------------
  describe('updateUserRole', () => {
    it('should update user role successfully', async () => {
      usersRepository.findById.mockResolvedValue({
        id: mockUserId,
        wallet_address: mockUserWallet,
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
        wallet_address: mockUserWallet,
        role: UserRole.MERCHANT,
      });

      const result = await service.updateUserRole(mockUserId, UserRole.MERCHANT);

      expect(result).toEqual({
        id: mockUserId,
        walletAddress: mockUserWallet,
        role: UserRole.MERCHANT,
      });
      expect(usersRepository.findById).toHaveBeenCalledWith(mockUserId);
      expect(usersRepository.updateRole).toHaveBeenCalledWith(mockUserId, UserRole.MERCHANT);
    });

    it('should throw NotFoundException when user does not exist', async () => {
      usersRepository.findById.mockResolvedValue(null);

      await expect(service.updateUserRole(mockUserId, UserRole.ADMIN)).rejects.toThrow(
        NotFoundException,
      );
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
  // listMerchantApplications
  // ---------------------------------------------------------------------------
  describe('listMerchantApplications', () => {
    it('should return paginated applications', async () => {
      const mockApps = [
        {
          id: mockAppId,
          user_id: mockUserId,
          wallet: mockUserWallet,
          name: 'TechStore',
          logo: null,
          description: null,
          category: 'Retail',
          website: null,
          status: 'pending' as const,
          rejection_reason: null,
          reviewed_by: null,
          reviewed_at: null,
          created_at: '2026-08-27T00:00:00.000Z',
          updated_at: '2026-08-27T00:00:00.000Z',
        },
      ];

      merchantApplicationsRepository.findAll.mockResolvedValue({
        applications: mockApps,
        total: 1,
      });

      const result = await service.listMerchantApplications('pending', 10, 0);

      expect(result).toEqual({
        applications: mockApps,
        total: 1,
        limit: 10,
        offset: 0,
      });
      expect(merchantApplicationsRepository.findAll).toHaveBeenCalledWith({
        status: 'pending',
        limit: 10,
        offset: 0,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // approveMerchant
  // ---------------------------------------------------------------------------
  describe('approveMerchant', () => {
    const pendingApp = {
      id: mockAppId,
      user_id: mockUserId,
      wallet: mockUserWallet,
      name: 'TechStore',
      logo: 'https://example.com/logo.png',
      description: 'Electronics shop',
      category: 'Electronics',
      website: 'https://techstore.com',
      status: 'pending' as const,
      rejection_reason: null,
      reviewed_by: null,
      reviewed_at: null,
      created_at: '2026-08-27T00:00:00.000Z',
      updated_at: '2026-08-27T00:00:00.000Z',
    };

    it('should approve application, activate merchant record, and upgrade user role', async () => {
      merchantApplicationsRepository.findById.mockResolvedValue(pendingApp);
      usersRepository.findByWallet.mockResolvedValue({
        id: 'admin-1',
        wallet_address: mockAdminWallet,
        role: UserRole.ADMIN,
        status: 'active',
        created_at: '2026-01-01T00:00:00.000Z',
        display_name: 'Admin',
        avatar_url: null,
        user_preferences: null,
      });
      merchantApplicationsRepository.updateStatus.mockResolvedValue({
        ...pendingApp,
        status: 'approved',
        reviewed_by: 'admin-1',
      });
      merchantsRepository.upsertMerchant.mockResolvedValue({
        id: 'merchant-uuid-1',
        wallet: mockUserWallet,
        name: 'TechStore',
        logo: 'https://example.com/logo.png',
        description: 'Electronics shop',
        category: 'Electronics',
        website: 'https://techstore.com',
        is_active: true,
        created_at: '2026-08-27T00:00:00.000Z',
        updated_at: '2026-08-27T00:00:00.000Z',
      });
      usersRepository.findById.mockResolvedValue({
        id: mockUserId,
        wallet_address: mockUserWallet,
        role: UserRole.BORROWER,
        status: 'active',
        created_at: '2026-01-01T00:00:00.000Z',
        display_name: 'Applicant',
        avatar_url: null,
        user_preferences: null,
      });
      usersRepository.updateRole.mockResolvedValue({
        id: mockUserId,
        wallet_address: mockUserWallet,
        role: UserRole.MERCHANT,
      });

      const result = await service.approveMerchant(mockAppId, { approved: true }, mockAdminWallet);

      expect(result.status).toBe('approved');
      expect(result.applicationId).toBe(mockAppId);
      expect(result.merchantId).toBe('merchant-uuid-1');
      expect(merchantApplicationsRepository.updateStatus).toHaveBeenCalledWith(
        mockAppId,
        'approved',
        'admin-1',
      );
      expect(merchantsRepository.upsertMerchant).toHaveBeenCalledWith(
        expect.objectContaining({
          wallet: mockUserWallet,
          name: 'TechStore',
          is_active: true,
        }),
      );
      expect(usersRepository.updateRole).toHaveBeenCalledWith(mockUserId, UserRole.MERCHANT);
    });

    it('should reject application with rejection reason', async () => {
      merchantApplicationsRepository.findById.mockResolvedValue(pendingApp);
      usersRepository.findByWallet.mockResolvedValue(null);
      merchantApplicationsRepository.updateStatus.mockResolvedValue({
        ...pendingApp,
        status: 'rejected',
        rejection_reason: 'Invalid business license',
      });

      const result = await service.approveMerchant(
        mockAppId,
        { approved: false, rejectionReason: 'Invalid business license' },
        mockAdminWallet,
      );

      expect(result.status).toBe('rejected');
      expect(result.message).toContain('Invalid business license');
      expect(merchantApplicationsRepository.updateStatus).toHaveBeenCalledWith(
        mockAppId,
        'rejected',
        null,
        'Invalid business license',
      );
      expect(merchantsRepository.upsertMerchant).not.toHaveBeenCalled();
      expect(usersRepository.updateRole).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when application does not exist', async () => {
      merchantApplicationsRepository.findById.mockResolvedValue(null);
      merchantsRepository.findById.mockResolvedValue(null);

      await expect(
        service.approveMerchant(mockAppId, { approved: true }, mockAdminWallet),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when application is already approved or rejected', async () => {
      merchantApplicationsRepository.findById.mockResolvedValue({
        ...pendingApp,
        status: 'approved',
      });

      await expect(
        service.approveMerchant(mockAppId, { approved: true }, mockAdminWallet),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ---------------------------------------------------------------------------
  // overrideLoan
  // ---------------------------------------------------------------------------
  describe('overrideLoan', () => {
    const mockLoan = {
      id: mockLoanId,
      loan_id: 'loan-12345',
      user_wallet: mockUserWallet,
      merchant_id: 'merchant-1',
      amount: 500,
      loan_amount: 500,
      guarantee: 50,
      interest_rate: 5,
      total_repayment: 525,
      remaining_balance: 525,
      term: 3,
      status: 'active',
      next_payment_due: '2026-09-01T00:00:00.000Z',
      created_at: '2026-08-01T00:00:00.000Z',
      completed_at: null,
      defaulted_at: null,
    };

    it('should override active loan to completed (force settlement)', async () => {
      loansRepository.findDetailedById.mockResolvedValue(mockLoan);
      usersRepository.findByWallet.mockResolvedValue({
        id: 'admin-uuid',
        wallet_address: mockAdminWallet,
        role: UserRole.ADMIN,
        status: 'active',
        created_at: '2026-01-01T00:00:00.000Z',
        display_name: 'Admin',
        avatar_url: null,
        user_preferences: null,
      });

      const result = await service.overrideLoan(
        mockLoanId,
        {
          targetStatus: 'completed',
          reason: 'Manual off-chain wire payment received.',
          action: 'FORCE_SETTLE',
        },
        mockAdminWallet,
      );

      expect(result.status).toBe('completed');
      expect(result.previousStatus).toBe('active');
      expect(result.action).toBe('FORCE_SETTLE');
      expect(result.reason).toBe('Manual off-chain wire payment received.');
      expect(loansRepository.applyLoanOverride).toHaveBeenCalledWith(
        mockLoanId,
        expect.objectContaining({
          status: 'completed',
          remaining_balance: 0,
        }),
        'active',
        mockUserWallet,
        'loan-12345',
        'merchant-1',
      );
      expect(loansRepository.recordOverride).toHaveBeenCalledWith(
        expect.objectContaining({
          loan_id: mockLoanId,
          admin_wallet: mockAdminWallet,
          previous_status: 'active',
          new_status: 'completed',
          action: 'FORCE_SETTLE',
        }),
      );
    });

    it('should override pending loan to active (force activation)', async () => {
      loansRepository.findDetailedById.mockResolvedValue({
        ...mockLoan,
        status: 'pending',
      });
      usersRepository.findByWallet.mockResolvedValue(null);

      const result = await service.overrideLoan(
        mockLoanId,
        {
          targetStatus: 'active',
          reason: 'Manual activation approved by compliance.',
        },
        mockAdminWallet,
      );

      expect(result.status).toBe('active');
      expect(result.previousStatus).toBe('pending');
      expect(loansRepository.applyLoanOverride).toHaveBeenCalledWith(
        mockLoanId,
        expect.objectContaining({ status: 'active' }),
        'pending',
        mockUserWallet,
        'loan-12345',
        'merchant-1',
      );
    });

    it('should override defaulted loan back to active (reinstate)', async () => {
      loansRepository.findDetailedById.mockResolvedValue({
        ...mockLoan,
        status: 'defaulted',
        defaulted_at: '2026-08-15T00:00:00.000Z',
      });
      usersRepository.findByWallet.mockResolvedValue(null);

      const result = await service.overrideLoan(
        mockLoanId,
        {
          targetStatus: 'active',
          reason: 'Borrower cured default with partial payment agreement.',
          action: 'REINSTATE',
        },
        mockAdminWallet,
      );

      expect(result.status).toBe('active');
      expect(result.previousStatus).toBe('defaulted');
      expect(loansRepository.applyLoanOverride).toHaveBeenCalledWith(
        mockLoanId,
        expect.objectContaining({ status: 'active', defaulted_at: null }),
        'defaulted',
        mockUserWallet,
        'loan-12345',
        'merchant-1',
      );
    });

    it('should throw NotFoundException if loan does not exist', async () => {
      loansRepository.findDetailedById.mockResolvedValue(null);

      await expect(
        service.overrideLoan(
          'non-existent',
          { targetStatus: 'completed', reason: 'Test reason' },
          mockAdminWallet,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if targetStatus equals currentStatus', async () => {
      loansRepository.findDetailedById.mockResolvedValue(mockLoan);

      await expect(
        service.overrideLoan(
          mockLoanId,
          { targetStatus: 'active', reason: 'Same status test' },
          mockAdminWallet,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if loan is in a terminal state (completed)', async () => {
      loansRepository.findDetailedById.mockResolvedValue({
        ...mockLoan,
        status: 'completed',
      });

      await expect(
        service.overrideLoan(
          mockLoanId,
          { targetStatus: 'active', reason: 'Attempt to reopen completed loan' },
          mockAdminWallet,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException on invalid transition (e.g. active to pending)', async () => {
      loansRepository.findDetailedById.mockResolvedValue(mockLoan);

      await expect(
        service.overrideLoan(
          mockLoanId,
          { targetStatus: 'pending', reason: 'Attempt invalid transition' },
          mockAdminWallet,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
