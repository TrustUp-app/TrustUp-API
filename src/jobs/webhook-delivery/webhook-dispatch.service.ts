import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { SupabaseService } from '../../database/supabase.client';

export const WEBHOOK_QUEUE = 'webhook-delivery';
export const LOAN_STATUS_CHANGED = 'loan.status_changed';

export interface LoanStatusChangeEvent {
  loanId: string;
  merchantId: string | null;
  userWallet: string;
  previousStatus: string;
  status: string;
}

export interface WebhookJobData {
  deliveryId: string;
  endpointId: string;
  eventId: string;
}

@Injectable()
export class WebhookDispatchService {
  private readonly logger = new Logger(WebhookDispatchService.name);

  constructor(
    @InjectQueue(WEBHOOK_QUEUE) private readonly queue: Queue,
    private readonly supabase: SupabaseService,
  ) {}

  async enqueueLoanStatusChange(event: LoanStatusChangeEvent): Promise<void> {
    if (!event.merchantId || event.previousStatus === event.status) {
      return;
    }

    const db = this.supabase.getServiceRoleClient();
    const { data: endpoints, error } = await db
      .from('webhook_endpoints')
      .select('id, events, is_active')
      .eq('merchant_id', event.merchantId)
      .eq('is_active', true);

    if (error) {
      this.logger.error(
        {
          context: 'WebhookDispatchService',
          action: 'listEndpoints',
          error: error.message,
        },
        'Failed to load webhook endpoints',
      );
      return;
    }

    const targets = (endpoints ?? []).filter(
      (row: { events?: string[] }) =>
        Array.isArray(row.events) && row.events.includes(LOAN_STATUS_CHANGED),
    );

    const occurredAt = new Date().toISOString();
    const eventId = `${event.loanId}:${event.previousStatus}:${event.status}`;
    const payload = {
      event: LOAN_STATUS_CHANGED,
      event_id: eventId,
      occurred_at: occurredAt,
      data: {
        loan_id: event.loanId,
        merchant_id: event.merchantId,
        user_wallet: event.userWallet,
        previous_status: event.previousStatus,
        status: event.status,
      },
    };

    for (const endpoint of targets as { id: string }[]) {
      const deliveryId = await this.ensureDelivery(endpoint.id, eventId, payload, occurredAt);
      if (!deliveryId) {
        continue;
      }

      await this.queue.add(
        'deliver',
        {
          deliveryId,
          endpointId: endpoint.id,
          eventId,
        } satisfies WebhookJobData,
        {
          attempts: 5,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 200 },
          jobId: `${endpoint.id}:${eventId}`,
        },
      );
    }
  }

  private async ensureDelivery(
    endpointId: string,
    eventId: string,
    payload: Record<string, unknown>,
    occurredAt: string,
  ): Promise<string | null> {
    const db = this.supabase.getServiceRoleClient();
    const { data, error } = await db
      .from('webhook_deliveries')
      .insert({
        endpoint_id: endpointId,
        event_id: eventId,
        event: LOAN_STATUS_CHANGED,
        payload,
        status: 'pending',
        attempts: 0,
        updated_at: occurredAt,
      })
      .select('id, status')
      .maybeSingle();

    if (!error && data?.id) {
      return data.id as string;
    }

    if (error && error.code !== '23505') {
      this.logger.error(
        {
          context: 'WebhookDispatchService',
          action: 'insertDelivery',
          endpointId,
          error: error.message,
        },
        'Failed to persist webhook delivery',
      );
      return null;
    }

    const existing = await db
      .from('webhook_deliveries')
      .select('id, status')
      .eq('endpoint_id', endpointId)
      .eq('event_id', eventId)
      .maybeSingle();

    if (!existing.data || existing.data.status === 'success') {
      return null;
    }
    return existing.data.id as string;
  }
}
