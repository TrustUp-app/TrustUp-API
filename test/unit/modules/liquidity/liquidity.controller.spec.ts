import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { LiquidityController } from '../../../../src/modules/liquidity/liquidity.controller';
import { LiquidityService } from '../../../../src/modules/liquidity/liquidity.service';
import { IdempotencyInterceptor } from '../../../../src/common/interceptors/idempotency.interceptor';

describe('LiquidityController', () => {
  let controller: LiquidityController;
  let liquidityService: LiquidityService;

  const validWallet = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';

  const mockResponse = {
    unsignedXdr: 'AAAAAgAAAAA...',
    description: 'Withdraw 500 shares from liquidity pool',
    preview: {
      shares: 500,
      ownedShares: 925,
      remainingShares: 425,
      currentSharePrice: 1.08,
      expectedAmount: 540,
      feeBps: 50,
      fee: 2.7,
      netAmount: 537.3,
      availableLiquidity: 1500,
    },
  };

  const mockLiquidityService = {
    withdrawLiquidity: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LiquidityController],
      providers: [
        { provide: LiquidityService, useValue: mockLiquidityService },
        { provide: CACHE_MANAGER, useValue: { get: jest.fn(), set: jest.fn() } },
        IdempotencyInterceptor,
      ],
    }).compile();

    controller = module.get<LiquidityController>(LiquidityController);
    liquidityService = module.get<LiquidityService>(LiquidityService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('withdrawLiquidity', () => {
    const validDto = { shares: 500 };

    it('should return a withdrawal preview wrapped in the response envelope', async () => {
      mockLiquidityService.withdrawLiquidity.mockResolvedValue(mockResponse);

      const result = await controller.withdrawLiquidity({ wallet: validWallet }, validDto);

      expect(result).toEqual({
        success: true,
        data: mockResponse,
        message: 'Withdrawal transaction constructed successfully',
      });
      expect(liquidityService.withdrawLiquidity).toHaveBeenCalledWith(validWallet, validDto);
    });

    it('should propagate service errors to the caller', async () => {
      mockLiquidityService.withdrawLiquidity.mockRejectedValue(
        new Error('Liquidity contract unavailable'),
      );

      await expect(controller.withdrawLiquidity({ wallet: validWallet }, validDto)).rejects.toThrow(
        'Liquidity contract unavailable',
      );
    });
  });
});
