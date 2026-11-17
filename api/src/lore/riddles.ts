/**
 * The Stories' riddles, for learners (routes.ts): a variety's published
 * riddles, one riddle's page, a hint at a time, a guess checked here, and the
 * answer when it is asked for.
 *
 * Nothing is sent that would spoil a riddle before the learner asks for it:
 * a list and a riddle's page carry its question, its place in the collection
 * and how many hints it has, and never a hint not yet taken, the answer, the
 * forms it accepts or the explanation. A hint is one call; the answer comes
 * with a right guess or a reveal. Only published, approved rows are read, and
 * a riddle that is not one is 404, the same as one that never existed.
 *
 * Anybody may play, signed in or not. A visitor's hints, guesses and reveals
 * are answered and remembered nowhere: the app keeps them. A signed-in
 * learner's are kept (`riddle_progress`), and a riddle solved by a guess
 * before its answer was shown pays a little XP once (`riddleXp`, shared): a
 * game source under the league's daily cap, its ledger ref
 * `riddle:<contentId>:<userId>` so it can be paid only once whatever happens.
 * A riddle revealed first stays revealed, and solving it after pays nothing
 * and does not count as solved; a riddle solved stays solved.
 *
 * Every text a riddle has in another language is sent with it, whatever that
 * language's review says (content-translations.ts): the review is the record
 * of who read it.
 */
import type pg from 'pg';
import {
  RIDDLE_DIFFICULTIES,
  RIDDLE_XP_SOURCE,
  checkGameContent,
  dailyLorePick,
  isAppLocale,
  riddleGuessMatches,
  riddleGuessNear,
  riddleXp,
  type AppLocale,
  type GameDialect,
  type RiddleAnswer,
  type RiddleCard,
  type RiddleContent,
  type RiddleDetail,
  type RiddleGuessResult,
  type RiddleHint,
  type RiddleList,
  type RiddleState,
} from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { localDate, safeTimeZone } from '../streaks/streak-logic.js';
import type { XpService } from '../xp/service.js';

/** A published riddle, read and checked. */
interface Riddle {
  id: string;
  dialect: GameDialect;
  payload: RiddleContent;
  /** what each other language says, as far as each has been written */
  translations: Partial<Record<AppLocale, { question?: string; hints?: string[]; answer?: string; explanation?: string }>>;
}

interface Progress {
  hints_used: number;
  guesses: number;
  revealed_at: Date | null;
  solved_at: Date | null;
  xp_awarded: number;
}

const LIVE = `kind = 'riddle' AND status = 'published' AND review_status = 'approved'`;

/** What a translation field is when it is there: a string with something in it. */
const filled = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

function stateOf(p: Progress | undefined): RiddleState {
  if (!p) return 'new';
  if (p.solved_at) return 'solved';
  if (p.revealed_at) return 'revealed';
  return p.hints_used > 0 || p.guesses > 0 ? 'trying' : 'new';
}

function card(r: Riddle, progress: Progress | undefined): RiddleCard {
  const p = r.payload;
  const translations: RiddleCard['translations'] = {};
  for (const [locale, t] of Object.entries(r.translations)) if (filled(t?.question)) translations[locale as AppLocale] = { question: t.question };
  return {
    slug: p.slug,
    dialect: r.dialect,
    difficulty: p.difficulty,
    category: p.category,
    tradition: p.tradition,
    region: p.region ?? null,
    question: p.question,
    translations,
    hintCount: p.hints.length,
    state: stateOf(progress),
  };
}

function hint(r: Riddle, index: number): RiddleHint {
  const translations: RiddleHint['translations'] = {};
  for (const [locale, t] of Object.entries(r.translations)) {
    const text = t?.hints?.[index];
    if (filled(text)) translations[locale as AppLocale] = text;
  }
  return { index, text: r.payload.hints[index]!, translations };
}

function answer(r: Riddle): RiddleAnswer {
  const p = r.payload;
  const translations: RiddleAnswer['translations'] = {};
  for (const [locale, t] of Object.entries(r.translations)) {
    if (filled(t?.answer) && filled(t?.explanation)) translations[locale as AppLocale] = { answer: t.answer, explanation: t.explanation };
  }
  return { answer: p.answer, explanation: p.explanation, translations, tradition: p.tradition, region: p.region ?? null, sources: p.sources };
}

