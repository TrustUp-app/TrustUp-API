import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseService } from '../../database/supabase.client';
import { YieldDistributionProcessor } from './yield-distribution.processor';
import { YieldDistributionService } from './yield-distribution.service';

@Module({
  imports: [ConfigModule, BullModule.registerQueue({ name: 'yield-distribution' })],
  providers: [YieldDistributionService, YieldDistributionProcessor, SupabaseService],
})
export class YieldDistributionModule {}
