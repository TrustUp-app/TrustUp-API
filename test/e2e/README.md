# E2E Test Suite

This directory contains end-to-end tests for the TrustUp API that validate complete user flows from authentication through transactions.

## Test Suites

### Core Flow Tests

| Test Suite | File | Coverage | Status |
|------------|------|----------|--------|
| **Auth Flow** | `auth-flow.e2e-spec.ts` | Registration, nonce, verification, JWT refresh, logout | ✅ Complete |
| **BNPL Lifecycle** | `bnpl-lifecycle.e2e-spec.ts` | Loan quote, creation, repayment, listing | ✅ Complete |
| **Liquidity Flow** | `liquidity-flow.e2e-spec.ts` | Pool overview, deposit, withdrawal, shares | ✅ Complete |
| **Notifications Flow** | `notifications-flow.e2e-spec.ts` | List, filter, mark read, unread count | ✅ Complete |

### Module-Specific Tests

Module tests are organized in `test/e2e/modules/<module-name>/` and test individual endpoints:

- `modules/auth/` - Auth module endpoints
- `modules/loans/` - Loan endpoints
- `modules/liquidity/` - Liquidity endpoints
- `modules/merchants/` - Merchant endpoints
- `modules/notifications/` - Notification endpoints
- `modules/reputation/` - Reputation endpoints
- `modules/transactions/` - Transaction endpoints
- `modules/users/` - User profile endpoints
- `modules/webhooks/` - Webhook endpoints
- `modules/health/` - Health check endpoints
- `modules/jobs/` - Background job tests

## Running Tests

### All E2E Tests

```bash
npm run test:e2e
```

### Specific Test Suite

```bash
# Auth flow only
npx jest --config ./test/jest-e2e.json test/e2e/auth-flow.e2e-spec.ts

# BNPL lifecycle only
npx jest --config ./test/jest-e2e.json test/e2e/bnpl-lifecycle.e2e-spec.ts

# Liquidity flow only
npx jest --config ./test/jest-e2e.json test/e2e/liquidity-flow.e2e-spec.ts

# Notifications flow only
npx jest --config ./test/jest-e2e.json test/e2e/notifications-flow.e2e-spec.ts
```

### Watch Mode

```bash
npx jest --config ./test/jest-e2e.json --watch
```

## Prerequisites

Before running E2E tests, ensure:

1. ✅ Test Supabase project is set up
2. ✅ Redis is running (`redis-server` or Docker)
3. ✅ Environment configured (`test/.env.e2e`)
4. ✅ Dependencies installed (`npm install`)

See [E2E Testing Guide](../../docs/setup/e2e-testing.md) for detailed setup instructions.

## Test Structure

### Standard Test Template

```typescript
import { INestApplication } from '@nestjs/common';
import { createE2ETestApp, createTestUser, cleanupTestData, authHeader } from '../helpers/e2e.helpers';

describe('Feature Name (E2E)', () => {
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

  describe('Test Group', () => {
    it('should do something', async () => {
      const user = await createTestUser(app);
      testWallets.push(user.wallet);

      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/endpoint',
          headers: authHeader(user.accessToken),
        });

      expect(response.statusCode).toBe(200);
    });
  });
});
```

## Test Helpers

Located in `test/helpers/e2e.helpers.ts`:

- `createE2ETestApp()` - Creates NestJS test app with Fastify
- `createTestUser()` - Registers and authenticates a test user
- `authenticateUser()` - Gets JWT tokens for existing user
- `cleanupTestData()` - Removes test data from database
- `authHeader()` - Creates Authorization header
- `waitFor()` - Waits for async conditions
- `createTestMerchant()` - Creates test merchant in DB
- `createMockStellarService()` - Mocks Stellar SDK
- `createMockSorobanService()` - Mocks Soroban RPC

## Test Fixtures

Located in `test/fixtures/e2e.fixtures.ts`:

**Request Factories**:
- `createLoanQuoteRequest()` - Loan quote payload
- `createLoanRequest()` - Loan creation payload
- `createLoanPaymentRequest()` - Payment payload
- `createLiquidityDepositRequest()` - Deposit payload
- `createLiquidityWithdrawRequest()` - Withdrawal payload
- `createNotificationData()` - Notification data

