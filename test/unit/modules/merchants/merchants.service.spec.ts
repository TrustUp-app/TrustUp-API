import { Test, TestingModule } from '@nestjs/testing';
import { MerchantsService } from '../../../../src/modules/merchants/merchants.service';
import { MerchantsRepository } from '../../../../src/database/repositories/merchants.repository';
import { MerchantApplicationsRepository } from '../../../../src/database/repositories/merchant-applications.repository';
import { UsersRepository } from '../../../../src/database/repositories/users.repository';
import { LoansRepository } from '../../../../src/database/repositories/loans.repository';
import { MerchantScoreService } from '../../../../src/modules/merchants/merchant-score.service';
import { MerchantLeaderboardMetric } from '../../../../src/modules/merchants/dto/merchant-leaderboard-query.dto';
import { UserRole } from '../../../../src/common/enums/user-role.enum';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';

describe('MerchantsService', () => {
  let service: MerchantsService;
  let repository: jest.Mocked<MerchantsRepository>;
  let loansRepository: jest.Mocked<LoansRepository>;

  const activeMerchants = [
    {
      id: 'merchant-1',
      wallet: 'GMER1ABCDEFGHIJKLMNOPQRSTUVWXYZ234567890ABCDEFGHIJKLMNXX',
      name: 'TechStore',
      logo: 'https://example.com/tech-logo.png',
      category: 'Electronics',
      is_active: true,
    },
    {
      id: 'merchant-2',
      wallet: 'GMER2ABCDEFGHIJKLMNOPQRSTUVWXYZ234567890ABCDEFGHIJKL',
      name: 'FashionHub',
      logo: 'https://example.com/fashion-logo.png',
      category: 'Clothing',
      is_active: true,
    },
  ];

  const mockMerchantDetail = {
    id: 'merchant-1',
    wallet: 'GMER1ABCDEFGHIJKLMNOPQRSTUVWXYZ234567890ABCDEFGHIJKLMNXX',
    name: 'TechStore',
    logo: 'https://example.com/tech-logo.png',
    description: 'Electronics retailer',
    category: 'Electronics',
    website: 'https://techstore.com',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  };

  const mockMerchantsRepository = {
    findAll: jest.fn(),
    findAllActive: jest.fn(),
    findById: jest.fn(),
    findByWallet: jest.fn(),
    upsertMerchant: jest.fn(),
  };

  const mockMerchantApplicationsRepository = {
    create: jest.fn(),
    findById: jest.fn(),
    findPendingByWallet: jest.fn(),
    findAll: jest.fn(),
    updateStatus: jest.fn(),
  };

  const mockUsersRepository = {
    findByWallet: jest.fn(),
    findById: jest.fn(),
    updateRole: jest.fn(),
  };

  const mockLoansRepository = {
    findStatsByMerchant: jest.fn(),
    findStatsForAllMerchants: jest.fn(),
    findActiveByMerchant: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchantsService,
        MerchantScoreService,
        { provide: MerchantsRepository, useValue: mockMerchantsRepository },
        { provide: MerchantApplicationsRepository, useValue: mockMerchantApplicationsRepository },
        { provide: UsersRepository, useValue: mockUsersRepository },
        { provide: LoansRepository, useValue: mockLoansRepository },
      ],
    }).compile();

    service = module.get<MerchantsService>(MerchantsService);
    repository = module.get(MerchantsRepository);
    loansRepository = module.get(LoansRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('apply', () => {
    const testWallet = 'GBUQNNZ53JZZG7V77M44I3D3525EU4Y5M3VDFUBCU6ZCGUBNBUPK5E77';
    const applyDto = {
      name: 'New Merchant',
      logo: 'https://example.com/logo.png',
      category: 'Retail',
      description: 'My shop',
      website: 'https://shop.com',
    };

    it('should submit merchant application successfully', async () => {
      mockUsersRepository.findByWallet.mockResolvedValue({
        id: 'user-123',
        wallet_address: testWallet,
        role: UserRole.BORROWER,
      });
      mockMerchantsRepository.findByWallet.mockResolvedValue(null);
      mockMerchantApplicationsRepository.findPendingByWallet.mockResolvedValue(null);
      mockMerchantApplicationsRepository.create.mockResolvedValue({
        id: 'app-123',
        user_id: 'user-123',
        wallet: testWallet,
        name: applyDto.name,
        logo: applyDto.logo,
        category: applyDto.category,
        description: applyDto.description,
        website: applyDto.website,
        status: 'pending',
        created_at: '2026-08-27T00:00:00.000Z',
      });

      const result = await service.apply(testWallet, applyDto);

      expect(result).toEqual({
        id: 'app-123',
        wallet: testWallet,
        name: 'New Merchant',
        logo: 'https://example.com/logo.png',
        category: 'Retail',
        description: 'My shop',
        website: 'https://shop.com',
        status: 'pending',
        createdAt: '2026-08-27T00:00:00.000Z',
      });
      expect(mockMerchantApplicationsRepository.create).toHaveBeenCalledWith({
        user_id: 'user-123',
        wallet: testWallet,
        name: 'New Merchant',
        logo: 'https://example.com/logo.png',
        category: 'Retail',
        description: 'My shop',
        website: 'https://shop.com',
      });
    });

    it('should throw BadRequestException if user is already a merchant', async () => {
      mockUsersRepository.findByWallet.mockResolvedValue({
        id: 'user-123',
        wallet_address: testWallet,
        role: UserRole.MERCHANT,
      });

      await expect(service.apply(testWallet, applyDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if user already has a pending application', async () => {
      mockUsersRepository.findByWallet.mockResolvedValue({
        id: 'user-123',
        wallet_address: testWallet,
        role: UserRole.BORROWER,
      });
      mockMerchantsRepository.findByWallet.mockResolvedValue(null);
      mockMerchantApplicationsRepository.findPendingByWallet.mockResolvedValue({
        id: 'existing-app',
        status: 'pending',
      });

      await expect(service.apply(testWallet, applyDto)).rejects.toThrow(ConflictException);
    });
  });

  describe('listMerchants', () => {
    it('should return active merchants with correct pagination metadata', async () => {
      mockMerchantsRepository.findAll.mockResolvedValue({
        merchants: activeMerchants,
        total: 42,
      });

      const result = await service.listMerchants(20, 0);

      expect(result).toEqual({
        merchants: [
          {
            id: 'merchant-1',
            wallet: 'GMER1ABCDEFGHIJKLMNOPQRSTUVWXYZ234567890ABCDEFGHIJKLMNXX',
            name: 'TechStore',
            logo: 'https://example.com/tech-logo.png',
            category: 'Electronics',
            isActive: true,
          },
          {
            id: 'merchant-2',
            wallet: 'GMER2ABCDEFGHIJKLMNOPQRSTUVWXYZ234567890ABCDEFGHIJKL',
            name: 'FashionHub',
            logo: 'https://example.com/fashion-logo.png',
            category: 'Clothing',
            isActive: true,
          },
        ],
        total: 42,
        limit: 20,
        offset: 0,
      });
    });

    it('should always call repository with isActive: true — filters inactive merchants', async () => {
      mockMerchantsRepository.findAll.mockResolvedValue({
        merchants: activeMerchants,
        total: 2,
      });

      await service.listMerchants(20, 0);

      expect(repository.findAll).toHaveBeenCalledWith({
        limit: 20,
        offset: 0,
        isActive: true,
      });
    });

    it('should pass through limit and offset correctly to the repository', async () => {
      mockMerchantsRepository.findAll.mockResolvedValue({
        merchants: [activeMerchants[0]],
        total: 42,
      });

      const result = await service.listMerchants(1, 10);

      expect(repository.findAll).toHaveBeenCalledWith({
        limit: 1,
        offset: 10,
        isActive: true,
      });
      expect(result.limit).toBe(1);
      expect(result.offset).toBe(10);
    });

    it('should return an empty list when no active merchants exist', async () => {
      mockMerchantsRepository.findAll.mockResolvedValue({
        merchants: [],
        total: 0,
      });

      const result = await service.listMerchants(20, 0);

      expect(result.merchants).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should map is_active (snake_case) from DB to isActive (camelCase) in the DTO', async () => {
      mockMerchantsRepository.findAll.mockResolvedValue({
        merchants: [activeMerchants[0]],
        total: 1,
      });

      const result = await service.listMerchants(20, 0);

      expect(result.merchants[0]).toHaveProperty('isActive', true);
      expect(result.merchants[0]).not.toHaveProperty('is_active');
    });
  });

  describe('getMerchantById', () => {
    it('should return merchant details when a valid UUID is provided', async () => {
      mockMerchantsRepository.findById.mockResolvedValue(mockMerchantDetail);

      const result = await service.getMerchantById('merchant-1');

      expect(repository.findById).toHaveBeenCalledWith('merchant-1');
      expect(repository.findByWallet).not.toHaveBeenCalled();
      expect(result).toEqual({
        id: mockMerchantDetail.id,
        wallet: mockMerchantDetail.wallet,
        name: mockMerchantDetail.name,
        logo: mockMerchantDetail.logo,
        description: mockMerchantDetail.description,
        category: mockMerchantDetail.category,
        website: mockMerchantDetail.website,
        isActive: mockMerchantDetail.is_active,
        createdAt: mockMerchantDetail.created_at,
        updatedAt: mockMerchantDetail.updated_at,
      });
    });

    it('should return merchant details when a valid Stellar wallet is provided', async () => {
      mockMerchantsRepository.findByWallet.mockResolvedValue(mockMerchantDetail);

      const wallet = 'GMER1ABCDEFGHIJKLMNOPQRSTUVWXYZ234567890ABCDEFGHIJKLMNXX';
      const result = await service.getMerchantById(wallet);

      expect(repository.findByWallet).toHaveBeenCalledWith(wallet);
      expect(repository.findById).not.toHaveBeenCalled();
      expect(result.id).toEqual(mockMerchantDetail.id);
    });

    it('should throw NotFoundException if merchant is not found by ID', async () => {
      mockMerchantsRepository.findById.mockResolvedValue(null);

      await expect(service.getMerchantById('invalid-id')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if merchant is not found by wallet', async () => {
      mockMerchantsRepository.findByWallet.mockResolvedValue(null);

      const wallet = 'GMER1ABCDEFGHIJKLMNOPQRSTUVWXYZ234567890ABCDEFGHIJKLMNXX';
      await expect(service.getMerchantById(wallet)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getMerchantPortfolio', () => {
    it('should throw NotFoundException when the merchant does not exist', async () => {
      mockMerchantsRepository.findById.mockResolvedValue(null);

      await expect(service.getMerchantPortfolio('invalid-id', 20, 0)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should aggregate loan stats and return a paginated list of active loans', async () => {
      mockMerchantsRepository.findById.mockResolvedValue(mockMerchantDetail);
      mockLoansRepository.findStatsByMerchant.mockResolvedValue([
        {
          loan_amount: 400,
          remaining_balance: 200,
          status: 'active',
          created_at: '2026-01-01T00:00:00Z',
        },
        {
          loan_amount: 300,
          remaining_balance: 0,
          status: 'completed',
          created_at: '2026-01-01T00:00:00Z',
        },
      ]);
      mockLoansRepository.findActiveByMerchant.mockResolvedValue({
        loans: [
          {
            id: 'loan-1',
            loan_id: 'chain-loan-1',
            amount: 400,
            remaining_balance: 200,
            status: 'active',
            next_payment_due: '2026-02-01T00:00:00Z',
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
        total: 1,
      });

      const result = await service.getMerchantPortfolio('merchant-1', 20, 0);

      expect(loansRepository.findStatsByMerchant).toHaveBeenCalledWith('merchant-1');
      expect(loansRepository.findActiveByMerchant).toHaveBeenCalledWith('merchant-1', {
        limit: 20,
        offset: 0,
      });
      expect(result.merchantId).toBe('merchant-1');
      expect(result.totalLoans).toBe(2);
      expect(result.activeLoansCount).toBe(1);
      expect(result.completedLoansCount).toBe(1);
      expect(result.totalVolume).toBe(700);
      expect(result.outstandingBalance).toBe(200);
      expect(result.repaymentRate).toBe(50);
      expect(result.activeLoans).toEqual([
        {
          id: 'loan-1',
          loanId: 'chain-loan-1',
          amount: 400,
          remainingBalance: 200,
          status: 'active',
          nextPaymentDue: '2026-02-01T00:00:00Z',
          createdAt: '2026-01-01T00:00:00Z',
        },
      ]);
      expect(result.pagination).toEqual({ limit: 20, offset: 0, total: 1 });
    });

    it('should resolve the merchant by wallet when given a Stellar address', async () => {
      const wallet = 'GMER1ABCDEFGHIJKLMNOPQRSTUVWXYZ234567890ABCDEFGHIJKLMNXX';
      mockMerchantsRepository.findByWallet.mockResolvedValue(mockMerchantDetail);
      mockLoansRepository.findStatsByMerchant.mockResolvedValue([]);
      mockLoansRepository.findActiveByMerchant.mockResolvedValue({ loans: [], total: 0 });

      await service.getMerchantPortfolio(wallet, 20, 0);

      expect(repository.findByWallet).toHaveBeenCalledWith(wallet);
      expect(repository.findById).not.toHaveBeenCalled();
    });
  });

  describe('getMerchantAnalytics', () => {
    it('should throw NotFoundException when the merchant does not exist', async () => {
      mockMerchantsRepository.findById.mockResolvedValue(null);

      await expect(service.getMerchantAnalytics('invalid-id', 6)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should bucket loans into the requested number of trailing months', async () => {
      mockMerchantsRepository.findById.mockResolvedValue(mockMerchantDetail);
      mockLoansRepository.findStatsByMerchant.mockResolvedValue([]);

      const result = await service.getMerchantAnalytics('merchant-1', 3);

      expect(result.merchantId).toBe('merchant-1');
      expect(result.months).toHaveLength(3);
      expect(result.months[2].month).toBe(
        `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
      );
    });

    it('should compute per-month volume, loanCount, defaultRate and avgLoanSize', async () => {
      mockMerchantsRepository.findById.mockResolvedValue(mockMerchantDetail);

      const now = new Date();
      const thisMonthIso = new Date(now.getFullYear(), now.getMonth(), 15).toISOString();

      mockLoansRepository.findStatsByMerchant.mockResolvedValue([
        { loan_amount: 100, remaining_balance: 0, status: 'completed', created_at: thisMonthIso },
        { loan_amount: 300, remaining_balance: 300, status: 'defaulted', created_at: thisMonthIso },
      ]);

      const result = await service.getMerchantAnalytics('merchant-1', 1);

      expect(result.months).toHaveLength(1);
      expect(result.months[0].volume).toBe(400);
      expect(result.months[0].loanCount).toBe(2);
      expect(result.months[0].defaultRate).toBe(50);
      expect(result.months[0].avgLoanSize).toBe(200);
      expect(result.summary).toEqual({
        totalVolume: 400,
        totalLoans: 2,
        avgLoanSize: 200,
        defaultRate: 50,
      });
    });

    it('should return zeroed buckets when the merchant has no loans', async () => {
      mockMerchantsRepository.findById.mockResolvedValue(mockMerchantDetail);
      mockLoansRepository.findStatsByMerchant.mockResolvedValue([]);

      const result = await service.getMerchantAnalytics('merchant-1', 2);

      expect(result.months).toEqual(
        result.months.map((m) => ({
          ...m,
          volume: 0,
          loanCount: 0,
          defaultRate: 0,
          avgLoanSize: 0,
        })),
      );
      expect(result.summary).toEqual({
        totalVolume: 0,
        totalLoans: 0,
        avgLoanSize: 0,
        defaultRate: 0,
      });
    });
  });

  describe('getLeaderboard', () => {
    it('should rank active merchants by totalVolume by default and assign 1-indexed ranks', async () => {
      mockMerchantsRepository.findAllActive.mockResolvedValue([
        {
          id: 'merchant-1',
          wallet: 'GMER1',
          name: 'TechStore',
          logo: 'logo1.png',
          category: 'Electronics',
          is_active: true,
        },
        {
          id: 'merchant-2',
          wallet: 'GMER2',
          name: 'FashionHub',
          logo: 'logo2.png',
          category: 'Clothing',
          is_active: true,
        },
      ]);
      mockLoansRepository.findStatsForAllMerchants.mockResolvedValue([
        {
          merchant_id: 'merchant-1',
          loan_amount: 100,
          remaining_balance: 0,
          status: 'completed',
          created_at: '2026-01-01T00:00:00Z',
        },
        {
          merchant_id: 'merchant-2',
          loan_amount: 900,
          remaining_balance: 0,
          status: 'completed',
          created_at: '2026-01-01T00:00:00Z',
        },
      ]);

      const result = await service.getLeaderboard(MerchantLeaderboardMetric.VOLUME, 20, 0);

      expect(result.metric).toBe(MerchantLeaderboardMetric.VOLUME);
      expect(result.data.map((e) => e.merchantId)).toEqual(['merchant-2', 'merchant-1']);
      expect(result.data[0].rank).toBe(1);
      expect(result.data[1].rank).toBe(2);
      expect(result.pagination).toEqual({ limit: 20, offset: 0, total: 2 });
    });

    it('should rank merchants by the requested metric', async () => {
      mockMerchantsRepository.findAllActive.mockResolvedValue([
        {
          id: 'merchant-1',
          wallet: 'GMER1',
          name: 'TechStore',
          logo: 'logo1.png',
          category: 'Electronics',
          is_active: true,
        },
        {
          id: 'merchant-2',
          wallet: 'GMER2',
          name: 'FashionHub',
          logo: 'logo2.png',
          category: 'Clothing',
          is_active: true,
        },
      ]);
      mockLoansRepository.findStatsForAllMerchants.mockResolvedValue([
        {
          merchant_id: 'merchant-1',
          loan_amount: 900,
          remaining_balance: 0,
          status: 'completed',
          created_at: '2026-01-01T00:00:00Z',
        },
        {
          merchant_id: 'merchant-2',
          loan_amount: 100,
          remaining_balance: 0,
          status: 'completed',
          created_at: '2026-01-01T00:00:00Z',
        },
        {
          merchant_id: 'merchant-2',
          loan_amount: 100,
          remaining_balance: 0,
          status: 'completed',
          created_at: '2026-01-01T00:00:00Z',
        },
      ]);

      const result = await service.getLeaderboard(MerchantLeaderboardMetric.TOTAL_LOANS, 20, 0);

      expect(result.data.map((e) => e.merchantId)).toEqual(['merchant-2', 'merchant-1']);
    });

    it('should treat merchants without any loans as having zeroed stats instead of throwing', async () => {
      mockMerchantsRepository.findAllActive.mockResolvedValue([
        {
          id: 'merchant-1',
          wallet: 'GMER1',
          name: 'TechStore',
          logo: 'logo1.png',
          category: 'Electronics',
          is_active: true,
        },
      ]);
      mockLoansRepository.findStatsForAllMerchants.mockResolvedValue([]);

      const result = await service.getLeaderboard(MerchantLeaderboardMetric.VOLUME, 20, 0);

      expect(result.data[0]).toMatchObject({
        merchantId: 'merchant-1',
        score: 0,
        tier: 'poor',
        totalVolume: 0,
        repaymentRate: 0,
        totalLoans: 0,
      });
    });

    it('should apply pagination and offset ranks accordingly', async () => {
      mockMerchantsRepository.findAllActive.mockResolvedValue([
        { id: 'merchant-1', wallet: 'GMER1', name: 'A', logo: '', category: '', is_active: true },
        { id: 'merchant-2', wallet: 'GMER2', name: 'B', logo: '', category: '', is_active: true },
        { id: 'merchant-3', wallet: 'GMER3', name: 'C', logo: '', category: '', is_active: true },
      ]);
      mockLoansRepository.findStatsForAllMerchants.mockResolvedValue([
        {
          merchant_id: 'merchant-1',
          loan_amount: 300,
          remaining_balance: 0,
          status: 'completed',
          created_at: '2026-01-01T00:00:00Z',
        },
        {
          merchant_id: 'merchant-2',
          loan_amount: 200,
          remaining_balance: 0,
          status: 'completed',
          created_at: '2026-01-01T00:00:00Z',
        },
        {
          merchant_id: 'merchant-3',
          loan_amount: 100,
          remaining_balance: 0,
          status: 'completed',
          created_at: '2026-01-01T00:00:00Z',
        },
      ]);

      const result = await service.getLeaderboard(MerchantLeaderboardMetric.VOLUME, 1, 1);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].merchantId).toBe('merchant-2');
      expect(result.data[0].rank).toBe(2);
      expect(result.pagination).toEqual({ limit: 1, offset: 1, total: 3 });
    });
  });
});
