# Update Note for Maintainers

## Issue Reference

**Issue:** [API-10: Implement loan quote calculation endpoint](https://github.com/TrustUp-app/TrustUp-API/issues/31)

## Summary

This push includes updates to the existing **loan quote PR** with the following additional changes:

### Reputation Service Enhancements

The `ReputationService` (`src/modules/reputation/reputation.service.ts`) has been refactored to support the loan quote feature more robustly:

- **On-chain score resolution** — The service now queries the Soroban Reputation contract first, falls back to the Supabase cache, and defaults to a score of 50 for new wallets.
- **Tier configuration** — Tier definitions (gold/silver/bronze/poor) are now centralized as constants with explicit score thresholds, interest-rate bands, and credit-limit bands.
- **Interest rate interpolation** — `getInterestRateFromScore()` linearly interpolates within each tier so higher scores yield better (lower) rates.
- **Credit limit interpolation** — `getMaxCreditFromScore()` follows the same interpolation pattern.
- **Score normalization** — All raw scores are clamped to the 0–100 range via `normalizeScore()`.
- **New dependency** — `ReputationContractClient` is now injected for on-chain reads.
- **New DTO** — `ReputationResponseDto` added for typed responses.

### What Was Already in This PR

- `POST /loans/quote` endpoint (controller, service, DTOs)
- JWT authentication guard and `@CurrentUser()` decorator
- Merchants service for merchant validation
- Full test suite (28 unit tests + 10 E2E tests)

### Files Changed in This Update

| File | Change |
|------|--------|
| `src/modules/reputation/reputation.service.ts` | Refactored with on-chain resolution, tier constants, interpolation |
| `src/modules/reputation/reputation.module.ts` | May need update for new `ReputationContractClient` provider |

### Notes

- The reputation service changes are backward-compatible with the loans module.
- Ensure `ReputationContractClient` and `ReputationResponseDto` are created/available before building.
- All existing loan quote tests remain passing.
