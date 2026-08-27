import { Injectable } from '@nestjs/common';
import { BaseRepository } from './base.repository';

export interface MerchantApplicationRecord {
  id: string;
  user_id: string | null;
  wallet: string;
  name: string;
  logo: string | null;
  description: string | null;
  category: string | null;
  website: string | null;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateMerchantApplicationRecord {
  user_id?: string | null;
  wallet: string;
  name: string;
  logo?: string | null;
  description?: string | null;
  category?: string | null;
  website?: string | null;
}

export interface FindAllApplicationsOptions {
  status?: string;
  limit?: number;
  offset?: number;
}

export interface FindAllApplicationsResult {
  applications: MerchantApplicationRecord[];
  total: number;
}

/**
 * Encapsulates Supabase queries for the `merchant_applications` table.
 */
@Injectable()
export class MerchantApplicationsRepository extends BaseRepository {
  /**
   * Creates a new merchant application with status 'pending'.
   */
  async create(record: CreateMerchantApplicationRecord): Promise<MerchantApplicationRecord> {
    const { data, error } = await this.supabaseService
      .getServiceRoleClient()
      .from('merchant_applications')
      .insert({
        user_id: record.user_id ?? null,
        wallet: record.wallet,
        name: record.name,
        logo: record.logo ?? null,
        description: record.description ?? null,
        category: record.category ?? null,
        website: record.website ?? null,
        status: 'pending',
      })
      .select('*')
      .single();

    this.throwOnError(error);
    return data as MerchantApplicationRecord;
  }

  /**
   * Finds a merchant application by its UUID.
   */
  async findById(id: string): Promise<MerchantApplicationRecord | null> {
    const { data, error } = await this.supabaseService
      .getServiceRoleClient()
      .from('merchant_applications')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    this.throwOnError(error);
    return data as MerchantApplicationRecord | null;
  }

  /**
   * Finds the latest pending application for a given wallet address.
   */
  async findPendingByWallet(wallet: string): Promise<MerchantApplicationRecord | null> {
    const { data, error } = await this.supabaseService
      .getServiceRoleClient()
      .from('merchant_applications')
      .select('*')
      .eq('wallet', wallet)
      .eq('status', 'pending')
      .maybeSingle();

    this.throwOnError(error);
    return data as MerchantApplicationRecord | null;
  }

  /**
   * Returns a paginated list of merchant applications, optionally filtered by status.
   */
  async findAll({
    status,
    limit = 20,
    offset = 0,
  }: FindAllApplicationsOptions): Promise<FindAllApplicationsResult> {
    let query = this.supabaseService
      .getServiceRoleClient()
      .from('merchant_applications')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query;
    this.throwOnError(error);

    return {
      applications: (data as MerchantApplicationRecord[]) ?? [],
      total: count ?? 0,
    };
  }

  /**
   * Updates an application's review status (approved or rejected).
   */
  async updateStatus(
    id: string,
    status: 'approved' | 'rejected',
    reviewerId?: string | null,
    rejectionReason?: string | null,
  ): Promise<MerchantApplicationRecord> {
    const { data, error } = await this.supabaseService
      .getServiceRoleClient()
      .from('merchant_applications')
      .update({
        status,
        reviewed_by: reviewerId ?? null,
        reviewed_at: new Date().toISOString(),
        rejection_reason: rejectionReason ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();

    this.throwOnError(error);
    return data as MerchantApplicationRecord;
  }
}
