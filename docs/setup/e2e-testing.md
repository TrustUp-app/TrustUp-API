# E2E Testing Guide

This guide explains how to set up and run end-to-end (E2E) tests for the TrustUp API.

## Overview

E2E tests validate the complete BNPL flow from wallet registration through loan creation, repayment, and reputation updates. Unlike unit tests, E2E tests:

- Use real NestJS application instances
- Connect to test databases (Supabase)
- Use test Redis instances
- Mock Stellar blockchain interactions at the service boundary
- Clean up test data after each test suite

## Prerequisites

Before running E2E tests, ensure you have:

1. **Node.js 20+** installed
2. **Test Supabase Project** (separate from development)
3. **Redis** running locally or accessible remotely
4. **Stellar Testnet** access (for contract addresses)

## Setup Instructions

### 1. Create Test Supabase Project

**Option A: Dedicated Test Project (Recommended)**

1. Go to [Supabase Dashboard](https://app.supabase.com/)
2. Create a new project named `trustup-test` or similar
3. Run all migrations from `supabase/migrations/` in the new project
4. Copy the project credentials (URL, anon key, service role key)

**Option B: Use Test Schema in Existing Project**

1. Create a separate schema in your existing Supabase project
2. Configure Row Level Security (RLS) to isolate test data
3. Note: This approach is more complex and not recommended

### 2. Configure Test Environment

Copy the E2E environment template:

```bash
cp test/.env.e2e.example test/.env.e2e
```

Edit `test/.env.e2e` with your test credentials:

```env
# Supabase Test Instance
SUPABASE_URL=https://your-test-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# JWT Secrets (use different values from production)
JWT_SECRET=test_jwt_secret_min_32_chars_for_e2e_testing_only_12345
JWT_REFRESH_SECRET=test_jwt_refresh_secret_min_32_chars_for_e2e_67890

# Redis (use separate database)
REDIS_URL=redis://localhost:6379/1

# Stellar Testnet
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_SOROBAN_URL=https://soroban-testnet.stellar.org
STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015

# Test Contract IDs (deploy test contracts first)
REPUTATION_CONTRACT_ID=CTEST123...
CREDIT_LINE_CONTRACT_ID=CTEST456...
LIQUIDITY_CONTRACT_ID=CTEST789...
MERCHANT_REGISTRY_CONTRACT_ID=CTEST012...

# Admin API Key
ADMIN_API_KEY=test_admin_api_key_e2e

# Port (different from dev)
PORT=4001
```

### 3. Start Redis (Test Database)

Make sure Redis is running and accessible:

```bash
# Check if Redis is running
redis-cli ping
# Should return: PONG

# Or start Redis with Docker
docker run -d -p 6379:6379 redis:7-alpine
```

### 4. Deploy Test Contracts (Optional)

If you need to test actual Stellar interactions:

```bash
# Navigate to contracts directory
cd contracts

# Deploy to testnet with test prefix
stellar contract deploy --wasm reputation.wasm --network testnet --alias test-reputation
stellar contract deploy --wasm credit-line.wasm --network testnet --alias test-credit-line
stellar contract deploy --wasm liquidity.wasm --network testnet --alias test-liquidity

# Copy the contract IDs to test/.env.e2e
```

**Note**: Most E2E tests mock Stellar interactions, so deploying real contracts is optional.

## Running E2E Tests

### Run All E2E Tests

```bash
npm run test:e2e
```

This runs all E2E test suites in sequence.

### Run Specific Test Suite

```bash
# Run only auth flow tests
npx jest --config ./test/jest-e2e.json test/e2e/auth-flow.e2e-spec.ts

# Run only BNPL lifecycle tests
npx jest --config ./test/jest-e2e.json test/e2e/bnpl-lifecycle.e2e-spec.ts

# Run only liquidity flow tests
npx jest --config ./test/jest-e2e.json test/e2e/liquidity-flow.e2e-spec.ts

# Run only notifications flow tests
npx jest --config ./test/jest-e2e.json test/e2e/notifications-flow.e2e-spec.ts
```

### Run Tests in Watch Mode

```bash
npx jest --config ./test/jest-e2e.json --watch
```

### Run Tests with Coverage

```bash
npx jest --config ./test/jest-e2e.json --coverage
```

### Run Tests Verbosely

```bash
npx jest --config ./test/jest-e2e.json --verbose
```

## E2E Test Suites

### 1. Auth Flow (`auth-flow.e2e-spec.ts`)

Tests the complete wallet-based authentication flow:

- ✅ User registration with wallet address
- ✅ Nonce generation and expiration
- ✅ Signature verification
- ✅ JWT token issuance
- ✅ Token refresh
- ✅ Logout and token invalidation
- ✅ Duplicate username/wallet prevention
- ✅ Protected endpoint access

**Coverage**: `/auth/*` endpoints

### 2. BNPL Lifecycle (`bnpl-lifecycle.e2e-spec.ts`)

Tests the complete Buy Now Pay Later flow:

- ✅ Loan quote calculation
- ✅ Loan creation with unsigned XDR
- ✅ Loan repayment flow
- ✅ Loan listing and filtering
- ✅ Available credit calculation
- ✅ Idempotency key handling
- ✅ Input validation

**Coverage**: `/loans/*` endpoints

### 3. Liquidity Flow (`liquidity-flow.e2e-spec.ts`)

Tests the liquidity pool investor flow:

- ✅ Public pool overview (no auth)
- ✅ Personal investment summary
- ✅ Liquidity deposit with XDR generation
- ✅ Liquidity withdrawal
- ✅ Share calculation
- ✅ Idempotency for deposits/withdrawals
- ✅ Minimum deposit enforcement

**Coverage**: `/liquidity/*` endpoints

### 4. Notifications Flow (`notifications-flow.e2e-spec.ts`)

Tests the notification system:

- ✅ Notification listing with pagination
- ✅ Filtering by read/unread status
- ✅ Mark individual notification as read
- ✅ Mark all notifications as read
- ✅ Unread count badge
- ✅ Notification creation (simulated job)

**Coverage**: `/notifications/*` endpoints

## Test Data Management

### Automatic Cleanup

All E2E tests automatically clean up their test data using the `cleanupTestData()` helper:

```typescript
afterAll(async () => {
  await cleanupTestData(app, testWallets);
  await app.close();
});
```

This removes:
- User profiles
- Loans and payments
- Notifications
- Auth nonces and refresh tokens

### Manual Cleanup

If tests fail and leave orphaned data:

```bash
# Connect to test Supabase project
# Navigate to Table Editor
# Filter by recent timestamps
# Delete orphaned records
```

### Test Isolation

Each test creates its own test users and data:

```typescript
const user = await createTestUser(app, {
  username: `test_user_${Date.now()}`,
  displayName: 'E2E Test User',
});
testWallets.push(user.wallet);
```

Timestamps and random strings ensure no collisions between parallel test runs.

## Mocking Stellar Interactions

E2E tests mock Stellar SDK calls at the service boundary to avoid blockchain dependencies:

```typescript
import { createMockStellarService } from '../helpers/e2e.helpers';

// In your test
const mockStellar = createMockStellarService();
// Override StellarService in test module if needed
```

**Why Mock at Service Boundary?**

- ✅ Tests run fast without network calls
- ✅ No testnet XLM balance required
- ✅ Predictable test behavior
- ✅ Real HTTP layer and business logic tested
- ✅ Only blockchain SDK is mocked

**What Gets Mocked:**

- Transaction building (`buildTransaction`)
- Transaction submission (`submitTransaction`)
- Account loading (`loadAccount`)
- Soroban contract invocations

**What Stays Real:**

- HTTP controllers and routes
- NestJS guards and interceptors
- Database interactions (Supabase)
- Business logic and validation
- JWT authentication

## Troubleshooting

### Error: "supabaseUrl is required"

**Cause**: Missing or incorrect Supabase credentials in `test/.env.e2e`

**Solution**:
1. Verify `SUPABASE_URL` is set in `test/.env.e2e`
2. Ensure the URL is correct and accessible
3. Check that migrations have been run in test project

### Error: "Redis connection failed"

**Cause**: Redis not running or wrong connection string

**Solution**:
```bash
# Start Redis
redis-server

# Or with Docker
docker run -d -p 6379:6379 redis:7-alpine

# Verify connection
redis-cli ping
```

### Error: "Rate limit exceeded"

**Cause**: Too many requests in E2E tests

**Solution**: 
- Set `RATE_LIMIT_ENABLED=false` in `test/.env.e2e`
- Or increase limits: `RATE_LIMIT_MAX=1000`

### Tests Hang or Timeout

**Cause**: Background jobs or long-running operations

**Solution**:
- Set `JOBS_ENABLED=false` in `test/.env.e2e`
- Increase Jest timeout in test file:
```typescript
jest.setTimeout(30000); // 30 seconds
```

### Test Data Not Cleaning Up

**Cause**: Test failure before cleanup runs

**Solution**:
```typescript
// Add global teardown
afterAll(async () => {
  try {
    await cleanupTestData(app, testWallets);
  } catch (error) {
    console.error('Cleanup failed:', error);
  } finally {
    await app.close();
  }
});
```

### Port Already in Use

**Cause**: Previous test process still running

**Solution**:
```bash
# Find process using port 4001
lsof -ti:4001 | xargs kill -9

# Or on Windows
netstat -ano | findstr :4001
taskkill /PID <PID> /F
```

## Best Practices

### 1. Isolate Test Data

Always use unique identifiers for test data:

```typescript
const username = `e2e_user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
```

### 2. Clean Up After Tests

Always register test wallets for cleanup:

```typescript
const user = await createTestUser(app);
testWallets.push(user.wallet); // Don't forget this!
```

### 3. Add Delays Between Tests

Avoid rate limiting:

```typescript
afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 100));
});
```

### 4. Use Descriptive Test Names

```typescript
it('should prevent duplicate loan creation with idempotency key', async () => {
  // Test logic
});
```

### 5. Test Happy Path First

Structure tests from happy path to edge cases:

```typescript
describe('Loan Creation', () => {
  it('should create loan successfully with valid data', ...);
  it('should validate amount is positive', ...);
  it('should prevent creation without authentication', ...);
});
```

### 6. Verify Full Response Structure

Don't just check status codes:

```typescript
expect(response.statusCode).toBe(200);
const data = JSON.parse(response.payload);
expect(data).toMatchObject(expectedStructure);
expect(data.loanId).toBeDefined();
```

## CI/CD Integration

E2E tests are **not run in CI** by default because they require:

- Live Supabase project
- Redis instance
- Test contract deployments (optional)

See [CI Configuration](#ci-configuration) for adding E2E tests to GitHub Actions.

### CI Configuration

To enable E2E tests in CI, add this to `.github/workflows/ci.yml`:

```yaml
e2e-tests:
  runs-on: ubuntu-latest
  needs: test-and-build
  
  services:
    redis:
      image: redis:7-alpine
      ports:
        - 6379:6379
  
  steps:
    - name: Checkout repo
      uses: actions/checkout@v4

    - name: Setup Node
      uses: actions/setup-node@v4
      with:
        node-version: "20"
        cache: "npm"

    - name: Install dependencies
      run: npm ci

    - name: Run E2E tests
      env:
        SUPABASE_URL: ${{ secrets.TEST_SUPABASE_URL }}
        SUPABASE_ANON_KEY: ${{ secrets.TEST_SUPABASE_ANON_KEY }}
        SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.TEST_SUPABASE_SERVICE_KEY }}
        JWT_SECRET: ${{ secrets.TEST_JWT_SECRET }}
        JWT_REFRESH_SECRET: ${{ secrets.TEST_JWT_REFRESH_SECRET }}
        REDIS_URL: redis://localhost:6379/1
        # Add other required env vars
      run: npm run test:e2e
