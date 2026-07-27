import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { LoansModule } from './modules/loans/loans.module';
import { ReputationModule } from './modules/reputation/reputation.module';
import { UsersModule } from './modules/users/users.module';
import { MerchantsModule } from './modules/merchants/merchants.module';
import { LiquidityModule } from './modules/liquidity/liquidity.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { BlockchainIndexerModule } from './jobs/blockchain-indexer/blockchain-indexer.module';
import { LoanPaymentReminderModule } from './jobs/loan-payment-reminder/loan-payment-reminder.module';
import { TransactionStatusCheckerModule } from './jobs/transaction-status-checker/transaction-status-checker.module';

@Module({
  imports: [
    // ConfigModule must be first — SupabaseService and other providers depend on it
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          url: configService.get<string>('REDIS_URL') || 'redis://localhost:6379',
        },
      }),
    }),
    AuthModule,
    HealthModule,
    LoansModule,
    ReputationModule,
    UsersModule,
    MerchantsModule,
    LiquidityModule,
    NotificationsModule,
    TransactionsModule,
    BlockchainIndexerModule,
    LoanPaymentReminderModule,
    TransactionStatusCheckerModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule { }
