import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as StellarSdk from 'stellar-sdk';

@Injectable()
export class SorobanService implements OnModuleInit {
  private readonly logger = new Logger(SorobanService.name);
  private server: StellarSdk.SorobanRpc.Server;
  private networkPassphrase: string;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const rpcUrl = this.configService.get<string>(
      'STELLAR_SOROBAN_URL',
      'https://soroban-testnet.stellar.org',
    );
    this.networkPassphrase = this.configService.get<string>(
      'STELLAR_NETWORK_PASSPHRASE',
      'Test SDF Network ; September 2015',
    );

    this.server = new StellarSdk.SorobanRpc.Server(rpcUrl);
    this.logger.log(`Soroban RPC client initialized: ${rpcUrl}`);
  }

  getServer(): StellarSdk.SorobanRpc.Server {
    return this.server;
  }

  getNetworkPassphrase(): string {
    return this.networkPassphrase;
  }

  /**
   * Simulate a contract call and extract the return value.
   * Used for read-only queries that don't require signing.
   */
  async simulateContractCall(
    contractId: string,
    method: string,
    args: StellarSdk.xdr.ScVal[] = [],
  ): Promise<StellarSdk.xdr.ScVal> {
    const contract = new StellarSdk.Contract(contractId);
    const sourceAccount = new StellarSdk.Account(
      'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
      '0',
    );

    const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: '100',
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(30)
      .build();

    const simResponse = await this.server.simulateTransaction(tx);

    if (StellarSdk.SorobanRpc.Api.isSimulationError(simResponse)) {
      throw new Error(
        `Contract simulation failed: ${(simResponse as StellarSdk.SorobanRpc.Api.SimulateTransactionErrorResponse).error}`,
      );
    }

    const successResponse =
      simResponse as StellarSdk.SorobanRpc.Api.SimulateTransactionSuccessResponse;
    if (!successResponse.result) {
      throw new Error('Contract simulation returned no result');
    }

    return successResponse.result.retval;
  }
}
