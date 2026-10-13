import { ANSWER_GRACE_MS, type StoryGameView } from '@kurda/shared';
import type { ApiError, ApiResult } from '../api/types';

/**
 * Sending one answer over a phone network (contract §A1, "Network rules").
 *
 * The same `{index, choice}` is sent again until it gets through or the
 * question can no longer take it — its deadline plus the grace an answer
 * still has (`phaseEndsAt + ANSWER_GRACE_MS`). The server answers a repeat it
 * already has with ALREADY_ANSWERED, which is success here: the first try did
 * arrive, only its reply was lost. NOT_CURRENT means the game moved on (the
 * question closed for everyone): nothing to say, the screen just fetches the
 * game again. TOO_LATE is the one the player is told about, plainly.
 *
 * A question with no deadline (a solo game without a timer) is tried a few
 * times and then handed back as failed, with the choice kept so the player
 * can send it again.
 */

export type AnswerOutcome =
  | { kind: 'accepted'; view: StoryGameView }
  | { kind: 'already' }
  | { kind: 'not-current' }
  | { kind: 'too-late' }
  | { kind: 'failed'; error: ApiError };

/** Waits between tries: quick at first, a network that is down for longer gets fewer requests. */
export const ANSWER_RETRY_MS = [600, 1_200, 2_500, 4_000] as const;
/** Tries for a question with no deadline before the player is asked to send it again. */
export const UNTIMED_ATTEMPTS = 4;

export interface AnswerDeps {
  send: () => Promise<ApiResult<StoryGameView>>;
  /** server time in ms (the game's corrected clock) */
  serverNow: () => number;
  /** when the question stops taking answers for this player, or null when it never does */
  phaseEndsAt: string | null;
  sleep?: (ms: number) => Promise<void>;
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
      // the last try goes out just before the question closes, never after it
      const left = closesAt - deps.serverNow() - 300;
      if (left <= 0) return { kind: 'too-late' };
      wait = Math.min(wait, left);
    }
    await sleep(wait);
  }
}
