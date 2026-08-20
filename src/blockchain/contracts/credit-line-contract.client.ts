import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as StellarSdk from 'stellar-sdk';
import { SorobanService } from '../soroban/soroban.service';

interface CreateLoanParams {
  loanId: string;
  merchantId: string;
  amount: number;
  loanAmount: number;
  guarantee: number;
  interestRate: number;
  term: number;
}

/**
 * TypeScript client for the on-chain CreditLine smart contract.
 * Encapsulates transaction-building for loan creation and repayment operations.
 */
@Injectable()
export class CreditLineContractClient {
  private readonly logger = new Logger(CreditLineContractClient.name);
  private readonly contractId: string;

  constructor(
    private readonly sorobanService: SorobanService,
    private readonly configService: ConfigService,
  ) {
    this.contractId =
      this.configService.get<string>('CREDIT_LINE_CONTRACT_ID') ||
      this.configService.get<string>('CREDITLINE_CONTRACT_ID') ||
      '';

    if (this.contractId) {
      this.logger.log(`CreditLine contract loaded: ${this.contractId.slice(0, 8)}...`);
    } else {
      this.logger.warn('CREDIT_LINE_CONTRACT_ID is not set - contract calls will fail');
    }
  }

  async buildCreateLoanTransaction(
    borrowerWallet: string,
    params: CreateLoanParams,
  ): Promise<string> {
    if (!this.contractId) {
      throw new Error('CREDIT_LINE_CONTRACT_ID is not configured');
    }

    const contract = new StellarSdk.Contract(this.contractId);
    const server = this.sorobanService.getServer();
    const networkPassphrase = this.sorobanService.getNetworkPassphrase();
    const sourceAccount = await server.getAccount(borrowerWallet);
    const amount = this.toContractAmount(params.amount);
    const loanAmount = this.toContractAmount(params.loanAmount);
    const guarantee = this.toContractAmount(params.guarantee);

    const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: '100',
      networkPassphrase,
    })
      .addOperation(
        contract.call(
          'create_loan',
          StellarSdk.nativeToScVal(params.loanId, { type: 'string' }),
          StellarSdk.nativeToScVal(params.merchantId, { type: 'string' }),
          StellarSdk.nativeToScVal(amount, { type: 'i128' }),
          StellarSdk.nativeToScVal(loanAmount, { type: 'i128' }),
          StellarSdk.nativeToScVal(guarantee, { type: 'i128' }),
          StellarSdk.nativeToScVal(params.interestRate, { type: 'u32' }),
          StellarSdk.nativeToScVal(params.term, { type: 'u32' }),
        ),
      )
      .setTimeout(30)
      .build();

    const prepared = await server.prepareTransaction(tx);
    return prepared.toXDR();
  }

  /**
   * Builds an unsigned XDR transaction that calls repay_loan() on-chain.
   */
  async buildRepayLoanTx(userWallet: string, loanId: string, amount: number): Promise<string> {
    if (!this.contractId) {
      throw new ServiceUnavailableException({
        code: 'BLOCKCHAIN_CONTRACT_NOT_CONFIGURED',
        message: 'Credit line contract is not configured. Please contact support.',
      });
    }

    try {
      const contract = new StellarSdk.Contract(this.contractId);
      const server = this.sorobanService.getServer();
      const networkPassphrase = this.sorobanService.getNetworkPassphrase();
      const userArg = StellarSdk.nativeToScVal(StellarSdk.Address.fromString(userWallet), {
        type: 'address',
      });
      const loanIdArg = StellarSdk.nativeToScVal(loanId, { type: 'string' });
      const amountInStroops = BigInt(Math.round(amount * 10_000_000));
      const amountArg = StellarSdk.nativeToScVal(amountInStroops, { type: 'i128' });

      const sourceKeypair = StellarSdk.Keypair.random();
      const sourceAccount = new StellarSdk.Account(sourceKeypair.publicKey(), '0');

      const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase,
      })
        .addOperation(contract.call('repay_loan', userArg, loanIdArg, amountArg))
        .setTimeout(300)
        .build();

      const simulation = await server.simulateTransaction(tx);

      if (StellarSdk.SorobanRpc.Api.isSimulationError(simulation)) {
        const errorMsg =
          (simulation as StellarSdk.SorobanRpc.Api.SimulateTransactionErrorResponse).error ||
          'Unknown simulation error';
        this.logger.error(`repay_loan simulation failed: ${errorMsg}`);
        throw new ServiceUnavailableException({
          code: 'BLOCKCHAIN_SIMULATION_FAILED',
          message: 'Failed to simulate repay_loan transaction. Please try again later.',
        });
      }

      const assembledTx = StellarSdk.SorobanRpc.assembleTransaction(
        tx,
        simulation as StellarSdk.SorobanRpc.Api.SimulateTransactionSuccessResponse,
      ).build();

      return assembledTx.toXDR();
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      this.logger.error(`Failed to build repay_loan transaction: ${error.message}`);
      throw new ServiceUnavailableException({
        code: 'BLOCKCHAIN_TX_BUILD_FAILED',
        message: 'Failed to construct repayment transaction. Please try again later.',
      });
    }
  }

  /**
   * Triggers the on-chain default path when the contract exposes `mark_default`.
   * Off-chain status is still updated by the job even if this is skipped.
   */
  async markDefault(loanId: string): Promise<{ submitted: boolean; reason?: string }> {
    if (!this.contractId) {
      this.logger.warn(
        { context: 'CreditLineContractClient', action: 'markDefault', loanId },
        'CREDIT_LINE_CONTRACT_ID is not set — skipping on-chain default',
      );
      return { submitted: false, reason: 'not_configured' };
    }
    try {
      const contract = new StellarSdk.Contract(this.contractId);
      const server = this.sorobanService.getServer();
      const networkPassphrase = this.sorobanService.getNetworkPassphrase();
      const sourceKeypair = StellarSdk.Keypair.random();
      const sourceAccount = new StellarSdk.Account(sourceKeypair.publicKey(), '0');
      const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase,
      })
        .addOperation(
          contract.call('mark_default', StellarSdk.nativeToScVal(loanId, { type: 'string' })),
        )
        .setTimeout(30)
        .build();
      const simulation = await server.simulateTransaction(tx);
      if (StellarSdk.SorobanRpc.Api.isSimulationError(simulation)) {
        this.logger.warn(
          {
            context: 'CreditLineContractClient',
            action: 'markDefault',
            loanId,
            error: (simulation as StellarSdk.SorobanRpc.Api.SimulateTransactionErrorResponse).error,
          },
          'mark_default simulation failed — off-chain default still recorded',
        );
        return { submitted: false, reason: 'simulation_failed' };
      }
      return { submitted: true };
    } catch (error) {
      this.logger.warn(
        {
          context: 'CreditLineContractClient',
          action: 'markDefault',
          loanId,
          error: error instanceof Error ? error.message : String(error),
        },
        'mark_default threw — off-chain default still recorded',
      );
      return { submitted: false, reason: 'error' };
    }
  }

  private toContractAmount(value: number): bigint {
    return BigInt(Math.round(value * 100));
  }
}
