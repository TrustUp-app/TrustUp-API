# E2E Testing - Quick Start Guide

Get your E2E test environment up and running in 5 minutes.

## Prerequisites

- Node.js 20+
- npm installed
- Docker (optional, for Redis)

## Step 1: Clone and Install (1 min)

```bash
git clone <your-repo-url>
cd TrustUp-API
npm install
```

## Step 2: Setup Test Database (2 min)

### Option A: Quick Setup (Recommended for First Time)

1. Go to https://app.supabase.com/
2. Click "New Project"
3. Name it "trustup-test"
4. Choose a password
5. Select region closest to you
6. Wait ~2 minutes for project creation

### Option B: Use Existing Supabase

Skip if you created new project above.

## Step 3: Configure Environment (1 min)

```bash
# Copy template
cp test/.env.e2e.example test/.env.e2e

# Edit test/.env.e2e
# Replace these 3 values from Supabase Dashboard → Settings → API:
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-from-supabase
SUPABASE_SERVICE_ROLE_KEY=your-service-key-from-supabase
```

**Generate JWT Secrets:**
```bash
# Run this command twice to get two different secrets
openssl rand -base64 32

# Add to test/.env.e2e:
JWT_SECRET=<paste-first-secret>
JWT_REFRESH_SECRET=<paste-second-secret>
```

## Step 4: Start Redis (30 seconds)

### Option A: Docker (Easiest)
```bash
docker run -d -p 6379:6379 --name redis-test redis:7-alpine
```

### Option B: Local Redis
```bash
redis-server
```

**Verify it's running:**
```bash
redis-cli ping
# Should return: PONG
```

## Step 5: Run Migrations (30 seconds)

```bash
# Install Supabase CLI globally
npm install -g supabase

# Initialize (only first time)
supabase init

# Link to your test project
supabase link --project-ref <your-project-ref>

# Run migrations
supabase db push
```

**Get your project ref:**
- Go to Supabase Dashboard → Settings → General
- Copy the "Reference ID"

## Step 6: Run Tests! 🚀

```bash
npm run test:e2e
```

**Expected Output:**
```
PASS  test/e2e/auth-flow.e2e-spec.ts
PASS  test/e2e/bnpl-lifecycle.e2e-spec.ts
PASS  test/e2e/liquidity-flow.e2e-spec.ts
PASS  test/e2e/notifications-flow.e2e-spec.ts

Test Suites: 4 passed, 4 total
Tests:       44 passed, 44 total
Time:        67.890s
```

## ✅ Success!

If all tests pass, you're done! Your E2E test environment is ready.

## Common Issues

### "supabaseUrl is required"

**Fix:**
```bash
# Verify file exists
cat test/.env.e2e | grep SUPABASE_URL

# Should show: SUPABASE_URL=https://...
```

### "Redis connection failed"

**Fix:**
```bash
# Check Redis is running
redis-cli ping

# If not running, start it:
docker run -d -p 6379:6379 redis:7-alpine
```

### "Port 4001 already in use"

**Fix:**
```bash
# Kill existing process on port 4001
lsof -ti:4001 | xargs kill -9

# Or change port in test/.env.e2e:
PORT=4002
```

## Next Steps

### Run Specific Tests

```bash
# Auth tests only
npx jest --config ./test/jest-e2e.json test/e2e/auth-flow.e2e-spec.ts

# BNPL tests only
npx jest --config ./test/jest-e2e.json test/e2e/bnpl-lifecycle.e2e-spec.ts
```

### Watch Mode

```bash
npx jest --config ./test/jest-e2e.json --watch
```

### With Coverage

```bash
npx jest --config ./test/jest-e2e.json --coverage
```

## Complete Guides

Need more details? See the comprehensive guides:

- **[Full E2E Testing Guide](./e2e-testing.md)** - Complete setup, troubleshooting, best practices
- **[GitHub Secrets](./github-secrets.md)** - Configure CI/CD
- **[Test Suite Documentation](../../test/e2e/README.md)** - Developer reference

## Configuration Template

Minimal `test/.env.e2e` for quick start:

```env
# === REQUIRED ===
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key
JWT_SECRET=your-32-char-secret-1
JWT_REFRESH_SECRET=your-32-char-secret-2

# === DEFAULTS (usually don't need to change) ===
REDIS_URL=redis://localhost:6379/1
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_SOROBAN_URL=https://soroban-testnet.stellar.org
STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
PORT=4001
NODE_ENV=test
RATE_LIMIT_ENABLED=false
JOBS_ENABLED=false
LOG_LEVEL=error
```

## Tips

### Speed Up Tests

Add to `test/.env.e2e`:
```env
RATE_LIMIT_ENABLED=false  # Skip rate limiting
JOBS_ENABLED=false        # Disable background jobs
LOG_LEVEL=error           # Reduce log output
```

### Clean Test Data

Tests auto-cleanup, but if needed:
```bash
# Clear Redis test DB
redis-cli -n 1 FLUSHDB

# Clear Supabase test data
# Use Supabase Dashboard → Table Editor → Delete rows
```

### Parallel Testing

For faster CI/CD, consider:
```bash
# Run in parallel (advanced)
npx jest --config ./test/jest-e2e.json --maxWorkers=4
```

## Docker Compose (Advanced)

Create `docker-compose.test.yml`:

```yaml
version: '3.8'
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server
```

Start with:
```bash
docker-compose -f docker-compose.test.yml up -d
```

## One-Line Setup (After Configuration)

Once `test/.env.e2e` is configured:

```bash
# Start Redis + Run tests
docker run -d -p 6379:6379 redis:7-alpine && npm run test:e2e
```

## Cheat Sheet

```bash
# Install dependencies
npm install

# Setup environment
cp test/.env.e2e.example test/.env.e2e
# Edit test/.env.e2e with your credentials

# Start Redis
docker run -d -p 6379:6379 redis:7-alpine

# Run tests
npm run test:e2e

# Run specific test
npx jest --config ./test/jest-e2e.json test/e2e/<test-name>.e2e-spec.ts

# Watch mode
npx jest --config ./test/jest-e2e.json --watch

# Stop Redis
docker stop redis-test && docker rm redis-test
```

---

## 🎉 You're Ready!

Your E2E test environment is now configured. Happy testing!

For questions or issues, see the [Complete E2E Testing Guide](./e2e-testing.md).

---

*Last Updated: 2026-08-27*
