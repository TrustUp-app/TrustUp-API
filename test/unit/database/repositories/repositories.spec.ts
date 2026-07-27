import { LiquidityRepository } from '../../../../src/database/repositories/liquidity.repository';
import { LoansRepository } from '../../../../src/database/repositories/loans.repository';
import { NotificationsRepository } from '../../../../src/database/repositories/notifications.repository';
import { TransactionsRepository } from '../../../../src/database/repositories/transactions.repository';

function createQuery(result: { data?: unknown; error?: unknown } = {}) {
  const query: Record<string, jest.Mock> = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockResolvedValue(result),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(result),
    then: jest.fn((resolve, reject) => Promise.resolve(result).then(resolve, reject)),
  };

  return query;
}

describe('repositories', () => {
  const service = {
    getServiceRoleClient: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns a liquidity position total when present', async () => {
    const query = createQuery({ data: { deposited_amount: '125.5' }, error: null });
    service.getServiceRoleClient.mockReturnValue({ from: jest.fn().mockReturnValue(query) });

    await expect(new LiquidityRepository(service as any).findTotalInvested('wallet')).resolves.toBe(125.5);
    expect(query.eq).toHaveBeenCalledWith('provider_wallet', 'wallet');
  });

  it('returns zero when no liquidity position exists', async () => {
    const query = createQuery({ data: null, error: null });
    service.getServiceRoleClient.mockReturnValue({ from: jest.fn().mockReturnValue(query) });

    await expect(new LiquidityRepository(service as any).findTotalInvested('wallet')).resolves.toBe(0);
  });

  it('loads active loan balances for a wallet', async () => {
    const query = createQuery({ data: [{ remaining_balance: '20' }], error: null });
    service.getServiceRoleClient.mockReturnValue({ from: jest.fn().mockReturnValue(query) });

    await expect(new LoansRepository(service as any).findActiveByUser('wallet')).resolves.toEqual([
      { remaining_balance: '20' },
    ]);
    expect(query.eq).toHaveBeenCalledWith('status', 'active');
  });

  it('creates notifications through the service-role client', async () => {
    const query = createQuery({ error: null });
    const from = jest.fn().mockReturnValue(query);
    service.getServiceRoleClient.mockReturnValue({ from });
    const notification = {
      user_wallet: 'wallet',
      type: 'loan_reminder',
      title: 'Payment due',
      message: 'Your payment is due soon.',
      data: {},
      is_read: false,
    };

    await new NotificationsRepository(service as any).create(notification);

    expect(from).toHaveBeenCalledWith('notifications');
    expect(query.insert).toHaveBeenCalledWith(notification);
  });

  it('falls back to transaction_hash when the legacy hash column is absent', async () => {
    const query = createQuery();
    query.maybeSingle
      .mockResolvedValueOnce({ data: null, error: { message: 'column hash does not exist' } })
      .mockResolvedValueOnce({
        data: {
          transaction_hash: 'abc',
          type: 'loan_create',
          status: 'pending',
          submitted_at: '2026-01-01T00:00:00.000Z',
          completed_at: null,
          updated_at: '2026-01-01T00:00:00.000Z',
        },
        error: null,
      });
    service.getServiceRoleClient.mockReturnValue({ from: jest.fn().mockReturnValue(query) });

    await expect(new TransactionsRepository(service as any).findByHash('abc')).resolves.toMatchObject({
      lookupColumn: 'transaction_hash',
      hash: 'abc',
    });
    expect(query.eq).toHaveBeenNthCalledWith(2, 'transaction_hash', 'abc');
  });
});
