import {
  Injectable,
  Inject,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import * as StellarSdk from 'stellar-sdk';
import {
  TransactionRecord,
  TransactionsRepository,
} from '../../database/repositories/transactions.repository';
import {
  HorizonTransactionResponse,
  StellarService,
} from '../../blockchain/stellar/stellar.service';
import { StellarNetworkError, TransactionNotFoundError } from '../../blockchain/stellar/stellar.errors';
import { SubmitTransactionRequestDto, TransactionType } from './dto/submit-transaction-request.dto';
import { SubmitTransactionResponseDto } from './dto/submit-transaction-response.dto';
import {
  TransactionErrorDetailsDto,
  TransactionResultDetailsDto,
  TransactionStatusResponseDto,
} from './dto/transaction-status-response.dto';

const HORIZON_ERROR_MAP: Record<string, string> = {
  op_bad_auth: 'Invalid transaction signature. Please re-sign and try again.',
  op_no_source_account: 'Source account not found on the Stellar network.',
  op_underfunded: 'Insufficient balance to complete one or more operations in this transaction.',
  tx_bad_seq: 'Transaction sequence number is outdated. Please rebuild the transaction.',
  tx_insufficient_balance: 'Insufficient balance to cover this transaction.',
  tx_bad_auth: 'Invalid transaction signature. Please re-sign and try again.',
  tx_failed: 'Transaction failed on the Stellar network.',
  tx_too_late: 'Transaction expired before it could be submitted.',
  tx_too_early: 'Transaction time bounds not yet valid.',
  tx_insufficient_fee: 'Transaction fee is too low to be accepted by the network.',
  tx_no_account: 'Source account does not exist on the Stellar network.',
};

type TransactionStatus = 'pending' | 'success' | 'failed';

const FINALIZED_TRANSACTION_CACHE_TTL = 0;

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly stellarService: StellarService,
    private readonly transactionsRepository: TransactionsRepository,
  ) {}

  async submitTransaction(
    wallet: string,
    dto: SubmitTransactionRequestDto,
  ): Promise<SubmitTransactionResponseDto> {
    const transaction = this.parseXdr(dto.xdr);

    let transactionHash: string;
    try {
      const horizonResult = await this.stellarService.submitTransaction(transaction);
      transactionHash = horizonResult.hash;
    } catch (error) {
      this.handleHorizonError(error);
    }

    this.persistTransactionRecord(wallet, transactionHash, dto.type, dto.xdr).catch((err) => {
      this.logger.error(
        `Failed to persist transaction record for hash ${transactionHash}: ${err.message}`,
      );
    });

    this.logger.log(
      `Transaction submitted — hash: ${transactionHash}, type: ${dto.type}, wallet: ${wallet.slice(0, 8)}...`,
    );

    return { transactionHash, status: 'pending' };
  }

  async getTransactionStatus(hash: string): Promise<TransactionStatusResponseDto> {
    const normalizedHash = hash.toLowerCase();
    const cacheKey = `transactions:status:${normalizedHash}`;

    const cached = await this.cacheManager.get<TransactionStatusResponseDto>(cacheKey);
    if (cached) {
      return cached;
    }

    const transactionRecord = await this.findTransactionRecord(normalizedHash);

    try {
      const horizonTransaction = await this.stellarService.getTransaction(normalizedHash);

      const response = this.buildFinalizedTransactionResponse(horizonTransaction, transactionRecord);

      await this.cacheManager.set(cacheKey, response, FINALIZED_TRANSACTION_CACHE_TTL);
      await this.persistFinalizedTransaction(transactionRecord, response);

      return response;
    } catch (error) {
      if (error instanceof TransactionNotFoundError) {
        if (transactionRecord) {
          return this.buildPendingTransactionResponse(normalizedHash, transactionRecord);
        }

        throw new NotFoundException({
          code: 'TRANSACTION_NOT_FOUND',
          message: 'Transaction hash was not found in Horizon or local records.',
        });
      }

      this.handleHorizonLookupError(error, normalizedHash);
    }
  }

  private parseXdr(xdr: string): StellarSdk.Transaction | StellarSdk.FeeBumpTransaction {
    try {
      return StellarSdk.TransactionBuilder.fromXDR(xdr, this.stellarService.getNetworkPassphrase());
    } catch {
      throw new BadRequestException({
        code: 'TRANSACTION_INVALID_XDR',
        message: 'The provided XDR string is malformed or invalid.',
      });
    }
  }

  private handleHorizonError(error: unknown): never {
    const err = error as {
      response?: { data?: { extras?: { result_codes?: { transaction?: string; operations?: string[] } } } };
      message?: string;
    };

    const resultCodes = err?.response?.data?.extras?.result_codes;

    if (resultCodes) {
      const txCode = resultCodes.transaction;
      const opCodes = resultCodes.operations ?? [];
      const allCodes = [txCode, ...opCodes].filter(Boolean);

      for (const code of allCodes) {
        if (code && HORIZON_ERROR_MAP[code]) {
          throw new BadRequestException({
            code: `STELLAR_${code.toUpperCase()}`,
            message: HORIZON_ERROR_MAP[code],
          });
        }
      }

      throw new BadRequestException({
        code: 'STELLAR_TRANSACTION_FAILED',
        message: `Transaction rejected by the Stellar network: ${allCodes.join(', ')}`,
      });
    }

    const message = err?.message ?? 'Unknown error';
    if (message.toLowerCase().includes('timeout') || message.toLowerCase().includes('network')) {
      throw new ServiceUnavailableException({
        code: 'STELLAR_NETWORK_UNAVAILABLE',
        message: 'Stellar network is temporarily unavailable. Please try again later.',
      });
    }

    this.logger.error(`Horizon submission error: ${message}`);
    throw new InternalServerErrorException({
      code: 'STELLAR_SUBMISSION_FAILED',
      message: 'Failed to submit transaction to the Stellar network. Please try again.',
    });
  }

  private async persistTransactionRecord(
    wallet: string,
    hash: string,
    type: TransactionType,
    xdr: string,
  ): Promise<void> {
    await this.transactionsRepository.create({
      userWallet: wallet,
      hash,
      type,
      xdr,
    });
  }

  private async findTransactionRecord(hash: string): Promise<TransactionRecord | null> {
    try {
      return await this.transactionsRepository.findByHash(hash);
    } catch {
      throw new InternalServerErrorException({
        code: 'TRANSACTION_LOOKUP_DB_FAILED',
        message: 'Failed to read transaction metadata from the database.',
      });
    }
  }

  private buildPendingTransactionResponse(
    hash: string,
    transactionRecord: TransactionRecord,
  ): TransactionStatusResponseDto {
    return {
      hash,
      status: 'pending',
      type: transactionRecord.type,
      result: null,
      error: null,
      submittedAt: transactionRecord.submittedAt,
      confirmedAt: null,
      lastCheckedAt: new Date().toISOString(),
    };
  }

  private buildFinalizedTransactionResponse(
    transaction: HorizonTransactionResponse,
    transactionRecord: TransactionRecord | null,
  ): TransactionStatusResponseDto {
    const status: TransactionStatus = transaction.successful ? 'success' : 'failed';
    const error = transaction.successful ? null : this.extractFailureDetails(transaction.result_xdr);

    return {
      hash: transaction.hash.toLowerCase(),
      status,
      type: transactionRecord?.type ?? null,
      result: transaction.successful ? this.extractSuccessDetails(transaction) : null,
      error,
      submittedAt: transactionRecord?.submittedAt ?? null,
      confirmedAt: transaction.created_at,
      lastCheckedAt: new Date().toISOString(),
    };
  }

  private extractSuccessDetails(
    transaction: HorizonTransactionResponse,
  ): TransactionResultDetailsDto {
    return {
      ledger: transaction.ledger_attr,
      operationCount: transaction.operation_count,
      sourceAccount: transaction.source_account,
      feeCharged: String(transaction.fee_charged ?? ''),
      memoType: transaction.memo_type,
      memo: transaction.memo ?? null,
      createdAt: transaction.created_at,
    };
  }

  private extractFailureDetails(resultXdr: string): TransactionErrorDetailsDto {
    try {
      const parsed = StellarSdk.xdr.TransactionResult.fromXDR(resultXdr, 'base64');
      const txCode = this.toSnakeCase(parsed.result().switch().name);
      const operationResults = parsed.result().value();
      const operationCodes = Array.isArray(operationResults)
        ? operationResults.map((operationResult) => this.toSnakeCase(operationResult.switch().name))
        : [];
      const primaryCode = operationCodes[0] ?? txCode;

      return {
        code: txCode,
        message: HORIZON_ERROR_MAP[primaryCode] ?? HORIZON_ERROR_MAP[txCode] ?? this.humanizeCode(primaryCode),
        operationCodes: operationCodes.length > 0 ? operationCodes : undefined,
      };
    } catch (error) {
      this.logger.warn(`Failed to parse transaction result XDR: ${(error as Error).message}`);
      return {
        code: 'tx_failed',
        message: HORIZON_ERROR_MAP.tx_failed,
      };
    }
  }

  private async persistFinalizedTransaction(
    transactionRecord: TransactionRecord | null,
    response: TransactionStatusResponseDto,
  ): Promise<void> {
    if (!transactionRecord) {
      return;
    }

    const payload = {
      status: response.status,
      result: response.result,
      error: response.error?.message ?? null,
      completed_at: response.confirmedAt,
    };

    try {
      await this.transactionsRepository.updateStatus(
        transactionRecord.hash,
        response.status,
        payload,
        { lookupColumn: transactionRecord.lookupColumn },
      );
    } catch (error) {
      this.logger.warn(
        `Failed to persist finalized transaction ${transactionRecord.hash}: ${error.message}`,
      );
    }
  }

  private handleHorizonLookupError(error: unknown, hash: string): never {
    if (error instanceof StellarNetworkError) {
      throw new ServiceUnavailableException({
        code: 'HORIZON_UNAVAILABLE',
        message: `Unable to query Horizon for transaction ${hash}. Please try again later.`,
      });
    }

    const message = (error as { message?: string })?.message ?? String(error);
    this.logger.error(`Unexpected Horizon lookup error for ${hash}: ${message}`);
    throw new InternalServerErrorException({
      code: 'TRANSACTION_STATUS_LOOKUP_FAILED',
      message: 'Failed to retrieve transaction status from Horizon.',
    });
  }

  private toSnakeCase(value: string): string {
    return value
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/-/g, '_')
      .toLowerCase();
  }

  private humanizeCode(code: string): string {
    const sentence = code.replace(/_/g, ' ').trim();
    return sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.';
  }
}
