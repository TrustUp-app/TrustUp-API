/**
 * E2E Test Helpers
 *
 * Utilities for end-to-end testing including test app setup,
 * authentication helpers, and cleanup utilities.
 */

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../../src/app.module';
import { Keypair } from 'stellar-sdk';
import { signMessage } from './index';

/**
 * Creates a NestJS E2E test application with Fastify adapter
 */
export async function createE2ETestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication(
    new FastifyAdapter(),
  );

  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return app;
}

/**
 * Generates authentication tokens for E2E tests
 * Goes through the complete auth flow: nonce → verify → tokens
 */
export async function authenticateUser(
  app: INestApplication,
  keypair: Keypair,
): Promise<{ accessToken: string; refreshToken: string; wallet: string }> {
  const wallet = keypair.publicKey();

  // Step 1: Get nonce
  const nonceResponse = await app
    .getHttpAdapter()
    .getInstance()
    .inject({
      method: 'POST',
      url: '/auth/nonce',
      payload: { wallet },
    });

  const { nonce } = JSON.parse(nonceResponse.payload).data || JSON.parse(nonceResponse.payload);

  // Step 2: Sign nonce
  const signature = signMessage(keypair, nonce);

  // Step 3: Verify and get tokens
  const verifyResponse = await app
    .getHttpAdapter()
    .getInstance()
    .inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { wallet, nonce, signature },
    });

  const authData = JSON.parse(verifyResponse.payload).data || JSON.parse(verifyResponse.payload);

  return {
    accessToken: authData.accessToken,
    refreshToken: authData.refreshToken,
    wallet,
  };
}

/**
 * Creates a test user with complete registration
 */
export async function createTestUser(
  app: INestApplication,
  overrides?: { username?: string; displayName?: string },
): Promise<{ keypair: Keypair; wallet: string; accessToken: string; refreshToken: string }> {
  const keypair = Keypair.random();
  const wallet = keypair.publicKey();
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);

  const registerPayload = {
    walletAddress: wallet,
    username: overrides?.username || `testuser_${timestamp}_${random}`,
    displayName: overrides?.displayName || 'E2E Test User',
    termsAccepted: 'true',
  };

  const response = await app
    .getHttpAdapter()
    .getInstance()
    .inject({
      method: 'POST',
      url: '/auth/register',
      payload: registerPayload,
    });

  const authData = JSON.parse(response.payload).data || JSON.parse(response.payload);

  return {
    keypair,
    wallet,
    accessToken: authData.accessToken,
    refreshToken: authData.refreshToken,
  };
}

/**
 * Cleans up test data from Supabase
 * Removes users, loans, notifications, and related records
 */
