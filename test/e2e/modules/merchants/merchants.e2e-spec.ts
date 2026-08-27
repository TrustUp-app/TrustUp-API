import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ConfigModule } from '@nestjs/config';
import { MerchantsModule } from '../../../../src/modules/merchants/merchants.module';
import { MerchantsService } from '../../../../src/modules/merchants/merchants.service';
import { JwtAuthGuard } from '../../../../src/common/guards/jwt-auth.guard';
import { SupabaseService } from '../../../../src/database/supabase.client';

/**
 * E2E tests for GET /merchants (API-06), GET /merchants/:id (API-07), and the
 * merchant portfolio/analytics/leaderboard endpoints (issue #132).
 *
 * JwtAuthGuard is mocked since auth is owned by API-03.
 * We test that:
 *  - With a valid (mocked) token → 200 + expected shape
 *  - Without a token → 401
 *  - With an unknown ID → 404
 */
describe('MerchantsController (e2e)', () => {
  let app: NestFastifyApplication;

  const merchantDetail = {
    id: 'merchant-1',
    wallet: 'GMER1ABCDEFGHIJKLMNOPQRSTUVWXYZ234567890ABCDEFGHIJKLMNXX',
    name: 'TechStore',
    logo: 'https://example.com/tech-logo.png',
    description: 'Electronics retailer',
    category: 'Electronics',
    website: 'https://techstore.com',
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
  };

  const merchantPortfolio = {
    merchantId: 'merchant-1',
    totalLoans: 2,
    activeLoansCount: 1,
    completedLoansCount: 1,
    defaultedLoansCount: 0,
    totalVolume: 700,
    outstandingBalance: 200,
    repaymentRate: 50,
    activeLoans: [
      {
        id: 'loan-1',
        loanId: 'chain-loan-1',
        amount: 400,
        remainingBalance: 200,
        status: 'active',
        nextPaymentDue: '2026-02-01T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    pagination: { limit: 20, offset: 0, total: 1 },
  };

  const merchantAnalytics = {
    merchantId: 'merchant-1',
    months: [{ month: '2026-08', volume: 400, loanCount: 2, defaultRate: 50, avgLoanSize: 200 }],
    summary: { totalVolume: 400, totalLoans: 2, avgLoanSize: 200, defaultRate: 50 },
  };

  const merchantLeaderboard = {
    metric: 'volume',
    data: [
      {
        rank: 1,
        merchantId: 'merchant-1',
        name: 'TechStore',
        logo: 'https://example.com/tech-logo.png',
        category: 'Electronics',
        score: 92,
        tier: 'gold',
        totalVolume: 20000,
        repaymentRate: 100,
        totalLoans: 20,
      },
    ],
    pagination: { limit: 20, offset: 0, total: 1 },
  };

  const mockMerchantsService = {
    listMerchants: jest.fn().mockResolvedValue({
      merchants: [merchantDetail],
      total: 1,
      limit: 20,
      offset: 0,
    }),
    getMerchantById: jest.fn().mockResolvedValue(merchantDetail),
    getMerchantPortfolio: jest.fn().mockResolvedValue(merchantPortfolio),
    getMerchantAnalytics: jest.fn().mockResolvedValue(merchantAnalytics),
    getLeaderboard: jest.fn().mockResolvedValue(merchantLeaderboard),
    apply: jest.fn().mockResolvedValue({
      id: 'app-1',
      wallet: 'GBUQNNZ53JZZG7V77M44I3D3525EU4Y5M3VDFUBCU6ZCGUBNBUPK5E77',
      name: 'TechStore',
      status: 'pending',
      createdAt: '2026-08-27T00:00:00.000Z',
    }),
  };

  const mockSupabaseService = {
    getServiceRoleClient: jest.fn(),
    getClient: jest.fn(),
  };

  const mockJwtAuthGuard = {
    canActivate: jest.fn((context) => {
      const req = context.switchToHttp().getRequest();
      const authHeader = req.headers['authorization'];
      if (!authHeader?.startsWith('Bearer ')) {
        throw new UnauthorizedException('No token provided');
      }
      req.user = { wallet: 'GBUQNNZ53JZZG7V77M44I3D3525EU4Y5M3VDFUBCU6ZCGUBNBUPK5E77' };
      return true;
    }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), MerchantsModule],
    })
      .overrideProvider(MerchantsService)
      .useValue(mockMerchantsService)
      .overrideProvider(SupabaseService)
      .useValue(mockSupabaseService)
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockMerchantsService.getMerchantById.mockResolvedValue(merchantDetail);
    mockMerchantsService.getMerchantPortfolio.mockResolvedValue(merchantPortfolio);
    mockMerchantsService.getMerchantAnalytics.mockResolvedValue(merchantAnalytics);
    mockMerchantsService.getLeaderboard.mockResolvedValue(merchantLeaderboard);
    mockJwtAuthGuard.canActivate.mockImplementation((context) => {
      const req = context.switchToHttp().getRequest();
      const authHeader = req.headers['authorization'];
      if (!authHeader?.startsWith('Bearer ')) {
        throw new UnauthorizedException('No token provided');
      }
      req.user = { wallet: 'GBUQNNZ53JZZG7V77M44I3D3525EU4Y5M3VDFUBCU6ZCGUBNBUPK5E77' };
      return true;
    });
  });

  // ---------------------------------------------------------------------------
  // GET /merchants/:id (API-07)
  // ---------------------------------------------------------------------------
  describe('GET /merchants/:id', () => {
    it('should return 200 with merchant details when a valid token and ID are provided', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/merchants/merchant-1',
        headers: { authorization: 'Bearer valid.jwt.token' },
      });

      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.payload);
      expect(body).toMatchObject({
        id: merchantDetail.id,
        name: merchantDetail.name,
        wallet: merchantDetail.wallet,
        isActive: merchantDetail.isActive,
      });
      expect(mockMerchantsService.getMerchantById).toHaveBeenCalledWith('merchant-1');
    });

    it('should return 404 when merchant is not found', async () => {
      mockMerchantsService.getMerchantById.mockRejectedValue(
        new NotFoundException('Merchant not found'),
      );

      const res = await app.inject({
        method: 'GET',
        url: '/merchants/invalid-id',
        headers: { authorization: 'Bearer valid.jwt.token' },
      });

      expect(res.statusCode).toBe(404);
    });

    it('should return 401 when no token is provided', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/merchants/merchant-1',
      });

      expect(res.statusCode).toBe(401);
      expect(mockMerchantsService.getMerchantById).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // GET /merchants/:id/portfolio
  // ---------------------------------------------------------------------------
  describe('GET /merchants/:id/portfolio', () => {
    it('should return 200 with the merchant portfolio when a valid token and ID are provided', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/merchants/merchant-1/portfolio',
        headers: { authorization: 'Bearer valid.jwt.token' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body).toMatchObject({
        merchantId: 'merchant-1',
        totalLoans: 2,
        repaymentRate: 50,
      });
      expect(mockMerchantsService.getMerchantPortfolio).toHaveBeenCalledWith('merchant-1', 20, 0);
    });

    it('should forward limit/offset query params to the service', async () => {
      await app.inject({
        method: 'GET',
        url: '/merchants/merchant-1/portfolio?limit=5&offset=10',
        headers: { authorization: 'Bearer valid.jwt.token' },
      });

      expect(mockMerchantsService.getMerchantPortfolio).toHaveBeenCalledWith('merchant-1', 5, 10);
    });

    it('should return 404 when the merchant is not found', async () => {
      mockMerchantsService.getMerchantPortfolio.mockRejectedValue(
        new NotFoundException('Merchant not found'),
      );

      const res = await app.inject({
        method: 'GET',
        url: '/merchants/invalid-id/portfolio',
        headers: { authorization: 'Bearer valid.jwt.token' },
      });

      expect(res.statusCode).toBe(404);
    });

    it('should return 401 when no token is provided', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/merchants/merchant-1/portfolio',
      });

      expect(res.statusCode).toBe(401);
      expect(mockMerchantsService.getMerchantPortfolio).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // GET /merchants/:id/analytics
  // ---------------------------------------------------------------------------
  describe('GET /merchants/:id/analytics', () => {
    it('should return 200 with the merchant analytics when a valid token and ID are provided', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/merchants/merchant-1/analytics',
        headers: { authorization: 'Bearer valid.jwt.token' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body).toMatchObject({ merchantId: 'merchant-1' });
      expect(Array.isArray(body.months)).toBe(true);
      expect(mockMerchantsService.getMerchantAnalytics).toHaveBeenCalledWith('merchant-1', 6);
    });

    it('should forward the months query param to the service', async () => {
      await app.inject({
        method: 'GET',
        url: '/merchants/merchant-1/analytics?months=12',
        headers: { authorization: 'Bearer valid.jwt.token' },
      });

      expect(mockMerchantsService.getMerchantAnalytics).toHaveBeenCalledWith('merchant-1', 12);
    });

    it('should return 404 when the merchant is not found', async () => {
      mockMerchantsService.getMerchantAnalytics.mockRejectedValue(
        new NotFoundException('Merchant not found'),
      );

      const res = await app.inject({
        method: 'GET',
        url: '/merchants/invalid-id/analytics',
        headers: { authorization: 'Bearer valid.jwt.token' },
      });

      expect(res.statusCode).toBe(404);
    });

    it('should return 401 when no token is provided', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/merchants/merchant-1/analytics',
      });

      expect(res.statusCode).toBe(401);
      expect(mockMerchantsService.getMerchantAnalytics).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // GET /merchants/leaderboard
  // ---------------------------------------------------------------------------
  describe('GET /merchants/leaderboard', () => {
    it('should return 200 with the ranked leaderboard when a valid token is provided', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/merchants/leaderboard',
        headers: { authorization: 'Bearer valid.jwt.token' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.metric).toBe('volume');
      expect(body.data[0]).toMatchObject({ rank: 1, merchantId: 'merchant-1' });
      expect(mockMerchantsService.getLeaderboard).toHaveBeenCalledWith('volume', 20, 0);
    });

    it('should not be shadowed by the GET /merchants/:id route and forward the metric query param', async () => {
      await app.inject({
        method: 'GET',
        url: '/merchants/leaderboard?metric=score&limit=10&offset=5',
        headers: { authorization: 'Bearer valid.jwt.token' },
      });

      expect(mockMerchantsService.getLeaderboard).toHaveBeenCalledWith('score', 10, 5);
      expect(mockMerchantsService.getMerchantById).not.toHaveBeenCalled();
    });

    it('should return 401 when no token is provided', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/merchants/leaderboard',
      });

      expect(res.statusCode).toBe(401);
      expect(mockMerchantsService.getLeaderboard).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // POST /merchants/apply
  // ---------------------------------------------------------------------------
  describe('POST /merchants/apply', () => {
    it('should return 201 when merchant application is submitted with valid token', async () => {
      const payload = {
        name: 'TechStore',
        logo: 'https://example.com/logo.png',
        category: 'Electronics',
        description: 'Quality tech products',
        website: 'https://techstore.com',
      };

      const res = await app.inject({
        method: 'POST',
        url: '/merchants/apply',
        headers: { authorization: 'Bearer valid.jwt.token' },
        payload,
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('TechStore');
      expect(body.data.status).toBe('pending');
      expect(mockMerchantsService.apply).toHaveBeenCalled();
    });

    it('should return 401 when no token is provided', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/merchants/apply',
        payload: { name: 'TechStore' },
      });

      expect(res.statusCode).toBe(401);
      expect(mockMerchantsService.apply).not.toHaveBeenCalled();
    });
  });
});
