import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe, UnauthorizedException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { LoansModule } from '../../../src/modules/loans/loans.module';
import { TransactionsModule } from '../../../src/modules/transactions/transactions.module';
import { ReputationService } from '../../../src/modules/reputation/reputation.service';
import { SupabaseService } from '../../../src/database/supabase.client';
import { CreditLineContractClient } from '../../../src/blockchain/contracts/credit-line-contract.client';
import { ReputationContractClient } from '../../../src/blockchain/contracts/reputation-contract.client';
import { TransactionsService } from '../../../src/modules/transactions/transactions.service';
import { JwtAuthGuard } from '../../../src/common/guards/jwt-auth.guard';
import { TransactionType } from '../../../src/modules/transactions/dto/submit-transaction-request.dto';

type LoanStatus = 'pending' | 'active' | 'completed' | 'defaulted';
type LoanRow = {
  id: string; loan_id: string; user_wallet: string; merchant_id: string;
  amount: number; loan_amount: number; guarantee: number; interest_rate: number;
  total_repayment: number; remaining_balance: number; term: number;
  status: LoanStatus; next_payment_due: string | null;
  created_at: string; completed_at: string | null; defaulted_at: string | null;
};

describe('Complete BNPL Lifecycle (e2e)', () => {
  let app: NestFastifyApplication;

  const validWallet = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';
  const merchantId = 'a1b2c3d4-e5f6-4890-abcd-ef1234567890';

  const state = {
    nowIso: '2026-07-25T10:00:00.000Z',
    merchantActive: true,
    maxCredit: 3000,
    score: 75,
    interestRate: 8,
    loans: [] as LoanRow[],
    txToLoanId: new Map<string, string>(),
    txByHash: new Map<string, { type: TransactionType; status: 'pending' | 'success' }>(),
    submittedTxCount: 0,
  };

  const mockJwtAuthGuard = {
    canActivate: jest.fn((context) => {
      const req = context.switchToHttp().getRequest();
      if (!req.headers['authorization']?.startsWith('Bearer ')) {
        throw new UnauthorizedException('No token provided');
      }
      req.user = { wallet: validWallet };
      return true;
    }),
  };

  const mockReputationService = { getReputationScore: jest.fn() };
  const mockReputationContractClient = { getScore: jest.fn() };
  const mockCreditLineContract = { buildCreateLoanTransaction: jest.fn(), buildRepayLoanTx: jest.fn() };
  const mockTransactionsService = { submitTransaction: jest.fn(), getTransactionStatus: jest.fn() };

  function buildSupabaseQuery(table: string) {
    if (table === 'merchants') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: state.merchantActive ? { id: merchantId, name: 'TechStore', is_active: true } : { id: merchantId, name: 'TechStore', is_active: false },
          error: null,
        }),
      };
    }
    if (table === 'loans') {
      const queryState: { filters: Record<string, unknown>; selected: string; listStatuses: string[] | null } = {
        filters: {}, selected: '', listStatuses: null,
      };
      const query = {
        select: jest.fn((columns: string) => { queryState.selected = columns; return query; }),
        eq: jest.fn((column: string, value: unknown) => { queryState.filters[column] = value; return query; }),
        in: jest.fn((_column: string, values: string[]) => {
          queryState.listStatuses = values;
          return Promise.resolve({
            data: state.loans.filter(l => l.user_wallet === validWallet)
              .filter(l => queryState.listStatuses ? queryState.listStatuses.includes(l.status) : true)
              .map(l => ({ ...l, merchants: { id: merchantId, name: 'TechStore', logo: 'https://cdn.trustup.app/techstore.png' }, loan_payments: l.status === 'completed' ? [{ amount: l.total_repayment }] : [] })),
            error: null, count: state.loans.length,
          });
        }),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        single: jest.fn().mockImplementation(async () => {
          if (queryState.selected.includes('remaining_balance') && queryState.filters.id) {
            const loan = state.loans.find(l => l.id === queryState.filters.id);
            return { data: loan ?? null, error: loan ? null : { message: 'not found' } };
          }
          if (queryState.selected.includes('id, name, is_active')) {
            return { data: state.merchantActive ? { id: merchantId, name: 'TechStore', is_active: true } : { id: merchantId, name: 'TechStore', is_active: false }, error: null };
          }
          return { data: null, error: null };
        }),
        insert: jest.fn().mockImplementation(async (payload: Partial<LoanRow>) => {
          const newLoan: LoanRow = {
            id: `11111111-2222-3333-4444-${String(state.loans.length + 1).padStart(12, '0')}`,
            loan_id: String(payload.loan_id), user_wallet: String(payload.user_wallet),
            merchant_id: String(payload.merchant_id), amount: Number(payload.amount),
            loan_amount: Number(payload.loan_amount), guarantee: Number(payload.guarantee),
            interest_rate: Number(payload.interest_rate), total_repayment: Number(payload.total_repayment),
            remaining_balance: Number(payload.remaining_balance), term: Number(payload.term),
            status: 'pending', next_payment_due: (payload.next_payment_due as string) ?? null,
            created_at: state.nowIso, completed_at: null, defaulted_at: null,
          };
          state.loans.push(newLoan);
          return { error: null };
        }),
      };
      return query;
    }
    return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: null, error: null }), insert: jest.fn().mockResolvedValue({ error: null }), in: jest.fn().mockResolvedValue({ data: [], error: null, count: 0 }), order: jest.fn().mockReturnThis(), range: jest.fn().mockReturnThis() };
  }

  const mockSupabaseClient = { from: jest.fn((table: string) => buildSupabaseQuery(table)) };
  const mockSupabaseService = { getServiceRoleClient: jest.fn().mockReturnValue(mockSupabaseClient), getClient: jest.fn().mockReturnValue(mockSupabaseClient) };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), LoansModule, TransactionsModule],
    })
      .overrideProvider(SupabaseService).useValue(mockSupabaseService)
      .overrideProvider(ReputationService).useValue(mockReputationService)
      .overrideProvider(ReputationContractClient).useValue(mockReputationContractClient)
      .overrideProvider(CreditLineContractClient).useValue(mockCreditLineContract)
      .overrideProvider(TransactionsService).useValue(mockTransactionsService)
      .overrideGuard(JwtAuthGuard).useValue(mockJwtAuthGuard)
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(state, { merchantActive: true, maxCredit: 3000, score: 75, interestRate: 8, loans: [], submittedTxCount: 0 });
    state.txToLoanId.clear();
    state.txByHash.clear();

    mockReputationService.getReputationScore.mockResolvedValue({ wallet: validWallet, score: state.score, tier: 'silver', interestRate: state.interestRate, maxCredit: state.maxCredit, lastUpdated: '2026-07-25T09:59:00.000Z' });
    mockReputationContractClient.getScore.mockResolvedValue(state.score);
    mockCreditLineContract.buildCreateLoanTransaction.mockImplementation(async (_w, p) => `xdr-loan-create-${p.loanId}`);
    mockCreditLineContract.buildRepayLoanTx.mockImplementation(async (_w, loanId, amount) => `xdr-loan-repay-${loanId}-${amount}`);
    mockTransactionsService.submitTransaction.mockImplementation(async (_w, dto) => {
      state.submittedTxCount += 1;
      const hash = `${String(state.submittedTxCount).padStart(2, '0')}${'a'.repeat(62)}`;
      state.txByHash.set(hash, { type: dto.type, status: 'pending' });
      if (dto.type === TransactionType.LOAN_CREATE && state.loans.length > 0) state.txToLoanId.set(hash, state.loans[state.loans.length - 1].id);
      if (dto.type === TransactionType.LOAN_REPAY) { const l = state.loans.find(loan => loan.status === 'active'); if (l) state.txToLoanId.set(hash, l.id); }
      return { transactionHash: hash, status: 'pending' };
    });
    mockTransactionsService.getTransactionStatus.mockImplementation(async (hash: string) => {
      const tx = state.txByHash.get(hash);
      if (!tx) throw new Error('missing transaction');
      tx.status = 'success';
      const linkedLoanId = state.txToLoanId.get(hash);
      if (linkedLoanId) {
        const loan = state.loans.find(l => l.id === linkedLoanId);
        if (loan && tx.type === TransactionType.LOAN_CREATE) loan.status = 'active';
        if (loan && tx.type === TransactionType.LOAN_REPAY) { loan.remaining_balance = 0; loan.status = 'completed'; loan.completed_at = state.nowIso; }
      }
      return { hash, status: 'success', type: tx.type, result: { ledger: 12345, operationCount: 1, sourceAccount: validWallet, feeCharged: '100', memoType: 'none', memo: null, createdAt: state.nowIso }, error: null, submittedAt: state.nowIso, confirmedAt: state.nowIso, lastCheckedAt: state.nowIso };
    });
  });

  afterAll(async () => { if (app) await app.close(); });

  it('should execute complete BNPL lifecycle: quote -> credit check -> create -> submit -> confirm -> list -> repay -> complete', async () => {
    const quoteRes = await app.inject({ method: 'POST', url: '/loans/quote', headers: { authorization: 'Bearer test.jwt' }, payload: { amount: 500, merchant: merchantId, term: 4 } });
    expect(quoteRes.statusCode).toBe(200);
    const quoteBody = JSON.parse(quoteRes.payload);
    expect(quoteBody.success).toBe(true);
    expect(quoteBody.data.amount).toBe(500);

    const creditRes = await app.inject({ method: 'GET', url: '/loans/available-credit', headers: { authorization: 'Bearer test.jwt' } });
    expect(creditRes.statusCode).toBe(200);
    expect(JSON.parse(creditRes.payload).data.availableCredit).toBe(3000);

    const createRes = await app.inject({ method: 'POST', url: '/loans/create', headers: { authorization: 'Bearer test.jwt' }, payload: { amount: 500, merchant: merchantId, term: 4 } });
    expect(createRes.statusCode).toBe(200);
    expect(state.loans).toHaveLength(1);
    expect(state.loans[0].status).toBe('pending');

    const submitRes = await app.inject({ method: 'POST', url: '/transactions/submit', headers: { authorization: 'Bearer test.jwt' }, payload: { xdr: 'AAAAAgLOANCREATE...', type: TransactionType.LOAN_CREATE } });
    expect(submitRes.statusCode).toBe(200);

    const confirmRes = await app.inject({ method: 'GET', url: `/transactions/${JSON.parse(submitRes.payload).data.transactionHash}` });
    expect(confirmRes.statusCode).toBe(200);
    expect(state.loans[0].status).toBe('active');

    const listRes = await app.inject({ method: 'GET', url: '/loans/my-loans', headers: { authorization: 'Bearer test.jwt' } });
    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.payload);
    expect(listBody.data).toHaveLength(1);
    expect(listBody.data[0].status).toBe('active');

    const loanId = listBody.data[0].id;
    const repayRes = await app.inject({ method: 'POST', url: `/loans/${loanId}/pay`, headers: { authorization: 'Bearer test.jwt' }, payload: { amount: 410.67 } });
    expect(repayRes.statusCode).toBe(200);

    const submitRepayRes = await app.inject({ method: 'POST', url: '/transactions/submit', headers: { authorization: 'Bearer test.jwt' }, payload: { xdr: 'AAAAAgLOANREPAY...', type: TransactionType.LOAN_REPAY } });
    expect(submitRepayRes.statusCode).toBe(200);

    const confirmRepayRes = await app.inject({ method: 'GET', url: `/transactions/${JSON.parse(submitRepayRes.payload).data.transactionHash}` });
    expect(confirmRepayRes.statusCode).toBe(200);
    expect(state.loans[0].status).toBe('completed');
    expect(state.loans[0].remaining_balance).toBe(0);
  });

  it('should reject loan when merchant is inactive', async () => {
    state.merchantActive = false;
    const res = await app.inject({ method: 'POST', url: '/loans/quote', headers: { authorization: 'Bearer test.jwt' }, payload: { amount: 500, merchant: merchantId, term: 4 } });
    expect(res.statusCode).toBe(400);
  });

  it('should reject loan when credit is insufficient', async () => {
    state.maxCredit = 100;
    mockReputationService.getReputationScore.mockResolvedValue({ wallet: validWallet, score: 40, tier: 'poor', interestRate: 12, maxCredit: 100, lastUpdated: '2026-07-25T09:59:00.000Z' });
    const res = await app.inject({ method: 'POST', url: '/loans/create', headers: { authorization: 'Bearer test.jwt' }, payload: { amount: 500, merchant: merchantId, term: 4 } });
    expect(res.statusCode).toBe(400);
  });
});