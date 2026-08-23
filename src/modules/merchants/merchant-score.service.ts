import { Injectable } from '@nestjs/common';
import { ReputationTier } from '../reputation/dto/reputation-response.dto';

export interface MerchantLoanStatsInput {
    loan_amount: number | string;
    remaining_balance: number | string;
    status: string;
}

export interface MerchantLoanAggregate {
    totalLoans: number;
    activeLoans: number;
    completedLoans: number;
    defaultedLoans: number;
    totalVolume: number;
    outstandingBalance: number;
    repaymentRate: number;
    defaultRate: number;
}

export interface MerchantScoreResult {
    score: number;
    tier: ReputationTier;
}

const VOLUME_BONUS_DIVISOR = 10_000;
const MAX_VOLUME_BONUS = 10;
const REPAYMENT_WEIGHT = 0.9;
const DEFAULT_PENALTY_WEIGHT = 0.5;

/**
 * Pure calculation service backing merchant portfolio/analytics/leaderboard
 * endpoints. Contains no I/O so it can be unit tested without mocking the
 * database layer.
 */
@Injectable()
export class MerchantScoreService {
    /**
     * Reduces a merchant's raw loan rows into portfolio/analytics metrics.
     */
    aggregateLoans(loans: MerchantLoanStatsInput[]): MerchantLoanAggregate {
        const totalLoans = loans.length;
        let activeLoans = 0;
        let completedLoans = 0;
        let defaultedLoans = 0;
        let totalVolume = 0;
        let outstandingBalance = 0;

        for (const loan of loans) {
            totalVolume += Number(loan.loan_amount ?? 0);

            switch (loan.status) {
                case 'active':
                    activeLoans += 1;
                    outstandingBalance += Number(loan.remaining_balance ?? 0);
                    break;
                case 'completed':
                    completedLoans += 1;
                    break;
                case 'defaulted':
                    defaultedLoans += 1;
                    break;
            }
        }

        return {
            totalLoans,
            activeLoans,
            completedLoans,
            defaultedLoans,
            totalVolume: this.round(totalVolume),
            outstandingBalance: this.round(outstandingBalance),
            repaymentRate: totalLoans > 0 ? this.round((completedLoans / totalLoans) * 100) : 0,
            defaultRate: totalLoans > 0 ? this.round((defaultedLoans / totalLoans) * 100) : 0,
        };
    }

    /**
     * Derives a 0-100 financial score and tier from a merchant's loan aggregate.
     * Weighs repayment rate positively, default rate negatively, and gives a
     * small bonus for loan volume — mirrors the tier thresholds used by
     * ReputationService (gold >= 90, silver >= 75, bronze >= 60, else poor).
     */
    calculateScore(aggregate: MerchantLoanAggregate): MerchantScoreResult {
        if (aggregate.totalLoans === 0) {
            return { score: 0, tier: 'poor' };
        }

        const volumeBonus = Math.min(MAX_VOLUME_BONUS, aggregate.totalVolume / VOLUME_BONUS_DIVISOR);
        const rawScore =
            aggregate.repaymentRate * REPAYMENT_WEIGHT -
            aggregate.defaultRate * DEFAULT_PENALTY_WEIGHT +
            volumeBonus;
        const score = Math.max(0, Math.min(100, Math.round(rawScore)));

        return { score, tier: this.mapScoreToTier(score) };
    }

    private mapScoreToTier(score: number): ReputationTier {
        if (score >= 90) return 'gold';
        if (score >= 75) return 'silver';
        if (score >= 60) return 'bronze';
        return 'poor';
    }

    private round(value: number): number {
        return Math.round(value * 100) / 100;
    }
}
