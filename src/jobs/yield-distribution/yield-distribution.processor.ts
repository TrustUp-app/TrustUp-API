import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SupabaseService } from '../../database/supabase.client';

/** Share of accrued interest allocated to LPs (matches liquidity.service LP_FEE_RATIO). */
export const LP_YIELD_RATIO = 0.85;

export function shareOfPool(shares: number, totalShares: number, poolYield: number): number {
  if (shares <= 0 || totalShares <= 0 || poolYield <= 0) {
    return 0;
  }
  return Math.round(((shares / totalShares) * poolYield) * 1e7) / 1e7;
}

/** Interest not yet credited to LPs. Checkpoint is loans.distributed_interest. */
export function undistributedInterest(accrued: number, distributed: number): number {
  const delta = Number(accrued) - Number(distributed);
  if (!Number.isFinite(delta) || delta <= 0) {
    return 0;
  }
  return Math.round(delta * 1e7) / 1e7;
}

@Processor('yield-distribution')
export class YieldDistributionProcessor extends WorkerHost {
  private readonly logger = new Logger(YieldDistributionProcessor.name);

  constructor(private readonly supabase: SupabaseService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const periodKey = new Date().toISOString().slice(0, 10);
    const db = this.supabase.getServiceRoleClient();

    const { error: claimError } = await db.from('loan_job_runs').insert({
      job_name: 'yield-distribution',
      period_key: periodKey,
      processed: 0,
    });
    if (claimError?.code === '23505') {
      this.logger.log(
        { context: 'YieldDistributionProcessor', action: 'skipDuplicate', periodKey },
        'Yield distribution already ran for this UTC day',
      );
      return;
    }
    if (claimError) {
      throw new Error(`Failed to claim yield-distribution run: ${claimError.message}`);
    }

    const { data: loans, error: loanError } = await db
      .from('loans')
      .select('id, accrued_interest, distributed_interest')
      .in('status', ['active', 'completed', 'defaulted']);
    if (loanError) {
      throw new Error(`Failed to load loan interest: ${loanError.message}`);
    }

    const pending = (loans ?? []).map((row) => {
      const distributed = Number(row.distributed_interest ?? 0);
      const delta = undistributedInterest(Number(row.accrued_interest ?? 0), distributed);
      return { id: row.id as string, distributed, delta };
    });
    const poolInterest = pending.reduce((sum, row) => sum + row.delta, 0);
    const distributable = Math.round(poolInterest * LP_YIELD_RATIO * 1e7) / 1e7;

    const { data: positions, error: posError } = await db
      .from('liquidity_positions')
      .select('id, provider_wallet, shares, lifetime_yield');
    if (posError) {
      throw new Error(`Failed to load LP positions: ${posError.message}`);
    }

    const totalShares = (positions ?? []).reduce((sum, row) => sum + Number(row.shares ?? 0), 0);
    let paid = 0;
    const now = new Date().toISOString();

    for (const position of positions ?? []) {
      const amount = shareOfPool(Number(position.shares ?? 0), totalShares, distributable);
      if (amount <= 0) {
        continue;
      }
      const { error: updateError } = await db
        .from('liquidity_positions')
        .update({
          lifetime_yield: Number(position.lifetime_yield ?? 0) + amount,
          last_yield_at: now,
          updated_at: now,
        })
        .eq('id', position.id);
      if (updateError) {
        this.logger.error(
          {
            context: 'YieldDistributionProcessor',
            action: 'creditLp',
            wallet: position.provider_wallet,
            error: updateError.message,
          },
          'Failed to credit LP yield',
        );
        continue;
      }
      paid += 1;
    }

    if (paid > 0 && totalShares > 0 && distributable > 0) {
      for (const loan of pending) {
        if (loan.delta <= 0) {
          continue;
        }
        const { error: checkpointError } = await db
          .from('loans')
          .update({
            distributed_interest: loan.distributed + loan.delta,
            updated_at: now,
          })
          .eq('id', loan.id);
        if (checkpointError) {
          this.logger.error(
            {
              context: 'YieldDistributionProcessor',
              action: 'checkpointDistributed',
              loanId: loan.id,
              error: checkpointError.message,
            },
            'Failed to checkpoint distributed interest',
          );
        }
      }
    }

    await db
      .from('loan_job_runs')
      .update({ processed: paid })
      .eq('job_name', 'yield-distribution')
      .eq('period_key', periodKey);

    this.logger.log(
      {
        context: 'YieldDistributionProcessor',
        action: 'summary',
        periodKey,
        distributable,
        paid,
      },
      `Yield distribution complete — credited ${paid} LPs`,
    );
  }
}
