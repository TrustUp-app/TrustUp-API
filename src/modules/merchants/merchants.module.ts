import { Module } from '@nestjs/common';
import { MerchantsService } from './merchants.service';
import { SupabaseService } from '../../database/supabase.client';

@Module({
  providers: [MerchantsService, SupabaseService],
  exports: [MerchantsService],
})
export class MerchantsModule {}
