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
  /** Family-shared receipts are exempt from receipt-reuse fraud flags. */
  ownershipType: OwnershipType;
}

/**
 * Server-to-server receipt validation. Real store verifiers plug in behind this interface; keeping it abstract lets
 * the grant, deduplication and refund logic be tested without store credentials.
 */
export interface ReceiptVerifier {
  verify(platform: IapPlatform, token: string, productId: string): Promise<VerifiedReceipt>;
}

/**
 * Dev and test verifier: the token is a JSON blob describing the receipt, so tests can drive every branch. Never
 * used in production, since every field comes from the token: createReceiptVerifier will not return it there, and
 * `assertProductionVerifier` stops the app if one is passed in anyway.
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
 * The verifier a production deploy without store credentials gets: it refuses every receipt, the only safe answer
 * without verification. IAP_PURCHASES_OFF (or its older name IAP_ALLOW_STUB) lets such a deploy boot and nothing
 * more; it must never yield the stub, which accepts any JSON carrying a transactionId.
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

/** Store purchases are switched off, by the flag or its older name. */
export function purchasesOff(config: AppConfig): boolean {
  return config.IAP_PURCHASES_OFF === 'true' || config.IAP_ALLOW_STUB === 'true';
}

/**
 * Selects the verifier for the environment: the stub outside production. Production without a real verifier is a
 * hard error, so unverified receipts are never accepted; IAP_PURCHASES_OFF=true avoids the crash by selecting the
 * verifier that refuses, never one that approves.
 */
export function createReceiptVerifier(config: AppConfig): ReceiptVerifier {
  // Real store verifiers plug in here once store credentials exist.
  if (config.NODE_ENV === 'production') {
    if (!purchasesOff(config)) {
      throw new Error(
        'IAP: no production receipt verifier configured (store credentials required). ' +
          'Set IAP_PURCHASES_OFF=true to boot with store purchases switched off.',
      );
    }
    return assertProductionVerifier(config, new UnavailableReceiptVerifier());
  }
  return new StubReceiptVerifier();
}

/**
 * The last check before a verifier is used: under NODE_ENV=production a stub, however it arrived, stops the process
 * from starting. Returns the verifier it was given.
 */
export function assertProductionVerifier<T extends ReceiptVerifier>(config: AppConfig, verifier: T): T {
  if (config.NODE_ENV === 'production' && verifier instanceof StubReceiptVerifier) {
    throw new Error('IAP: the test receipt verifier must never run in production; it believes whatever a receipt says');
  }
  return verifier;
}
