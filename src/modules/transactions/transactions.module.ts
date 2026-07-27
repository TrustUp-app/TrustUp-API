import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { AuthModule } from '../auth/auth.module';
import { SupabaseService } from '../../database/supabase.client';
import { TransactionsRepository } from '../../database/repositories/transactions.repository';
import { StellarModule } from '../../blockchain/stellar/stellar.module';
import { getRedisConfig } from '../../config/redis.config';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    StellarModule,
    CacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getRedisConfig,
    }),
  ],
  controllers: [TransactionsController],
  providers: [TransactionsService, TransactionsRepository, SupabaseService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
