import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { LoansRepository } from "../../../../src/database/repositories/loans.repository";
import { MerchantsRepository } from "../../../../src/database/repositories/merchants.repository";
import { CreditLineContractClient } from "../../../../src/blockchain/contracts/credit-line-contract.client";
import { ReputationContractClient } from "../../../../src/blockchain/contracts/reputation-contract.client";
import { ReputationService } from "../../../../src/modules/reputation/reputation.service";
import { LoansService } from "../../../../src/modules/loans/loans.service";

describe("LoansService", () => {
  let service: LoansService;
  const wallet = "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW";
  const merchantId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
  const reputation = { getReputationScore: jest.fn() };
  const loans = {
    findById: jest.fn(),
    findByUser: jest.fn(),
    findActiveByUser: jest.fn(),
    createLoan: jest.fn(),
  };
  const merchants = { findById: jest.fn() };
  const creditLine = {
    buildCreateLoanTransaction: jest.fn(),
    buildRepayLoanTx: jest.fn(),
  };
  const reputationContract = { getScore: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoansService,
        { provide: ReputationService, useValue: reputation },
        { provide: LoansRepository, useValue: loans },
        { provide: MerchantsRepository, useValue: merchants },
        { provide: CreditLineContractClient, useValue: creditLine },
        { provide: ReputationContractClient, useValue: reputationContract },
      ],
    }).compile();
    service = module.get(LoansService);
    jest.clearAllMocks();
    reputation.getReputationScore.mockResolvedValue({
      score: 75,
      interestRate: 8,
      maxCredit: 2000,
    });
    merchants.findById.mockResolvedValue({
      id: merchantId,
      name: "TechStore",
      is_active: true,
    });
    creditLine.buildCreateLoanTransaction.mockResolvedValue("CREATE_XDR");
    creditLine.buildRepayLoanTx.mockResolvedValue("REPAY_XDR");
  });

  it("calculates a loan quote", async () => {
    await expect(
      service.calculateLoanQuote(wallet, {
        amount: 500,
        merchant: merchantId,
        term: 4,
      }),
    ).resolves.toMatchObject({
      amount: 500,
      guarantee: 100,
      loanAmount: 400,
      interestRate: 8,
      totalRepayment: 410.67,
    });
    expect(merchants.findById).toHaveBeenCalledWith(merchantId);
  });

  it("rejects unknown and inactive merchants", async () => {
    merchants.findById.mockResolvedValueOnce(null);
    await expect(
      service.calculateLoanQuote(wallet, {
        amount: 500,
        merchant: merchantId,
        term: 4,
      }),
    ).rejects.toThrow(NotFoundException);

    merchants.findById.mockResolvedValueOnce({
      id: merchantId,
      name: "TechStore",
      is_active: false,
    });
    await expect(
      service.calculateLoanQuote(wallet, {
        amount: 500,
        merchant: merchantId,
        term: 4,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("creates a pending loan through the repository", async () => {
    const result = await service.createLoan(wallet, {
      amount: 500,
      merchant: merchantId,
      term: 4,
    });

    expect(result).toMatchObject({
      xdr: "CREATE_XDR",
      description: "Create BNPL loan for $500 at TechStore",
    });
    expect(loans.createLoan).toHaveBeenCalledWith(
      expect.objectContaining({
        user_wallet: wallet,
        merchant_id: merchantId,
        status: "pending",
      }),
    );
  });

  it("builds a repayment transaction for an owned active loan", async () => {
    loans.findById.mockResolvedValue({
      id: "loan-db-id",
      loan_id: "chain-loan",
      user_wallet: wallet,
      status: "active",
      remaining_balance: 325,
    });

    await expect(
      service.repayLoan(wallet, "loan-db-id", { amount: 108.33 }),
    ).resolves.toEqual({
      unsignedXdr: "REPAY_XDR",
      preview: {
        paymentAmount: 108.33,
        currentBalance: 325,
        newBalance: 216.67,
        willComplete: false,
      },
    });
    expect(loans.findById).toHaveBeenCalledWith("loan-db-id");
  });

  it("rejects missing, foreign, inactive, and excessive repayment requests", async () => {
    loans.findById.mockResolvedValueOnce(null);
    await expect(
      service.repayLoan(wallet, "loan", { amount: 1 }),
    ).rejects.toThrow(NotFoundException);

    loans.findById.mockResolvedValueOnce({
      id: "loan",
      loan_id: "chain",
      user_wallet: "GOTHER",
      status: "active",
      remaining_balance: 10,
    });
    await expect(
      service.repayLoan(wallet, "loan", { amount: 1 }),
    ).rejects.toThrow(NotFoundException);

    loans.findById.mockResolvedValueOnce({
      id: "loan",
      loan_id: "chain",
      user_wallet: wallet,
      status: "pending",
      remaining_balance: 10,
    });
    await expect(
      service.repayLoan(wallet, "loan", { amount: 1 }),
    ).rejects.toThrow(BadRequestException);

    loans.findById.mockResolvedValueOnce({
      id: "loan",
      loan_id: "chain",
      user_wallet: wallet,
      status: "active",
      remaining_balance: 10,
    });
    await expect(
      service.repayLoan(wallet, "loan", { amount: 11 }),
    ).rejects.toThrow(BadRequestException);
  });

  it("maps paginated loans from the repository", async () => {
    loans.findByUser.mockResolvedValue({
      loans: [
        {
          id: "loan-db-id",
          loan_id: "chain-loan",
          merchant_id: merchantId,
          amount: 500,
          loan_amount: 400,
          guarantee: 100,
          interest_rate: 8,
          total_repayment: 410.67,
          remaining_balance: 300,
          term: 4,
          status: "active",
          next_payment_due: null,
          created_at: "2026-01-01T00:00:00.000Z",
          completed_at: null,
          defaulted_at: null,
          merchants: { id: merchantId, name: "TechStore", logo: "logo" },
          loan_payments: [{ amount: 110 }],
        },
      ],
      total: 1,
    });

    const result = await service.getMyLoans(wallet, {});
    expect(result.pagination).toEqual({ limit: 20, offset: 0, total: 1 });
    expect(result.data[0]).toMatchObject({
      id: "loan-db-id",
      loanId: "chain-loan",
      totalPaid: 110.67,
    });
  });

  it("calculates available credit from active loans", async () => {
    reputationContract.getScore.mockResolvedValue(75);
    loans.findActiveByUser.mockResolvedValue([
      { remaining_balance: 100 },
      { remaining_balance: 50 },
    ]);

    await expect(service.getAvailableCredit(wallet)).resolves.toMatchObject({
      maxCreditLimit: 3000,
      creditUsed: 150,
      availableCredit: 2850,
      activeLoans: 2,
    });
  });
});
