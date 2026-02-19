import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.client';

export interface Merchant {
  id: string;
  wallet: string;
  name: string;
  logo: string;
  category: string;
  isActive: boolean;
}

@Injectable()
export class MerchantsService {
  private readonly logger = new Logger(MerchantsService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Find a merchant by its UUID.
   * Returns null if the merchant does not exist.
   */
  async findById(id: string): Promise<Merchant | null> {
    try {
      const client = this.supabaseService.getClient();
      const { data, error } = await client
        .from('merchants')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) {
        return null;
      }

      return {
        id: data.id,
        wallet: data.wallet,
        name: data.name,
        logo: data.logo,
        category: data.category,
        isActive: data.is_active,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch merchant ${id}: ${error.message}`);
      return null;
    }
  }
}
