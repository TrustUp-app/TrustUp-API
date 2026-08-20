import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';

@Injectable()
export class InterestAccrualService implements OnModuleInit {
  private readonly logger = new Logger(InterestAccrualService.name);

  constructor(@InjectQueue('interest-accrual') private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    const existing = await this.queue.getRepeatableJobs();
    for (const job of existing) {
      await this.queue.removeRepeatableByKey(job.key);
    }
    await this.queue.add(
      'accrue-interest',
      {},
      {
        repeat: { every: 60 * 60 * 1000 },
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 50 },
      },
    );
    this.logger.log(
      { context: 'InterestAccrualService', action: 'onModuleInit' },
      'Interest accrual job scheduled — hourly',
    );
  }
}
