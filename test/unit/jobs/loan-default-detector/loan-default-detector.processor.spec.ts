import { Test } from '@nestjs/testing';
import { LoanDefaultDetectorProcessor } from '../../../../src/jobs/loan-default-detector/loan-default-detector.processor';
import { CreditLineContractClient } from '../../../../src/blockchain/contracts/credit-line-contract.client';
import { SupabaseService } from '../../../../src/database/supabase.client';
import { createMockJob, createSupabaseChainMock } from '../../../helpers/job.helpers';

describe('LoanDefaultDetectorProcessor', () => {
  it('marks overdue active loans defaulted and triggers on-chain default', async () => {
    const runsChain = createSupabaseChainMock();
    runsChain.insert.mockResolvedValue({ error: null });
    const loansChain = createSupabaseChainMock();
    loansChain.lt.mockResolvedValue({
      data: [{ id: '1', loan_id: 'L1', user_wallet: 'G1', status: 'active', next_payment_due: '2026-01-01' }],
      error: null,
    });
    loansChain.update.mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      }),
    });
    const client = {
      from: jest.fn((table: string) => (table === 'loan_job_runs' ? runsChain : loansChain)),
    };
    const creditLine = { markDefault: jest.fn().mockResolvedValue({ submitted: false }) };

    const module = await Test.createTestingModule({
      providers: [
        LoanDefaultDetectorProcessor,
        { provide: SupabaseService, useValue: { getServiceRoleClient: () => client } },
        { provide: CreditLineContractClient, useValue: creditLine },
      ],
    }).compile();

    await module.get(LoanDefaultDetectorProcessor).process(createMockJob());
    expect(creditLine.markDefault).toHaveBeenCalledWith('L1');
  });

  it('skips when the daily run was already claimed', async () => {
    const runsChain = createSupabaseChainMock();
    runsChain.insert.mockResolvedValue({ error: { code: '23505', message: 'duplicate' } });
    const client = { from: jest.fn(() => runsChain) };
    const creditLine = { markDefault: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        LoanDefaultDetectorProcessor,
        { provide: SupabaseService, useValue: { getServiceRoleClient: () => client } },
        { provide: CreditLineContractClient, useValue: creditLine },
      ],
    }).compile();

    await module.get(LoanDefaultDetectorProcessor).process(createMockJob());
    expect(creditLine.markDefault).not.toHaveBeenCalled();
  });

  it('keeps marking remaining loans when markDefault throws', async () => {
    const runsChain = createSupabaseChainMock();
    runsChain.insert.mockResolvedValue({ error: null });
    const loansChain = createSupabaseChainMock();
    loansChain.lt.mockResolvedValue({
      data: [
        { id: '1', loan_id: 'L1', user_wallet: 'G1', status: 'active', next_payment_due: '2026-01-01' },
        { id: '2', loan_id: 'L2', user_wallet: 'G2', status: 'active', next_payment_due: '2026-01-01' },
      ],
      error: null,
    });
    loansChain.update.mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      }),
    });
    const client = {
      from: jest.fn((table: string) => (table === 'loan_job_runs' ? runsChain : loansChain)),
    };
    const creditLine = {
      markDefault: jest
        .fn()
        .mockRejectedValueOnce(new Error('simulation blew up'))
        .mockResolvedValueOnce({ submitted: true }),
    };

    const module = await Test.createTestingModule({
      providers: [
        LoanDefaultDetectorProcessor,
        { provide: SupabaseService, useValue: { getServiceRoleClient: () => client } },
        { provide: CreditLineContractClient, useValue: creditLine },
      ],
    }).compile();

    await expect(
      module.get(LoanDefaultDetectorProcessor).process(createMockJob()),
    ).resolves.toBeUndefined();
    expect(creditLine.markDefault).toHaveBeenCalledWith('L1');
    expect(creditLine.markDefault).toHaveBeenCalledWith('L2');
  });
});
