import type pg from 'pg';
import {
  ACCENT_MODES,
  DEFAULT_ACCENT_MODE,
  findUntypeable,
  normalizeTyping,
  scriptDialect,
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
import type { MilestoneRecorder } from '../achievements/service.js';
import { scoreRace } from './race.js';

/**
 * Typing race (solo time trial). The server hands out a text and records when; speed comes from that timestamp and the
 * submitted text, never a client-reported duration.
 *
 * A race has a variety (texts are picked by language) and an accent mode (@kurda/shared `typing`), both stored; the
 * mode decides what counts, so bests are per mode.
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
    private readonly deps: { milestones?: Pick<MilestoneRecorder, 'recordSoloGame'> } = {},
  ) {}

  /**
   * Start a race on a random active text in the requested variety, optionally of one length. Returns null when there is
   * none rather than inventing one or handing over a text in the other variety; the UI then says an admin must add one.
   */
  async start(userId: string, options: StartOptions = {}): Promise<RaceGame | null> {
    const dialect = options.dialect ?? 'kurmanci';
    const accentMode = options.accentMode ?? DEFAULT_ACCENT_MODE;
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
        // texts saved before saving normalised them are normalised here, so
        // the racer is shown the text in the form it is compared in
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
   * Finish a race: score what was typed against the text in the race's accent mode, timed by the server's clock. Pays
   * no XP.
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
          SET finished_at = now(), typed = $2, wpm = $3, accuracy = $4, score = $5,
              accent_misses = $6, errors = $7
        WHERE id = $1 AND finished_at IS NULL`,
      [gameId, typed, score.wpm, score.accuracy, score.score, score.accentMisses, score.errors],
    );
    if (saved.rowCount === 0) return { ok: false, reason: 'already-finished' };

    // A race pays no XP: it is run alone, and XP is for lessons and for games online with other people.
    // The typing badges count it from the saved race (one with a score: something typed, at a speed a person can type); best-effort
    await this.deps.milestones?.recordSoloGame?.(userId).catch(() => undefined);

    return {
      ok: true,
      result: {
        ...score,
        accentMode: game.accent_mode,
        elapsedMs,
        // always nothing; kept for the app versions that still read it
        xpAwarded: 0,
        // a first race beats nothing, so it is not a personal best
        personalBest: previousBest !== null && score.score > previousBest,
      },
    };
  }

  /**
   * A racer's best runs per accent mode, best first, and each mode's personal best. Ranked only within a mode, since a
   * forgiving run (e counts for ê) is a different race from a strict one. A worthless run (nothing typed right, or an
   * impossible speed) is listed but is never a personal best; otherwise a mode's personal best is the top of its list.
   */
  async best(
    userId: string,
    filter: { accentMode?: AccentMode; dialect?: TypingDialect } = {},
    limit = 10,
  ): Promise<RaceBestView> {
    const runs = await this.pool.query<RunRow>(
      `SELECT title, wpm, accuracy, score, accent_mode, dialect, finished_at
         FROM (SELECT t.title, g.wpm, g.accuracy, g.score, g.accent_mode, g.dialect, g.finished_at,
                      row_number() OVER (PARTITION BY g.accent_mode
                                         ORDER BY g.score DESC NULLS LAST, g.finished_at DESC) AS place
                 FROM race_games g JOIN race_texts t ON t.id = g.text_id
                WHERE g.user_id = $1 AND g.finished_at IS NOT NULL
                  AND ($2::text IS NULL OR g.accent_mode = $2) AND ($3::text IS NULL OR g.dialect = $3)) ranked
        WHERE place <= $4
        ORDER BY accent_mode, place`,
      [userId, filter.accentMode ?? null, filter.dialect ?? null, limit],
    );
    const racesByMode = Object.fromEntries(ACCENT_MODES.map((m) => [m, [] as RaceRun[]])) as Record<
      AccentMode,
      RaceRun[]
    >;
    for (const r of runs.rows) racesByMode[r.accent_mode].push(toRun(r));
    const personalBests = Object.fromEntries(
      ACCENT_MODES.map((m) => {
        const top = racesByMode[m][0];
        return [m, top && top.score > 0 ? top : null];
      }),
    ) as Record<AccentMode, RaceRun | null>;
    return { racesByMode, personalBests };
  }
}

interface RunRow {
  title: string;
  wpm: string;
  accuracy: string;
  /** set on every finished race (null only on one never finished, which is never listed) */
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
 * A text as saved: in the form a keyboard types (`normalizeTyping`: NFC, straight quotes, single spaces), so the stored
 * text is what the racer is compared with.
 *
 * It must be labelled with the language its script says, since the language decides who is handed it. A mismatch is
 * refused rather than silently relabelled; `details.language` names the script's language for the screen to offer.
 */
function normalizeText(input: Omit<RaceText, 'id'>): Omit<RaceText, 'id'> {
  const dialect = typingDialectOf(input.language);
  const script = scriptDialect(input.body);
  if (script !== null && script !== dialect) {
    const language = typingLanguage(script);
    throw new AppError(
      'TEXT_LANGUAGE_MISMATCH',
      400,
      script === 'sorani'
        ? 'this text is written in Arabic script: save it as Soranî (ckb)'
        : 'this text is written in Latin letters: save it as Kurmancî (kmr)',
      { language },
    );
  }
  const body = normalizeTyping(input.body, dialect);
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
