import { Test, TestingModule } from '@nestjs/testing';
import { LoansRepository } from '../../../../src/database/repositories/loans.repository';
import { NotificationsRepository } from '../../../../src/database/repositories/notifications.repository';
import { TransactionsRepository } from '../../../../src/database/repositories/transactions.repository';
import { TransactionStatusCheckerProcessor } from '../../../../src/jobs/transaction-status-checker/transaction-status-checker.processor';
import { StellarService } from '../../../../src/blockchain/stellar/stellar.service';
import {
  StellarNetworkError,
  TransactionNotFoundError,
} from '../../../../src/blockchain/stellar/stellar.errors';
import { createMockJob } from '../../../helpers/job.helpers';
import {
  CREATE_LOAN_XDR_FIXTURE,
  REPAY_LOAN_XDR_FIXTURE,
  INVALID_XDR_FIXTURE,
  createPendingTransactionFixture,
} from '../../../fixtures/jobs.fixtures';

describe('TransactionStatusCheckerProcessor', () => {
  let processor: TransactionStatusCheckerProcessor;

  const mockStellarService = {
    getTransaction: jest.fn(),
    getNetworkPassphrase: jest.fn().mockReturnValue('Test SDF Network ; September 2015'),
  };

  const mockTransactionsRepository = {
    findPending: jest.fn(),
    updateStatus: jest.fn(),
    deleteOlderThan: jest.fn(),
  };

  const mockLoansRepository = {
    findStatusByLoanIdAndWallet: jest.fn(),
    findBalanceByLoanIdAndWallet: jest.fn(),
    updateStatus: jest.fn(),
    updateByLoanIdAndWallet: jest.fn(),
  };

  const mockNotificationsRepository = {
    create: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionStatusCheckerProcessor,
        { provide: StellarService, useValue: mockStellarService },
        { provide: TransactionsRepository, useValue: mockTransactionsRepository },
        { provide: LoansRepository, useValue: mockLoansRepository },
        { provide: NotificationsRepository, useValue: mockNotificationsRepository },
      ],
    }).compile();

    processor = module.get(TransactionStatusCheckerProcessor);

    jest.clearAllMocks();
    mockStellarService.getNetworkPassphrase.mockReturnValue('Test SDF Network ; September 2015');
    mockTransactionsRepository.deleteOlderThan.mockResolvedValue(undefined);
    mockTransactionsRepository.updateStatus.mockResolvedValue(null);
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

      mockTransactionsRepository.findPending.mockResolvedValue([
        {
          id: tx.id,
          userWallet: tx.user_wallet,
          hash: tx.transaction_hash,
          type: tx.type,
          status: tx.status,
          xdr: tx.xdr,
          submittedAt: tx.submitted_at,
          updatedAt: tx.updated_at,
        },
      ]);
      mockStellarService.getTransaction.mockResolvedValue({
        hash: tx.transaction_hash,
        successful: true,
        result_codes: undefined,
      });
      mockTransactionsRepository.updateStatus.mockResolvedValue({
        id: tx.id,
        userWallet: tx.user_wallet,
        hash: tx.transaction_hash,
        type: tx.type,
        status: 'success',
        xdr: tx.xdr,
      });
      mockLoansRepository.findStatusByLoanIdAndWallet.mockResolvedValue({
        loan_id: 'LOAN-FIXTURE-001',
        status: 'pending',
      });

      await processor.process(createMockJob());

      expect(mockLoansRepository.updateStatus).toHaveBeenCalledWith(
        'LOAN-FIXTURE-001',
        tx.user_wallet,
        'active',
        'pending',
      );
      expect(mockNotificationsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user_wallet: tx.user_wallet,
          type: 'loan_create_success',
          data: expect.objectContaining({ loanId: 'LOAN-FIXTURE-001' }),
        }),
      );
    });

    it('should leave the loan untouched if it is no longer pending', async () => {
      const tx = createPendingTransactionFixture({ type: 'loan_create', xdr: CREATE_LOAN_XDR_FIXTURE });

      mockTransactionsRepository.findPending.mockResolvedValue([
        {
          id: tx.id,
          userWallet: tx.user_wallet,
          hash: tx.transaction_hash,
          type: tx.type,
          status: tx.status,
          xdr: tx.xdr,
          submittedAt: tx.submitted_at,
          updatedAt: tx.updated_at,
        },
      ]);
      mockStellarService.getTransaction.mockResolvedValue({
        hash: tx.transaction_hash,
        successful: true,
      });
      mockTransactionsRepository.updateStatus.mockResolvedValue({
        id: tx.id,
        userWallet: tx.user_wallet,
        hash: tx.transaction_hash,
        type: tx.type,
        status: 'success',
        xdr: tx.xdr,
      });
      mockLoansRepository.findStatusByLoanIdAndWallet.mockResolvedValue({
        loan_id: 'LOAN-FIXTURE-001',
        status: 'active',
      });

      await processor.process(createMockJob());

      expect(mockLoansRepository.updateStatus).not.toHaveBeenCalled();
      expect(mockNotificationsRepository.create).toHaveBeenCalled();
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

      mockTransactionsRepository.findPending.mockResolvedValue([
        {
          id: tx.id,
          userWallet: tx.user_wallet,
          hash: tx.transaction_hash,
          type: tx.type,
          status: tx.status,
          xdr: tx.xdr,
          submittedAt: tx.submitted_at,
          updatedAt: tx.updated_at,
        },
      ]);
      mockStellarService.getTransaction.mockResolvedValue({
        hash: tx.transaction_hash,
        successful: true,
      });
      mockTransactionsRepository.updateStatus.mockResolvedValue({
        id: tx.id,
        userWallet: tx.user_wallet,
        hash: tx.transaction_hash,
        type: tx.type,
        status: 'success',
        xdr: tx.xdr,
      });
      mockLoansRepository.findBalanceByLoanIdAndWallet.mockResolvedValue({
        remaining_balance: '200',
        status: 'active',
      });

      await processor.process(createMockJob());

      expect(mockLoansRepository.updateByLoanIdAndWallet).toHaveBeenCalledWith(
        'LOAN-FIXTURE-001',
        tx.user_wallet,
        expect.objectContaining({ remaining_balance: 150 }),
      );
      expect(mockNotificationsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ user_wallet: tx.user_wallet, type: 'loan_repay_success' }),
      );
    });

    it('should mark the loan completed when the repayment clears the balance', async () => {
      const tx = createPendingTransactionFixture({
        type: 'loan_repay',
        xdr: REPAY_LOAN_XDR_FIXTURE,
      });

      mockTransactionsRepository.findPending.mockResolvedValue([
        {
          id: tx.id,
          userWallet: tx.user_wallet,
          hash: tx.transaction_hash,
          type: tx.type,
          status: tx.status,
          xdr: tx.xdr,
          submittedAt: tx.submitted_at,
          updatedAt: tx.updated_at,
        },
      ]);
      mockStellarService.getTransaction.mockResolvedValue({
        hash: tx.transaction_hash,
        successful: true,
      });
      mockTransactionsRepository.updateStatus.mockResolvedValue({
        id: tx.id,
        userWallet: tx.user_wallet,
        hash: tx.transaction_hash,
        type: tx.type,
        status: 'success',
        xdr: tx.xdr,
      });
      mockLoansRepository.findBalanceByLoanIdAndWallet.mockResolvedValue({
        remaining_balance: '50',
        status: 'active',
      });

      await processor.process(createMockJob());

      expect(mockLoansRepository.updateByLoanIdAndWallet).toHaveBeenCalledWith(
        'LOAN-FIXTURE-001',
        tx.user_wallet,
        expect.objectContaining({ remaining_balance: 0, status: 'completed' }),
      );
    });
  });

  // =========================================================================
  // Horizon retry / error handling
  // =========================================================================

  describe('Horizon transient errors', () => {
    it('should continue without throwing when StellarService exhausts retries', async () => {
      const tx = createPendingTransactionFixture();
      mockTransactionsRepository.findPending.mockResolvedValue([
        {
          id: tx.id,
          userWallet: tx.user_wallet,
          hash: tx.transaction_hash,
          type: tx.type,
          status: tx.status,
          xdr: tx.xdr,
          submittedAt: tx.submitted_at,
          updatedAt: tx.updated_at,
        },
      ]);
      mockStellarService.getTransaction.mockRejectedValue(
        new StellarNetworkError('Stellar network request failed'),
      );

      await expect(processor.process(createMockJob())).resolves.not.toThrow();

      expect(mockStellarService.getTransaction).toHaveBeenCalledWith(tx.transaction_hash);
      expect(mockTransactionsRepository.updateStatus).not.toHaveBeenCalledWith(
        tx.transaction_hash,
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ onlyPending: true }),
      );
    });
  });

  describe('Horizon 404 not found', () => {
    it('should leave the transaction pending without finalizing', async () => {
      const tx = createPendingTransactionFixture();
      mockTransactionsRepository.findPending.mockResolvedValue([
        {
          id: tx.id,
          userWallet: tx.user_wallet,
          hash: tx.transaction_hash,
          type: tx.type,
          status: tx.status,
          xdr: tx.xdr,
          submittedAt: tx.submitted_at,
          updatedAt: tx.updated_at,
        },
      ]);
      mockStellarService.getTransaction.mockRejectedValue(
        new TransactionNotFoundError(tx.transaction_hash),
      );

      await expect(processor.process(createMockJob())).resolves.not.toThrow();

      expect(mockStellarService.getTransaction).toHaveBeenCalledTimes(1);
      expect(mockTransactionsRepository.updateStatus).not.toHaveBeenCalledWith(
        tx.transaction_hash,
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ onlyPending: true }),
      );
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

      mockTransactionsRepository.findPending.mockResolvedValue([
        {
          id: tx.id,
          userWallet: tx.user_wallet,
          hash: tx.transaction_hash,
          type: tx.type,
          status: tx.status,
          xdr: tx.xdr,
          submittedAt: tx.submitted_at,
          updatedAt: tx.updated_at,
        },
      ]);
      mockStellarService.getTransaction.mockResolvedValue({
        hash: tx.transaction_hash,
        successful: true,
      });
      mockTransactionsRepository.updateStatus.mockResolvedValue({
        id: tx.id,
        userWallet: tx.user_wallet,
        hash: tx.transaction_hash,
        type: tx.type,
        status: 'success',
        xdr: tx.xdr,
      });

      await expect(processor.process(createMockJob())).resolves.not.toThrow();

      // No loanId could be parsed, so no loan lookup/activation happens.
      expect(mockLoansRepository.findStatusByLoanIdAndWallet).not.toHaveBeenCalled();
      expect(mockNotificationsRepository.create).toHaveBeenCalledWith(
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

      mockTransactionsRepository.findPending.mockResolvedValue([]);

      await processor.process(createMockJob());

      expect(mockTransactionsRepository.deleteOlderThan).toHaveBeenCalledWith(
        new Date('2026-07-13T12:00:00.000Z').toISOString(),
      );

      jest.useRealTimers();
    });
  });
});
