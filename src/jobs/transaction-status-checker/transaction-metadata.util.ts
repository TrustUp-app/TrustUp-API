import * as StellarSdk from 'stellar-sdk';

export interface TransactionMetadata {
  loanId?: string;
  amount?: number;
}

/**
 * Parses a signed Stellar XDR transaction and extracts `loanId`/`amount` from
 * a `create_loan`/`repay_loan` `invokeHostFunction` operation, if present.
 *
 * Pure function: throws on malformed XDR instead of swallowing the error, so
 * callers decide how to log/handle failures. Returns `null` when the XDR is
 * well-formed but doesn't describe a recognised loan operation.
 */
export function parseTransactionMetadata(
  xdr: string | null | undefined,
  networkPassphrase: string,
): TransactionMetadata | null {
  if (!xdr) {
    return null;
  }

  const transaction = StellarSdk.TransactionBuilder.fromXDR(xdr, networkPassphrase);
  const innerTransaction =
    transaction instanceof StellarSdk.FeeBumpTransaction
      ? transaction.innerTransaction
      : transaction;

  const operation = innerTransaction.operations?.[0];
  if (!operation || operation.type !== 'invokeHostFunction') {
    return null;
  }

  const invocation = (operation.func as any)?._value?._attributes;
  if (!invocation) {
    return null;
  }

  const functionName = invocation.functionName?.toString?.();
  const args = invocation.args as unknown[];
  if (!Array.isArray(args) || !functionName) {
    return null;
  }

  const nativeArgs = args.map((arg) => {
    try {
      return StellarSdk.scValToNative(arg as any);
    } catch {
      return undefined;
    }
  });

  if (functionName === 'create_loan') {
    return {
      loanId: nativeArgs[0] as string,
    };
  }

  if (functionName === 'repay_loan') {
    const loanId = nativeArgs[1] as string;
    const rawAmount = nativeArgs[2];
    const amount =
      typeof rawAmount === 'bigint'
        ? Number(rawAmount) / 10_000_000
        : typeof rawAmount === 'number'
          ? rawAmount / 10_000_000
          : undefined;

    return { loanId, amount };
  }

  return null;
}
