/**
 * Badges (contract 4 §B2) against real Postgres: every badge's count from the
 * tables where it happened, the events that move them, unlocks told once,
 * the showcase, secrets, rarity, the admin's award and revoke, and the old
 * achievements' migration.
 *
 * Source rows are written straight to the tables: the lessons, games and
 * gifts themselves are tested through their own routes; this is about what
 * the badges make of them.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { badgeDef, type BadgeUnlockedEvent } from '@kurda/shared';
import { BadgeService, profileShowcase, type BadgeNotices } from './service.js';
import { addXp, makeLearner, removeLearners, type LearnerOptions, type TestLearner } from '../test/progress.js';
import { befriend } from '../test/social.js';
import type { Notification } from '../push/service.js';
import { DictionaryRepository } from '../dictionary/repository.js';
import { PRACTICE_TARGET } from '../practice/practice-select.js';

const DATABASE_URL = process.env.DATABASE_URL;
const DAY = 86_400_000;

describe.skipIf(!DATABASE_URL)('badges (integration)', () => {
  let pool: pg.Pool;
  let badges: BadgeService;
  const recorded: Array<{ userId: string; n: Notification }> = [];
  const live: Array<{ userId: string; e: BadgeUnlockedEvent }> = [];
  const pushes: Array<{ userId: string; day: string }> = [];
  const notices: BadgeNotices = {
    record: async (userId, n) => void recorded.push({ userId, n }),
    realtime: async (userId, e) => void live.push({ userId, e }),
    pushLater: async (userId, day) => void pushes.push({ userId, day }),
  };
  const suffix = Date.now().toString(36);
  let n = 0;

  const learner = async (opts: LearnerOptions = {}) => makeLearner(pool, `bd${suffix}${++n}`, opts);
  /** A learner whose first (quiet) count is done, so what follows is told. */
  const counted = async (opts: LearnerOptions = {}) => {
    const p = await learner(opts);
    await badges.evaluate(p.id);
    return p;
  };
  const tierOf = async (userId: string, key: string) =>
    (await pool.query<{ tier: number }>(`SELECT tier FROM user_badges WHERE user_id = $1 AND badge_key = $2`, [userId, key]))
      .rows[0]?.tier ?? 0;
  const progressOf = async (userId: string, key: string) =>
    (await pool.query<{ progress: number }>(`SELECT progress FROM user_badges WHERE user_id = $1 AND badge_key = $2`, [userId, key]))
      .rows[0]?.progress ?? 0;
  const uuid = async () => (await pool.query<{ id: string }>(`SELECT gen_random_uuid() AS id`)).rows[0]!.id;

  // ---- fixtures ------------------------------------------------------------------

  /** A course of `units` units, each with one published lesson with one exercise. */
  const course = async (units: number) => {
    const c = await pool.query<{ id: string }>(
      `INSERT INTO courses (slug, dialect, title_ku, title_en) VALUES ($1, 'kurmanji', 'K', 'K') RETURNING id`,
      [`bd-${suffix}-${++n}`],
    );
    const lessons: Array<{ lesson: string; exercise: string }> = [];
    for (let u = 0; u < units; u++) {
      const unit = await pool.query<{ id: string }>(
        `INSERT INTO units (course_id, position, title_ku, title_en) VALUES ($1, $2, 'U', 'U') RETURNING id`,
        [c.rows[0]!.id, u + 1],
      );
      const skill = await pool.query<{ id: string }>(
        `INSERT INTO skills (unit_id, position, title_ku, title_en) VALUES ($1, 1, 'S', 'S') RETURNING id`,
        [unit.rows[0]!.id],
      );
      const lesson = await pool.query<{ id: string }>(
        `INSERT INTO lessons (skill_id, position, title_ku, title_en, status) VALUES ($1, 1, 'L', 'L', 'draft') RETURNING id`,
        [skill.rows[0]!.id],
      );
      const ex = await pool.query<{ id: string }>(
        `INSERT INTO exercises (lesson_id, position, type, payload) VALUES ($1, 1, 'translate', '{"prompt":"a","accepted":["a"]}') RETURNING id`,
        [lesson.rows[0]!.id],
      );
      await pool.query(`UPDATE lessons SET status = 'published', published_at = now() WHERE id = $1`, [lesson.rows[0]!.id]);
      lessons.push({ lesson: lesson.rows[0]!.id, exercise: ex.rows[0]!.id });
    }
    return { id: c.rows[0]!.id, lessons };
  };

  const finishLesson = async (userId: string, l: { lesson: string; exercise: string }, right = true) => {
    const s = await pool.query<{ id: string }>(
      `INSERT INTO lesson_sessions (user_id, lesson_id, total_count, correct_count, expires_at, completed_at)
       VALUES ($1, $2, 1, $3, now() + interval '1 hour', now()) RETURNING id`,
      [userId, l.lesson, right ? 1 : 0],
    );
    await pool.query(`INSERT INTO session_answers (session_id, exercise_id, verdict, accepted) VALUES ($1, $2, $3, $4)`, [
      s.rows[0]!.id,
      l.exercise,
      right ? 'correct' : 'wrong',
      right,
    ]);
    await addXp(pool, userId, 20, new Date(), { source: 'lesson_complete', ref: s.rows[0]!.id });
  };

  const story = async (title = 'Çîrok') =>
    (
      await pool.query<{ id: string }>(
        `INSERT INTO stories (slug, dialect, level, title, body) VALUES ($1, 'kurmanci', 1, $2, 'x') RETURNING id`,
        [`bd-${suffix}-${++n}`, title],
      )
    ).rows[0]!.id;

  /** A finished story game: players with their score, right answers, and right answers in the first half. */
  const storyGame = async (
    players: Array<{ user: TestLearner; score: number; correct: number; early: number }>,
    opts: { title?: string; finishedAt?: Date; questions?: 3 | 5 | 10; host?: TestLearner } = {},
  ) => {
    const questions = opts.questions ?? 10;
    const g = await pool.query<{ id: string }>(
      `INSERT INTO story_games (story_id, mode, host_id, dialect, level, length, question_count, timer_seconds, status, finished_at)
       VALUES ($1, $2, $3, 'kurmanci', 1, 'short', $4, 0, 'finished', $5) RETURNING id`,
      [await story(opts.title), players.length === 1 ? 'solo' : players.length === 2 ? 'duo' : 'group', opts.host?.id ?? players[0]!.user.id, questions, opts.finishedAt ?? new Date()],
    );
    for (const [seat, p] of players.entries()) {
      await pool.query(
        `INSERT INTO story_game_players (game_id, user_id, seat, score, correct, answered) VALUES ($1, $2, $3, $4, $5, $6)`,
        [g.rows[0]!.id, p.user.id, seat, p.score, p.correct, questions],
      );
      for (let q = 0; q < questions; q++) {
        const right = q < questions / 2 ? q < p.early : q - Math.floor(questions / 2) < p.correct - p.early;
        await pool.query(
          `INSERT INTO story_game_answers (game_id, user_id, question_index, choice, correct, elapsed_ms) VALUES ($1, $2, $3, 0, $4, 1000)`,
          [g.rows[0]!.id, p.user.id, q, right],
        );
      }
    }
    return g.rows[0]!.id;
  };

  /** A finished Peyvok Battle: each player solved (in so many guesses) or not; a rematch of another, if said. */
  const battle = async (
    host: TestLearner,
    players: Array<{ user: TestLearner; solved: boolean; guesses: number; ms?: number }>,
    rematchOf: string | null = null,
  ) => {
    const b = await pool.query<{ id: string }>(
      `INSERT INTO wordle_battles (created_by, difficulty, target, target_length, status, finished_at, rematch_of)
       VALUES ($1, 'easy', 'av', 2, 'finished', now(), $2) RETURNING id`,
      [host.id, rematchOf],
    );
    for (const [seat, p] of players.entries()) {
      await pool.query(
        `INSERT INTO wordle_battle_players (battle_id, user_id, seat, solved, guess_count, time_ms, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [b.rows[0]!.id, p.user.id, seat, p.solved, p.guesses, p.ms ?? 1000 * (seat + 1), p.solved ? 'won' : 'lost'],
      );
    }
    return b.rows[0]!.id;
  };

  const rhymeMatch = async (host: TestLearner, players: Array<{ user: TestLearner; score: number }>, rematchOf: string | null = null) => {
    const m = await pool.query<{ id: string }>(
      `INSERT INTO rhyme_matches (created_by, window_ms, prompt, status, finished_at, rematch_of)
       VALUES ($1, 60000, 'dil', 'finished', now(), $2) RETURNING id`,
      [host.id, rematchOf],
    );
    for (const [seat, p] of players.entries()) {
      await pool.query(
        `INSERT INTO rhyme_match_players (match_id, user_id, seat, score, accepted) VALUES ($1, $2, $3, $4, $5)`,
        [m.rows[0]!.id, p.user.id, seat, p.score, p.score],
      );
    }
    return m.rows[0]!.id;
  };

  /** A finished Peyvok, the day's or a practice one, won or lost in so many guesses. */
  const peyvok = async (userId: string, g: { mode: 'daily' | 'practice'; day?: number; won: boolean; guesses: number }) =>
    pool.query(
      `INSERT INTO wordle_games (user_id, mode, difficulty, day_index, target, target_length, guesses, status, finished_at)
       VALUES ($1, $2, 'easy', $3, 'av', 2, $4::jsonb, $5, now())`,
      [userId, g.mode, g.day ?? null, JSON.stringify(Array.from({ length: g.guesses }, () => 'av')), g.won ? 'won' : 'lost'],
    );

  let raceText = '';
  const race = async (userId: string, r: { wpm: number; accuracy: number; errors: number; xp?: number }) => {
    raceText ||= (
      await pool.query<{ id: string }>(
        `INSERT INTO race_texts (title, body) VALUES ('T', 'Ev nivîsek dirêj e ji bo pêşbaziyê.') RETURNING id`,
      )
    ).rows[0]!.id;
    await pool.query(
      `INSERT INTO race_games (user_id, text_id, finished_at, wpm, accuracy, score, xp_awarded, errors, accent_misses)
       VALUES ($1, $2, now(), $3, $4, 100, $5, $6, 0)`,
      [userId, raceText, r.wpm, r.accuracy, r.xp ?? 10, r.errors],
    );
  };

  const practiceOn = async (userId: string, day: Date, answers = 1) => {
    const s = await pool.query<{ id: string }>(
      `INSERT INTO practice_sessions (user_id, item_ids, total_count, correct_count, xp_awarded, created_at, completed_at)
       VALUES ($1, '{}', $2, $2, 5, $3, $3) RETURNING id`,
      [userId, answers, day],
    );
    for (let i = 0; i < answers; i++) {
      await pool.query(`INSERT INTO practice_answers (session_id, exercise_id, verdict, accepted) VALUES ($1, $2, 'correct', true)`, [
        s.rows[0]!.id,
        await uuid(),
      ]);
    }
    await addXp(pool, userId, 5, day, { source: 'practice_complete' });
  };

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL, max: 10 });
    badges = new BadgeService(pool, { notices });
  });

  afterAll(async () => {
    await removeLearners(pool, `bd${suffix}%`);
    await pool.query(`DELETE FROM story_games WHERE story_id IN (SELECT id FROM stories WHERE slug LIKE $1)`, [`bd-${suffix}-%`]);
    await pool.query(`DELETE FROM stories WHERE slug LIKE $1`, [`bd-${suffix}-%`]);
    // a published lesson can only be retired, and a retired one removed
    await pool.query(
      `UPDATE lessons SET status = 'archived' WHERE status = 'published' AND skill_id IN (
         SELECT s.id FROM skills s JOIN units u ON u.id = s.unit_id JOIN courses c ON c.id = u.course_id WHERE c.slug LIKE $1)`,
      [`bd-${suffix}-%`],
    );
    await pool.query(`DELETE FROM courses WHERE slug LIKE $1`, [`bd-${suffix}-%`]);
    if (raceText) await pool.query(`DELETE FROM race_texts WHERE id = $1`, [raceText]);
    await pool.query(`DELETE FROM shop_items WHERE sku = $1`, [`bd-gift-${suffix}`]);
    await pool.query(`DELETE FROM dict_entries WHERE headword LIKE $1`, [`bd${suffix}w%`]);
    await pool.end();
  });

  describe('the first count', () => {
    it('finds what was done before badges existed and records it quietly, as seen', async () => {
      const p = await learner();
      await pool.query(`INSERT INTO user_streaks (user_id, current_streak, longest_streak, days_learned) VALUES ($1, 3, 40, 120)`, [p.id]);
      const before = recorded.length;
      const unlocks = await badges.evaluate(p.id, ['agir']);
      expect(unlocks.map((u) => u.key).sort()).toEqual(['agir', 'roj']);
      expect(await tierOf(p.id, 'agir')).toBe(2);
      expect(await tierOf(p.id, 'roj')).toBe(2);
      expect(recorded.length).toBe(before);
      expect(await badges.unseen(p.id)).toEqual([]);
    });
  });

  describe('learning', () => {
    it('Ders and Bêkêmasî count finished and flawless lessons; Rêwî units, up to the whole course', async () => {
      const p = await counted();
      const c = await course(2);
      for (let i = 0; i < 5; i++) await finishLesson(p.id, c.lessons[0]!, true);
      await finishLesson(p.id, c.lessons[0]!, false);
      await badges.recordLessonCompleted(p.id, 1);
      expect(await progressOf(p.id, 'bekemasi')).toBe(5);
      expect(await tierOf(p.id, 'bekemasi')).toBe(1);
      expect(await progressOf(p.id, 'ders')).toBe(6);
      expect(await tierOf(p.id, 'rewi')).toBe(1);
      await finishLesson(p.id, c.lessons[1]!, true);
      for (let i = 0; i < 3; i++) await finishLesson(p.id, c.lessons[1]!, true);
      await badges.recordStreak(p.id, 1);
      expect(await tierOf(p.id, 'ders')).toBe(1);
      // the whole (two-unit) course: every tier of Rêwî, its middle ones brought down to it
      expect(await tierOf(p.id, 'rewi')).toBe(4);
      const view = (await badges.list(p.id)).badges.find((b) => b.key === 'rewi')!;
      expect(view.thresholds).toEqual([1, 2, 2, 2]);
    });

    it('Peyvên min, Ferheng and Dubare count remembered items, reviewed dictionary words and review answers', async () => {
      const p = await counted();
      for (let i = 0; i < 50; i++) {
        await pool.query(
          `INSERT INTO review_items (user_id, item_id, repetitions, interval_days, easiness, due_at, last_reviewed_at)
           VALUES ($1, $2, 2, 6, 2.5, now(), now())`,
          [p.id, i < 10 ? `dict:${await uuid()}` : `ex-${i}`],
        );
      }
      // not yet remembered: once, a day apart
      await pool.query(
        `INSERT INTO review_items (user_id, item_id, repetitions, interval_days, easiness, due_at) VALUES ($1, 'ex-new', 1, 1, 2.5, now())`,
        [p.id],
      );
      await practiceOn(p.id, new Date(), 50);
      await badges.recordStreak(p.id, 1);
      expect(await progressOf(p.id, 'peyven-min')).toBe(50);
      expect(await tierOf(p.id, 'peyven-min')).toBe(1);
      expect(await tierOf(p.id, 'ferheng')).toBe(1);
      expect(await progressOf(p.id, 'dubare')).toBe(50);
      expect(await tierOf(p.id, 'dubare')).toBe(1);
    });

    it('Çîrokbêj counts stories finished', async () => {
      const p = await counted();
      for (let i = 0; i < 3; i++) await pool.query(`INSERT INTO story_completions (user_id, story_id) VALUES ($1, $2)`, [p.id, await story()]);
      await badges.recordStreak(p.id, 1);
      expect(await tierOf(p.id, 'cirokbej')).toBe(1);
    });
  });

  describe('habit', () => {
    it('Agir, Roj, Hefte and Pêla from the streak and league weeks', async () => {
      const p = await counted();
      await pool.query(`INSERT INTO user_streaks (user_id, current_streak, longest_streak, days_learned) VALUES ($1, 30, 30, 30)`, [p.id]);
      for (let i = 0; i < 4; i++) {
        await pool.query(
          `INSERT INTO league_weeks (user_id, week_key, mode, tier, weekly_xp, goal_xp, goal_met, trophy)
           VALUES ($1, $2, 'league', 'okyanus', 900, 150, true, $3)`,
          [p.id, `2025-0${i + 1}-06`, i === 0],
        );
      }
      await badges.recordStreak(p.id, 30);
      await badges.onLeagueWeek([p.id]);
      expect(await tierOf(p.id, 'agir')).toBe(2);
      expect(await tierOf(p.id, 'roj')).toBe(1);
      expect(await tierOf(p.id, 'hefte')).toBe(1);
      expect(await tierOf(p.id, 'pela')).toBe(1);
    });

    it('Vegera for coming back after fourteen days away, and Kaniya zanînê for seven review days in a row', async () => {
      const p = await counted();
      const start = Date.parse('2025-08-01T10:00:00Z');
      for (let d = 0; d < 7; d++) await practiceOn(p.id, new Date(start + d * DAY));
      await badges.recordStreak(p.id, 1);
      expect(await tierOf(p.id, 'kaniya-zanine')).toBe(1);
      expect(await tierOf(p.id, 'vegera')).toBe(0);
      await addXp(pool, p.id, 10, new Date(start + 30 * DAY), { source: 'lesson_complete' });
      await badges.recordStreak(p.id, 1);
      expect(await tierOf(p.id, 'vegera')).toBe(1);
    });
  });

  describe('events', () => {
    it('Newroz for learning in Newroz week, each year; Mehane and the season badge for a monthly challenge met', async () => {
      const p = await counted();
      await addXp(pool, p.id, 10, new Date('2024-03-21T12:00:00Z'), { source: 'lesson_complete' });
      await addXp(pool, p.id, 10, new Date('2025-03-19T12:00:00Z'), { source: 'story' });
      await addXp(pool, p.id, 10, new Date('2025-05-15T12:00:00Z'), { source: 'practice_complete' });
      await addXp(pool, p.id, 10, new Date('2025-02-21T12:00:00Z'), { source: 'lesson_complete' });
      // eight days in July 2025 (June had none: the goal is eight)
      for (let d = 1; d <= 8; d++) await addXp(pool, p.id, 10, new Date(`2025-07-0${d}T09:00:00Z`), { source: 'lesson_complete' });
      // game XP is not learning
      await addXp(pool, p.id, 10, new Date('2023-03-21T12:00:00Z'), { source: 'wordle' });
      await badges.recordStreak(p.id, 1);
      expect(await progressOf(p.id, 'newroz')).toBe(2);
      expect(await tierOf(p.id, 'newroz')).toBe(2);
      expect(await tierOf(p.id, 'roja-ziman')).toBe(1);
      expect(await tierOf(p.id, 'zimane-dayike')).toBe(1);
      expect(await tierOf(p.id, 'mehane')).toBe(1);
      expect(await tierOf(p.id, 'havin')).toBe(1);
      expect(await tierOf(p.id, 'bihar')).toBe(0);
    });
  });

  describe('games', () => {
    it('Peyvzan, Tîrê rast, Heval and Mêvandar from a finished Peyvok Battle, through the play layer’s event', async () => {
      const me = await counted();
      const friend = await counted();
      await befriend(pool, me.id, friend.id);
      let id = '';
      for (let i = 0; i < 5; i++) {
        id = await battle(me, [
          { user: me, solved: true, guesses: i === 0 ? 2 : 4 },
          { user: friend, solved: i === 4, guesses: 5 },
        ]);
      }
      await badges.onGameFinished('wordle-battle', id);
      expect(await progressOf(me.id, 'peyvzan')).toBe(5);
      expect(await tierOf(me.id, 'peyvzan')).toBe(1);
      expect(await tierOf(me.id, 'tire-rast')).toBe(1);
      expect(await tierOf(me.id, 'heval')).toBe(2);
      expect(await tierOf(me.id, 'mevandar')).toBe(1);
      // the friend won none (solving more slowly, or not at all)
      expect(await progressOf(friend.id, 'peyvzan')).toBe(0);
      expect(await tierOf(friend.id, 'heval')).toBe(2);
    });

    it('a win needs someone to beat, and a tie at the top is a win for both', async () => {
      const a = await counted();
      const b = await counted();
      await battle(a, [{ user: a, solved: true, guesses: 3 }]);
      await battle(a, [
        { user: a, solved: true, guesses: 3, ms: 500 },
        { user: b, solved: true, guesses: 3, ms: 500 },
      ]);
      const m = await rhymeMatch(a, [
        { user: a, score: 10 },
        { user: b, score: 4 },
      ]);
      await badges.onGameFinished('rhyme-match', m);
      expect(await progressOf(a.id, 'peyvzan')).toBe(1);
      expect(await progressOf(b.id, 'peyvzan')).toBe(1);
      expect(await progressOf(a.id, 'helbestvan')).toBe(1);
      expect(await progressOf(b.id, 'helbestvan')).toBe(0);
    });

    it('Bilez, Rastnivîs and Destê zêrîn from races, but never from an implausible one', async () => {
      const p = await counted();
      await race(p.id, { wpm: 40, accuracy: 1, errors: 0 });
      await race(p.id, { wpm: 400, accuracy: 1, errors: 0, xp: 0 }); // implausible: worth nothing
      await badges.recordSoloGame(p.id);
      expect(await progressOf(p.id, 'bilez')).toBe(40);
      expect(await tierOf(p.id, 'bilez')).toBe(2);
      expect(await progressOf(p.id, 'rastnivis')).toBe(1);
      expect(await tierOf(p.id, 'deste-zerin')).toBe(1);
    });

    it('Guhdar, Ji nû ve and Mêvanê agir from story games; Hemereng once all four games are played', async () => {
      const me = await counted({ timezone: 'Asia/Baghdad' });
      const b = await counted();
      const c = await counted();
      // a group game won from last place at half time, with every answer of the second half right
      const g = await storyGame([
        { user: me, score: 900, correct: 6, early: 1 },
        { user: b, score: 800, correct: 7, early: 4 },
        { user: c, score: 700, correct: 6, early: 3 },
      ]);
      await badges.onGameFinished('stories', g);
      expect(await tierOf(me.id, 'ji-nu-ve')).toBe(1);
      expect(await tierOf(b.id, 'ji-nu-ve')).toBe(0);
      // three perfect quizzes
      for (let i = 0; i < 3; i++) await storyGame([{ user: me, score: 100, correct: 10, early: 5 }]);
      // a Newroz story finished on 21 March in Erbil (20 March 22:00 UTC)
      const nz = await storyGame([{ user: me, score: 10, correct: 2, early: 1 }], {
        title: 'Barana Newrozê',
        finishedAt: new Date('2025-03-20T22:00:00Z'),
      });
      await badges.onGameFinished('stories', nz);
      expect(await tierOf(me.id, 'guhdar')).toBe(1);
      expect(await tierOf(me.id, 'mevane-agir')).toBe(1);

      expect(await progressOf(me.id, 'hemereng')).toBe(1);
      await pool.query(
        `INSERT INTO wordle_games (user_id, mode, difficulty, target, target_length, status, finished_at)
         VALUES ($1, 'practice', 'easy', 'av', 2, 'won', now())`,
        [me.id],
      );
      await pool.query(
        `INSERT INTO rhyme_games (user_id, mode, dialect, prompt, window_ms, status, ended_at)
         VALUES ($1, 'training', 'kurmanci', 'dil', 60000, 'ended', now())`,
        [me.id],
      );
      await badges.recordSoloGame(me.id);
      expect(await progressOf(me.id, 'hemereng')).toBe(3);
      await race(me.id, { wpm: 20, accuracy: 0.9, errors: 2 });
      await badges.recordSoloGame(me.id);
      expect(await tierOf(me.id, 'hemereng')).toBe(1);
    });
  });

  describe('friends', () => {
    it('Diyarî counts a gift to one friend on one day once, however many', async () => {
      const giver = await counted();
      const a = await learner();
      const b = await learner();
      await pool.query(
        `INSERT INTO shop_items (sku, name, currency, price) VALUES ($1, 'Gul', 'zer', 10) ON CONFLICT DO NOTHING`,
        [`bd-gift-${suffix}`],
      );
      for (const to of [a, a, a, b]) {
        await pool.query(`INSERT INTO gifts (from_user_id, to_user_id, sku, price, currency) VALUES ($1, $2, $3, 10, 'zer')`, [
          giver.id,
          to.id,
          `bd-gift-${suffix}`,
        ]);
      }
      await badges.onGiftSent(giver.id);
      expect(await progressOf(giver.id, 'diyari')).toBe(2);
      expect(await tierOf(giver.id, 'diyari')).toBe(1);
    });
  });

  describe('the badges added later', () => {
    /** One published lesson holding an exercise of each of these kinds, finished with every answer right but the last. */
    const answeredLesson = async (userId: string, types: string[], finished = true) => {
      const c = await pool.query<{ id: string }>(
        `INSERT INTO courses (slug, dialect, title_ku, title_en) VALUES ($1, 'kurmanji', 'K', 'K') RETURNING id`,
        [`bd-${suffix}-${++n}`],
      );
      const unit = await pool.query<{ id: string }>(
        `INSERT INTO units (course_id, position, title_ku, title_en) VALUES ($1, 1, 'U', 'U') RETURNING id`,
        [c.rows[0]!.id],
      );
      const skill = await pool.query<{ id: string }>(
        `INSERT INTO skills (unit_id, position, title_ku, title_en) VALUES ($1, 1, 'S', 'S') RETURNING id`,
        [unit.rows[0]!.id],
      );
      const lesson = (
        await pool.query<{ id: string }>(
          `INSERT INTO lessons (skill_id, position, title_ku, title_en, status) VALUES ($1, 1, 'L', 'L', 'draft') RETURNING id`,
          [skill.rows[0]!.id],
        )
      ).rows[0]!.id;
      const exercises: string[] = [];
      for (const [i, type] of types.entries()) {
        const ex = await pool.query<{ id: string }>(
          `INSERT INTO exercises (lesson_id, position, type, payload) VALUES ($1, $2, $3, '{"prompt":"a","accepted":["a"]}') RETURNING id`,
          [lesson, i + 1, type],
        );
        exercises.push(ex.rows[0]!.id);
      }
      // exercises are fixed once their lesson is published
      await pool.query(`UPDATE lessons SET status = 'published', published_at = now() WHERE id = $1`, [lesson]);
      const s = await pool.query<{ id: string }>(
        `INSERT INTO lesson_sessions (user_id, lesson_id, total_count, correct_count, expires_at, completed_at)
         VALUES ($1, $2, $3, $3, now() + interval '1 hour', $4) RETURNING id`,
        [userId, lesson, types.length, finished ? new Date() : null],
      );
      for (const [i, exercise] of exercises.entries()) {
        const right = i < exercises.length - 1;
        await pool.query(`INSERT INTO session_answers (session_id, exercise_id, verdict, accepted) VALUES ($1, $2, $3, $4)`, [
          s.rows[0]!.id,
          exercise,
          right ? 'correct' : 'wrong',
          right,
        ]);
      }
    };

    it('Zengil counts listening and speaking answered right, Pênûs translating and writing, in finished lessons only', async () => {
      const p = await counted();
      // two right of each kind (the third, last, wrong); and an unfinished lesson that counts for nothing
      await answeredLesson(p.id, ['listening', 'speaking', 'listening', 'speaking', 'multiple_choice']);
      await answeredLesson(p.id, ['translate', 'writing', 'translate', 'writing', 'match_pairs']);
      await answeredLesson(p.id, ['listening', 'translate', 'multiple_choice'], false);
      await badges.recordLessonCompleted(p.id, 1);
      expect(await progressOf(p.id, 'zengil')).toBe(4);
      expect(await progressOf(p.id, 'penus')).toBe(4);
      expect(await tierOf(p.id, 'zengil')).toBe(0);
    });

    it('Çay counts the days a daily goal was met, Gula heftê the weeks learned on all seven days', async () => {
      const p = await counted();
      const monday = Date.parse('2025-09-01T08:00:00Z');
      for (let d = 0; d < 8; d++) {
        await pool.query(`INSERT INTO daily_goals (user_id, goal_date, effective_goal, completed_at) VALUES ($1, $2, 10, $3)`, [
          p.id,
          new Date(monday + d * DAY).toISOString().slice(0, 10),
          d < 7 ? new Date(monday + d * DAY) : null,
        ]);
        await addXp(pool, p.id, 10, new Date(monday + d * DAY), { source: 'lesson_complete' });
      }
      await badges.recordStreak(p.id, 8);
      expect(await progressOf(p.id, 'cay')).toBe(7);
      expect(await tierOf(p.id, 'cay')).toBe(1);
      expect(await tierOf(p.id, 'gula-hefte')).toBe(1);
    });

    it('Mamik counts the days’ Peyvok solved, Bilbil rhymes found in training, Pisîka Wanê a Peyvok won on the last guess', async () => {
      const p = await counted();
      for (let d = 0; d < 5; d++) await peyvok(p.id, { mode: 'daily', day: 9000 + d, won: true, guesses: 3 });
      await peyvok(p.id, { mode: 'daily', day: 9005, won: false, guesses: 6 });
      await peyvok(p.id, { mode: 'practice', won: true, guesses: 4 });
      for (const accepted of [30, 20]) {
        await pool.query(`INSERT INTO rhyme_games (user_id, prompt, window_ms, accepted, status, ended_at) VALUES ($1, 'dil', 60000, $2, 'ended', now())`, [
          p.id,
          accepted,
        ]);
      }
      await badges.recordSoloGame(p.id);
      expect(await progressOf(p.id, 'mamik')).toBe(5);
      expect(await tierOf(p.id, 'mamik')).toBe(1);
      expect(await tierOf(p.id, 'bilbil')).toBe(1);
      expect(await tierOf(p.id, 'pisika-wane')).toBe(0); // a loss on the sixth guess lands on nothing
      await peyvok(p.id, { mode: 'practice', won: true, guesses: 6 });
      await badges.recordSoloGame(p.id);
      expect(await tierOf(p.id, 'pisika-wane')).toBe(1);
    });

    it('Name counts a day’s writing to each friend once, however many messages, and no gift', async () => {
      const p = await counted();
      const a = await learner();
      const b = await learner();
      await befriend(pool, p.id, a.id);
      await befriend(pool, p.id, b.id);
      const write = async (to: string, at: Date, kind: 'text' | 'gift' = 'text') => {
        const [lo, hi] = p.id < to ? [p.id, to] : [to, p.id];
        await pool.query(
          kind === 'text'
            ? `INSERT INTO dm_messages (user_lo, user_hi, sender_id, body, created_at) VALUES ($1, $2, $3, 'Silav', $4)`
            : `INSERT INTO dm_messages (user_lo, user_hi, sender_id, kind, gift_batch_id, created_at) VALUES ($1, $2, $3, 'gift', gen_random_uuid(), $4)`,
          [lo, hi, p.id, at],
        );
      };
      const day = Date.parse('2025-10-01T09:00:00Z');
      await write(a.id, new Date(day));
      await write(a.id, new Date(day + 3_600_000));
      await write(b.id, new Date(day));
      await write(a.id, new Date(day + DAY));
      await write(b.id, new Date(day + 2 * DAY), 'gift');
      // their replies are theirs, not p's
      const [lo, hi] = p.id < a.id ? [p.id, a.id] : [a.id, p.id];
      await pool.query(`INSERT INTO dm_messages (user_lo, user_hi, sender_id, body) VALUES ($1, $2, $3, 'Silav')`, [lo, hi, a.id]);
      await badges.onLetterSent(p.id, a.id);
      expect(await progressOf(p.id, 'name')).toBe(3);
      expect(await tierOf(p.id, 'name')).toBe(1);
      expect(await progressOf(a.id, 'name')).toBe(0);
    });

    it('Sersal and Şeva Yeldayê for learning in their weeks, each year; Perperok for a return that became a week', async () => {
      const p = await counted();
      await addXp(pool, p.id, 10, new Date('2024-01-03T12:00:00Z'), { source: 'lesson_complete' });
      await addXp(pool, p.id, 10, new Date('2025-01-08T12:00:00Z'), { source: 'lesson_complete' }); // the eighth: too late
      await addXp(pool, p.id, 10, new Date('2024-12-21T12:00:00Z'), { source: 'story' });
      // away from 4 January to 1 March 2025, then seven days in a row
      for (let d = 0; d < 7; d++) await addXp(pool, p.id, 10, new Date(Date.parse('2025-03-01T12:00:00Z') + d * DAY), { source: 'practice_complete' });
      await badges.recordStreak(p.id, 7);
      expect(await tierOf(p.id, 'sersal')).toBe(1);
      expect(await tierOf(p.id, 'yelda')).toBe(1);
      expect(await tierOf(p.id, 'perperok')).toBe(1);
    });

    it('counts them quietly, once, for a learner counted before they existed, and tells what comes after', async () => {
      const p = await counted();
      // counted against the first catalogue: none of the later badges has been counted for them
      await pool.query(`UPDATE badge_users SET catalogue = 1 WHERE user_id = $1`, [p.id]);
      for (let d = 0; d < 7; d++) {
        await pool.query(`INSERT INTO daily_goals (user_id, goal_date, effective_goal, completed_at) VALUES ($1, $2, 10, now())`, [
          p.id,
          new Date(Date.parse('2025-06-01T00:00:00Z') + d * DAY).toISOString().slice(0, 10),
        ]);
      }
      const before = recorded.length;
      expect(await badges.recordStreak(p.id, 1)).toBeUndefined();
      expect(await tierOf(p.id, 'cay')).toBe(1);
      expect(recorded.length).toBe(before);
      expect(await badges.unseen(p.id)).toEqual([]);
      const version = await pool.query<{ catalogue: number }>(`SELECT catalogue FROM badge_users WHERE user_id = $1`, [p.id]);
      expect(version.rows[0]!.catalogue).toBe(3);
      // from now on it is a badge like any other: its next tier is told
      for (let d = 7; d < 30; d++) {
        await pool.query(`INSERT INTO daily_goals (user_id, goal_date, effective_goal, completed_at) VALUES ($1, $2, 10, now())`, [
          p.id,
          new Date(Date.parse('2025-06-01T00:00:00Z') + d * DAY).toISOString().slice(0, 10),
        ]);
      }
      expect(await badges.evaluate(p.id, ['cay'])).toEqual([{ key: 'cay', tier: 2 }]);
      expect(recorded.length).toBe(before + 1);
    });
  });

  describe('the seven added after those', () => {
    /** A review that counted (or not): an item answered for each verdict, `items` of them in the session. */
    const review = async (userId: string, verdicts: Array<'correct' | 'typo' | 'wrong'>, opts: { items?: number; xp?: number } = {}) => {
      const s = await pool.query<{ id: string }>(
        `INSERT INTO practice_sessions (user_id, item_ids, total_count, correct_count, xp_awarded, completed_at)
         VALUES ($1, '{}', $2, $3, $4, now()) RETURNING id`,
        [userId, opts.items ?? verdicts.length, verdicts.filter((v) => v !== 'wrong').length, opts.xp ?? 5],
      );
      for (const verdict of verdicts) {
        await pool.query(`INSERT INTO practice_answers (session_id, exercise_id, verdict, accepted) VALUES ($1, $2, $3, $4)`, [
          s.rows[0]!.id,
          await uuid(),
          verdict,
          verdict !== 'wrong',
        ]);
      }
    };
    const right = (n: number) => Array.from({ length: n }, () => 'correct' as const);

    it('Belûr counts what comes back only after a month or more; Mirarî a full review right the first time, to the letter', async () => {
      const p = await counted();
      for (let i = 0; i < 12; i++) {
        await pool.query(
          `INSERT INTO review_items (user_id, item_id, repetitions, interval_days, easiness, due_at, last_reviewed_at)
           VALUES ($1, $2, 5, $3, 2.5, now(), now())`,
          [p.id, `ex-${i}`, i < 10 ? 30 + i : 29],
        );
      }
      // one slip, a short review, a review that did not count, and one answer short
      await review(p.id, [...right(PRACTICE_TARGET - 1), 'typo']);
      await review(p.id, right(PRACTICE_TARGET - 1));
      await review(p.id, right(PRACTICE_TARGET), { xp: 0 });
      await review(p.id, right(PRACTICE_TARGET - 1), { items: PRACTICE_TARGET });
      await badges.recordStreak(p.id, 1);
      expect(await progressOf(p.id, 'belur')).toBe(10);
      expect(await tierOf(p.id, 'belur')).toBe(1);
      expect(await tierOf(p.id, 'mirari')).toBe(0);
      await review(p.id, right(PRACTICE_TARGET));
      await badges.recordStreak(p.id, 1);
      expect(await tierOf(p.id, 'mirari')).toBe(1);
    });

    it('Gencîne counts the words on the list, told by the dictionary when one is saved', async () => {
      const p = await counted();
      const repo = new DictionaryRepository(pool);
      for (let i = 0; i < 10; i++) {
        const entry = await repo.createEntry(`bd${suffix}w${++n}`);
        await pool.query(`INSERT INTO saved_words (user_id, entry_id) VALUES ($1, $2)`, [p.id, entry]);
      }
      await badges.onWordSaved(p.id);
      expect(await progressOf(p.id, 'gencine')).toBe(10);
      expect(await tierOf(p.id, 'gencine')).toBe(1);
      // taking words off the list does not take the badge's bar back
      await pool.query(`DELETE FROM saved_words WHERE user_id = $1`, [p.id]);
      await badges.onWordSaved(p.id);
      expect(await progressOf(p.id, 'gencine')).toBe(10);
    });

    it('Heyva çardehê counts the calendar months learned on every one of their days', async () => {
      const p = await counted();
      // all of February 2025 (28 days), and April but its last day
      for (let d = 0; d < 28; d++) await addXp(pool, p.id, 10, new Date(Date.parse('2025-02-01T12:00:00Z') + d * DAY), { source: 'lesson_complete' });
      for (let d = 0; d < 29; d++) await addXp(pool, p.id, 10, new Date(Date.parse('2025-04-01T12:00:00Z') + d * DAY), { source: 'story' });
      await badges.recordStreak(p.id, 1);
      expect(await progressOf(p.id, 'heyva-cardehe')).toBe(1);
      expect(await tierOf(p.id, 'heyva-cardehe')).toBe(1);
    });

    it('Elmas counts Peyvoks won in three guesses or fewer, Stêrka şiqitî one won on the very first', async () => {
      const p = await counted();
      for (const [d, guesses] of [2, 3, 2].entries()) await peyvok(p.id, { mode: 'daily', day: 9100 + d, won: true, guesses });
      await peyvok(p.id, { mode: 'practice', won: true, guesses: 3 });
      await peyvok(p.id, { mode: 'practice', won: true, guesses: 2 });
      await peyvok(p.id, { mode: 'practice', won: true, guesses: 4 }); // four is one too many
      await badges.recordSoloGame(p.id);
      expect(await progressOf(p.id, 'elmas')).toBe(5);
      expect(await tierOf(p.id, 'elmas')).toBe(1);
      expect(await tierOf(p.id, 'sterka-siqiti')).toBe(0);
      await peyvok(p.id, { mode: 'practice', won: true, guesses: 1 });
      await badges.recordSoloGame(p.id);
      expect(await tierOf(p.id, 'sterka-siqiti')).toBe(1);
      expect(await progressOf(p.id, 'elmas')).toBe(6);
    });

    it('Dilgerm counts rematches finished with a friend in them, through the play layer’s event', async () => {
      const me = await counted();
      const friend = await counted();
      const stranger = await counted();
      await befriend(pool, me.id, friend.id);
      const first = await battle(me, [
        { user: me, solved: true, guesses: 3 },
        { user: friend, solved: false, guesses: 6 },
      ]);
      // one more, because they both wanted it; and a rematch with someone who is not a friend
      const again = await battle(
        me,
        [
          { user: me, solved: false, guesses: 6 },
          { user: friend, solved: true, guesses: 4 },
        ],
        first,
      );
      const other = await battle(me, [{ user: me, solved: true, guesses: 3 }], null);
      await battle(
        me,
        [
          { user: me, solved: true, guesses: 3 },
          { user: stranger, solved: true, guesses: 5 },
        ],
        other,
      );
      const match = await rhymeMatch(friend, [
        { user: friend, score: 5 },
        { user: me, score: 4 },
      ]);
      await rhymeMatch(
        friend,
        [
          { user: friend, score: 3 },
          { user: me, score: 6 },
        ],
        match,
      );
      await badges.onGameFinished('wordle-battle', again);
      expect(await progressOf(me.id, 'dilgerm')).toBe(2);
      expect(await tierOf(me.id, 'dilgerm')).toBe(1);
      expect(await progressOf(friend.id, 'dilgerm')).toBe(2);
      await badges.evaluate(stranger.id, ['dilgerm']);
      expect(await progressOf(stranger.id, 'dilgerm')).toBe(0);
    });

    it('counts them quietly, once, for a learner counted against the second catalogue', async () => {
      const p = await counted();
      await pool.query(`UPDATE badge_users SET catalogue = 2 WHERE user_id = $1`, [p.id]);
      for (let i = 0; i < 5; i++) await peyvok(p.id, { mode: 'practice', won: true, guesses: 3 });
      await peyvok(p.id, { mode: 'practice', won: true, guesses: 1 });
      const before = recorded.length;
      await badges.recordStreak(p.id, 1);
      expect(await tierOf(p.id, 'elmas')).toBe(1);
      expect(await tierOf(p.id, 'sterka-siqiti')).toBe(1);
      expect(recorded.length).toBe(before);
      expect(await badges.unseen(p.id)).toEqual([]);
      const version = await pool.query<{ catalogue: number }>(`SELECT catalogue FROM badge_users WHERE user_id = $1`, [p.id]);
      expect(version.rows[0]!.catalogue).toBe(3);
    });
  });

  describe('ranked (from the ranks module’s events)', () => {
    it('records a rated game once, its tier and peak, and Kewê çiyê for beating a player two tiers up', async () => {
      const me = await counted();
      const strong = await counted();
      const event = {
        game: 'wordle-battle' as const,
        gameRef: await uuid(),
        seasonId: '2026-Q4',
        players: [
          { userId: me.id, place: 1, left: false, tierBefore: 0, tierAfter: 1, placementDone: true, beatTierGap: 2 },
          { userId: strong.id, place: 2, left: false, tierBefore: 2, tierAfter: 2, placementDone: true, beatTierGap: 0 },
        ],
      };
      await badges.onRatedGameFinished(event);
      await badges.onRatedGameFinished(event); // a retry
      const rows = await pool.query(`SELECT 1 FROM badge_rated_games WHERE game_ref = $1`, [event.gameRef]);
      expect(rows.rowCount).toBe(2);
      expect(await tierOf(me.id, 'kewe-ciye')).toBe(1);
      expect(await tierOf(me.id, 'cihgirti')).toBe(1);
      expect(await tierOf(me.id, 'rank-dest')).toBe(1);
      expect(await tierOf(me.id, 'rank-gir')).toBe(1);
      expect(await tierOf(me.id, 'rank-zozan')).toBe(0);
      expect(await tierOf(strong.id, 'kewe-ciye')).toBe(0);
      expect(await tierOf(strong.id, 'rank-zozan')).toBe(1);
    });

    it('a player who walked out is no Kewê çiyê, whatever the gap', async () => {
      // the ranks engine counts no gap over a player who walked out (engine.test.ts);
      // a leaver's own game never counts either
      const me = await counted();
      const strong = await counted();
      await badges.onRatedGameFinished({
        game: 'rhyme-match',
        gameRef: await uuid(),
        seasonId: '2026-Q4',
        players: [
          { userId: me.id, place: 1, left: false, tierBefore: 0, tierAfter: 0, placementDone: true, beatTierGap: 0 },
          { userId: strong.id, place: 2, left: true, tierBefore: 2, tierAfter: 2, placementDone: true, beatTierGap: 3 },
        ],
      });
      expect(await tierOf(me.id, 'kewe-ciye')).toBe(0);
      expect(await tierOf(strong.id, 'kewe-ciye')).toBe(0);
    });

    it('Hilkişer for ten rated games in a season, Dilpak for fair games since the last upheld report, Stêrk at a season’s close', async () => {
      const me = await counted();
      const other = await counted();
      for (let i = 0; i < 50; i++) {
        await badges.onRatedGameFinished({
          game: 'stories',
          gameRef: await uuid(),
          seasonId: '2026-Q3',
          finishedAt: new Date(Date.now() - (60 - i) * 60_000),
          players: [
            { userId: me.id, place: 1, left: false, tierBefore: null, tierAfter: null, placementDone: false, beatTierGap: 0 },
            { userId: other.id, place: 2, left: i % 2 === 0, tierBefore: null, tierAfter: null, placementDone: false, beatTierGap: 0 },
          ],
        });
      }
      expect(await tierOf(me.id, 'hilkiser')).toBe(1);
      expect(await tierOf(me.id, 'dilpak')).toBe(1);
      expect(await progressOf(other.id, 'dilpak')).toBe(25);
      expect(await tierOf(me.id, 'cihgirti')).toBe(0); // never finished placing

      await badges.onSeasonClosed({
        seasonId: '2026-Q3',
        results: [{ userId: me.id, game: 'stories', peakTier: 5, ratedGames: 50 }],
      });
      expect(await tierOf(me.id, 'rank-sterk')).toBe(1);
      expect(await tierOf(me.id, 'cihgirti')).toBe(1);

      // a report upheld against the other starts their fair-play count again
      await pool.query(
        `INSERT INTO sanctions (user_id, kind, policy, statement, origin) VALUES ($1, 'warning', 'harassment', 'x', 'moderator')`,
        [other.id],
      );
      const fair = await badges.evaluate(other.id, ['dilpak']);
      expect(fair).toEqual([]);
      // progress never falls, but nothing more is counted until new fair games
      expect(await progressOf(other.id, 'dilpak')).toBe(25);
    });
  });

  describe('telling the learner', () => {
    it('an unlock goes to the list (kind badge), live as badge_unlocked, and to one push a day', async () => {
      const p = await counted();
      await pool.query(`INSERT INTO user_streaks (user_id, current_streak, longest_streak, days_learned) VALUES ($1, 7, 7, 7)`, [p.id]);
      await badges.recordStreak(p.id, 7);
      await pool.query(`UPDATE user_streaks SET longest_streak = 30, current_streak = 30, days_learned = 30 WHERE user_id = $1`, [p.id]);
      await badges.recordStreak(p.id, 30);
      const mine = recorded.filter((r) => r.userId === p.id);
      expect(mine.map((r) => [r.n.data?.kind, r.n.data?.key, r.n.data?.tier])).toEqual([
        ['badge', 'agir', '1'],
        ['badge', 'agir', '2'],
        ['badge', 'roj', '1'],
      ]);
      expect(mine.every((r) => r.n.category === 'progress')).toBe(true);
      expect(live.filter((l) => l.userId === p.id).map((l) => l.e)).toContainEqual({
        type: 'badge_unlocked',
        key: 'agir',
        family: 'habit',
        tier: 2,
        tierKey: 'ziv',
        secret: false,
      });
      expect(pushes.filter((x) => x.userId === p.id)).toHaveLength(1);
      const push = await badges.dayPush(p.id, new Date().toISOString().slice(0, 10));
      expect(push).toMatchObject({ category: 'progress', title: 'New badges', body: 'You earned 2 badges today.' });

      // an unlock counted twice at once is told once
      const q = await counted();
      await pool.query(`INSERT INTO user_streaks (user_id, current_streak, longest_streak, days_learned) VALUES ($1, 7, 7, 1)`, [q.id]);
      await Promise.all([badges.recordStreak(q.id, 7), badges.recordStreak(q.id, 7), badges.recordStreak(q.id, 7)]);
      expect(recorded.filter((r) => r.userId === q.id)).toHaveLength(1);
    });

    it('unseen unlocks wait for the celebration, and are marked seen', async () => {
      const p = await counted();
      await pool.query(`INSERT INTO user_streaks (user_id, current_streak, longest_streak, days_learned) VALUES ($1, 7, 7, 1)`, [p.id]);
      await badges.recordStreak(p.id, 7);
      expect((await badges.unseen(p.id)).map((u) => [u.key, u.tier, u.tierKey])).toEqual([['agir', 1, 'sifir']]);
      await badges.markSeen(p.id, ['agir']);
      expect(await badges.unseen(p.id)).toEqual([]);
    });
  });

  describe('the badge page', () => {
    it('hides a secret not yet found, and gives its hint once one secret is found', async () => {
      const p = await counted();
      let page = await badges.list(p.id);
      const secret = page.badges.find((b) => b.key === 'tire-rast')!;
      expect(secret).toMatchObject({ hidden: true, hintKey: null, thresholds: [], progress: 0 });
      expect(page.secretsFound).toBe(0);
      expect(page.secretsTotal).toBe(10);
      await race(p.id, { wpm: 30, accuracy: 1, errors: 0 });
      await badges.recordSoloGame(p.id);
      page = await badges.list(p.id);
      expect(page.secretsFound).toBe(1);
      expect(page.badges.find((b) => b.key === 'deste-zerin')).toMatchObject({ hidden: false, tier: 1, tierKey: 'zer' });
      expect(page.badges.find((b) => b.key === 'tire-rast')).toMatchObject({ hidden: true, hintKey: 'badges.tire-rast.hint' });
      expect(page.badges).toHaveLength(62);
      expect(page.monthlyChallenge.goal).toBeGreaterThanOrEqual(8);
    });

    it('shows rarity only once 500 are active', async () => {
      const p = await counted();
      await badges.computeRarity();
      const small = await pool.query<{ active_users: number }>(`SELECT active_users FROM badge_rarity LIMIT 1`);
      if (small.rows[0]!.active_users < 500) {
        expect((await badges.list(p.id)).badges.every((b) => b.rarity === null)).toBe(true);
      }
      await pool.query(`UPDATE badge_rarity SET active_users = 1000, holders = 50 WHERE badge_key = 'agir' AND tier = 1`);
      expect((await badges.list(p.id)).badges.find((b) => b.key === 'agir')!.rarity).toEqual([5]);
      await badges.computeRarity();
    });

    it('the showcase holds up to three earned badges; a minor’s is shown only to friends', async () => {
      const teen = await counted({ age: 15 });
      await pool.query(`INSERT INTO user_streaks (user_id, current_streak, longest_streak, days_learned) VALUES ($1, 30, 30, 30)`, [teen.id]);
      await badges.recordStreak(teen.id, 30);
      await expect(badges.setShowcase(teen.id, ['bilez'])).rejects.toMatchObject({ code: 'BADGE_NOT_EARNED' });
      await expect(badges.setShowcase(teen.id, ['agir', 'roj', 'x', 'y'])).rejects.toMatchObject({ code: 'SHOWCASE_TOO_BIG' });
      expect(await badges.setShowcase(teen.id, ['roj', 'agir', 'roj'])).toEqual(['roj', 'agir']);
      const stranger = await learner();
      const friend = await learner();
      await befriend(pool, teen.id, friend.id);
      expect(await profileShowcase(pool, teen.id, stranger.id)).toEqual([]);
      expect(await profileShowcase(pool, teen.id, null)).toEqual([]);
      expect(await profileShowcase(pool, teen.id, friend.id)).toEqual([
        { key: 'roj', family: 'habit', tier: 1, tierKey: 'sifir' },
        { key: 'agir', family: 'habit', tier: 2, tierKey: 'ziv' },
      ]);
      expect((await profileShowcase(pool, teen.id, teen.id)).length).toBe(2);
    });
  });

  describe('the admin', () => {
    it('awards a tier as a floor and revokes to a cap a re-count respects, with a reason, and the showcase follows', async () => {
      const p = await counted();
      const admin = await learner();
      await badges.adminSet(p.id, 'bilez', 'award', 2, 'fixed a scoring bug', admin.id);
      expect(await tierOf(p.id, 'bilez')).toBe(2);
      expect(recorded.filter((r) => r.userId === p.id && r.n.data?.key === 'bilez')).toHaveLength(1);
      await badges.recordSoloGame(p.id);
      expect(await tierOf(p.id, 'bilez')).toBe(2);

      await race(p.id, { wpm: 60, accuracy: 1, errors: 0 });
      await badges.recordSoloGame(p.id);
      expect(await tierOf(p.id, 'bilez')).toBe(3);
      await badges.setShowcase(p.id, ['bilez']);
      await badges.adminSet(p.id, 'bilez', 'revoke', 0, 'a scripted race', admin.id);
      expect(await tierOf(p.id, 'bilez')).toBe(0);
      await badges.recordSoloGame(p.id);
      expect(await tierOf(p.id, 'bilez')).toBe(0);
      expect(await profileShowcase(pool, p.id, p.id)).toEqual([]);
      const history = await badges.adminUser(p.id);
      expect(history.actions.map((a) => [a.action, a.tier, a.reason])).toEqual([
        ['revoke', 0, 'a scripted race'],
        ['award', 2, 'fixed a scoring bug'],
      ]);
      await expect(badges.adminSet(p.id, 'nonsense', 'award', 1, 'x', admin.id)).rejects.toMatchObject({ code: 'UNKNOWN_BADGE' });
      await expect(badges.adminSet(p.id, 'vegera', 'award', 2, 'x', admin.id)).rejects.toMatchObject({ code: 'BAD_TIER' });
    });

    it('lists the catalogue with holders per tier', async () => {
      const cat = await badges.adminCatalogue();
      expect(cat.badges).toHaveLength(62);
      expect(cat.badges.find((b) => b.key === 'agir')!.holders[0]).toBeGreaterThan(0);
    });
  });

  describe('the old achievements', () => {
    it('move as the contract says, each earned when the achievement was', async () => {
      const p = await learner();
      const earned = new Date('2025-01-02T03:04:05Z');
      for (const a of ['streak-30', 'newroz-2026', 'words-1000', 'tournament-win', 'first-perfect']) {
        await pool.query(`INSERT INTO user_achievements (user_id, achievement_id, earned_at, seen_at) VALUES ($1, $2, $3, now())`, [
          p.id,
          a,
          earned,
        ]);
      }
      const path = '../../migrations/1751000177000_badges.js';
      const migration = (await import(/* @vite-ignore */ path)) as { up: (pgm: unknown) => void };
      const statements: string[] = [];
      const noop = () => undefined;
      migration.up({
        sql: (s: string) => statements.push(s),
        func: (s: string) => s,
        createTable: noop,
        addConstraint: noop,
        createIndex: noop,
      });
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const s of statements) await client.query(s);
        const rows = await client.query<{ badge_key: string; tier: number; floor_tier: number; earned_at: Date; tier_earned_at: Date[] }>(
          `SELECT badge_key, tier, floor_tier, earned_at, tier_earned_at FROM user_badges WHERE user_id = $1 ORDER BY badge_key`,
          [p.id],
        );
        expect(rows.rows.map((r) => [r.badge_key, r.tier, r.floor_tier])).toEqual([
          ['agir', 2, 2],
          ['newroz', 1, 1],
          ['peyven-min', 3, 3],
        ]);
        expect(rows.rows[0]!.earned_at.toISOString()).toBe(earned.toISOString());
        expect(rows.rows[0]!.tier_earned_at).toHaveLength(2);
        await client.query('COMMIT');
      } finally {
        client.release();
      }
      // a floor holds whatever the count says; the tournament win stays a legacy award
      await badges.evaluate(p.id);
      expect(await tierOf(p.id, 'agir')).toBe(2);
      const page = await badges.list(p.id);
      expect(page.legacy).toEqual([{ key: 'tournament-win', earnedAt: earned.toISOString() }]);
      expect(badgeDef('peyven-min')!.tiers[2]).toBe(1000);
    });
  });
});
