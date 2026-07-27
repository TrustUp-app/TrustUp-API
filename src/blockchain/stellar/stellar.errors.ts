/**
 * Normalized error thrown when the Horizon network is unreachable or a
 * request fails after exhausting all retry attempts.
 */
export class StellarNetworkError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'StellarNetworkError';
    this.cause = cause;
  }
}

/**
 * Normalized error thrown when Horizon reports that a transaction hash
 * could not be found (404).
 */
export class TransactionNotFoundError extends Error {
  readonly hash: string;
  readonly cause?: unknown;

  constructor(hash: string, cause?: unknown) {
    super(`Transaction ${hash} was not found on the Stellar network.`);
    this.name = 'TransactionNotFoundError';
    this.hash = hash;
    this.cause = cause;
  }
}
