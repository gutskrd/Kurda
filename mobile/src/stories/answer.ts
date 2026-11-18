import { ANSWER_GRACE_MS, type StoryGameView } from '@kurda/shared';
import type { ApiError, ApiResult } from '../api/types';

/**
 * Sending one answer over a phone network (contract §A1, "Network rules"). The same `{index, choice}` is resent
 * until it gets through or the question closes (`phaseEndsAt + ANSWER_GRACE_MS`). ALREADY_ANSWERED counts as
 * success, since only the first reply was lost; NOT_CURRENT means the game moved on, so the screen just refetches;
 * TOO_LATE is the one the player is told about.
 *
 * A question without a deadline (an untimed solo game) is tried a few times, then handed back as failed with the
 * choice kept for resending.
 */

type AnswerOutcome =
  | { kind: 'accepted'; view: StoryGameView }
  | { kind: 'already' }
  | { kind: 'not-current' }
  | { kind: 'too-late' }
  | { kind: 'failed'; error: ApiError };

/** Waits between tries: quick at first, so a longer outage gets fewer requests. */
const ANSWER_RETRY_MS = [600, 1_200, 2_500, 4_000] as const;
/** Tries for an untimed question before the player is asked to resend. */
const UNTIMED_ATTEMPTS = 4;

interface AnswerDeps {
  send: () => Promise<ApiResult<StoryGameView>>;
  /** Server time in ms (the game's corrected clock). */
  serverNow: () => number;
  /** When the question stops taking this player's answers, or null when it never does. */
  phaseEndsAt: string | null;
  sleep?: (ms: number) => Promise<void>;
  /** True once the screen has moved past this question: retries stop, as for NOT_CURRENT. */
  movedOn?: () => boolean;
}

const RETRYABLE: ReadonlySet<ApiError['kind']> = new Set(['network', 'server', 'rate_limited']);

export async function sendAnswer(deps: AnswerDeps): Promise<AnswerOutcome> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const closesAt = deps.phaseEndsAt ? Date.parse(deps.phaseEndsAt) + ANSWER_GRACE_MS : null;
  for (let attempt = 0; ; attempt += 1) {
    const res = await deps.send();
    if (res.ok) return { kind: 'accepted', view: res.data };
    const code = res.error.code;
    if (code === 'ALREADY_ANSWERED') return { kind: 'already' };
    if (code === 'NOT_CURRENT') return { kind: 'not-current' };
    if (code === 'TOO_LATE') return { kind: 'too-late' };
    if (!RETRYABLE.has(res.error.kind)) return { kind: 'failed', error: res.error };
    let wait = res.error.retryAfterSec ? res.error.retryAfterSec * 1000 : ANSWER_RETRY_MS[Math.min(attempt, ANSWER_RETRY_MS.length - 1)]!;
    if (closesAt === null) {
      if (attempt + 1 >= UNTIMED_ATTEMPTS) return { kind: 'failed', error: res.error };
    } else {
      // The last try goes out just before the question closes, never after.
      const left = closesAt - deps.serverNow() - 300;
      if (left <= 0) return { kind: 'too-late' };
      wait = Math.min(wait, left);
    }
    await sleep(wait);
    if (deps.movedOn?.()) return { kind: 'not-current' };
  }
}
