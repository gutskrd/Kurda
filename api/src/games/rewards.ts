/**
 * What a finished solo round of a learning game pays, and what it counts for.
 *
 * Rewards follow performance, never opening or finishing a game:
 * - every item answered right pays by its level (`answerXp`): 1 XP at levels
 *   1–2, 2 at level 3, 3 at levels 4–5, and one more for a first try;
 * - an item the learner answered right in the last GAME_REPEAT_XP_DAYS days
 *   pays nothing — read from `game_seen` here, at the finish, under a lock per
 *   learner and game, so two rounds finishing together cannot both pay for it;
 * - the round is learning — XP, the streak, the daily goal — only when at
 *   least half of it was answered right (`roundCountsAsLearning`); a round
 *   tapped through pays nothing at all, as an empty practice session does;
 * - the XP goes to the game's own source, which is one of the API's game
 *   sources (GAME_XP_SOURCES), so the league's daily cap on game XP applies;
 *   its ref is `${sessionId}:${userId}`, unique to the learner, so XpService
 *   pays it once whatever happens;
 * - no Zêr and no Gewher, ever.
 *
 * Runs inside the caller's transaction (the one that closes the round), so a
 * round finished at 23:59 is learning on the day it was played.
 */
import type pg from 'pg';
import { GAME_REPEAT_XP_DAYS, answerXp, roundCountsAsLearning, type SoloResults } from '@kurda/shared';
import type { XpService } from '../xp/service.js';
import type { StreakService } from '../streaks/service.js';
import type { DailyGoalService } from '../goals/service.js';
import { safeTimeZone } from '../streaks/streak-logic.js';

export interface RewardDeps {
  xp: XpService;
  streaks: StreakService;
  goals: DailyGoalService;
}

/** How one item of the round went, as the finish reads it from the answers. */
export interface ItemOutcome {
  index: number;
  key: string;
  level: number;
  /** tried at all */
  answered: boolean;
  correct: boolean;
  firstTry: boolean;
}

export interface RoundToPay {
  sessionId: string;
  userId: string;
  game: string;
  /** the game's XP ledger source (its registry entry's) */
  source: string;
  items: readonly ItemOutcome[];
  now: Date;
}

/**
 * Pay a finished round and record what it was seen to cover. Returns the
 * results as the learner is shown them.
 */
export async function payRound(client: pg.PoolClient, deps: RewardDeps, round: RoundToPay): Promise<SoloResults> {
  const { sessionId, userId, game, items, now } = round;
  // one finish of this learner's rounds of this game at a time: the repeat check below is then one answer
  await client.query(`SELECT pg_advisory_xact_lock(hashtextextended('game-finish:' || $1 || ':' || $2, 0))`, [userId, game]);

  const keys = items.filter((i) => i.answered).map((i) => i.key);
  const seen = await client.query<{ item_key: string; recent: boolean }>(
    `SELECT item_key, (last_correct_at > $4::timestamptz - make_interval(days => $5)) AS recent
       FROM game_seen WHERE user_id = $1 AND game = $2 AND item_key = ANY($3::text[])`,
    [userId, game, keys, now, GAME_REPEAT_XP_DAYS],
  );
  const recent = new Set(seen.rows.filter((r) => r.recent).map((r) => r.item_key));

  const correct = items.filter((i) => i.correct).length;
  const firstTry = items.filter((i) => i.correct && i.firstTry).length;
  const total = items.length;
  const learning = roundCountsAsLearning(correct, total);
  const shown = items.map((i) => {
    const repeat = recent.has(i.key);
    return { index: i.index, correct: i.correct, firstTry: i.correct && i.firstTry, repeat, xp: learning ? answerXp(i.level, { correct: i.correct, firstTry: i.firstTry, repeat }) : 0 };
  });
  const earned = shown.reduce((sum, i) => sum + i.xp, 0);

  let xp = 0;
  let streak: number | null = null;
  if (learning) {
    if (earned > 0) xp = await deps.xp.award({ userId, source: round.source, amount: earned, refId: `${sessionId}:${userId}` }, client);
    const user = await client.query<{ timezone: string | null }>(`SELECT timezone FROM users WHERE id = $1`, [userId]);
    const tz = safeTimeZone(user.rows[0]?.timezone);
    streak = (await deps.streaks.recordActivity(userId, tz, now, client)).current;
    await deps.goals.evaluate(client, userId, tz, now);
  }

  // what the round covered, for the next round's choice and the next repeat check
  const answered = items.filter((i) => i.answered);
  if (answered.length > 0) {
    await client.query(
      `INSERT INTO game_seen (user_id, game, item_key, attempts, correct, last_seen_at, last_correct_at)
       SELECT $1::uuid, $2::text, s.key, 1, CASE WHEN s.correct THEN 1 ELSE 0 END, $4::timestamptz, CASE WHEN s.correct THEN $4::timestamptz END
         FROM jsonb_to_recordset($3::jsonb) AS s(key text, correct boolean)
       ON CONFLICT (user_id, game, item_key) DO UPDATE SET
         attempts = game_seen.attempts + 1,
         correct = game_seen.correct + EXCLUDED.correct,
         last_seen_at = EXCLUDED.last_seen_at,
         last_correct_at = COALESCE(EXCLUDED.last_correct_at, game_seen.last_correct_at)`,
      [userId, game, JSON.stringify(answered.map((i) => ({ key: i.key, correct: i.correct }))), now],
    );
  }

  return { correct, total, firstTry, xp, learningCounted: learning, needed: Math.max(1, Math.ceil(total / 2)), items: shown, streak };
}
