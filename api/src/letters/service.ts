import type pg from 'pg';
import {
  BIRD_CALLS_PER_DAY,
  BIRD_OUT_DAYS,
  LETTERS_PER_DAY,
  LETTER_BIRD_PRICE,
  PEN_PALS_MAX,
  SKY_BIRDS_SHOWN,
  VISIT_HOURS,
  isLetterBird,
  letterAgeBand,
  letterBirdOf,
  letterProblem,
  normalizeKurdish,
  stripControlChars,
  type BirdOutResult,
  type LetterAgeBand,
  type LetterItem,
  type LetterPerson,
  type LetterThread,
  type LetterVisitor,
  type LettersHome,
  type PenPal,
  type VisitorAnswer,
} from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { notBlockedSql } from '../friends/blocked.js';
import { canonicalPair } from '../friends/pair.js';
import type { Notification } from '../push/service.js';
import { activeRestriction } from '../moderation/sanctions-service.js';
import type { WalletService } from '../wallet/service.js';

/**
 * Letters by bird (shared/src/letters.ts says what they are): sending a bird
 * out to somebody new, the meeting of two birds, pen pals writing in turn,
 * saying goodbye, and the page that shows it all.
 *
 * A bird sent out waits over the country, with its letter, until somebody
 * calls it to their window (`call`). It waits there while its letter is read;
 * answered (`answer`), it carries the answer home and the two are pen pals;
 * sent on (`sendOn`), or left unanswered a day, it flies back out for
 * somebody else, and never comes to that window again.
 *
 * Safety is the shape of the thing rather than a layer over it:
 *   - nobody chooses whom they write to; a call brings the bird that has
 *     waited longest, in the same age band, and never one from somebody they
 *     have written to before or with a block between them, and only a few
 *     birds a day can be called, so nobody can leaf through everybody's letters;
 *   - the band is checked against both birth months at the meeting and at
 *     every letter after it, so a pair whose bands part can write no more;
 *   - a letter is one at a time: you write, and wait for theirs. Nobody can be
 *     sent a stream of letters, and saying goodbye ends it for both;
 *   - a letter holds no link, email address, phone number or handle
 *     (`letterProblem`), and the words the rest of the app filters are masked;
 *   - a person muted from chat by moderation cannot write letters either, and
 *     a letter can be reported like a message, with the letters around it kept.
 *
 * Each member chooses their bird once, for free; another after that is paid
 * for in Zêr (`chooseBird`). Until they choose, their bird comes from their id.
 */

/** The ledger's name for paying for a new bird. */
export const LETTER_BIRD_REASON = 'letter_bird';

/** What the service needs from the rest of the app: the word filter and the mute, and a way to tell somebody a letter has come. */
export interface LetterDeps {
  moderation?: {
    filter(text: string): { masked: string; flagged: boolean };
    isChatMuted(userId: string): Promise<boolean>;
    recordOffense(userId: string): Promise<unknown>;
  };
  /** writes the line into the person's notifications */
  inbox?: { record(userId: string, notification: Notification): Promise<void> };
  /** pushes a line already written (jobs/push-jobs.ts `pushRecorded`) */
  push?: (userId: string, notification: Notification) => Promise<void>;
  log?: { warn(obj: unknown, msg: string): void };
  /** pays for a new bird; without it a bird can be chosen once and not changed */
  wallet?: Pick<WalletService, 'debitWithin' | 'balances'>;
}

/** SQL: the age in whole years of the user behind `alias`, the birth month counted as the younger age (users/age.ts). */
function ageSql(alias: string): string {
  return `(extract(year FROM now() AT TIME ZONE 'UTC')::int - ${alias}.birth_year
    - CASE WHEN extract(month FROM now() AT TIME ZONE 'UTC')::int <= ${alias}.birth_month THEN 1 ELSE 0 END)`;
}

/** SQL twin of `letterAgeBand`: the band of the user behind `alias` now, or NULL. `alias` is a literal from this file. */
export function letterBandSql(alias: string): string {
  return `(CASE WHEN ${alias}.birth_year IS NULL THEN NULL
       WHEN ${ageSql(alias)} < 13 THEN NULL
       WHEN ${ageSql(alias)} < 16 THEN '13-15'
       WHEN ${ageSql(alias)} < 18 THEN '16-17'
       ELSE '18+' END)`;
}

interface MeRow {
  id: string;
  birth_year: number | null;
  birth_month: number | null;
  name: string;
}

interface LetterRow {
  id: string;
  sender_id: string;
  body: string;
  status: string;
  created_at: Date;
  read_at: Date | null;
}

