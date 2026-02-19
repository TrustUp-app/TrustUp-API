import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as StellarSdk from 'stellar-sdk';
import { SorobanService } from '../soroban/soroban.service';

@Injectable()
export class ReputationContractClient {
  private readonly logger = new Logger(ReputationContractClient.name);
  private contractId: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly sorobanService: SorobanService,
  ) {
    this.contractId = this.configService.get<string>('REPUTATION_CONTRACT_ID', '');
  }

  /**
   * Read the on-chain reputation score for a Stellar wallet address.
   * Returns a raw u32 score (0–100) from the Reputation contract.
   *
   * @throws Error if the contract call fails or the contract is not configured
   */
  async getScore(wallet: string): Promise<number> {
    if (!this.contractId) {
      throw new Error('REPUTATION_CONTRACT_ID is not configured');
    }

    const addressArg = StellarSdk.nativeToScVal(
      StellarSdk.Address.fromString(wallet),
      { type: 'address' },
    );

    const retval = await this.sorobanService.simulateContractCall(
      this.contractId,
      'get_score',
      [addressArg],
    );

    return StellarSdk.scValToNative(retval) as number;
  }

  /**
   * Build an unsigned XDR transaction to update a wallet's reputation score.
   * The mobile app must sign this before submission.
   */
  async buildUpdateScoreTx(wallet: string, score: number): Promise<string> {
    if (!this.contractId) {
      throw new Error('REPUTATION_CONTRACT_ID is not configured');
    }

    const contract = new StellarSdk.Contract(this.contractId);
    const server = this.sorobanService.getServer();
    const networkPassphrase = this.sorobanService.getNetworkPassphrase();

    const account = await server.getAccount(wallet);

    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: '100',
      networkPassphrase,
    })
      .addOperation(
        contract.call(
          'update_score',
          StellarSdk.nativeToScVal(StellarSdk.Address.fromString(wallet), {
            type: 'address',
          }),
          StellarSdk.nativeToScVal(score, { type: 'u32' }),
        ),
      )
      .setTimeout(30)
      .build();

    const prepared = await server.prepareTransaction(tx);
    return prepared.toXDR();
  }
}
