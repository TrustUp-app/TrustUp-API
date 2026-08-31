import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SupabaseService } from '../../database/supabase.client';
import {
  ActiveLoan,
  MerchantInfo,
  ReminderCandidate,
  ReminderSummary,
  ReminderType,
} from './interfaces/reminder.interfaces';
import { daysUntilDueUtc, getReminderWindow, ReminderWindow } from './reminder-window.util';

const REMINDER_TITLES: Record<ReminderType, string> = {
  payment_reminder_3d: 'Payment Due in 3 Days',
  payment_reminder_1d: 'Payment Due Tomorrow',
  payment_overdue: 'Loan Payment Overdue',
};

const REMINDER_WINDOW_TO_TYPE: Record<Exclude<ReminderWindow, null>, ReminderType> = {
  'three-day': 'payment_reminder_3d',
  'one-day': 'payment_reminder_1d',
  overdue: 'payment_overdue',
};

function buildMessage(type: ReminderType, amount: string, dueDate: string): string {
  const formatted = new Date(dueDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
  switch (type) {
    case 'payment_reminder_3d':
      return `Your loan payment of ${amount} XLM is due on ${formatted} (in 3 days). Please ensure your wallet has sufficient funds.`;
    case 'payment_reminder_1d':
      return `Your loan payment of ${amount} XLM is due tomorrow, ${formatted}. Please ensure your wallet has sufficient funds.`;
    case 'payment_overdue':
      return `Your loan payment of ${amount} XLM was due on ${formatted} and is now overdue. Please make your payment as soon as possible to avoid penalties.`;
  }
}

/**
 * BullMQ processor for the `payment-reminders` queue.
 *
 * Runs daily at 9 AM UTC via cron schedule.
 * Identifies active loans with upcoming or overdue payments and creates
 * reminder notifications, preventing duplicates.
 */
@Processor('payment-reminders')
export class LoanPaymentReminderProcessor extends WorkerHost {
  private readonly logger = new Logger(LoanPaymentReminderProcessor.name);

  constructor(private readonly supabaseService: SupabaseService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    this.logger.log(
      { context: 'LoanPaymentReminderProcessor', action: 'process' },
      'Loan payment reminder job started',
    );

    const summary: ReminderSummary = {
      total: 0,
      created: 0,
      skipped: 0,
      failed: 0,
      breakdown: { payment_reminder_3d: 0, payment_reminder_1d: 0, payment_overdue: 0 },
    };

    try {
      const loans = await this.fetchActiveLoans();

      if (loans.length === 0) {
        this.logger.log(
          { context: 'LoanPaymentReminderProcessor', action: 'process' },
          'No active loans found — skipping reminder run',
        );
        // summary will log 0s in finally, which is accurate
        return;
      }

      this.logger.log(
        { context: 'LoanPaymentReminderProcessor', action: 'process', loanCount: loans.length },
        `Processing ${loans.length} active loans`,
      );

      const candidates = this.identifyCandidates(loans);
      summary.total = candidates.length;

      this.logger.log(
        {
          context: 'LoanPaymentReminderProcessor',
          action: 'identifyCandidates',
          activeLoans: loans.length,
          candidates: candidates.length,
        },
        `Identified ${candidates.length} reminder candidates from ${loans.length} active loans`,
      );

      const merchantCache = new Map<string, MerchantInfo>();

      for (const candidate of candidates) {
        try {
          const merchant = await this.getMerchant(candidate.loan.merchant_id, merchantCache);
          const isDuplicate = await this.isDuplicateReminder(
            candidate.loan.id,
            candidate.reminderType,
          );

          if (isDuplicate) {
            summary.skipped++;
            this.logger.log(
              {
                context: 'LoanPaymentReminderProcessor',
                action: 'skipDuplicate',
                loanId: candidate.loan.loan_id,
                type: candidate.reminderType,
              },
              'Skipping duplicate reminder',
            );
            continue;
          }

          await this.createNotification(candidate, merchant);
          summary.created++;
          summary.breakdown[candidate.reminderType]++;
        } catch (error) {
          summary.failed++;
          this.logger.error(
            {
              context: 'LoanPaymentReminderProcessor',
              action: 'processCandidate',
              loanId: candidate.loan.loan_id,
              type: candidate.reminderType,
              error: error.message,
              stack: error.stack,
            },
            'Failed to process reminder candidate — continuing with next',
          );
        }
      }
    } catch (error) {
      this.logger.error(
        {
          context: 'LoanPaymentReminderProcessor',
          action: 'process',
          error: error.message,
          stack: error.stack,
        },
        'Fatal error during reminder job — partial results may have been written',
      );
    } finally {
      this.logger.log(
        {
          context: 'LoanPaymentReminderProcessor',
          action: 'summary',
          ...summary,
        },
        `Reminder job complete — created: ${summary.created}, skipped: ${summary.skipped}, failed: ${summary.failed}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async fetchActiveLoans(): Promise<ActiveLoan[]> {
    const db = this.supabaseService.getServiceRoleClient();

    const { data, error } = await db
      .from('loans')
      .select(
        'id, loan_id, user_wallet, merchant_id, amount, loan_amount, next_payment_due, remaining_balance, term',
      )
      .eq('status', 'active')
      .not('next_payment_due', 'is', null);

    if (error) {
      throw new Error(`Failed to fetch active loans: ${error.message}`);
    }

    return (data ?? []) as ActiveLoan[];
  }

  /**
   * Classifies each loan into a reminder bucket based on UTC day difference.
   * Uses floor-based day diff so timezone edge cases around midnight are handled
   * consistently — the job always runs at 9 AM UTC, well away from midnight.
   */
  private identifyCandidates(loans: ActiveLoan[]): ReminderCandidate[] {
    const now = new Date();
    const candidates: ReminderCandidate[] = [];

    for (const loan of loans) {
      if (!loan.next_payment_due) continue;

      const dueDate = new Date(loan.next_payment_due);
      const window = getReminderWindow(dueDate, now);
      if (!window) continue;

      candidates.push({
        loan,
        reminderType: REMINDER_WINDOW_TO_TYPE[window],
        daysUntilDue: daysUntilDueUtc(dueDate, now),
      });
    }

    return candidates;
  }

  /**
   * Checks whether a reminder of the same type was already sent for this loan
   * today (UTC). Uses the `data->>'loan_db_id'` JSONB field for matching.
   */
  private async isDuplicateReminder(loanDbId: string, type: ReminderType): Promise<boolean> {
    const db = this.supabaseService.getServiceRoleClient();

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const { count, error } = await db
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('type', type)
      .eq('data->>loan_db_id', loanDbId)
      .gte('created_at', todayStart.toISOString());

    if (error) {
      // Log but don't block — better to send a duplicate than miss a reminder
      this.logger.warn(
        {
          context: 'LoanPaymentReminderProcessor',
          action: 'isDuplicateReminder',
          loanDbId,
          type,
          error: error.message,
        },
        'Could not check for duplicate reminder — proceeding anyway',
      );
      return false;
    }

    return (count ?? 0) > 0;
  }

  private async getMerchant(
    merchantId: string | null,
    cache: Map<string, MerchantInfo>,
  ): Promise<MerchantInfo | null> {
    if (!merchantId) return null;
    if (cache.has(merchantId)) return cache.get(merchantId)!;

    const db = this.supabaseService.getServiceRoleClient();
    const { data, error } = await db
      .from('merchants')
      .select('id, name')
      .eq('id', merchantId)
      .single();

    if (error || !data) return null;

    const merchant: MerchantInfo = { id: data.id, name: data.name };
    cache.set(merchantId, merchant);
    return merchant;
  }

  private async createNotification(
    candidate: ReminderCandidate,
    merchant: MerchantInfo | null,
  ): Promise<void> {
    const { loan, reminderType } = candidate;
    const db = this.supabaseService.getServiceRoleClient();

    const title = REMINDER_TITLES[reminderType];
    const message = buildMessage(reminderType, loan.loan_amount, loan.next_payment_due!);

    const notificationData: Record<string, unknown> = {
      loan_db_id: loan.id,
      loan_id: loan.loan_id,
      loan_amount: loan.loan_amount,
      remaining_balance: loan.remaining_balance,
      due_date: loan.next_payment_due,
    };

    if (merchant) {
      notificationData.merchant_id = merchant.id;
      notificationData.merchant_name = merchant.name;
    }

    const { error } = await db.from('notifications').insert({
      user_wallet: loan.user_wallet,
      type: reminderType,
      title,
      message,
      data: notificationData,
      is_read: false,
      created_at: new Date().toISOString(),
    });

    if (error) {
      throw new Error(`Failed to insert notification: ${error.message}`);
    }

    this.logger.log(
      {
        context: 'LoanPaymentReminderProcessor',
        action: 'createNotification',
        loanId: loan.loan_id,
        userWallet: loan.user_wallet,
        type: reminderType,
        dueDate: loan.next_payment_due,
      },
      `Reminder notification created: ${reminderType}`,
    );
  }
}
