/**
 * Economy metrics: the drift check on currency created (faucets) against destroyed (sinks). Admin adjustments,
 * migrations and backfills are excluded by reason code so they never distort inflation figures.
 */

/** Reason codes that move balances but aren't real faucets/sinks. */
export const EXCLUDED_REASONS = new Set(['admin_adjustment', 'migration', 'backfill']);

/**
 * Reason codes that gave spent currency back. A refund undoes a counted sink, so it counts as negative spending,
 * never as a faucet that could set off the drift alert. Nothing writes these now, but the ledger keeps the old
 * rows and a re-aggregated day must count them the same way.
 */
export const REFUND_REASONS = new Set(['shop_return']);

/** Weekly faucet/sink ratio may drift this far from target before alerting. */
export const DRIFT_THRESHOLD = 0.2;

/**
 * Faucet/sink ratio (>1 inflationary, <1 deflationary). With no sink, or refunds outweighing spending, it is
 * Infinity when anything was created and 1 when nothing was.
 */
export function driftRatio(faucet: number, sink: number): number {
  if (sink <= 0) return faucet <= 0 ? 1 : Infinity;
  return faucet / sink;
}

/** Whether the ratio is more than `threshold` away from `target`; a target of 1 means faucets and sinks balance. */
export function isDrifting(ratio: number, target = 1, threshold = DRIFT_THRESHOLD): boolean {
  if (!Number.isFinite(ratio)) return true;
  if (target <= 0) return ratio !== 0;
  return Math.abs(ratio - target) / target > threshold;
}
