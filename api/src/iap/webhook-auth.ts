import { timingSafeEqual } from 'node:crypto';
import type { IapPlatform } from './verifier.js';

/**
 * Store webhook authentication (KUR-112). Today Kurda authenticates refund
 * webhooks with a shared secret compared in constant time. The production
 * target is full provider-signature verification — Apple App Store Server
 * Notifications V2 (a signed JWS chain) and Google RTDN (Pub/Sub push with a
 * verified OIDC token). That plugs in behind `WebhookVerifier` once the
 * provider certificates/keys are configured; the shared secret stays as the
 * dev/self-hosted fallback.
 *
 * See docs/security/payment-security-review.md for the full threat model.
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
 * Shared-secret verifier: the `x-iap-secret` header must match the configured
 * secret (constant-time). Returns false when no secret is configured so the
 * endpoint fails closed.
 */
export class SharedSecretWebhookVerifier implements WebhookVerifier {
  constructor(private readonly secret: string | undefined) {}

  verify(_platform: IapPlatform, headers: Record<string, unknown>): boolean {
    if (!this.secret) return false;
    const provided = headers['x-iap-secret'];
    return typeof provided === 'string' && safeEqual(provided, this.secret);
  }
}
