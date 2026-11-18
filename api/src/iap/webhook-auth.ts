import { timingSafeEqual } from 'node:crypto';
import type { IapPlatform } from './verifier.js';

/**
 * Store webhook authentication: refund webhooks are checked against a shared secret in constant time. Store
 * signature verification would plug in behind `WebhookVerifier`, with the shared secret kept as the fallback. See
 * docs/security/payment-security-review.md for the threat model.
 */
export interface WebhookVerifier {
  verify(platform: IapPlatform, headers: Record<string, unknown>): boolean;
}

/** Constant-time string compare — never leak secret length/prefix via timing. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Shared-secret verifier: the `x-iap-secret` header must match the configured secret in constant time. False when no
 * secret is configured, so the endpoint fails closed.
 */
export class SharedSecretWebhookVerifier implements WebhookVerifier {
  constructor(private readonly secret: string | undefined) {}

  verify(_platform: IapPlatform, headers: Record<string, unknown>): boolean {
    if (!this.secret) return false;
    const provided = headers['x-iap-secret'];
    return typeof provided === 'string' && safeEqual(provided, this.secret);
  }
}
