import type pg from 'pg';
import { areFriendsSql } from '../users/age.js';
import { LEARNING_XP_SOURCES } from '../xp/rules.js';
import { rankTierIndexSql } from './rank-hooks.js';

/**
 * What each badge counts (contract 4 §B2), read from the tables where it
 * happened — lessons, reviews, games, streaks, gifts, league weeks, rated
 * games — and never from anything a client sends. Every measure can be worked
 * out again at any moment and gives the same answer, so evaluating a badge
 * twice, or late, or after a retry, cannot over-count.
 *
 * Days are UTC days (the league's clock) except where a badge is about a
 * learner's own calendar day — Newroz in their own time zone.
 */

type Executor = Pick<pg.Pool, 'query'>;

export interface Measured {
  progress: number;
  /** for a badge with an `'all'` tier: what "all" is for this learner (the units in their course) */
  allTarget?: number;
}

/**
 * One learner's evaluation: loaders shared by the measures that need the same
 * rows (every event badge reads the same list of learning days), each loaded
 * at most once.
 */
export class MeasureContext {
  private learningDaysCache?: Promise<string[]>;
  private practiceDaysCache?: Promise<string[]>;

  constructor(
    readonly db: Executor,
    readonly userId: string,
  ) {}

  /** Distinct UTC days with learning XP, oldest first ('YYYY-MM-DD'). */
  learningDays(): Promise<string[]> {
    this.learningDaysCache ??= this.db
      .query<{ d: string }>(
        `SELECT DISTINCT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS d FROM xp_ledger
          WHERE user_id = $1 AND amount > 0 AND source = ANY($2::text[]) ORDER BY 1`,
        [this.userId, LEARNING_XP_SOURCES],
      )
      .then((r) => r.rows.map((x) => x.d));
    return this.learningDaysCache;
  }

  /** Distinct UTC days with a practice (review) session that counted. */
  practiceDays(): Promise<string[]> {
    this.practiceDaysCache ??= this.db
      .query<{ d: string }>(
        `SELECT DISTINCT to_char(completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS d FROM practice_sessions
          WHERE user_id = $1 AND completed_at IS NOT NULL AND xp_awarded > 0 ORDER BY 1`,
        [this.userId],
      )
      .then((r) => r.rows.map((x) => x.d));
    return this.practiceDaysCache;
  }

  async count(sql: string, params: unknown[] = []): Promise<number> {
    const r = await this.db.query<{ n: number | string | null }>(sql, [this.userId, ...params]);
    return Number(r.rows[0]?.n ?? 0);
  }
}

const DAY_MS = 86_400_000;
const dayNumber = (d: string): number => Date.parse(`${d}T00:00:00Z`) / DAY_MS;

/** Longest run of consecutive days in a sorted list. */
export function longestRun(days: readonly string[]): number {
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const d of days) {
    const n = dayNumber(d);
    run = prev !== null && n - prev === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = n;
  }
  return best;
}

/** Returns after at least `awayDays` days without learning. */
export function comebacks(days: readonly string[], awayDays = 14): number {
  let count = 0;
  for (let i = 1; i < days.length; i++) {
    if (dayNumber(days[i]!) - dayNumber(days[i - 1]!) > awayDays) count += 1;
  }
  return count;
}

/** Distinct years with a learning day between two calendar dates (month, day), inclusive. */
export function yearsWithin(days: readonly string[], from: [number, number], to: [number, number]): number {
  const years = new Set<string>();
  const key = (m: number, d: number) => m * 100 + d;
  for (const day of days) {
    const [y, m, d] = day.split('-').map(Number) as [number, number, number];
    const k = key(m, d);
    if (k >= key(...from) && k <= key(...to)) years.add(String(y));
  }
  return years.size;
}

/**
 * The monthly challenge (Mehane): learn on a number of days in a calendar
 * month fitted to the learner — two more than they managed the month before,
 * at least 8 and at most 20 — like Apple's personal monthly goals. Fitted from
 * their own history, so it is never out of reach and never trivially in it.
 */
export const MONTHLY_GOAL_MIN = 8;
export const MONTHLY_GOAL_MAX = 20;
export function monthlyGoal(daysLastMonth: number): number {
  return Math.min(MONTHLY_GOAL_MAX, Math.max(MONTHLY_GOAL_MIN, daysLastMonth + 2));
}

