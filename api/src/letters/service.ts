import type pg from 'pg';
import {
  BIRD_OUT_DAYS,
  LETTERS_PER_DAY,
  PEN_PALS_MAX,
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
  type LettersHome,
  type PenPal,
} from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { notBlockedSql } from '../friends/blocked.js';
import { canonicalPair } from '../friends/pair.js';
import type { Notification } from '../push/service.js';
import { activeRestriction } from '../moderation/sanctions-service.js';

/**
 * Letters by bird (shared/src/letters.ts says what they are): sending a bird
 * out to somebody new, the meeting of two birds, pen pals writing in turn,
 * saying goodbye, and the page that shows it all.
 *
 * Safety is the shape of the thing rather than a layer over it:
 *   - nobody chooses whom they write to; two people meet only when both send a
 *     bird out, in the same age band, and never two who have written before
 *     or have a block between them;
 *   - the band is checked against both birth months at the meeting and at
 *     every letter after it, so a pair whose bands part can write no more;
 *   - a letter is one at a time: you write, and wait for theirs. Nobody can be
 *     sent a stream of letters, and saying goodbye ends it for both;
 *   - a letter holds no link, email address, phone number or handle
 *     (`letterProblem`), and the words the rest of the app filters are masked;
 *   - a person muted from chat by moderation cannot write letters either, and
 *     a letter can be reported like a message, with the letters around it kept.
 */

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

