import { Test } from '@nestjs/testing';
import { WebhookDeliveryProcessor } from '../../../../src/jobs/webhook-delivery/webhook-delivery.processor';
import { WebhookHttpClient } from '../../../../src/jobs/webhook-delivery/webhook-http.client';
import { SupabaseService } from '../../../../src/database/supabase.client';
import { createMockJob, createSupabaseChainMock } from '../../../helpers/job.helpers';
import { signPayload, verifySignature } from '../../../../src/modules/webhooks/hmac.util';
import type { WebhookJobData } from '../../../../src/jobs/webhook-delivery/webhook-dispatch.service';

describe('WebhookDeliveryProcessor', () => {
  let processor: WebhookDeliveryProcessor;
  let http: { post: jest.Mock };
  let deliveriesChain: ReturnType<typeof createSupabaseChainMock>;
  let endpointsChain: ReturnType<typeof createSupabaseChainMock>;
  const client = { from: jest.fn() };

  beforeEach(async () => {
    deliveriesChain = createSupabaseChainMock();
    endpointsChain = createSupabaseChainMock();
    client.from.mockImplementation((table: string) =>
      table === 'webhook_deliveries' ? deliveriesChain : endpointsChain,
    );
    http = { post: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        WebhookDeliveryProcessor,
        { provide: SupabaseService, useValue: { getServiceRoleClient: () => client } },
        { provide: WebhookHttpClient, useValue: http },
      ],
    }).compile();

    processor = module.get(WebhookDeliveryProcessor);
  });

  const job = createMockJob<WebhookJobData>({
    data: { deliveryId: 'd1', endpointId: 'e1', eventId: 'loan:pending:active' },
    attemptsMade: 0,
  });

  it('POSTs a signed payload and marks success on 2xx', async () => {
    const payload = { event: 'loan.status_changed', event_id: 'loan:pending:active' };
    deliveriesChain.maybeSingle
      .mockResolvedValueOnce({
        data: { id: 'd1', status: 'pending', event: 'loan.status_changed', payload },
        error: null,
      });
    endpointsChain.maybeSingle.mockResolvedValue({
      data: { id: 'e1', url: 'https://example.test/hook', secret: 's3cret', is_active: true },
      error: null,
    });
    http.post.mockResolvedValue({ status: 200, body: 'ok' });

    await processor.process(job);

    expect(http.post).toHaveBeenCalled();
    const [url, rawBody, headers] = http.post.mock.calls[0];
    expect(url).toBe('https://example.test/hook');
    expect(verifySignature('s3cret', rawBody, headers['x-trustup-signature'])).toBe(true);
    expect(headers['x-trustup-event']).toBe('loan.status_changed');
    expect(deliveriesChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'success', response_code: 200 }),
    );
  });

  it('retries by throwing when the endpoint returns a non-2xx status', async () => {
    deliveriesChain.maybeSingle.mockResolvedValue({
      data: { id: 'd1', status: 'pending', event: 'loan.status_changed', payload: {} },
      error: null,
    });
    endpointsChain.maybeSingle.mockResolvedValue({
      data: { id: 'e1', url: 'https://example.test/hook', secret: 's3cret', is_active: true },
      error: null,
    });
    http.post.mockResolvedValue({ status: 500, body: 'nope' });

    await expect(processor.process(job)).rejects.toThrow('HTTP 500');
    expect(deliveriesChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', response_code: 500 }),
    );
  });

  it('is idempotent for an already successful delivery', async () => {
    deliveriesChain.maybeSingle.mockResolvedValue({
      data: { id: 'd1', status: 'success', event: 'loan.status_changed', payload: {} },
      error: null,
    });

    await processor.process(job);
    expect(http.post).not.toHaveBeenCalled();
  });
});

describe('HMAC retry payload stability', () => {
  it('produces the same signature for the same raw body', () => {
    const body = '{"event":"loan.status_changed"}';
    expect(signPayload('abc', body)).toBe(signPayload('abc', body));
  });
});
