import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Job } from "bullmq";
import * as StellarSdk from "stellar-sdk";
import { LoansRepository } from "../../database/repositories/loans.repository";
import { NotificationsRepository } from "../../database/repositories/notifications.repository";
import { TransactionsRepository } from "../../database/repositories/transactions.repository";
import { TransactionType } from "../../modules/transactions/dto/submit-transaction-request.dto";
import { parseTransactionMetadata } from "./transaction-metadata.util";

interface PendingTransaction {
  id: string;
  user_wallet: string;
  transaction_hash: string;
  type: TransactionType;
  status: "pending" | "success" | "failed";
  xdr?: string | null;
  submitted_at: string;
  updated_at: string;
}

interface TransactionStatusResult {
  found: boolean;
  successful?: boolean;
  result?: unknown;
  errorMessage?: string;
}

interface FollowUpResult {
  loanId?: string;
  remainingBalance?: number;
  loanStatus?: string;
}

@Processor("transaction-status-checker")
export class TransactionStatusCheckerProcessor extends WorkerHost {
  private readonly logger = new Logger(TransactionStatusCheckerProcessor.name);
  private readonly horizonServer: StellarSdk.Horizon.Server;
  private readonly networkPassphrase: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly transactionsRepository: TransactionsRepository,
    private readonly loansRepository: LoansRepository,
    private readonly notificationsRepository: NotificationsRepository,
  ) {
    super();

    const horizonUrl =
      this.configService.get<string>("STELLAR_HORIZON_URL") ||
      "https://horizon-testnet.stellar.org";

    this.networkPassphrase =
      this.configService.get<string>("STELLAR_NETWORK_PASSPHRASE") ||
      StellarSdk.Networks.TESTNET;

    this.horizonServer = new StellarSdk.Horizon.Server(horizonUrl);
    this.logger.log(`Horizon client initialized: ${horizonUrl}`);
  }

  async process(_job: Job): Promise<void> {
    this.logger.log(
      {
        context: "TransactionStatusCheckerProcessor",
        action: "process",
      },
      "Transaction status checker job started",
    );

    try {
      const pending = await this.fetchPendingTransactions();

      if (pending.length === 0) {
        this.logger.debug(
          {
            context: "TransactionStatusCheckerProcessor",
            action: "process",
          },
          "No pending transactions found",
        );
        await this.cleanupOldTransactions();
        return;
      }

      this.logger.log(
        {
          context: "TransactionStatusCheckerProcessor",
          action: "process",
          pendingCount: pending.length,
        },
        `Checking ${pending.length} pending transaction(s)`,
      );

      for (const transaction of pending) {
        try {
          const status = await this.checkTransactionStatus(
            transaction.transaction_hash,
          );

          if (!status.found) {
            this.logger.debug(
              {
                context: "TransactionStatusCheckerProcessor",
                action: "checkTransactionStatus",
                transactionHash: transaction.transaction_hash,
              },
              "Transaction not found on Horizon yet — leaving pending",
            );
            continue;
          }

          if (status.successful === true) {
            await this.finalizeTransaction(
              transaction,
              "success",
              status.result,
              status.errorMessage,
            );
          } else if (status.successful === false) {
            await this.finalizeTransaction(
              transaction,
              "failed",
              status.result,
              status.errorMessage,
            );
          } else {
            this.logger.debug(
              {
                context: "TransactionStatusCheckerProcessor",
                action: "checkTransactionStatus",
                transactionHash: transaction.transaction_hash,
              },
              "Horizon returned an unexpected transaction payload; leaving pending",
            );
          }
        } catch (error) {
          this.logger.error(
            {
              context: "TransactionStatusCheckerProcessor",
              action: "processTransaction",
              transactionHash: transaction.transaction_hash,
              error: error?.message,
              stack: error?.stack,
            },
            "Failed to process pending transaction — continuing with next",
          );
        }
      }
    } catch (error) {
      this.logger.error(
        {
          context: "TransactionStatusCheckerProcessor",
          action: "process",
          error: error?.message,
          stack: error?.stack,
        },
        "Fatal error in transaction status checker",
      );
    } finally {
      await this.cleanupOldTransactions();
      this.logger.log(
        {
          context: "TransactionStatusCheckerProcessor",
          action: "process",
        },
        "Transaction status checker job completed",
      );
    }
  }

  private async fetchPendingTransactions(): Promise<PendingTransaction[]> {
    const transactions = await this.transactionsRepository.findPending();
    return transactions.map((transaction) => ({
      id: transaction.id as string,
      user_wallet: transaction.userWallet as string,
      transaction_hash: transaction.hash,
      type: transaction.type as TransactionType,
      status: transaction.status as PendingTransaction["status"],
      xdr: transaction.xdr,
      submitted_at: transaction.submittedAt as string,
      updated_at: transaction.updatedAt as string,
    }));
  }

  private async checkTransactionStatus(
    hash: string,
  ): Promise<TransactionStatusResult> {
    const maxAttempts = 3;
    let attempt = 0;

    while (attempt < maxAttempts) {
      try {
        attempt += 1;
        const response = await this.horizonServer
          .transactions()
          .transaction(hash)
          .call();
        return {
          found: true,
          successful: response.successful === true,
          result: response,
          errorMessage: this.extractHorizonError(response),
        };
      } catch (error) {
        if (this.isNotFoundError(error)) {
          return { found: false };
        }

        if (!this.isTransientHorizonError(error) || attempt >= maxAttempts) {
          throw error;
        }

        const delayMs = 1000 * attempt;
        this.logger.warn(
          {
            context: "TransactionStatusCheckerProcessor",
            action: "checkTransactionStatus",
            transactionHash: hash,
            attempt,
            delayMs,
            error: error?.message,
          },
          "Transient Horizon error — retrying",
        );
        await this.wait(delayMs);
      }
    }

    return { found: false };
  }

  private extractHorizonError(response: any): string | undefined {
    if (!response) {
      return undefined;
    }

    const codes = response.result_codes;
    if (!codes) {
      return undefined;
    }

    if (codes.transaction) {
      return codes.transaction;
    }

    return JSON.stringify(codes);
  }

  private isNotFoundError(error: unknown): boolean {
    return error instanceof StellarSdk.NotFoundError;
  }

  private isTransientHorizonError(error: unknown): boolean {
    if (error instanceof StellarSdk.NetworkError) {
      return true;
    }

    const status = (error as any)?.response?.status;
    if (status === 429 || status >= 500) {
      return true;
    }

    const message = String((error as any)?.message ?? "").toLowerCase();
    return (
      message.includes("timeout") ||
      message.includes("rate limit") ||
      message.includes("throttl") ||
      message.includes("temporar") ||
      message.includes("network")
    );
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async finalizeTransaction(
    transaction: PendingTransaction,
    status: "success" | "failed",
    result: unknown,
    errorMessage?: string,
  ): Promise<void> {
    const now = new Date().toISOString();

    const updatePayload: Record<string, unknown> = {
      status,
      result,
      updated_at: now,
      completed_at: now,
    };

    if (errorMessage) {
      updatePayload.error = errorMessage;
    }

    const data = await this.transactionsRepository.updateStatus(
      transaction.transaction_hash,
      status,
      updatePayload,
      { onlyPending: true, returnRecord: true },
    );

    if (!data) {
      this.logger.warn(
        {
          context: "TransactionStatusCheckerProcessor",
          action: "finalizeTransaction",
          transactionHash: transaction.transaction_hash,
        },
        "Transaction record was already updated by another worker or no longer pending",
      );
      return;
    }

    const followUp = await this.applyFollowUpActions(transaction, status);
    await this.createNotification(transaction, status, errorMessage, followUp);

    this.logger.log(
      {
        context: "TransactionStatusCheckerProcessor",
        action: "finalizeTransaction",
        transactionHash: transaction.transaction_hash,
        status,
      },
      `Transaction ${transaction.transaction_hash} finalized as ${status}`,
    );
  }

  private async applyFollowUpActions(
    transaction: PendingTransaction,
    status: "success" | "failed",
  ): Promise<FollowUpResult> {
    if (status !== "success") {
      return {};
    }

    let metadata: ReturnType<typeof parseTransactionMetadata>;
    try {
      metadata = parseTransactionMetadata(transaction.xdr, this.networkPassphrase);
    } catch (error) {
      this.logger.warn(
        {
          context: 'TransactionStatusCheckerProcessor',
          action: 'parseTransactionMetadata',
          error: error?.message,
          transactionXdr: transaction.xdr?.slice(0, 64),
        },
        'Failed to parse transaction XDR for follow-up actions',
      );
      return {};
    }

    if (!metadata?.loanId) {
      return {};
    }

    if (transaction.type === TransactionType.LOAN_CREATE) {
      return this.activatePendingLoan(metadata.loanId, transaction.user_wallet);
    }

    if (
      transaction.type === TransactionType.LOAN_REPAY &&
      typeof metadata.amount === "number"
    ) {
      return this.applyLoanRepayment(
        metadata.loanId,
        transaction.user_wallet,
        metadata.amount,
      );
    }

    return { loanId: metadata.loanId };
  }

  private async activatePendingLoan(
    loanId: string,
    userWallet: string,
  ): Promise<FollowUpResult> {
    let loan: { loan_id: string; status: string } | null;
    try {
      loan = await this.loansRepository.findStatusByLoanIdAndWallet(
        loanId,
        userWallet,
      );
    } catch (error) {
      this.logger.warn(
        {
          context: "TransactionStatusCheckerProcessor",
          action: "activatePendingLoan",
          loanId,
          userWallet,
          error: error?.message,
        },
        "Pending loan not found for loan_create transaction",
      );
      return { loanId };
    }

    if (!loan) {
      this.logger.warn(
        {
          context: "TransactionStatusCheckerProcessor",
          action: "activatePendingLoan",
          loanId,
          userWallet,
        },
        "Pending loan not found for loan_create transaction",
      );
      return { loanId };
    }

    if (loan.status !== "pending") {
      return { loanId, loanStatus: loan.status };
    }

    try {
      await this.loansRepository.updateStatus(
        loanId,
        userWallet,
        "active",
        "pending",
      );
    } catch (error) {
      this.logger.warn(
        {
          context: "TransactionStatusCheckerProcessor",
          action: "activatePendingLoan",
          loanId,
          error: error.message,
        },
        "Failed to update pending loan status after successful transaction",
      );
      return { loanId };
    }

    return { loanId, loanStatus: "active" };
  }

  private async applyLoanRepayment(
    loanId: string,
    userWallet: string,
    amount: number,
  ): Promise<FollowUpResult> {
    let loan: { remaining_balance: number | string; status: string } | null;
    try {
      loan = await this.loansRepository.findBalanceByLoanIdAndWallet(
        loanId,
        userWallet,
      );
    } catch (error) {
      this.logger.warn(
        {
          context: "TransactionStatusCheckerProcessor",
          action: "applyLoanRepayment",
          loanId,
          userWallet,
          error: error?.message,
        },
        "Loan not found for loan_repay transaction",
      );
      return { loanId };
    }

    if (!loan) {
      this.logger.warn(
        {
          context: "TransactionStatusCheckerProcessor",
          action: "applyLoanRepayment",
          loanId,
          userWallet,
        },
        "Loan not found for loan_repay transaction",
      );
      return { loanId };
    }

    const currentBalance = Number(loan.remaining_balance ?? 0);
    const updatedBalance = Math.max(
      0,
      Math.round((currentBalance - amount) * 100) / 100,
    );
    const updatedStatus = updatedBalance === 0 ? "completed" : loan.status;
    const updatePayload: Record<string, unknown> = {
      remaining_balance: updatedBalance,
      updated_at: new Date().toISOString(),
    };

    if (updatedStatus !== loan.status) {
      updatePayload.status = updatedStatus;
      if (updatedStatus === "completed") {
        updatePayload.completed_at = new Date().toISOString();
      }
    }

    try {
      await this.loansRepository.updateByLoanIdAndWallet(
        loanId,
        userWallet,
        updatePayload,
      );
    } catch (error) {
      this.logger.warn(
        {
          context: "TransactionStatusCheckerProcessor",
          action: "applyLoanRepayment",
          loanId,
          error: error.message,
        },
        "Failed to update loan balance after successful repayment",
      );
      return { loanId };
    }

    return {
      loanId,
      remainingBalance: updatedBalance,
      loanStatus: updatedStatus,
    };
  }

  private async createNotification(
    transaction: PendingTransaction,
    status: "success" | "failed",
    errorMessage?: string,
    followUp: FollowUpResult = {},
  ): Promise<void> {
    const { title, message, type } = this.buildNotificationPayload(
      transaction,
      status,
      errorMessage,
      followUp,
    );

    const notificationPayload = {
      user_wallet: transaction.user_wallet,
      type,
      title,
      message,
      data: {
        transactionHash: transaction.transaction_hash,
        transactionType: transaction.type,
        loanId: followUp.loanId ?? null,
      },
      is_read: false,
    };

    try {
      await this.notificationsRepository.create(notificationPayload);
    } catch (error) {
      this.logger.warn(
        {
          context: "TransactionStatusCheckerProcessor",
          action: "createNotification",
          transactionHash: transaction.transaction_hash,
          error: error.message,
        },
        "Failed to create user notification for finalized transaction",
      );
    }
  }

  private buildNotificationPayload(
    transaction: PendingTransaction,
    status: "success" | "failed",
    errorMessage: string | undefined,
    followUp: FollowUpResult,
  ): { type: string; title: string; message: string } {
    if (status === "failed") {
      return {
        type: "transaction_failed",
        title: "Transaction Failed",
        message: `Your ${transaction.type.replace("_", " ")} transaction failed on Stellar.${
          errorMessage ? ` ${errorMessage}` : ""
        }`,
      };
    }

    if (transaction.type === TransactionType.LOAN_CREATE) {
      return {
        type: "loan_create_success",
        title: "Loan Activated",
        message: followUp.loanId
          ? `Your loan ${followUp.loanId} is now active after Stellar confirmation.`
          : "Your loan creation transaction was confirmed on Stellar and your loan is now active.",
      };
    }

    if (transaction.type === TransactionType.LOAN_REPAY) {
      const amountMessage =
        followUp.remainingBalance !== undefined
          ? ` Remaining balance is $${followUp.remainingBalance.toFixed(2)}.`
          : "";

      return {
        type: "loan_repay_success",
        title: "Loan Payment Confirmed",
        message: `Your loan repayment transaction was confirmed on Stellar.${amountMessage}`,
      };
    }

    return {
      type: "transaction_success",
      title: "Transaction Confirmed",
      message: `Your ${transaction.type.replace("_", " ")} transaction was confirmed on Stellar.`,
    };
  }

  private async cleanupOldTransactions(): Promise<void> {
    const threshold = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    try {
      await this.transactionsRepository.deleteOlderThan(threshold);
    } catch (error) {
      this.logger.warn(
        {
          context: "TransactionStatusCheckerProcessor",
          action: "cleanupOldTransactions",
          error: error.message,
        },
        "Failed to clean up old transaction records",
      );
    }
  }
}
