/**
 * Behavioral bot scoring (KUR-110). Combines independent behavioral signals into
 * a single suspicion score that drives two graduated responses: an invisible
 * CAPTCHA challenge on the next session, and — at high confidence — reversal of
 * ill-gotten XP/currency through the ledger.
 *
 * Every signal is a 0..1 anomaly level except the device signal, which is
 * derived from an account-per-fingerprint count. Weights sum to 1, and the
 * device weight is deliberately BELOW the challenge threshold, so a shared
 * classroom device (many legitimate accounts) can never on its own flag anyone
 * — the edge case. The device signal only tips borderline cases.
 */

export interface BotSignals {
  /** Inhuman lesson pacing (answers far faster than humanly possible). */
  pacingAnomaly: number;
  /** 24/7 activity with no human rest pattern. */
  uptimeAnomaly: number;
  /** Suspiciously uniform answer-timing distribution (scripted). */
  timingUniformity: number;
  /** Accounts sharing this device fingerprint. */
  deviceAccountCount: number;
}

export const SIGNAL_WEIGHTS = {
  pacing: 0.3,
  uptime: 0.25,
  timing: 0.3,
  device: 0.15,
} as const;

/** score ≥ this ⇒ invisible CAPTCHA challenge next session. */
export const CHALLENGE_THRESHOLD = 0.4;
/** score ≥ this ⇒ high-confidence bot; gains are reversal candidates. */
export const FLAG_THRESHOLD = 0.6;

// A few shared accounts on one device is normal (classroom); suspicion only
// grows past a grace count and saturates, so it stays a weak, secondary signal.
const DEVICE_GRACE = 3;
const DEVICE_SATURATION = 12;

/** Map an account-per-device count to a 0..1 signal (0 for ordinary sharing). */
export function deviceSignal(accountCount: number): number {
  if (accountCount <= DEVICE_GRACE) return 0;
  const over = accountCount - DEVICE_GRACE;
  return Math.min(1, over / (DEVICE_SATURATION - DEVICE_GRACE));
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export type BotTier = 'clear' | 'challenge' | 'flagged';

export interface BotScore {
  score: number;
  tier: BotTier;
  /** Present an invisible CAPTCHA on the next session. */
  challenge: boolean;
  /** High-confidence: eligible for XP/currency reversal on confirmation. */
  flagged: boolean;
}

/** Weighted suspicion score + graduated response for an account. */
export function scoreAccount(signals: BotSignals): BotScore {
  const score =
    SIGNAL_WEIGHTS.pacing * clamp01(signals.pacingAnomaly) +
    SIGNAL_WEIGHTS.uptime * clamp01(signals.uptimeAnomaly) +
    SIGNAL_WEIGHTS.timing * clamp01(signals.timingUniformity) +
    SIGNAL_WEIGHTS.device * deviceSignal(signals.deviceAccountCount);

  const tier: BotTier = score >= FLAG_THRESHOLD ? 'flagged' : score >= CHALLENGE_THRESHOLD ? 'challenge' : 'clear';
  return { score, tier, challenge: tier !== 'clear', flagged: tier === 'flagged' };
}
