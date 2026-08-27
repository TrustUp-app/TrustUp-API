/**
 * Test fixtures and factories
 *
 * Use this file to export reusable test data factories
 * Example:
 *
 * export const createMockUser = (overrides?: Partial<User>): User => ({
 *   id: '123',
 *   email: 'test@example.com',
 *   ...overrides,
 * });
 */

import { createTestKeypair, signMessage } from '../helpers';

/**
 * Creates a mock nonce response
 */
export const createMockNonceResponse = (overrides?: any) => ({
  nonce: 'a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890',
  expiresAt: new Date(Date.now() + 300000).toISOString(), // 5 minutes from now
  ...overrides,
});

/**
 * Creates a mock verify request with valid signature
 */
export const createMockVerifyRequest = (overrides?: any) => {
  const keypair = createTestKeypair();
  const nonce = 'a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890';
  const signature = signMessage(keypair, nonce);

  return {
    wallet: keypair.publicKey(),
    nonce,
    signature,
    ...overrides,
  };
};

/**
 * Creates a mock auth response
 */
export const createMockAuthResponse = (overrides?: any) => ({
  accessToken: 'mock.access.token',
  refreshToken: 'mock.refresh.token',
  expiresIn: 900,
  tokenType: 'Bearer',
  ...overrides,
});

/**
 * Creates a mock register request
 */
export const createMockRegisterRequest = (overrides?: any) => {
  const keypair = createTestKeypair();

  return {
    walletAddress: keypair.publicKey(),
    username: `testuser_${Date.now()}`,
    displayName: 'Test User',
    termsAccepted: 'true',
    ...overrides,
  };
};
