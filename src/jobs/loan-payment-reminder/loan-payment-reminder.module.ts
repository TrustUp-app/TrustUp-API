import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { LoanPaymentReminderService } from './loan-payment-reminder.service';
import { LoanPaymentReminderProcessor } from './loan-payment-reminder.processor';
import { SupabaseService } from '../../database/supabase.client';

@Module({
  imports: [ConfigModule, BullModule.registerQueue({ name: 'payment-reminders' })],
  providers: [LoanPaymentReminderService, LoanPaymentReminderProcessor, SupabaseService],
})
export class LoanPaymentReminderModule {}
