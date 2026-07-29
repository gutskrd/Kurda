/**
 * Spam / repetition escalation (KUR-295). Pure and deterministic: given how
 * often a user is repeating near-identical content and how fast they are
 * posting, decide the graduated response — allow → throttle → auto-mute →
 * auto-suspend — and whether to enqueue the account for human review (#102).
 * The write path gathers the signals (recent content + burst count) and applies
 * the returned action; every automated action is reversible + audited (#104).
 */

/** Normalize content for near-identical comparison: lowercase, NFC, collapse
 *  whitespace. Shared with the AI-moderation spam path (#293). */
export function normalizeContent(text: string): string {
  return text.toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim();
}

/**
 * How many of the recent messages are near-identical to the candidate,
 * counting the candidate itself. v1 treats "near-identical" as equal after
 * normalization; fuzzier matching (edit distance) can extend this later.
 */
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
  /** enqueue the account for moderator review (#102) — at mute or worse */
  queueForReview: boolean;
}

/**
 * Decide the response to a message from its spam signals: the most severe of
 * the repetition and burst escalations. Muting or suspending also queues the
 * account for review so a human confirms (and can reverse) the automated call.
 */
export function evaluateSpam(signals: SpamSignals): SpamVerdict {
  const action = mostSevere(repeatAction(signals.repeatCount), burstAction(signals.burstCount));
  return { action, queueForReview: severity(action) >= severity('mute') };
}