```

**Required GitHub Secrets**:
- `TEST_SUPABASE_URL`
- `TEST_SUPABASE_ANON_KEY`
- `TEST_SUPABASE_SERVICE_KEY`
- `TEST_JWT_SECRET`
- `TEST_JWT_REFRESH_SECRET`

## Writing New E2E Tests

### 1. Create Test File

```bash
touch test/e2e/<feature-name>.e2e-spec.ts
```

### 2. Use Template

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

  describe('Feature Flow', () => {
    it('should complete the main flow', async () => {
      const user = await createTestUser(app);
      testWallets.push(user.wallet);

      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'GET',
          url: '/your-endpoint',
          headers: authHeader(user.accessToken),
        });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
    });
  });
});
```

### 3. Add Fixtures

Add reusable test data to `test/fixtures/e2e.fixtures.ts`:

```typescript
export const createYourFeatureRequest = (overrides?: any) => ({
  field1: overrides?.field1 || 'default',
  field2: overrides?.field2 || 100,
  ...overrides,
});
```

### 4. Run and Validate

```bash
npx jest --config ./test/jest-e2e.json test/e2e/<feature-name>.e2e-spec.ts
```

## Performance Considerations

### Test Execution Time

E2E tests are slower than unit tests:

- Auth flow: ~5-10 seconds
- BNPL lifecycle: ~10-15 seconds
- Liquidity flow: ~8-12 seconds
- Notifications flow: ~6-10 seconds
- **Total**: ~1-2 minutes for full suite

### Optimization Tips

1. **Run tests in sequence** (avoid parallel runs to prevent DB conflicts)
2. **Use test data factories** to reduce boilerplate
3. **Mock external APIs** (Stellar, Soroban)
4. **Keep test database clean** (automatic cleanup)
5. **Use dedicated test Supabase project** (avoids dev data conflicts)

## Related Documentation

- [Testing Structure](../development/testing-structure.md)
- [Environment Variables](./environment-variables.md)
- [Installation Guide](./installation.md)
- [API Endpoints](../api/endpoints.md)

---

*Last Updated: 2026-08-27*
