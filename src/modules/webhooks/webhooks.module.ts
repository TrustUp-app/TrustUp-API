import { Module } from '@nestjs/common';
import { MerchantsRepository } from '../../database/repositories/merchants.repository';
import { SupabaseService } from '../../database/supabase.client';
import { AdminWebhooksController } from './admin-webhooks.controller';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  controllers: [WebhooksController, AdminWebhooksController],
  providers: [WebhooksService, MerchantsRepository, SupabaseService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
