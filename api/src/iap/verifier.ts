import type { AppConfig } from '../config/env.js';
import { AppError } from '../plugins/errors.js';

export type IapPlatform = 'apple' | 'google';
export type IapEnvironment = 'sandbox' | 'production';
/** Apple `inApp[].in_app_ownership_type`; 'purchased' unless family-shared. */
export type OwnershipType = 'purchased' | 'family_shared';

export interface VerifiedReceipt {
  valid: boolean;
  /** the store's unique transaction id — the idempotency anchor. */
  transactionId: string;
  productId: string;
  environment: IapEnvironment;
  /** family-shared receipts are exempt from receipt-reuse fraud flags (KUR-073). */
  ownershipType: OwnershipType;
}

/**
 * Server-to-server receipt validation (KUR-072). The real Apple (App Store
 * Server API) and Google (Play Developer API) verifiers plug in behind this
 * interface; the shape they return is all the IapService needs. Kept abstract
 * so the grant/dedup/refund logic is fully testable without live store
 * credentials — the same pattern as the speaking scorer (real model = KUR-120).
 */
export interface ReceiptVerifier {
  verify(platform: IapPlatform, token: string, productId: string): Promise<VerifiedReceipt>;
}

/**
 * Dev/test verifier: the token is a JSON blob describing the receipt, so tests
 * (and local development without store accounts) can drive every branch
 * deterministically.
 *
 * Never selected in production — createReceiptVerifier will not hand it out
 * there, because every field it returns is taken from the token it was given.
 */
export class StubReceiptVerifier implements ReceiptVerifier {
  async verify(_platform: IapPlatform, token: string, productId: string): Promise<VerifiedReceipt> {
    let parsed: {
      transactionId?: string;
      environment?: IapEnvironment;
      valid?: boolean;
      ownershipType?: OwnershipType;
    };
    try {
      parsed = JSON.parse(token) as typeof parsed;
    } catch {
      return { valid: false, transactionId: '', productId, environment: 'sandbox', ownershipType: 'purchased' };
    }
    return {
      valid: parsed.valid !== false && Boolean(parsed.transactionId),
      transactionId: parsed.transactionId ?? '',
      productId,
      environment: parsed.environment ?? 'sandbox',
      ownershipType: parsed.ownershipType ?? 'purchased',
    };
  }
}

/**
 * The verifier a production deploy gets when it has no store credentials.
 *
 * It refuses every receipt, which is the only safe thing an unverified
 * environment can do. IAP_ALLOW_STUB exists so such a deploy can *boot* — that
 * is all it was ever meant to buy — and the stub used to be handed out to
 * satisfy it. That was the wrong shape: the stub answers `valid: true` to any
 * JSON carrying a transactionId, and every field it reports comes from the
 * token, so the caller also chooses `environment: 'production'` and walks
 * through the sandbox check on the way past. The only thing standing between
 * that and free currency was whether anyone had added a row to `gem_packs` —
 * which is a thing you do on the way to launch, not a security control.
 */
export class UnavailableReceiptVerifier implements ReceiptVerifier {
  async verify(): Promise<VerifiedReceipt> {
    throw new AppError(
      'IAP_UNAVAILABLE',
      503,
      'purchases are not available on this deployment yet',
    );
  }
}

/**
 * Select the verifier for the current environment. Real store verifiers are
 * wired here once their credentials are configured; until then (and in tests)
 * the stub is used.
 *
 * Production without a real verifier is a hard error, so we never silently
 * accept unverified receipts on the live store. A deployment may opt out of
 * the crash with IAP_ALLOW_STUB=true — but what it gets is the verifier that
 * refuses, not the one that approves. Booting without store credentials and
 * granting purchases without store credentials are different requests, and
 * only the first one is reasonable.
 */
export function createReceiptVerifier(config: AppConfig): ReceiptVerifier {
  // NOTE: AppleReceiptVerifier / GoogleReceiptVerifier (real S2S calls) plug in
  // here when APPLE/GOOGLE store credentials land — follow-up, needs live
  // store accounts to integration-test. Until then dev/test use the stub.
  if (config.NODE_ENV === 'production') {
    if (config.IAP_ALLOW_STUB !== 'true') {
      throw new Error(
        'IAP: no production receipt verifier configured (store credentials required). ' +
          'Set IAP_ALLOW_STUB=true only for a dev/testing deploy without store credentials.',
      );
    }
    return new UnavailableReceiptVerifier();
  }
  return new StubReceiptVerifier();
}
