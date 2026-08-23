import { Module } from '@nestjs/common';
import { MerchantsService } from './merchants.service';
import { MerchantScoreService } from './merchant-score.service';
import { MerchantsController } from './merchants.controller';
import { MerchantsRepository } from '../../database/repositories/merchants.repository';
import { LoansRepository } from '../../database/repositories/loans.repository';
import { SupabaseService } from '../../database/supabase.client';

@Module({
    controllers: [MerchantsController],
    providers: [MerchantsService, MerchantScoreService, MerchantsRepository, LoansRepository, SupabaseService],
    exports: [MerchantsService],
})
export class MerchantsModule { }
