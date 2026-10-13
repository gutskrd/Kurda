import type pg from 'pg';
import { lessonCompletionXp, type XpService } from '../xp/service.js';
import type { StreakService } from '../streaks/service.js';
import type { DailyGoalService } from '../goals/service.js';
import { countsAsLearning, localDate, safeTimeZone } from '../streaks/streak-logic.js';

/** The XP ledger source for a story game; the ref is `${gameId}:${userId}`. */
export const STORY_XP_SOURCE = 'story';

export interface RewardDeps {
  xp: XpService;
  streaks: StreakService;
  goals: DailyGoalService;
}

export interface Reward {
  userId: string;
  xp: number;
  learningCounted: boolean;
  /** the streak after this game, when it counted (for the streak milestones, after the commit) */
  streak: number | null;
}

interface Log {
  warn: (obj: unknown, msg: string) => void;
}

/**
 * Pay a finished game's players, inside the transaction that closed its last
 * question — so nothing depends on anyone coming back to read the results, and
 * a game finished at 23:59 is learning on the day it was played.
 *
 * What a story game pays for is learning, the way a lesson does: the answers a
 * player gave on their own local today (a game left open overnight does not
 * buy tomorrow's streak) must be at least half the questions (`countsAsLearning`).
 * Then XP as for a lesson, a quarter of it for a story they had already
 * finished before (`story_completions`, kept beyond the games themselves), a
 * day learned and the streak (which also unlocks the daily reward), and the
 * daily goal. No Gems, no rating, and the place in the game never changes the
 * XP — two friends reading together are not racing for it.
 *
 * Players are paid in user-id order, each in a savepoint: two games finishing
 * at once with the same people take the users' rows in the same order (no
 * deadlock), and a failure paying one player leaves that player unpaid and
 * logged — it never rolls back the game, or the others. An advisory lock per
 * (player, story) makes "had they finished this story before?" one answer even
 * when two of their games on it finish together. XP is keyed on
 * `${gameId}:${userId}`, so it can never be paid twice.
 */
export async function payRewards(
  client: pg.PoolClient,
  deps: RewardDeps,
  log: Log,
  game: { id: string; storyId: string; questionCount: number },
  playerIds: readonly string[],
  now: Date,
): Promise<Reward[]> {
  const out: Reward[] = [];
  for (const userId of [...playerIds].sort()) {
    await client.query('SAVEPOINT story_reward');
    try {
      const reward = await payOne(client, deps, game, userId, now);
      await client.query('RELEASE SAVEPOINT story_reward');
      out.push(reward);
    } catch (err) {
      await client.query('ROLLBACK TO SAVEPOINT story_reward');
      await client.query('RELEASE SAVEPOINT story_reward');
      log.warn({ err, gameId: game.id, userId }, 'story game reward failed; the player is left unpaid');
      out.push({ userId, xp: 0, learningCounted: false, streak: null });
    }
  }
  return out;
}

async function payOne(
  client: pg.PoolClient,
  deps: RewardDeps,
  game: { id: string; storyId: string; questionCount: number },
  userId: string,
  now: Date,
): Promise<Reward> {
  const user = await client.query<{ timezone: string | null }>(`SELECT timezone FROM users WHERE id = $1`, [userId]);
  const tz = safeTimeZone(user.rows[0]?.timezone);
  const answered = await client.query<{ n: number }>(
    `SELECT count(*)::int n FROM story_game_answers
      WHERE game_id = $1 AND user_id = $2 AND (answered_at AT TIME ZONE $3)::date = $4::date`,
    [game.id, userId, tz, localDate(now, tz)],
  );
  if (!countsAsLearning(answered.rows[0]!.n, game.questionCount)) {
    return { userId, xp: 0, learningCounted: false, streak: null };
  }

  await client.query(`SELECT pg_advisory_xact_lock(hashtextextended('story-complete:' || $1 || ':' || $2, 0))`, [
    userId,
    game.storyId,
  ]);
  const before = await client.query(`SELECT 1 FROM story_completions WHERE user_id = $1 AND story_id = $2`, [
    userId,
    game.storyId,
  ]);
  const isRepeat = (before.rowCount ?? 0) > 0;
  const player = await client.query<{ correct: number }>(
    `SELECT correct FROM story_game_players WHERE game_id = $1 AND user_id = $2`,
    [game.id, userId],
  );
  const accuracy = (player.rows[0]?.correct ?? 0) / game.questionCount;
  const xp = await deps.xp.award(
    { userId, source: STORY_XP_SOURCE, amount: lessonCompletionXp(accuracy, isRepeat), refId: `${game.id}:${userId}` },
    client,
  );
  const streak = await deps.streaks.recordActivity(userId, tz, now, client);
  await deps.goals.evaluate(client, userId, tz, now);
  await client.query(
    `UPDATE story_game_players SET learning_counted = true, xp_awarded = $3 WHERE game_id = $1 AND user_id = $2`,
    [game.id, userId, xp],
  );
  if (!isRepeat) {
    await client.query(
      `INSERT INTO story_completions (user_id, story_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, game.storyId],
    );
  }
  return { userId, xp, learningCounted: true, streak: streak.current };
}
