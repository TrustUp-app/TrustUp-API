import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.client';
import { ReputationContractClient } from '../../blockchain/contracts/reputation-contract.client';
import { ReputationResponseDto } from './dto/reputation-response.dto';

/** Default score assigned to wallets with no on-chain history. */
const DEFAULT_SCORE = 50;

/** Tier definitions: threshold, interest-rate band, and credit-limit band. */
const TIERS = [
  { name: 'gold', minScore: 90, interestMin: 4, interestMax: 6, creditMin: 5000, creditMax: 10000 },
  { name: 'silver', minScore: 75, interestMin: 6, interestMax: 8, creditMin: 2000, creditMax: 5000 },
  { name: 'bronze', minScore: 60, interestMin: 8, interestMax: 10, creditMin: 1000, creditMax: 2000 },
] as const;

const POOR_TIER = { name: 'poor', interestMin: 10, interestMax: 15, creditMin: 0, creditMax: 1000 } as const;

export interface ReputationData {
  wallet: string;
  score: number;
  tier: string;
  interestRate: number;
  maxCredit: number;
  lastUpdated: string;
}

@Injectable()
export class ReputationService {
  private readonly logger = new Logger(ReputationService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly contractClient: ReputationContractClient,
  ) {}

  /**
   * Fetch the full reputation profile for a wallet.
   *
   * Resolution order:
   *  1. Query the Soroban Reputation contract for the on-chain score.
   *  2. On failure, fall back to the cached score in Supabase.
   *  3. If neither source has data, use the default score for new users.
   */
  async getReputation(wallet: string): Promise<ReputationData> {
    const score = await this.resolveScore(wallet);
    return this.buildReputationData(wallet, score);
  }

  /**
   * Build a full ReputationResponseDto from a wallet and resolved score.
   */
  buildReputationResponse(wallet: string, score: number): ReputationResponseDto {
    const tier = this.getTierFromScore(score);
    return {
      wallet,
      score,
      tier,
      interestRate: this.getInterestRateFromScore(score),
      maxCredit: this.getMaxCreditFromScore(score),
      lastUpdated: new Date().toISOString(),
    };
  }

  // ------------------------------------------------------------------
  // Score resolution
  // ------------------------------------------------------------------

  private async resolveScore(wallet: string): Promise<number> {
    const onChainScore = await this.fetchOnChainScore(wallet);
    if (onChainScore !== null) return onChainScore;

    const cachedScore = await this.fetchCachedScore(wallet);
    if (cachedScore !== null) return cachedScore;

    this.logger.warn(`No reputation data for ${wallet}, defaulting to ${DEFAULT_SCORE}`);
    return DEFAULT_SCORE;
  }

  private async fetchOnChainScore(wallet: string): Promise<number | null> {
    try {
      const raw = await this.contractClient.getScore(wallet);
      const score = this.normalizeScore(raw);
      this.logger.debug(`On-chain score for ${wallet}: ${score}`);
      return score;
    } catch (err) {
      this.logger.warn(`On-chain score unavailable for ${wallet}: ${err.message}`);
      return null;
    }
  }

  private async fetchCachedScore(wallet: string): Promise<number | null> {
    try {
      const client = this.supabaseService.getClient();
      const { data, error } = await client
        .from('reputations')
        .select('score')
        .eq('wallet', wallet)
        .single();

      if (error || !data) return null;

      this.logger.debug(`Cached score for ${wallet}: ${data.score}`);
      return this.normalizeScore(data.score);
    } catch (err) {
      this.logger.error(`Supabase lookup failed for ${wallet}: ${err.message}`);
      return null;
    }
  }

  // ------------------------------------------------------------------
  // Scoring helpers (public for unit-testing and reuse by LoansService)
  // ------------------------------------------------------------------

  /** Clamp any numeric value to the 0–100 range. */
  normalizeScore(raw: number): number {
    return Math.min(Math.max(Math.round(raw), 0), 100);
  }

  /** Map a numeric score (0–100) to a named tier. */
  getTierFromScore(score: number): string {
    for (const tier of TIERS) {
      if (score >= tier.minScore) return tier.name;
    }
    return POOR_TIER.name;
  }

  /**
   * Calculate the representative interest rate for a given score.
   * Within each tier the rate is linearly interpolated so that
   * higher scores yield lower (better) rates.
   */
  getInterestRateFromScore(score: number): number {
    const tier = this.resolveTierConfig(score);
    const { minScore, maxScore, interestMin, interestMax } = tier;

    const span = maxScore - minScore;
    if (span === 0) return interestMax;

    const position = Math.min(Math.max((score - minScore) / span, 0), 1);
    const rate = interestMax - position * (interestMax - interestMin);
    return Math.round(rate * 100) / 100;
  }

  /** Determine the maximum credit limit based on score. */
  getMaxCreditFromScore(score: number): number {
    const tier = this.resolveTierConfig(score);
    const { minScore, maxScore, creditMin, creditMax } = tier;

    const span = maxScore - minScore;
    if (span === 0) return creditMin;

    const position = Math.min(Math.max((score - minScore) / span, 0), 1);
    return Math.round(creditMin + position * (creditMax - creditMin));
  }

  // ------------------------------------------------------------------
  // Internal helpers
  // ------------------------------------------------------------------

  private resolveTierConfig(score: number) {
    for (let i = 0; i < TIERS.length; i++) {
      const tier = TIERS[i];
      if (score >= tier.minScore) {
        const maxScore = i === 0 ? 100 : TIERS[i - 1].minScore - 1;
        return { ...tier, minScore: tier.minScore, maxScore };
      }
    }
    const lowestTier = TIERS[TIERS.length - 1];
    return {
      ...POOR_TIER,
      minScore: 0,
      maxScore: lowestTier.minScore - 1,
    };
  }

  private buildReputationData(wallet: string, score: number): ReputationData {
    return {
      wallet,
      score,
      tier: this.getTierFromScore(score),
      interestRate: this.getInterestRateFromScore(score),
      maxCredit: this.getMaxCreditFromScore(score),
      lastUpdated: new Date().toISOString(),
    };
  }
}
