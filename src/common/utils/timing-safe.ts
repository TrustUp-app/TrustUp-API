import { timingSafeEqual } from 'crypto';

/**
 * Constant-time string comparison.
 *
 * Plain `!==` short-circuits on the first differing byte, so the comparison
 * time leaks how many leading characters match. `crypto.timingSafeEqual`
 * requires buffers of equal length, so mismatched lengths are rejected up front
 * (that check is not secret — lengths are not the value being protected).
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  if (!a || !b) {
    return false;
  }
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}