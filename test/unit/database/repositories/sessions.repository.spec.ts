import { SessionsRepository } from '../../../../src/database/repositories/sessions.repository';

function createQuery(result: { data?: unknown; error?: unknown } = {}) {
  const query: Record<string, jest.Mock> = {
    select: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(result),
    then: jest.fn((resolve, reject) => Promise.resolve(result).then(resolve, reject)),
  };
  return query;
}

describe('SessionsRepository', () => {
  const service = { getServiceRoleClient: jest.fn() };

  function setup(result: { data?: unknown; error?: unknown }) {
    const query = createQuery(result);
    const from = jest.fn().mockReturnValue(query);
    service.getServiceRoleClient.mockReturnValue({ from });
    return { query, from, repo: new SessionsRepository(service as any) };
  }

  beforeEach(() => jest.clearAllMocks());

  describe('markRotated', () => {
    it('returns true when the active session was claimed', async () => {
      const { query, from, repo } = setup({ data: [{ id: 's1' }], error: null });

      await expect(repo.markRotated('s1')).resolves.toBe(true);
      expect(from).toHaveBeenCalledWith('sessions');
      expect(query.update).toHaveBeenCalledWith({ revoked_at: expect.any(String) });
      expect(query.eq).toHaveBeenCalledWith('id', 's1');
      // Only an active (not yet rotated/revoked) session can be claimed
      expect(query.is).toHaveBeenCalledWith('revoked_at', null);
    });

    it('returns false when the session was already rotated or revoked', async () => {
      const { repo } = setup({ data: [], error: null });

      await expect(repo.markRotated('s1')).resolves.toBe(false);
    });

    it('throws on database errors', async () => {
      const { repo } = setup({ data: null, error: { message: 'boom' } });

      await expect(repo.markRotated('s1')).rejects.toMatchObject({
        response: { code: 'DATABASE_QUERY_ERROR' },
      });
    });
  });

  describe('revokeFamily', () => {
    it('revokes every still-active session of the family', async () => {
      const { query, repo } = setup({ error: null });

      await repo.revokeFamily('family-1');

      expect(query.update).toHaveBeenCalledWith({ revoked_at: expect.any(String) });
      expect(query.eq).toHaveBeenCalledWith('token_family', 'family-1');
      expect(query.is).toHaveBeenCalledWith('revoked_at', null);
    });
  });

  describe('findActiveByUserId', () => {
    it('returns non-revoked, non-expired sessions of the user', async () => {
      const rows = [{ id: 's1' }];
      const { query, repo } = setup({ data: rows, error: null });

      await expect(repo.findActiveByUserId('user-1')).resolves.toEqual(rows);
      expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
      expect(query.is).toHaveBeenCalledWith('revoked_at', null);
      expect(query.gt).toHaveBeenCalledWith('expires_at', expect.any(String));
      expect(query.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });

    it('returns an empty list when there are no rows', async () => {
      const { repo } = setup({ data: null, error: null });

      await expect(repo.findActiveByUserId('user-1')).resolves.toEqual([]);
    });
  });

  describe('findByIdForUser', () => {
    it('scopes the lookup to the owning user', async () => {
      const { query, repo } = setup({ data: { id: 's1' }, error: null });

      await expect(repo.findByIdForUser('s1', 'user-1')).resolves.toEqual({ id: 's1' });
      expect(query.eq).toHaveBeenCalledWith('id', 's1');
      expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
    });
  });

  describe('revokeAllForUser', () => {
    it('revokes every active session of the user', async () => {
      const { query, repo } = setup({ error: null });

      await repo.revokeAllForUser('user-1');

      expect(query.update).toHaveBeenCalledWith({ revoked_at: expect.any(String) });
      expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
      expect(query.is).toHaveBeenCalledWith('revoked_at', null);
    });
  });
});
