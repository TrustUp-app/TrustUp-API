import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { NotificationsModule } from '../../../../src/modules/notifications/notifications.module';
import { SupabaseService } from '../../../../src/database/supabase.client';
import { JwtAuthGuard } from '../../../../src/common/guards/jwt-auth.guard';
import { LoanPaymentReminderProcessor } from '../../../../src/jobs/loan-payment-reminder/loan-payment-reminder.processor';

type NotificationRow = {
  id: string;
  user_wallet: string;
  type: string;
  title: string;
  message: string;
  data: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
  updated_at?: string;
};

type LoanRow = {
  id: string;
  loan_id: string;
  user_wallet: string;
  merchant_id: string | null;
  amount: number;
  loan_amount: string;
  next_payment_due: string | null;
  remaining_balance: number;
  term: number;
  status: string;
};

type Row = Record<string, unknown>;
type Filter = { column: string; value: unknown; kind: 'eq' | 'gte' | 'in' | 'notnull' };
type ExecuteMode = 'many' | 'single' | 'maybe';

type QueryResult = {
  data: unknown;
  error: { message: string } | null;
  count: number | null;
};

/**
 * In-memory stand-in for the Supabase tables touched by the notifications flow.
 * Kept intentionally small: it only implements the query shapes the
 * notifications repository and the loan payment reminder processor actually use.
 */
const state = {
  notifications: [] as NotificationRow[],
  loans: [] as LoanRow[],
  merchants: [] as Array<{ id: string; name: string }>,
};

function matchesFilters(row: Row, filters: Filter[]): boolean {
  return filters.every(({ column, value, kind }) => {
    // The reminder processor de-duplicates on the `data->>loan_db_id` JSONB path.
    if (column === 'data->>loan_db_id') {
      const data = row.data as Record<string, unknown> | null | undefined;
      return data?.loan_db_id === value;
    }

    if (kind === 'gte') {
      return new Date(String(row[column])).getTime() >= new Date(String(value)).getTime();
    }

    if (kind === 'in') {
      return (value as unknown[]).includes(row[column]);
    }

    if (kind === 'notnull') {
      return row[column] !== null && row[column] !== undefined;
    }

    return row[column] === value;
  });
}

class FakeQuery implements PromiseLike<QueryResult> {
  private op: 'select' | 'insert' | 'update' = 'select';

  private head = false;

  private selectedAfterWrite = false;

  private readonly filters: Filter[] = [];

  private orderBy: { column: string; ascending: boolean } | null = null;

  private rangeBounds: [number, number] | null = null;

  private payload: Row | null = null;

  constructor(private readonly table: string) {}

  select(_columns?: string, options?: { count?: 'exact'; head?: boolean }): this {
    if (this.op === 'select') {
      this.head = options?.head ?? false;
    } else {
      this.selectedAfterWrite = true;
    }

    return this;
  }

  insert(payload: Row): this {
    this.op = 'insert';
    this.payload = payload;
    return this;
  }

  update(payload: Row): this {
    this.op = 'update';
    this.payload = payload;
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ column, value, kind: 'eq' });
    return this;
  }

  gte(column: string, value: unknown): this {
    this.filters.push({ column, value, kind: 'gte' });
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.filters.push({ column, value: values, kind: 'in' });
    return this;
  }

  not(column: string, operator: string, value: unknown): this {
    this.filters.push({
      column,
      value,
      kind: operator === 'is' && value === null ? 'notnull' : 'eq',
    });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.orderBy = { column, ascending: options?.ascending !== false };
    return this;
  }

  range(from: number, to: number): this {
    this.rangeBounds = [from, to];
    return this;
  }

  single(): Promise<QueryResult> {
    return this.execute('single');
  }

  maybeSingle(): Promise<QueryResult> {
    return this.execute('maybe');
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute('many').then(onfulfilled, onrejected);
  }

  private rows(): Row[] {
    if (this.table === 'notifications') return state.notifications as unknown as Row[];
    if (this.table === 'loans') return state.loans as unknown as Row[];
    if (this.table === 'merchants') return state.merchants as unknown as Row[];
    throw new Error(`Unexpected table in fake Supabase client: ${this.table}`);
  }

  private async execute(mode: ExecuteMode): Promise<QueryResult> {
    const rows = this.rows();
    const matched = rows.filter((row) => matchesFilters(row, this.filters));

    if (this.op === 'insert') {
      const payload = this.payload ?? {};
      const row: Row = {
        id: payload.id ?? `notification-${state.notifications.length + 1}`,
        is_read: false,
        read_at: null,
        created_at: new Date().toISOString(),
        ...payload,
      };

      if (this.table === 'notifications') {
        state.notifications.push(row as unknown as NotificationRow);
      }

      return { data: null, error: null, count: null };
    }

    if (this.op === 'update') {
      for (const row of matched) {
        Object.assign(row, this.payload ?? {});
      }

      return {
        data: this.selectedAfterWrite ? matched.map((row) => ({ id: row.id })) : null,
        error: null,
        count: null,
      };
    }

    const sorted = [...matched];
    if (this.orderBy) {
      const { column, ascending } = this.orderBy;
      sorted.sort((left, right) => {
        const a = String(left[column]);
        const b = String(right[column]);
        if (a === b) return 0;
        return (a > b ? 1 : -1) * (ascending ? 1 : -1);
      });
    }

    if (mode === 'single') {
      if (!sorted[0]) return { data: null, error: { message: 'Not found' }, count: null };
      return { data: { ...sorted[0] }, error: null, count: null };
    }

    if (mode === 'maybe') {
      return { data: sorted[0] ? { ...sorted[0] } : null, error: null, count: null };
    }

    if (this.head) {
      return { data: null, error: null, count: matched.length };
    }

    const windowed = this.rangeBounds
      ? sorted.slice(this.rangeBounds[0], this.rangeBounds[1] + 1)
      : sorted;

    return { data: windowed.map((row) => ({ ...row })), error: null, count: matched.length };
  }
}

