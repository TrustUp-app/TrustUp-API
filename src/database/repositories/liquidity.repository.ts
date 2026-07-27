import { Injectable } from "@nestjs/common";
import { SupabaseService } from "../supabase.client";

export interface ActiveLoanLiquidityRecord {
  loan_amount: number | string;
  interest_rate: number | string;
}

@Injectable()
export class LiquidityRepository {
  constructor(private readonly supabaseService: SupabaseService) {}

  async findTotalInvested(wallet: string): Promise<number> {
    const { data, error } = await this.supabaseService
      .getServiceRoleClient()
      .from("liquidity_positions")
      .select("deposited_amount")
      .eq("provider_wallet", wallet)
      .maybeSingle();

    if (error || !data) return 0;
    return Number(data.deposited_amount);
  }

  async findActiveLoans(): Promise<ActiveLoanLiquidityRecord[]> {
    const { data, error } = await this.supabaseService
      .getServiceRoleClient()
      .from("loans")
      .select("loan_amount, interest_rate")
      .eq("status", "active");

    if (error) return [];
    return (data ?? []) as ActiveLoanLiquidityRecord[];
  }

  async countInvestors(): Promise<number> {
    const { count, error } = await this.supabaseService
      .getServiceRoleClient()
      .from("liquidity_positions")
      .select("*", { count: "exact", head: true });

    if (error) return 0;
    return count ?? 0;
  }
}
