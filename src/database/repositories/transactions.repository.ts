import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { SupabaseService } from "../supabase.client";

export type TransactionLookupColumn = "hash" | "transaction_hash";
export type TransactionStatus = "pending" | "success" | "failed";

export interface TransactionRecord {
  id?: string;
  lookupColumn: TransactionLookupColumn;
  hash: string;
  userWallet?: string;
  type: string | null;
  status: TransactionStatus | null;
  xdr?: string | null;
  submittedAt: string | null;
  completedAt: string | null;
  updatedAt: string | null;
}

@Injectable()
export class TransactionsRepository {
  constructor(private readonly supabaseService: SupabaseService) {}

  async create(record: {
    userWallet: string;
    hash: string;
    type: string;
    xdr: string;
  }): Promise<void> {
    const submittedAt = new Date().toISOString();
    const payloads = [
      {
        transaction_hash: record.hash,
        user_wallet: record.userWallet,
        type: record.type,
        status: "pending",
        xdr: record.xdr,
        submitted_at: submittedAt,
        updated_at: submittedAt,
      },
      {
        hash: record.hash,
        user_wallet: record.userWallet,
        type: record.type,
        status: "pending",
        xdr: record.xdr,
        submitted_at: submittedAt,
        updated_at: submittedAt,
      },
    ];

    let lastError: { message?: string } | null = null;
    for (const payload of payloads) {
      const { error } = await this.supabaseService
        .getServiceRoleClient()
        .from("transactions")
        .insert(payload);
      if (!error) return;
      lastError = error;
      if (!this.isUnknownColumnError(error)) break;
    }

    this.throwOnError(lastError);
  }

  async findByHash(hash: string): Promise<TransactionRecord | null> {
    for (const lookupColumn of [
      "hash",
      "transaction_hash",
    ] as TransactionLookupColumn[]) {
      const { data, error } = await this.supabaseService
        .getServiceRoleClient()
        .from("transactions")
        .select(
          `${lookupColumn}, type, status, submitted_at, completed_at, updated_at`,
        )
        .eq(lookupColumn, hash)
        .maybeSingle();

      if (error) {
        if (this.isUnknownColumnError(error)) continue;
        this.throwOnError(error);
      }
      if (!data) continue;

      const row = data as Record<string, unknown>;
      return {
        lookupColumn,
        hash: String(row[lookupColumn] ?? hash).toLowerCase(),
        type: row.type ? String(row.type) : null,
        status: row.status ? (String(row.status) as TransactionStatus) : null,
        submittedAt: row.submitted_at ? String(row.submitted_at) : null,
        completedAt: row.completed_at ? String(row.completed_at) : null,
        updatedAt: row.updated_at ? String(row.updated_at) : null,
      };
    }

    return null;
  }

  async findPending(limit = 100): Promise<TransactionRecord[]> {
    const { data, error } = await this.supabaseService
      .getServiceRoleClient()
      .from("transactions")
      .select(
        "id, user_wallet, transaction_hash, type, status, xdr, submitted_at, updated_at",
      )
      .eq("status", "pending")
      .order("submitted_at", { ascending: true })
      .limit(limit);

    this.throwOnError(error);
    return (data ?? []).map((row: Record<string, unknown>) => ({
      id: String(row.id),
      lookupColumn: "transaction_hash",
      hash: String(row.transaction_hash),
      userWallet: String(row.user_wallet),
      type: row.type ? String(row.type) : null,
      status: row.status ? (String(row.status) as TransactionStatus) : null,
      xdr: row.xdr ? String(row.xdr) : null,
      submittedAt: row.submitted_at ? String(row.submitted_at) : null,
      completedAt: null,
      updatedAt: row.updated_at ? String(row.updated_at) : null,
    }));
  }

  async updateStatus(
    hash: string,
    status: TransactionStatus,
    values: Record<string, unknown> = {},
    options: {
      lookupColumn?: TransactionLookupColumn;
      onlyPending?: boolean;
      returnRecord?: boolean;
    } = {},
  ): Promise<TransactionRecord | null> {
    const lookupColumn = options.lookupColumn ?? "transaction_hash";
    let query = this.supabaseService
      .getServiceRoleClient()
      .from("transactions")
      .update({ ...values, status })
      .eq(lookupColumn, hash);

    if (options.onlyPending) {
      query = query.eq("status", "pending");
    }

    if (!options.returnRecord) {
      const { error } = await query;
      this.throwOnError(error);
      return null;
    }

    const { data, error } = await query
      .select(
        "id, user_wallet, transaction_hash, type, status, xdr, submitted_at, updated_at",
      )
      .maybeSingle();
    this.throwOnError(error);
    if (!data) return null;

    const row = data as Record<string, unknown>;
    return {
      id: String(row.id),
      lookupColumn,
      hash: String(row.transaction_hash ?? row.hash ?? hash),
      userWallet: String(row.user_wallet),
      type: row.type ? String(row.type) : null,
      status: row.status ? (String(row.status) as TransactionStatus) : null,
      xdr: row.xdr ? String(row.xdr) : null,
      submittedAt: row.submitted_at ? String(row.submitted_at) : null,
      completedAt: null,
      updatedAt: row.updated_at ? String(row.updated_at) : null,
    };
  }

  async deleteOlderThan(threshold: string): Promise<void> {
    const { error } = await this.supabaseService
      .getServiceRoleClient()
      .from("transactions")
      .delete()
      .lt("submitted_at", threshold)
      .neq("status", "pending");

    this.throwOnError(error);
  }

  private isUnknownColumnError(
    error: { message?: string } | null | undefined,
  ): boolean {
    const message = error?.message?.toLowerCase() ?? "";
    return message.includes("column") && message.includes("does not exist");
  }

  private throwOnError(error: { message?: string } | null): void {
    if (error) {
      throw new InternalServerErrorException({
        code: "DATABASE_QUERY_ERROR",
        message: error.message,
      });
    }
  }
}
