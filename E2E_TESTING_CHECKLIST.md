# E2E Test Suite - Setup & Verification Checklist

Use this checklist to verify your E2E test suite is properly configured and ready to run.

## ✅ Pre-Setup Checklist

### Dependencies
- [ ] Node.js 20+ installed
- [ ] npm installed and working
- [ ] Git installed
- [ ] Code editor (VS Code recommended)

### Accounts & Services
- [ ] GitHub account with repository access
- [ ] Supabase account (for test project)
- [ ] Redis installed or Docker available

## ✅ Environment Setup

### 1. Install Project Dependencies

```bash
cd TrustUp-API
npm install
```

**Verify:**
```bash
npm list --depth=0
# Should show all dependencies installed
```

### 2. Create Test Supabase Project

- [ ] Go to https://app.supabase.com/
- [ ] Create new project named "trustup-test"
- [ ] Wait for project to be ready (~2 minutes)
- [ ] Navigate to Settings → API
- [ ] Copy Project URL
- [ ] Copy anon/public key
- [ ] Copy service_role key

### 3. Run Database Migrations

```bash
# Install Supabase CLI if needed
npm install -g supabase

# Link to your test project
supabase link --project-ref your-project-ref

# Run migrations
supabase db push
```

**Verify:**
- [ ] All tables created in test project
- [ ] No migration errors

### 4. Start Redis

**Option A: Local Redis**
```bash
redis-server
```

**Option B: Docker**
```bash
docker run -d -p 6379:6379 --name redis-test redis:7-alpine
```

**Verify:**
```bash
redis-cli ping
# Should return: PONG
```

### 5. Configure Test Environment

```bash
cp test/.env.e2e.example test/.env.e2e
```

Edit `test/.env.e2e` with your values:

```env
# Supabase (from step 2)
SUPABASE_URL=https://your-test-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# JWT Secrets (generate new ones)
JWT_SECRET=test_jwt_secret_min_32_chars_for_e2e_testing_only_12345
JWT_REFRESH_SECRET=test_jwt_refresh_secret_min_32_chars_for_e2e_67890

# Redis
REDIS_URL=redis://localhost:6379/1

# Stellar (use testnet)
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_SOROBAN_URL=https://soroban-testnet.stellar.org
STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015

# Test Configuration
PORT=4001
NODE_ENV=test
RATE_LIMIT_ENABLED=false
JOBS_ENABLED=false
LOG_LEVEL=error
```

**Generate JWT Secrets:**
```bash
# Generate random secrets
openssl rand -base64 32
openssl rand -base64 32
```

**Verify:**
- [ ] File exists: `test/.env.e2e`
- [ ] All required variables set
- [ ] Supabase URL is accessible
- [ ] Redis URL is correct

## ✅ Run E2E Tests

### 1. Run All Tests

```bash
npm run test:e2e
```

**Expected Output:**
```
PASS  test/e2e/auth-flow.e2e-spec.ts
  Auth Flow (E2E)
    ✓ should register a new user (1234ms)
    ✓ should generate a nonce (456ms)
    ...

PASS  test/e2e/bnpl-lifecycle.e2e-spec.ts
  BNPL Lifecycle (E2E)
    ✓ should complete full BNPL flow (2345ms)
    ...

Test Suites: 4 passed, 4 total
Tests:       44 passed, 44 total
Time:        67.890s
```

### 2. Run Individual Test Suites

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

**Verify:**
- [ ] All test suites pass
- [ ] No authentication errors
- [ ] No database connection errors
- [ ] No Redis errors
- [ ] Test data cleaned up automatically

## ✅ CI/CD Setup

### 1. Configure GitHub Secrets

```bash
# Install GitHub CLI
# https://cli.github.com/

# Authenticate
gh auth login

# Add secrets
gh secret set TEST_SUPABASE_URL --body "https://your-test.supabase.co"
gh secret set TEST_SUPABASE_ANON_KEY --body "your-anon-key"
gh secret set TEST_SUPABASE_SERVICE_KEY --body "your-service-key"
gh secret set TEST_JWT_SECRET --body "$(openssl rand -base64 32)"
gh secret set TEST_JWT_REFRESH_SECRET --body "$(openssl rand -base64 32)"
```

**Verify:**
```bash
gh secret list
# Should show all 5 secrets
```

### 2. Test CI Workflow

```bash
# Create test branch
git checkout -b test/e2e-ci

# Make a small change
echo "# E2E Test" >> README.md

# Commit and push
git add .
git commit -m "test: verify E2E CI workflow"
git push origin test/e2e-ci

# Create PR
gh pr create --title "Test E2E CI" --body "Testing E2E workflow"
```

**Verify in GitHub Actions:**
- [ ] Unit tests job completes successfully
- [ ] E2E tests job starts after unit tests
- [ ] Redis service container starts
- [ ] E2E tests pass
- [ ] Workflow completes successfully

## ✅ File Verification

### Configuration Files

- [ ] `test/.env.e2e.example` - Template with all variables
- [ ] `test/.env.e2e` - Your configured environment (not in git)
- [ ] `test/jest-e2e.json` - Jest E2E configuration
- [ ] `.github/workflows/ci.yml` - Updated with E2E job

### Test Files

