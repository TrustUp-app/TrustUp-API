import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SupabaseService } from '../../database/supabase.client';
import {
  signPayload,
  WEBHOOK_DELIVERY_HEADER,
  WEBHOOK_EVENT_HEADER,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
} from '../../modules/webhooks/hmac.util';
import { WEBHOOK_QUEUE, type WebhookJobData } from './webhook-dispatch.service';
import { WebhookHttpClient } from './webhook-http.client';

@Processor(WEBHOOK_QUEUE)
export class WebhookDeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookDeliveryProcessor.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly http: WebhookHttpClient,
  ) {
    super();
  }

  async process(job: Job<WebhookJobData>): Promise<void> {
    const { deliveryId, endpointId } = job.data;
    const db = this.supabase.getServiceRoleClient();

    const { data: delivery, error: deliveryError } = await db
      .from('webhook_deliveries')
      .select('*')
      .eq('id', deliveryId)
      .maybeSingle();

    if (deliveryError || !delivery) {
      throw new Error(`Delivery ${deliveryId} not found`);
    }
    if (delivery.status === 'success') {
      this.logger.log(
        { context: 'WebhookDeliveryProcessor', action: 'skipDelivered', deliveryId },
        'Skipping already successful delivery',
      );
      return;
    }

    const { data: endpoint, error: endpointError } = await db
      .from('webhook_endpoints')
      .select('id, url, secret, is_active')
      .eq('id', endpointId)
      .maybeSingle();

    if (endpointError || !endpoint || !endpoint.is_active) {
      await this.mark(
        deliveryId,
        job.attemptsMade + 1,
        'failed',
        null,
        'endpoint inactive or missing',
      );
      return;
    }

    const rawBody = JSON.stringify(delivery.payload);
    const timestamp = new Date().toISOString();
    const headers = {
      [WEBHOOK_SIGNATURE_HEADER]: signPayload(endpoint.secret, rawBody),
      [WEBHOOK_EVENT_HEADER]: delivery.event,
      [WEBHOOK_DELIVERY_HEADER]: deliveryId,
      [WEBHOOK_TIMESTAMP_HEADER]: timestamp,
    };

    try {
      const response = await this.http.post(endpoint.url, rawBody, headers);
      const ok = response.status >= 200 && response.status < 300;
      await this.mark(
        deliveryId,
        job.attemptsMade + 1,
        ok ? 'success' : 'failed',
        response.status,
        ok ? null : `HTTP ${response.status}`,
      );
      if (!ok) {
        throw new Error(`Webhook endpoint returned HTTP ${response.status}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('Webhook endpoint returned HTTP')) {
        await this.mark(deliveryId, job.attemptsMade + 1, 'failed', null, message);
      }
      throw error;
    }
  }

  private async mark(
    deliveryId: string,
    attempts: number,
    status: 'success' | 'failed',
    responseCode: number | null,
    lastError: string | null,
  ): Promise<void> {
    const db = this.supabase.getServiceRoleClient();
    await db
      .from('webhook_deliveries')
      .update({
        attempts,
        status,
        response_code: responseCode,
        last_error: lastError,
        updated_at: new Date().toISOString(),
      })
      .eq('id', deliveryId);
  }
}
