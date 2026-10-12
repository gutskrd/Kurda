import type pg from 'pg';
import {
  ACCENT_MODES,
  findUntypeable,
  normalizeTyping,
  typingDialectOf,
  typingLanguage,
  type AccentMode,
  type RaceBestView,
  type RaceGameView,
  type RaceLength,
  type RaceResultView,
  type RaceRun,
  type TypingDialect,
  type TypingLanguage,
  type UntypeableChar,
} from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import type { XpService } from '../xp/service.js';
import { raceXp, scoreRace } from './race.js';

/**
 * Typing race (solo time trial).
 *
 * The server hands out a text and remembers when it did. Speed is computed from
 * that timestamp and the text the racer submits — never from a duration the
 * client reports, which would make the leaderboard a fiction.
 *
 * A race is in a variety (the text is picked by its language) and in an accent
 * mode (@kurda/shared `typing`), both stored with it: the mode decides what
 * counts, so a racer's best is per mode.
 */

export interface RaceText {
  id: string;
  title: string;
  body: string;
  language: TypingLanguage;
  difficulty: number;
  active: boolean;
}

/** A race text as the admin screen gets it: what nobody could type in it, for the warning. */
export interface CuratedRaceText extends RaceText {
  untypeable: UntypeableChar[];
}

export type RaceGame = RaceGameView;
export type RaceResult = RaceResultView;

/** A finished race cannot be replayed, so a second submit is a distinct failure. */
export type FinishResult =
  | { ok: true; result: RaceResult }
  | { ok: false; reason: 'not-found' | 'already-finished' };

export interface StartOptions {
  /** 1 short … 3 long; any when left out */
  length?: RaceLength;
  dialect?: TypingDialect;
  accentMode?: AccentMode;
}

