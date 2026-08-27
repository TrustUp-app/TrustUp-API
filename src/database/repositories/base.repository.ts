import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase.client';

export interface SupabaseQueryError {
  code?: string;
  message?: string;
}

/**
 * Shared base for Supabase-backed repositories. Every repository was
 * hand-rolling the same "throw a 500 with a DATABASE_QUERY_ERROR code when
 * Supabase returns an error" check — centralizing it here means that
 * behavior only needs to be decided (and tested) once.
 */
@Injectable()
export abstract class BaseRepository {
  constructor(protected readonly supabaseService: SupabaseService) {}

  protected throwOnError(error: SupabaseQueryError | null | undefined): void {
    if (error) {
      throw new InternalServerErrorException({
        code: 'DATABASE_QUERY_ERROR',
        message: error.message,
      });
    }
  }
}
