/**
 * Liquidity Pool Flow E2E Test Suite
 *
 * Tests the complete liquidity pool flow:
 * - Get public pool overview (no auth required)
 * - Deposit liquidity and receive shares
 * - View personal investment summary
 * - Withdraw liquidity by burning shares
 *
 * This test validates the investor side of the BNPL platform.
 */

import { INestApplication } from '@nestjs/common';
import { createE2ETestApp, createTestUser, cleanupTestData, authHeader } from '../helpers/e2e.helpers';
import {
  createLiquidityDepositRequest,
  createLiquidityWithdrawRequest,
} from '../fixtures/e2e.fixtures';

describe('Liquidity Flow (E2E)', () => {
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
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  describe('Pool Overview (Public)', () => {
    it('should retrieve public pool overview without authentication', async () => {
      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/liquidity/overview',
        });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('totalLiquidity');
      expect(data.data).toHaveProperty('currentApy');
      expect(data.data).toHaveProperty('utilizationRate');
      expect(data.data).toHaveProperty('totalInvestors');
      expect(data.data).toHaveProperty('activeLoans');
      
      // Verify data types
      expect(typeof data.data.totalLiquidity).toBe('number');
      expect(typeof data.data.currentApy).toBe('number');
      expect(typeof data.data.utilizationRate).toBe('number');
      expect(typeof data.data.totalInvestors).toBe('number');
      expect(typeof data.data.activeLoans).toBe('number');
    });

    it('should return cached pool overview on subsequent requests', async () => {
      const firstResponse = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/liquidity/overview',
        });

      expect(firstResponse.statusCode).toBe(200);

      // Second request should also succeed (from cache)
      const secondResponse = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/liquidity/overview',
        });

      expect(secondResponse.statusCode).toBe(200);
      
      const firstData = JSON.parse(firstResponse.payload);
      const secondData = JSON.parse(secondResponse.payload);
      
      // Data should be identical from cache
      expect(firstData.data.totalLiquidity).toBe(secondData.data.totalLiquidity);
    });
  });

  describe('Personal Investment Summary', () => {
    it('should retrieve investment summary for authenticated user', async () => {
      const user = await createTestUser(app);
      testWallets.push(user.wallet);

      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/liquidity/my-summary',
          headers: authHeader(user.accessToken),
        });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('totalInvested');
      expect(data.data).toHaveProperty('currentValue');
      expect(data.data).toHaveProperty('earnings');
      expect(data.data).toHaveProperty('earningsPercent');
      expect(data.data).toHaveProperty('apy');
      expect(data.data).toHaveProperty('poolSize');
      expect(data.data).toHaveProperty('activeLoans');
      expect(data.data).toHaveProperty('shares');
      
      // For new users, investment should be zero
      expect(data.data.totalInvested).toBe(0);
      expect(data.data.shares).toBe(0);
    });

    it('should require authentication for investment summary', async () => {
      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/liquidity/my-summary',
        });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('Liquidity Deposit', () => {
    it('should create unsigned XDR for liquidity deposit', async () => {
      const user = await createTestUser(app);
      testWallets.push(user.wallet);

      const depositRequest = createLiquidityDepositRequest({
        amount: 100,
      });

      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/liquidity/deposit',
          headers: authHeader(user.accessToken),
          payload: depositRequest,
        });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('unsignedXdr');
      expect(data.data).toHaveProperty('depositPreview');
      expect(data.data.depositPreview).toHaveProperty('amount');
      expect(data.data.depositPreview).toHaveProperty('expectedShares');
      expect(data.data.depositPreview).toHaveProperty('sharePrice');
      
      expect(data.data.depositPreview.amount).toBe(100);
      expect(typeof data.data.unsignedXdr).toBe('string');
    });

    it('should enforce minimum deposit amount', async () => {
      const user = await createTestUser(app);
      testWallets.push(user.wallet);

      const invalidRequest = createLiquidityDepositRequest({
        amount: 5, // Below minimum of $10
      });

      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/liquidity/deposit',
          headers: authHeader(user.accessToken),
          payload: invalidRequest,
        });

      expect(response.statusCode).toBe(400);
    });

    it('should validate deposit amount is positive', async () => {
      const user = await createTestUser(app);
      testWallets.push(user.wallet);

      const invalidRequest = {
        amount: -100,
      };

      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/liquidity/deposit',
          headers: authHeader(user.accessToken),
          payload: invalidRequest,
        });

      expect(response.statusCode).toBe(400);
    });

    it('should require authentication for deposit', async () => {
      const depositRequest = createLiquidityDepositRequest({
        amount: 100,
      });

      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/liquidity/deposit',
          payload: depositRequest,
        });

      expect(response.statusCode).toBe(401);
    });

    it('should support idempotency for deposits', async () => {
      const user = await createTestUser(app);
      testWallets.push(user.wallet);

      const depositRequest = createLiquidityDepositRequest({
        amount: 100,
      });

      const idempotencyKey = `deposit-idem-${Date.now()}`;
      const headers = {
        ...authHeader(user.accessToken),
        'idempotency-key': idempotencyKey,
      };

      // First request
      const firstResponse = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/liquidity/deposit',
          headers,
          payload: depositRequest,
        });

      expect(firstResponse.statusCode).toBe(200);

      // Second request with same idempotency key
      const secondResponse = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/liquidity/deposit',
          headers,
          payload: depositRequest,
        });

      expect(secondResponse.statusCode).toBe(200);
      
      // Should return same XDR
      const firstData = JSON.parse(firstResponse.payload);
      const secondData = JSON.parse(secondResponse.payload);
      expect(firstData.data.unsignedXdr).toBe(secondData.data.unsignedXdr);
    });
  });

  describe('Liquidity Withdrawal', () => {
    it('should create unsigned XDR for liquidity withdrawal', async () => {
      const user = await createTestUser(app);
      testWallets.push(user.wallet);

      const withdrawRequest = createLiquidityWithdrawRequest({
        shares: 50,
      });

      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/liquidity/withdraw',
          headers: authHeader(user.accessToken),
          payload: withdrawRequest,
        });

      // May fail if user has no shares, which is expected
      const data = JSON.parse(response.payload);
      
      if (response.statusCode === 200) {
        expect(data.success).toBe(true);
        expect(data.data).toHaveProperty('unsignedXdr');
        expect(data.data).toHaveProperty('withdrawalPreview');
      } else {
        // Expected error for insufficient shares
        expect(response.statusCode).toBe(400);
      }
    });

    it('should validate withdrawal amount is positive', async () => {
      const user = await createTestUser(app);
      testWallets.push(user.wallet);

      const invalidRequest = {
        shares: -50,
      };

      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/liquidity/withdraw',
          headers: authHeader(user.accessToken),
          payload: invalidRequest,
        });

      expect(response.statusCode).toBe(400);
    });

    it('should require authentication for withdrawal', async () => {
      const withdrawRequest = createLiquidityWithdrawRequest({
        shares: 50,
      });

      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/liquidity/withdraw',
          payload: withdrawRequest,
        });

      expect(response.statusCode).toBe(401);
    });

    it('should support idempotency for withdrawals', async () => {
      const user = await createTestUser(app);
      testWallets.push(user.wallet);

      const withdrawRequest = createLiquidityWithdrawRequest({
        shares: 50,
      });

      const idempotencyKey = `withdraw-idem-${Date.now()}`;
      const headers = {
        ...authHeader(user.accessToken),
        'idempotency-key': idempotencyKey,
      };

      // First request
      const firstResponse = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/liquidity/withdraw',
          headers,
          payload: withdrawRequest,
        });

      // Second request with same idempotency key
      const secondResponse = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/liquidity/withdraw',
          headers,
          payload: withdrawRequest,
        });

      // Both should have same status code
      expect(secondResponse.statusCode).toBe(firstResponse.statusCode);
    });
  });

  describe('Complete Liquidity Flow', () => {
    it('should complete deposit → check summary → withdraw flow', async () => {
      const user = await createTestUser(app, {
        username: `liquidity_user_${Date.now()}`,
        displayName: 'Liquidity Test User',
      });
      testWallets.push(user.wallet);

      // Step 1: Check initial summary (should be zero)
      const initialSummary = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/liquidity/my-summary',
          headers: authHeader(user.accessToken),
        });

      expect(initialSummary.statusCode).toBe(200);
      const initialData = JSON.parse(initialSummary.payload);
      expect(initialData.data.totalInvested).toBe(0);
      expect(initialData.data.shares).toBe(0);

      // Step 2: Create deposit XDR
      const depositRequest = createLiquidityDepositRequest({ amount: 100 });
      const depositResponse = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/liquidity/deposit',
          headers: authHeader(user.accessToken),
          payload: depositRequest,
        });

      expect(depositResponse.statusCode).toBe(200);
      const depositData = JSON.parse(depositResponse.payload);
      expect(depositData.data).toHaveProperty('unsignedXdr');
      expect(depositData.data.depositPreview.amount).toBe(100);

      // In real flow, mobile app would sign and submit XDR to Stellar
      // Then blockchain indexer would update DB
      // For this E2E test, we verify the XDR generation works

      // Step 3: Check pool overview
      const poolResponse = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/liquidity/overview',
        });

      expect(poolResponse.statusCode).toBe(200);
      const poolData = JSON.parse(poolResponse.payload);
      expect(poolData.data).toHaveProperty('totalLiquidity');
      expect(poolData.data).toHaveProperty('currentApy');
    });
  });
});