export class RaceService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly deps: { xp?: XpService } = {},
  ) {}

  /**
   * Start a race on a random active text in the variety asked for, optionally
   * of one length.
   *
   * Returns null when there is no such text rather than inventing one — or
   * handing a Kurmancî racer a Soranî text, which is what happened while the
   * text's language was ignored. An admin has to add one, and the UI says so
   * instead of showing an empty race.
   */
  async start(userId: string, options: StartOptions = {}): Promise<RaceGame | null> {
    const dialect = options.dialect ?? 'kurmanci';
    const accentMode = options.accentMode ?? 'forgiving';
    const text = await this.pool.query<{
      id: string;
      title: string;
      body: string;
      difficulty: number;
      language: TypingLanguage;
    }>(
      `SELECT id, title, body, difficulty, language FROM race_texts
        WHERE active AND language = $1 AND ($2::int IS NULL OR difficulty = $2)
        ORDER BY random() LIMIT 1`,
      [typingLanguage(dialect), options.length ?? null],
    );
    const row = text.rows[0];
    if (!row) return null;

    const game = await this.pool.query<{ id: string; started_at: Date }>(
      `INSERT INTO race_games (user_id, text_id, accent_mode, dialect)
       VALUES ($1, $2, $3, $4) RETURNING id, started_at`,
      [userId, row.id, accentMode, dialect],
    );
    return {
      id: game.rows[0]!.id,
      text: {
        id: row.id,
        title: row.title,
        // texts saved before they were normalised on save are normalised here,
        // so the racer is never shown a character nobody can type
        body: normalizeTyping(row.body, dialect),
        difficulty: row.difficulty as RaceLength,
        language: row.language,
      },
      dialect,
      accentMode,
      startedAt: game.rows[0]!.started_at.toISOString(),
    };
  }

  /**
   * Finish a race: score what was typed against the text, in the race's accent
   * mode, from the server's own clock, and award XP once.
   */
  async finish(userId: string, gameId: string, typed: string): Promise<FinishResult> {
    const row = await this.pool.query<{
      started_at: Date;
      finished_at: Date | null;
      accent_mode: AccentMode;
      dialect: TypingDialect;
      body: string;
    }>(
      `SELECT g.started_at, g.finished_at, g.accent_mode, g.dialect, t.body
         FROM race_games g JOIN race_texts t ON t.id = g.text_id
        WHERE g.id = $1 AND g.user_id = $2`,
      [gameId, userId],
    );
    const game = row.rows[0];
    if (!game) return { ok: false, reason: 'not-found' };
    if (game.finished_at) return { ok: false, reason: 'already-finished' };

    const elapsedMs = Date.now() - game.started_at.getTime();
    const score = scoreRace({
      target: game.body,
      typed,
      elapsedMs,
      accentMode: game.accent_mode,
      dialect: game.dialect,
    });
    const xpAwarded = raceXp(score);

    // the best before this one, in the same mode; read before this one is saved
    const previous = await this.pool.query<{ best: number | null }>(
      `SELECT max(score) AS best FROM race_games
        WHERE user_id = $1 AND accent_mode = $2 AND finished_at IS NOT NULL`,
      [userId, game.accent_mode],
    );
    const previousBest = previous.rows[0]?.best ?? null;

    // only an unfinished race is finished: two submits at once (a double tap)
    // cannot both be scored, and the loser is told it was already over
    const saved = await this.pool.query(
      `UPDATE race_games
          SET finished_at = now(), typed = $2, wpm = $3, accuracy = $4, score = $5, xp_awarded = $6,
              accent_misses = $7, errors = $8
        WHERE id = $1 AND finished_at IS NULL`,
      [gameId, typed, score.wpm, score.accuracy, score.score, xpAwarded, score.accentMisses, score.errors],
    );
    if (saved.rowCount === 0) return { ok: false, reason: 'already-finished' };

    if (xpAwarded > 0 && this.deps.xp) {
      // (source, refId) is unique, so a retry cannot pay twice
      await this.deps.xp
        .award({ userId, source: 'race', amount: xpAwarded, refId: gameId })
        .catch(() => undefined);
    }

    return {
      ok: true,
      result: {
        ...score,
        accentMode: game.accent_mode,
        elapsedMs,
        xpAwarded,
        // a first race beats nothing, so it is not a personal best
        personalBest: previousBest !== null && score.score > previousBest,
      },
    };
  }

  /**
   * A racer's best runs, best first — the "how am I doing" list — and the best
   * in each accent mode, since a forgiving run and a strict one are not the
   * same race. A run worth nothing (nothing typed right, or a speed nobody
   * types at) is nobody's best.
   */
  async best(
    userId: string,
    filter: { accentMode?: AccentMode; dialect?: TypingDialect } = {},
    limit = 10,
  ): Promise<RaceBestView> {
    const params = [userId, filter.accentMode ?? null, filter.dialect ?? null];
    const where = `g.user_id = $1 AND g.finished_at IS NOT NULL AND g.score > 0
       AND ($2::text IS NULL OR g.accent_mode = $2) AND ($3::text IS NULL OR g.dialect = $3)`;
    const [runs, bests] = await Promise.all([
      this.pool.query<RunRow>(
        `SELECT t.title, g.wpm, g.accuracy, g.score, g.accent_mode, g.dialect, g.finished_at
           FROM race_games g JOIN race_texts t ON t.id = g.text_id
          WHERE ${where}
          ORDER BY g.score DESC, g.finished_at DESC
          LIMIT $4`,
        [...params, limit],
      ),
      this.pool.query<RunRow>(
        `SELECT DISTINCT ON (g.accent_mode) t.title, g.wpm, g.accuracy, g.score, g.accent_mode, g.dialect, g.finished_at
           FROM race_games g JOIN race_texts t ON t.id = g.text_id
          WHERE ${where}
          ORDER BY g.accent_mode, g.score DESC, g.finished_at DESC`,
        params,
      ),
    ]);
    const personalBests = Object.fromEntries(ACCENT_MODES.map((m) => [m, null])) as Record<AccentMode, RaceRun | null>;
    for (const r of bests.rows) personalBests[r.accent_mode] = toRun(r);
    return { races: runs.rows.map(toRun), personalBests };
  }
}