/** Learning days per month ('YYYY-MM'). */
export function daysPerMonth(days: readonly string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of days) m.set(d.slice(0, 7), (m.get(d.slice(0, 7)) ?? 0) + 1);
  return m;
}

export function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** The months in which the monthly challenge was met. */
export function monthsMet(days: readonly string[]): string[] {
  const per = daysPerMonth(days);
  return [...per.entries()]
    .filter(([month, n]) => n >= monthlyGoal(per.get(previousMonth(month)) ?? 0))
    .map(([month]) => month)
    .sort();
}

/** Distinct years with a met month in a calendar quarter (1–4). */
export function yearsWithChallengeIn(days: readonly string[], quarter: number): number {
  const years = new Set<string>();
  for (const month of monthsMet(days)) {
    const m = Number(month.slice(5, 7));
    if (Math.floor((m - 1) / 3) + 1 === quarter) years.add(month.slice(0, 4));
  }
  return years.size;
}

/**
 * The ranking of a finished Peyvok Battle in SQL, the comparator of
 * game/wordle-battle.ts's `rankBattle`: solvers first, then fewer guesses,
 * then faster; among the rest, more progress, then faster. Ties share a rank.
 */
const BATTLE_RANK = `rank() OVER (PARTITION BY p.battle_id ORDER BY p.solved DESC,
  CASE WHEN p.solved THEN p.guess_count ELSE 0 END ASC,
  CASE WHEN p.solved THEN 0 ELSE p.progress END DESC,
  COALESCE(p.time_ms, 9007199254740991) ASC)`;
/** …and of a Rhyme Match, as `rankRhyme`: higher score, then fewer accepted submissions. */
const RHYME_RANK = `rank() OVER (PARTITION BY p.match_id ORDER BY p.score DESC, p.accepted ASC)`;

const battleWins = (extra: string) => `
  SELECT count(*) AS n FROM (
    SELECT p.user_id, p.solved, p.guess_count, ${BATTLE_RANK} AS r, count(*) OVER (PARTITION BY p.battle_id) AS players
      FROM wordle_battle_players p JOIN wordle_battles b ON b.id = p.battle_id
     WHERE b.status = 'finished' AND NOT p.removed
       AND p.battle_id IN (SELECT battle_id FROM wordle_battle_players WHERE user_id = $1)
  ) x WHERE x.user_id = $1 AND x.r = 1 AND x.players >= 2 ${extra}`;

/** A Newroz story: one whose title says so, in either script. */
const NEWROZ_TITLE = `(COALESCE(g.story_snapshot->>'title', s.title) ~* '(newroz|نەورۆز|نوروز)')`;

export type Measure = (ctx: MeasureContext) => Promise<Measured>;

const count =
  (sql: string): Measure =>
  async (ctx) => ({ progress: await ctx.count(sql) });

/**
 * A rank tier (0 Deşt … 5 Stêrk) reached at a season's peak, counted in seasons:
 * from the peaks the rated games and season closes told the badges, and from
 * the ranks module's own season results — so a close whose news was lost (a
 * restart between the close and the count) is still counted the next time.
 */
const seasonsReached = (tierIndex: number): Measure =>
  count(
    `SELECT count(DISTINCT season_id) AS n FROM (
       SELECT season_id FROM badge_rank_seasons WHERE user_id = $1 AND peak_tier >= ${tierIndex}
       UNION
       SELECT season_id FROM rank_season_results WHERE user_id = $1 AND ${rankTierIndexSql('peak_tier')} >= ${tierIndex}
     ) s`,
  );

