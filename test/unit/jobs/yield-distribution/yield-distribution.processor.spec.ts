import { Test } from '@nestjs/testing';
import {
  shareOfPool,
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
