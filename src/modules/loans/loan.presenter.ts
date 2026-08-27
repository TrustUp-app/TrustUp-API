import { LoanListStatusFilter } from './dto/loan-list-query.dto';
import { LoanListItemDto, LoanListMerchantDto } from './dto/loan-list-response.dto';
import { SchedulePaymentDto } from './dto/loan-quote-response.dto';
import { ReputationTier } from '../reputation/dto/reputation-response.dto';

export interface LoanPaymentRow {
  amount: number | string | null;
}

export interface LoanMerchantRow {
  id: string | null;
  name: string | null;
  logo: string | null;
}

export interface LoanListRow {
  id: string;
  loan_id: string;
  merchant_id: string | null;
  amount: number | string;
  loan_amount: number | string;
  guarantee: number | string;
  interest_rate: number | string;
  total_repayment: number | string;
  remaining_balance: number | string;
  term: number;
  status: LoanListStatusFilter | 'pending';
  next_payment_due: string | null;
  created_at: string;
  completed_at: string | null;
  defaulted_at: string | null;
  merchants?: LoanMerchantRow | LoanMerchantRow[] | null;
  loan_payments?: LoanPaymentRow[] | null;
}

/**
 * Pure formatting/mapping helpers for the loans module — no DI, no I/O.
 * Kept separate from LoansService so the business rules that decide *what*
 * a loan's terms are stay isolated from the code that decides *how* a raw
 * DB row is shaped into an API response.
 */
export class LoanPresenter {
  static roundCurrency(value: number): number {
    return Math.round(value * 100) / 100;
  }

  static normalizeMerchant(loan: LoanListRow): LoanListMerchantDto {
    const merchant = Array.isArray(loan.merchants) ? loan.merchants[0] : loan.merchants;

    return {
      id: merchant?.id ?? loan.merchant_id ?? null,
      name: merchant?.name ?? null,
      logo: merchant?.logo ?? null,
    };
  }

  /**
   * @param schedule - the loan's full repayment schedule, already computed
   *   by LoansService.generateScheduleFromDate (schedule generation is a
   *   business calculation shared with quote creation, so it stays there).
   */
  static mapLoanListItem(loan: LoanListRow, schedule: SchedulePaymentDto[]): LoanListItemDto {
    const totalRepayment = Number(loan.total_repayment);
    const remainingBalance = Number(loan.remaining_balance);
    const totalPaid = LoanPresenter.roundCurrency(Math.max(0, totalRepayment - remainingBalance));

    const paymentIndex = Math.min(
      loan.loan_payments?.length ?? 0,
      Math.max(schedule.length - 1, 0),
    );
    const scheduledNextPayment = schedule[paymentIndex];
    const nextPayment =
      loan.status === LoanListStatusFilter.ACTIVE && remainingBalance > 0
        ? {
            dueDate: loan.next_payment_due ?? scheduledNextPayment?.dueDate ?? null,
            amount:
              scheduledNextPayment != null
                ? LoanPresenter.roundCurrency(
                    Math.min(scheduledNextPayment.amount, remainingBalance),
                  )
                : LoanPresenter.roundCurrency(remainingBalance),
          }
        : { dueDate: null, amount: null };

    return {
      id: loan.id,
      loanId: loan.loan_id,
      amount: Number(loan.amount),
      loanAmount: Number(loan.loan_amount),
      guarantee: Number(loan.guarantee),
      interestRate: Number(loan.interest_rate),
      totalRepayment,
      totalPaid,
      remainingBalance,
      term: loan.term,
      status: loan.status as LoanListStatusFilter,
      merchant: LoanPresenter.normalizeMerchant(loan),
      nextPayment,
      createdAt: loan.created_at,
      completedAt: loan.completed_at,
      defaultedAt: loan.defaulted_at,
    };
  }

  static mapScoreToCreditTier(score: number): { tier: ReputationTier; maxCredit: number } {
    if (score >= 90) {
      return { tier: 'gold', maxCredit: 5000 };
    }

    if (score >= 75) {
      return { tier: 'silver', maxCredit: 3000 };
    }

    if (score >= 60) {
      return { tier: 'bronze', maxCredit: 1500 };
    }

    return { tier: 'poor', maxCredit: 500 };
  }
}
