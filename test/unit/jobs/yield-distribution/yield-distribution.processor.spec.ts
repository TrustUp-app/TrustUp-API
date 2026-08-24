import { Test } from '@nestjs/testing';
import {
  LP_YIELD_RATIO,
  shareOfPool,
  undistributedInterest,
  YieldDistributionProcessor,
} from '../../../../src/jobs/yield-distribution/yield-distribution.processor';
import { SupabaseService } from '../../../../src/database/supabase.client';
import { createMockJob, createSupabaseChainMock } from '../../../helpers/job.helpers';

describe('shareOfPool', () => {
  it('splits yield by share weight', () => {
    expect(shareOfPool(25, 100, 80)).toBe(20);
  });

  it('returns 0 when the pool is empty', () => {
    expect(shareOfPool(10, 0, 80)).toBe(0);
  });
});

describe('undistributedInterest', () => {
  it('returns the full accrued amount when nothing was distributed', () => {
    expect(undistributedInterest(100, 0)).toBe(100);
  });

  it('returns 0 when the checkpoint matches accrued interest', () => {
    expect(undistributedInterest(100, 100)).toBe(0);
  });

  it('returns only the delta since the last checkpoint', () => {
    expect(undistributedInterest(120, 100)).toBe(20);
  });

  it('never goes negative', () => {
    expect(undistributedInterest(80, 100)).toBe(0);
  });
});

describe('yield is not paid twice', () => {
  it('second day only distributes 85 percent of new interest', () => {
    const day1 = undistributedInterest(100, 0) * LP_YIELD_RATIO;
    const day2 = undistributedInterest(120, 100) * LP_YIELD_RATIO;
    expect(day1).toBeCloseTo(85);
    expect(day2).toBeCloseTo(17);
    expect(day1 + day2).toBeCloseTo(102);
  });
});

describe('YieldDistributionProcessor', () => {
  it('skips a second run on the same UTC day', async () => {
    const runs = createSupabaseChainMock();
    runs.insert.mockResolvedValue({ error: { code: '23505', message: 'dup' } });
    const client = { from: jest.fn(() => runs) };
    const module = await Test.createTestingModule({
      providers: [
        YieldDistributionProcessor,
        { provide: SupabaseService, useValue: { getServiceRoleClient: () => client } },
      ],
    }).compile();
    await module.get(YieldDistributionProcessor).process(createMockJob());
    expect(client.from).toHaveBeenCalledWith('loan_job_runs');
  });
});
