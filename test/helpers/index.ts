/**
 * Test helpers and utilities
 *
 * Use this file to export test utilities
 * Example:
 *
 * export const createTestModule = async (providers: any[]) => {
 *   return Test.createTestingModule({ providers }).compile();
 * };
 */

import { Keypair } from 'stellar-sdk';

/**
 * Creates a random Stellar keypair for testing
 */
export const createTestKeypair = () => {
  return Keypair.random();
};

/**
 * Signs a message with a Stellar keypair
 */
export const signMessage = (keypair: Keypair, message: string): string => {
  return keypair.sign(Buffer.from(message)).toString('base64');
};

/**
 * Creates test user data
 */
export const createTestUserData = (overrides?: any) => ({
  walletAddress: createTestKeypair().publicKey(),
  username: `testuser_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  displayName: 'Test User',
  termsAccepted: 'true',
  ...overrides,
});

/**
 * Creates test wallet data
 */
export const createTestWallet = () => {
  return createTestKeypair().publicKey();
};
