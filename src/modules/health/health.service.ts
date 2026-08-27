import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.client';

@Injectable()
export class HealthService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'TrustUp API',
    };
  }

  async checkDatabase() {
    try {
      const client = this.supabaseService.getClient();

      // Test connection by checking auth (this always works if connected)
      const { error } = await client.auth.getSession();

      // If we get here without a critical error, connection is working
      // "Invalid Refresh Token" is expected when no session exists
      if (error && error.message !== 'Invalid Refresh Token' && !error.message.includes('JWT')) {
        throw error;
      }

      return {
        status: 'ok',
        database: 'connected',
        message: 'Successfully connected to Supabase',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'error',
        database: 'disconnected',
        message: 'Failed to connect to Supabase',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
