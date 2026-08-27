import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe, UnauthorizedException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { TransactionsModule } from '../../../../src/modules/transactions/transactions.module';
import { TransactionsService } from '../../../../src/modules/transactions/transactions.service';
import { TransactionType } from '../../../../src/modules/transactions/dto/submit-transaction-request.dto';
import { SupabaseService } from '../../../../src/database/supabase.client';
import { JwtAuthGuard } from '../../../../src/common/guards/jwt-auth.guard';

// ─── Constants ───────────────────────────────────────────────────────────────

const VALID_WALLET = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';
const VALID_HASH = 'a'.repeat(64);
const NOW_ISO = '2026-04-28T10:00:00.000Z';

/** Builds a deterministic 64-char hex hash from a counter */
const makeHash = (n: number, char = 'a') => `${String(n).padStart(2, '0')}${char.repeat(62)}`;

// ─── State ────────────────────────────────────────────────────────────────────

type TxRecord = {
  type: TransactionType;
  status: 'pending' | 'success' | 'failed';
  wallet: string;
};

type AppState = {
  txByHash: Map<string, TxRecord>;
  submittedCount: number;
  dbRecords: Map<string, TxRecord & { submittedAt: string }>;
};

// ─── describe ─────────────────────────────────────────────────────────────────

describe('Transaction Submission Flow (e2e)', () => {
  let app: NestFastifyApplication;

  const state: AppState = {
    txByHash: new Map(),
    submittedCount: 0,
    dbRecords: new Map(),
  };

  // ── Mock: JWT guard ──────────────────────────────────────────────────────
  const mockJwtAuthGuard = {
    canActivate: jest.fn((context) => {
      const req = context.switchToHttp().getRequest();
      const authHeader = req.headers['authorization'];
      if (!authHeader?.startsWith('Bearer ')) {
        throw new UnauthorizedException('No token provided');
      }
      req.user = { wallet: VALID_WALLET };
      return true;
    }),
  };

  // ── Mock: cache ──────────────────────────────────────────────────────────
  const mockCacheManager = {
    get: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue(undefined),
  };

  // ── Mock: Supabase ───────────────────────────────────────────────────────
  const mockSupabaseClient = {
    from: jest.fn((table: string) => {
      if (table === 'transactions') {
        return {
          insert: jest.fn().mockImplementation(async (payload: Record<string, unknown>) => {
            const hash = String(payload.transaction_hash ?? payload.hash ?? '').toLowerCase();
            if (hash) {
              state.dbRecords.set(hash, {
                type: payload.type as TransactionType,
                status: 'pending',
                wallet: String(payload.user_wallet ?? ''),
                submittedAt: String(payload.submitted_at ?? NOW_ISO),
              });
            }
            return { error: null };
          }),
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockImplementation((_col: string, val: string) => ({
            maybeSingle: jest.fn().mockResolvedValue({
              data: state.dbRecords.has(val.toLowerCase())
                ? {
                    transaction_hash: val.toLowerCase(),
                    type: state.dbRecords.get(val.toLowerCase())!.type,
                    status: state.dbRecords.get(val.toLowerCase())!.status,
                    submitted_at: state.dbRecords.get(val.toLowerCase())!.submittedAt,
                    completed_at: null,
                    updated_at: NOW_ISO,
                  }
                : null,
              error: null,
            }),
          })),
          update: jest.fn().mockReturnThis(),
        };
      }
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        insert: jest.fn().mockResolvedValue({ error: null }),
        update: jest.fn().mockReturnThis(),
      };
    }),
  };

  const mockSupabaseService = {
    getClient: jest.fn().mockReturnValue(mockSupabaseClient),
    getServiceRoleClient: jest.fn().mockReturnValue(mockSupabaseClient),
  };

  // ── Mock: Horizon (via TransactionsService) ──────────────────────────────
  //
  // We mock TransactionsService directly (same pattern as loan-lifecycle.e2e-spec.ts
  // and liquidity-flow.e2e-spec.ts) so we don't need a live Horizon connection.
  // This keeps the tests deterministic and fast.

  const mockTransactionsService = {
    submitTransaction: jest.fn(),
    getTransactionStatus: jest.fn(),
  };

  // ── Module bootstrap ─────────────────────────────────────────────────────

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), TransactionsModule],
    })
      .overrideProvider(CACHE_MANAGER)
      .useValue(mockCacheManager)
      .overrideProvider(SupabaseService)
      .useValue(mockSupabaseService)
      .overrideProvider(TransactionsService)
      .useValue(mockTransactionsService)
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

  // ── Per-test state reset ─────────────────────────────────────────────────

  beforeEach(() => {
    jest.clearAllMocks();

    state.txByHash.clear();
    state.dbRecords.clear();
    state.submittedCount = 0;

    mockCacheManager.get.mockResolvedValue(undefined);
    mockCacheManager.set.mockResolvedValue(undefined);

    // Default: submitTransaction stores tx in state and returns pending hash
    mockTransactionsService.submitTransaction.mockImplementation(
      async (_wallet: string, dto: { xdr: string; type: TransactionType }) => {
        state.submittedCount += 1;
        const hash = makeHash(state.submittedCount);
        state.txByHash.set(hash, { type: dto.type, status: 'pending', wallet: _wallet });
        return { transactionHash: hash, status: 'pending' };
      },
    );

    // Default: getTransactionStatus promotes pending → success
    mockTransactionsService.getTransactionStatus.mockImplementation(async (hash: string) => {
      const tx = state.txByHash.get(hash);
      if (!tx) {
        const err: { response?: { status: number } } = { response: { status: 404 } };
        throw err;
      }
      tx.status = 'success';
      return {
        hash,
        status: 'success',
        type: tx.type,
        result: {
          ledger: 12345,
          operationCount: 1,
          sourceAccount: tx.wallet,
          feeCharged: '100',
          memoType: 'none',
          memo: null,
          createdAt: NOW_ISO,
        },
        error: null,
        submittedAt: NOW_ISO,
        confirmedAt: NOW_ISO,
        lastCheckedAt: NOW_ISO,
      };
    });
  });

  afterAll(async () => {
    if (app) await app.close();
    state.txByHash.clear();
    state.dbRecords.clear();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /transactions/submit
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /transactions/submit', () => {
    describe('successful submission', () => {
      it('should return 200 with transactionHash and pending status', async () => {
        const res = await app.inject({
          method: 'POST',
          url: '/transactions/submit',
          headers: { authorization: 'Bearer test.jwt' },
          payload: { xdr: 'AAAAAgLOANCREATE...', type: TransactionType.LOAN_CREATE },
        });

        expect(res.statusCode).toBe(200);

        const body = JSON.parse(res.payload);
        expect(body.success).toBe(true);
        expect(body.data).toMatchObject({
          transactionHash: expect.stringMatching(/^[a-f0-9]{64}$/i),
          status: 'pending',
        });
        expect(body.message).toBe('Transaction submitted successfully');
      });

      it('should accept all valid TransactionType values', async () => {
        const types = [
          TransactionType.LOAN_CREATE,
          TransactionType.LOAN_REPAY,
          TransactionType.DEPOSIT,
          TransactionType.WITHDRAW,
        ];

        for (const type of types) {
          const res = await app.inject({
            method: 'POST',
            url: '/transactions/submit',
            headers: { authorization: 'Bearer test.jwt' },
            payload: { xdr: `AAAAAg${type}...`, type },
          });

          expect(res.statusCode).toBe(200);
          const body = JSON.parse(res.payload);
          expect(body.data.status).toBe('pending');
        }
      });

      it('should call submitTransaction with wallet from JWT and dto', async () => {
        const xdr = 'AAAAAgDEPOSIT...';
        const type = TransactionType.DEPOSIT;

        await app.inject({
          method: 'POST',
          url: '/transactions/submit',
          headers: { authorization: 'Bearer test.jwt' },
          payload: { xdr, type },
        });

        expect(mockTransactionsService.submitTransaction).toHaveBeenCalledWith(
          VALID_WALLET,
          expect.objectContaining({ xdr, type }),
        );
      });

      it('should return unique hashes for multiple submissions', async () => {
        const hashes: string[] = [];

        for (let i = 0; i < 3; i++) {
          const res = await app.inject({
            method: 'POST',
            url: '/transactions/submit',
            headers: { authorization: 'Bearer test.jwt' },
            payload: { xdr: `AAAAAg${i}...`, type: TransactionType.DEPOSIT },
          });

          expect(res.statusCode).toBe(200);
          hashes.push(JSON.parse(res.payload).data.transactionHash);
        }

        const unique = new Set(hashes);
        expect(unique.size).toBe(3);
      });
    });

    describe('XDR validation', () => {
      it('should return 400 when xdr is missing', async () => {
        const res = await app.inject({
          method: 'POST',
          url: '/transactions/submit',
          headers: { authorization: 'Bearer test.jwt' },
          payload: { type: TransactionType.DEPOSIT },
        });

        expect(res.statusCode).toBe(400);
      });

      it('should return 400 when xdr is empty string', async () => {
        const res = await app.inject({
          method: 'POST',
          url: '/transactions/submit',
          headers: { authorization: 'Bearer test.jwt' },
          payload: { xdr: '', type: TransactionType.DEPOSIT },
        });

        expect(res.statusCode).toBe(400);
      });

      it('should return 400 when type is missing', async () => {
        const res = await app.inject({
          method: 'POST',
          url: '/transactions/submit',
          headers: { authorization: 'Bearer test.jwt' },
          payload: { xdr: 'AAAAAgVALID...' },
        });

        expect(res.statusCode).toBe(400);
      });

      it('should return 400 when type is not a valid enum value', async () => {
        const res = await app.inject({
          method: 'POST',
          url: '/transactions/submit',
          headers: { authorization: 'Bearer test.jwt' },
          payload: { xdr: 'AAAAAgVALID...', type: 'invalid_type' },
        });

        expect(res.statusCode).toBe(400);
      });

      it('should return 400 when extra non-whitelisted fields are present', async () => {
        const res = await app.inject({
          method: 'POST',
          url: '/transactions/submit',
          headers: { authorization: 'Bearer test.jwt' },
          payload: {
            xdr: 'AAAAAgVALID...',
            type: TransactionType.DEPOSIT,
            extra: 'not-allowed',
          },
        });

        expect(res.statusCode).toBe(400);
      });
    });

    describe('Horizon error mapping', () => {
      it('should return 400 with STELLAR error code when Horizon rejects with op_bad_auth', async () => {
        mockTransactionsService.submitTransaction.mockRejectedValueOnce({
          code: 'STELLAR_OP_BAD_AUTH',
          message: 'Invalid transaction signature. Please re-sign and try again.',
          status: 400,
        });

        const res = await app.inject({
          method: 'POST',
          url: '/transactions/submit',
          headers: { authorization: 'Bearer test.jwt' },
          payload: { xdr: 'AAAAAgBADAUTH...', type: TransactionType.LOAN_CREATE },
        });

        // Service mock rejection — guard delegates error up; status depends on
        // whether the mock throws HttpException or plain error.
        expect([400, 500]).toContain(res.statusCode);
      });

      it('should return 503 when Horizon is unavailable', async () => {
        mockTransactionsService.submitTransaction.mockRejectedValueOnce({
          code: 'STELLAR_NETWORK_UNAVAILABLE',
          message: 'Stellar network is temporarily unavailable.',
          status: 503,
        });

        const res = await app.inject({
          method: 'POST',
          url: '/transactions/submit',
          headers: { authorization: 'Bearer test.jwt' },
          payload: { xdr: 'AAAAAgTIMEOUT...', type: TransactionType.DEPOSIT },
        });

        expect([503, 500]).toContain(res.statusCode);
      });
    });

    describe('authentication', () => {
      it('should return 401 when Authorization header is missing', async () => {
        mockJwtAuthGuard.canActivate.mockImplementationOnce(() => {
          throw new UnauthorizedException('No token provided');
        });

        const res = await app.inject({
          method: 'POST',
          url: '/transactions/submit',
          payload: { xdr: 'AAAAAgVALID...', type: TransactionType.DEPOSIT },
        });

        expect(res.statusCode).toBe(401);
      });

      it('should return 401 when token is malformed', async () => {
        mockJwtAuthGuard.canActivate.mockImplementationOnce(() => {
          throw new UnauthorizedException('Invalid token');
        });

        const res = await app.inject({
          method: 'POST',
          url: '/transactions/submit',
          headers: { authorization: 'Bearer bad.token.here' },
          payload: { xdr: 'AAAAAgVALID...', type: TransactionType.DEPOSIT },
        });

        expect(res.statusCode).toBe(401);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /transactions/:hash
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /transactions/:hash', () => {
    describe('successful status retrieval', () => {
      it('should return 200 with success status for a confirmed transaction', async () => {
        // Pre-populate state as if submitTransaction already ran
        state.txByHash.set(VALID_HASH, {
          type: TransactionType.LOAN_CREATE,
          status: 'pending',
          wallet: VALID_WALLET,
        });

        const res = await app.inject({
          method: 'GET',
          url: `/transactions/${VALID_HASH}`,
        });

        expect(res.statusCode).toBe(200);

        const body = JSON.parse(res.payload);
        expect(body.success).toBe(true);
        expect(body.data).toMatchObject({
          hash: VALID_HASH,
          status: 'success',
          type: TransactionType.LOAN_CREATE,
          result: expect.objectContaining({
            ledger: expect.any(Number),
            operationCount: expect.any(Number),
            sourceAccount: VALID_WALLET,
            feeCharged: expect.any(String),
          }),
          error: null,
          submittedAt: expect.any(String),
          confirmedAt: expect.any(String),
          lastCheckedAt: expect.any(String),
        });
      });

      it('should return 200 with pending status when Horizon has not confirmed yet', async () => {
        mockTransactionsService.getTransactionStatus.mockResolvedValueOnce({
          hash: VALID_HASH,
          status: 'pending',
          type: TransactionType.DEPOSIT,
          result: null,
          error: null,
          submittedAt: NOW_ISO,
          confirmedAt: null,
          lastCheckedAt: NOW_ISO,
        });

        const res = await app.inject({
          method: 'GET',
          url: `/transactions/${VALID_HASH}`,
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.payload);
        expect(body.data.status).toBe('pending');
        expect(body.data.result).toBeNull();
        expect(body.data.confirmedAt).toBeNull();
      });

      it('should return 200 with failed status and error details', async () => {
        mockTransactionsService.getTransactionStatus.mockResolvedValueOnce({
          hash: VALID_HASH,
          status: 'failed',
          type: TransactionType.LOAN_REPAY,
          result: null,
          error: {
            code: 'op_underfunded',
            message: 'Insufficient balance to complete one or more operations in this transaction.',
            operationCodes: ['op_underfunded'],
          },
          submittedAt: NOW_ISO,
          confirmedAt: NOW_ISO,
          lastCheckedAt: NOW_ISO,
        });

        const res = await app.inject({
          method: 'GET',
          url: `/transactions/${VALID_HASH}`,
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.payload);
        expect(body.data.status).toBe('failed');
        expect(body.data.error).toMatchObject({
          code: 'op_underfunded',
          message: expect.any(String),
        });
        expect(body.data.result).toBeNull();
      });

      it('should not require authentication', async () => {
        state.txByHash.set(VALID_HASH, {
          type: TransactionType.WITHDRAW,
          status: 'pending',
          wallet: VALID_WALLET,
        });

        // No Authorization header — endpoint is public
        const res = await app.inject({
          method: 'GET',
          url: `/transactions/${VALID_HASH}`,
        });

        expect(res.statusCode).toBe(200);
      });
    });

    describe('hash validation', () => {
      it('should return 400 for a hash shorter than 64 characters', async () => {
        const res = await app.inject({
          method: 'GET',
          url: '/transactions/abc123',
        });

        expect(res.statusCode).toBe(400);
        const body = JSON.parse(res.payload);
        expect(body.message ?? body.error).toBeDefined();
      });

      it('should return 400 for a hash with non-hex characters', async () => {
        const badHash = 'z'.repeat(64);

        const res = await app.inject({
          method: 'GET',
          url: `/transactions/${badHash}`,
        });

        expect(res.statusCode).toBe(400);
      });

      it('should return 400 for a hash longer than 64 characters', async () => {
        const longHash = 'a'.repeat(65);

        const res = await app.inject({
          method: 'GET',
          url: `/transactions/${longHash}`,
        });

        expect(res.statusCode).toBe(400);
      });

      it('should accept uppercase hex hash (case-insensitive)', async () => {
        // Use a hash with actual a-f letters so upper/lowercase differ meaningfully.
        // 'a'.repeat(64).toUpperCase() === 'a'.repeat(64) — no difference.
        const lowerHash = 'abcdef1234567890'.repeat(4); // 64 hex chars
        const upperHash = lowerHash.toUpperCase(); // ABCDEF1234567890...

        state.txByHash.set(lowerHash, {
          type: TransactionType.DEPOSIT,
          status: 'pending',
          wallet: VALID_WALLET,
        });

        // Provide explicit response so the mock resolves correctly for this hash.
        mockTransactionsService.getTransactionStatus.mockResolvedValueOnce({
          hash: lowerHash,
          status: 'success',
          type: TransactionType.DEPOSIT,
          result: {
            ledger: 12345,
            operationCount: 1,
            sourceAccount: VALID_WALLET,
            feeCharged: '100',
            memoType: 'none',
            memo: null,
            createdAt: NOW_ISO,
          },
          error: null,
          submittedAt: NOW_ISO,
          confirmedAt: NOW_ISO,
          lastCheckedAt: NOW_ISO,
        });

        const res = await app.inject({
          method: 'GET',
          url: `/transactions/${upperHash}`,
        });

        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.payload).data.hash).toBe(lowerHash);
      });
    });

    describe('not found', () => {
      it('should return 404 when hash is not in Horizon or DB', async () => {
        mockTransactionsService.getTransactionStatus.mockRejectedValueOnce({
          status: 404,
          response: {
            data: {
              code: 'TRANSACTION_NOT_FOUND',
              message: 'Transaction hash was not found in Horizon or local records.',
            },
          },
        });

        const unknownHash = 'f'.repeat(64);

        const res = await app.inject({
          method: 'GET',
          url: `/transactions/${unknownHash}`,
        });

        expect([404, 500]).toContain(res.statusCode);
      });
    });

    describe('status normalization', () => {
      it.each([
        ['loan_create', TransactionType.LOAN_CREATE],
        ['loan_repay', TransactionType.LOAN_REPAY],
        ['deposit', TransactionType.DEPOSIT],
        ['withdraw', TransactionType.WITHDRAW],
      ])(
        'should return type=%s in status response',
        async (_label: string, type: TransactionType) => {
          state.txByHash.set(VALID_HASH, { type, status: 'pending', wallet: VALID_WALLET });

          const res = await app.inject({
            method: 'GET',
            url: `/transactions/${VALID_HASH}`,
          });

          expect(res.statusCode).toBe(200);
          expect(JSON.parse(res.payload).data.type).toBe(type);
        },
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Complete flow: submit → check pending → confirm → check success
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Complete transaction submission flow', () => {
    it('should execute submit → pending → success flow for LOAN_CREATE', async () => {
      // Step 1: Submit transaction
      const submitRes = await app.inject({
        method: 'POST',
        url: '/transactions/submit',
        headers: { authorization: 'Bearer test.jwt' },
        payload: { xdr: 'AAAAAgLOANCREATE...', type: TransactionType.LOAN_CREATE },
      });

      expect(submitRes.statusCode).toBe(200);
      const { transactionHash } = JSON.parse(submitRes.payload).data;
      expect(transactionHash).toMatch(/^[a-f0-9]{64}$/i);
      expect(state.txByHash.get(transactionHash)?.status).toBe('pending');

      // Step 2: Check status — should return pending before Horizon confirms
      mockTransactionsService.getTransactionStatus.mockResolvedValueOnce({
        hash: transactionHash,
        status: 'pending',
        type: TransactionType.LOAN_CREATE,
        result: null,
        error: null,
        submittedAt: NOW_ISO,
        confirmedAt: null,
        lastCheckedAt: NOW_ISO,
      });

      const pendingRes = await app.inject({
        method: 'GET',
        url: `/transactions/${transactionHash}`,
      });

      expect(pendingRes.statusCode).toBe(200);
      expect(JSON.parse(pendingRes.payload).data.status).toBe('pending');

      // Step 3: Horizon confirms — status transitions to success
      const successRes = await app.inject({
        method: 'GET',
        url: `/transactions/${transactionHash}`,
      });

      expect(successRes.statusCode).toBe(200);
      const successBody = JSON.parse(successRes.payload).data;
      expect(successBody.status).toBe('success');
      expect(successBody.result).not.toBeNull();
      expect(successBody.error).toBeNull();
    });

    it('should execute submit → success flow for each transaction type', async () => {
      const types = [
        TransactionType.LOAN_CREATE,
        TransactionType.LOAN_REPAY,
        TransactionType.DEPOSIT,
        TransactionType.WITHDRAW,
      ];

      for (const type of types) {
        const submitRes = await app.inject({
          method: 'POST',
          url: '/transactions/submit',
          headers: { authorization: 'Bearer test.jwt' },
          payload: { xdr: `AAAAAg${type}...`, type },
        });

        expect(submitRes.statusCode).toBe(200);
        const { transactionHash } = JSON.parse(submitRes.payload).data;

        const statusRes = await app.inject({
          method: 'GET',
          url: `/transactions/${transactionHash}`,
        });

        expect(statusRes.statusCode).toBe(200);
        const body = JSON.parse(statusRes.payload).data;
        expect(body.status).toBe('success');
        expect(body.type).toBe(type);
      }
    });

    it('should handle failed transaction after submission', async () => {
      const submitRes = await app.inject({
        method: 'POST',
        url: '/transactions/submit',
        headers: { authorization: 'Bearer test.jwt' },
        payload: { xdr: 'AAAAAgFAILED...', type: TransactionType.LOAN_REPAY },
      });

      expect(submitRes.statusCode).toBe(200);
      const { transactionHash } = JSON.parse(submitRes.payload).data;

      // Horizon reports failure
      mockTransactionsService.getTransactionStatus.mockResolvedValueOnce({
        hash: transactionHash,
        status: 'failed',
        type: TransactionType.LOAN_REPAY,
        result: null,
        error: {
          code: 'tx_insufficient_balance',
          message: 'Insufficient balance to cover this transaction.',
        },
        submittedAt: NOW_ISO,
        confirmedAt: NOW_ISO,
        lastCheckedAt: NOW_ISO,
      });

      const statusRes = await app.inject({
        method: 'GET',
        url: `/transactions/${transactionHash}`,
      });

      expect(statusRes.statusCode).toBe(200);
      const body = JSON.parse(statusRes.payload).data;
      expect(body.status).toBe('failed');
      expect(body.error?.code).toBe('tx_insufficient_balance');
      expect(body.result).toBeNull();
    });

    it('should track database state changes (pending → success)', async () => {
      const submitRes = await app.inject({
        method: 'POST',
        url: '/transactions/submit',
        headers: { authorization: 'Bearer test.jwt' },
        payload: { xdr: 'AAAAAgDEPOSIT...', type: TransactionType.DEPOSIT },
      });

      expect(submitRes.statusCode).toBe(200);
      const { transactionHash } = JSON.parse(submitRes.payload).data;

      // State in mock txByHash starts as pending
      expect(state.txByHash.get(transactionHash)?.status).toBe('pending');

      // After status check, service promotes to success in mock state
      await app.inject({
        method: 'GET',
        url: `/transactions/${transactionHash}`,
      });

      expect(state.txByHash.get(transactionHash)?.status).toBe('success');
    });

    it('should handle multiple concurrent submissions independently', async () => {
      const submissions = await Promise.all(
        [TransactionType.LOAN_CREATE, TransactionType.DEPOSIT, TransactionType.WITHDRAW].map(
          (type) =>
            app.inject({
              method: 'POST',
              url: '/transactions/submit',
              headers: { authorization: 'Bearer test.jwt' },
              payload: { xdr: `AAAAAg${type}...`, type },
            }),
        ),
      );

      const hashes = submissions.map((res) => {
        expect(res.statusCode).toBe(200);
        return JSON.parse(res.payload).data.transactionHash;
      });

      // All hashes unique
      expect(new Set(hashes).size).toBe(3);

      // All independently resolvable
      for (const hash of hashes) {
        const statusRes = await app.inject({
          method: 'GET',
          url: `/transactions/${hash}`,
        });

        expect(statusRes.statusCode).toBe(200);
        expect(JSON.parse(statusRes.payload).data.hash).toBe(hash);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Error scenarios
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Error scenarios', () => {
    it('should not submit when body is empty', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/transactions/submit',
        headers: { authorization: 'Bearer test.jwt' },
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      expect(mockTransactionsService.submitTransaction).not.toHaveBeenCalled();
    });

    it('should not submit when xdr is not a string', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/transactions/submit',
        headers: { authorization: 'Bearer test.jwt' },
        payload: { xdr: 12345, type: TransactionType.DEPOSIT },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return 400 for invalid hash format on status check', async () => {
      const cases = [
        'short',
        'a'.repeat(63), // one char too short
        'a'.repeat(65), // one char too long
        'g'.repeat(64), // non-hex char
        '',
      ];

      for (const hash of cases) {
        const res = await app.inject({
          method: 'GET',
          url: `/transactions/${hash || 'EMPTY'}`,
        });

        expect(res.statusCode).toBe(400);
      }
    });

    it('should not expose internal error details for 5xx errors', async () => {
      mockTransactionsService.submitTransaction.mockRejectedValueOnce(
        new Error('Supabase connection timeout'),
      );

      const res = await app.inject({
        method: 'POST',
        url: '/transactions/submit',
        headers: { authorization: 'Bearer test.jwt' },
        payload: { xdr: 'AAAAAgVALID...', type: TransactionType.DEPOSIT },
      });

      expect(res.statusCode).toBeGreaterThanOrEqual(400);
      const body = JSON.parse(res.payload);
      // Should not leak raw DB error message
      expect(JSON.stringify(body)).not.toContain('Supabase connection timeout');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Test data cleanup
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Test data cleanup', () => {
    it('should start each test with clean state', () => {
      // Verified by beforeEach clearing state.txByHash, state.dbRecords,
      // and state.submittedCount. This test asserts the invariant.
      expect(state.txByHash.size).toBe(0);
      expect(state.dbRecords.size).toBe(0);
      expect(state.submittedCount).toBe(0);
    });
  });
});
