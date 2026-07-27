import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { TransactionStatusCheckerService } from './transaction-status-checker.service';
import { TransactionStatusCheckerProcessor } from './transaction-status-checker.processor';
import { SupabaseService } from '../../database/supabase.client';
import { LoansRepository } from '../../database/repositories/loans.repository';
import { NotificationsRepository } from '../../database/repositories/notifications.repository';
import { TransactionsRepository } from '../../database/repositories/transactions.repository';
import { StellarModule } from '../../blockchain/stellar/stellar.module';

@Module({
  imports: [
    ConfigModule,
    StellarModule,
    BullModule.registerQueue({ name: 'transaction-status-checker' }),
  ],
  providers: [
    TransactionStatusCheckerService,
    TransactionStatusCheckerProcessor,
    TransactionsRepository,
    LoansRepository,
    NotificationsRepository,
    SupabaseService,
  ],
})
export class TransactionStatusCheckerModule {}
