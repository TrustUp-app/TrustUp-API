import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CreditLineContractClient } from '../../blockchain/contracts/credit-line-contract.client';
import { SorobanService } from '../../blockchain/soroban/soroban.service';
import { SupabaseService } from '../../database/supabase.client';
import { LoanDefaultDetectorProcessor } from './loan-default-detector.processor';
import { LoanDefaultDetectorService } from './loan-default-detector.service';

@Module({
  imports: [ConfigModule, BullModule.registerQueue({ name: 'loan-defaults' })],
  providers: [
    LoanDefaultDetectorService,
    LoanDefaultDetectorProcessor,
    SupabaseService,
    SorobanService,
    CreditLineContractClient,
  ],
})
export class LoanDefaultDetectorModule {}
