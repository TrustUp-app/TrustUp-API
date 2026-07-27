import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as StellarSdk from 'stellar-sdk';
import { TransactionsRepository } from '../../../../src/database/repositories/transactions.repository';
import { StellarService } from '../../../../src/blockchain/stellar/stellar.service';
import {
  StellarNetworkError,
  TransactionNotFoundError,
} from '../../../../src/blockchain/stellar/stellar.errors';
import { TransactionsService } from '../../../../src/modules/transactions/transactions.service';
import { TransactionType } from '../../../../src/modules/transactions/dto/submit-transaction-request.dto';

describe('TransactionsService', () => {
  let service: TransactionsService;

  const validWallet = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';
  const validHash = 'a'.repeat(64);
  const now = '2026-03-23T05:16:00.000Z';

  const mockCacheManager = {
    get: jest.fn(),
    set: jest.fn(),
  };

  const mockStellarService = {
    submitTransaction: jest.fn(),
    getTransaction: jest.fn(),
    getNetworkPassphrase: jest.fn().mockReturnValue(StellarSdk.Networks.TESTNET),
  };

  const mockTransactionsRepository = {
    create: jest.fn(),
    findByHash: jest.fn(),
    updateStatus: jest.fn(),
  };

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(new Date(now));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
        { provide: StellarService, useValue: mockStellarService },
        { provide: TransactionsRepository, useValue: mockTransactionsRepository },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
    jest.clearAllMocks();
    mockStellarService.getNetworkPassphrase.mockReturnValue(StellarSdk.Networks.TESTNET);
    mockTransactionsRepository.create.mockResolvedValue(undefined);
    mockTransactionsRepository.updateStatus.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  function buildValidXdr(): string {
    const keypair = StellarSdk.Keypair.random();
    const account = new StellarSdk.Account(keypair.publicKey(), '0');
    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: StellarSdk.Networks.TESTNET,
    })
      .addOperation(
        StellarSdk.Operation.payment({
          destination: keypair.publicKey(),
          asset: StellarSdk.Asset.native(),
          amount: '1',
        }),
      )
      .setTimeout(30)
      .build();
    tx.sign(keypair);
    return tx.toXDR();
  }

  function buildHorizonResultCodesError(transaction: string, operations: string[] = []): unknown {
    return {
      response: { data: { extras: { result_codes: { transaction, operations } } } },
      message: 'Transaction submission failed',
    };
  }

  it('should return finalized cached responses without calling Horizon', async () => {
    mockCacheManager.get.mockResolvedValue({
      hash: validHash,
      status: 'success',
      type: 'deposit' as TransactionType,
      result: {
        ledger: 123,
        operationCount: 1,
        sourceAccount: validWallet,
        feeCharged: '100',
        memoType: 'none',
        memo: null,
        createdAt: '2026-03-23T05:15:30Z',
      },
      error: null,
      submittedAt: '2026-03-23T05:15:00.000Z',
      confirmedAt: '2026-03-23T05:15:30Z',
      lastCheckedAt: now,
    });

    const result = await service.getTransactionStatus(validHash);

    expect(result.status).toBe('success');
    expect(mockStellarService.getTransaction).not.toHaveBeenCalled();
  });

  it('should return and cache a successful finalized transaction', async () => {
    mockCacheManager.get.mockResolvedValue(undefined);
    mockTransactionsRepository.findByHash.mockResolvedValue({
      lookupColumn: 'hash',
      hash: validHash,
      type: 'loan_repay',
      status: 'pending',
      submittedAt: '2026-03-23T05:15:00.000Z',
      completedAt: null,
      updatedAt: '2026-03-23T05:15:10.000Z',
    });
    mockStellarService.getTransaction.mockResolvedValue({
      hash: validHash,
      successful: true,
      ledger_attr: 123456,
      operation_count: 2,
      source_account: validWallet,
      fee_charged: '100',
      memo_type: 'text',
      memo: 'Loan repayment',
      created_at: '2026-03-23T05:15:30Z',
    });

    const result = await service.getTransactionStatus(validHash);

    expect(result).toMatchObject({
      hash: validHash,
      status: 'success',
      type: 'loan_repay',
      submittedAt: '2026-03-23T05:15:00.000Z',
      confirmedAt: '2026-03-23T05:15:30Z',
      result: {
        ledger: 123456,
        operationCount: 2,
        sourceAccount: validWallet,
      },
      error: null,
    });
    expect(mockCacheManager.set).toHaveBeenCalledWith(
      `transactions:status:${validHash}`,
      expect.objectContaining({ status: 'success' }),
      0,
    );
  });

  it('should return pending when Horizon cannot find a locally tracked transaction yet', async () => {
    mockCacheManager.get.mockResolvedValue(undefined);
    mockTransactionsRepository.findByHash.mockResolvedValue({
      lookupColumn: 'hash',
      hash: validHash,
      type: 'deposit' as TransactionType,
      status: 'pending',
      submittedAt: '2026-03-23T05:15:00.000Z',
      completedAt: null,
      updatedAt: '2026-03-23T05:15:10.000Z',
    });
    mockStellarService.getTransaction.mockRejectedValue(new TransactionNotFoundError(validHash));

    const result = await service.getTransactionStatus(validHash);

    expect(result).toEqual({
      hash: validHash,
      status: 'pending',
      type: 'deposit' as TransactionType,
      result: null,
      error: null,
      submittedAt: '2026-03-23T05:15:00.000Z',
      confirmedAt: null,
      lastCheckedAt: now,
    });
  });

  it('should return 404 when Horizon cannot find an unknown hash', async () => {
    mockCacheManager.get.mockResolvedValue(undefined);
    mockTransactionsRepository.findByHash.mockResolvedValue(null);
    mockStellarService.getTransaction.mockRejectedValue(new TransactionNotFoundError(validHash));

    await expect(service.getTransactionStatus(validHash)).rejects.toThrow(NotFoundException);
  });

  it('should return 503 when Horizon is temporarily unavailable', async () => {
    mockCacheManager.get.mockResolvedValue(undefined);
    mockTransactionsRepository.findByHash.mockResolvedValue({
      lookupColumn: 'hash',
      hash: validHash,
      type: 'deposit' as TransactionType,
      status: 'pending',
      submittedAt: '2026-03-23T05:15:00.000Z',
      completedAt: null,
      updatedAt: null,
    });
    mockStellarService.getTransaction.mockRejectedValue(
      new StellarNetworkError('Stellar network request failed'),
    );

    await expect(service.getTransactionStatus(validHash)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('should return failure details and cache finalized failed transactions', async () => {
    mockCacheManager.get.mockResolvedValue(undefined);
    mockTransactionsRepository.findByHash.mockResolvedValue({
      lookupColumn: 'hash',
      hash: validHash,
      type: 'withdraw' as TransactionType,
      status: 'pending',
      submittedAt: '2026-03-23T05:15:00.000Z',
      completedAt: null,
      updatedAt: '2026-03-23T05:15:10.000Z',
    });
    mockStellarService.getTransaction.mockResolvedValue({
      hash: validHash,
      successful: false,
      result_xdr: 'AAAA',
      ledger_attr: 123456,
      operation_count: 1,
      source_account: validWallet,
      fee_charged: '100',
      memo_type: 'none',
      memo: undefined,
      created_at: '2026-03-23T05:15:30Z',
    });
    jest.spyOn(StellarSdk.xdr.TransactionResult, 'fromXDR').mockReturnValue({
      result: () => ({
        switch: () => ({ name: 'txFailed' }),
        value: () => [{ switch: () => ({ name: 'opUnderfunded' }) }],
      }),
    } as any);

    const result = await service.getTransactionStatus(validHash);

    expect(result).toMatchObject({
      hash: validHash,
      status: 'failed',
      type: 'withdraw' as TransactionType,
      result: null,
      error: {
        code: 'tx_failed',
        message:
          'Insufficient balance to complete one or more operations in this transaction.',
        operationCodes: ['op_underfunded'],
      },
      submittedAt: '2026-03-23T05:15:00.000Z',
      confirmedAt: '2026-03-23T05:15:30Z',
    });
    expect(mockCacheManager.set).toHaveBeenCalledWith(
      `transactions:status:${validHash}`,
      expect.objectContaining({ status: 'failed' }),
      0,
    );
  });

  // ══════════════════════════════════════════════════════════════════════════
  // submitTransaction
  // ══════════════════════════════════════════════════════════════════════════

  describe('submitTransaction', () => {
    it('returns pending status and the transaction hash on a successful Horizon submission', async () => {
      mockStellarService.submitTransaction.mockResolvedValue({ hash: validHash });

      const result = await service.submitTransaction(validWallet, {
        xdr: buildValidXdr(),
        type: 'deposit' as TransactionType,
      });

      expect(result).toEqual({ transactionHash: validHash, status: 'pending' });
      expect(mockStellarService.submitTransaction).toHaveBeenCalledTimes(1);
    });

    it('throws BadRequestException with TRANSACTION_INVALID_XDR when XDR is malformed', async () => {
      await expect(
        service.submitTransaction(validWallet, { xdr: 'not-valid-xdr', type: 'deposit' as TransactionType }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.submitTransaction(validWallet, { xdr: 'not-valid-xdr', type: 'deposit' as TransactionType }),
      ).rejects.toMatchObject({ response: { code: 'TRANSACTION_INVALID_XDR' } });
    });

    it('throws BadRequestException mapped from a known tx-level result code (tx_bad_auth)', async () => {
      mockStellarService.submitTransaction.mockRejectedValue(
        buildHorizonResultCodesError('tx_bad_auth'),
      );

      await expect(
        service.submitTransaction(validWallet, { xdr: buildValidXdr(), type: 'deposit' as TransactionType }),
      ).rejects.toMatchObject({
        response: { code: 'STELLAR_TX_BAD_AUTH' },
      });
    });

    it('throws BadRequestException with STELLAR_TRANSACTION_FAILED for an unmapped result code', async () => {
      mockStellarService.submitTransaction.mockRejectedValue(
        buildHorizonResultCodesError('tx_some_unknown_code'),
      );

      await expect(
        service.submitTransaction(validWallet, { xdr: buildValidXdr(), type: 'deposit' as TransactionType }),
      ).rejects.toMatchObject({
        response: { code: 'STELLAR_TRANSACTION_FAILED' },
      });
    });

    it('throws ServiceUnavailableException when Horizon submission times out', async () => {
      mockStellarService.submitTransaction.mockRejectedValue(new Error('network timeout'));

      await expect(
        service.submitTransaction(validWallet, { xdr: buildValidXdr(), type: 'deposit' as TransactionType }),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('throws InternalServerErrorException for an unexpected Horizon submission error', async () => {
      mockStellarService.submitTransaction.mockRejectedValue(new Error('something unexpected'));

      await expect(
        service.submitTransaction(validWallet, { xdr: buildValidXdr(), type: 'deposit' as TransactionType }),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // getTransactionStatus – additional cases
  // ══════════════════════════════════════════════════════════════════════════

  describe('getTransactionStatus – additional', () => {
    it('normalises an uppercase hash to lowercase before cache key and DB lookup', async () => {
      mockCacheManager.get.mockResolvedValue(undefined);
      mockTransactionsRepository.findByHash.mockResolvedValue(null);
      mockStellarService.getTransaction.mockRejectedValue(new TransactionNotFoundError(validHash));

      await expect(service.getTransactionStatus(validHash.toUpperCase())).rejects.toThrow(
        NotFoundException,
      );

      expect(mockCacheManager.get).toHaveBeenCalledWith(
        `transactions:status:${validHash.toLowerCase()}`,
      );
      expect(mockTransactionsRepository.findByHash).toHaveBeenCalledWith(validHash.toLowerCase());
    });

    it('returns type: null when a finalized transaction has no local DB record', async () => {
      mockCacheManager.get.mockResolvedValue(undefined);
      mockTransactionsRepository.findByHash.mockResolvedValue(null);
      mockStellarService.getTransaction.mockResolvedValue({
        hash: validHash,
        successful: true,
        ledger_attr: 1,
        operation_count: 1,
        source_account: validWallet,
        fee_charged: '100',
        memo_type: 'none',
        memo: undefined,
        created_at: now,
        result_xdr: '',
      });

      const result = await service.getTransactionStatus(validHash);

      expect(result.status).toBe('success');
      expect(result.type).toBeNull();
    });

    it('throws ServiceUnavailableException when Horizon lookup fails after retries', async () => {
      mockCacheManager.get.mockResolvedValue(undefined);
      mockTransactionsRepository.findByHash.mockResolvedValue({
        lookupColumn: 'hash',
        hash: validHash,
        type: 'deposit' as TransactionType,
        status: 'pending',
        submittedAt: now,
        completedAt: null,
        updatedAt: null,
      });
      mockStellarService.getTransaction.mockRejectedValue(
        new StellarNetworkError('Stellar network request failed'),
      );

      await expect(service.getTransactionStatus(validHash)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('throws InternalServerErrorException for an unexpected status-lookup error', async () => {
      mockCacheManager.get.mockResolvedValue(undefined);
      mockTransactionsRepository.findByHash.mockResolvedValue({
        lookupColumn: 'hash',
        hash: validHash,
        type: 'deposit' as TransactionType,
        status: 'pending',
        submittedAt: now,
        completedAt: null,
        updatedAt: null,
      });
      mockStellarService.getTransaction.mockRejectedValue(new Error('unexpected failure'));

      await expect(service.getTransactionStatus(validHash)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('skips DB persistence when there is no local transaction record', async () => {
      mockCacheManager.get.mockResolvedValue(undefined);
      mockTransactionsRepository.findByHash.mockResolvedValue(null);
      mockStellarService.getTransaction.mockResolvedValue({
        hash: validHash,
        successful: true,
        ledger_attr: 1,
        operation_count: 1,
        source_account: validWallet,
        fee_charged: '100',
        memo_type: 'none',
        memo: undefined,
        created_at: now,
        result_xdr: '',
      });

      await service.getTransactionStatus(validHash);

      expect(mockTransactionsRepository.updateStatus).not.toHaveBeenCalled();
    });

    it('propagates a DB lookup failure as TRANSACTION_LOOKUP_DB_FAILED', async () => {
      mockCacheManager.get.mockResolvedValue(undefined);
      mockTransactionsRepository.findByHash.mockRejectedValue(new Error('db unreachable'));

      await expect(service.getTransactionStatus(validHash)).rejects.toMatchObject({
        response: { code: 'TRANSACTION_LOOKUP_DB_FAILED' },
      });
    });
  });
});
