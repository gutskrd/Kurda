/**
 * Pure sign-up and sign-in risk scoring: device, address, velocity and email signals become a 0–100 score, mapped to
 * an action (proceed, step up, verify or block), with per-device and per-address account caps. The auth boundary
 * gathers the signals and applies the action; email verification, CAPTCHA, phone checks and velocity limits plug in
 * there.
 */

/** IP reputation from a provider (datacenter / VPN / known-abuse lists). */
export type IpReputation = 'clean' | 'suspicious' | 'malicious';

export interface RiskSignals {
  ipReputation: IpReputation;
  /** this device has been seen before tied to a good-standing account */
  deviceKnownGood: boolean;
  /** accounts created from this device in the recent window */
  accountsFromDeviceRecently: number;
  /** accounts created from this network (an IPv4 address, or an IPv6 /64) in the recent window */
  accountsFromIpRecently: number;
  /** The email is from a disposable domain. */
  disposableEmail: boolean;
  /** request velocity, per minute */
  velocityPerMin: number;
  /** geo / timezone mismatch vs. the account's usual */
  geoMismatch: boolean;
  /** A shared network (campus, café, carrier NAT), by reputation or because many established accounts use it; softens address volume, never device volume. */
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

  // Several accounts from one device is suspicious even on a shared network, so device volume always counts fully.
  const deviceExtra = Math.max(0, signals.accountsFromDeviceRecently - 1);
  score += deviceExtra * RISK_WEIGHTS.perExtraDeviceAccount;

  // Address volume is softened on shared networks, so a busy campus is not punished on address alone.
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
 *  - `proceed`: no added friction
 *  - `step_up`: a stronger check (visible CAPTCHA and/or email verification before activation)
 *  - `verify_or_block`: phone verification, or a soft block for review
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
  /** A per-device or per-address cap was exceeded, overriding the band's action. */
  hardBlock: boolean;
}

/** The full assessment: score, band and action, with a cap breach forcing `verify_or_block`. Log the decision and signals for tuning and audit. */
export function assessRisk(signals: RiskSignals): RiskAssessment {
  const score = computeRiskScore(signals);
  const band = riskBand(score);
  const hardBlock = exceedsSignupCap(signals).blocked;
  const action: RiskAction = hardBlock ? 'verify_or_block' : actionForBand(band);
  return { score, band, action, hardBlock };
}
