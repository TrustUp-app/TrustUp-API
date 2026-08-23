import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase.client';

export interface MerchantRecord {
    id: string;
    wallet: string;
    name: string;
    logo: string;
    category: string;
    is_active: boolean;
}

export interface MerchantDetailRecord extends MerchantRecord {
    description: string;
    website: string;
    created_at: string;
    updated_at: string;
}

export interface FindAllMerchantsOptions {
    limit: number;
    offset: number;
    isActive: boolean;
}

export interface FindAllMerchantsResult {
    merchants: MerchantRecord[];
    total: number;
}

/**
 * Encapsulates all Supabase queries for the `merchants` table.
 */
@Injectable()
export class MerchantsRepository {
    constructor(private readonly supabaseService: SupabaseService) { }

    /**
     * Returns a paginated list of merchants filtered by is_active status.
     * Also returns the total count of matching records for pagination metadata.
     */
    async findAll({ limit, offset, isActive }: FindAllMerchantsOptions): Promise<FindAllMerchantsResult> {
        const { data, error, count } = await this.supabaseService
            .getClient()
            .from('merchants')
            .select('id, wallet, name, logo, category, is_active', { count: 'exact' })
            .eq('is_active', isActive)
            .range(offset, offset + limit - 1);

        if (error) {
            throw new InternalServerErrorException({
                code: 'DATABASE_QUERY_ERROR',
                message: error.message,
            });
        }

        return {
            merchants: (data as MerchantRecord[]) ?? [],
            total: count ?? 0,
        };
    }

    /**
     * Returns every active merchant, unpaginated, for leaderboard ranking.
     */
    async findAllActive(): Promise<MerchantRecord[]> {
        const { data, error } = await this.supabaseService
            .getClient()
            .from('merchants')
            .select('id, wallet, name, logo, category, is_active')
            .eq('is_active', true);

        if (error) {
            throw new InternalServerErrorException({
                code: 'DATABASE_QUERY_ERROR',
                message: error.message,
            });
        }

        return (data as MerchantRecord[]) ?? [];
    }

    /**
     * Finds a merchant by its unique ID.
     */
    async findById(id: string): Promise<MerchantDetailRecord | null> {
        const { data, error } = await this.supabaseService
            .getClient()
            .from('merchants')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return null; // Not found
            }
            throw new InternalServerErrorException({
                code: 'DATABASE_QUERY_ERROR',
                message: error.message,
            });
        }

        return data as MerchantDetailRecord;
    }

    /**
     * Finds a merchant by its stellar wallet address.
     */
    async findByWallet(wallet: string): Promise<MerchantDetailRecord | null> {
        const { data, error } = await this.supabaseService
            .getClient()
            .from('merchants')
            .select('*')
            .eq('wallet', wallet)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return null; // Not found
            }
            throw new InternalServerErrorException({
                code: 'DATABASE_QUERY_ERROR',
                message: error.message,
            });
        }

        return data as MerchantDetailRecord;
    }
}
