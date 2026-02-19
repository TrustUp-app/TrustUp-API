import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.client';

export interface ReputationData {
  wallet: string;
  score: number;
  tier: string;
  maxCredit: number;
  lastUpdated: string;
}

@Injectable()
export class ReputationService {
  private readonly logger = new Logger(ReputationService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Fetch reputation data for a given wallet address.
   * Falls back to default "poor" tier when no on-chain data is found.
   */
  async getReputation(wallet: string): Promise<ReputationData> {
    try {
      const client = this.supabaseService.getClient();
      const { data, error } = await client
        .from('reputations')
        .select('*')
        .eq('wallet', wallet)
        .single();

      if (error || !data) {
        this.logger.warn(`No reputation found for wallet ${wallet}, using defaults`);
        return this.getDefaultReputation(wallet);
      }

      return {
        wallet: data.wallet,
        score: data.score,
        tier: this.getTierFromScore(data.score),
        maxCredit: this.getMaxCreditFromScore(data.score),
        lastUpdated: data.updated_at,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch reputation for ${wallet}: ${error.message}`);
      return this.getDefaultReputation(wallet);
    }
  }

  /** Map a numeric score (0–100) to a named tier. */
  getTierFromScore(score: number): string {
    if (score >= 80) return 'gold';
    if (score >= 60) return 'silver';
    if (score >= 40) return 'bronze';
    return 'poor';
  }

  /** Determine the maximum credit limit based on score. */
  getMaxCreditFromScore(score: number): number {
    if (score >= 80) return 10000;
    if (score >= 60) return 5000;
    if (score >= 40) return 2000;
    return 500;
  }

  private getDefaultReputation(wallet: string): ReputationData {
    return {
      wallet,
      score: 0,
      tier: 'poor',
      maxCredit: 500,
      lastUpdated: new Date().toISOString(),
    };
  }
}