export async function cleanupTestData(
  app: INestApplication,
  wallets: string[],
): Promise<void> {
  if (wallets.length === 0) return;

  const configService = app.get(ConfigService);
  const { createClient } = await import('@supabase/supabase-js');
  
  const supabase = createClient(
    configService.get<string>('SUPABASE_URL')!,
    configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Delete in order to respect foreign key constraints
  for (const wallet of wallets) {
    // Delete notifications
    await supabase.from('notifications').delete().eq('wallet_address', wallet);
    
    // Delete loan payments
    const { data: loans } = await supabase
      .from('loans')
      .select('id')
      .eq('borrower_address', wallet);
    
    if (loans && loans.length > 0) {
      const loanIds = loans.map((l) => l.id);
      await supabase.from('loan_payments').delete().in('loan_id', loanIds);
      await supabase.from('loans').delete().eq('borrower_address', wallet);
    }

    // Delete refresh tokens (sessions)
    await supabase.from('refresh_tokens').delete().eq('wallet_address', wallet);

    // Delete nonces
    await supabase.from('auth_nonces').delete().eq('wallet_address', wallet);

    // Delete user profile
    await supabase.from('user_profiles').delete().eq('wallet_address', wallet);
  }
}

/**
 * Mock Stellar SDK methods for E2E tests
 * This allows tests to run without actual blockchain interactions
 */
export function mockStellarSDK() {
  const mockTransactionBuilder = {
    addOperation: jest.fn().mockReturnThis(),
    setTimeout: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue({
      toXDR: jest.fn().mockReturnValue('mock-xdr-string'),
    }),
  };

  const mockServer = {
    loadAccount: jest.fn().mockResolvedValue({
      sequenceNumber: jest.fn().mockReturnValue('1234567890'),
      accountId: jest.fn().mockReturnValue('GTEST...'),
    }),
    submitTransaction: jest.fn().mockResolvedValue({
      hash: 'mock-transaction-hash',
      successful: true,
      ledger: 12345,
    }),
  };

  const mockSorobanRpc = {
    getContractData: jest.fn().mockResolvedValue({
      val: { value: 'mock-contract-data' },
    }),
    simulateTransaction: jest.fn().mockResolvedValue({
      cost: { cpuInsns: '1000', memBytes: '1000' },
      results: [{ xdr: 'mock-result-xdr' }],
    }),
  };

  return {
    mockTransactionBuilder,
    mockServer,
    mockSorobanRpc,
  };
}

/**
 * Creates a mock Stellar service for testing
 * Use this to inject mock Stellar SDK behavior into tests
 */
export function createMockStellarService() {
  return {
    buildTransaction: jest.fn().mockResolvedValue({
      unsignedXdr: 'mock-unsigned-xdr',
      hash: 'mock-tx-hash',
    }),
    submitTransaction: jest.fn().mockResolvedValue({
      hash: 'mock-submitted-hash',
      status: 'success',
      ledger: 12345,
    }),
    getTransactionStatus: jest.fn().mockResolvedValue({
      status: 'success',
      successful: true,
    }),
    loadAccount: jest.fn().mockResolvedValue({
      sequenceNumber: '1234567890',
      balances: [],
    }),
  };
}

/**
 * Creates a mock Soroban service for testing
 */
export function createMockSorobanService() {
  return {
    invokeContract: jest.fn().mockResolvedValue({
      result: 'mock-result',
      cost: { cpu: 1000, memory: 1000 },
    }),
    simulateTransaction: jest.fn().mockResolvedValue({
      cost: { cpuInsns: '1000', memBytes: '1000' },
      results: [{ xdr: 'mock-result-xdr' }],
    }),
    getContractData: jest.fn().mockResolvedValue({
      value: 'mock-contract-data',
    }),
  };
}

/**
 * Waits for a condition to be true with timeout
 * Useful for async operations like job processing
 */
export async function waitFor(
  condition: () => Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100,
): Promise<void> {
  const start = Date.now();
  
  while (Date.now() - start < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  
  throw new Error(`Timeout waiting for condition after ${timeout}ms`);
}

/**
 * Generate a test merchant ID
 * In real E2E tests, this should reference an actual merchant in the test DB
 */
export function getTestMerchantId(): string {
  // This should be replaced with a real merchant ID from test fixtures
  return 'test-merchant-uuid';
}

/**
 * Creates a test merchant in the database
 * Returns the merchant ID for use in loan tests
 */
export async function createTestMerchant(
  app: INestApplication,
  overrides?: {
    name?: string;
    walletAddress?: string;
    category?: string;
    isActive?: boolean;
  },
): Promise<{ id: string; walletAddress: string; name: string }> {
  const configService = app.get(ConfigService);
  const { createClient } = await import('@supabase/supabase-js');
  
  const supabase = createClient(
    configService.get<string>('SUPABASE_URL')!,
    configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const merchantKeypair = Keypair.random();
  const merchantData = {
    wallet_address: overrides?.walletAddress || merchantKeypair.publicKey(),
    name: overrides?.name || `Test Merchant ${Date.now()}`,
    category: overrides?.category || 'electronics',
    is_active: overrides?.isActive ?? true,
  };

  const { data, error } = await supabase
    .from('merchants')
    .insert(merchantData)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create test merchant: ${error.message}`);
  }

  return {
    id: data.id,
    walletAddress: data.wallet_address,
    name: data.name,
  };
}

/**
 * Cleans up test merchants from the database
 */
export async function cleanupTestMerchants(
  app: INestApplication,
  merchantIds: string[],
): Promise<void> {
  if (merchantIds.length === 0) return;

  const configService = app.get(ConfigService);
  const { createClient } = await import('@supabase/supabase-js');
  
  const supabase = createClient(
    configService.get<string>('SUPABASE_URL')!,
    configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Delete merchants
  await supabase.from('merchants').delete().in('id', merchantIds);
}

/**
 * Creates authorization header with Bearer token
 */
export function authHeader(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` };
}
