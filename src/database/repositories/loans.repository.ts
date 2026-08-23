import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { SupabaseService } from "../supabase.client";

export interface LoanRecord {
  id: string;
  loan_id: string;
  user_wallet: string;
  merchant_id: string | null;
  amount: number | string;
  loan_amount: number | string;
  guarantee: number | string;
  interest_rate: number | string;
  total_repayment: number | string;
  remaining_balance: number | string;
  term: number;
  status: string;
  next_payment_due: string | null;
  created_at: string;
  completed_at: string | null;
  defaulted_at: string | null;
  merchants?: unknown;
  loan_payments?: { amount: number | string | null }[] | null;
}

export interface CreateLoanRecord {
  loan_id: string;
  user_wallet: string;
  merchant_id: string;
  amount: number;
  loan_amount: number;
  guarantee: number;
  interest_rate: number;
  total_repayment: number;
  remaining_balance: number;
  term: number;
  status: "pending";
  next_payment_due: string | null;
  xdr_hash: string;
}

export interface LoanStatusRecord {
  loan_id: string;
  status: string;
}

export interface LoanBalanceRecord {
  remaining_balance: number | string;
  status: string;
}

export interface MerchantLoanStatsRecord {
  merchant_id: string | null;
  loan_amount: number | string;
  remaining_balance: number | string;
  status: string;
  created_at: string;
}

export interface MerchantActiveLoanRecord {
  id: string;
  loan_id: string;
  amount: number | string;
  remaining_balance: number | string;
  status: string;
  next_payment_due: string | null;
  created_at: string;
}

@Injectable()
export class LoansRepository {
  constructor(private readonly supabaseService: SupabaseService) {}

  async findById(
    id: string,
  ): Promise<Pick<
    LoanRecord,
    "id" | "loan_id" | "user_wallet" | "status" | "remaining_balance"
  > | null> {
    const { data, error } = await this.supabaseService
      .getServiceRoleClient()
      .from("loans")
      .select("id, loan_id, user_wallet, status, remaining_balance")
      .eq("id", id)
      .maybeSingle();

    this.throwOnError(error);
    return data as Pick<
      LoanRecord,
      "id" | "loan_id" | "user_wallet" | "status" | "remaining_balance"
    > | null;
  }

  async findByUser(
    wallet: string,
    options: {
      limit: number;
      offset: number;
      status?: string;
      statuses?: string[];
    },
  ): Promise<{ loans: LoanRecord[]; total: number }> {
    let query = this.supabaseService
      .getServiceRoleClient()
      .from("loans")
      .select(
        "id, loan_id, merchant_id, amount, loan_amount, guarantee, interest_rate, total_repayment, remaining_balance, term, status, next_payment_due, created_at, completed_at, defaulted_at, merchants(id, name, logo), loan_payments(amount)",
        { count: "exact" },
      )
      .eq("user_wallet", wallet)
      .order("created_at", { ascending: false })
      .range(options.offset, options.offset + options.limit - 1);

    if (options.status) {
      query = query.eq("status", options.status);
    } else if (options.statuses) {
      query = query.in("status", options.statuses);
    }

    const { data, error, count } = await query;
    this.throwOnError(error);
    return { loans: (data ?? []) as LoanRecord[], total: count ?? 0 };
  }

  async findActiveByUser(
    wallet: string,
  ): Promise<Pick<LoanRecord, "remaining_balance">[]> {
    const { data, error } = await this.supabaseService
      .getServiceRoleClient()
      .from("loans")
      .select("remaining_balance")
      .eq("user_wallet", wallet)
      .eq("status", "active");

    this.throwOnError(error);
    return (data ?? []) as Pick<LoanRecord, "remaining_balance">[];
  }

  async hasPendingWithXdrHash(
    wallet: string,
    xdrHash: string,
  ): Promise<boolean> {
    const { data, error } = await this.supabaseService
      .getServiceRoleClient()
      .from("loans")
      .select("id")
      .eq("user_wallet", wallet)
      .eq("xdr_hash", xdrHash)
      .eq("status", "pending")
      .maybeSingle();

    this.throwOnError(error);
    return data != null;
  }

