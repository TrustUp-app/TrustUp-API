import { Queue } from 'bullmq';
import { WebhookDispatchService } from '../../../../src/jobs/webhook-delivery/webhook-dispatch.service';
import { SupabaseService } from '../../../../src/database/supabase.client';

interface DeliveryRow {
  id: string;
  endpoint_id: string;
  event_id: string;
  event: string;
  payload: unknown;
  status: string;
  attempts: number;
  updated_at: string;
}

function createFakeDb(endpoints: { id: string; events: string[]; is_active: boolean }[]) {
  const deliveries: DeliveryRow[] = [];
  let nextId = 1;

  const db = {
    from(table: string) {
      if (table === 'webhook_endpoints') {
        return {
          select: () => ({
            eq: () => ({
              eq: async () => ({ data: endpoints, error: null }),
            }),
          }),
        };
      }

      if (table === 'webhook_deliveries') {
        return {
          insert: (row: Omit<DeliveryRow, 'id'>) => ({
            select: () => ({
              maybeSingle: async () => {
                const exists = deliveries.some(
                  (d) => d.endpoint_id === row.endpoint_id && d.event_id === row.event_id,
                );
                if (exists) {
                  return { data: null, error: { code: '23505', message: 'duplicate key' } };
                }
                const created: DeliveryRow = { id: `d${nextId++}`, ...row };
                deliveries.push(created);
                return { data: { id: created.id, status: created.status }, error: null };
              },
            }),
          }),
          select: () => ({
            eq: (_col1: string, endpointId: string) => ({
              eq: (_col2: string, eventId: string) => ({
                maybeSingle: async () => {
                  const found = deliveries.find(
                    (d) => d.endpoint_id === endpointId && d.event_id === eventId,
                  );
                  return {
                    data: found ? { id: found.id, status: found.status } : null,
                    error: null,
                  };
                },
              }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { db, deliveries };
}

describe('WebhookDispatchService', () => {
  const transition = {
    loanId: 'loan-1',
    merchantId: 'merchant-1',
    userWallet: 'GWALLET',
    previousStatus: 'active',
    status: 'defaulted',
  };

  it('creates two separate deliveries when an identical transition repeats after the first succeeded', async () => {
    const endpoint = { id: 'ep1', events: ['loan.status_changed'], is_active: true };
    const { db, deliveries } = createFakeDb([endpoint]);
    const supabase = { getServiceRoleClient: () => db } as unknown as SupabaseService;
    const queue = { add: jest.fn() } as unknown as Queue;
    const service = new WebhookDispatchService(queue, supabase);

    // active -> defaulted -> active -> defaulted
    await service.enqueueLoanStatusChange(transition);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].event_id).toBe('loan-1:active:defaulted');

    // Simulate the webhook-delivery processor completing the first delivery.
    deliveries[0].status = 'success';

    await service.enqueueLoanStatusChange({
      ...transition,
      previousStatus: 'defaulted',
      status: 'active',
    });
    await service.enqueueLoanStatusChange(transition);

    const defaultedDeliveries = deliveries.filter((d) =>
      d.event_id.startsWith('loan-1:active:defaulted'),
    );
    expect(defaultedDeliveries).toHaveLength(2);
    expect(defaultedDeliveries.map((d) => d.event_id)).toEqual([
      'loan-1:active:defaulted',
      'loan-1:active:defaulted:1',
    ]);
    expect(queue.add).toHaveBeenCalledTimes(3);
  });

  it('reuses the existing pending delivery on retry instead of creating a duplicate', async () => {
    const endpoint = { id: 'ep1', events: ['loan.status_changed'], is_active: true };
    const { db, deliveries } = createFakeDb([endpoint]);
    const supabase = { getServiceRoleClient: () => db } as unknown as SupabaseService;
    const queue = { add: jest.fn() } as unknown as Queue;
    const service = new WebhookDispatchService(queue, supabase);

    await service.enqueueLoanStatusChange(transition);
    await service.enqueueLoanStatusChange(transition);

    expect(deliveries).toHaveLength(1);
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenNthCalledWith(
      1,
      'deliver',
      expect.objectContaining({ eventId: 'loan-1:active:defaulted' }),
      expect.objectContaining({ jobId: 'ep1:loan-1:active:defaulted' }),
    );
    expect(queue.add).toHaveBeenNthCalledWith(
      2,
      'deliver',
      expect.objectContaining({ eventId: 'loan-1:active:defaulted' }),
      expect.objectContaining({ jobId: 'ep1:loan-1:active:defaulted' }),
    );
  });

  it('does not re-dispatch a transition whose delivery already succeeded', async () => {
    const endpoint = { id: 'ep1', events: ['loan.status_changed'], is_active: true };
    const { db, deliveries } = createFakeDb([endpoint]);
    const supabase = { getServiceRoleClient: () => db } as unknown as SupabaseService;
    const queue = { add: jest.fn() } as unknown as Queue;
    const service = new WebhookDispatchService(queue, supabase);

    await service.enqueueLoanStatusChange(transition);
    deliveries[0].status = 'success';

    // Same exact transition dispatched again immediately (no reactivation in between)
    // still produces a new, distinct delivery — the fix does not special-case this.
    await service.enqueueLoanStatusChange(transition);

    expect(deliveries).toHaveLength(2);
    expect(queue.add).toHaveBeenCalledTimes(2);
  });
});
