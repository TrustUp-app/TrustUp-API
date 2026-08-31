import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import {
  MerchantDetailRecord,
  MerchantsRepository,
} from '../../database/repositories/merchants.repository';
import { MerchantApplicationsRepository } from '../../database/repositories/merchant-applications.repository';

import {
  LoansRepository,
  MerchantLoanStatsRecord,
} from '../../database/repositories/loans.repository';
import { UsersRepository } from '../../database/repositories/users.repository';
import { UserRole } from '../../common/enums/user-role.enum';
import { MerchantScoreService } from './merchant-score.service';
import { MerchantDetailDto } from './dto/merchant-detail.dto';
import { MerchantSummaryDto } from './dto/merchant-summary.dto';
import { MerchantPortfolioResponseDto } from './dto/merchant-portfolio-response.dto';
import { MerchantAnalyticsResponseDto } from './dto/merchant-analytics-response.dto';
import { MerchantLeaderboardMetric } from './dto/merchant-leaderboard-query.dto';
import { MerchantLeaderboardResponseDto } from './dto/merchant-leaderboard-response.dto';
import { ApplyMerchantDto, MerchantApplicationResponseDto } from './dto/apply-merchant.dto';

export interface ListMerchantsResult {
  merchants: MerchantSummaryDto[];
  total: number;
  limit: number;
  offset: number;
}

const LEADERBOARD_METRIC_FIELD: Record<
  MerchantLeaderboardMetric,
  'totalVolume' | 'score' | 'repaymentRate' | 'totalLoans'
> = {
  [MerchantLeaderboardMetric.VOLUME]: 'totalVolume',
  [MerchantLeaderboardMetric.SCORE]: 'score',
  [MerchantLeaderboardMetric.REPAYMENT_RATE]: 'repaymentRate',
  [MerchantLeaderboardMetric.TOTAL_LOANS]: 'totalLoans',
};

@Injectable()
export class MerchantsService {
  constructor(
    private readonly merchantsRepository: MerchantsRepository,
    private readonly merchantApplicationsRepository: MerchantApplicationsRepository,
    private readonly loansRepository: LoansRepository,
    private readonly usersRepository: UsersRepository,
    private readonly merchantScoreService: MerchantScoreService,
  ) {}

  /**
   * Submits a new merchant application for an authenticated user.
   */
  async apply(wallet: string, dto: ApplyMerchantDto): Promise<MerchantApplicationResponseDto> {
    const user = await this.usersRepository.findByWallet(wallet);

    if (user && user.role === UserRole.MERCHANT) {
      throw new BadRequestException({
        code: 'MERCHANT_ALREADY_EXISTS',
        message: 'User is already registered as an active merchant.',
      });
    }

    const existingMerchant = await this.merchantsRepository.findByWallet(wallet);
    if (existingMerchant && existingMerchant.is_active) {
      throw new BadRequestException({
        code: 'MERCHANT_ALREADY_ACTIVE',
        message: 'A merchant profile is already active for this wallet.',
      });
    }

    const pendingApplication =
      await this.merchantApplicationsRepository.findPendingByWallet(wallet);
    if (pendingApplication) {
      throw new ConflictException({
        code: 'MERCHANT_APPLICATION_PENDING',
        message: 'You already have a pending merchant application under review.',
      });
    }

    const application = await this.merchantApplicationsRepository.create({
      user_id: user?.id,
      wallet,
      name: dto.name,
      logo: dto.logo,
      description: dto.description,
      category: dto.category,
      website: dto.website,
    });

    return {
      id: application.id,
      wallet: application.wallet,
      name: application.name,
      logo: application.logo ?? undefined,
      description: application.description ?? undefined,
      category: application.category ?? undefined,
      website: application.website ?? undefined,
      status: application.status,
      createdAt: application.created_at,
    };
  }

  /**
   * Returns a paginated list of active merchants.
   */
  async listMerchants(limit: number, offset: number): Promise<ListMerchantsResult> {
    const { merchants, total } = await this.merchantsRepository.findAll({
      limit,
      offset,
      isActive: true,
    });

    const merchantSummaries: MerchantSummaryDto[] = merchants.map((m) => ({
      id: m.id,
      wallet: m.wallet,
      name: m.name,
      logo: m.logo,
      category: m.category,
      isActive: m.is_active,
    }));

    return {
      merchants: merchantSummaries,
      total,
      limit,
      offset,
    };
  }

  /**
   * Finds a merchant by ID or wallet address.
   * Throws NotFoundException if the merchant is not found.
   */
  async getMerchantById(idOrWallet: string): Promise<MerchantDetailDto> {
    let merchant: MerchantDetailRecord | null = null;

    // Simple heuristic: Stellar wallets start with 'G' and are 56 characters long.
    // Otherwise, assume it's a UUID.
    if (idOrWallet.startsWith('G') && idOrWallet.length === 56) {
      merchant = await this.merchantsRepository.findByWallet(idOrWallet);
    } else {
      merchant = await this.merchantsRepository.findById(idOrWallet);
    }

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    return {
      id: merchant.id,
      wallet: merchant.wallet,
      name: merchant.name,
      logo: merchant.logo,
      description: merchant.description,
      category: merchant.category,
      website: merchant.website,
      isActive: merchant.is_active,
      createdAt: merchant.created_at,
      updatedAt: merchant.updated_at,
    };
  }