- [ ] `test/e2e/auth-flow.e2e-spec.ts` - Auth tests
- [ ] `test/e2e/bnpl-lifecycle.e2e-spec.ts` - Loan tests
- [ ] `test/e2e/liquidity-flow.e2e-spec.ts` - Liquidity tests
- [ ] `test/e2e/notifications-flow.e2e-spec.ts` - Notification tests

### Helper Files

- [ ] `test/helpers/e2e.helpers.ts` - Enhanced with mocks
- [ ] `test/helpers/index.ts` - Basic utilities
- [ ] `test/fixtures/e2e.fixtures.ts` - Test data factories
- [ ] `test/fixtures/index.ts` - Fixture exports

### Documentation

- [ ] `docs/setup/e2e-testing.md` - Complete guide
- [ ] `docs/setup/github-secrets.md` - Secrets configuration
- [ ] `docs/setup/README.md` - Documentation index
- [ ] `test/e2e/README.md` - Test suite documentation
- [ ] `E2E_TEST_SUITE_SUMMARY.md` - Implementation summary
- [ ] `E2E_TESTING_CHECKLIST.md` - This file

## ✅ Troubleshooting

### Issue: "supabaseUrl is required"

**Solution:**
1. Verify `test/.env.e2e` exists
2. Check `SUPABASE_URL` is set correctly
3. Ensure URL format: `https://project.supabase.co`
4. Test URL accessibility in browser

### Issue: "Redis connection failed"

**Solution:**
```bash
# Check if Redis is running
redis-cli ping

# If not, start Redis
redis-server
# or
docker start redis-test
```

### Issue: "Port 4001 already in use"

**Solution:**
```bash
# Find and kill process
# Windows:
netstat -ano | findstr :4001
taskkill /PID <PID> /F

# Linux/Mac:
lsof -ti:4001 | xargs kill -9

# Or change port in test/.env.e2e
PORT=4002
```

### Issue: "Rate limit exceeded"

**Solution:**
Edit `test/.env.e2e`:
```env
RATE_LIMIT_ENABLED=false
RATE_LIMIT_MAX=1000
```

### Issue: Tests hang/timeout

**Solution:**
1. Check Redis is running
2. Disable background jobs:
   ```env
   JOBS_ENABLED=false
   ```
3. Increase Jest timeout in test file:
   ```typescript
   jest.setTimeout(30000); // 30 seconds
   ```

### Issue: Test data not cleaning up

**Solution:**
1. Check `testWallets.push(user.wallet)` is called
2. Verify `cleanupTestData()` in `afterAll()`
3. Manually clean test database if needed

### Issue: GitHub Actions E2E job skipped

**Cause:** Secrets not available or fork PR

**Solution:**
1. Verify secrets are configured: `gh secret list`
2. Check workflow condition allows E2E to run
3. For forks: contributor must test locally

## ✅ Success Criteria

Your E2E test suite is ready when:

- [ ] ✅ All dependencies installed
- [ ] ✅ Test Supabase project created and migrated
- [ ] ✅ Redis running and accessible
- [ ] ✅ `test/.env.e2e` configured
- [ ] ✅ All E2E tests pass locally
- [ ] ✅ GitHub secrets configured
- [ ] ✅ CI workflow includes E2E tests
- [ ] ✅ Test PR with E2E tests passes
- [ ] ✅ Documentation reviewed
- [ ] ✅ Team trained on running tests

## ✅ Maintenance Tasks

### Weekly
- [ ] Review failed tests in CI
- [ ] Check test execution time trends
- [ ] Update test data if needed

### Monthly
- [ ] Review test coverage
- [ ] Update documentation
- [ ] Check for flaky tests
- [ ] Optimize slow tests

### Quarterly
- [ ] Rotate JWT secrets
- [ ] Review GitHub secrets
- [ ] Update test Supabase project
- [ ] Review CI/CD costs

## 📚 Quick Reference

### Commands

```bash
# Install dependencies
npm install

# Run all E2E tests
npm run test:e2e

# Run specific test
npx jest --config ./test/jest-e2e.json test/e2e/auth-flow.e2e-spec.ts

# Run in watch mode
npx jest --config ./test/jest-e2e.json --watch

# Run with coverage
npx jest --config ./test/jest-e2e.json --coverage

# Check Redis
redis-cli ping

# Start Redis
redis-server

# Configure GitHub secrets
gh secret set TEST_SUPABASE_URL --body "value"

# List GitHub secrets
gh secret list
```

### Documentation Links

- [E2E Testing Guide](docs/setup/e2e-testing.md)
- [GitHub Secrets](docs/setup/github-secrets.md)
- [Test Suite README](test/e2e/README.md)
- [Implementation Summary](E2E_TEST_SUITE_SUMMARY.md)

### Support Resources

- [NestJS Testing Docs](https://docs.nestjs.com/fundamentals/testing)
- [Jest Documentation](https://jestjs.io/)
- [Supabase Docs](https://supabase.com/docs)
- [Redis Documentation](https://redis.io/docs/)
- [GitHub Actions Docs](https://docs.github.com/en/actions)

---

## 🎉 Congratulations!

If you've completed all items in this checklist, your E2E test suite is fully operational!

You now have:
- ✅ Comprehensive E2E test coverage
- ✅ Automated CI/CD pipeline
- ✅ Complete documentation
- ✅ Best practices implementation

**Happy Testing! 🚀**

---

*Last Updated: 2026-08-27*
