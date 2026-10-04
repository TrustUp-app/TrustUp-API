import { createHmac, randomBytes } from 'crypto';
import { timingSafeEqualString } from '../../common/utils/timing-safe';

export const WEBHOOK_SIGNATURE_HEADER = 'x-trustup-signature';
export const WEBHOOK_EVENT_HEADER = 'x-trustup-event';
export const WEBHOOK_DELIVERY_HEADER = 'x-trustup-delivery';
export const WEBHOOK_TIMESTAMP_HEADER = 'x-trustup-timestamp';

export function generateWebhookSecret(): string {
  return randomBytes(32).toString('hex');
}

export function signPayload(secret: string, rawBody: string): string {
  const digest = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  return `sha256=${digest}`;
}

export function verifySignature(secret: string, rawBody: string, header: string): boolean {
  if (!header || !secret) {
    return false;
  }
  return timingSafeEqualString(header, signPayload(secret, rawBody));
}