const toItem = (row: LetterRow, me: string): LetterItem => ({
  id: row.id,
  mine: row.sender_id === me,
  // a letter moderation took down says so in its place, in the app's own words
  body: row.status === 'removed' ? '' : row.body,
  removed: row.status === 'removed',
  sentAt: row.created_at.toISOString(),
  readAt: row.read_at ? row.read_at.toISOString() : null,
});

/** Somebody as the letters show them: the bird they chose, or the one their id gives them until they choose. */
const personOf = (id: string, name: string, bird: number | null): LetterPerson => ({ id, name, bird: isLetterBird(bird) ? bird : letterBirdOf(id) });

/** SQL: the bird the user behind `alias` chose, or NULL before they choose one. `alias` is a literal from this file. */
const BIRD_SQL = (alias: string): string => `(SELECT lb.bird FROM letter_birds lb WHERE lb.user_id = ${alias}.id)`;

/**
 * SQL: the birds out there that the person `$1`, in the band `$2`, could call
 * — out less than `BIRD_OUT_DAYS`, from somebody in the band now as when it
 * was sent, with an account in good standing, no block either way, never a
 * correspondence between the two, room for another pen pal, at nobody's
 * window now and never at this one before. `l` is the letter and `u` its writer.
 */
const CALLABLE_SQL = `FROM letters l JOIN users u ON u.id = l.sender_id
   WHERE l.status = 'flying' AND l.age_band = $2 AND l.sender_id <> $1::uuid
     AND l.created_at > now() - make_interval(days => ${BIRD_OUT_DAYS})
     AND u.deleted_at IS NULL AND u.banned_at IS NULL AND NOT u.guest
     AND ${letterBandSql('u')} = $2
     AND ${notBlockedSql('l.sender_id', '$1::uuid')}
     AND NOT EXISTS (SELECT 1 FROM letter_threads t WHERE t.user_lo = least(l.sender_id, $1::uuid) AND t.user_hi = greatest(l.sender_id, $1::uuid))
     AND (SELECT count(*) FROM letter_threads t WHERE t.ended_at IS NULL AND (t.user_lo = l.sender_id OR t.user_hi = l.sender_id)) < ${PEN_PALS_MAX}
     AND NOT EXISTS (SELECT 1 FROM letter_visits v WHERE v.letter_id = l.id AND (v.ended_at IS NULL OR v.visitor_id = $1::uuid))`;

/** A bird at somebody's window as the apps are told of it: whose, its letter, and when it came and flies on. */
const visitorItem = (row: LetterRow & { called_at: Date; name: string; bird: number | null }, me: string): LetterVisitor => ({
  person: personOf(row.sender_id, row.name, row.bird),
  letter: toItem(row, me),
  since: row.called_at.toISOString(),
  leavesAt: new Date(row.called_at.getTime() + VISIT_HOURS * 3_600_000).toISOString(),
});

/**
 * SQL: it is `me`'s turn to write in the correspondence `thread` — the other
 * has written, and nothing of mine was delivered after their last letter.
 * The two letters that cross when two birds meet are delivered in the same
 * moment, so after a meeting either of the two may answer first; from then on
 * it goes a letter each in turn. `thread` and `me` are literals from this file.
 */
const YOUR_TURN_SQL = (thread: string, me: string): string => `(
  EXISTS (SELECT 1 FROM letters written WHERE written.thread_id = ${thread} AND written.sender_id <> ${me} AND written.status IN ('delivered','removed'))
  AND NOT EXISTS (
    SELECT 1 FROM letters mine WHERE mine.thread_id = ${thread} AND mine.sender_id = ${me} AND mine.status IN ('delivered','removed')
       AND mine.delivered_at > (SELECT max(theirs.delivered_at) FROM letters theirs WHERE theirs.thread_id = ${thread} AND theirs.sender_id <> ${me} AND theirs.status IN ('delivered','removed'))))`;

/** The name a pen pal is shown by: their display name, or their username. */
const NAME_SQL = (alias: string): string => `COALESCE(NULLIF(btrim(${alias}.display_name), ''), ${alias}.username)`;

