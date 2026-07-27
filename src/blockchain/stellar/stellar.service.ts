import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as StellarSdk from 'stellar-sdk';
import { Horizon } from 'stellar-sdk';
import { StellarNetworkError, TransactionNotFoundError } from './stellar.errors';

const MAX_RETRY_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 500;
const REQUEST_TIMEOUT_MS = 10000;

export interface HorizonTransactionResponse {
  hash: string;
  successful: boolean;
  ledger_attr?: number;
  operation_count?: number;
  source_account?: string;
  fee_charged?: number | string;
  memo_type?: string;
  memo?: string;
  created_at: string;
  result_xdr: string;
  result_codes?: unknown;
  [key: string]: unknown;
}

/**
 * Centralizes the Horizon client used across the app. Wraps every request
 * with a shared exponential back-off retry policy, a per-request timeout,
 * and normalized error types so callers no longer need to inspect raw
 * Horizon/axios error shapes.
 */
@Injectable()
export class StellarService {
  private readonly logger = new Logger(StellarService.name);
  private readonly horizonServer: StellarSdk.Horizon.Server;
  private readonly networkPassphrase: string;

  constructor(private readonly configService: ConfigService) {
    const horizonUrl =
      this.configService.get<string>('STELLAR_HORIZON_URL') ||
      'https://horizon-testnet.stellar.org';

    this.networkPassphrase =
      this.configService.get<string>('STELLAR_NETWORK_PASSPHRASE') ||
      StellarSdk.Networks.TESTNET;

    this.horizonServer = new StellarSdk.Horizon.Server(horizonUrl);
    this.logger.log(`Horizon client initialized: ${horizonUrl}`);
  }

  getNetworkPassphrase(): string {
    return this.networkPassphrase;
  }

  /**
   * Submits a signed transaction to the network. Not retried — a submission
   * that reaches Horizon may already have been applied, so retrying could
   * double-submit. Errors are rethrown as-is (not normalized) since callers
   * need the raw Horizon result_codes to map to user-facing messages.
   */
  async submitTransaction(
    transaction: StellarSdk.Transaction | StellarSdk.FeeBumpTransaction,
  ): Promise<Horizon.HorizonApi.SubmitTransactionResponse> {
    return this.withTimeout(this.horizonServer.submitTransaction(transaction));
  }

  /**
   * Fetches a transaction by hash, including failed transactions. Retries
   * transient network errors with exponential back-off; throws
   * TransactionNotFoundError immediately on a 404 (not retried).
   */
  async getTransaction(hash: string): Promise<HorizonTransactionResponse> {
    return this.withRetry(async () => {
      try {
        return (await this.withTimeout(
          this.horizonServer.transactions().includeFailed(true).transaction(hash).call(),
        )) as unknown as HorizonTransactionResponse;
      } catch (error) {
        if (this.isNotFoundError(error)) {
          throw new TransactionNotFoundError(hash, error);
        }
        throw error;
      }
    }, `getTransaction(${hash})`);
  }

  private async withRetry<T>(operation: () => Promise<T>, context: string): Promise<T> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt < MAX_RETRY_ATTEMPTS) {
      try {
        return await operation();
      } catch (error) {
        if (error instanceof TransactionNotFoundError) {
          throw error;
        }

        lastError = error;
        attempt += 1;

        if (!this.isTransientError(error) || attempt >= MAX_RETRY_ATTEMPTS) {
          throw this.normalizeError(error, context);
        }

        const delayMs = this.computeBackoffDelay(attempt);
        this.logger.warn(
          `Transient Horizon error on ${context} (attempt ${attempt}/${MAX_RETRY_ATTEMPTS}) — retrying in ${delayMs}ms: ${this.extractMessage(error)}`,
        );
        await this.wait(delayMs);
      }
    }

    throw this.normalizeError(lastError, context);
  }

  private computeBackoffDelay(attempt: number): number {
    const exponentialDelay = BASE_RETRY_DELAY_MS * 2 ** (attempt - 1);
    const jitter = Math.random() * exponentialDelay * 0.5;
    return Math.round(exponentialDelay + jitter);
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private withTimeout<T>(promise: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Horizon request timed out after ${REQUEST_TIMEOUT_MS}ms`));
      }, REQUEST_TIMEOUT_MS);

      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private isNotFoundError(error: unknown): boolean {
    if (error instanceof StellarSdk.NotFoundError) {
      return true;
    }
    const status = (error as { response?: { status?: number } })?.response?.status;
    return status === 404;
  }

  private isTransientError(error: unknown): boolean {
    if (error instanceof StellarSdk.NetworkError) {
      return true;
    }

    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 429 || (typeof status === 'number' && status >= 500)) {
      return true;
    }

    const message = this.extractMessage(error).toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('rate limit') ||
      message.includes('throttl') ||
      message.includes('temporar') ||
      message.includes('network') ||
      message.includes('econnreset') ||
      message.includes('socket')
    );
  }

  private normalizeError(error: unknown, context: string): Error {
    if (error instanceof TransactionNotFoundError || error instanceof StellarNetworkError) {
      return error;
    }

    this.logger.error(`Horizon request failed [${context}]: ${this.extractMessage(error)}`);
    return new StellarNetworkError(
      `Stellar network request failed during ${context}: ${this.extractMessage(error)}`,
      error,
    );
  }

  private extractMessage(error: unknown): string {
    return (error as { message?: string })?.message ?? String(error);
  }
}
