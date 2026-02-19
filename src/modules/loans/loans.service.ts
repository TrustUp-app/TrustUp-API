import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ReputationService } from '../reputation/reputation.service';
import { MerchantsService } from '../merchants/merchants.service';
import { LoanQuoteRequestDto } from './dto/loan-quote-request.dto';
import { LoanQuoteResponseDto, SchedulePaymentDto } from './dto/loan-quote-response.dto';

const GUARANTEE_RATE = 0.2;
const LOAN_RATE = 1 - GUARANTEE_RATE;

const INTEREST_RATES: Record<string, { min: number; max: number }> = {
  gold: { min: 4, max: 6 },
  silver: { min: 6, max: 8 },
  bronze: { min: 8, max: 10 },
  poor: { min: 10, max: 15 },
};

/** Score thresholds that define each tier's boundaries. */
const TIER_BOUNDS: Record<string, { lower: number; upper: number }> = {
  gold: { lower: 80, upper: 100 },
  silver: { lower: 60, upper: 79 },
  bronze: { lower: 40, upper: 59 },
  poor: { lower: 0, upper: 39 },
};

@Injectable()
export class LoansService {
  private readonly logger = new Logger(LoansService.name);

  constructor(
    private readonly reputationService: ReputationService,
    private readonly merchantsService: MerchantsService,
  ) {}

  /**
   * Calculate a loan quote based on the borrower's reputation and requested terms.
   * No blockchain interaction occurs — this is a read-only projection.
   */
  async calculateLoanQuote(
    wallet: string,
    dto: LoanQuoteRequestDto,
  ): Promise<LoanQuoteResponseDto> {
    const merchant = await this.merchantsService.findById(dto.merchant);
    if (!merchant) {
      throw new NotFoundException({
        code: 'MERCHANT_NOT_FOUND',
        message: `Merchant ${dto.merchant} not found`,
      });
    }
    if (!merchant.isActive) {
      throw new BadRequestException({
        code: 'MERCHANT_INACTIVE',
        message: `Merchant ${merchant.name} is not currently active`,
      });
    }

    const reputation = await this.reputationService.getReputation(wallet);

    if (dto.amount > reputation.maxCredit) {
      throw new BadRequestException({
        code: 'LOAN_EXCEEDS_MAX_CREDIT',
        message: `Amount $${dto.amount} exceeds your maximum credit limit of $${reputation.maxCredit}`,
      });
    }

    const guarantee = this.round(dto.amount * GUARANTEE_RATE);
    const loanAmount = this.round(dto.amount * LOAN_RATE);
    const interestRate = this.calculateInterestRate(reputation.score, reputation.tier);
    const totalRepayment = this.calculateTotalRepayment(loanAmount, interestRate, dto.term);
    const schedule = this.generateSchedule(totalRepayment, dto.term);

    this.logger.log(
      `Quote generated for ${wallet}: $${dto.amount} over ${dto.term}mo at ${interestRate}% APR`,
    );

    return {
      amount: dto.amount,
      guarantee,
      loanAmount,
      interestRate,
      totalRepayment,
      term: dto.term,
      schedule,
    };
  }

  /**
   * Determine the exact interest rate by interpolating within the tier's range.
   * Higher scores within a tier yield rates closer to the tier minimum.
   */
  calculateInterestRate(score: number, tier: string): number {
    const rates = INTEREST_RATES[tier] ?? INTEREST_RATES.poor;
    const bounds = TIER_BOUNDS[tier] ?? TIER_BOUNDS.poor;

    const tierSpan = bounds.upper - bounds.lower;
    if (tierSpan === 0) return rates.max;

    // Position within the tier: 0 = bottom of tier, 1 = top of tier
    const position = Math.min(
      Math.max((score - bounds.lower) / tierSpan, 0),
      1,
    );

    // Higher position → lower rate (better score = better rate)
    const rate = rates.max - position * (rates.max - rates.min);
    return this.round(rate);
  }

  /**
   * Total repayment = principal + simple interest prorated to the term.
   * Formula: loanAmount × (1 + (rate / 100) × (term / 12))
   */
  calculateTotalRepayment(
    loanAmount: number,
    interestRate: number,
    termMonths: number,
  ): number {
    const interest = loanAmount * (interestRate / 100) * (termMonths / 12);
    return this.round(loanAmount + interest);
  }

  /** Divide total repayment evenly across monthly installments. */
  generateSchedule(totalRepayment: number, termMonths: number): SchedulePaymentDto[] {
    const monthlyPayment = this.round(totalRepayment / termMonths);
    const schedule: SchedulePaymentDto[] = [];
    let remaining = totalRepayment;

    const now = new Date();

    for (let i = 1; i <= termMonths; i++) {
      const dueDate = new Date(now);
      dueDate.setMonth(dueDate.getMonth() + i);
      dueDate.setHours(0, 0, 0, 0);

      // Last payment absorbs any rounding difference
      const isLast = i === termMonths;
      const amount = isLast ? this.round(remaining) : monthlyPayment;
      remaining -= amount;

      schedule.push({
        paymentNumber: i,
        amount,
        dueDate: dueDate.toISOString(),
      });
    }

    return schedule;
  }

  /** Round to two decimal places. */
  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