export const MEASURES: Readonly<Record<string, Measure>> = {
  // ---- learning
  lessons_completed: count(`SELECT count(*) AS n FROM xp_ledger WHERE user_id = $1 AND source = 'lesson_complete' AND amount > 0`),
  review_items_remembered: count(
    `SELECT count(*) AS n FROM review_items WHERE user_id = $1 AND repetitions >= 2 AND interval_days >= 6`,
  ),
  perfect_lessons: count(
    `SELECT count(*) AS n FROM lesson_sessions ls
      WHERE ls.user_id = $1 AND ls.completed_at IS NOT NULL AND ls.total_count > 0
        AND (SELECT count(*) FROM session_answers a WHERE a.session_id = ls.id AND a.accepted) >= ls.total_count`,
  ),
  review_answers: count(
    `SELECT count(*) AS n FROM practice_answers a JOIN practice_sessions s ON s.id = a.session_id
      WHERE s.user_id = $1 AND s.xp_awarded > 0`,
  ),
  stories_finished: count(`SELECT count(*) AS n FROM story_completions WHERE user_id = $1`),
  units_completed: async (ctx) => {
    // a unit is done when every published lesson in it has been finished at
    // least once (any version of the lesson in that place); counted in the
    // course where the learner has done most
    const r = await ctx.db.query<{ done: number; total: number }>(
      `WITH done AS (
         SELECT DISTINCT l.skill_id, l.position FROM lesson_sessions ls JOIN lessons l ON l.id = ls.lesson_id
          WHERE ls.user_id = $1 AND ls.completed_at IS NOT NULL),
       units_state AS (
         SELECT u.id, u.course_id, bool_and(d.skill_id IS NOT NULL) AS complete
           FROM units u JOIN skills s ON s.unit_id = u.id
           JOIN lessons l ON l.skill_id = s.id AND l.status = 'published'
           LEFT JOIN done d ON d.skill_id = l.skill_id AND d.position = l.position
          GROUP BY u.id, u.course_id)
       SELECT count(*) FILTER (WHERE complete)::int AS done, count(*)::int AS total
         FROM units_state GROUP BY course_id ORDER BY 1 DESC, 2 ASC LIMIT 1`,
      [ctx.userId],
    );
    const row = r.rows[0];
    return { progress: row?.done ?? 0, allTarget: row?.total ?? undefined };
  },
  dictionary_words_reviewed: count(
    `SELECT count(*) AS n FROM review_items WHERE user_id = $1 AND item_id LIKE 'dict:%' AND last_reviewed_at IS NOT NULL`,
  ),

  // ---- habit
  longest_streak: count(`SELECT GREATEST(longest_streak, current_streak) AS n FROM user_streaks WHERE user_id = $1`),
  weekly_goals_met: count(`SELECT count(*) AS n FROM league_weeks WHERE user_id = $1 AND goal_met`),
  learning_days: count(`SELECT days_learned AS n FROM user_streaks WHERE user_id = $1`),
  comebacks: async (ctx) => ({ progress: comebacks(await ctx.learningDays()) }),
  okyanus_top_three_weeks: count(`SELECT count(*) AS n FROM league_weeks WHERE user_id = $1 AND trophy`),

  // ---- games
  wordle_battle_wins: count(battleWins('')),
  rhyme_match_wins: count(
    `SELECT count(*) AS n FROM (
       SELECT p.user_id, ${RHYME_RANK} AS r, count(*) OVER (PARTITION BY p.match_id) AS players
         FROM rhyme_match_players p JOIN rhyme_matches m ON m.id = p.match_id
        WHERE m.status = 'finished' AND NOT p.removed
          AND p.match_id IN (SELECT match_id FROM rhyme_match_players WHERE user_id = $1)
     ) x WHERE x.user_id = $1 AND x.r = 1 AND x.players >= 2`,
  ),
  race_best_wpm: count(
    `SELECT COALESCE(floor(max(wpm)), 0) AS n FROM race_games
      WHERE user_id = $1 AND finished_at IS NOT NULL AND xp_awarded > 0 AND accuracy >= 0.9`,
  ),
  races_98_percent: count(
    `SELECT count(*) AS n FROM race_games WHERE user_id = $1 AND finished_at IS NOT NULL AND xp_awarded > 0 AND accuracy >= 0.98`,
  ),
  story_quiz_perfect: count(
    `SELECT count(*) AS n FROM story_game_players p JOIN story_games g ON g.id = p.game_id
      WHERE p.user_id = $1 AND g.status = 'finished' AND NOT p.removed AND p.left_at IS NULL
        AND g.question_count > 0 AND p.correct >= g.question_count`,
  ),
  games_tried: count(
    `SELECT (EXISTS (SELECT 1 FROM wordle_games WHERE user_id = $1 AND finished_at IS NOT NULL)
             OR EXISTS (SELECT 1 FROM wordle_battle_players p JOIN wordle_battles b ON b.id = p.battle_id
                         WHERE p.user_id = $1 AND NOT p.removed AND b.status = 'finished'))::int
          + (EXISTS (SELECT 1 FROM rhyme_games WHERE user_id = $1 AND ended_at IS NOT NULL)
             OR EXISTS (SELECT 1 FROM rhyme_match_players p JOIN rhyme_matches m ON m.id = p.match_id
                         WHERE p.user_id = $1 AND NOT p.removed AND m.status = 'finished'))::int
          + EXISTS (SELECT 1 FROM race_games WHERE user_id = $1 AND finished_at IS NOT NULL)::int
          + EXISTS (SELECT 1 FROM story_game_players p JOIN story_games g ON g.id = p.game_id
                     WHERE p.user_id = $1 AND NOT p.removed AND g.status = 'finished')::int AS n`,
  ),
  // rated games played to the end, counted since the last moderation sanction
  // that stood against them (a report upheld starts the count again)
  fair_rated_games: count(
    `SELECT count(*) AS n FROM badge_rated_games g
      WHERE g.user_id = $1 AND NOT g.left_game
        AND g.finished_at > COALESCE((SELECT max(s.created_at) FROM sanctions s
                                       WHERE s.user_id = $1 AND s.revoked_at IS NULL AND NOT s.pending_approval),
                                     '-infinity'::timestamptz)`,
  ),

  // ---- ranked
  seasons_reached_dest: seasonsReached(0),
  seasons_reached_gir: seasonsReached(1),
  seasons_reached_zozan: seasonsReached(2),
  seasons_reached_ciya: seasonsReached(3),
  seasons_reached_lutke: seasonsReached(4),
  seasons_reached_sterk: seasonsReached(5),
  seasons_with_ten_rated_games: count(
    `SELECT count(*) AS n FROM (
       SELECT season_id FROM badge_rated_games WHERE user_id = $1 GROUP BY season_id HAVING count(*) >= 10
       UNION
       SELECT season_id FROM badge_rank_seasons WHERE user_id = $1 GROUP BY season_id HAVING sum(rated_games) >= 10
       UNION
       SELECT season_id FROM rank_season_results WHERE user_id = $1 GROUP BY season_id HAVING sum(rated_games) >= 10
     ) s`,
  ),
  placements_finished: count(
    `SELECT (EXISTS (SELECT 1 FROM badge_rated_games WHERE user_id = $1 AND placement_done)
             OR EXISTS (SELECT 1 FROM badge_rank_seasons WHERE user_id = $1 AND peak_tier IS NOT NULL))::int AS n`,
  ),

  // ---- friends
  games_with_friends: count(
    `SELECT count(*) AS n FROM (
       SELECT p.battle_id FROM wordle_battle_players p JOIN wordle_battles b ON b.id = p.battle_id
        WHERE p.user_id = $1 AND NOT p.removed AND b.status = 'finished'
          AND EXISTS (SELECT 1 FROM wordle_battle_players q WHERE q.battle_id = p.battle_id AND q.user_id <> $1
                       AND NOT q.removed AND ${areFriendsSql('q.user_id', '$1::uuid')})
       UNION ALL
       SELECT p.match_id FROM rhyme_match_players p JOIN rhyme_matches m ON m.id = p.match_id
        WHERE p.user_id = $1 AND NOT p.removed AND m.status = 'finished'
          AND EXISTS (SELECT 1 FROM rhyme_match_players q WHERE q.match_id = p.match_id AND q.user_id <> $1
                       AND NOT q.removed AND ${areFriendsSql('q.user_id', '$1::uuid')})
       UNION ALL
       SELECT p.game_id FROM story_game_players p JOIN story_games g ON g.id = p.game_id
        WHERE p.user_id = $1 AND NOT p.removed AND g.status = 'finished'
          AND EXISTS (SELECT 1 FROM story_game_players q WHERE q.game_id = p.game_id AND q.user_id <> $1
                       AND NOT q.removed AND ${areFriendsSql('q.user_id', '$1::uuid')})
     ) x`,
  ),
  gift_days: count(
    `SELECT count(DISTINCT (to_user_id, (created_at AT TIME ZONE 'UTC')::date)) AS n FROM gifts WHERE from_user_id = $1`,
  ),
  games_hosted: count(
    `SELECT
       (SELECT count(*) FROM wordle_battles b WHERE b.created_by = $1 AND b.status = 'finished'
         AND (SELECT count(*) FROM wordle_battle_players p WHERE p.battle_id = b.id AND NOT p.removed) >= 2)
     + (SELECT count(*) FROM rhyme_matches m WHERE m.created_by = $1 AND m.status = 'finished'
         AND (SELECT count(*) FROM rhyme_match_players p WHERE p.match_id = m.id AND NOT p.removed) >= 2)
     + (SELECT count(*) FROM story_games g WHERE g.host_id = $1 AND g.status = 'finished'
         AND (SELECT count(*) FROM story_game_players p WHERE p.game_id = g.id AND NOT p.removed) >= 2) AS n`,
  ),

  // ---- events: a learning day in a week around the date, each year (UTC)
  learned_newroz_week: async (ctx) => ({ progress: yearsWithin(await ctx.learningDays(), [3, 18], [3, 24]) }),
  learned_language_day_week: async (ctx) => ({ progress: yearsWithin(await ctx.learningDays(), [5, 12], [5, 18]) }),
  learned_mother_language_week: async (ctx) => ({ progress: yearsWithin(await ctx.learningDays(), [2, 18], [2, 24]) }),
  monthly_challenge_q1: async (ctx) => ({ progress: yearsWithChallengeIn(await ctx.learningDays(), 1) }),
  monthly_challenge_q2: async (ctx) => ({ progress: yearsWithChallengeIn(await ctx.learningDays(), 2) }),
  monthly_challenge_q3: async (ctx) => ({ progress: yearsWithChallengeIn(await ctx.learningDays(), 3) }),
  monthly_challenge_q4: async (ctx) => ({ progress: yearsWithChallengeIn(await ctx.learningDays(), 4) }),
  monthly_challenges: async (ctx) => ({ progress: monthsMet(await ctx.learningDays()).length }),

  // ---- secret
  battle_win_two_guesses: count(battleWins('AND x.solved AND x.guess_count <= 2')),
  // a Stories group game (three or more) won outright from last place at half
  // time: the fewest right answers over the first half of the questions, and
  // the highest score at the end
  group_comeback_win: count(
    `WITH games AS (
       SELECT g.id, g.question_count FROM story_games g JOIN story_game_players p ON p.game_id = g.id
        WHERE p.user_id = $1 AND NOT p.removed AND g.status = 'finished' AND g.question_count >= 2),
     half AS (
       SELECT p.game_id, p.user_id, p.score,
              (SELECT count(*) FROM story_game_answers a
                WHERE a.game_id = p.game_id AND a.user_id = p.user_id AND a.correct
                  AND a.question_index < g.question_count / 2) AS early
         FROM story_game_players p JOIN games g ON g.id = p.game_id WHERE NOT p.removed)
     SELECT count(*) AS n FROM (
       SELECT game_id FROM half GROUP BY game_id
       HAVING count(*) >= 3
          AND max(score) FILTER (WHERE user_id = $1) > COALESCE(max(score) FILTER (WHERE user_id <> $1), -1)
          AND max(early) FILTER (WHERE user_id = $1) = min(early)
          AND min(early) < max(early)
     ) w`,
  ),
  beat_two_tiers_higher: count(`SELECT count(*) AS n FROM badge_rated_games WHERE user_id = $1 AND beat_higher_by >= 2`),
  flawless_race: count(
    `SELECT count(*) AS n FROM race_games WHERE user_id = $1 AND finished_at IS NOT NULL AND xp_awarded > 0
        AND errors = 0 AND accent_misses = 0 AND accuracy >= 1`,
  ),
  // a Newroz story finished on 21 March of the learner's own calendar
  newroz_story_on_newroz: count(
    `SELECT count(*) AS n FROM story_game_players p
       JOIN story_games g ON g.id = p.game_id
       JOIN users u ON u.id = p.user_id
       LEFT JOIN stories s ON s.id = g.story_id
      WHERE p.user_id = $1 AND NOT p.removed AND p.answered > 0 AND g.status = 'finished' AND ${NEWROZ_TITLE}
        -- a zone Postgres does not know reads as UTC rather than failing the count
        AND to_char(g.finished_at AT TIME ZONE (CASE WHEN EXISTS (SELECT 1 FROM pg_timezone_names z WHERE z.name = u.timezone)
                                                  THEN u.timezone ELSE 'UTC' END), 'MM-DD') = '03-21'`,
  ),
  seven_review_days: async (ctx) => ({ progress: longestRun(await ctx.practiceDays()) >= 7 ? 1 : 0 }),
};
