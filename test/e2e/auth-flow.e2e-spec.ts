/**
 * Authentication Flow E2E Test Suite
 *
 * Tests the complete authentication flow:
 * - User registration with wallet
 * - Nonce generation
 * - Signature verification
 * - JWT token issuance
 * - Token refresh
 * - Logout
 *
 * This test ensures the wallet-based authentication flow works end-to-end
 * using real Stellar keypairs for signing.
 */

import { INestApplication } from '@nestjs/common';
import { Keypair } from 'stellar-sdk';
import { createE2ETestApp, cleanupTestData, createTestUser, authHeader } from '../helpers/e2e.helpers';
import { createTestKeypair, signMessage } from '../helpers';
import { expectedAuthResponseStructure } from '../fixtures/e2e.fixtures';

describe('Auth Flow (E2E)', () => {
  let app: INestApplication;
  let testWallets: string[] = [];

  beforeAll(async () => {
    app = await createE2ETestApp();
  });

  afterAll(async () => {
    await cleanupTestData(app, testWallets);
    await app.close();
  });

  afterEach(async () => {
    // Add delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  describe('User Registration', () => {
    it('should register a new user with wallet address', async () => {
      const keypair = createTestKeypair();
      const wallet = keypair.publicKey();
      const timestamp = Date.now();

      const registerPayload = {
        walletAddress: wallet,
        username: `e2e_user_${timestamp}`,
        displayName: 'E2E Test User',
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

      expect(response.statusCode).toBe(201);
      const data = JSON.parse(response.payload);
      expect(data).toMatchObject(expectedAuthResponseStructure);
      expect(data.accessToken).toBeDefined();
      expect(data.refreshToken).toBeDefined();

      testWallets.push(wallet);
    });

    it('should prevent duplicate wallet registration', async () => {
      const user = await createTestUser(app);
      testWallets.push(user.wallet);

      // Try to register again with same wallet
      const duplicatePayload = {
        walletAddress: user.wallet,
        username: `another_user_${Date.now()}`,
        displayName: 'Another User',
        termsAccepted: 'true',
      };

      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/auth/register',
          payload: duplicatePayload,
        });

      expect(response.statusCode).toBe(409);
    });

    it('should prevent duplicate username registration', async () => {
      const username = `unique_user_${Date.now()}`;
      
      // First registration
      const user1 = await createTestUser(app, { username });
      testWallets.push(user1.wallet);

      // Try to register with same username but different wallet
      const keypair2 = createTestKeypair();
      const duplicatePayload = {
        walletAddress: keypair2.publicKey(),
        username, // Same username
        displayName: 'Another User',
        termsAccepted: 'true',
      };

      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/auth/register',
          payload: duplicatePayload,
        });

      expect(response.statusCode).toBe(409);
    });

    it('should validate registration input', async () => {
      const keypair = createTestKeypair();

      const invalidPayload = {
        walletAddress: keypair.publicKey(),
        username: 'ab', // Too short
        displayName: 'Test',
        termsAccepted: 'false', // Terms not accepted
      };

      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/auth/register',
          payload: invalidPayload,
        });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('Nonce Generation and Verification', () => {
    it('should generate a nonce for wallet authentication', async () => {
      const keypair = createTestKeypair();
      const wallet = keypair.publicKey();

      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/auth/nonce',
          payload: { wallet },
        });

      expect(response.statusCode).toBe(201);
      const data = JSON.parse(response.payload);
      
      // Handle both wrapped and unwrapped responses
      const nonceData = data.data || data;
      
      expect(nonceData).toHaveProperty('nonce');
      expect(nonceData).toHaveProperty('expiresAt');
      expect(nonceData.nonce).toHaveLength(64); // SHA-256 hex string
    });

    it('should verify valid signature and issue JWT tokens', async () => {
      const user = await createTestUser(app);
      testWallets.push(user.wallet);

      expect(user.accessToken).toBeDefined();
      expect(user.refreshToken).toBeDefined();
      expect(typeof user.accessToken).toBe('string');
      expect(typeof user.refreshToken).toBe('string');
    });

    it('should reject invalid signature', async () => {
      const keypair = createTestKeypair();
      const wallet = keypair.publicKey();

      // Get nonce
      const nonceResponse = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/auth/nonce',
          payload: { wallet },
        });

      const nonceData = JSON.parse(nonceResponse.payload);
      const nonce = nonceData.data?.nonce || nonceData.nonce;

      // Sign with wrong keypair
      const wrongKeypair = createTestKeypair();
      const invalidSignature = signMessage(wrongKeypair, nonce);

      const verifyResponse = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/auth/verify',
          payload: {
            wallet,
            nonce,
            signature: invalidSignature,
          },
        });

      expect(verifyResponse.statusCode).toBe(401);
    });

    it('should reject expired nonce', async () => {
      const keypair = createTestKeypair();
      const wallet = keypair.publicKey();

      // Use an expired/non-existent nonce
      const expiredNonce = 'a'.repeat(64);
      const signature = signMessage(keypair, expiredNonce);

      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/auth/verify',
          payload: {
            wallet,
            nonce: expiredNonce,
            signature,
          },
        });

      expect(response.statusCode).toBe(401);
    });

    it('should prevent nonce reuse', async () => {
      const keypair = createTestKeypair();
      const wallet = keypair.publicKey();

      // Get nonce
      const nonceResponse = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/auth/nonce',
          payload: { wallet },
        });

      const nonceData = JSON.parse(nonceResponse.payload);
      const nonce = nonceData.data?.nonce || nonceData.nonce;
      const signature = signMessage(keypair, nonce);

      // First verification
      const firstVerify = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/auth/verify',
          payload: { wallet, nonce, signature },
        });

      expect(firstVerify.statusCode).toBe(200);

      // Try to reuse same nonce
      const secondVerify = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/auth/verify',
          payload: { wallet, nonce, signature },
        });

      expect(secondVerify.statusCode).toBe(401);

      testWallets.push(wallet);
    });
  });

  describe('Token Refresh and Logout', () => {
    it('should refresh access token using refresh token', async () => {
      const user = await createTestUser(app);
      testWallets.push(user.wallet);

      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/auth/refresh',
          payload: {
            refreshToken: user.refreshToken,
          },
        });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      
      const tokenData = data.data || data;
      
      expect(tokenData).toMatchObject(expectedAuthResponseStructure);
      expect(tokenData.accessToken).toBeDefined();
      expect(tokenData.refreshToken).toBeDefined();
      
      // New tokens should be different
      expect(tokenData.accessToken).not.toBe(user.accessToken);
      expect(tokenData.refreshToken).not.toBe(user.refreshToken);
    });

    it('should reject invalid refresh token', async () => {
      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/auth/refresh',
          payload: {
            refreshToken: 'invalid.refresh.token',
          },
        });

      expect(response.statusCode).toBe(401);
    });

    it('should logout and invalidate refresh token', async () => {
      const user = await createTestUser(app);
      testWallets.push(user.wallet);

      // Logout
      const logoutResponse = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'DELETE',
          url: '/auth/logout',
          payload: {
            refreshToken: user.refreshToken,
          },
        });

      expect(logoutResponse.statusCode).toBe(204);

      // Try to refresh with logged out token
      const refreshResponse = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/auth/refresh',
          payload: {
            refreshToken: user.refreshToken,
          },
        });

      expect(refreshResponse.statusCode).toBe(401);
    });
  });

  describe('JWT Authentication', () => {
    it('should access protected endpoints with valid JWT', async () => {
      const user = await createTestUser(app);
      testWallets.push(user.wallet);

      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/loans/available-credit',
          headers: authHeader(user.accessToken),
        });

      expect(response.statusCode).toBe(200);
    });

    it('should reject requests without JWT', async () => {
      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/loans/available-credit',
        });

      expect(response.statusCode).toBe(401);
    });

    it('should reject requests with invalid JWT', async () => {
      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/loans/available-credit',
          headers: authHeader('invalid.jwt.token'),
        });

      expect(response.statusCode).toBe(401);
    });
  });
});
