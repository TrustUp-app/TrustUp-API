# GitHub Secrets Configuration for CI/CD

This document explains how to configure GitHub repository secrets for running E2E tests in CI/CD pipelines.

## Overview

The TrustUp API uses GitHub Actions for continuous integration. E2E tests require access to a test Supabase project and other credentials. These sensitive values must be stored as GitHub repository secrets.

## Required Secrets

### 1. Supabase Test Instance

**Purpose**: Connect to dedicated test Supabase project for E2E tests

| Secret Name | Description | How to Get |
|-------------|-------------|------------|
| `TEST_SUPABASE_URL` | Test Supabase project URL | Go to [Supabase Dashboard](https://app.supabase.com/) → Select test project → Settings → API → Project URL |
| `TEST_SUPABASE_ANON_KEY` | Supabase anonymous/public key | Supabase Dashboard → Settings → API → anon/public key |
| `TEST_SUPABASE_SERVICE_KEY` | Supabase service role key | Supabase Dashboard → Settings → API → service_role key ⚠️ **Keep this secret!** |

**Example Values**:
```
TEST_SUPABASE_URL=https://abcdefgh.supabase.co
TEST_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBh...
TEST_SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBh...
```

### 2. JWT Secrets

**Purpose**: Sign JWT tokens in test environment

| Secret Name | Description | How to Generate |
|-------------|-------------|-----------------|
| `TEST_JWT_SECRET` | Secret for signing access tokens | Generate: `openssl rand -base64 32` |
| `TEST_JWT_REFRESH_SECRET` | Secret for signing refresh tokens | Generate: `openssl rand -base64 32` |

**Example Values**:
```
TEST_JWT_SECRET=dGVzdF9qd3Rfc2VjcmV0X21pbl8zMl9jaGFyc19mb3JfZTJlX3Rlc3Rpbmdfb25seSAx
TEST_JWT_REFRESH_SECRET=dGVzdF9qd3RfcmVmcmVzaF9zZWNyZXRfbWluXzMyX2NoYXJzX2Zvcl9lMmVfMjM0NQ==
```

⚠️ **Important**: Use different secrets for test, dev, and production!

### 3. Stellar Contract IDs (Optional)

**Purpose**: Reference deployed test smart contracts on Stellar testnet

These are optional if you're using mocked Stellar interactions in E2E tests.

| Secret Name | Description | How to Get |
|-------------|-------------|------------|
| `TEST_REPUTATION_CONTRACT_ID` | Reputation contract address | Deploy to testnet: `stellar contract deploy --wasm reputation.wasm --network testnet` |
| `TEST_CREDIT_LINE_CONTRACT_ID` | Credit line contract address | Deploy to testnet: `stellar contract deploy --wasm credit-line.wasm --network testnet` |
| `TEST_LIQUIDITY_CONTRACT_ID` | Liquidity pool contract address | Deploy to testnet: `stellar contract deploy --wasm liquidity.wasm --network testnet` |
| `TEST_MERCHANT_REGISTRY_CONTRACT_ID` | Merchant registry contract address | Deploy to testnet: `stellar contract deploy --wasm merchant-registry.wasm --network testnet` |

**Example Values**:
```
TEST_REPUTATION_CONTRACT_ID=CAXYZ123ABC...
TEST_CREDIT_LINE_CONTRACT_ID=CABCD456DEF...
TEST_LIQUIDITY_CONTRACT_ID=CAEFG789GHI...
TEST_MERCHANT_REGISTRY_CONTRACT_ID=CAHIJ012JKL...
```

## How to Add Secrets

### Via GitHub Web UI

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Enter the secret name (e.g., `TEST_SUPABASE_URL`)
5. Paste the secret value
6. Click **Add secret**
7. Repeat for each required secret

### Via GitHub CLI

```bash
# Install GitHub CLI if not already installed
# https://cli.github.com/

# Authenticate
gh auth login

# Add secrets
gh secret set TEST_SUPABASE_URL --body "https://your-test-project.supabase.co"
gh secret set TEST_SUPABASE_ANON_KEY --body "eyJhbGciOiJIUzI1..."
gh secret set TEST_SUPABASE_SERVICE_KEY --body "eyJhbGciOiJIUzI1..."
gh secret set TEST_JWT_SECRET --body "$(openssl rand -base64 32)"
gh secret set TEST_JWT_REFRESH_SECRET --body "$(openssl rand -base64 32)"

# Optional: Add contract IDs
gh secret set TEST_REPUTATION_CONTRACT_ID --body "CAXYZ123..."
gh secret set TEST_CREDIT_LINE_CONTRACT_ID --body "CABCD456..."
gh secret set TEST_LIQUIDITY_CONTRACT_ID --body "CAEFG789..."
gh secret set TEST_MERCHANT_REGISTRY_CONTRACT_ID --body "CAHIJ012..."
```

## Verifying Secrets

After adding secrets, verify they're configured:

```bash
# List all secrets
gh secret list

# Expected output:
# TEST_SUPABASE_URL
# TEST_SUPABASE_ANON_KEY
# TEST_SUPABASE_SERVICE_KEY
# TEST_JWT_SECRET
# TEST_JWT_REFRESH_SECRET
# (and optional contract IDs)
```

## Security Best Practices

### 1. Use Dedicated Test Project

✅ **DO**: Create a separate Supabase project for CI/CD tests
- Isolated from production data
- Can be reset/rebuilt easily
- Reduces risk of data leaks

❌ **DON'T**: Use production Supabase project for tests

### 2. Rotate Secrets Regularly

Rotate sensitive secrets periodically:

```bash
# Generate new JWT secret
openssl rand -base64 32

# Update in GitHub
gh secret set TEST_JWT_SECRET --body "new-secret-value"
```

**Recommended rotation schedule**:
- JWT secrets: Every 90 days
- Supabase service key: When team members leave or annually
- Contract IDs: Only when redeploying contracts

### 3. Restrict Access

Configure who can access secrets:

1. Go to **Settings** → **Actions** → **General**
2. Under "Fork pull request workflows from outside collaborators"
3. Select "Require approval for first-time contributors"

This prevents fork PRs from accessing your secrets.

### 4. Audit Secret Usage

Monitor secret access in GitHub Actions logs:

1. Go to **Actions** tab
2. Select a workflow run
3. Review which secrets were used
4. Check for unauthorized access attempts

### 5. Never Log Secrets

The CI workflow automatically masks secrets in logs. Never echo or print secrets:

❌ **BAD**:
```yaml
- name: Debug
  run: echo "URL is ${{ secrets.TEST_SUPABASE_URL }}"
```

✅ **GOOD**:
```yaml
- name: Run tests
  env:
    SUPABASE_URL: ${{ secrets.TEST_SUPABASE_URL }}
  run: npm run test:e2e
```

## Environment-Specific Secrets

Different environments should use different secrets:

| Environment | Secret Prefix | Purpose |
|-------------|---------------|---------|
| Test (CI) | `TEST_*` | E2E tests in GitHub Actions |
| Development | (no secrets) | Local `.env` file |
| Staging | `STAGING_*` | Pre-production deployment |
| Production | `PROD_*` | Production deployment |

**Example**:
```
TEST_SUPABASE_URL        # For CI E2E tests
STAGING_SUPABASE_URL     # For staging deployment
PROD_SUPABASE_URL        # For production deployment
```

## Troubleshooting

### Secret Not Found Error

**Error**: `Error: Secret TEST_SUPABASE_URL not found`

**Solution**:
1. Verify secret exists: `gh secret list`
2. Check secret name matches exactly (case-sensitive)
3. Ensure workflow has access to secrets
4. For fork PRs, secrets are not available by default

### Invalid Secret Value

**Error**: `Error: supabaseUrl is required`

**Solution**:
1. Verify secret value is correct (no extra whitespace)
2. Check secret value format (URL should include `https://`)
3. Re-create the secret with correct value

### Secrets Not Available in Fork PR

**Expected Behavior**: Secrets are not available to fork PRs for security

**Solution**:
- Approve the workflow run manually
- Or contributor must test E2E locally before opening PR

### E2E Tests Skipped

**Message**: `e2e-tests: skipped`

**Cause**: Conditional logic skips E2E for forks

**Solution**: This is expected. Fork contributors should run E2E tests locally.

## Testing Secrets Configuration

After configuring secrets, trigger a test workflow:

1. Create a test branch
2. Make a small change to `.github/workflows/ci.yml`
3. Open a PR
4. Check if E2E tests run successfully

Or manually trigger the workflow:

```bash
# Trigger workflow manually
gh workflow run ci.yml
```

## Required Secrets Checklist

Before enabling E2E tests in CI, ensure you have:

- [ ] Created dedicated test Supabase project
- [ ] Run all migrations in test project
- [ ] Added `TEST_SUPABASE_URL` secret
- [ ] Added `TEST_SUPABASE_ANON_KEY` secret
- [ ] Added `TEST_SUPABASE_SERVICE_KEY` secret
- [ ] Generated and added `TEST_JWT_SECRET`
- [ ] Generated and added `TEST_JWT_REFRESH_SECRET`
- [ ] (Optional) Deployed test contracts to Stellar testnet
- [ ] (Optional) Added contract ID secrets
- [ ] Verified secrets with `gh secret list`
- [ ] Tested E2E workflow with test PR

## Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [GitHub Secrets Management](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [Supabase Documentation](https://supabase.com/docs)
- [Stellar Testnet](https://developers.stellar.org/docs/fundamentals-and-concepts/testnet-and-pubnet)

## Related Documentation

- [E2E Testing Guide](./e2e-testing.md)
- [Environment Variables](./environment-variables.md)
- [CI/CD Workflow](../../.github/workflows/ci.yml)

---

*Last Updated: 2026-08-27*
