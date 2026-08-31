import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as StellarSdk from 'stellar-sdk';
import { SorobanService } from '../soroban/soroban.service';

/**
 * TypeScript client for the on-chain Reputation smart contract.
 * Encapsulates all read operations against the deployed Soroban contract.
 */
@Injectable()
export class ReputationContractClient {
  private readonly logger = new Logger(ReputationContractClient.name);
  private readonly contractId: string;

  constructor(
    private readonly sorobanService: SorobanService,
    private readonly configService: ConfigService,
  ) {
    this.contractId = this.configService.get<string>('REPUTATION_CONTRACT_ID') || '';

    if (this.contractId) {
      this.logger.log(`Reputation contract loaded: ${this.contractId.slice(0, 8)}...`);
    } else {
      this.logger.warn('REPUTATION_CONTRACT_ID is not set — contract calls will fail');
    }
  }

  /**
   * Reads the raw reputation score for a wallet from the on-chain contract.
   * Calls the `get_score` method with the wallet address as an Address argument.
   *
   * @param wallet - Stellar public key (G... format)
   * @returns Raw u32 score from the contract, or null if the wallet has no score
   */
  async getScore(wallet: string): Promise<number | null> {
    if (!this.contractId) {
      throw new Error('REPUTATION_CONTRACT_ID is not configured');
    }

    const addressScVal = StellarSdk.nativeToScVal(StellarSdk.Address.fromString(wallet), {
      type: 'address',
    });

    try {
      const resultScVal = await this.sorobanService.simulateContractCall(
        this.contractId,
        'get_score',
        [addressScVal],
      );

      const score = StellarSdk.scValToNative(resultScVal);

      if (score === undefined || score === null) {
        return null;
      }

      return Number(score);
    } catch (error) {
      // Contract returns an error when the wallet has no entry — treat as null
      if (error.message?.includes('HostError') || error.message?.includes('Status(ContractError')) {
        this.logger.debug(`No on-chain score for wallet ${wallet.slice(0, 8)}...`);
        return null;
      }
      throw error;
    }
  }
}
