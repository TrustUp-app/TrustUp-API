import { WebhookDeliveryProcessor } from '../../../../src/jobs/webhook-delivery/webhook-delivery.processor';
import { WebhookHttpClient } from '../../../../src/jobs/webhook-delivery/webhook-http.client';
import { SupabaseService } from '../../../../src/database/supabase.client';
import { createMockJob } from '../../../helpers/job.helpers';
import type { WebhookJobData } from '../../../../src/jobs/webhook-delivery/webhook-dispatch.service';

/**
 * Integration-style processor flow: first HTTP attempt fails, retry succeeds.
 * Uses an in-memory fake of Supabase + HTTP so CI does not need Redis.
 */
describe('webhook delivery retry flow', () => {
  it('marks failed then success across two process() calls', async () => {
    const delivery = {
      id: 'd1',
      status: 'pending',
      event: 'loan.status_changed',
      payload: { event: 'loan.status_changed', event_id: 'loan-1:pending:active' },
    };
    const updates: Record<string, unknown>[] = [];
    const db = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              if (table === 'webhook_deliveries') {
                return { data: delivery, error: null };
              }
              return {
                data: {
                  id: 'e1',
                  url: 'https://merchant.test/hooks',
                  secret: 'secret',
                  is_active: true,
                },
                error: null,
              };
            },
          }),
        }),
        update: (row: Record<string, unknown>) => {
          updates.push(row);
          if (typeof row.status === 'string') {
            delivery.status = row.status;
          }
          return { eq: async () => ({ error: null }) };
        },
      }),
    };

    let calls = 0;
    const http: WebhookHttpClient = {
      post: async () => {
        calls += 1;
        if (calls === 1) {
          return { status: 503, body: 'busy' };
        }
        return { status: 204, body: '' };
      },
    };

    const processor = new WebhookDeliveryProcessor(
      { getServiceRoleClient: () => db } as unknown as SupabaseService,
      http,
    );

    const job = createMockJob<WebhookJobData>({
      data: { deliveryId: 'd1', endpointId: 'e1', eventId: 'loan-1:pending:active' },
      attemptsMade: 0,
    });

    await expect(processor.process(job)).rejects.toThrow('HTTP 503');
    expect(delivery.status).toBe('failed');

    job.attemptsMade = 1;
    await processor.process(job);
    expect(delivery.status).toBe('success');
    expect(calls).toBe(2);
    expect(updates.map((u) => u.status)).toEqual(['failed', 'success']);
  });
});
