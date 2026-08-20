import { ForbiddenException } from '@nestjs/common';
import { WebhooksService } from '../../../../src/modules/webhooks/webhooks.service';

describe('WebhooksService.create', () => {
  it('rejects non-merchant wallets', async () => {
    const merchants = { findByWallet: jest.fn().mockResolvedValue(null) };
    const supabase = { getServiceRoleClient: jest.fn() };
    const svc = new WebhooksService(supabase as never, merchants as never);
    await expect(
      svc.create('GABC', { url: 'https://example.test/hook' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
