import { InternalServerErrorException } from '@nestjs/common';
import { BaseRepository } from '../../../../src/database/repositories/base.repository';
import { SupabaseService } from '../../../../src/database/supabase.client';

class TestRepository extends BaseRepository {
  runThrowOnError(error: { code?: string; message?: string } | null) {
    this.throwOnError(error);
  }
}

describe('BaseRepository.throwOnError', () => {
  const repo = new TestRepository({} as SupabaseService);

  it('does nothing when there is no error', () => {
    expect(() => repo.runThrowOnError(null)).not.toThrow();
  });

  it('throws a 500 with a DATABASE_QUERY_ERROR code when Supabase returns an error', () => {
    expect(() => repo.runThrowOnError({ message: 'connection reset' })).toThrow(
      InternalServerErrorException,
    );

    try {
      repo.runThrowOnError({ message: 'connection reset' });
      fail('expected throwOnError to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(InternalServerErrorException);
      expect((err as InternalServerErrorException).getResponse()).toEqual({
        code: 'DATABASE_QUERY_ERROR',
        message: 'connection reset',
      });
    }
  });
});