const personOf = (id: string, name: string): LetterPerson => ({ id, name, bird: letterBirdOf(id) });

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

  /** A bird out longer than it waits comes home with its letter. */
  private async comeHome(db: Pick<pg.Pool, 'query'>, me: string): Promise<void> {
    await db.query(
      `UPDATE letters SET status = 'recalled'
        WHERE sender_id = $1 AND status = 'flying' AND created_at < now() - make_interval(days => $2)`,
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

  /** The letters page: your bird, whether it is out, and your pen pals, the one most recently written to first. */
  async home(userId: string): Promise<LettersHome> {
    const me = await this.me(this.pool, userId);
    const bird = letterBirdOf(userId);
    const known = me.birth_year !== null && me.birth_month !== null;
    const restricted = (await activeRestriction(this.pool, userId, 'chat')) !== null || (await this.deps.moderation?.isChatMuted(userId)) === true;
    await this.comeHome(this.pool, userId);
    const open = await this.openThreads(this.pool, userId);
    const out = await this.pool.query<{ created_at: Date }>(`SELECT created_at FROM letters WHERE sender_id = $1 AND status = 'flying'`, [userId]);
    const pals = await this.pool.query<{ id: string; other: string; name: string; last_letter_at: Date; your_turn: boolean; unread: number }>(
      `SELECT t.id, o.id AS other, ${NAME_SQL('o')} AS name, t.last_letter_at,
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
      person: personOf(p.other, p.name),
      lastLetterAt: p.last_letter_at.toISOString(),
      yourTurn: p.your_turn,
      unread: p.unread,
    }));
    return {
      refusal: !known ? 'birth_month' : restricted ? 'restricted' : null,
      bird,
      out: out.rows[0] ? { since: out.rows[0].created_at.toISOString() } : null,
      penPals,
      roomForMore: open < PEN_PALS_MAX,
    };
  }

  /**
   * Send a bird out with a letter to somebody new. If another bird is out in
   * the same band — from somebody this writer has never written to, with no
   * block between them, who has room for another pen pal — the two meet: each
   * letter is delivered to the other, the correspondence opens, and the other
   * bird's letter comes back to be read now. Otherwise this bird waits out
   * there for the next one.
   */
  async sendOut(userId: string, raw: string): Promise<BirdOutResult> {
    const text = await this.cleaned(userId, raw);
    const client = await this.pool.connect();
    let met: { otherId: string; name: string; threadId: string; letter: LetterItem; writerName: string } | null = null;
    let since: Date | null = null;
    try {
      await client.query('BEGIN');
      // one writer, one send at a time: two quick presses cannot meet two birds
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('letters:' || $1::text))`, [userId]);
      const me = await this.me(client, userId);
      const band = this.bandOf(me);
      await this.withinDay(client, userId);
      await this.comeHome(client, userId);
      const flying = await client.query(`SELECT 1 FROM letters WHERE sender_id = $1 AND status = 'flying'`, [userId]);
      if (flying.rowCount) throw new AppError('BIRD_OUT', 409, 'your bird is already out');
      if ((await this.openThreads(client, userId)) >= PEN_PALS_MAX) throw new AppError('PEN_PALS_FULL', 409, 'you have as many pen pals as there is room for');

      const waiting = await client.query<{ id: string; sender_id: string; body: string; created_at: Date; name: string }>(
        `SELECT l.id, l.sender_id, l.body, l.created_at, ${NAME_SQL('u')} AS name
           FROM letters l JOIN users u ON u.id = l.sender_id
          WHERE l.status = 'flying' AND l.age_band = $2 AND l.sender_id <> $1
            AND l.created_at > now() - make_interval(days => $3)
            AND u.deleted_at IS NULL AND u.banned_at IS NULL AND NOT u.guest
            AND ${letterBandSql('u')} = $2
            AND ${notBlockedSql('l.sender_id', '$1::uuid')}
            AND NOT EXISTS (SELECT 1 FROM letter_threads t
                             WHERE t.user_lo = least(l.sender_id, $1::uuid) AND t.user_hi = greatest(l.sender_id, $1::uuid))
            AND (SELECT count(*) FROM letter_threads t
                  WHERE t.ended_at IS NULL AND (t.user_lo = l.sender_id OR t.user_hi = l.sender_id)) < $4
          ORDER BY l.created_at, l.id
          LIMIT 1
          FOR UPDATE OF l SKIP LOCKED`,
        [userId, band, BIRD_OUT_DAYS, PEN_PALS_MAX],
      );
      const theirs = waiting.rows[0];
      if (theirs) {
        const { lo, hi } = canonicalPair(userId, theirs.sender_id);
        const thread = await client.query<{ id: string }>(`INSERT INTO letter_threads (user_lo, user_hi) VALUES ($1, $2) RETURNING id`, [lo, hi]);
        const threadId = thread.rows[0]!.id;
        // their bird has come to this window: their letter is read as it arrives
        const delivered = await client.query<LetterRow>(
          `UPDATE letters SET recipient_id = $2, thread_id = $3, status = 'delivered', delivered_at = now(), read_at = now()
            WHERE id = $1 RETURNING id, sender_id, body, status, created_at, read_at`,
          [theirs.id, userId, threadId],
        );
        await client.query(
          `INSERT INTO letters (sender_id, recipient_id, thread_id, body, age_band, status, delivered_at)
           VALUES ($1, $2, $3, $4, $5, 'delivered', now())`,
          [userId, theirs.sender_id, threadId, text, band],
        );
        met = { otherId: theirs.sender_id, name: theirs.name, threadId, letter: toItem(delivered.rows[0]!, userId), writerName: me.name };
      } else {
        const out = await client.query<{ created_at: Date }>(
          `INSERT INTO letters (sender_id, body, age_band) VALUES ($1, $2, $3) RETURNING created_at`,
          [userId, text, band],
        );
        since = out.rows[0]!.created_at;
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    if (met) {
      await this.tell(met.otherId, met.threadId, userId, met.writerName);
      return { kind: 'met', threadId: met.threadId, person: personOf(met.otherId, met.name), letter: met.letter };
    }
    return { kind: 'waiting', since: since!.toISOString() };
  }

  /** Call your bird back: the letter it carries is not sent. False when no bird was out. */
  async recall(userId: string): Promise<boolean> {
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
      person: personOf(t.other, t.name),
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
  ): Promise<{ other: string; name: string; ended: boolean; sameBand: boolean }> {
    const r = await db.query<{ other: string; name: string; ended: boolean; same_band: boolean; blocked: boolean }>(
      `SELECT o.id AS other, ${NAME_SQL('o')} AS name, t.ended_at IS NOT NULL AS ended,
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
    return { other: row.other, name: row.name, ended: row.ended, sameBand: row.same_band };
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
   * Tell somebody a bird has come to their window: a line in their
   * notifications and a push. English for the list; the apps write their own
   * words from `data.kind`. A block between the two keeps the line from being
   * written at all (notifications/inbox-service.ts).
   */
  private async tell(to: string, threadId: string, from: string, fromName: string): Promise<void> {
    const notification: Notification = {
      category: 'friends',
      title: 'A bird came to your window',
      body: `${fromName} wrote you a letter.`,
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
