import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

/**
 * Schedules the loan-payment-reminder repeating job on module initialisation.
 *
 * The job runs once daily at 9 AM UTC via cron expression `0 9 * * *`.
 * Stale repeatable jobs from previous runs are removed before re-scheduling
 * to avoid duplicate executions after hot-reloads or restarts.
 */
@Injectable()
export class LoanPaymentReminderService implements OnModuleInit {
  private readonly logger = new Logger(LoanPaymentReminderService.name);

  constructor(
    @InjectQueue('payment-reminders')
    private readonly reminderQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    // Clean up any stale repeatable jobs from a previous run
    const existing = await this.reminderQueue.getRepeatableJobs();
    for (const job of existing) {
      await this.reminderQueue.removeRepeatableByKey(job.key);
    }

    await this.reminderQueue.add(
      'send-payment-reminders',
      {},
      {
        repeat: { pattern: '0 9 * * *', offset: 0 },
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 50 },
      },
    );

    this.logger.log(
      {
        context: 'LoanPaymentReminderService',
        action: 'onModuleInit',
      },
      'Loan payment reminder job scheduled — runs daily at 9 AM UTC',
    );
  }
}
