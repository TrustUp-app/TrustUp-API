import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AuthModule } from '../auth/auth.module';
import { SupabaseService } from '../../database/supabase.client';
import { UsersRepository } from '../../database/repositories/users.repository';
import { MerchantApplicationsRepository } from '../../database/repositories/merchant-applications.repository';
import { MerchantsRepository } from '../../database/repositories/merchants.repository';
import { LoansRepository } from '../../database/repositories/loans.repository';

@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [
    AdminService,
    SupabaseService,
    UsersRepository,
    MerchantApplicationsRepository,
    MerchantsRepository,
    LoansRepository,
  ],
})
export class AdminModule {}
