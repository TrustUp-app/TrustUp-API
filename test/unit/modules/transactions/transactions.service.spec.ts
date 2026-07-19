import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import * as StellarSdk from "stellar-sdk";
import { TransactionsRepository } from "../../../../src/database/repositories/transactions.repository";
import { TransactionsService } from "../../../../src/modules/transactions/transactions.service";
import { TransactionType } from "../../../../src/modules/transactions/dto/submit-transaction-request.dto";

const submitTransaction = jest.fn();
const transactionCall = jest.fn();

jest.mock("stellar-sdk", () => {
  const actual = jest.requireActual("stellar-sdk");
  return {
    ...actual,
    Horizon: {
      ...actual.Horizon,
      Server: jest.fn().mockImplementation(() => ({
        submitTransaction,
        transactions: () => ({
          includeFailed: () => ({ transaction: transactionCall }),
          transaction: transactionCall,
        }),
      })),
    },
  };
});

describe("TransactionsService", () => {
  let service: TransactionsService;
  const wallet = "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW";
  const hash = "a".repeat(64);
  const cache = { get: jest.fn(), set: jest.fn() };
  const repository = {
    create: jest.fn(),
    findByHash: jest.fn(),
    updateStatus: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: CACHE_MANAGER, useValue: cache },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: TransactionsRepository, useValue: repository },
      ],
    }).compile();
    service = module.get(TransactionsService);
    jest.clearAllMocks();
    transactionCall.mockReturnValue({ call: jest.fn() });
  });

  function xdr(): string {
    const keypair = StellarSdk.Keypair.random();
    const account = new StellarSdk.Account(keypair.publicKey(), "0");
    const transaction = new StellarSdk.TransactionBuilder(account, {
      fee: "100",
      networkPassphrase: StellarSdk.Networks.TESTNET,
    })
      .addOperation(
        StellarSdk.Operation.payment({
          destination: keypair.publicKey(),
          asset: StellarSdk.Asset.native(),
          amount: "1",
        }),
      )
      .setTimeout(30)
      .build();
    transaction.sign(keypair);
    return transaction.toXDR();
  }

  it("submits to Horizon and persists through the repository", async () => {
    submitTransaction.mockResolvedValue({ hash });
    repository.create.mockResolvedValue(undefined);

    await expect(
      service.submitTransaction(wallet, {
        xdr: xdr(),
        type: "deposit" as TransactionType,
      }),
    ).resolves.toEqual({ transactionHash: hash, status: "pending" });
    await Promise.resolve();
    expect(repository.create).toHaveBeenCalledWith({
      userWallet: wallet,
      hash,
      type: "deposit",
      xdr: expect.any(String),
    });
  });

  it("rejects malformed XDR", async () => {
    await expect(
      service.submitTransaction(wallet, {
        xdr: "bad",
        type: "deposit" as TransactionType,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("returns a cached transaction status without repository access", async () => {
    const cached = {
      hash,
      status: "success",
      type: "deposit",
      result: null,
      error: null,
      submittedAt: null,
      confirmedAt: null,
      lastCheckedAt: "2026-01-01T00:00:00.000Z",
    };
    cache.get.mockResolvedValue(cached);

    await expect(service.getTransactionStatus(hash)).resolves.toEqual(cached);
    expect(repository.findByHash).not.toHaveBeenCalled();
  });

  it("returns pending when Horizon has not indexed a local transaction", async () => {
    cache.get.mockResolvedValue(undefined);
    repository.findByHash.mockResolvedValue({
      lookupColumn: "transaction_hash",
      hash,
      type: "deposit",
      status: "pending",
      submittedAt: "2026-01-01T00:00:00.000Z",
      completedAt: null,
      updatedAt: null,
    });
    transactionCall.mockReturnValue({
      call: jest.fn().mockRejectedValue({ response: { status: 404 } }),
    });

    await expect(service.getTransactionStatus(hash)).resolves.toMatchObject({
      hash,
      status: "pending",
      type: "deposit",
    });
  });

  it("persists a finalized Horizon transaction through the repository", async () => {
    cache.get.mockResolvedValue(undefined);
    repository.findByHash.mockResolvedValue({
      lookupColumn: "transaction_hash",
      hash,
      type: "deposit",
      status: "pending",
      submittedAt: "2026-01-01T00:00:00.000Z",
      completedAt: null,
      updatedAt: null,
    });
    repository.updateStatus.mockResolvedValue(null);
    transactionCall.mockReturnValue({
      call: jest.fn().mockResolvedValue({
        hash,
        successful: true,
        ledger_attr: 1,
        operation_count: 1,
        source_account: wallet,
        fee_charged: "100",
        memo_type: "none",
        created_at: "2026-01-01T00:01:00.000Z",
        result_xdr: "",
      }),
    });

    await expect(service.getTransactionStatus(hash)).resolves.toMatchObject({
      hash,
      status: "success",
    });
    expect(repository.updateStatus).toHaveBeenCalledWith(
      hash,
      "success",
      expect.any(Object),
      { lookupColumn: "transaction_hash" },
    );
  });

  it("reports missing transactions not found locally or on Horizon", async () => {
    cache.get.mockResolvedValue(undefined);
    repository.findByHash.mockResolvedValue(null);
    transactionCall.mockReturnValue({
      call: jest.fn().mockRejectedValue({ response: { status: 404 } }),
    });

    await expect(service.getTransactionStatus(hash)).rejects.toThrow(
      NotFoundException,
    );
  });
});
