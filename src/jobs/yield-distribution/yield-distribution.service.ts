import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';

@Injectable()
export class YieldDistributionService implements OnModuleInit {
  private readonly logger = new Logger(YieldDistributionService.name);

  constructor(@InjectQueue('yield-distribution') private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    const existing = await this.queue.getRepeatableJobs();
    for (const job of existing) {
      await this.queue.removeRepeatableByKey(job.key);
    }
    await this.queue.add(
      'distribute-yield',
      {},
      {
        repeat: { pattern: '0 10 * * *' },
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 50 },
      },
    );
    this.logger.log(
      { context: 'YieldDistributionService', action: 'onModuleInit' },
      'Yield distribution job scheduled — daily at 10 AM UTC',
    );
  }
}
