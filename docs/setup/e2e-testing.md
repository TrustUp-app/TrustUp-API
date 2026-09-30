# E2E Testing Guide

End-to-end tests live in `test/e2e/` and are run with Jest using a dedicated config:

```bash
npm run test:e2e
```

Unlike the unit suite (`npm test`), the e2e specs boot real Nest feature modules
through `Test.createTestingModule` and then drive them with Fastify's
`app.inject()` — so they exercise routing, guards, pipes, controllers and
services together.

## Prerequisites

Because the modules are real, any spec that reaches `SupabaseService` will fail
with `supabaseUrl is required` unless configuration is present. Set the
following before running the suite locally:

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key (repositories use the service-role client) |
| `JWT_SECRET` | Access-token signing secret (a throwaway test value is fine) |
| `JWT_REFRESH_SECRET` | Refresh-token signing secret (a throwaway test value is fine) |
| `REDIS_URL` | Only needed by queue-backed specs (BullMQ) |

Specs that replace `SupabaseService` with an in-memory fake — for example
`test/e2e/modules/notifications/notifications.e2e-spec.ts` — need no external
services at all and run as-is.

## Isolation rules

- Prefer overriding `SupabaseService` (and the contract clients) with in-memory
  fakes over pointing at a shared remote project, so runs are deterministic and
  cannot corrupt real data.
- Override `JwtAuthGuard` with a guard that maps the `Authorization` header to a
  fixed wallet, and keep a case that submits no token to assert `401`.
- Reset the fake state in `beforeEach`, and use `jest.clearAllMocks()` so call
  history does not leak between tests.
- Close the app in `afterAll` (`await app.close()`) to release Fastify handles.

## Running a single flow

```bash
# One spec file
npx jest --config ./test/jest-e2e.json test/e2e/modules/notifications

# One test name
npx jest --config ./test/jest-e2e.json -t "creates a reminder notification"
```

Use `--runInBand` when running the whole suite: several specs boot their own
Nest application, and serial execution keeps ports, timers and shared fakes
predictable.

```bash
npm run test:e2e -- --runInBand
```

## Continuous integration

The default `ci.yml` workflow runs the build and the unit suite only, because a
hosted runner has neither Supabase nor Redis. E2E runs in the separate opt-in
`.github/workflows/e2e.yml` workflow:

- start it manually from **Actions → E2E → Run workflow**, or
- add the `run-e2e` label to a pull request.

The workflow provisions Redis as a service container and reads Supabase from the
`E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY` and `E2E_SUPABASE_SERVICE_ROLE_KEY`
repository secrets. If `E2E_SUPABASE_URL` is not configured it skips the suite
with a notice instead of failing, so the label is always safe to add.

## Coverage map

| Flow | Spec |
| --- | --- |
| Auth | `test/e2e/modules/auth/auth.e2e-spec.ts` |
| Loans (lifecycle, credit) | `test/e2e/modules/loans/*.e2e-spec.ts` |
| Liquidity | `test/e2e/modules/liquidity/liquidity-flow.e2e-spec.ts` |
| Notifications (job → list → mark read) | `test/e2e/modules/notifications/notifications.e2e-spec.ts` |
| Reputation | `test/e2e/modules/reputation/reputation.e2e-spec.ts` |
| Transactions | `test/e2e/modules/transactions/transaction-submission.e2e-spec.ts` |
| Webhooks | `test/e2e/modules/webhooks/webhook-delivery.e2e-spec.ts` |
| Job math (defaults, redistribution) | `test/e2e/modules/jobs/loan-lifecycle-jobs.e2e-spec.ts` |