interface RunRow {
  title: string;
  wpm: string;
  accuracy: string;
  score: number;
  accent_mode: AccentMode;
  dialect: TypingDialect;
  finished_at: Date;
}

function toRun(r: RunRow): RaceRun {
  return {
    title: r.title,
    wpm: Number(r.wpm),
    accuracy: Number(r.accuracy),
    score: r.score,
    accentMode: r.accent_mode,
    dialect: r.dialect,
    at: r.finished_at.toISOString(),
  };
}

/** The shortest and longest a race text can be, after normalising (the table holds it to the same). */
export const MIN_RACE_TEXT = 20;
export const MAX_RACE_TEXT = 2000;

/** Admin curation of the texts a race draws from. */
export class RaceTextService {
  constructor(private readonly pool: pg.Pool) {}

  async list(): Promise<CuratedRaceText[]> {
    const rows = await this.pool.query<RaceText>(
      `SELECT id, title, body, language, difficulty, active FROM race_texts ORDER BY difficulty, title`,
    );
    return rows.rows.map(curated);
  }

  async create(input: Omit<RaceText, 'id'>): Promise<CuratedRaceText> {
    const text = normalizeText(input);
    const res = await this.pool.query<RaceText>(
      `INSERT INTO race_texts (title, body, language, difficulty, active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, title, body, language, difficulty, active`,
      [text.title, text.body, text.language, text.difficulty, text.active],
    );
    return curated(res.rows[0]!);
  }

  /** Returns null when there is no such text, so the route can answer 404. */
  async update(id: string, input: Omit<RaceText, 'id'>): Promise<CuratedRaceText | null> {
    const text = normalizeText(input);
    const res = await this.pool.query<RaceText>(
      `UPDATE race_texts SET title = $2, body = $3, language = $4, difficulty = $5, active = $6
        WHERE id = $1
       RETURNING id, title, body, language, difficulty, active`,
      [id, text.title, text.body, text.language, text.difficulty, text.active],
    );
    return res.rows[0] ? curated(res.rows[0]) : null;
  }

  async remove(id: string): Promise<boolean> {
    const res = await this.pool.query(`DELETE FROM race_texts WHERE id = $1`, [id]);
    return (res.rowCount ?? 0) > 0;
  }
}

/**
 * A text as it is saved: in the form a keyboard types it (`normalizeTyping` —
 * NFC, straight quotes, single spaces), so the stored text is the one the racer
 * is compared with. The admin used to save whatever was pasted, trimmed, and a
 * text pasted decomposed could not be typed by anyone.
 */
function normalizeText(input: Omit<RaceText, 'id'>): Omit<RaceText, 'id'> {
  const body = normalizeTyping(input.body, typingDialectOf(input.language));
  const length = [...body].length;
  if (length < MIN_RACE_TEXT) {
    throw new AppError('TEXT_TOO_SHORT', 400, `a race text needs at least ${MIN_RACE_TEXT} characters`);
  }
  // "…" becomes "...", so a text can grow past the limit on the way in
  if (length > MAX_RACE_TEXT) {
    throw new AppError('TEXT_TOO_LONG', 400, `a race text can have at most ${MAX_RACE_TEXT} characters`);
  }
  const title = input.title.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!title) throw new AppError('TITLE_REQUIRED', 400, 'a race text needs a title');
  return { ...input, title, body };
}

function curated(text: RaceText): CuratedRaceText {
  return { ...text, untypeable: findUntypeable(text.body, typingDialectOf(text.language)) };
}

/** Thrown by the route when a race is asked for and the pool is empty. */
export const EMPTY_RACE_POOL = new AppError('EMPTY_RACE_POOL', 503, 'no race texts available yet');
