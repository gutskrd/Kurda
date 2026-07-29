/**
 * Signup & login risk scoring (KUR-296). Pure and deterministic: combine
 * device / IP / velocity / email signals into a 0–100 risk score, map it to an
 * action (proceed / step-up / verify-or-block), and enforce per-device and
 * per-IP account-creation caps. This is the decision layer that #017 (email),
 * #025 (CAPTCHA), #297 (phone), and #295 (velocity limits) plug into — it does
 * not replace them. No I/O; the auth boundary gathers the signals and applies
 * the returned action.
 */

/** IP reputation from a provider (datacenter / VPN / known-abuse lists). */
export type IpReputation = 'clean' | 'suspicious' | 'malicious';

export interface RiskSignals {
  ipReputation: IpReputation;
  /** this device has been seen before tied to a good-standing account */
  deviceKnownGood: boolean;
  /** accounts created from this device in the recent window */
  accountsFromDeviceRecently: number;
  /** accounts created from this IP in the recent window */
  accountsFromIpRecently: number;
  /** the email is from a disposable-domain (#025) */
  disposableEmail: boolean;
  /** request velocity, per minute */
  velocityPerMin: number;
  /** geo / timezone mismatch vs. the account's usual */
  geoMismatch: boolean;
  /** a shared IP (campus / café) — softens IP volume, never device volume */
  sharedNetwork: boolean;
}

/** Scoring weights (points added to the risk score). Tunable defaults. */
export const RISK_WEIGHTS = {
  ipSuspicious: 20,
  ipMalicious: 45,
  disposableEmail: 25,
  perExtraDeviceAccount: 15,
  perExtraIpAccount: 8,
  highVelocity: 20,
  geoMismatch: 10,
  knownGoodDevice: -25,
} as const;

/** Requests/min at or above which velocity is treated as risky. */
export const VELOCITY_RISK_THRESHOLD = 10;
/** IP volume is discounted this much on a shared network (device is not). */
export const SHARED_NETWORK_IP_FACTOR = 0.25;

/** Combine the signals into a 0–100 risk score (higher = riskier). */
export function computeRiskScore(signals: RiskSignals): number {
  let score = 0;

  if (signals.ipReputation === 'suspicious') score += RISK_WEIGHTS.ipSuspicious;
  else if (signals.ipReputation === 'malicious') score += RISK_WEIGHTS.ipMalicious;

  if (signals.disposableEmail) score += RISK_WEIGHTS.disposableEmail;

  // Multiple accounts from one physical device is suspicious even on a shared
  // network, so device volume always counts at full weight.
  const deviceExtra = Math.max(0, signals.accountsFromDeviceRecently - 1);
  score += deviceExtra * RISK_WEIGHTS.perExtraDeviceAccount;

  // IP volume is softened on shared networks (classroom / café) so a busy
  // campus isn't punished on IP alone.
  const ipExtra = Math.max(0, signals.accountsFromIpRecently - 1);
  const ipFactor = signals.sharedNetwork ? SHARED_NETWORK_IP_FACTOR : 1;
  score += ipExtra * RISK_WEIGHTS.perExtraIpAccount * ipFactor;

  if (signals.velocityPerMin >= VELOCITY_RISK_THRESHOLD) score += RISK_WEIGHTS.highVelocity;
  if (signals.geoMismatch) score += RISK_WEIGHTS.geoMismatch;
  if (signals.deviceKnownGood) score += RISK_WEIGHTS.knownGoodDevice;

  return Math.round(Math.min(100, Math.max(0, score)));
}

export type RiskBand = 'low' | 'medium' | 'high';

export const MEDIUM_RISK_THRESHOLD = 30;
export const HIGH_RISK_THRESHOLD = 60;

export function riskBand(score: number): RiskBand {
  if (score >= HIGH_RISK_THRESHOLD) return 'high';
  if (score >= MEDIUM_RISK_THRESHOLD) return 'medium';
  return 'low';
}

/**
 * The action to take:
 *  - `proceed`         — allow with no added friction.
 *  - `step_up`         — require a stronger check (visible CAPTCHA #025 and/or
 *                        email verification #017 before activation).
 *  - `verify_or_block` — require phone verification (#297) or soft-block for review.
 */
export type RiskAction = 'proceed' | 'step_up' | 'verify_or_block';

export function actionForBand(band: RiskBand): RiskAction {
  switch (band) {
    case 'low':
      return 'proceed';
    case 'medium':
      return 'step_up';
    case 'high':
      return 'verify_or_block';
  }
}

/** Per-device / per-IP account-creation caps within the recent window. */
export const MAX_ACCOUNTS_PER_DEVICE = 3;
export const MAX_ACCOUNTS_PER_IP = 10;
/** A shared network gets a much higher IP cap (many real users behind one IP). */
export const MAX_ACCOUNTS_PER_SHARED_IP = 50;

export interface CapCheck {
  device: boolean;
  ip: boolean;
  /** either cap exceeded → hard-block regardless of score */
  blocked: boolean;
}

export function exceedsSignupCap(signals: RiskSignals): CapCheck {
  const device = signals.accountsFromDeviceRecently > MAX_ACCOUNTS_PER_DEVICE;
  const ipCap = signals.sharedNetwork ? MAX_ACCOUNTS_PER_SHARED_IP : MAX_ACCOUNTS_PER_IP;
  const ip = signals.accountsFromIpRecently > ipCap;
  return { device, ip, blocked: device || ip };
}

export interface RiskAssessment {
  score: number;
  band: RiskBand;
  action: RiskAction;
  /** true when a per-device/IP cap was exceeded (overrides the band action) */
  hardBlock: boolean;
}

/**
 * Full assessment: score → band → action, with a cap breach overriding the
 * band to force `verify_or_block`. The decision, its score, and the
 * contributing signals should be logged for tuning + audit (#104).
 */
export function assessRisk(signals: RiskSignals): RiskAssessment {
  const score = computeRiskScore(signals);
  const band = riskBand(score);
  const hardBlock = exceedsSignupCap(signals).blocked;
  const action: RiskAction = hardBlock ? 'verify_or_block' : actionForBand(band);
  return { score, band, action, hardBlock };
}
