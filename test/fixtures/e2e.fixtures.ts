/**
 * E2E Test Fixtures
 *
 * Reusable test data and factories for E2E tests
 */

import { Keypair } from 'stellar-sdk';

/**
 * Creates a mock merchant for E2E tests
 */
export const createTestMerchant = (overrides?: any) => ({
  id: overrides?.id || 'test-merchant-uuid',
  name: overrides?.name || 'Test Merchant',
  walletAddress: overrides?.walletAddress || Keypair.random().publicKey(),
  category: overrides?.category || 'electronics',
  isActive: overrides?.isActive ?? true,
  ...overrides,
});

/**
 * Creates mock loan quote request
 */
export const createLoanQuoteRequest = (overrides?: any) => ({
  merchantId: overrides?.merchantId || 'test-merchant-uuid',
  amount: overrides?.amount || 100,
  termDays: overrides?.termDays || 30,
  ...overrides,
});

/**
 * Creates mock loan creation request
 */
export const createLoanRequest = (overrides?: any) => ({
  merchantId: overrides?.merchantId || 'test-merchant-uuid',
  amount: overrides?.amount || 100,
  termDays: overrides?.termDays || 30,
  description: overrides?.description || 'Test loan',
  ...overrides,
});

/**
 * Creates mock loan payment request
 */
export const createLoanPaymentRequest = (overrides?: any) => ({
  amount: overrides?.amount || 50,
  ...overrides,
});

/**
 * Creates mock liquidity deposit request
 */
export const createLiquidityDepositRequest = (overrides?: any) => ({
  amount: overrides?.amount || 100,
  ...overrides,
});

/**
 * Creates mock liquidity withdrawal request
 */
export const createLiquidityWithdrawRequest = (overrides?: any) => ({
  shares: overrides?.shares || 50,
  ...overrides,
});

/**
 * Mock unsigned XDR transaction response
 */
export const mockUnsignedXDR = 'AAAAAgAAAABQMgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

/**
 * Mock Stellar transaction hash
 */
export const mockTransactionHash = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

/**
 * Creates mock notification data
 */
export const createNotificationData = (overrides?: any) => ({
  type: overrides?.type || 'loan_reminder',
  title: overrides?.title || 'Payment Reminder',
  message: overrides?.message || 'Your loan payment is due soon',
  metadata: overrides?.metadata || {},
  ...overrides,
});

/**
 * Mock loan data for tests
 */
export const createMockLoanData = (walletAddress: string, overrides?: any) => ({
  id: overrides?.id || 'loan-uuid',
  borrower_address: walletAddress,
  merchant_id: overrides?.merchantId || 'test-merchant-uuid',
  amount: overrides?.amount || 100,
  interest_rate: overrides?.interestRate || 5.5,
  term_days: overrides?.termDays || 30,
  status: overrides?.status || 'active',
  principal_remaining: overrides?.principalRemaining || 100,
  interest_accrued: overrides?.interestAccrued || 0,
  total_paid: overrides?.totalPaid || 0,
  created_at: new Date().toISOString(),
  due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  ...overrides,
});

/**
 * Expected auth response structure
 */
export const expectedAuthResponseStructure = {
  accessToken: expect.any(String),
  refreshToken: expect.any(String),
  expiresIn: expect.any(Number),
  tokenType: 'Bearer',
};

/**
 * Expected loan quote response structure
 */
export const expectedLoanQuoteStructure = {
  amount: expect.any(Number),
  termDays: expect.any(Number),
  interestRate: expect.any(Number),
  totalInterest: expect.any(Number),
  totalRepayment: expect.any(Number),
  monthlyPayment: expect.any(Number),
};

/**
 * Expected loan creation response structure
 */
export const expectedLoanCreationStructure = {
  loanId: expect.any(String),
  unsignedXdr: expect.any(String),
  expiresAt: expect.any(String),
};

/**
 * Expected notification structure
 */
export const expectedNotificationStructure = {
  id: expect.any(String),
  type: expect.any(String),
  title: expect.any(String),
  message: expect.any(String),
  isRead: expect.any(Boolean),
  createdAt: expect.any(String),
};
