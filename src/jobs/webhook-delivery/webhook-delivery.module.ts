import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseService } from '../../database/supabase.client';
import { WebhookDeliveryProcessor } from './webhook-delivery.processor';
import { WebhookDispatchService, WEBHOOK_QUEUE } from './webhook-dispatch.service';
import { FetchWebhookHttpClient, WebhookHttpClient } from './webhook-http.client';

@Module({
  imports: [ConfigModule, BullModule.registerQueue({ name: WEBHOOK_QUEUE })],
  providers: [
    WebhookDispatchService,
    WebhookDeliveryProcessor,
    SupabaseService,
    { provide: WebhookHttpClient, useClass: FetchWebhookHttpClient },
  ],
  exports: [WebhookDispatchService, BullModule],
})
export class WebhookDeliveryModule {}
