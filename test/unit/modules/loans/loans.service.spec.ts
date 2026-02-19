import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { LoansService } from '../../../../src/modules/loans/loans.service';
import { ReputationService } from '../../../../src/modules/reputation/reputation.service';
import { MerchantsService } from '../../../../src/modules/merchants/merchants.service';
import { LoanQuoteRequestDto } from '../../../../src/modules/loans/dto/loan-quote-request.dto';

describe('LoansService', () => {
  let service: LoansService;
  let reputationService: ReputationService;
  let merchantsService: MerchantsService;

  const activeMerchant = {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    wallet: 'GMERCHANT1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890AB',
    name: 'TechStore',
    logo: 'https://example.com/logo.png',
    category: 'Electronics',
    isActive: true,
  };

  const inactiveMerchant = { ...activeMerchant, isActive: false };

  const mockReputationService = {
    getReputation: jest.fn(),
  };

  const mockMerchantsService = {
    findById: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoansService,
        { provide: ReputationService, useValue: mockReputationService },
        { provide: MerchantsService, useValue: mockMerchantsService },
      ],
    }).compile();

    service = module.get<LoansService>(LoansService);
    reputationService = module.get<ReputationService>(ReputationService);
    merchantsService = module.get<MerchantsService>(MerchantsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateLoanQuote', () => {
    const wallet = 'GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFG';
    const baseDto: LoanQuoteRequestDto = {
      amount: 500,
      merchant: activeMerchant.id,
      term: 4,
    };

    it('should calculate a quote for a gold tier user', async () => {
      mockMerchantsService.findById.mockResolvedValue(activeMerchant);
      mockReputationService.getReputation.mockResolvedValue({
        wallet,
        score: 90,
        tier: 'gold',
        maxCredit: 10000,
        lastUpdated: new Date().toISOString(),
      });

      const result = await service.calculateLoanQuote(wallet, baseDto);

      expect(result.amount).toBe(500);
      expect(result.guarantee).toBe(100);
      expect(result.loanAmount).toBe(400);
      expect(result.interestRate).toBeGreaterThanOrEqual(4);
      expect(result.interestRate).toBeLessThanOrEqual(6);
      expect(result.term).toBe(4);
      expect(result.totalRepayment).toBeGreaterThan(400);
      expect(result.schedule).toHaveLength(4);
    });

    it('should calculate a quote for a silver tier user', async () => {
      mockMerchantsService.findById.mockResolvedValue(activeMerchant);
      mockReputationService.getReputation.mockResolvedValue({
        wallet,
        score: 75,
        tier: 'silver',
        maxCredit: 5000,
        lastUpdated: new Date().toISOString(),
      });

      const result = await service.calculateLoanQuote(wallet, baseDto);

      expect(result.interestRate).toBeGreaterThanOrEqual(6);
      expect(result.interestRate).toBeLessThanOrEqual(8);
      expect(result.guarantee).toBe(100);
      expect(result.loanAmount).toBe(400);
    });

    it('should calculate a quote for a bronze tier user', async () => {
      mockMerchantsService.findById.mockResolvedValue(activeMerchant);
      mockReputationService.getReputation.mockResolvedValue({
        wallet,
        score: 50,
        tier: 'bronze',
        maxCredit: 2000,
        lastUpdated: new Date().toISOString(),
      });

      const result = await service.calculateLoanQuote(wallet, baseDto);

      expect(result.interestRate).toBeGreaterThanOrEqual(8);
      expect(result.interestRate).toBeLessThanOrEqual(10);
    });

    it('should calculate a quote for a poor tier user', async () => {
      mockMerchantsService.findById.mockResolvedValue(activeMerchant);
      mockReputationService.getReputation.mockResolvedValue({
        wallet,
        score: 10,
        tier: 'poor',
        maxCredit: 500,
        lastUpdated: new Date().toISOString(),
      });

      const result = await service.calculateLoanQuote(wallet, baseDto);

      expect(result.interestRate).toBeGreaterThanOrEqual(10);
      expect(result.interestRate).toBeLessThanOrEqual(15);
    });

    it('should throw NotFoundException when merchant does not exist', async () => {
      mockMerchantsService.findById.mockResolvedValue(null);

      await expect(
        service.calculateLoanQuote(wallet, baseDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when merchant is inactive', async () => {
      mockMerchantsService.findById.mockResolvedValue(inactiveMerchant);

      await expect(
        service.calculateLoanQuote(wallet, baseDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when amount exceeds max credit', async () => {
      mockMerchantsService.findById.mockResolvedValue(activeMerchant);
      mockReputationService.getReputation.mockResolvedValue({
        wallet,
        score: 10,
        tier: 'poor',
        maxCredit: 500,
        lastUpdated: new Date().toISOString(),
      });

      const overLimitDto: LoanQuoteRequestDto = {
        amount: 1000,
        merchant: activeMerchant.id,
        term: 4,
      };

      await expect(
        service.calculateLoanQuote(wallet, overLimitDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('calculateInterestRate', () => {
    it('should return rate within gold range for gold tier', () => {
      const rate = service.calculateInterestRate(90, 'gold');
      expect(rate).toBeGreaterThanOrEqual(4);
      expect(rate).toBeLessThanOrEqual(6);
    });

    it('should return lower rate for higher score within a tier', () => {
      const highScoreRate = service.calculateInterestRate(99, 'gold');
      const lowScoreRate = service.calculateInterestRate(80, 'gold');
      expect(highScoreRate).toBeLessThanOrEqual(lowScoreRate);
    });

    it('should return rate within silver range for silver tier', () => {
      const rate = service.calculateInterestRate(70, 'silver');
      expect(rate).toBeGreaterThanOrEqual(6);
      expect(rate).toBeLessThanOrEqual(8);
    });

    it('should return rate within bronze range for bronze tier', () => {
      const rate = service.calculateInterestRate(50, 'bronze');
      expect(rate).toBeGreaterThanOrEqual(8);
      expect(rate).toBeLessThanOrEqual(10);
    });

    it('should return rate within poor range for poor tier', () => {
      const rate = service.calculateInterestRate(20, 'poor');
      expect(rate).toBeGreaterThanOrEqual(10);
      expect(rate).toBeLessThanOrEqual(15);
    });

    it('should fall back to poor rates for unknown tier', () => {
      const rate = service.calculateInterestRate(50, 'unknown');
      expect(rate).toBeGreaterThanOrEqual(10);
      expect(rate).toBeLessThanOrEqual(15);
    });
  });

  describe('calculateTotalRepayment', () => {
    it('should calculate correctly for standard inputs', () => {
      // $400 at 8% APR for 4 months: 400 * (1 + 0.08 * 4/12) = 400 + 10.67 = 410.67
      const result = service.calculateTotalRepayment(400, 8, 4);
      expect(result).toBeCloseTo(410.67, 2);
    });

    it('should return principal when interest rate is 0', () => {
      const result = service.calculateTotalRepayment(400, 0, 4);
      expect(result).toBe(400);
    });

    it('should calculate correctly for 12-month term', () => {
      // $1000 at 10% for 12 months: 1000 * (1 + 0.10 * 1) = 1100
      const result = service.calculateTotalRepayment(1000, 10, 12);
      expect(result).toBe(1100);
    });

    it('should calculate correctly for 1-month term', () => {
      // $500 at 12% for 1 month: 500 * (1 + 0.12 * 1/12) = 505
      const result = service.calculateTotalRepayment(500, 12, 1);
      expect(result).toBe(505);
    });
  });

  describe('generateSchedule', () => {
    it('should generate correct number of payments', () => {
      const schedule = service.generateSchedule(400, 4);
      expect(schedule).toHaveLength(4);
    });

    it('should number payments sequentially starting at 1', () => {
      const schedule = service.generateSchedule(300, 3);
      expect(schedule[0].paymentNumber).toBe(1);
      expect(schedule[1].paymentNumber).toBe(2);
      expect(schedule[2].paymentNumber).toBe(3);
    });

    it('should have total payments summing to totalRepayment', () => {
      const total = 410.67;
      const schedule = service.generateSchedule(total, 4);
      const sum = schedule.reduce((acc, p) => acc + p.amount, 0);
      expect(sum).toBeCloseTo(total, 2);
    });

    it('should set due dates approximately 30 days apart', () => {
      const schedule = service.generateSchedule(400, 4);
      for (let i = 1; i < schedule.length; i++) {
        const prev = new Date(schedule[i - 1].dueDate);
        const curr = new Date(schedule[i].dueDate);
        const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
        // Months vary from 28–31 days
        expect(diffDays).toBeGreaterThanOrEqual(27);
        expect(diffDays).toBeLessThanOrEqual(32);
      }
    });

    it('should generate a single payment for 1-month term', () => {
      const schedule = service.generateSchedule(505, 1);
      expect(schedule).toHaveLength(1);
      expect(schedule[0].amount).toBe(505);
      expect(schedule[0].paymentNumber).toBe(1);
    });

    it('should include valid ISO date strings', () => {
      const schedule = service.generateSchedule(400, 2);
      for (const payment of schedule) {
        expect(new Date(payment.dueDate).toISOString()).toBe(payment.dueDate);
      }
    });
  });
});
