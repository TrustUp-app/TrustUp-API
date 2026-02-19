import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { ReputationModule } from '../../../../src/modules/reputation/reputation.module';
import { ReputationContractClient } from '../../../../src/blockchain/contracts/reputation-contract.client';
import { SupabaseService } from '../../../../src/database/supabase.client';
import { ConfigModule } from '@nestjs/config';

describe('ReputationController (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const testWallet = 'GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFG';

  const mockContractClient = {
    getScore: jest.fn().mockResolvedValue(75),
  };

  const mockSupabaseClient = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
  };

  const mockSupabaseService = {
    getClient: jest.fn().mockReturnValue(mockSupabaseClient),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => ({ JWT_SECRET: 'test-secret-key-for-e2e' })],
        }),
        ReputationModule,
      ],
    })
      .overrideProvider(ReputationContractClient)
      .useValue(mockContractClient)
      .overrideProvider(SupabaseService)
      .useValue(mockSupabaseService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  function getAuthToken(wallet: string = testWallet): string {
    return jwtService.sign({ wallet });
  }

  describe('GET /reputation/me', () => {
    it('should return 200 with the authenticated user\'s reputation', () => {
      return request(app.getHttpServer())
        .get('/reputation/me')
        .set('Authorization', `Bearer ${getAuthToken()}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('wallet', testWallet);
          expect(res.body).toHaveProperty('score');
          expect(res.body).toHaveProperty('tier');
          expect(res.body).toHaveProperty('interestRate');
          expect(res.body).toHaveProperty('maxCredit');
          expect(res.body).toHaveProperty('lastUpdated');
          expect(typeof res.body.score).toBe('number');
          expect(typeof res.body.tier).toBe('string');
        });
    });

    it('should return 401 without authorization header', () => {
      return request(app.getHttpServer())
        .get('/reputation/me')
        .expect(401);
    });

    it('should return 401 with an invalid token', () => {
      return request(app.getHttpServer())
        .get('/reputation/me')
        .set('Authorization', 'Bearer invalid.token.here')
        .expect(401);
    });
  });

  describe('GET /reputation/:wallet', () => {
    it('should return 200 with reputation for a given wallet', () => {
      const targetWallet = 'GXYZ1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFG';

      return request(app.getHttpServer())
        .get(`/reputation/${targetWallet}`)
        .set('Authorization', `Bearer ${getAuthToken()}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('wallet', targetWallet);
          expect(res.body).toHaveProperty('score');
          expect(res.body).toHaveProperty('tier');
          expect(res.body).toHaveProperty('interestRate');
          expect(res.body).toHaveProperty('maxCredit');
          expect(res.body).toHaveProperty('lastUpdated');
        });
    });

    it('should return 401 without authorization header', () => {
      return request(app.getHttpServer())
        .get(`/reputation/${testWallet}`)
        .expect(401);
    });

    it('should return default score when contract returns error', () => {
      mockContractClient.getScore.mockRejectedValueOnce(new Error('RPC timeout'));
      mockSupabaseClient.single.mockResolvedValueOnce({ data: null, error: { message: 'not found' } });

      return request(app.getHttpServer())
        .get(`/reputation/${testWallet}`)
        .set('Authorization', `Bearer ${getAuthToken()}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('score', 50);
          expect(res.body).toHaveProperty('tier', 'poor');
        });
    });
  });
});