**Expected Response Structures**:
- `expectedAuthResponseStructure` - Auth response schema
- `expectedLoanQuoteStructure` - Loan quote schema
- `expectedLoanCreationStructure` - Loan creation schema
- `expectedNotificationStructure` - Notification schema

**Mock Data**:
- `mockUnsignedXDR` - Mock XDR transaction
- `mockTransactionHash` - Mock TX hash
- `createMockLoanData()` - Mock loan record
- `createTestMerchant()` - Mock merchant data

## Coverage Report

### Flow Tests Coverage

| Flow | Endpoints Tested | Coverage |
|------|------------------|----------|
| **Auth** | 8/8 endpoints | 100% |
| **BNPL** | 6/6 endpoints | 100% |
| **Liquidity** | 5/5 endpoints | 100% |
| **Notifications** | 4/4 endpoints | 100% |

### Module Tests Coverage

See individual module test directories for detailed coverage.

## Best Practices

### 1. Test Isolation

Always create unique test data:

```typescript
const username = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
```

### 2. Cleanup

Always register test wallets for cleanup:

```typescript
const user = await createTestUser(app);
testWallets.push(user.wallet); // Critical!
```

### 3. Rate Limiting

Add delays between tests:

```typescript
afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 100));
});
```

### 4. Mocking

Mock Stellar interactions at service boundary:

```typescript
const mockStellar = createMockStellarService();
// Use in test module override
```

### 5. Assertions

Check full response structure:

```typescript
expect(response.statusCode).toBe(200);
const data = JSON.parse(response.payload);
expect(data).toMatchObject(expectedStructure);
expect(data.field).toBeDefined();
```

## Adding New Tests

1. Create test file: `test/e2e/<feature>.e2e-spec.ts`
2. Use standard template (see above)
3. Add fixtures to `test/fixtures/e2e.fixtures.ts`
4. Add helpers to `test/helpers/e2e.helpers.ts` if needed
5. Run and verify: `npx jest --config ./test/jest-e2e.json <your-test>`
6. Update this README with coverage info

## CI/CD Integration

E2E tests run in GitHub Actions after unit tests pass. See:

- [CI Workflow](../../.github/workflows/ci.yml)
- [GitHub Secrets Guide](../../docs/setup/github-secrets.md)

**Required Secrets**:
- `TEST_SUPABASE_URL`
- `TEST_SUPABASE_ANON_KEY`
- `TEST_SUPABASE_SERVICE_KEY`
- `TEST_JWT_SECRET`
- `TEST_JWT_REFRESH_SECRET`

## Troubleshooting

### Common Issues

**"supabaseUrl is required"**
- Check `test/.env.e2e` exists and is configured
- Verify Supabase credentials are correct

**"Redis connection failed"**
- Start Redis: `redis-server`
- Or use Docker: `docker run -d -p 6379:6379 redis:7-alpine`

**"Rate limit exceeded"**
- Set `RATE_LIMIT_ENABLED=false` in `test/.env.e2e`
- Add delays with `afterEach` (see template)

**"Port already in use"**
- Kill existing process: `lsof -ti:4001 | xargs kill -9`
- Or change port in `test/.env.e2e`

See [E2E Testing Guide](../../docs/setup/e2e-testing.md) for more troubleshooting.

## Performance

### Execution Time

- Auth flow: ~5-10 seconds
- BNPL lifecycle: ~10-15 seconds
- Liquidity flow: ~8-12 seconds
- Notifications flow: ~6-10 seconds
- **Total suite**: ~1-2 minutes

### Optimization

- Tests run sequentially (avoid DB conflicts)
- Automatic cleanup after each suite
- Mocked external APIs (Stellar, Soroban)
- Dedicated test database (isolated from dev)

## Related Documentation

- **[E2E Testing Guide](../../docs/setup/e2e-testing.md)** - Detailed setup and usage
- **[Testing Structure](../../docs/development/testing-structure.md)** - Test organization
- **[GitHub Secrets](../../docs/setup/github-secrets.md)** - CI/CD configuration
- **[Environment Variables](../../docs/setup/environment-variables.md)** - Configuration reference

---

*Last Updated: 2026-08-27*
