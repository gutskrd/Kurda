import type pg from 'pg';
import { PAID_STORY_REPEATS_PER_DAY } from '@kurda/shared';
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
 * Pay a finished game's players inside the transaction that closed its last question, so payment never depends on
 * anyone reading the results and a game finished at 23:59 counts for that day.
 *
 * A story game pays for learning like a lesson: the answers a player gave on their own local today must be at least
 * half the questions (`countsAsLearning`), so a game left open overnight does not buy tomorrow's streak. XP is as for a
 * lesson, a quarter for a story finished before (`story_completions`, kept beyond the games), and none once the same
 * story has paid PAID_STORY_REPEATS_PER_DAY times that local day. The day learned, the streak (which unlocks the daily
 * reward) and the daily goal are still recorded. No Zêr, no rating, and placing never changes the XP.
 *
 * Players are paid in user-id order, each in a savepoint: concurrent games with the same people lock users in the same
 * order (no deadlock), and a failure leaves that player unpaid and logged without rolling back the game or the others.
 * An advisory lock per (player, story) makes "finished this story before?" consistent when two of their games on it
 * finish together. XP is keyed on `${gameId}:${userId}`, so it is never paid twice.
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
  // their earlier paid finishes of this story today (this game is not among them: it is paid below)
  const paidToday = await client.query<{ n: number }>(
    `SELECT count(*)::int n FROM story_game_players p JOIN story_games g ON g.id = p.game_id
      WHERE p.user_id = $1 AND g.story_id = $2 AND g.id <> $3 AND p.xp_awarded > 0
        AND g.finished_at IS NOT NULL AND (g.finished_at AT TIME ZONE $4)::date = $5::date`,
    [userId, game.storyId, game.id, tz, localDate(now, tz)],
  );
  const capped = paidToday.rows[0]!.n >= PAID_STORY_REPEATS_PER_DAY;
  const player = await client.query<{ correct: number }>(
    `SELECT correct FROM story_game_players WHERE game_id = $1 AND user_id = $2`,
    [game.id, userId],
  );
  const accuracy = (player.rows[0]?.correct ?? 0) / game.questionCount;
  const xp = capped
    ? 0
    : await deps.xp.award(
        { userId, source: STORY_XP_SOURCE, amount: lessonCompletionXp(accuracy, isRepeat), refId: `${game.id}:${userId}` },
        client,
      );
  const streak = await deps.streaks.recordActivity(userId, tz, now, client, 'game');
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
