import { signPayload, verifySignature } from '../../../../src/modules/webhooks/hmac.util';

describe('webhook HMAC', () => {
  const secret = 'test-secret';
  const body = JSON.stringify({ event: 'loan.status_changed', event_id: 'abc' });

  it('signs with sha256 hex prefix', () => {
    const header = signPayload(secret, body);
    expect(header.startsWith('sha256=')).toBe(true);
    expect(header.length).toBe('sha256='.length + 64);
  });

  it('verifies a matching signature', () => {
    const header = signPayload(secret, body);
    expect(verifySignature(secret, body, header)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const header = signPayload(secret, body);
    expect(verifySignature(secret, body + ' ', header)).toBe(false);
  });

  it('rejects a wrong secret', () => {
    const header = signPayload(secret, body);
    expect(verifySignature('other', body, header)).toBe(false);
  });

  it('rejects empty header', () => {
    expect(verifySignature(secret, body, '')).toBe(false);
  });
});
