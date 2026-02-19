import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { LoansModule } from '../../../../src/modules/loans/loans.module';
import { ReputationService } from '../../../../src/modules/reputation/reputation.service';
import { MerchantsService } from '../../../../src/modules/merchants/merchants.service';
import { ConfigModule } from '@nestjs/config';

describe('LoansController (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const testWallet = 'GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFG';
  const validMerchantId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

  const mockReputationService = {
    getReputation: jest.fn().mockResolvedValue({
      wallet: testWallet,
      score: 75,
      tier: 'silver',
      maxCredit: 5000,
      lastUpdated: new Date().toISOString(),
    }),
  };

  const mockMerchantsService = {
    findById: jest.fn().mockImplementation((id: string) => {
      if (id === validMerchantId) {
        return Promise.resolve({
          id: validMerchantId,
          wallet: 'GMERCHANT1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890AB',
          name: 'TechStore',
          logo: 'https://example.com/logo.png',
          category: 'Electronics',
          isActive: true,
        });
      }
      return Promise.resolve(null);
    }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => ({ JWT_SECRET: 'test-secret-key-for-e2e' })],
        }),
        LoansModule,
      ],
    })
      .overrideProvider(ReputationService)
      .useValue(mockReputationService)
      .overrideProvider(MerchantsService)
      .useValue(mockMerchantsService)
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

  describe('POST /loans/quote', () => {
    it('should return 200 with a valid loan quote', () => {
      return request(app.getHttpServer())
        .post('/loans/quote')
        .set('Authorization', `Bearer ${getAuthToken()}`)
        .send({ amount: 500, merchant: validMerchantId, term: 4 })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('amount', 500);
          expect(res.body).toHaveProperty('guarantee', 100);
          expect(res.body).toHaveProperty('loanAmount', 400);
          expect(res.body).toHaveProperty('interestRate');
          expect(res.body).toHaveProperty('totalRepayment');
          expect(res.body).toHaveProperty('term', 4);
          expect(res.body).toHaveProperty('schedule');
          expect(res.body.schedule).toHaveLength(4);
          expect(res.body.schedule[0]).toHaveProperty('paymentNumber', 1);
          expect(res.body.schedule[0]).toHaveProperty('amount');
          expect(res.body.schedule[0]).toHaveProperty('dueDate');
        });
    });

    it('should return 404 when merchant does not exist', () => {
      return request(app.getHttpServer())
        .post('/loans/quote')
        .set('Authorization', `Bearer ${getAuthToken()}`)
        .send({
          amount: 500,
          merchant: '00000000-0000-0000-0000-000000000000',
          term: 4,
        })
        .expect(404);
    });

    it('should return 401 without authorization header', () => {
      return request(app.getHttpServer())
        .post('/loans/quote')
        .send({ amount: 500, merchant: validMerchantId, term: 4 })
        .expect(401);
    });

    it('should return 401 with an invalid token', () => {
      return request(app.getHttpServer())
        .post('/loans/quote')
        .set('Authorization', 'Bearer invalid.token.here')
        .send({ amount: 500, merchant: validMerchantId, term: 4 })
        .expect(401);
    });

    it('should return 400 when amount is below minimum', () => {
      return request(app.getHttpServer())
        .post('/loans/quote')
        .set('Authorization', `Bearer ${getAuthToken()}`)
        .send({ amount: 0, merchant: validMerchantId, term: 4 })
        .expect(400);
    });

    it('should return 400 when amount exceeds maximum', () => {
      return request(app.getHttpServer())
        .post('/loans/quote')
        .set('Authorization', `Bearer ${getAuthToken()}`)
        .send({ amount: 99999, merchant: validMerchantId, term: 4 })
        .expect(400);
    });

    it('should return 400 when term is out of range', () => {
      return request(app.getHttpServer())
        .post('/loans/quote')
        .set('Authorization', `Bearer ${getAuthToken()}`)
        .send({ amount: 500, merchant: validMerchantId, term: 13 })
        .expect(400);
    });

    it('should return 400 when merchant is not a valid UUID', () => {
      return request(app.getHttpServer())
        .post('/loans/quote')
        .set('Authorization', `Bearer ${getAuthToken()}`)
        .send({ amount: 500, merchant: 'not-a-uuid', term: 4 })
        .expect(400);
    });

    it('should return 400 when required fields are missing', () => {
      return request(app.getHttpServer())
        .post('/loans/quote')
        .set('Authorization', `Bearer ${getAuthToken()}`)
        .send({})
        .expect(400);
    });

    it('should return 400 for non-whitelisted properties', () => {
      return request(app.getHttpServer())
        .post('/loans/quote')
        .set('Authorization', `Bearer ${getAuthToken()}`)
        .send({
          amount: 500,
          merchant: validMerchantId,
          term: 4,
          extraField: 'should not be here',
        })
        .expect(400);
    });
  });
});
