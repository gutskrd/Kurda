import type { AppConfig } from '../config/env.js';

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
 * deterministically. Never selected in production.
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
 * Select the verifier for the current environment. Real store verifiers are
 * wired here once their credentials are configured; until then (and in tests)
 * the stub is used. Production without a real verifier is a hard error so we
 * never silently accept unverified receipts on the live store — UNLESS the
 * deployment explicitly opts in with IAP_ALLOW_STUB=true, for a dev/testing
 * environment that has no store credentials (never a real store-facing one).
 */
export function createReceiptVerifier(config: AppConfig): ReceiptVerifier {
  // NOTE: AppleReceiptVerifier / GoogleReceiptVerifier (real S2S calls) plug in
  // here when APPLE/GOOGLE store credentials land — follow-up, needs live
  // store accounts to integration-test. Until then dev/test use the stub.
  if (config.NODE_ENV === 'production' && config.IAP_ALLOW_STUB !== 'true') {
    throw new Error(
      'IAP: no production receipt verifier configured (store credentials required). ' +
        'Set IAP_ALLOW_STUB=true only for a dev/testing deploy without store credentials.',
    );
  }
  return new StubReceiptVerifier();
}
