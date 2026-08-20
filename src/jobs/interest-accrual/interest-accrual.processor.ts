import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SupabaseService } from '../../database/supabase.client';

export function daysBetweenUtc(fromIso: string, to: Date): number {
  const from = new Date(fromIso);
  const ms = to.getTime() - from.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export function accrueInterest(balance: number, annualRatePct: number, days: number): number {
  if (days <= 0 || balance <= 0 || annualRatePct <= 0) {
    return 0;
  }
  return Math.round(((balance * annualRatePct) / 100 / 365) * days * 1e7) / 1e7;
}

@Processor('interest-accrual')
export class InterestAccrualProcessor extends WorkerHost {
  private readonly logger = new Logger(InterestAccrualProcessor.name);

  constructor(private readonly supabase: SupabaseService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const now = new Date();
    const periodKey = now.toISOString().slice(0, 13);
    const db = this.supabase.getServiceRoleClient();

    const { error: claimError } = await db.from('loan_job_runs').insert({
      job_name: 'interest-accrual',
      period_key: periodKey,
      processed: 0,
    });
    if (claimError?.code === '23505') {
      this.logger.log(
        { context: 'InterestAccrualProcessor', action: 'skipDuplicate', periodKey },
        'Interest accrual already ran for this UTC hour',
      );
      return;
    }
    if (claimError) {
      throw new Error(`Failed to claim interest-accrual run: ${claimError.message}`);
    }

    const { data: loans, error } = await db
      .from('loans')
      .select(
        'id, loan_id, remaining_balance, interest_rate, accrued_interest, last_accrual_at, created_at',
      )
      .eq('status', 'active');

    if (error) {
      throw new Error(`Failed to load active loans: ${error.message}`);
    }

    let updated = 0;
    for (const loan of loans ?? []) {
      const start = loan.last_accrual_at || loan.created_at;
      const days = daysBetweenUtc(start, now);
      const delta = accrueInterest(Number(loan.remaining_balance), Number(loan.interest_rate), days);
      if (delta <= 0) {
        continue;
      }
      const next = Number(loan.accrued_interest ?? 0) + delta;
      const { error: updateError } = await db
        .from('loans')
        .update({
          accrued_interest: next,
          last_accrual_at: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('id', loan.id)
        .eq('status', 'active');
      if (updateError) {
        this.logger.error(
          {
            context: 'InterestAccrualProcessor',
            action: 'accrue',
            loanId: loan.loan_id,
            error: updateError.message,
          },
          'Failed to persist accrued interest',
        );
        continue;
      }
      updated += 1;
    }

    await db
      .from('loan_job_runs')
      .update({ processed: updated })
      .eq('job_name', 'interest-accrual')
      .eq('period_key', periodKey);

    this.logger.log(
      { context: 'InterestAccrualProcessor', action: 'summary', periodKey, updated },
      `Interest accrual complete — updated ${updated}`,
    );
  }
}
