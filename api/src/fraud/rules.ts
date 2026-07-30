/**
 * Payment-fraud rules (KUR-073). Pure and deterministic: given signals gathered
 * from the purchase history, decide which flags fire and whether the purchase
 * should be held for review. No bans — a hold is reversible and always ends in
 * a human decision. Family-shared purchases are exempt from receipt-reuse so
 * legitimate Apple family sharing never trips the wire.
 */

/** More than this many IAP redemptions in the trailing hour is suspicious. */
export const VELOCITY_MAX_PER_HOUR = 6;
/** This many refunds-after-spend marks a refund-abuse pattern. */
export const REFUND_ABUSE_THRESHOLD = 2;

export type FraudFlag = 'VELOCITY' | 'REFUND_ABUSE' | 'RECEIPT_REUSE';

export interface FraudSignals {
  /** redemptions by this account in the last hour (including the current one). */
  purchasesLastHour: number;
  /** past refunds where Gems had already been (partly) spent. */
  refundsAfterSpend: number;
  /** a different account already redeemed this exact store transaction. */
  receiptReusedAcrossAccounts: boolean;
  /** the store marked this receipt as family-shared. */
  familyShared: boolean;
}

export interface FraudVerdict {
  flagged: boolean;
  /** hold the purchase for review (never an automatic ban). */
  hold: boolean;
  flags: FraudFlag[];
}

export function evaluate(signals: FraudSignals): FraudVerdict {
  const flags: FraudFlag[] = [];

  if (signals.purchasesLastHour > VELOCITY_MAX_PER_HOUR) flags.push('VELOCITY');
  if (signals.refundsAfterSpend >= REFUND_ABUSE_THRESHOLD) flags.push('REFUND_ABUSE');
  // family sharing legitimately reuses entitlements — don't flag it
  if (signals.receiptReusedAcrossAccounts && !signals.familyShared) flags.push('RECEIPT_REUSE');

  return { flagged: flags.length > 0, hold: flags.length > 0, flags };
}
