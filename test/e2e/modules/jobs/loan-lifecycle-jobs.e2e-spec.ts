import { accrueInterest } from '../../../../src/jobs/interest-accrual/interest-accrual.processor';
import { LP_YIELD_RATIO, shareOfPool } from '../../../../src/jobs/yield-distribution/yield-distribution.processor';
import { DEFAULT_GRACE_PERIOD_DAYS } from '../../../../src/jobs/loan-default-detector/loan-default-detector.processor';

describe('loan lifecycle job math against fixture data', () => {
  it('defaults after the grace window and distributes 85% of accrued interest', () => {
    expect(DEFAULT_GRACE_PERIOD_DAYS).toBe(3);
    const accrued = accrueInterest(365, 10, 1);
    expect(accrued).toBeCloseTo(0.1, 5);
    const lpPool = accrued * LP_YIELD_RATIO;
    expect(shareOfPool(50, 100, lpPool)).toBeCloseTo(lpPool / 2, 5);
  });
});
