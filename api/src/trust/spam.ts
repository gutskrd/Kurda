/**
 * Pure spam escalation: from how often a user repeats near-identical content and how fast they post, the graduated
 * response (allow, throttle, auto-mute, auto-suspend) and whether to queue the account for human review. The write
 * path gathers the signals and applies the action; every automated action is reversible and audited.
 */

/** Normalizes content for near-identical comparison: lowercase, NFC, whitespace collapsed; shared with automated moderation. */
export function normalizeContent(text: string): string {
  return text.toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim();
}

/** How many recent messages are near-identical to the candidate, the candidate included; near-identical means equal after normalizing. */
export function countNearIdentical(recent: readonly string[], candidate: string): number {
  const c = normalizeContent(candidate);
  let count = 1; // the candidate
  for (const r of recent) if (normalizeContent(r) === c) count++;
  return count;
}

export type AbuseAction = 'allow' | 'throttle' | 'mute' | 'suspend';

/** Repetition thresholds (count of near-identical, incl. the current one). */
export const REPEAT_THROTTLE = 3;
export const REPEAT_MUTE = 5;
export const REPEAT_SUSPEND = 8;

/** Burst thresholds (messages in the burst window). */
export const BURST_THROTTLE = 10;
export const BURST_SUSPEND = 30;

const SEVERITY: Record<AbuseAction, number> = { allow: 0, throttle: 1, mute: 2, suspend: 3 };
const severity = (a: AbuseAction): number => SEVERITY[a] ?? 0;

function repeatAction(count: number): AbuseAction {
  if (count >= REPEAT_SUSPEND) return 'suspend';
  if (count >= REPEAT_MUTE) return 'mute';
  if (count >= REPEAT_THROTTLE) return 'throttle';
  return 'allow';
}

function burstAction(count: number): AbuseAction {
  if (count >= BURST_SUSPEND) return 'suspend';
  if (count >= BURST_THROTTLE) return 'throttle';
  return 'allow';
}

/** The more severe of two responses. */
export function mostSevere(a: AbuseAction, b: AbuseAction): AbuseAction {
  return severity(b) > severity(a) ? b : a;
}

export interface SpamSignals {
  /** near-identical repeat count including the current message */
  repeatCount: number;
  /** messages sent in the burst window */
  burstCount: number;
}

export interface SpamVerdict {
  action: AbuseAction;
  /** Queue the account for moderator review, at mute or worse. */
  queueForReview: boolean;
}

/**
 * The response to a message from its spam signals: the more severe of the repetition and burst escalations. Muting or
 * suspending also queues the account so a human confirms or reverses the automated call.
 */
export function evaluateSpam(signals: SpamSignals): SpamVerdict {
  const action = mostSevere(repeatAction(signals.repeatCount), burstAction(signals.burstCount));
  return { action, queueForReview: severity(action) >= severity('mute') };
}
