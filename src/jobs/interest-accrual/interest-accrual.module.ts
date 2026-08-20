import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseService } from '../../database/supabase.client';
import { InterestAccrualProcessor } from './interest-accrual.processor';
import { InterestAccrualService } from './interest-accrual.service';

@Module({
  imports: [ConfigModule, BullModule.registerQueue({ name: 'interest-accrual' })],
  providers: [InterestAccrualService, InterestAccrualProcessor, SupabaseService],
})
export class InterestAccrualModule {}