  /**
   * Returns a merchant's loan portfolio: aggregate volume/repayment metrics
   * plus a paginated list of its currently active loans.
   */
  async getMerchantPortfolio(
    idOrWallet: string,
    limit: number,
    offset: number,
  ): Promise<MerchantPortfolioResponseDto> {
    const merchant = await this.resolveMerchant(idOrWallet);

    const [allLoans, { loans: activeLoans, total }] = await Promise.all([
      this.loansRepository.findStatsByMerchant(merchant.id),
      this.loansRepository.findActiveByMerchant(merchant.id, { limit, offset }),
    ]);

    const aggregate = this.merchantScoreService.aggregateLoans(allLoans);

    return {
      merchantId: merchant.id,
      totalLoans: aggregate.totalLoans,
      activeLoansCount: aggregate.activeLoans,
      completedLoansCount: aggregate.completedLoans,
      defaultedLoansCount: aggregate.defaultedLoans,
      totalVolume: aggregate.totalVolume,
      outstandingBalance: aggregate.outstandingBalance,
      repaymentRate: aggregate.repaymentRate,
      activeLoans: activeLoans.map((loan) => ({
        id: loan.id,
        loanId: loan.loan_id,
        amount: Number(loan.amount),
        remainingBalance: Number(loan.remaining_balance),
        status: loan.status,
        nextPaymentDue: loan.next_payment_due,
        createdAt: loan.created_at,
      })),
      pagination: { limit, offset, total },
    };
  }

  /**
   * Returns a merchant's monthly time-series (volume, default rate, avg loan
   * size) for the trailing N months, plus an aggregate summary.
   */
  async getMerchantAnalytics(
    idOrWallet: string,
    months: number,
  ): Promise<MerchantAnalyticsResponseDto> {
    const merchant = await this.resolveMerchant(idOrWallet);
    const loans = await this.loansRepository.findStatsByMerchant(merchant.id);

    const buckets = this.buildMonthlyBuckets(months);
    const monthsData = buckets.map((bucket) => {
      const loansInBucket = loans.filter((loan) => this.isWithinBucket(loan.created_at, bucket));
      const aggregate = this.merchantScoreService.aggregateLoans(loansInBucket);

      return {
        month: bucket.key,
        volume: aggregate.totalVolume,
        loanCount: aggregate.totalLoans,
        defaultRate: aggregate.defaultRate,
        avgLoanSize: this.averageLoanSize(aggregate.totalVolume, aggregate.totalLoans),
      };
    });

    const summaryAggregate = this.merchantScoreService.aggregateLoans(loans);

    return {
      merchantId: merchant.id,
      months: monthsData,
      summary: {
        totalVolume: summaryAggregate.totalVolume,
        totalLoans: summaryAggregate.totalLoans,
        avgLoanSize: this.averageLoanSize(
          summaryAggregate.totalVolume,
          summaryAggregate.totalLoans,
        ),
        defaultRate: summaryAggregate.defaultRate,
      },
    };
  }

  /**
   * Ranks active merchants by a configurable metric (volume, score,
   * repayment rate, or total loans).
   */
  async getLeaderboard(
    metric: MerchantLeaderboardMetric,
    limit: number,
    offset: number,
  ): Promise<MerchantLeaderboardResponseDto> {
    const [merchants, allLoans] = await Promise.all([
      this.merchantsRepository.findAllActive(),
      this.loansRepository.findStatsForAllMerchants(),
    ]);

    const loansByMerchant = new Map<string, MerchantLoanStatsRecord[]>();
    for (const loan of allLoans) {
      if (!loan.merchant_id) continue;
      const list = loansByMerchant.get(loan.merchant_id) ?? [];
      list.push(loan);
      loansByMerchant.set(loan.merchant_id, list);
    }

    const field = LEADERBOARD_METRIC_FIELD[metric];
    const ranked = merchants
      .map((merchant) => {
        const aggregate = this.merchantScoreService.aggregateLoans(
          loansByMerchant.get(merchant.id) ?? [],
        );
        const { score, tier } = this.merchantScoreService.calculateScore(aggregate);

        return {
          merchantId: merchant.id,
          name: merchant.name,
          logo: merchant.logo,
          category: merchant.category,
          score,
          tier,
          totalVolume: aggregate.totalVolume,
          repaymentRate: aggregate.repaymentRate,
          totalLoans: aggregate.totalLoans,
        };
      })
      .sort((a, b) => b[field] - a[field]);

    const total = ranked.length;
    const data = ranked.slice(offset, offset + limit).map((entry, index) => ({
      rank: offset + index + 1,
      ...entry,
    }));

    return { metric, data, pagination: { limit, offset, total } };
  }

  /**
   * Resolves a merchant by ID or wallet address, throwing a structured
   * NotFoundException ({code, message}) when it doesn't exist.
   */
  private async resolveMerchant(idOrWallet: string): Promise<MerchantDetailRecord> {
    const merchant =
      idOrWallet.startsWith('G') && idOrWallet.length === 56
        ? await this.merchantsRepository.findByWallet(idOrWallet)
        : await this.merchantsRepository.findById(idOrWallet);

    if (!merchant) {
      throw new NotFoundException({
        code: 'MERCHANT_NOT_FOUND',
        message: 'Merchant not found. Please provide a valid merchant ID or wallet address.',
      });
    }

    return merchant;
  }

  private buildMonthlyBuckets(months: number): { key: string; year: number; month: number }[] {
    const buckets: { key: string; year: number; month: number }[] = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
        year: date.getFullYear(),
        month: date.getMonth(),
      });
    }

    return buckets;
  }

  private isWithinBucket(createdAt: string, bucket: { year: number; month: number }): boolean {
    const date = new Date(createdAt);
    return date.getFullYear() === bucket.year && date.getMonth() === bucket.month;
  }

  private averageLoanSize(totalVolume: number, totalLoans: number): number {
    if (totalLoans === 0) return 0;
    return Math.round((totalVolume / totalLoans) * 100) / 100;
  }
}
