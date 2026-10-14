/**
 * Economy metrics (KUR-074). Pure aggregation of currency created (faucets) vs
 * destroyed (sinks) from wallet-ledger rows, plus the drift check. Admin
 * adjustments / migrations / backfills are excluded so they never distort
 * inflation stats (ledger reason codes drive the exclusion).
 */

/** Reason codes that move balances but aren't real faucets/sinks. */
export const EXCLUDED_REASONS = new Set(['admin_adjustment', 'migration', 'backfill']);

/**
 * Reason codes that give spent currency back. A refund creates nothing — it
 * undoes a sink that was already counted — so it is counted as negative
 * spending, never as a faucet. Otherwise a wave of returns (a replaced shop
 * item handed back, shop/returns.ts) would look like inflation and could set
 * off the drift alert, while the purchases it undoes stayed counted as sinks.
 */
export const REFUND_REASONS = new Set(['shop_return']);

/** Weekly faucet/sink ratio may drift this far from target before alerting. */
export const DRIFT_THRESHOLD = 0.2;

export interface LedgerEntry {
  /** signed: positive = created (faucet), negative = destroyed (sink). */
  amount: number;
  reason: string;
}

export interface FaucetSink {
  faucet: number;
  sink: number;
  /** faucet − sink: net currency added to (or removed from) supply. */
  net: number;
}

/**
 * Total created vs destroyed over a set of ledger rows, excluding non-economy
 * reasons. Refunds come off the sink, so `sink` is spending net of what was
 * given back — below zero in a period that gave back more than it took.
 */
export function faucetSink(entries: LedgerEntry[]): FaucetSink {
  let faucet = 0;
  let sink = 0;
  for (const e of entries) {
    if (EXCLUDED_REASONS.has(e.reason)) continue;
    if (REFUND_REASONS.has(e.reason)) sink -= e.amount;
    else if (e.amount > 0) faucet += e.amount;
    else sink += -e.amount;
  }
  return { faucet, sink, net: faucet - sink };
}

/**
 * Faucet/sink ratio (>1 = inflationary, <1 = deflationary). A period with no
 * sink — or one whose refunds outweighed its spending — returns Infinity when
 * anything was created, or 1 when nothing was.
 */
export function driftRatio(faucet: number, sink: number): number {
  if (sink <= 0) return faucet <= 0 ? 1 : Infinity;
  return faucet / sink;
}

/**
 * Is the ratio more than `threshold` (default 20%) away from `target`? A target
 * of 1.0 means faucets and sinks should roughly balance.
 */
export function isDrifting(ratio: number, target = 1, threshold = DRIFT_THRESHOLD): boolean {
  if (!Number.isFinite(ratio)) return true;
  if (target <= 0) return ratio !== 0;
  return Math.abs(ratio - target) / target > threshold;
}
