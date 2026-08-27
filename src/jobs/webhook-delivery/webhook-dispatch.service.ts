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
    const baseEventId = `${event.loanId}:${event.previousStatus}:${event.status}`;

    for (const endpoint of targets as { id: string }[]) {
      const result = await this.ensureDelivery(endpoint.id, baseEventId, occurredAt, event);
      if (!result) {
        continue;
      }

      await this.queue.add(
        'deliver',
        {
          deliveryId: result.deliveryId,
          endpointId: endpoint.id,
          eventId: result.eventId,
        } satisfies WebhookJobData,
        {
          attempts: 5,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 200 },
          jobId: `${endpoint.id}:${result.eventId}`,
        },
      );
    }
  }

  /**
   * Finds the next unused occurrence of this transition for this endpoint.
   * A prior 'pending'/'failed' row for a sequence is reused (safe retry of
   * the same delivery attempt); a prior 'success' row means that occurrence
   * was already delivered, so the search advances to the next sequence —
   * this is what lets the same (loanId, previousStatus, status) transition
   * fire a second, distinct delivery if it is ever legitimately repeated.
   */
  private async ensureDelivery(
    endpointId: string,
    baseEventId: string,
    occurredAt: string,
    event: LoanStatusChangeEvent,
  ): Promise<{ deliveryId: string; eventId: string } | null> {
    const db = this.supabase.getServiceRoleClient();
    const MAX_OCCURRENCES = 1000;

    for (let sequence = 0; sequence < MAX_OCCURRENCES; sequence++) {
      const eventId = sequence === 0 ? baseEventId : `${baseEventId}:${sequence}`;
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
        return { deliveryId: data.id as string, eventId };
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

      if (!existing.data) {
        return null;
      }
      if (existing.data.status !== 'success') {
        return { deliveryId: existing.data.id as string, eventId };
      }
      // This occurrence already succeeded — advance to the next sequence.
    }

    this.logger.error(
      {
        context: 'WebhookDispatchService',
        action: 'ensureDelivery',
        endpointId,
        baseEventId,
      },
      'Exceeded max tracked occurrences for a single loan status transition',
    );
    return null;
  }
}
