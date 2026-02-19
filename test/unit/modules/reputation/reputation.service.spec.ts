import { Test, TestingModule } from '@nestjs/testing';
import { ReputationService } from '../../../../src/modules/reputation/reputation.service';
import { ReputationContractClient } from '../../../../src/blockchain/contracts/reputation-contract.client';
import { SupabaseService } from '../../../../src/database/supabase.client';

describe('ReputationService', () => {
  let service: ReputationService;

  const mockContractClient = {
    getScore: jest.fn(),
  };

  const mockSupabaseClient = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(),
  };

  const mockSupabaseService = {
    getClient: jest.fn().mockReturnValue(mockSupabaseClient),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReputationService,
        { provide: ReputationContractClient, useValue: mockContractClient },
        { provide: SupabaseService, useValue: mockSupabaseService },
      ],
    }).compile();

    service = module.get<ReputationService>(ReputationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ----------------------------------------------------------------
  // getReputation – score resolution
  // ----------------------------------------------------------------

  describe('getReputation', () => {
    const wallet = 'GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFG';

    it('should return on-chain score when contract responds', async () => {
      mockContractClient.getScore.mockResolvedValue(85);

      const result = await service.getReputation(wallet);

      expect(result.wallet).toBe(wallet);
      expect(result.score).toBe(85);
      expect(result.tier).toBe('silver');
      expect(mockContractClient.getScore).toHaveBeenCalledWith(wallet);
    });

    it('should fall back to cached score when contract fails', async () => {
      mockContractClient.getScore.mockRejectedValue(new Error('RPC timeout'));
      mockSupabaseClient.single.mockResolvedValue({
        data: { score: 70 },
        error: null,
      });

      const result = await service.getReputation(wallet);

      expect(result.score).toBe(70);
      expect(result.tier).toBe('bronze');
    });

    it('should use default score (50) when both sources fail', async () => {
      mockContractClient.getScore.mockRejectedValue(new Error('RPC timeout'));
      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: { message: 'not found' },
      });

      const result = await service.getReputation(wallet);

      expect(result.score).toBe(50);
      expect(result.tier).toBe('poor');
    });

    it('should include interestRate and maxCredit in the response', async () => {
      mockContractClient.getScore.mockResolvedValue(92);

      const result = await service.getReputation(wallet);

      expect(result.interestRate).toBeDefined();
      expect(result.maxCredit).toBeDefined();
      expect(result.lastUpdated).toBeDefined();
    });
  });

  // ----------------------------------------------------------------
  // normalizeScore
  // ----------------------------------------------------------------

  describe('normalizeScore', () => {
    it('should clamp values above 100 to 100', () => {
      expect(service.normalizeScore(150)).toBe(100);
    });

    it('should clamp negative values to 0', () => {
      expect(service.normalizeScore(-10)).toBe(0);
    });

    it('should round fractional values', () => {
      expect(service.normalizeScore(72.6)).toBe(73);
      expect(service.normalizeScore(72.4)).toBe(72);
    });

    it('should pass through valid integers unchanged', () => {
      expect(service.normalizeScore(50)).toBe(50);
      expect(service.normalizeScore(0)).toBe(0);
      expect(service.normalizeScore(100)).toBe(100);
    });
  });

  // ----------------------------------------------------------------
  // getTierFromScore
  // ----------------------------------------------------------------

  describe('getTierFromScore', () => {
    it('should return gold for scores 90–100', () => {
      expect(service.getTierFromScore(100)).toBe('gold');
      expect(service.getTierFromScore(95)).toBe('gold');
      expect(service.getTierFromScore(90)).toBe('gold');
    });

    it('should return silver for scores 75–89', () => {
      expect(service.getTierFromScore(89)).toBe('silver');
      expect(service.getTierFromScore(80)).toBe('silver');
      expect(service.getTierFromScore(75)).toBe('silver');
    });

    it('should return bronze for scores 60–74', () => {
      expect(service.getTierFromScore(74)).toBe('bronze');
      expect(service.getTierFromScore(65)).toBe('bronze');
      expect(service.getTierFromScore(60)).toBe('bronze');
    });

    it('should return poor for scores below 60', () => {
      expect(service.getTierFromScore(59)).toBe('poor');
      expect(service.getTierFromScore(30)).toBe('poor');
      expect(service.getTierFromScore(0)).toBe('poor');
    });
  });

  // ----------------------------------------------------------------
  // getInterestRateFromScore
  // ----------------------------------------------------------------

  describe('getInterestRateFromScore', () => {
    it('should return rate in gold range (4–6%) for gold tier', () => {
      const rate = service.getInterestRateFromScore(95);
      expect(rate).toBeGreaterThanOrEqual(4);
      expect(rate).toBeLessThanOrEqual(6);
    });

    it('should return rate in silver range (6–8%) for silver tier', () => {
      const rate = service.getInterestRateFromScore(80);
      expect(rate).toBeGreaterThanOrEqual(6);
      expect(rate).toBeLessThanOrEqual(8);
    });

    it('should return rate in bronze range (8–10%) for bronze tier', () => {
      const rate = service.getInterestRateFromScore(65);
      expect(rate).toBeGreaterThanOrEqual(8);
      expect(rate).toBeLessThanOrEqual(10);
    });

    it('should return rate in poor range (10–15%) for poor tier', () => {
      const rate = service.getInterestRateFromScore(30);
      expect(rate).toBeGreaterThanOrEqual(10);
      expect(rate).toBeLessThanOrEqual(15);
    });

    it('should give a lower rate for a higher score within the same tier', () => {
      const highRate = service.getInterestRateFromScore(90);
      const lowRate = service.getInterestRateFromScore(99);
      expect(lowRate).toBeLessThanOrEqual(highRate);
    });
  });

  // ----------------------------------------------------------------
  // getMaxCreditFromScore
  // ----------------------------------------------------------------

  describe('getMaxCreditFromScore', () => {
    it('should return credit in gold range ($5000–$10000) for gold tier', () => {
      const credit = service.getMaxCreditFromScore(95);
      expect(credit).toBeGreaterThanOrEqual(5000);
      expect(credit).toBeLessThanOrEqual(10000);
    });

    it('should return credit in silver range ($2000–$5000) for silver tier', () => {
      const credit = service.getMaxCreditFromScore(80);
      expect(credit).toBeGreaterThanOrEqual(2000);
      expect(credit).toBeLessThanOrEqual(5000);
    });

    it('should return credit in bronze range ($1000–$2000) for bronze tier', () => {
      const credit = service.getMaxCreditFromScore(65);
      expect(credit).toBeGreaterThanOrEqual(1000);
      expect(credit).toBeLessThanOrEqual(2000);
    });

    it('should return credit in poor range ($0–$1000) for poor tier', () => {
      const credit = service.getMaxCreditFromScore(30);
      expect(credit).toBeGreaterThanOrEqual(0);
      expect(credit).toBeLessThanOrEqual(1000);
    });

    it('should give higher credit for higher score within the same tier', () => {
      const lowCredit = service.getMaxCreditFromScore(90);
      const highCredit = service.getMaxCreditFromScore(99);
      expect(highCredit).toBeGreaterThanOrEqual(lowCredit);
    });
  });

  // ----------------------------------------------------------------
  // buildReputationResponse
  // ----------------------------------------------------------------

  describe('buildReputationResponse', () => {
    it('should return a complete ReputationResponseDto', () => {
      const dto = service.buildReputationResponse('GWALLET', 82);

      expect(dto.wallet).toBe('GWALLET');
      expect(dto.score).toBe(82);
      expect(dto.tier).toBe('silver');
      expect(dto.interestRate).toBeDefined();
      expect(dto.maxCredit).toBeDefined();
      expect(dto.lastUpdated).toBeDefined();
    });
  });
});
