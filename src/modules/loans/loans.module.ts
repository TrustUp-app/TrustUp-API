import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoansController } from './loans.controller';
import { LoansService } from './loans.service';
import { AuthModule } from '../auth/auth.module';
import { ReputationModule } from '../reputation/reputation.module';
import { SupabaseService } from '../../database/supabase.client';
import { LoansRepository } from '../../database/repositories/loans.repository';
import { MerchantsRepository } from '../../database/repositories/merchants.repository';
import { SorobanService } from '../../blockchain/soroban/soroban.service';
import { CreditLineContractClient } from '../../blockchain/contracts/credit-line-contract.client';
import { ReputationContractClient } from '../../blockchain/contracts/reputation-contract.client';
import { IdempotencyInterceptor } from '../../common/interceptors/idempotency.interceptor';
import { getRedisConfig } from '../../config/redis.config';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    ReputationModule,
    CacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getRedisConfig,
    }),
  ],
  controllers: [LoansController],
  providers: [
    LoansService,
    LoansRepository,
    MerchantsRepository,
    SupabaseService,
    SorobanService,
    CreditLineContractClient,
    ReputationContractClient,
    IdempotencyInterceptor,
  ],
  exports: [LoansService],
})
export class LoansModule {}