export class RiddleService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly xp: XpService,
  ) {}

  /** Published riddles (of a variety, or the one with a slug), each checked again as it is read: a row a rule now refuses is left out. */
  private async riddles(where: { dialect: GameDialect } | { slug: string }, db: Pick<pg.Pool, 'query'> = this.pool): Promise<Riddle[]> {
    const res = await db.query<{ id: string; dialect: GameDialect; payload: unknown }>(
      'dialect' in where
        ? `SELECT id, dialect, payload FROM game_content WHERE ${LIVE} AND dialect = $1`
        : `SELECT id, dialect, payload FROM game_content WHERE ${LIVE} AND payload->>'slug' = $1`,
      ['dialect' in where ? where.dialect : where.slug],
    );
    const rows = res.rows.flatMap((row) => {
      const checked = checkGameContent('riddle', row.dialect, row.payload);
      return checked.ok ? [{ id: row.id, dialect: row.dialect, payload: checked.payload, translations: {} } as Riddle] : [];
    });
    if (rows.length === 0) return rows;
    const t = await db.query<{ content_id: string; locale: string; payload: Riddle['translations'][AppLocale] }>(
      `SELECT content_id, locale, payload FROM game_content_translations WHERE content_id = ANY($1::uuid[])`,
      [rows.map((r) => r.id)],
    );
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const tr of t.rows) {
      const r = byId.get(tr.content_id);
      if (r && isAppLocale(tr.locale) && tr.payload && typeof tr.payload === 'object') r.translations[tr.locale] = tr.payload;
    }
    // easy ones first, then by slug: the same order every time
    return rows.sort(
      (a, b) =>
        RIDDLE_DIFFICULTIES.indexOf(a.payload.difficulty) - RIDDLE_DIFFICULTIES.indexOf(b.payload.difficulty) ||
        (a.payload.slug < b.payload.slug ? -1 : a.payload.slug > b.payload.slug ? 1 : 0),
    );
  }

  private async one(slug: string, db?: Pick<pg.Pool, 'query'>): Promise<Riddle> {
    const [r] = await this.riddles({ slug }, db);
    if (!r) throw new AppError('NOT_FOUND', 404, 'no such riddle');
    return r;
  }

  private async progressOf(userId: string | null, ids: readonly string[]): Promise<Map<string, Progress>> {
    if (!userId || ids.length === 0) return new Map();
    const res = await this.pool.query<Progress & { content_id: string }>(
      `SELECT content_id, hints_used, guesses, revealed_at, solved_at, xp_awarded FROM riddle_progress WHERE user_id = $1 AND content_id = ANY($2::uuid[])`,
      [userId, ids],
    );
    return new Map(res.rows.map((r) => [r.content_id, r]));
  }

  /** The calendar day the viewer is on: a signed-in learner's own, else the UTC one. */
  private async today(userId: string | null, now: Date): Promise<string> {
    if (!userId) return localDate(now, 'UTC');
    const res = await this.pool.query<{ timezone: string | null }>(`SELECT timezone FROM users WHERE id = $1`, [userId]);
    return localDate(now, safeTimeZone(res.rows[0]?.timezone));
  }

  async list(dialect: GameDialect, userId: string | null, now = new Date()): Promise<RiddleList> {
    const riddles = await this.riddles({ dialect });
    const [progress, day] = await Promise.all([this.progressOf(userId, riddles.map((r) => r.id)), this.today(userId, now)]);
    const cards = riddles.map((r) => card(r, progress.get(r.id)));
    return {
      riddles: cards,
      daily: dailyLorePick(cards.map((c) => c.slug), day),
      solved: cards.filter((c) => c.state === 'solved').length,
      total: cards.length,
    };
  }

  async daily(dialect: GameDialect, userId: string | null, now = new Date()): Promise<{ slug: string | null }> {
    const riddles = await this.riddles({ dialect });
    return { slug: dailyLorePick(riddles.map((r) => r.payload.slug), await this.today(userId, now)) };
  }

  async detail(slug: string, userId: string | null): Promise<{ riddle: RiddleDetail }> {
    const r = await this.one(slug);
    const progress = (await this.progressOf(userId, [r.id])).get(r.id);
    const taken = Math.min(progress?.hints_used ?? 0, r.payload.hints.length);
    return { riddle: { ...card(r, progress), hintsUsed: Array.from({ length: taken }, (_, i) => hint(r, i)) } };
  }

  /**
   * A learner's record of a riddle, locked for this change: made on first
   * touch, so two requests at once are taken one after the other.
   */
  private async lockProgress(client: pg.PoolClient, userId: string, contentId: string): Promise<Progress> {
    await client.query(`INSERT INTO riddle_progress (user_id, content_id) VALUES ($1, $2) ON CONFLICT (user_id, content_id) DO NOTHING`, [userId, contentId]);
    const res = await client.query<Progress>(
      `SELECT hints_used, guesses, revealed_at, solved_at, xp_awarded FROM riddle_progress WHERE user_id = $1 AND content_id = $2 FOR UPDATE`,
      [userId, contentId],
    );
    return res.rows[0]!;
  }

  private async tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * One hint, by its place. A signed-in learner takes them in order (the
   * second after the first), and the count is kept for what a solve pays; a
   * hint already taken can be read again for nothing more, and once the
   * riddle is solved or revealed any hint can be. A visitor's are not kept.
   */
  async hint(slug: string, index: number, userId: string | null): Promise<{ hint: RiddleHint }> {
    const r = await this.one(slug);
    if (index >= r.payload.hints.length) throw new AppError('NOT_FOUND', 404, 'this riddle has no such hint');
    if (userId) {
      await this.tx(async (client) => {
        const p = await this.lockProgress(client, userId, r.id);
        // once it is solved or its answer shown, every hint may be read, and none counts any more
        if (p.solved_at || p.revealed_at) return;
        if (index > p.hints_used) throw new AppError('HINT_ORDER', 409, 'take the hint before this one first');
        if (index + 1 > p.hints_used) {
          await client.query(`UPDATE riddle_progress SET hints_used = $3 WHERE user_id = $1 AND content_id = $2`, [userId, r.id, index + 1]);
        }
      });
    }
    return { hint: hint(r, index) };
  }

  /**
   * A guess, checked by the shared rule (`riddleGuessMatches`). Right, it
   * comes back with the answer; wrong, with how near it was when it was
   * (`riddleGuessNear`: a word the riddle lists as near, a letter away, or
   * the answer in the learner's own language, `locale`), and nothing more:
   * a near guess reveals nothing. A signed-in learner's guesses before a
   * solve or a reveal are counted, near ones too, and the first right one
   * solves the riddle and pays.
   */
  async guess(slug: string, text: string, userId: string | null, locale: AppLocale | null = null): Promise<RiddleGuessResult> {
    const r = await this.one(slug);
    const correct = riddleGuessMatches(text, [r.payload.answer, ...r.payload.accepted], r.dialect);
    const wrong = (): RiddleGuessResult => {
      // the answer in a Kurdish interface's own language is the answer itself: only another language's is a near miss
      const own = locale && locale !== 'ku' && locale !== 'ckb' ? r.translations[locale]?.answer : undefined;
      const near = riddleGuessNear(text, { answers: [r.payload.answer, ...r.payload.accepted], near: r.payload.near, translated: own ? [own] : [] }, r.dialect);
      return near ? { correct: false, near } : { correct: false };
    };
    if (!userId) return correct ? { correct: true, answer: answer(r), xp: 0 } : wrong();
    const xp = await this.tx(async (client) => {
      const p = await this.lockProgress(client, userId, r.id);
      // once solved, or once its answer was shown, a guess changes nothing
      if (p.solved_at || p.revealed_at) return 0;
      const guesses = Math.min(p.guesses + 1, 32_000);
      if (!correct) {
        await client.query(`UPDATE riddle_progress SET guesses = $3 WHERE user_id = $1 AND content_id = $2`, [userId, r.id, guesses]);
        return 0;
      }
      const amount = riddleXp(r.payload.difficulty, { hintsUsed: p.hints_used, guesses, revealed: false });
      const paid = amount > 0 ? await this.xp.award({ userId, source: RIDDLE_XP_SOURCE, amount, refId: `riddle:${r.id}:${userId}` }, client) : 0;
      await client.query(`UPDATE riddle_progress SET guesses = $3, solved_at = now(), xp_awarded = $4 WHERE user_id = $1 AND content_id = $2`, [
        userId,
        r.id,
        guesses,
        paid,
      ]);
      return paid;
    });
    return correct ? { correct: true, answer: answer(r), xp } : wrong();
  }

  /** The answer, asked for. A signed-in learner's riddle is revealed from now on, unless they had already solved it. */
  async reveal(slug: string, userId: string | null): Promise<{ answer: RiddleAnswer }> {
    const r = await this.one(slug);
    if (userId) {
      await this.tx(async (client) => {
        const p = await this.lockProgress(client, userId, r.id);
        if (!p.solved_at && !p.revealed_at) await client.query(`UPDATE riddle_progress SET revealed_at = now() WHERE user_id = $1 AND content_id = $2`, [userId, r.id]);
      });
    }
    return { answer: answer(r) };
  }
}
