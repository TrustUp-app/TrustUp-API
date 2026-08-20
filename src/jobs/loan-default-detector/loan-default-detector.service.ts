import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';

@Injectable()
export class LoanDefaultDetectorService implements OnModuleInit {
  private readonly logger = new Logger(LoanDefaultDetectorService.name);

  constructor(@InjectQueue('loan-defaults') private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    const existing = await this.queue.getRepeatableJobs();
    for (const job of existing) {
      await this.queue.removeRepeatableByKey(job.key);
    }
    await this.queue.add(
      'detect-defaults',
      {},
      {
        repeat: { pattern: '0 9 * * *' },
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 50 },
      },
    );
    this.logger.log(
      { context: 'LoanDefaultDetectorService', action: 'onModuleInit' },
      'Loan default detector scheduled — daily at 9 AM UTC',
    );
  }
}
