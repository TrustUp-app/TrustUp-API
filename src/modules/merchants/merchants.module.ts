import { Module } from '@nestjs/common';
import { MerchantsService } from './merchants.service';
import { MerchantScoreService } from './merchant-score.service';
import { MerchantsController } from './merchants.controller';
import { MerchantsRepository } from '../../database/repositories/merchants.repository';
import { MerchantApplicationsRepository } from '../../database/repositories/merchant-applications.repository';
import { LoansRepository } from '../../database/repositories/loans.repository';
import { UsersRepository } from '../../database/repositories/users.repository';
import { SupabaseService } from '../../database/supabase.client';

@Module({
  controllers: [MerchantsController],
  providers: [
    MerchantsService,
    MerchantScoreService,
    MerchantsRepository,
    MerchantApplicationsRepository,
    LoansRepository,
    UsersRepository,
    SupabaseService,
  ],
  exports: [MerchantsService],
})
export class MerchantsModule {}
