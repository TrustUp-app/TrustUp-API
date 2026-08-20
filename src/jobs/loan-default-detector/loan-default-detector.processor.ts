import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { CreditLineContractClient } from '../../blockchain/contracts/credit-line-contract.client';
import { SupabaseService } from '../../database/supabase.client';

/** Days after next_payment_due before an active loan is marked defaulted. */
export const DEFAULT_GRACE_PERIOD_DAYS = 3;

@Processor('loan-defaults')
export class LoanDefaultDetectorProcessor extends WorkerHost {
  private readonly logger = new Logger(LoanDefaultDetectorProcessor.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly creditLine: CreditLineContractClient,
  ) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const periodKey = new Date().toISOString().slice(0, 10);
    const db = this.supabase.getServiceRoleClient();

    const claimed = await this.claimRun(periodKey);
    if (!claimed) {
      this.logger.log(
        { context: 'LoanDefaultDetectorProcessor', action: 'skipDuplicate', periodKey },
        'Default detector already ran for this UTC day',
      );
      return;
    }

    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - DEFAULT_GRACE_PERIOD_DAYS);

    const { data: loans, error } = await db
      .from('loans')
      .select('id, loan_id, user_wallet, status, next_payment_due')
      .eq('status', 'active')
      .not('next_payment_due', 'is', null)
      .lt('next_payment_due', cutoff.toISOString());

    if (error) {
      throw new Error(`Failed to load overdue loans: ${error.message}`);
    }

    let marked = 0;
    for (const loan of loans ?? []) {
      const { error: updateError } = await db
        .from('loans')
        .update({
          status: 'defaulted',
          defaulted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', loan.id)
        .eq('status', 'active');

      if (updateError) {
        this.logger.error(
          {
            context: 'LoanDefaultDetectorProcessor',
            action: 'markDefaulted',
            loanId: loan.loan_id,
            error: updateError.message,
          },
          'Failed to mark loan defaulted',
        );
        continue;
      }

      await this.creditLine.markDefault(loan.loan_id);
      marked += 1;
    }

    await db
      .from('loan_job_runs')
      .update({ processed: marked })
      .eq('job_name', 'loan-default-detector')
      .eq('period_key', periodKey);

    this.logger.log(
      { context: 'LoanDefaultDetectorProcessor', action: 'summary', periodKey, marked },
      `Default detector complete — marked ${marked}`,
    );
  }

  private async claimRun(periodKey: string): Promise<boolean> {
    const db = this.supabase.getServiceRoleClient();
    const { error } = await db.from('loan_job_runs').insert({
      job_name: 'loan-default-detector',
      period_key: periodKey,
      processed: 0,
    });
    if (!error) {
      return true;
    }
    if (error.code === '23505') {
      return false;
    }
    throw new Error(`Failed to claim default-detector run: ${error.message}`);
  }
}
