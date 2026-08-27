import { LoanPresenter, LoanListRow } from '../../../../src/modules/loans/loan.presenter';
import { LoanListStatusFilter } from '../../../../src/modules/loans/dto/loan-list-query.dto';
import { SchedulePaymentDto } from '../../../../src/modules/loans/dto/loan-quote-response.dto';

function baseRow(overrides: Partial<LoanListRow> = {}): LoanListRow {
  return {
    id: 'loan-1',
    loan_id: 'L-1',
    merchant_id: 'merchant-1',
    amount: 500,
    loan_amount: 400,
    guarantee: 100,
    interest_rate: 12,
    total_repayment: 440,
    remaining_balance: 220,
    term: 4,
    status: LoanListStatusFilter.ACTIVE,
    next_payment_due: null,
    created_at: '2026-01-01T00:00:00.000Z',
    completed_at: null,
    defaulted_at: null,
    merchants: { id: 'merchant-1', name: 'Acme', logo: 'acme.png' },
    loan_payments: [{ amount: 110 }, { amount: 110 }],
    ...overrides,
  };
}

const schedule: SchedulePaymentDto[] = [
  { paymentNumber: 1, amount: 110, dueDate: '2026-02-01T00:00:00.000Z' },
  { paymentNumber: 2, amount: 110, dueDate: '2026-03-01T00:00:00.000Z' },
  { paymentNumber: 3, amount: 110, dueDate: '2026-04-01T00:00:00.000Z' },
  { paymentNumber: 4, amount: 110, dueDate: '2026-05-01T00:00:00.000Z' },
];

describe('LoanPresenter', () => {
  describe('roundCurrency', () => {
    it('rounds to 2 decimal places', () => {
      expect(LoanPresenter.roundCurrency(10.005)).toBeCloseTo(10.01, 2);
      expect(LoanPresenter.roundCurrency(10.004)).toBeCloseTo(10, 2);
    });
  });

  describe('normalizeMerchant', () => {
    it('unwraps a single-element merchants array', () => {
      const row = baseRow({ merchants: [{ id: 'm1', name: 'Acme', logo: 'l.png' }] });
      expect(LoanPresenter.normalizeMerchant(row)).toEqual({ id: 'm1', name: 'Acme', logo: 'l.png' });
    });

    it('falls back to merchant_id when the relation is missing', () => {
      const row = baseRow({ merchants: null, merchant_id: 'fallback-id' });
      expect(LoanPresenter.normalizeMerchant(row)).toEqual({
        id: 'fallback-id',
        name: null,
        logo: null,
      });
    });
  });

  describe('mapLoanListItem', () => {
    it('computes totalPaid and the next payment for an active loan', () => {
      const result = LoanPresenter.mapLoanListItem(baseRow(), schedule);

      expect(result.totalPaid).toBe(220);
      expect(result.nextPayment.amount).toBe(110);
      expect(result.nextPayment.dueDate).toBe('2026-04-01T00:00:00.000Z');
      expect(result.merchant).toEqual({ id: 'merchant-1', name: 'Acme', logo: 'acme.png' });
    });

    it('reports no next payment for a completed loan', () => {
      const row = baseRow({ status: LoanListStatusFilter.COMPLETED, remaining_balance: 0 });
      const result = LoanPresenter.mapLoanListItem(row, schedule);

      expect(result.nextPayment).toEqual({ dueDate: null, amount: null });
    });

    it('caps the next payment amount at the remaining balance', () => {
      const row = baseRow({ remaining_balance: 50, loan_payments: [] });
      const result = LoanPresenter.mapLoanListItem(row, schedule);

      expect(result.nextPayment.amount).toBe(50);
    });
  });

  describe('mapScoreToCreditTier', () => {
    it.each([
      [95, 'gold', 5000],
      [80, 'silver', 3000],
      [65, 'bronze', 1500],
      [10, 'poor', 500],
    ])('maps score %d to tier %s with max credit %d', (score, tier, maxCredit) => {
      expect(LoanPresenter.mapScoreToCreditTier(score)).toEqual({ tier, maxCredit });
    });
  });
});
