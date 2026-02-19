import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ReputationController } from '../../../../src/modules/reputation/reputation.controller';
import { ReputationService, ReputationData } from '../../../../src/modules/reputation/reputation.service';

describe('ReputationController', () => {
  let controller: ReputationController;
  let reputationService: ReputationService;

  const mockReputationService = {
    getReputation: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReputationController],
      providers: [
        { provide: ReputationService, useValue: mockReputationService },
        { provide: JwtService, useValue: { verify: jest.fn() } },
      ],
    }).compile();

    controller = module.get<ReputationController>(ReputationController);
    reputationService = module.get<ReputationService>(ReputationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getMyReputation', () => {
    const wallet = 'GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFG';

    it('should return the authenticated user\'s reputation', async () => {
      const reputationData: ReputationData = {
        wallet,
        score: 85,
        tier: 'silver',
        interestRate: 6.57,
        maxCredit: 4143,
        lastUpdated: '2026-02-13T10:00:00.000Z',
      };
      mockReputationService.getReputation.mockResolvedValue(reputationData);

      const result = await controller.getMyReputation(wallet);

      expect(result.wallet).toBe(wallet);
      expect(result.score).toBe(85);
      expect(result.tier).toBe('silver');
      expect(result.interestRate).toBe(6.57);
      expect(result.maxCredit).toBe(4143);
      expect(result.lastUpdated).toBe('2026-02-13T10:00:00.000Z');
      expect(reputationService.getReputation).toHaveBeenCalledWith(wallet);
    });
  });

  describe('getReputationByWallet', () => {
    const wallet = 'GXYZ1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFG';

    it('should return reputation for the given wallet', async () => {
      const reputationData: ReputationData = {
        wallet,
        score: 95,
        tier: 'gold',
        interestRate: 4.5,
        maxCredit: 7500,
        lastUpdated: '2026-02-13T10:00:00.000Z',
      };
      mockReputationService.getReputation.mockResolvedValue(reputationData);

      const result = await controller.getReputationByWallet(wallet);

      expect(result.wallet).toBe(wallet);
      expect(result.score).toBe(95);
      expect(result.tier).toBe('gold');
      expect(reputationService.getReputation).toHaveBeenCalledWith(wallet);
    });

    it('should return default reputation for unknown wallet', async () => {
      const unknownWallet = 'GUNKNOWN234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCD';
      const defaultData: ReputationData = {
        wallet: unknownWallet,
        score: 50,
        tier: 'poor',
        interestRate: 12.5,
        maxCredit: 500,
        lastUpdated: '2026-02-13T10:00:00.000Z',
      };
      mockReputationService.getReputation.mockResolvedValue(defaultData);

      const result = await controller.getReputationByWallet(unknownWallet);

      expect(result.score).toBe(50);
      expect(result.tier).toBe('poor');
    });
  });
});
