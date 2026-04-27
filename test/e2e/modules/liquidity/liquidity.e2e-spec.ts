import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { LiquidityController } from '../../../../src/modules/liquidity/liquidity.controller';
import { LiquidityService } from '../../../../src/modules/liquidity/liquidity.service';
import { JwtAuthGuard } from '../../../../src/common/guards/jwt-auth.guard';

describe('LiquidityController (e2e)', () => {
  let app: NestFastifyApplication;

  const validWallet = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';

  const mockPoolOverview = {
    totalLiquidity: 1500000,
    apy: 8.5,
    utilization: 65.2,
    totalInvestors: 245,
    activeLoans: 124,
  };

  const mockInvestmentSummary = {
    totalInvested: 1000.0,
    currentValue: 1085.5,
    earnings: 85.5,
    earningsPercent: 8.55,
    apy: 9.2,
    poolSize: 2500000.0,
    activeLoans: 142,
    shares: 950.1234567,
  };

  const mockDepositResponse = {
    unsignedXdr: 'AAAAAgAAAAA...',
    description: 'Deposit $500 into liquidity pool',
    preview: {
      depositAmount: 500,
      sharesReceived: 462.9629629,
      currentSharePrice: 1.08,
      newTotalValue: 2500500,
      currentTotalLiquidity: 2500000,
    },
  };

  const mockWithdrawResponse = {
    unsignedXdr: 'AAAAAgAAAAB...',
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
      availableLiquidity: 300000,
    },
  };

  const mockLiquidityService = {
    getPoolOverview: jest.fn(),
    getInvestmentSummary: jest.fn(),
    depositLiquidity: jest.fn(),
    withdrawLiquidity: jest.fn(),
  };

  const mockJwtAuthGuard = {
    canActivate: jest.fn((context) => {
      const req = context.switchToHttp().getRequest();
      const authHeader = req.headers['authorization'];

      if (!authHeader?.startsWith('Bearer ')) {
        throw new UnauthorizedException('No token provided');
      }

      req.user = { wallet: validWallet };
      return true;
    }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      controllers: [LiquidityController],
      providers: [
        { provide: LiquidityService, useValue: mockLiquidityService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockJwtAuthGuard.canActivate.mockImplementation((context) => {
      const req = context.switchToHttp().getRequest();
      const authHeader = req.headers['authorization'];
      if (!authHeader?.startsWith('Bearer ')) {
        throw new UnauthorizedException('No token provided');
      }
      req.user = { wallet: validWallet };
      return true;
    });
  });

  // ─── GET /liquidity/overview ──────────────────────────────────────────────

  describe('GET /liquidity/overview', () => {
    it('should return pool overview without authentication', async () => {
      mockLiquidityService.getPoolOverview.mockResolvedValue(mockPoolOverview);

      const res = await app.inject({
        method: 'GET',
        url: '/liquidity/overview',
      });

      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.payload);
      expect(body).toEqual({
        success: true,
        data: mockPoolOverview,
        message: 'Pool overview retrieved successfully',
      });

      expect(mockLiquidityService.getPoolOverview).toHaveBeenCalledTimes(1);
    });
  });

  // ─── GET /liquidity/my-summary ────────────────────────────────────────────

  describe('GET /liquidity/my-summary', () => {
    it('should return investment summary for authenticated user', async () => {
      mockLiquidityService.getInvestmentSummary.mockResolvedValue(mockInvestmentSummary);

      const res = await app.inject({
        method: 'GET',
        url: '/liquidity/my-summary',
        headers: { authorization: 'Bearer valid.jwt.token' },
      });

      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.payload);
      expect(body).toEqual({
        success: true,
        data: mockInvestmentSummary,
        message: 'Investment summary retrieved successfully',
      });

      expect(mockLiquidityService.getInvestmentSummary).toHaveBeenCalledWith(validWallet);
    });

    it('should return 401 when no bearer token is provided', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/liquidity/my-summary',
      });

      expect(res.statusCode).toBe(401);
      expect(mockLiquidityService.getInvestmentSummary).not.toHaveBeenCalled();
    });
  });

  // ─── POST /liquidity/deposit ──────────────────────────────────────────────

  describe('POST /liquidity/deposit', () => {
    it('should return unsigned XDR and deposit preview for a valid amount', async () => {
      mockLiquidityService.depositLiquidity.mockResolvedValue(mockDepositResponse);

      const res = await app.inject({
        method: 'POST',
        url: '/liquidity/deposit',
        headers: {
          authorization: 'Bearer valid.jwt.token',
          'content-type': 'application/json',
        },
        payload: JSON.stringify({ amount: 500 }),
      });

      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.payload);
      expect(body).toEqual({
        success: true,
        data: mockDepositResponse,
        message: 'Deposit transaction constructed successfully',
      });

      expect(mockLiquidityService.depositLiquidity).toHaveBeenCalledWith(
        validWallet,
        { amount: 500 },
      );
    });

    it('should return 400 when amount is below the $10 minimum', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/liquidity/deposit',
        headers: {
          authorization: 'Bearer valid.jwt.token',
          'content-type': 'application/json',
        },
        payload: JSON.stringify({ amount: 5 }),
      });

      expect(res.statusCode).toBe(400);
      expect(mockLiquidityService.depositLiquidity).not.toHaveBeenCalled();
    });

    it('should return 400 when amount exceeds the $1,000,000 maximum', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/liquidity/deposit',
        headers: {
          authorization: 'Bearer valid.jwt.token',
          'content-type': 'application/json',
        },
        payload: JSON.stringify({ amount: 2_000_000 }),
      });

      expect(res.statusCode).toBe(400);
      expect(mockLiquidityService.depositLiquidity).not.toHaveBeenCalled();
    });

    it('should return 401 when no bearer token is provided', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/liquidity/deposit',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ amount: 500 }),
      });

      expect(res.statusCode).toBe(401);
      expect(mockLiquidityService.depositLiquidity).not.toHaveBeenCalled();
    });
  });

  // ─── POST /liquidity/withdraw ─────────────────────────────────────────────

  describe('POST /liquidity/withdraw', () => {
    it('should return unsigned XDR and withdrawal preview for valid shares', async () => {
      mockLiquidityService.withdrawLiquidity.mockResolvedValue(mockWithdrawResponse);

      const res = await app.inject({
        method: 'POST',
        url: '/liquidity/withdraw',
        headers: {
          authorization: 'Bearer valid.jwt.token',
          'content-type': 'application/json',
        },
        payload: JSON.stringify({ shares: 500 }),
      });

      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.payload);
      expect(body).toEqual({
        success: true,
        data: mockWithdrawResponse,
        message: 'Withdrawal transaction constructed successfully',
      });

      expect(mockLiquidityService.withdrawLiquidity).toHaveBeenCalledWith(
        validWallet,
        { shares: 500 },
      );
    });

    it('should return 400 when shares is zero', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/liquidity/withdraw',
        headers: {
          authorization: 'Bearer valid.jwt.token',
          'content-type': 'application/json',
        },
        payload: JSON.stringify({ shares: 0 }),
      });

      expect(res.statusCode).toBe(400);
      expect(mockLiquidityService.withdrawLiquidity).not.toHaveBeenCalled();
    });

    it('should return 401 when no bearer token is provided', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/liquidity/withdraw',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ shares: 500 }),
      });

      expect(res.statusCode).toBe(401);
      expect(mockLiquidityService.withdrawLiquidity).not.toHaveBeenCalled();
    });
  });
});