export class LetterService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly deps: LetterDeps = {},
  ) {}

  /** Who is writing: their birth month and name. A deleted, banned or guest account writes nothing. */
  private async me(db: Pick<pg.Pool, 'query'>, userId: string): Promise<MeRow> {
    const r = await db.query<MeRow>(
      `SELECT u.id, u.birth_year, u.birth_month, ${NAME_SQL('u')} AS name
         FROM users u WHERE u.id = $1 AND u.deleted_at IS NULL AND u.banned_at IS NULL AND NOT u.guest`,
      [userId],
    );
    const row = r.rows[0];
    if (!row) throw new AppError('NOT_FOUND', 404, 'account not found');
    return row;
  }

  private bandOf(me: MeRow): LetterAgeBand {
    const band = me.birth_year !== null && me.birth_month !== null ? letterAgeBand({ year: me.birth_year, month: me.birth_month }) : null;
    if (!band) throw new AppError('BIRTH_MONTH_REQUIRED', 403, 'letters need your birth month');
    return band;
  }

  /**
   * A letter as it will be sent: control characters out, Kurdish letters in
   * their one spelling, refused for a link or a way to be reached, and with
   * the filtered words masked. A muted writer is refused here too.
   */
  private async cleaned(me: string, raw: string): Promise<string> {
    const text = normalizeKurdish(stripControlChars(raw)).trim();
    const problem = letterProblem(text);
    if (problem) throw new AppError(`LETTER_${problem.toUpperCase()}`, 422, `the letter cannot be sent: ${problem}`);
    const moderation = this.deps.moderation;
    if (!moderation) return text;
    if (await moderation.isChatMuted(me)) throw new AppError('CHAT_MUTED', 403, 'you are muted from writing to people');
    const filtered = moderation.filter(text);
    if (filtered.flagged) void moderation.recordOffense(me).catch(() => undefined);
    return filtered.masked;
  }

  /** Letters sent in the last day, refused past the day's number. */
  private async withinDay(db: Pick<pg.Pool, 'query'>, me: string): Promise<void> {
    const r = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM letters WHERE sender_id = $1 AND created_at > now() - interval '1 day'`,
      [me],
    );
    if ((r.rows[0]?.n ?? 0) >= LETTERS_PER_DAY) throw new AppError('LETTERS_TODAY', 429, 'that is enough letters for today');
  }

  /** A bird out longer than it waits comes home with its letter, unless it is at somebody's window: then it stays until that visit is over. */
  private async comeHome(db: Pick<pg.Pool, 'query'>, me: string): Promise<void> {
    await db.query(
      `UPDATE letters l SET status = 'recalled'
        WHERE l.sender_id = $1 AND l.status = 'flying' AND l.created_at < now() - make_interval(days => $2)
          AND NOT EXISTS (SELECT 1 FROM letter_visits v WHERE v.letter_id = l.id AND v.ended_at IS NULL)`,
      [me, BIRD_OUT_DAYS],
    );
  }

  /** Correspondences somebody has open, closing any a block now stands across. */
  private async openThreads(db: Pick<pg.Pool, 'query'>, me: string): Promise<number> {
    await db.query(
      `UPDATE letter_threads t SET ended_at = now()
        WHERE t.ended_at IS NULL AND (t.user_lo = $1 OR t.user_hi = $1)
          AND NOT ${notBlockedSql('t.user_lo', 't.user_hi')}`,
      [me],
    );
    const r = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM letter_threads WHERE ended_at IS NULL AND (user_lo = $1 OR user_hi = $1)`,
      [me],
    );
    return r.rows[0]?.n ?? 0;
  }

  /**
   * Visits that are over without anybody saying so: a bird waits on a sill
   * for its answer `VISIT_HOURS`, then flies back out for somebody else.
   * Run before anything reads or calls birds, for every window at once (the
   * visits still going are few, and found by their index).
   */
  private async flyOn(db: Pick<pg.Pool, 'query'>): Promise<void> {
    await db.query(
      `UPDATE letter_visits SET ended_at = now(), outcome = 'flew_on'
        WHERE ended_at IS NULL AND called_at < now() - make_interval(hours => $1)`,
      [VISIT_HOURS],
    );
  }

  /**
   * Visits to or from this person that can no longer go on: the letter was
   * taken down or called home, or a block now stands between the two. Their
   * bird leaves the window, and the visit is closed.
   */
  private async settleVisits(db: Pick<pg.Pool, 'query'>, me: string): Promise<void> {
    await db.query(
      `UPDATE letter_visits v SET ended_at = now(), outcome = 'closed'
         FROM letters l
        WHERE v.ended_at IS NULL AND l.id = v.letter_id AND (v.visitor_id = $1 OR l.sender_id = $1)
          AND (l.status <> 'flying' OR NOT ${notBlockedSql('l.sender_id', 'v.visitor_id')})`,
      [me],
    );
  }

  /** Birds called today, counted against `BIRD_CALLS_PER_DAY`. */
  private async callsToday(db: Pick<pg.Pool, 'query'>, me: string): Promise<number> {
    const r = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM letter_visits WHERE visitor_id = $1 AND called_at > now() - interval '1 day'`, [me]);
    return r.rows[0]?.n ?? 0;
  }

  /** The bird visiting this person's window, with its letter and whose it is, or null. */
  private async visitorOf(db: Pick<pg.Pool, 'query'>, me: string): Promise<LetterVisitor | null> {
    const r = await db.query<LetterRow & { called_at: Date; name: string; bird: number | null }>(
      `SELECT l.id, l.sender_id, l.body, l.status, l.created_at, l.read_at, v.called_at, ${NAME_SQL('u')} AS name, ${BIRD_SQL('u')} AS bird
         FROM letter_visits v JOIN letters l ON l.id = v.letter_id JOIN users u ON u.id = l.sender_id
        WHERE v.visitor_id = $1 AND v.ended_at IS NULL AND l.status = 'flying'`,
      [me],
    );
    const row = r.rows[0];
    return row ? visitorItem(row, me) : null;
  }

  /** The letters page: your bird, whether it is out, a bird at your window, the birds out there, and your pen pals, the one most recently written to first. */
  async home(userId: string): Promise<LettersHome> {
    const me = await this.me(this.pool, userId);
    const chosen = await this.pool.query<{ bird: number }>(`SELECT bird FROM letter_birds WHERE user_id = $1`, [userId]);
    const band = me.birth_year !== null && me.birth_month !== null ? letterAgeBand({ year: me.birth_year, month: me.birth_month }) : null;
    const restricted = (await activeRestriction(this.pool, userId, 'chat')) !== null || (await this.deps.moderation?.isChatMuted(userId)) === true;
    await this.flyOn(this.pool);
    await this.settleVisits(this.pool, userId);
    await this.comeHome(this.pool, userId);
    const open = await this.openThreads(this.pool, userId);
    const out = await this.pool.query<{ created_at: Date; visiting: boolean }>(
      `SELECT l.created_at, EXISTS (SELECT 1 FROM letter_visits v WHERE v.letter_id = l.id AND v.ended_at IS NULL) AS visiting
         FROM letters l WHERE l.sender_id = $1 AND l.status = 'flying'`,
      [userId],
    );
    const pals = await this.pool.query<{ id: string; other: string; name: string; bird: number | null; last_letter_at: Date; your_turn: boolean; unread: number }>(
      `SELECT t.id, o.id AS other, ${NAME_SQL('o')} AS name, ${BIRD_SQL('o')} AS bird, t.last_letter_at,
              ${YOUR_TURN_SQL('t.id', '$1::uuid')} AS your_turn,
              (SELECT count(*)::int FROM letters l WHERE l.thread_id = t.id AND l.recipient_id = $1 AND l.status = 'delivered' AND l.read_at IS NULL) AS unread
         FROM letter_threads t
         JOIN users o ON o.id = CASE WHEN t.user_lo = $1 THEN t.user_hi ELSE t.user_lo END
        WHERE t.ended_at IS NULL AND (t.user_lo = $1 OR t.user_hi = $1) AND o.deleted_at IS NULL
        ORDER BY t.last_letter_at DESC`,
      [userId],
    );
    const penPals: PenPal[] = pals.rows.map((p) => ({
      threadId: p.id,
      person: personOf(p.other, p.name, p.bird),
      lastLetterAt: p.last_letter_at.toISOString(),
      yourTurn: p.your_turn,
      unread: p.unread,
    }));
    // the birds out there this person could call, the next to come first
    const sky = band
      ? await this.pool.query<{ sender_id: string; bird: number | null; total: number }>(
          `SELECT l.sender_id, ${BIRD_SQL('u')} AS bird, count(*) OVER ()::int AS total
             ${CALLABLE_SQL}
            ORDER BY l.created_at, l.id
            LIMIT ${SKY_BIRDS_SHOWN}`,
          [userId, band],
        )
      : null;
    // your bird home from a window with an answer you have not opened yet
    const home = await this.pool.query<{ thread_id: string; other: string; name: string; bird: number | null }>(
      `SELECT v.thread_id, o.id AS other, ${NAME_SQL('o')} AS name, ${BIRD_SQL('o')} AS bird
         FROM letter_visits v
         JOIN letters mine ON mine.id = v.letter_id AND mine.sender_id = $1
         JOIN letter_threads t ON t.id = v.thread_id AND t.ended_at IS NULL
         JOIN users o ON o.id = v.visitor_id AND o.deleted_at IS NULL
        WHERE v.outcome = 'answered'
          AND EXISTS (SELECT 1 FROM letters a WHERE a.thread_id = v.thread_id AND a.recipient_id = $1 AND a.status = 'delivered' AND a.read_at IS NULL)
        ORDER BY v.ended_at DESC
        LIMIT 1`,
      [userId],
    );
    const back = home.rows[0];
    return {
      refusal: !band ? 'birth_month' : restricted ? 'restricted' : null,
      bird: personOf(userId, me.name, chosen.rows[0]?.bird ?? null).bird,
      birdChosen: chosen.rows.length > 0,
      zer: (await this.deps.wallet?.balances(userId))?.zer ?? 0,
      out: out.rows[0] ? { since: out.rows[0].created_at.toISOString(), visiting: out.rows[0].visiting } : null,
      visitor: await this.visitorOf(this.pool, userId),
      birdsOut: sky?.rows[0]?.total ?? 0,
      sky: (sky?.rows ?? []).map((r) => personOf(r.sender_id, '', r.bird).bird),
      callsLeft: Math.max(0, BIRD_CALLS_PER_DAY - (await this.callsToday(this.pool, userId))),
      homecoming: back ? { threadId: back.thread_id, person: personOf(back.other, back.name, back.bird) } : null,
      penPals,
      roomForMore: open < PEN_PALS_MAX,
    };
  }

  /**
   * Choose your bird. The first choice is free; another after it costs
   * `LETTER_BIRD_PRICE` Zêr, paid in the same transaction that changes it, so
   * the bird and the payment go together or not at all. Each change is paid
   * under a key of its own (the how-manyth change it is), so a request sent
   * twice pays once: the second finds the bird already chosen. 404
   * LETTER_BIRD_NOT_FOUND for no such bird, 409 LETTER_BIRD_SAME for the bird
   * already yours, 402 INSUFFICIENT_FUNDS without the Zêr for a new one.
   */
  async chooseBird(userId: string, bird: number): Promise<LettersHome> {
    if (!isLetterBird(bird)) throw new AppError('LETTER_BIRD_NOT_FOUND', 404, 'no such bird');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.me(client, userId);
      const first = await client.query(`INSERT INTO letter_birds (user_id, bird) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`, [userId, bird]);
      if ((first.rowCount ?? 0) === 0) {
        const had = await client.query<{ bird: number; changes: number }>(`SELECT bird, changes FROM letter_birds WHERE user_id = $1 FOR UPDATE`, [userId]);
        const row = had.rows[0]!;
        if (row.bird === bird) throw new AppError('LETTER_BIRD_SAME', 409, 'this bird is already yours');
        // the app always pays through the wallet; without one a chosen bird stays as it is
        if (!this.deps.wallet) throw new AppError('LETTER_BIRD_CHOSEN', 409, 'a bird once chosen cannot be changed here');
        const change = row.changes + 1;
        await this.deps.wallet.debitWithin(client, {
          userId,
          currency: 'zer',
          amount: LETTER_BIRD_PRICE,
          reason: LETTER_BIRD_REASON,
          refId: String(bird),
          idempotencyKey: `letter-bird:${userId}:${change}`,
        });
        await client.query(`UPDATE letter_birds SET bird = $2, changes = $3, updated_at = now() WHERE user_id = $1`, [userId, bird, change]);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    return this.home(userId);
  }

  /**
   * Send your bird out with a letter to somebody new. It waits out there,
   * where anybody in your band can see it and call it, until somebody does or
   * it comes home after `BIRD_OUT_DAYS`. Refused while a bird of your own is
   * out, and while another's is at your window: that one is answered or sent
   * on first.
   */
  async sendOut(userId: string, raw: string): Promise<BirdOutResult> {
    const text = await this.cleaned(userId, raw);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // one writer, one send or call at a time: two quick presses cannot do it twice
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('letters:' || $1::text))`, [userId]);
      const me = await this.me(client, userId);
      const band = this.bandOf(me);
      await this.withinDay(client, userId);
      await this.flyOn(client);
      await this.settleVisits(client, userId);
      await this.comeHome(client, userId);
      const flying = await client.query(`SELECT 1 FROM letters WHERE sender_id = $1 AND status = 'flying'`, [userId]);
      if (flying.rowCount) throw new AppError('BIRD_OUT', 409, 'your bird is already out');
      if (await this.visitorOf(client, userId)) throw new AppError('VISITOR_HERE', 409, 'a bird is at your window: answer it or send it on first');
      if ((await this.openThreads(client, userId)) >= PEN_PALS_MAX) throw new AppError('PEN_PALS_FULL', 409, 'you have as many pen pals as there is room for');
      const out = await client.query<{ created_at: Date }>(`INSERT INTO letters (sender_id, body, age_band) VALUES ($1, $2, $3) RETURNING created_at`, [userId, text, band]);
      await client.query('COMMIT');
      return { kind: 'waiting', since: out.rows[0]!.created_at.toISOString() };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Call a bird to your window: the one out there that has waited longest,
   * from somebody in your band you have never written to and have no block
   * with, who has room for a pen pal, and that has not been to your window
   * before. It comes with its letter, and waits for its answer. Refused while
   * another bird is visiting, once the day's calls are made, or with no room
   * for another pen pal; 404 NO_BIRDS_OUT when no bird is out for you.
   */
  async call(userId: string): Promise<LetterVisitor> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('letters:' || $1::text))`, [userId]);
      const me = await this.me(client, userId);
      const band = this.bandOf(me);
      await this.flyOn(client);
      await this.settleVisits(client, userId);
      if (await this.visitorOf(client, userId)) throw new AppError('VISITOR_HERE', 409, 'a bird is at your window already');
      if ((await this.callsToday(client, userId)) >= BIRD_CALLS_PER_DAY) throw new AppError('CALLS_TODAY', 429, 'that is enough birds for today');
      if ((await this.openThreads(client, userId)) >= PEN_PALS_MAX) throw new AppError('PEN_PALS_FULL', 409, 'you have as many pen pals as there is room for');
      const found = await client.query<LetterRow & { name: string; bird: number | null }>(
        `SELECT l.id, l.sender_id, l.body, l.status, l.created_at, l.read_at, ${NAME_SQL('u')} AS name, ${BIRD_SQL('u')} AS bird
           ${CALLABLE_SQL}
          ORDER BY l.created_at, l.id
          LIMIT 1
          FOR UPDATE OF l SKIP LOCKED`,
        [userId, band],
      );
      const bird = found.rows[0];
      if (!bird) throw new AppError('NO_BIRDS_OUT', 404, 'no bird is out for you to call');
      const visit = await client.query<{ called_at: Date }>(`INSERT INTO letter_visits (letter_id, visitor_id) VALUES ($1, $2) RETURNING called_at`, [bird.id, userId]);
      await client.query('COMMIT');
      return visitorItem({ ...bird, called_at: visit.rows[0]!.called_at }, userId);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Answer the bird at your window: your letter goes home with it, theirs is
   * delivered to you, and the two of you are pen pals. Their bird is told it
   * came home with an answer. 404 NO_VISITOR when no bird is waiting (it has
   * flown on, or been called home); 409 BIRD_GONE when it can no longer take
   * an answer (their pen pals have filled up meanwhile), and then it flies on.
   */
  async answer(userId: string, raw: string): Promise<VisitorAnswer> {
    const text = await this.cleaned(userId, raw);
    const client = await this.pool.connect();
    let gone = false;
    let result: { answer: VisitorAnswer; other: string; writerName: string } | null = null;
    try {
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('letters:' || $1::text))`, [userId]);
      const me = await this.me(client, userId);
      const band = this.bandOf(me);
      await this.settleVisits(client, userId);
      const v = await client.query<{ id: string; letter_id: string; called_at: Date; sender_id: string; name: string; bird: number | null; their_band: string | null }>(
        `SELECT v.id, v.letter_id, v.called_at, l.sender_id, ${NAME_SQL('u')} AS name, ${BIRD_SQL('u')} AS bird, ${letterBandSql('u')} AS their_band
           FROM letter_visits v JOIN letters l ON l.id = v.letter_id JOIN users u ON u.id = l.sender_id
          WHERE v.visitor_id = $1 AND v.ended_at IS NULL AND l.status = 'flying'
            AND v.called_at > now() - make_interval(hours => $2)
            AND u.deleted_at IS NULL AND u.banned_at IS NULL
          FOR UPDATE OF v, l`,
        [userId, VISIT_HOURS],
      );
      const visit = v.rows[0];
      if (!visit) throw new AppError('NO_VISITOR', 404, 'no bird is waiting at your window');
      if (visit.their_band !== band) throw new AppError('LETTERS_BANDS', 403, 'letters only pass between people of the same age band');
      await this.withinDay(client, userId);
      if ((await this.openThreads(client, userId)) >= PEN_PALS_MAX) throw new AppError('PEN_PALS_FULL', 409, 'you have as many pen pals as there is room for');
      const { lo, hi } = canonicalPair(userId, visit.sender_id);
      const before = await client.query(`SELECT 1 FROM letter_threads WHERE user_lo = $1 AND user_hi = $2`, [lo, hi]);
      if (before.rowCount || (await this.openThreads(client, visit.sender_id)) >= PEN_PALS_MAX) {
        // it can take no answer: it flies on, and the writer is told why
        await client.query(`UPDATE letter_visits SET ended_at = now(), outcome = 'closed' WHERE id = $1`, [visit.id]);
        gone = true;
      } else {
        const thread = await client.query<{ id: string }>(`INSERT INTO letter_threads (user_lo, user_hi) VALUES ($1, $2) RETURNING id`, [lo, hi]);
        const threadId = thread.rows[0]!.id;
        // theirs came to this window when it was called, and was read there; the answer is delivered after it, so it is their turn next
        await client.query(
          `UPDATE letters SET recipient_id = $2, thread_id = $3, status = 'delivered', delivered_at = $4, read_at = now() WHERE id = $1`,
          [visit.letter_id, userId, threadId, visit.called_at],
        );
        const ins = await client.query<LetterRow>(
          `INSERT INTO letters (sender_id, recipient_id, thread_id, body, age_band, status, delivered_at)
           VALUES ($1, $2, $3, $4, $5, 'delivered', now())
           RETURNING id, sender_id, body, status, created_at, read_at`,
          [userId, visit.sender_id, threadId, text, band],
        );
        await client.query(`UPDATE letter_visits SET ended_at = now(), outcome = 'answered', thread_id = $2 WHERE id = $1`, [visit.id, threadId]);
        await client.query(`UPDATE letter_threads SET last_letter_at = now() WHERE id = $1`, [threadId]);
        result = {
          answer: { threadId, person: personOf(visit.sender_id, visit.name, visit.bird), letter: toItem(ins.rows[0]!, userId) },
          other: visit.sender_id,
          writerName: me.name,
        };
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    if (gone || !result) throw new AppError('BIRD_GONE', 409, 'this bird can no longer take an answer, and has flown on');
    await this.tell(result.other, result.answer.threadId, userId, result.writerName, 'home');
    return result.answer;
  }

  /** Send the bird at your window on its way: it flies back out for somebody else, and never comes to this window again. False when no bird was there. */
  async sendOn(userId: string): Promise<boolean> {
    const r = await this.pool.query(`UPDATE letter_visits SET ended_at = now(), outcome = 'sent_on' WHERE visitor_id = $1 AND ended_at IS NULL`, [userId]);
    return (r.rowCount ?? 0) > 0;
  }

  /** Call your bird back: the letter it carries is not sent, and if it is at somebody's window it leaves. False when no bird was out. */
  async recall(userId: string): Promise<boolean> {
    await this.pool.query(
      `UPDATE letter_visits v SET ended_at = now(), outcome = 'recalled'
         FROM letters l WHERE l.id = v.letter_id AND l.sender_id = $1 AND l.status = 'flying' AND v.ended_at IS NULL`,
      [userId],
    );
    const r = await this.pool.query(`UPDATE letters SET status = 'recalled' WHERE sender_id = $1 AND status = 'flying'`, [userId]);
    return (r.rowCount ?? 0) > 0;
  }

  /** A correspondence: who, and every letter, oldest first. Their letters are marked read. Not found for anybody outside it, or across a block. */
  async thread(userId: string, threadId: string): Promise<LetterThread> {
    const t = await this.threadRow(this.pool, userId, threadId);
    await this.pool.query(
      `UPDATE letters SET read_at = now() WHERE thread_id = $1 AND recipient_id = $2 AND status = 'delivered' AND read_at IS NULL`,
      [threadId, userId],
    );
    const rows = await this.pool.query<LetterRow>(
      `SELECT id, sender_id, body, status, created_at, read_at FROM letters
        WHERE thread_id = $1 AND status IN ('delivered','removed') ORDER BY created_at, id`,
      [threadId],
    );
    const letters = rows.rows.map((row) => toItem(row, userId));
    const closed = t.ended || !t.sameBand;
    return {
      threadId,
      person: personOf(t.other, t.name, t.bird),
      letters,
      yourTurn: !closed && (await this.yourTurn(this.pool, threadId, userId)),
      closed,
    };
  }

  private async threadRow(
    db: Pick<pg.Pool, 'query'>,
    userId: string,
    threadId: string,
    lock = false,
  ): Promise<{ other: string; name: string; bird: number | null; ended: boolean; sameBand: boolean }> {
    const r = await db.query<{ other: string; name: string; bird: number | null; ended: boolean; same_band: boolean; blocked: boolean }>(
      `SELECT o.id AS other, ${NAME_SQL('o')} AS name, ${BIRD_SQL('o')} AS bird, t.ended_at IS NOT NULL AS ended,
              (${letterBandSql('o')} IS NOT NULL AND ${letterBandSql('o')} = ${letterBandSql('me')}) AS same_band,
              NOT ${notBlockedSql('t.user_lo', 't.user_hi')} AS blocked
         FROM letter_threads t
         JOIN users o ON o.id = CASE WHEN t.user_lo = $2 THEN t.user_hi ELSE t.user_lo END
         JOIN users me ON me.id = $2
        WHERE t.id = $1 AND (t.user_lo = $2 OR t.user_hi = $2)${lock ? ' FOR UPDATE OF t' : ''}`,
      [threadId, userId],
    );
    const row = r.rows[0];
    // across a block a correspondence is not there at all, as everywhere else
    if (!row || row.blocked) throw new AppError('NOT_FOUND', 404, 'no such letters');
    return { other: row.other, name: row.name, bird: row.bird, ended: row.ended, sameBand: row.same_band };
  }

  private async yourTurn(db: Pick<pg.Pool, 'query'>, threadId: string, userId: string): Promise<boolean> {
    const r = await db.query<{ yours: boolean }>(`SELECT ${YOUR_TURN_SQL('$1::uuid', '$2::uuid')} AS yours`, [threadId, userId]);
    return r.rows[0]?.yours === true;
  }

  /** Write back to a pen pal: refused when it is not your turn, after a goodbye, or once your bands have parted. */
  async reply(userId: string, threadId: string, raw: string): Promise<LetterItem> {
    const text = await this.cleaned(userId, raw);
    const client = await this.pool.connect();
    let sent: LetterItem;
    let other: string;
    let writerName: string;
    try {
      await client.query('BEGIN');
      const t = await this.threadRow(client, userId, threadId, true);
      if (t.ended) throw new AppError('LETTERS_ENDED', 409, 'this correspondence has ended');
      if (!t.sameBand) throw new AppError('LETTERS_BANDS', 403, 'letters only pass between people of the same age band');
      const me = await this.me(client, userId);
      const band = this.bandOf(me);
      if (!(await this.yourTurn(client, threadId, userId))) throw new AppError('NOT_YOUR_TURN', 409, 'wait for their letter before you write again');
      await this.withinDay(client, userId);
      const ins = await client.query<LetterRow>(
        `INSERT INTO letters (sender_id, recipient_id, thread_id, body, age_band, status, delivered_at)
         VALUES ($1, $2, $3, $4, $5, 'delivered', now())
         RETURNING id, sender_id, body, status, created_at, read_at`,
        [userId, t.other, threadId, text, band],
      );
      await client.query(`UPDATE letter_threads SET last_letter_at = now() WHERE id = $1`, [threadId]);
      await client.query('COMMIT');
      sent = toItem(ins.rows[0]!, userId);
      other = t.other;
      writerName = me.name;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    await this.tell(other, threadId, userId, writerName);
    return sent;
  }

  /** Say goodbye: the correspondence ends for both, and neither can write in it again. Not found for anybody outside it. */
  async end(userId: string, threadId: string): Promise<void> {
    await this.threadRow(this.pool, userId, threadId);
    await this.pool.query(`UPDATE letter_threads SET ended_at = now(), ended_by = $2 WHERE id = $1 AND ended_at IS NULL`, [threadId, userId]);
  }

  /**
   * Tell somebody a letter has come: a pen pal's bird at their window, or
   * (`home`) their own bird home from somebody's window with an answer. A line
   * in their notifications and a push; English for the list, the apps write
   * their own words from `data.kind`. A block between the two keeps the line
   * from being written at all (notifications/inbox-service.ts).
   */
  private async tell(to: string, threadId: string, from: string, fromName: string, how: 'window' | 'home' = 'window'): Promise<void> {
    const notification: Notification = {
      category: 'friends',
      title: how === 'home' ? 'Your bird came home' : 'A bird came to your window',
      body: how === 'home' ? `${fromName} answered your letter.` : `${fromName} wrote you a letter.`,
      data: { kind: 'letter', threadId, fromUserId: from },
    };
    try {
      await this.deps.inbox?.record(to, notification);
      await this.deps.push?.(to, notification);
    } catch (err) {
      this.deps.log?.warn({ err }, 'letter notification not sent');
    }
  }
}