  async findStatusByLoanIdAndWallet(
    loanId: string,
    userWallet: string,
  ): Promise<LoanStatusRecord | null> {
    const { data, error } = await this.supabaseService
      .getServiceRoleClient()
      .from("loans")
      .select("loan_id, status")
      .eq("loan_id", loanId)
      .eq("user_wallet", userWallet)
      .maybeSingle();

    this.throwOnError(error);
    return data as LoanStatusRecord | null;
  }

  async findBalanceByLoanIdAndWallet(
    loanId: string,
    userWallet: string,
  ): Promise<LoanBalanceRecord | null> {
    const { data, error } = await this.supabaseService
      .getServiceRoleClient()
      .from("loans")
      .select("remaining_balance, status")
      .eq("loan_id", loanId)
      .eq("user_wallet", userWallet)
      .maybeSingle();

    this.throwOnError(error);
    return data as LoanBalanceRecord | null;
  }

  async createLoan(record: CreateLoanRecord): Promise<void> {
    const { error } = await this.supabaseService
      .getServiceRoleClient()
      .from("loans")
      .insert(record);
    if (error?.code === "23505") {
      throw error;
    }
    this.throwOnError(error);
  }

  async updateStatus(
    loanId: string,
    userWallet: string,
    status: string,
    onlyFromStatus?: string,
  ): Promise<void> {
    let query = this.supabaseService
      .getServiceRoleClient()
      .from("loans")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("loan_id", loanId)
      .eq("user_wallet", userWallet);

    if (onlyFromStatus) {
      query = query.eq("status", onlyFromStatus);
    }

    const { error } = await query;
    this.throwOnError(error);
  }

  async updateByLoanIdAndWallet(
    loanId: string,
    userWallet: string,
    values: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await this.supabaseService
      .getServiceRoleClient()
      .from("loans")
      .update(values)
      .eq("loan_id", loanId)
      .eq("user_wallet", userWallet);

    this.throwOnError(error);
  }

  async recordPayment(payment: Record<string, unknown>): Promise<void> {
    const { error } = await this.supabaseService
      .getServiceRoleClient()
      .from("loan_payments")
      .insert(payment);

    this.throwOnError(error);
  }

  /**
   * Returns every loan for a single merchant with only the columns
   * needed for portfolio/analytics/score aggregation.
   */
  async findStatsByMerchant(
    merchantId: string,
  ): Promise<MerchantLoanStatsRecord[]> {
    const { data, error } = await this.supabaseService
      .getServiceRoleClient()
      .from("loans")
      .select("merchant_id, loan_amount, remaining_balance, status, created_at")
      .eq("merchant_id", merchantId);

    this.throwOnError(error);
    return (data ?? []) as MerchantLoanStatsRecord[];
  }

  /**
   * Returns every loan across all merchants with only the columns
   * needed for leaderboard aggregation.
   */
  async findStatsForAllMerchants(): Promise<MerchantLoanStatsRecord[]> {
    const { data, error } = await this.supabaseService
      .getServiceRoleClient()
      .from("loans")
      .select("merchant_id, loan_amount, remaining_balance, status, created_at")
      .not("merchant_id", "is", null);

    this.throwOnError(error);
    return (data ?? []) as MerchantLoanStatsRecord[];
  }

  /**
   * Returns a paginated list of a merchant's active loans for the portfolio endpoint.
   */
  async findActiveByMerchant(
    merchantId: string,
    options: { limit: number; offset: number },
  ): Promise<{ loans: MerchantActiveLoanRecord[]; total: number }> {
    const { data, error, count } = await this.supabaseService
      .getServiceRoleClient()
      .from("loans")
      .select(
        "id, loan_id, amount, remaining_balance, status, next_payment_due, created_at",
        { count: "exact" },
      )
      .eq("merchant_id", merchantId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .range(options.offset, options.offset + options.limit - 1);

    this.throwOnError(error);
    return {
      loans: (data ?? []) as MerchantActiveLoanRecord[],
      total: count ?? 0,
    };
  }

  private throwOnError(error: { code?: string; message?: string } | null): void {
    if (error) {
      throw new InternalServerErrorException({
        code: "DATABASE_QUERY_ERROR",
        message: error.message,
      });
    }
  }
}
