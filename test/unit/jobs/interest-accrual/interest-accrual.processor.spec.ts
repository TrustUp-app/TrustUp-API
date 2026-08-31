import { Test } from '@nestjs/testing';
import {
  accrueInterest,
  daysBetweenUtc,
  InterestAccrualProcessor,
} from '../../../../src/jobs/interest-accrual/interest-accrual.processor';
import { SupabaseService } from '../../../../src/database/supabase.client';
import { createMockJob, createSupabaseChainMock } from '../../../helpers/job.helpers';

describe('accrueInterest', () => {
  it('computes one day of 10% APR on 365 balance as 0.1', () => {
    expect(accrueInterest(365, 10, 1)).toBe(0.1);
  });

  it('returns 0 for zero days', () => {
    expect(accrueInterest(100, 10, 0)).toBe(0);
  });
});

describe('daysBetweenUtc', () => {
  it('floors full UTC days', () => {
    expect(daysBetweenUtc('2026-08-01T00:00:00.000Z', new Date('2026-08-03T12:00:00.000Z'))).toBe(
      2,
    );
  });
});

describe('InterestAccrualProcessor', () => {
  it('is idempotent when the hourly cursor already exists', async () => {
    const runs = createSupabaseChainMock();
    runs.insert.mockResolvedValue({ error: { code: '23505', message: 'dup' } });
    const client = { from: jest.fn(() => runs) };
    const module = await Test.createTestingModule({
      providers: [
        InterestAccrualProcessor,
        { provide: SupabaseService, useValue: { getServiceRoleClient: () => client } },
      ],
    }).compile();
    await module.get(InterestAccrualProcessor).process(createMockJob());
    expect(client.from).toHaveBeenCalledWith('loan_job_runs');
  });
});