describe('Notifications Flow (e2e)', () => {
  let app: NestFastifyApplication;
  let processor: LoanPaymentReminderProcessor;

  const wallet = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';
  const otherWallet = 'GOTHER234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLM';
  const merchantId = 'b1b2c3d4-e5f6-4890-abcd-ef1234567890';
  const authHeaders = { authorization: 'Bearer test.jwt' };

  const mockJwtAuthGuard = {
    canActivate: jest.fn((context: { switchToHttp: () => { getRequest: () => any } }) => {
      const request = context.switchToHttp().getRequest();
      const authHeader = request.headers['authorization'];

      if (!authHeader?.startsWith('Bearer ')) {
        throw new UnauthorizedException('No token provided');
      }

      request.user = { wallet };
      return true;
    }),
  };

  const mockSupabaseClient = {
    from: jest.fn((table: string) => new FakeQuery(table)),
  };

  const mockSupabaseService = {
    getServiceRoleClient: jest.fn(() => mockSupabaseClient),
    getClient: jest.fn(() => mockSupabaseClient),
  };

  function seedNotification(overrides: Partial<NotificationRow> = {}): NotificationRow {
    const index = state.notifications.length;
    const row: NotificationRow = {
      id: `notification-${index + 1}`,
      user_wallet: wallet,
      type: 'loan_reminder',
      title: 'Payment Due Soon',
      message: 'Your loan payment is due in 3 days.',
      data: { loan_id: 'loan-1' },
      is_read: false,
      created_at: new Date(Date.now() - index * 60_000).toISOString(),
      read_at: null,
      ...overrides,
    };

    state.notifications.push(row);
    return row;
  }

  function seedActiveLoanDueInThreeDays(): void {
    const now = new Date();
    const due = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 3, 12, 0, 0),
    );

    state.loans.push({
      id: 'loan-db-1',
      loan_id: 'LOAN-0001',
      user_wallet: wallet,
      merchant_id: merchantId,
      amount: 500,
      loan_amount: '108.0000000',
      next_payment_due: due.toISOString(),
      remaining_balance: 108,
      term: 4,
      status: 'active',
    });
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret';
    process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test-jwt-refresh-secret';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), NotificationsModule],
    })
      .overrideProvider(SupabaseService)
      .useValue(mockSupabaseService)
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    processor = new LoanPaymentReminderProcessor(
      mockSupabaseService as unknown as SupabaseService,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    state.notifications = [];
    state.loans = [];
    state.merchants = [{ id: merchantId, name: 'TechStore' }];
    jest.clearAllMocks();
  });

  it('creates a reminder notification from the scheduled job and exposes it to the user', async () => {
    seedActiveLoanDueInThreeDays();

    await processor.process({} as never);

    expect(state.notifications).toHaveLength(1);
    const created = state.notifications[0];
    expect(created.user_wallet).toBe(wallet);
    expect(created.type).toBe('payment_reminder_3d');
    expect(created.title).toBe('Payment Due in 3 Days');
    expect(created.is_read).toBe(false);

    const listResponse = await app.inject({
      method: 'GET',
      url: '/notifications',
      headers: authHeaders,
    });

    expect(listResponse.statusCode).toBe(200);
    const listBody = listResponse.json();
    expect(listBody.success).toBe(true);
    expect(listBody.unreadCount).toBe(1);
    expect(listBody.pagination).toEqual({ limit: 20, offset: 0, total: 1 });
    expect(listBody.data).toHaveLength(1);
    expect(listBody.data[0]).toMatchObject({
      type: 'payment_reminder_3d',
      title: 'Payment Due in 3 Days',
      isRead: false,
      readAt: null,
    });
    expect(listBody.data[0].data).toMatchObject({
      loan_db_id: 'loan-db-1',
      merchant_name: 'TechStore',
    });
  });

  it('does not create a duplicate reminder when the job runs twice on the same day', async () => {
    seedActiveLoanDueInThreeDays();

    await processor.process({} as never);
    await processor.process({} as never);

    expect(state.notifications).toHaveLength(1);
  });

  it('marks a single notification as read and updates the unread badge', async () => {
    const first = seedNotification();
    seedNotification({ created_at: new Date().toISOString() });

    const readResponse = await app.inject({
      method: 'PATCH',
      url: `/notifications/${first.id}/read`,
      headers: authHeaders,
    });

    expect(readResponse.statusCode).toBe(200);
    expect(readResponse.json()).toEqual({ success: true, updatedCount: 1 });

    const listResponse = await app.inject({
      method: 'GET',
      url: '/notifications',
      headers: authHeaders,
    });

    const listBody = listResponse.json();
    expect(listBody.unreadCount).toBe(1);
    const updated = listBody.data.find((item: { id: string }) => item.id === first.id);
    expect(updated.isRead).toBe(true);
    expect(updated.readAt).not.toBeNull();
  });

  it('is idempotent when marking an already read notification', async () => {
    const notification = seedNotification({ is_read: true, read_at: new Date().toISOString() });

    const response = await app.inject({
      method: 'PATCH',
      url: `/notifications/${notification.id}/read`,
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true, updatedCount: 0 });
  });

  it('marks all unread notifications as read for the authenticated user', async () => {
    seedNotification();
    seedNotification();
    seedNotification({ is_read: true, read_at: new Date().toISOString() });

    const response = await app.inject({
      method: 'PATCH',
      url: '/notifications/read-all',
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true, updatedCount: 2 });

    const listResponse = await app.inject({
      method: 'GET',
      url: '/notifications',
      headers: authHeaders,
    });

    expect(listResponse.json().unreadCount).toBe(0);
  });

  it('filters unread notifications and paginates the result set', async () => {
    seedNotification();
    seedNotification();
    seedNotification({ is_read: true, read_at: new Date().toISOString() });

    const unreadResponse = await app.inject({
      method: 'GET',
      url: '/notifications?unread=true',
      headers: authHeaders,
    });

    expect(unreadResponse.statusCode).toBe(200);
    const unreadBody = unreadResponse.json();
    expect(unreadBody.data).toHaveLength(2);
    expect(unreadBody.pagination.total).toBe(2);
    // The unread count always reflects the whole mailbox, not the filtered page.
    expect(unreadBody.unreadCount).toBe(2);

    const pageResponse = await app.inject({
      method: 'GET',
      url: '/notifications?limit=1&offset=1',
      headers: authHeaders,
    });

    const pageBody = pageResponse.json();
    expect(pageBody.data).toHaveLength(1);
    expect(pageBody.pagination).toEqual({ limit: 1, offset: 1, total: 3 });
  });

  it('rejects cross-user access, unknown ids and unauthenticated reads', async () => {
    const otherUsersNotification = seedNotification({ user_wallet: otherWallet });

    const forbiddenResponse = await app.inject({
      method: 'PATCH',
      url: `/notifications/${otherUsersNotification.id}/read`,
      headers: authHeaders,
    });

    expect(forbiddenResponse.statusCode).toBe(403);
    expect(JSON.stringify(forbiddenResponse.json())).toContain('NOTIFICATION_FORBIDDEN');

    const missingResponse = await app.inject({
      method: 'PATCH',
      url: '/notifications/00000000-0000-4000-8000-000000000000/read',
      headers: authHeaders,
    });

    expect(missingResponse.statusCode).toBe(404);
    expect(JSON.stringify(missingResponse.json())).toContain('NOTIFICATION_NOT_FOUND');

    const unauthenticatedResponse = await app.inject({
      method: 'GET',
      url: '/notifications',
    });

    expect(unauthenticatedResponse.statusCode).toBe(401);
  });

  it('validates list query parameters', async () => {
    const tooLarge = await app.inject({
      method: 'GET',
      url: '/notifications?limit=1000',
      headers: authHeaders,
    });

    expect(tooLarge.statusCode).toBe(400);

    const unknownFilter = await app.inject({
      method: 'GET',
      url: '/notifications?unknown=1',
      headers: authHeaders,
    });

    expect(unknownFilter.statusCode).toBe(400);
  });
});
