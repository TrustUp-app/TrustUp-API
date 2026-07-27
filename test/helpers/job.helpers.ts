import { Job } from 'bullmq';

/** Minimal BullMQ Job mock — processors only read `id`, `name`, and `data`. */
export function createMockJob<T = unknown>(overrides: Partial<Job<T>> = {}): Job<T> {
  return {
    id: 'job-fixture-1',
    name: 'test-job',
    data: {} as T,
    ...overrides,
  } as Job<T>;
}

/**
 * Creates a fluent mock chain mirroring the Supabase client's chaining API:
 * from('table').select().eq().single(), etc. Each method returns `this` by
 * default so chains of arbitrary length don't break; override a specific
 * method with `mockResolvedValue`/`mockResolvedValueOnce` to control the
 * terminal result of a given call.
 */
export function createSupabaseChainMock(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, jest.Mock> = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockResolvedValue({ error: null }),
    update: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockResolvedValue({ error: null }),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue({ data: [], error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
  };
  Object.assign(chain, overrides);
  return chain;
}
