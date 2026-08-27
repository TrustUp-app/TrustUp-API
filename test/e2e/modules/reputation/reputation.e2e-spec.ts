import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe, UnauthorizedException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ReputationModule } from '../../../../src/modules/reputation/reputation.module';
import { ReputationContractClient } from '../../../../src/blockchain/contracts/reputation-contract.client';
import { SorobanService } from '../../../../src/blockchain/soroban/soroban.service';
import { JwtAuthGuard } from '../../../../src/common/guards/jwt-auth.guard';

describe('ReputationController (e2e)', () => {
  let app: NestFastifyApplication;

  const validWallet = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';

  const mockReputationContract = {
    getScore: jest.fn().mockResolvedValue(75),
  };

  const mockSorobanService = {
    simulateContractCall: jest.fn(),
    getServer: jest.fn(),
    getNetworkPassphrase: jest.fn().mockReturnValue('Test SDF Network ; September 2015'),
  };

  // Mock guard that simulates JwtAuthGuard behavior: throws UnauthorizedException
  // when no Bearer token is present, otherwise sets req.user = { wallet }.
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
      imports: [ConfigModule.forRoot({ isGlobal: true }), ReputationModule],
    })
      .overrideProvider(ReputationContractClient)
      .useValue(mockReputationContract)
      .overrideProvider(SorobanService)
      .useValue(mockSorobanService)
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

  // ---------------------------------------------------------------------------
  // GET /reputation/:wallet
  // ---------------------------------------------------------------------------
  describe('GET /reputation/:wallet', () => {
    it('should return 200 with reputation data for a valid wallet', async () => {
      mockReputationContract.getScore.mockResolvedValue(75);

      const res = await app.inject({
        method: 'GET',
        url: `/reputation/${validWallet}`,
      });

      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.payload);
      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('message', 'Reputation score retrieved successfully');
      expect(body.data).toHaveProperty('wallet', validWallet);
      expect(body.data).toHaveProperty('score', 75);
      expect(body.data).toHaveProperty('tier', 'silver');
      expect(body.data).toHaveProperty('interestRate');
      expect(body.data).toHaveProperty('maxCredit');
      expect(body.data).toHaveProperty('lastUpdated');
    }, 10000);

    it('should return 200 with default score when wallet has no on-chain data', async () => {
      mockReputationContract.getScore.mockResolvedValue(null);

      const res = await app.inject({
        method: 'GET',
        url: `/reputation/${validWallet}`,
      });

      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.data.score).toBe(50);
      expect(body.data.tier).toBe('poor');
    }, 10000);

    it('should return 400 for an invalid wallet address', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/reputation/INVALID_WALLET',
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return 400 for a wallet that does not start with G', async () => {
      const badWallet = 'XABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';

      const res = await app.inject({
        method: 'GET',
        url: `/reputation/${badWallet}`,
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return 500 when the blockchain RPC is unavailable', async () => {
      mockReputationContract.getScore.mockRejectedValue(new Error('request timeout'));

      const res = await app.inject({
        method: 'GET',
        url: `/reputation/${validWallet}`,
      });

      expect(res.statusCode).toBe(500);
    }, 10000);
  });

  // ---------------------------------------------------------------------------
  // GET /reputation/me
  // ---------------------------------------------------------------------------
  describe('GET /reputation/me', () => {
    it('should return 200 with reputation data when a valid token is provided', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/reputation/me',
        headers: { authorization: 'Bearer valid.jwt.token' },
      });

      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Your reputation data retrieved successfully');
      expect(body.data).toHaveProperty('wallet', validWallet);
    }, 10000);

    it('should return 401 when no token is provided', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/reputation/me',
      });

      expect(res.statusCode).toBe(401);
    });

    it('should return 401 when Authorization header is malformed', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/reputation/me',
        headers: { authorization: 'InvalidScheme token123' },
      });

      expect(res.statusCode).toBe(401);
    });

    it('should not be captured by the :wallet route (route precedence)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/reputation/me',
        headers: { authorization: 'Bearer valid.jwt.token' },
      });

      // If ':wallet' captured 'me', the Stellar address regex would reject it
      // with a 400 (Invalid Stellar wallet address format) instead of 200/401.
      expect(res.statusCode).not.toBe(400);
    }, 10000);
  });
});
