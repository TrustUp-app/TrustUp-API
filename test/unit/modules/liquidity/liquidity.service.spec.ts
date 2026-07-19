import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { BadRequestException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { LiquidityRepository } from "../../../../src/database/repositories/liquidity.repository";
import { LiquidityContractClient } from "../../../../src/blockchain/contracts/liquidity-contract.client";
import { LiquidityService } from "../../../../src/modules/liquidity/liquidity.service";

describe("LiquidityService", () => {
  let service: LiquidityService;
  const stroops = 10_000_000n;
  const cache = { get: jest.fn(), set: jest.fn() };
  const repository = {
    findTotalInvested: jest.fn(),
    findActiveLoans: jest.fn(),
    countInvestors: jest.fn(),
  };
  const client = {
    getLpShares: jest.fn(),
    getPoolStats: jest.fn(),
    calculateWithdrawal: jest.fn(),
    buildWithdrawTx: jest.fn(),
    calculateDeposit: jest.fn(),
    buildDepositTx: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LiquidityService,
        { provide: CACHE_MANAGER, useValue: cache },
        { provide: LiquidityRepository, useValue: repository },
        { provide: LiquidityContractClient, useValue: client },
      ],
    }).compile();
    service = module.get(LiquidityService);
    jest.clearAllMocks();
  });

  it("returns a cached investment summary", async () => {
    const summary = {
      totalInvested: 1000,
      currentValue: 1085,
      earnings: 85,
      earningsPercent: 8.5,
      apy: 9,
      poolSize: 120000,
      activeLoans: 8,
      shares: 1000,
    };
    cache.get.mockResolvedValue(summary);

    await expect(service.getInvestmentSummary("GWALLET")).resolves.toEqual(
      summary,
    );
    expect(repository.findTotalInvested).not.toHaveBeenCalled();
  });

  it("builds a deposit preview", async () => {
    client.getPoolStats.mockResolvedValue({
      totalLiquidity: 100000n * stroops,
      totalShares: 95000n * stroops,
      sharePrice: 10500n,
    });
    client.calculateDeposit.mockResolvedValue(4761904761n);
    client.buildDepositTx.mockResolvedValue("XDR");

    await expect(
      service.depositLiquidity("GWALLET", { amount: 500 }),
    ).resolves.toMatchObject({
      unsignedXdr: "XDR",
      preview: {
        depositAmount: 500,
        sharesReceived: 476.1904761,
        currentSharePrice: 1.05,
      },
    });
  });

  it("rejects deposits below the minimum", async () => {
    await expect(
      service.depositLiquidity("GWALLET", { amount: 9 }),
    ).rejects.toThrow(BadRequestException);
    expect(client.getPoolStats).not.toHaveBeenCalled();
  });

  it("calculates the pool overview from repository data", async () => {
    cache.get.mockResolvedValue(undefined);
    client.getPoolStats.mockResolvedValue({ totalLiquidity: 2000n * stroops });
    repository.findActiveLoans.mockResolvedValue([
      { loan_amount: 800, interest_rate: 8 },
      { loan_amount: 200, interest_rate: 10 },
    ]);
    repository.countInvestors.mockResolvedValue(4);

    await expect(service.getPoolOverview()).resolves.toEqual({
      totalLiquidity: 2000,
      apy: 7.14,
      utilization: 50,
      totalInvestors: 4,
      activeLoans: 2,
    });
  });
});
