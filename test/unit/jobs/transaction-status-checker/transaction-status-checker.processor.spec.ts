import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as StellarSdk from 'stellar-sdk';
import { LoansRepository } from '../../../../src/database/repositories/loans.repository';
import { NotificationsRepository } from '../../../../src/database/repositories/notifications.repository';
import { TransactionsRepository } from '../../../../src/database/repositories/transactions.repository';
import { TransactionStatusCheckerProcessor } from '../../../../src/jobs/transaction-status-checker/transaction-status-checker.processor';
import { SupabaseService } from '../../../../src/database/supabase.client';
import { createMockJob, createSupabaseChainMock } from '../../../helpers/job.helpers';
import {
  CREATE_LOAN_XDR_FIXTURE,
  REPAY_LOAN_XDR_FIXTURE,
  INVALID_XDR_FIXTURE,
  USER_WALLET_FIXTURE,
  createPendingTransactionFixture,
} from '../../../fixtures/jobs.fixtures';

describe('TransactionStatusCheckerProcessor', () => {
  let processor: TransactionStatusCheckerProcessor;

  let transactionsChain: ReturnType<typeof createSupabaseChainMock>;
  let loansChain: ReturnType<typeof createSupabaseChainMock>;
  let notificationsChain: ReturnType<typeof createSupabaseChainMock>;

  const mockSupabaseClient = { from: jest.fn() };
  const mockSupabaseService = {
    getServiceRoleClient: jest.fn().mockReturnValue(mockSupabaseClient),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue(undefined),
  };

  function resetChains() {
    transactionsChain = createSupabaseChainMock();
    loansChain = createSupabaseChainMock();
    notificationsChain = createSupabaseChainMock();

    mockSupabaseClient.from.mockImplementation((table: string) => {
      switch (table) {
        case 'transactions':
          return transactionsChain;
        case 'loans':
          return loansChain;
        case 'notifications':
          return notificationsChain;
        default:
          return createSupabaseChainMock();
      }
    });
  }

  /** Horizon's `.transactions().transaction(hash).call()` chain, mocked at the prototype level. */
  const mockCall = jest.fn();
  const mockTransactionBuilder = jest.fn().mockReturnValue({ call: mockCall });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionStatusCheckerProcessor,
        { provide: SupabaseService, useValue: mockSupabaseService },
        { provide: ConfigService, useValue: mockConfigService },
        TransactionsRepository,
        LoansRepository,
        NotificationsRepository,
      ],
    }).compile();

    processor = module.get(TransactionStatusCheckerProcessor);

    jest.clearAllMocks();
    mockSupabaseService.getServiceRoleClient.mockReturnValue(mockSupabaseClient);
    mockConfigService.get.mockReturnValue(undefined);
    resetChains();

    // Retries use real setTimeout back-off — skip the wait so tests stay fast.
    jest.spyOn(processor as any, 'wait').mockResolvedValue(undefined);

    jest
      .spyOn(StellarSdk.Horizon.Server.prototype, 'transactions')
      .mockReturnValue({ transaction: mockTransactionBuilder } as any);
    mockTransactionBuilder.mockReturnValue({ call: mockCall });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  // =========================================================================
  // create_loan follow-up
  // =========================================================================

  describe('successful create_loan transaction', () => {
    it('should activate the pending loan and create a success notification', async () => {
      const tx = createPendingTransactionFixture({
        type: 'loan_create',
        xdr: CREATE_LOAN_XDR_FIXTURE,
      });

      transactionsChain.limit.mockResolvedValue({ data: [tx], error: null });
      mockCall.mockResolvedValue({ successful: true, result_codes: undefined });
      transactionsChain.maybeSingle.mockResolvedValue({
        data: { id: tx.id, user_wallet: tx.user_wallet, transaction_hash: tx.transaction_hash, type: tx.type, xdr: tx.xdr },
        error: null,
      });
      loansChain.maybeSingle.mockResolvedValue({
        data: { loan_id: 'LOAN-FIXTURE-001', status: 'pending' },
        error: null,
      });

      await processor.process(createMockJob());

      expect(loansChain.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'active' }),
      );
      expect(notificationsChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_wallet: tx.user_wallet,
          type: 'loan_create_success',
          data: expect.objectContaining({ loanId: 'LOAN-FIXTURE-001' }),
        }),
      );
    });

    it('should leave the loan untouched if it is no longer pending', async () => {
      const tx = createPendingTransactionFixture({ type: 'loan_create', xdr: CREATE_LOAN_XDR_FIXTURE });

      transactionsChain.limit.mockResolvedValue({ data: [tx], error: null });
      mockCall.mockResolvedValue({ successful: true });
      transactionsChain.maybeSingle.mockResolvedValue({
        data: { id: tx.id, user_wallet: tx.user_wallet, transaction_hash: tx.transaction_hash, type: tx.type, xdr: tx.xdr },
        error: null,
      });
      loansChain.maybeSingle.mockResolvedValue({
        data: { loan_id: 'LOAN-FIXTURE-001', status: 'active' },
        error: null,
      });

      await processor.process(createMockJob());

      expect(loansChain.update).not.toHaveBeenCalled();
      expect(notificationsChain.insert).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // repay_loan follow-up
  // =========================================================================

  describe('successful repay_loan transaction', () => {
    it('should reduce the remaining balance and create a success notification', async () => {
      const tx = createPendingTransactionFixture({
        type: 'loan_repay',
        xdr: REPAY_LOAN_XDR_FIXTURE,
      });

      transactionsChain.limit.mockResolvedValue({ data: [tx], error: null });
      mockCall.mockResolvedValue({ successful: true });
      transactionsChain.maybeSingle.mockResolvedValue({
        data: { id: tx.id, user_wallet: tx.user_wallet, transaction_hash: tx.transaction_hash, type: tx.type, xdr: tx.xdr },
        error: null,
      });
      loansChain.maybeSingle.mockResolvedValue({
        data: { remaining_balance: '200', status: 'active' },
        error: null,
      });

      await processor.process(createMockJob());

      expect(loansChain.update).toHaveBeenCalledWith(
        expect.objectContaining({ remaining_balance: 150 }),
      );
      expect(notificationsChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ user_wallet: tx.user_wallet, type: 'loan_repay_success' }),
      );
    });

    it('should mark the loan completed when the repayment clears the balance', async () => {
      const tx = createPendingTransactionFixture({
        type: 'loan_repay',
        xdr: REPAY_LOAN_XDR_FIXTURE,
      });

      transactionsChain.limit.mockResolvedValue({ data: [tx], error: null });
      mockCall.mockResolvedValue({ successful: true });
      transactionsChain.maybeSingle.mockResolvedValue({
        data: { id: tx.id, user_wallet: tx.user_wallet, transaction_hash: tx.transaction_hash, type: tx.type, xdr: tx.xdr },
        error: null,
      });
      loansChain.maybeSingle.mockResolvedValue({
        data: { remaining_balance: '50', status: 'active' },
        error: null,
      });

      await processor.process(createMockJob());

      expect(loansChain.update).toHaveBeenCalledWith(
        expect.objectContaining({ remaining_balance: 0, status: 'completed' }),
      );
    });
  });

  // =========================================================================
  // Horizon retry / error handling
  // =========================================================================

  describe('Horizon transient errors', () => {
    it('should retry up to the max attempts and continue without throwing', async () => {
      const tx = createPendingTransactionFixture();
      transactionsChain.limit.mockResolvedValue({ data: [tx], error: null });
      mockCall.mockRejectedValue(new Error('request timeout'));

      await expect(processor.process(createMockJob())).resolves.not.toThrow();

      expect(mockCall).toHaveBeenCalledTimes(3);
      expect(transactionsChain.update).not.toHaveBeenCalled();
    });
  });

  describe('Horizon 404 not found', () => {
    it('should leave the transaction pending without retrying or finalizing', async () => {
      const tx = createPendingTransactionFixture();
      transactionsChain.limit.mockResolvedValue({ data: [tx], error: null });
      mockCall.mockRejectedValue(new StellarSdk.NotFoundError('Not Found', {} as any));

      await expect(processor.process(createMockJob())).resolves.not.toThrow();

      expect(mockCall).toHaveBeenCalledTimes(1);
      expect(transactionsChain.update).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // XDR parse failure
  // =========================================================================

  describe('XDR parse failure', () => {
    it('should log and continue gracefully, finalizing with a generic notification', async () => {
      const tx = createPendingTransactionFixture({
        type: 'loan_create',
        xdr: INVALID_XDR_FIXTURE,
      });

      transactionsChain.limit.mockResolvedValue({ data: [tx], error: null });
      mockCall.mockResolvedValue({ successful: true });
      transactionsChain.maybeSingle.mockResolvedValue({
        data: { id: tx.id, user_wallet: tx.user_wallet, transaction_hash: tx.transaction_hash, type: tx.type, xdr: tx.xdr },
        error: null,
      });

      await expect(processor.process(createMockJob())).resolves.not.toThrow();

      // No loanId could be parsed, so no loan lookup/activation happens.
      expect(mockSupabaseClient.from).not.toHaveBeenCalledWith('loans');
      expect(notificationsChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'loan_create_success',
          data: expect.objectContaining({ loanId: null }),
        }),
      );
    });
  });

  // =========================================================================
  // cleanupOldTransactions
  // =========================================================================

  describe('cleanupOldTransactions', () => {
    it('should delete non-pending transactions older than 7 days using the correct cutoff', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-20T12:00:00.000Z'));

      transactionsChain.limit.mockResolvedValue({ data: [], error: null });

      await processor.process(createMockJob());

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('transactions');
      expect(transactionsChain.lt).toHaveBeenCalledWith(
        'submitted_at',
        new Date('2026-07-13T12:00:00.000Z').toISOString(),
      );
      expect(transactionsChain.neq).toHaveBeenCalledWith('status', 'pending');

      jest.useRealTimers();
    });
  });
});
