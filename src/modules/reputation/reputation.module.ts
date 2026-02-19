import { Module } from '@nestjs/common';
import { ReputationService } from './reputation.service';
import { SupabaseService } from '../../database/supabase.client';

@Module({
  providers: [ReputationService, SupabaseService],
  exports: [ReputationService],
})
export class ReputationModule {}
