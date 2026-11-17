import type pg from 'pg';
import {
  BIRD_CALLS_PER_DAY,
  BIRD_OUT_DAYS,
  LANDINGS_MAX,
  LETTERS_CHANGED,
  LETTERS_PER_DAY,
  LETTER_BIRD_PRICE,
  PEN_PALS_MAX,
  SKY_BIRDS_SHOWN,
  VISIT_HOURS,
  DEFAULT_PAPER,
  checkLetterDecor,
  decorErrorCode,
  isLetterBird,
  isPlainDecor,
  letterAgeBand,
  letterBirdOf,
  letterProblem,
  letterText,
  stripControlChars,
  type BirdOutResult,
  type LetterAgeBand,
  type LetterDecor,
  type LetterFlight,
  type LetterItem,
  type LetterLanding,
  type LetterPaper,
  type LetterPerson,
  type LetterReturnReason,
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
import { activeRestriction, IN_FORCE_SQL } from '../moderation/sanctions-service.js';
import { inTransaction } from '../moderation/tx.js';
import type { WalletService } from '../wallet/service.js';
import { letterNoticeText, type LetterNoticeHow } from './notice.js';

/**
 * Letters by bird (shared/src/letters.ts says what they are): sending a bird
 * out to somebody new, the meeting of two birds, pen pals writing in turn,
 * saying goodbye, and the page that shows it all.
 *
 * A bird sent out waits over the country, with its letter, until somebody
 * calls it to their window (`call`). It waits there while its letter is read;
 * answered (`answer`), it carries the answer home and the two are pen pals;
 * sent on (`sendOn`), or left unanswered a day, it flies back out for
 * somebody else, and never comes to that window again. After that each
 * letter is carried by its writer's own bird, which waits at the other's
 * window until the letter is read.
 *
 * Every letter lands at the window once (`home().landings`): your own bird
 * home with an answer, or a pen pal's with their next letter, flies in the
 * first time the window is open after it came, however you heard of it, and
 * waits on the sill until the letter is read. Landing and reading are kept
 * apart (`landed_at`, `read_at`), because a notification, the widget and the
 * pen pal list all open the correspondence straight away, and a bird keyed
 * on reading was used up before the window ever showed it. The window says
 * it showed one with `landed`. Every change is told to the open windows of
 * both people as a ping that carries nothing (`LETTERS_CHANGED`), and they
 * read the page again.
 *
 * Nothing two people do at the same moment loses a letter. A call claims its
 * bird in one step, so two windows never get the same bird. An answer takes
 * both people's locks, so two birds answered at each other's windows at once
 * take turns, and the second answer goes into the correspondence the first
 * opened. Calling a bird home waits for a call in flight. A letter sent again
 * after its reply was lost on the way comes back as the letter already sent
 * (its `Idempotency-Key`, or the same words within a few minutes).
 *
 * A bird whose writer cannot be written back to now (muted, suspended,
 * closed, or in another age band since it flew) is not called, and leaves
 * any window it is at; one at the window of somebody who cannot answer it
 * leaves too. A bird comes home by itself after `BIRD_OUT_DAYS`, when its
 * writer moves into another band, or when their pen pal places fill up
 * meanwhile, and says so at the window once (`returned`). A bird of yours at
 * somebody's window holds one of your pen pal places, so the answer it
 * carries home always has room.
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
 *     the notes stuck on its paper are held to the same rules, and the first
 *     letter to a stranger carries no drawing (shared/src/letter-paper.ts);
 *   - a person muted from chat by moderation cannot write letters either, and
 *     a letter can be reported like a message, with the letters around it kept.
 *
 * Each member chooses their bird once, for free; another after that is paid
 * for in Zêr (`chooseBird`). Until they choose, their bird comes from their id.
 */

/** The ledger's name for paying for a new bird. */
export const LETTER_BIRD_REASON = 'letter_bird';

/**
 * How long a letter sent again with the same words counts as the one already
 * sent: long enough for a lost reply, short enough not to swallow a real second letter.
 */
const AGAIN_MINUTES = 10;

/** What the service needs from the rest of the app: the word filter and the mute, a way to tell somebody a letter has come, and the open windows. */
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
  /** tells a person's open windows and correspondences that something changed (`LETTERS_CHANGED`) */
  realtime?: { notifyUser(userId: string, event: { type: string }): Promise<void> };
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

/**
 * SQL: the account behind `alias` is not banned now. A suspension that has
 * run out leaves `banned_at` set until a sanction changes again, so the end
 * it was given is what counts, as at sign-in (plugins/auth.ts).
 */
export const NOT_BANNED_SQL = (alias: string): string => `(${alias}.banned_at IS NULL OR (${alias}.banned_until IS NOT NULL AND ${alias}.banned_until <= now()))`;

/**
 * SQL: the person behind `alias` is muted from writing to people now: by the
 * column moderation keeps, by a chat mute in force, or by the word filter's
 * own escalation (moderation/service.ts). Never NULL.
 */
export const CHAT_MUTED_SQL = (alias: string): string => `(COALESCE(${alias}.muted_until > now(), false)
    OR EXISTS (SELECT 1 FROM sanctions s WHERE s.user_id = ${alias}.id AND s.kind = 'chat_mute' AND ${IN_FORCE_SQL})
    OR EXISTS (SELECT 1 FROM chat_offenses co WHERE co.user_id = ${alias}.id AND (co.perm_muted OR co.muted_until > now())))`;

/**
 * SQL: the person behind `alias` can write a letter now, and be written back
 * to: an open account that is not being closed (signing in again within the
 * grace period stops that, and opens their letters again), not banned, not a
 * guest, not muted.
 */
const CAN_WRITE_SQL = (alias: string): string =>
  `(${alias}.deleted_at IS NULL AND ${alias}.deletion_requested_at IS NULL AND ${NOT_BANNED_SQL(alias)} AND NOT ${alias}.guest AND NOT ${CHAT_MUTED_SQL(alias)})`;

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
  decor: LetterDecor | null;
  status: string;
  created_at: Date;
  read_at: Date | null;
}

/** The columns a `LetterRow` is read from, for a letter `l` (or the table itself when `alias` is empty). */
const LETTER_COLUMNS = (alias = ''): string => ['id', 'sender_id', 'body', 'decor', 'status', 'created_at', 'read_at'].map((c) => (alias ? `${alias}.${c}` : c)).join(', ');

const toItem = (row: LetterRow, me: string): LetterItem => ({
  id: row.id,
  mine: row.sender_id === me,
  // a letter moderation took down says so in its place, in the app's own words, its drawing and notes gone with its words
  body: row.status === 'removed' ? '' : row.body,
  decor: row.status === 'removed' ? null : row.decor,
  removed: row.status === 'removed',
  sentAt: row.created_at.toISOString(),
  readAt: row.read_at ? row.read_at.toISOString() : null,
});

/** A letter as it will be sent: its words, and its paper, drawing and notes (null for the default paper with nothing on it). */
interface Written {
  text: string;
  decor: LetterDecor | null;
  /** the paper chosen, to open the composer on next time; null when the app sent none */
  paper: LetterPaper | null;
}

/**
 * The key a letter is kept under, so the same request sent again finds it:
 * the app's own key, behind what kind of letter it was, so a key can never
 * bring back a letter of another kind. None when the app sent none.
 */
const keyed = (kind: 'out' | 'answer' | 'reply', key?: string | null): string | null => (key ? `${kind}:${key}` : null);

/** Somebody as the letters show them: the bird they chose, or the one their id gives them until they choose. */
export const personOf = (id: string, name: string, bird: number | null): LetterPerson => ({ id, name, bird: isLetterBird(bird) ? bird : letterBirdOf(id) });

/** SQL: the bird the user behind `alias` chose, or NULL before they choose one. `alias` is a literal from this file. */
export const BIRD_SQL = (alias: string): string => `(SELECT lb.bird FROM letter_birds lb WHERE lb.user_id = ${alias}.id)`;

/**
 * SQL: the birds out there that the person `$1`, in the band `$2`, could call
 * — out less than `BIRD_OUT_DAYS`, from somebody in the band now as when it
 * was sent, who can be written back to (an open account, not suspended, not
 * muted), no block either way, never a correspondence between the two, room
 * for another pen pal, at nobody's window now and never at this one before.
 * `l` is the letter and `u` its writer.
 */
const CALLABLE_SQL = `FROM letters l JOIN users u ON u.id = l.sender_id
   WHERE l.status = 'flying' AND l.age_band = $2 AND l.sender_id <> $1::uuid
     AND l.created_at > now() - make_interval(days => ${BIRD_OUT_DAYS})
     AND ${CAN_WRITE_SQL('u')}
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
 * it goes a letter each in turn. `thread` and `me` are SQL literals, never input.
 */
export const YOUR_TURN_SQL = (thread: string, me: string): string => `(
  EXISTS (SELECT 1 FROM letters written WHERE written.thread_id = ${thread} AND written.sender_id <> ${me} AND written.status IN ('delivered','removed'))
  AND NOT EXISTS (
    SELECT 1 FROM letters mine WHERE mine.thread_id = ${thread} AND mine.sender_id = ${me} AND mine.status IN ('delivered','removed')
       AND mine.delivered_at > (SELECT max(theirs.delivered_at) FROM letters theirs WHERE theirs.thread_id = ${thread} AND theirs.sender_id <> ${me} AND theirs.status IN ('delivered','removed'))))`;

/** The name a pen pal is shown by: their display name, or their username. */
export const NAME_SQL = (alias: string): string => `COALESCE(NULLIF(btrim(${alias}.display_name), ''), ${alias}.username)`;

/** A refusal decided inside a transaction whose changes still have to stand, such as a visit closed because it cannot go on: thrown after COMMIT. */
type Refusal = AppError | null;

export class LetterService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly deps: LetterDeps = {},
  ) {}

  /** Who is writing: their birth month and name. A deleted, banned or guest account writes nothing; a suspension that has run out writes again. */
  private async me(db: Pick<pg.Pool, 'query'>, userId: string): Promise<MeRow> {
    const r = await db.query<MeRow>(
      `SELECT u.id, u.birth_year, u.birth_month, ${NAME_SQL('u')} AS name
         FROM users u WHERE u.id = $1 AND u.deleted_at IS NULL AND ${NOT_BANNED_SQL('u')} AND NOT u.guest`,
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
   * The letters locks of these people, always taken in the same order, so two
   * transactions that each need two of them wait for each other instead of
   * deadlocking. One person's own sends and calls take only their own.
   */
  private async lockLetters(db: Pick<pg.Pool, 'query'>, people: string[]): Promise<void> {
    for (const id of [...new Set(people)].sort()) {
      await db.query(`SELECT pg_advisory_xact_lock(hashtext('letters:' || $1::text))`, [id]);
    }
  }

  /**
   * Tells the open windows of these people that something changed, after the
   * change is committed. The ping carries nothing, so it needs no block check:
   * what the window reads next shows nothing across a block. A ping that does
   * not go only means the window catches up the next time it is opened.
   */
  private ping(...people: Array<string | null | undefined>): void {
    const realtime = this.deps.realtime;
    if (!realtime) return;
    for (const id of new Set(people.filter((p): p is string => !!p))) {
      void realtime.notifyUser(id, { type: LETTERS_CHANGED }).catch((err: unknown) => this.deps.log?.warn({ err }, 'letters ping not sent'));
    }
  }

  /**
   * A letter as it will be sent: control characters out, Kurdish letters in
   * their one spelling, refused for a link or a way to be reached, and with
   * the filtered words masked. Its decor is checked as the apps check it
   * (`checkLetterDecor`; `strokes: false` for a first letter to a stranger,
   * which carries no drawing), its notes held to the same rules as the words
   * and masked by the same filter, and the words and notes read together, so
   * a number cut between them is still found. A muted writer is refused here too.
   */
  private async cleaned(me: string, raw: string, rawDecor: unknown, opts: { strokes: boolean }): Promise<Written> {
    const text = letterText(stripControlChars(raw));
    const problem = letterProblem(text);
    if (problem) throw new AppError(`LETTER_${problem.toUpperCase()}`, 422, `the letter cannot be sent: ${problem}`);
    let decor: LetterDecor | null = null;
    if (rawDecor !== undefined && rawDecor !== null) {
      const checked = checkLetterDecor(rawDecor, opts);
      if (!checked.ok) throw new AppError(decorErrorCode(checked.problem), 422, `the letter's paper cannot be sent: ${checked.problem}`);
      decor = checked.value;
      const together = letterProblem(`${text} ${decor.notes.map((n) => n.text).join(' ')}`);
      if (together === 'contact' || together === 'link') throw new AppError(`LETTER_${together.toUpperCase()}`, 422, `the letter cannot be sent: ${together}`);
    }
    const paper = decor ? decor.paper : null;
    const moderation = this.deps.moderation;
    if (moderation) {
      if (await moderation.isChatMuted(me)) throw new AppError('CHAT_MUTED', 403, 'you are muted from writing to people');
      const filtered = moderation.filter(text);
      let flagged = filtered.flagged;
      const notes = (decor?.notes ?? []).map((n) => {
        const f = moderation.filter(n.text);
        flagged ||= f.flagged;
        return { ...n, text: f.masked };
      });
      if (flagged) void moderation.recordOffense(me).catch(() => undefined);
      if (decor) decor = { ...decor, notes };
      return { text: filtered.masked, decor: decor && !isPlainDecor(decor) ? decor : null, paper };
    }
    return { text, decor: decor && !isPlainDecor(decor) ? decor : null, paper };
  }

  /** Remembers the paper somebody wrote on, so the composer opens on it next time. */
  private async rememberPaper(db: Pick<pg.Pool, 'query'>, me: string, paper: LetterPaper | null): Promise<void> {
    if (!paper) return;
    await db.query(
      `INSERT INTO letter_prefs (user_id, paper) VALUES ($1, $2::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET paper = EXCLUDED.paper, updated_at = now()`,
      [me, JSON.stringify({ style: paper.style, tone: paper.tone, ink: paper.ink })],
    );
  }

  /** The paper somebody last wrote on, or the default. */
  private async paperOf(me: string): Promise<LetterPaper> {
    const r = await this.pool.query<{ paper: LetterPaper }>(`SELECT paper FROM letter_prefs WHERE user_id = $1`, [me]);
    const p = r.rows[0]?.paper;
    const known = p && checkLetterDecor({ paper: p }, { strokes: false }).ok;
    return known ? { style: p.style, tone: p.tone, ink: p.ink } : DEFAULT_PAPER;
  }

  /**
   * Letters sent in the last day, refused past the day's number. A bird called
   * home took its letter back, so it was not sent and does not count. A bird
   * at this person's window holds the place of its answer, which the call made
   * sure there was room for: other letters cannot use it up and leave the bird
   * waiting on the sill for an answer that could not go. The answer itself
   * (`answering`) takes the place it held.
   */
  private async withinDay(db: Pick<pg.Pool, 'query'>, me: string, opts: { answering?: boolean } = {}): Promise<void> {
    const r = await db.query<{ n: number }>(
      `SELECT (SELECT count(*) FROM letters WHERE sender_id = $1 AND created_at > now() - interval '1 day' AND status <> 'recalled')::int
            + (CASE WHEN $2::boolean THEN 0 ELSE (SELECT count(*) FROM letter_visits
                 WHERE visitor_id = $1 AND ended_at IS NULL AND called_at > now() - make_interval(hours => $3)) END)::int AS n`,
      [me, opts.answering === true, VISIT_HOURS],
    );
    if ((r.rows[0]?.n ?? 0) >= LETTERS_PER_DAY) throw new AppError('LETTERS_TODAY', 429, 'that is enough letters for today');
  }

  /**
   * A bird of this person's that nobody can call any more comes home with its
   * letter: out longer than `BIRD_OUT_DAYS`, its writer in another age band
   * since it flew, or their pen pal places full meanwhile. One at somebody's
   * window stays until that visit is over. It says why (`recalled_why`), and
   * waits, not yet landed, for the window to show it home. Run inside a
   * transaction: its bird row is locked first, which waits for a call in
   * flight to commit, so the visit that call makes is seen and the bird stays.
   */
  private async comeHome(db: Pick<pg.Pool, 'query'>, me: string): Promise<void> {
    const flying = await db.query<{ id: string }>(`SELECT id FROM letters WHERE sender_id = $1 AND status = 'flying' FOR UPDATE`, [me]);
    const bird = flying.rows[0];
    if (!bird) return;
    await db.query(
      `UPDATE letters l SET status = 'recalled', recalled_at = now(),
              recalled_why = CASE WHEN l.created_at < now() - make_interval(days => $2) THEN 'unanswered'
                                  WHEN l.age_band IS DISTINCT FROM ${letterBandSql('u')} THEN 'band'
                                  ELSE 'full' END
         FROM users u
        WHERE l.id = $1 AND u.id = l.sender_id AND l.status = 'flying'
          AND (l.created_at < now() - make_interval(days => $2)
               OR l.age_band IS DISTINCT FROM ${letterBandSql('u')}
               OR (SELECT count(*) FROM letter_threads t WHERE t.ended_at IS NULL AND (t.user_lo = l.sender_id OR t.user_hi = l.sender_id)) >= ${PEN_PALS_MAX})
          AND NOT EXISTS (SELECT 1 FROM letter_visits v WHERE v.letter_id = l.id AND v.ended_at IS NULL)`,
      [bird.id, BIRD_OUT_DAYS],
    );
  }

  /** Ends the correspondences of this person that a block now stands across. */
  private async endBlocked(db: Pick<pg.Pool, 'query'>, me: string): Promise<void> {
    await db.query(
      `UPDATE letter_threads t SET ended_at = now()
        WHERE t.ended_at IS NULL AND (t.user_lo = $1 OR t.user_hi = $1)
          AND NOT ${notBlockedSql('t.user_lo', 't.user_hi')}`,
      [me],
    );
  }

  /** How many correspondences somebody has open. */
  private async countOpen(db: Pick<pg.Pool, 'query'>, me: string): Promise<number> {
    const r = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM letter_threads WHERE ended_at IS NULL AND (user_lo = $1 OR user_hi = $1)`, [me]);
    return r.rows[0]?.n ?? 0;
  }

  /** Correspondences somebody has open, closing any a block now stands across. */
  private async openThreads(db: Pick<pg.Pool, 'query'>, me: string): Promise<number> {
    await this.endBlocked(db, me);
    return this.countOpen(db, me);
  }

  /**
   * Pen pal places somebody has taken: their open correspondences, and one
   * more while their own bird is at somebody's window, since its answer will
   * open a correspondence when it comes. Not for the window of `with`, whose
   * correspondence that answer would be.
   */
  private async placesTaken(db: Pick<pg.Pool, 'query'>, me: string, withWhom?: string): Promise<number> {
    const visiting = await db.query(
      `SELECT 1 FROM letters l JOIN letter_visits v ON v.letter_id = l.id AND v.ended_at IS NULL
        WHERE l.sender_id = $1 AND l.status = 'flying' AND v.visitor_id IS DISTINCT FROM $2::uuid`,
      [me, withWhom ?? null],
    );
    return (await this.openThreads(db, me)) + (visiting.rowCount ? 1 : 0);
  }

  /**
   * Visits that are over without anybody saying so, at every window at once
   * (the visits still going are few, and found by their index): a bird waits
   * on a sill for its answer `VISIT_HOURS`, then flies back out for somebody
   * else; and a visit neither side can go on with any more closes now, so the
   * bird is back out for somebody else, or comes home, instead of sitting on
   * a sill for the rest of the day — its writer, or the person whose window
   * it is at, closed their account, was suspended or muted, or moved into
   * another age band than the letter's.
   */
  private async flyOn(db: Pick<pg.Pool, 'query'>): Promise<void> {
    await db.query(
      `UPDATE letter_visits SET ended_at = now(), outcome = 'flew_on'
        WHERE ended_at IS NULL AND called_at < now() - make_interval(hours => $1)`,
      [VISIT_HOURS],
    );
    await db.query(
      `UPDATE letter_visits v SET ended_at = now(), outcome = 'closed'
         FROM letters l, users w, users r
        WHERE v.ended_at IS NULL AND l.id = v.letter_id AND w.id = l.sender_id AND r.id = v.visitor_id
          AND NOT (${CAN_WRITE_SQL('w')} AND ${CAN_WRITE_SQL('r')}
                   AND ${letterBandSql('w')} IS NOT DISTINCT FROM l.age_band AND ${letterBandSql('r')} IS NOT DISTINCT FROM l.age_band)`,
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

  /**
   * Birds called today, counted against `BIRD_CALLS_PER_DAY`. A bird its
   * writer called home within a minute of its coming is not counted: the
   * caller hardly saw it, and could do nothing about it.
   */
  private async callsToday(db: Pick<pg.Pool, 'query'>, me: string): Promise<number> {
    const r = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM letter_visits
        WHERE visitor_id = $1 AND called_at > now() - interval '1 day'
          AND NOT COALESCE(outcome = 'recalled' AND ended_at < called_at + interval '1 minute', false)`,
      [me],
    );
    return r.rows[0]?.n ?? 0;
  }

  /** The bird visiting this person's window, with its letter and whose it is, or null. */
  private async visitorOf(db: Pick<pg.Pool, 'query'>, me: string): Promise<LetterVisitor | null> {
    const r = await db.query<LetterRow & { called_at: Date; name: string; bird: number | null }>(
      `SELECT ${LETTER_COLUMNS('l')}, v.called_at, ${NAME_SQL('u')} AS name, ${BIRD_SQL('u')} AS bird
         FROM letter_visits v JOIN letters l ON l.id = v.letter_id JOIN users u ON u.id = l.sender_id
        WHERE v.visitor_id = $1 AND v.ended_at IS NULL AND l.status = 'flying'`,
      [me],
    );
    const row = r.rows[0];
    return row ? visitorItem(row, me) : null;
  }

  /** Runs `fn` on one snapshot of the database, read only, so everything it reads agrees with everything else it reads. */
  private async snapshot<T>(fn: (db: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
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
   * The letters page: your bird and where it is, a bird at your window, the
   * birds out there, every letter still to land at your window, and your pen
   * pals, the one most recently written to first.
   *
   * What time and other people changed is settled first; then everything is
   * read in one snapshot, so the bird out, the bird at the window and the
   * letters to land always agree (a homecoming never comes with its bird
   * still out).
   *
   * `legacyWindow` is for app builds from before `landings`, which act out
   * only `homecoming` or `arrival`, on their first look: the one letter such
   * a build shows is counted as landed here, the way it would have posted it.
   * Without that, every letter they read in the correspondence first would
   * land again on each visit. Remove it once no build that old is supported.
   */
  async home(userId: string, opts: { legacyWindow?: boolean } = {}): Promise<LettersHome> {
    const me = await this.me(this.pool, userId);
    const band = me.birth_year !== null && me.birth_month !== null ? letterAgeBand({ year: me.birth_year, month: me.birth_month }) : null;
    const restricted = (await activeRestriction(this.pool, userId, 'chat')) !== null || (await this.deps.moderation?.isChatMuted(userId)) === true;
    await this.flyOn(this.pool);
    await this.settleVisits(this.pool, userId);
    await this.endBlocked(this.pool, userId);
    await inTransaction(this.pool, (c) => this.comeHome(c, userId));
    const seen = await this.snapshot(async (db) => {
      const clock = await db.query<{ now: Date }>(`SELECT now() AS now`);
      const chosen = await db.query<{ bird: number }>(`SELECT bird FROM letter_birds WHERE user_id = $1`, [userId]);
      const open = await this.countOpen(db, userId);
      const out = await db.query<{ created_at: Date; called_at: Date | null }>(
        `SELECT l.created_at, v.called_at
           FROM letters l LEFT JOIN letter_visits v ON v.letter_id = l.id AND v.ended_at IS NULL
          WHERE l.sender_id = $1 AND l.status = 'flying'`,
        [userId],
      );
      const pals = await db.query<{ id: string; other: string; name: string; bird: number | null; last_letter_at: Date; your_turn: boolean; unread: number }>(
        `SELECT t.id, o.id AS other, ${NAME_SQL('o')} AS name, ${BIRD_SQL('o')} AS bird, t.last_letter_at,
                ${YOUR_TURN_SQL('t.id', '$1::uuid')} AS your_turn,
                (SELECT count(*)::int FROM letters l WHERE l.thread_id = t.id AND l.recipient_id = $1 AND l.status = 'delivered' AND l.read_at IS NULL) AS unread
           FROM letter_threads t
           JOIN users o ON o.id = CASE WHEN t.user_lo = $1 THEN t.user_hi ELSE t.user_lo END
          WHERE t.ended_at IS NULL AND (t.user_lo = $1 OR t.user_hi = $1) AND o.deleted_at IS NULL
          ORDER BY t.last_letter_at DESC`,
        [userId],
      );
      // the birds out there this person could call, the next to come first
      const sky = band
        ? await db.query<{ sender_id: string; bird: number | null; total: number }>(
            `SELECT l.sender_id, ${BIRD_SQL('u')} AS bird, count(*) OVER ()::int AS total
               ${CALLABLE_SQL}
              ORDER BY l.created_at, l.id
              LIMIT ${SKY_BIRDS_SHOWN}`,
            [userId, band],
          )
        : null;
      // every letter at this window not yet landed or not yet read, oldest first: your own bird home with the answer a
      // visit carried (`home`), or a pen pal's bird with their next letter. One read and then answered is done with.
      const landings = await db.query<{
        id: string;
        thread_id: string;
        delivered_at: Date;
        read: boolean;
        landed: boolean;
        other: string;
        name: string;
        bird: number | null;
        home: boolean;
      }>(
        `SELECT l.id, l.thread_id, l.delivered_at, l.read_at IS NOT NULL AS read, l.landed_at IS NOT NULL AS landed,
                o.id AS other, ${NAME_SQL('o')} AS name, ${BIRD_SQL('o')} AS bird,
                EXISTS (SELECT 1 FROM letter_visits v JOIN letters mine ON mine.id = v.letter_id AND mine.sender_id = $1
                         WHERE v.answer_id = l.id AND v.outcome = 'answered') AS home
           FROM letters l
           JOIN letter_threads t ON t.id = l.thread_id AND t.ended_at IS NULL
           JOIN users o ON o.id = l.sender_id AND o.deleted_at IS NULL
          WHERE l.recipient_id = $1 AND l.status = 'delivered' AND (l.read_at IS NULL OR l.landed_at IS NULL)
            AND NOT (l.read_at IS NOT NULL AND EXISTS (
                  SELECT 1 FROM letters r WHERE r.thread_id = l.thread_id AND r.sender_id = $1
                     AND r.status IN ('delivered','removed') AND r.delivered_at > l.delivered_at))
          ORDER BY l.delivered_at, l.id
          LIMIT ${LANDINGS_MAX}`,
        [userId],
      );
      // your bird home by itself, nobody having answered it, not yet seen home at the window
      const returned = await db.query<{ id: string; recalled_at: Date; recalled_why: LetterReturnReason }>(
        `SELECT id, recalled_at, recalled_why FROM letters
          WHERE sender_id = $1 AND status = 'recalled' AND landed_at IS NULL AND recalled_why IN ('unanswered','band','full')
          ORDER BY recalled_at DESC LIMIT 1`,
        [userId],
      );
      return {
        now: clock.rows[0]!.now,
        chosen: chosen.rows[0]?.bird ?? null,
        birdChosen: chosen.rows.length > 0,
        open,
        out: out.rows[0] ?? null,
        pals: pals.rows,
        sky: sky?.rows ?? [],
        landings: landings.rows,
        returned: returned.rows[0] ?? null,
        visitor: await this.visitorOf(db, userId),
        calls: await this.callsToday(db, userId),
      };
    });

    const penPals: PenPal[] = seen.pals.map((p) => ({
      threadId: p.id,
      person: personOf(p.other, p.name, p.bird),
      lastLetterAt: p.last_letter_at.toISOString(),
      yourTurn: p.your_turn,
      unread: p.unread,
    }));
    const landings: LetterLanding[] = seen.landings.map((l) => ({
      letterId: l.id,
      threadId: l.thread_id,
      person: personOf(l.other, l.name, l.bird),
      how: l.home ? 'home' : 'window',
      landed: l.landed,
      read: l.read,
      deliveredAt: l.delivered_at.toISOString(),
    }));
    const out = seen.out
      ? {
          since: seen.out.created_at.toISOString(),
          visiting: seen.out.called_at !== null,
          homeBy: new Date(seen.out.created_at.getTime() + BIRD_OUT_DAYS * 86_400_000).toISOString(),
          leavesBy: seen.out.called_at ? new Date(seen.out.called_at.getTime() + VISIT_HOURS * 3_600_000).toISOString() : null,
        }
      : null;
    const returned =
      !out && seen.returned ? { letterId: seen.returned.id, since: seen.returned.recalled_at.toISOString(), why: seen.returned.recalled_why } : null;
    const flight: LetterFlight = out
      ? out.visiting
        ? 'window'
        : 'sky'
      : returned || landings.some((l) => l.how === 'home' && !l.landed)
        ? 'homeward'
        : 'home';
    // for builds from before `landings`: the newest of each kind still to land or to read
    const newest = (how: LetterLanding['how']) => {
      const l = [...landings].reverse().find((x) => x.how === how);
      return l ? { threadId: l.threadId, person: l.person, letterId: l.letterId } : null;
    };
    const homecoming = newest('home');
    const arrival = newest('window');

    if (opts.legacyWindow) {
      // what such a build's first look acts out: its own bird home with an answer while it is not out again, otherwise a
      // pen pal's bird when the sill is free; and its bird at home, which is how it shows one that came back by itself
      const back = homecoming && !out ? homecoming : null;
      const pal = !seen.visitor && !back ? arrival : null;
      const shown = [back?.letterId ?? pal?.letterId, returned?.letterId].filter((id): id is string => !!id);
      if (shown.length > 0) await this.pool.query(`UPDATE letters SET landed_at = now() WHERE id = ANY($1::uuid[]) AND landed_at IS NULL`, [shown]);
    }

    return {
      refusal: !band ? 'birth_month' : restricted ? 'restricted' : null,
      bird: personOf(userId, me.name, seen.chosen).bird,
      birdChosen: seen.birdChosen,
      zer: (await this.deps.wallet?.balances(userId))?.zer ?? 0,
      out,
      flight,
      returned,
      visitor: seen.visitor,
      birdsOut: seen.sky[0]?.total ?? 0,
      sky: seen.sky.map((r) => personOf(r.sender_id, '', r.bird).bird),
      callsLeft: Math.max(0, BIRD_CALLS_PER_DAY - seen.calls),
      landings,
      homecoming,
      arrival,
      penPals,
      roomForMore: seen.open < PEN_PALS_MAX,
      paper: await this.paperOf(userId),
      now: seen.now.toISOString(),
    };
  }

  /**
   * The window saying it showed these letters land: each comes in on its bird
   * once, and after that waits on the sill, without a flight, until it is
   * read. A letter to this person still to land, or their own bird home by
   * itself; any other id is passed over, so asking twice changes nothing.
   */
  async landed(userId: string, letterIds: string[]): Promise<void> {
    const r = await this.pool.query(
      `UPDATE letters SET landed_at = now()
        WHERE id = ANY($1::uuid[]) AND landed_at IS NULL
          AND ((recipient_id = $2 AND status = 'delivered') OR (sender_id = $2 AND status = 'recalled'))`,
      [letterIds, userId],
    );
    if (r.rowCount) this.ping(userId);
  }

  /**
   * Choose your bird. The first choice is free; another after it costs
   * `LETTER_BIRD_PRICE` Zêr, paid in the same transaction that changes it, so
   * the bird and the payment go together or not at all. Each change is paid
   * under a key of its own (the how-manyth change it is), so a request sent
   * twice pays once: the second finds the bird already chosen. 404
   * LETTER_BIRD_NOT_FOUND for no such bird, 409 LETTER_BIRD_SAME for the bird
   * already yours, 402 INSUFFICIENT_FUNDS without the Zêr for a new one, and
   * 409 BIRD_OUT while your bird is out: the bird that flew is the one that
   * comes home, and the one strangers see on their sill.
   */
  async chooseBird(userId: string, bird: number): Promise<LettersHome> {
    if (!isLetterBird(bird)) throw new AppError('LETTER_BIRD_NOT_FOUND', 404, 'no such bird');
    await inTransaction(this.pool, async (client) => {
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('letters:' || $1::text))`, [userId]);
      await this.me(client, userId);
      const flying = await client.query(`SELECT 1 FROM letters WHERE sender_id = $1 AND status = 'flying'`, [userId]);
      if (flying.rowCount) throw new AppError('BIRD_OUT', 409, 'your bird is out: choose another once it is home');
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
    });
    this.ping(userId);
    return this.home(userId);
  }

  /**
   * Send your bird out with a letter to somebody new. It waits out there,
   * where anybody in your band can see it and call it, until somebody does or
   * it comes home after `BIRD_OUT_DAYS`. Refused while a bird of your own is
   * out, and while another's is at your window: that one is answered or sent
   * on first. The same letter sent again, under the same key or with the same
   * words while its bird is out, is the bird already out.
   */
  async sendOut(userId: string, raw: string, rawDecor?: unknown, opts: { key?: string | null } = {}): Promise<BirdOutResult> {
    // a first letter to a stranger may choose its paper and carry notes, but nothing drawn: drawings travel between pen pals
    const { text, decor, paper } = await this.cleaned(userId, raw, rawDecor, { strokes: false });
    const key = keyed('out', opts.key);
    const { result, fresh } = await inTransaction(this.pool, async (client): Promise<{ result: BirdOutResult; fresh: boolean }> => {
      // one writer, one send or call at a time: two quick presses cannot do it twice
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('letters:' || $1::text))`, [userId]);
      if (key) {
        const before = await client.query<{ created_at: Date }>(`SELECT created_at FROM letters WHERE sender_id = $1 AND idempotency_key = $2`, [userId, key]);
        if (before.rows[0]) return { result: { kind: 'waiting', since: before.rows[0].created_at.toISOString() }, fresh: false };
      }
      const me = await this.me(client, userId);
      const band = this.bandOf(me);
      await this.flyOn(client);
      await this.settleVisits(client, userId);
      await this.comeHome(client, userId);
      const flying = await client.query<{ body: string; created_at: Date }>(`SELECT body, created_at FROM letters WHERE sender_id = $1 AND status = 'flying'`, [
        userId,
      ]);
      const already = flying.rows[0];
      if (already) {
        // the same letter again, its reply lost on the way: that is the bird already out
        if (already.body === text && Date.now() - already.created_at.getTime() < AGAIN_MINUTES * 60_000) {
          return { result: { kind: 'waiting', since: already.created_at.toISOString() }, fresh: false };
        }
        throw new AppError('BIRD_OUT', 409, 'your bird is already out');
      }
      // a bird at the window is said first: it holds a place among the day's letters, which would otherwise be said instead
      if (await this.visitorOf(client, userId)) throw new AppError('VISITOR_HERE', 409, 'a bird is at your window: answer it or send it on first');
      await this.withinDay(client, userId);
      if ((await this.openThreads(client, userId)) >= PEN_PALS_MAX) throw new AppError('PEN_PALS_FULL', 409, 'you have as many pen pals as there is room for');
      const out = await client.query<{ created_at: Date }>(
        `INSERT INTO letters (sender_id, body, decor, age_band, idempotency_key) VALUES ($1, $2, $3::jsonb, $4, $5) RETURNING created_at`,
        [userId, text, decor ? JSON.stringify(decor) : null, band, key],
      );
      // a bird that came home by itself and was never shown so is going out again: its coming home is no news now
      await client.query(`UPDATE letters SET landed_at = now() WHERE sender_id = $1 AND status = 'recalled' AND landed_at IS NULL`, [userId]);
      await this.rememberPaper(client, userId, paper);
      return { result: { kind: 'waiting', since: out.rows[0]!.created_at.toISOString() }, fresh: true };
    });
    if (fresh) this.ping(userId);
    return result;
  }

  /**
   * Call a bird to your window: the one out there that has waited longest,
   * from somebody in your band you have never written to and have no block
   * with, who has room for a pen pal, and that has not been to your window
   * before. It comes with its letter, and waits for its answer. Refused while
   * another bird is visiting, once the day's calls are made, once the day's
   * letters are written (its answer could not go), or with no room for
   * another pen pal; 404 NO_BIRDS_OUT when no bird is out for you.
   *
   * The bird is claimed in one step: when another window took it in the same
   * moment, the next statement sees that visit and the call goes on to the
   * next bird, instead of failing.
   */
  async call(userId: string): Promise<LetterVisitor> {
    const { visitor, writer } = await inTransaction(this.pool, async (client): Promise<{ visitor: LetterVisitor; writer: string }> => {
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('letters:' || $1::text))`, [userId]);
      const me = await this.me(client, userId);
      const band = this.bandOf(me);
      await this.flyOn(client);
      await this.settleVisits(client, userId);
      if (await this.visitorOf(client, userId)) throw new AppError('VISITOR_HERE', 409, 'a bird is at your window already');
      if ((await this.callsToday(client, userId)) >= BIRD_CALLS_PER_DAY) throw new AppError('CALLS_TODAY', 429, 'that is enough birds for today');
      await this.withinDay(client, userId);
      if ((await this.placesTaken(client, userId)) >= PEN_PALS_MAX) throw new AppError('PEN_PALS_FULL', 409, 'you have as many pen pals as there is room for');
      for (let attempt = 0; attempt < 3; attempt++) {
        const found = await client.query<LetterRow & { name: string; bird: number | null }>(
          `SELECT ${LETTER_COLUMNS('l')}, ${NAME_SQL('u')} AS name, ${BIRD_SQL('u')} AS bird
             ${CALLABLE_SQL}
            ORDER BY l.created_at, l.id
            LIMIT 1
            FOR UPDATE OF l SKIP LOCKED`,
          [userId, band],
        );
        const bird = found.rows[0];
        if (!bird) break;
        const visit = await client.query<{ called_at: Date }>(
          `INSERT INTO letter_visits (letter_id, visitor_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING called_at`,
          [bird.id, userId],
        );
        if (visit.rows[0]) return { visitor: visitorItem({ ...bird, called_at: visit.rows[0].called_at }, userId), writer: bird.sender_id };
      }
      throw new AppError('NO_BIRDS_OUT', 404, 'no bird is out for you to call');
    });
    this.ping(userId, writer);
    return visitor;
  }

  /** The answer letter `letterId` as answering a visitor came to, read by its writer `me`. */
  private async answerOf(db: Pick<pg.Pool, 'query'>, me: string, letterId: string): Promise<VisitorAnswer> {
    const r = await db.query<LetterRow & { thread_id: string; other: string; name: string; bird: number | null }>(
      `SELECT ${LETTER_COLUMNS('a')}, a.thread_id, o.id AS other, ${NAME_SQL('o')} AS name, ${BIRD_SQL('o')} AS bird
         FROM letters a JOIN users o ON o.id = a.recipient_id WHERE a.id = $1`,
      [letterId],
    );
    const row = r.rows[0]!;
    return { threadId: row.thread_id, person: personOf(row.other, row.name, row.bird), letter: toItem(row, me) };
  }

  /**
   * Answer the bird at your window: your letter goes home with it, theirs is
   * delivered to you, and the two of you are pen pals. Their bird is told it
   * came home with an answer. 404 NO_VISITOR when no bird is waiting (it has
   * flown on, or been called home); 409 BIRD_GONE when it can no longer take
   * an answer (their pen pals have filled up meanwhile), and then it flies on.
   *
   * Two birds can cross: each of you sent one, and each called the other's.
   * When they answered yours first, the correspondence is already open, and
   * this answer is your turn in it: their letter on your sill and your answer
   * go into it, and their bird carries your answer home. Both people's locks
   * are held, so two such answers at the same moment take turns.
   *
   * The same answer sent again (the same key, or the same words just after
   * the visit was answered) is the answer already sent, not a refusal.
   */
  async answer(userId: string, raw: string, rawDecor?: unknown, opts: { key?: string | null } = {}): Promise<VisitorAnswer> {
    const { text, decor, paper } = await this.cleaned(userId, raw, rawDecor, { strokes: true });
    const key = keyed('answer', opts.key);
    const client = await this.pool.connect();
    let refusal: Refusal = null;
    let writer: string | null = null;
    let told: { threadId: string; letterId: string; name: string } | null = null;
    let answered: VisitorAnswer | null = null;
    try {
      await client.query('BEGIN');
      const at = await client.query<{ sender_id: string }>(
        `SELECT l.sender_id FROM letter_visits v JOIN letters l ON l.id = v.letter_id WHERE v.visitor_id = $1 AND v.ended_at IS NULL`,
        [userId],
      );
      writer = at.rows[0]?.sender_id ?? null;
      await this.lockLetters(client, writer ? [userId, writer] : [userId]);
      const me = await this.me(client, userId);
      const band = this.bandOf(me);
      const before = key ? await client.query<{ id: string }>(`SELECT id FROM letters WHERE sender_id = $1 AND idempotency_key = $2`, [userId, key]) : null;
      if (before?.rows[0]) {
        answered = await this.answerOf(client, userId, before.rows[0].id);
      } else {
        await this.flyOn(client);
        await this.settleVisits(client, userId);
        const v = await client.query<{ id: string; letter_id: string; called_at: Date; sender_id: string; name: string; bird: number | null; their_band: string | null }>(
          `SELECT v.id, v.letter_id, v.called_at, l.sender_id, ${NAME_SQL('u')} AS name, ${BIRD_SQL('u')} AS bird, ${letterBandSql('u')} AS their_band
             FROM letter_visits v JOIN letters l ON l.id = v.letter_id JOIN users u ON u.id = l.sender_id
            WHERE v.visitor_id = $1 AND v.ended_at IS NULL AND l.status = 'flying' AND l.sender_id = $3
              AND v.called_at > now() - make_interval(hours => $2)
              AND u.deleted_at IS NULL AND ${NOT_BANNED_SQL('u')}
            FOR UPDATE OF v, l`,
          [userId, VISIT_HOURS, writer],
        );
        const visit = v.rows[0];
        if (!visit) {
          // the answer may have gone already, from the other device or with its reply lost on the way: then it is that one
          const last = await client.query<{ id: string; body: string }>(
            `SELECT a.id, a.body FROM letter_visits v JOIN letters a ON a.id = v.answer_id
              WHERE v.visitor_id = $1 AND v.outcome = 'answered' AND v.ended_at > now() - make_interval(mins => $2)
              ORDER BY v.ended_at DESC LIMIT 1`,
            [userId, AGAIN_MINUTES],
          );
          if (last.rows[0]?.body !== text) throw new AppError('NO_VISITOR', 404, 'no bird is waiting at your window');
          answered = await this.answerOf(client, userId, last.rows[0].id);
        } else if (visit.their_band !== band) {
          // this can never be answered: the bird flies on rather than wait out its day
          await client.query(`UPDATE letter_visits SET ended_at = now(), outcome = 'closed' WHERE id = $1`, [visit.id]);
          refusal = new AppError('LETTERS_BANDS', 403, 'letters only pass between people of the same age band');
        } else {
          await this.withinDay(client, userId, { answering: true });
          const { lo, hi } = canonicalPair(userId, visit.sender_id);
          const pair = await client.query<{ id: string; ended: boolean }>(
            `SELECT id, ended_at IS NOT NULL AS ended FROM letter_threads WHERE user_lo = $1 AND user_hi = $2 FOR UPDATE`,
            [lo, hi],
          );
          const crossed = pair.rows[0];
          let threadId: string | null = null;
          if (crossed) {
            // the birds crossed, and they answered yours first: this answer is your turn in the correspondence it opened
            if (!crossed.ended && (await this.yourTurn(client, crossed.id, userId))) threadId = crossed.id;
          } else {
            if ((await this.placesTaken(client, userId, visit.sender_id)) >= PEN_PALS_MAX) {
              throw new AppError('PEN_PALS_FULL', 409, 'you have as many pen pals as there is room for');
            }
            if ((await this.openThreads(client, visit.sender_id)) < PEN_PALS_MAX) {
              const made = await client.query<{ id: string }>(`INSERT INTO letter_threads (user_lo, user_hi) VALUES ($1, $2) RETURNING id`, [lo, hi]);
              threadId = made.rows[0]!.id;
            }
          }
          if (!threadId) {
            // it can take no answer: it flies on, and the writer is told why
            await client.query(`UPDATE letter_visits SET ended_at = now(), outcome = 'closed' WHERE id = $1`, [visit.id]);
            refusal = new AppError('BIRD_GONE', 409, 'this bird can no longer take an answer, and has flown on');
          } else {
            // theirs came to this window when it was called, and was read and seen land there; the answer is delivered
            // after it, so it is their turn next, and it is the letter their bird carries home
            await client.query(
              `UPDATE letters SET recipient_id = $2, thread_id = $3, status = 'delivered', delivered_at = $4, read_at = now(), landed_at = now() WHERE id = $1`,
              [visit.letter_id, userId, threadId, visit.called_at],
            );
            const ins = await client.query<LetterRow>(
              `INSERT INTO letters (sender_id, recipient_id, thread_id, body, decor, age_band, status, delivered_at, idempotency_key)
               VALUES ($1, $2, $3, $4, $5::jsonb, $6, 'delivered', now(), $7)
               RETURNING ${LETTER_COLUMNS()}`,
              [userId, visit.sender_id, threadId, text, decor ? JSON.stringify(decor) : null, band, key],
            );
            const letter = ins.rows[0]!;
            await this.rememberPaper(client, userId, paper);
            await client.query(`UPDATE letter_visits SET ended_at = now(), outcome = 'answered', thread_id = $2, answer_id = $3 WHERE id = $1`, [
              visit.id,
              threadId,
              letter.id,
            ]);
            await client.query(`UPDATE letter_threads SET last_letter_at = now() WHERE id = $1`, [threadId]);
            answered = { threadId, person: personOf(visit.sender_id, visit.name, visit.bird), letter: toItem(letter, userId) };
            told = { threadId, letterId: letter.id, name: me.name };
          }
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    if (refusal) {
      this.ping(userId, writer);
      throw refusal;
    }
    if (told && writer) {
      this.ping(userId, writer);
      await this.tell(writer, told.threadId, userId, told.name, 'home', told.letterId);
    }
    return answered!;
  }

  /** Send the bird at your window on its way: it flies back out for somebody else, and never comes to this window again. False when no bird was there. */
  async sendOn(userId: string): Promise<boolean> {
    const r = await this.pool.query<{ sender_id: string }>(
      `UPDATE letter_visits v SET ended_at = now(), outcome = 'sent_on'
         FROM letters l WHERE l.id = v.letter_id AND v.visitor_id = $1 AND v.ended_at IS NULL
       RETURNING l.sender_id`,
      [userId],
    );
    const writer = r.rows[0]?.sender_id;
    if (writer) this.ping(userId, writer);
    return writer !== undefined;
  }

  /**
   * Call your bird back: the letter it carries is not sent, and if it is at
   * somebody's window it leaves. When no bird is out, says what became of it:
   * answered meanwhile (`answeredIn`, the correspondence its answer opened,
   * still to land at the window), or simply home.
   *
   * One transaction under the writer's lock, which starts by locking the bird:
   * a call in flight holds that row until it commits, so the visit it makes is
   * seen and closed here too, and an answer in flight wins, its bird already
   * delivered when this goes on.
   */
  async recall(userId: string): Promise<{ recalled: true } | { recalled: false; answeredIn: string | null }> {
    type Recall = { recalled: true } | { recalled: false; answeredIn: string | null };
    const { result, visitor } = await inTransaction(this.pool, async (client): Promise<{ result: Recall; visitor: string | null }> => {
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('letters:' || $1::text))`, [userId]);
      const flying = await client.query<{ id: string }>(`SELECT id FROM letters WHERE sender_id = $1 AND status = 'flying' FOR UPDATE`, [userId]);
      const bird = flying.rows[0];
      if (!bird) {
        const answered = await client.query<{ thread_id: string }>(
          `SELECT a.thread_id FROM letter_visits v
             JOIN letters mine ON mine.id = v.letter_id AND mine.sender_id = $1
             JOIN letters a ON a.id = v.answer_id AND a.status = 'delivered' AND a.landed_at IS NULL
            WHERE v.outcome = 'answered'
            ORDER BY v.ended_at DESC LIMIT 1`,
          [userId],
        );
        return { result: { recalled: false, answeredIn: answered.rows[0]?.thread_id ?? null }, visitor: null };
      }
      const left = await client.query<{ visitor_id: string }>(
        `UPDATE letter_visits SET ended_at = now(), outcome = 'recalled' WHERE letter_id = $1 AND ended_at IS NULL RETURNING visitor_id`,
        [bird.id],
      );
      // they watched it come home, so it has landed already
      await client.query(`UPDATE letters SET status = 'recalled', recalled_at = now(), recalled_why = 'called_back', landed_at = now() WHERE id = $1`, [bird.id]);
      return { result: { recalled: true }, visitor: left.rows[0]?.visitor_id ?? null };
    });
    if (result.recalled) this.ping(userId, visitor);
    return result;
  }

  /**
   * A correspondence: who, and every letter, oldest first. The letters of
   * theirs this shows are marked read, and only those: one that comes while
   * it is read is not on the page, so it stays unread for the window. A
   * letter read here still lands at the window once (`home().landings`).
   * Not found for anybody outside it, or across a block.
   */
  async thread(userId: string, threadId: string): Promise<LetterThread> {
    const t = await this.threadRow(this.pool, userId, threadId);
    // whose turn it is is read in the same statement as the letters, so it is said of the letters on the page: a reply
    // that comes between the two would otherwise offer the paper under a letter that is not there
    const rows = await this.pool.query<LetterRow & { recipient_id: string | null; your_turn: boolean }>(
      `SELECT ${LETTER_COLUMNS()}, recipient_id, ${YOUR_TURN_SQL('$1::uuid', '$2::uuid')} AS your_turn FROM letters
        WHERE thread_id = $1 AND status IN ('delivered','removed') ORDER BY created_at, id`,
      [threadId, userId],
    );
    const unread = rows.rows.filter((r) => r.status === 'delivered' && r.recipient_id === userId && r.read_at === null).map((r) => r.id);
    if (unread.length > 0) {
      const read = await this.pool.query<{ id: string; read_at: Date }>(
        `UPDATE letters SET read_at = now() WHERE id = ANY($1::uuid[]) AND read_at IS NULL RETURNING id, read_at`,
        [unread],
      );
      const at = new Map(read.rows.map((r) => [r.id, r.read_at]));
      for (const row of rows.rows) row.read_at = at.get(row.id) ?? row.read_at;
    }
    const letters = rows.rows.map((row) => toItem(row, userId));
    const closed = t.ended || !t.sameBand;
    return {
      threadId,
      person: personOf(t.other, t.name, t.bird),
      letters,
      yourTurn: !closed && rows.rows[0]?.your_turn === true,
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

  /**
   * Write back to a pen pal: refused when it is not your turn, after a
   * goodbye, or once your bands have parted. The same letter sent again,
   * under the same key or with the same words just after it went, is the
   * letter already sent.
   */
  async reply(userId: string, threadId: string, raw: string, rawDecor?: unknown, opts: { key?: string | null } = {}): Promise<LetterItem> {
    const { text, decor, paper } = await this.cleaned(userId, raw, rawDecor, { strokes: true });
    let key = keyed('reply', opts.key);
    // `told` is who to tell, for a letter sent now; none for the letter already sent, found again
    const { sent, told } = await inTransaction(this.pool, async (client): Promise<{ sent: LetterItem; told: { other: string; name: string } | null }> => {
      const t = await this.threadRow(client, userId, threadId, true);
      if (key) {
        const before = await client.query<LetterRow & { thread_id: string }>(
          `SELECT ${LETTER_COLUMNS()}, thread_id FROM letters WHERE sender_id = $1 AND idempotency_key = $2`,
          [userId, key],
        );
        const row = before.rows[0];
        if (row && row.thread_id === threadId) return { sent: toItem(row, userId), told: null };
        // a key already used for another letter cannot be kept twice; this one goes without it
        if (row) key = null;
      }
      if (t.ended) throw new AppError('LETTERS_ENDED', 409, 'this correspondence has ended');
      if (!t.sameBand) throw new AppError('LETTERS_BANDS', 403, 'letters only pass between people of the same age band');
      const me = await this.me(client, userId);
      const band = this.bandOf(me);
      if (!(await this.yourTurn(client, threadId, userId))) {
        // the same letter again, its reply lost on the way: that is the letter already sent
        const last = await client.query<LetterRow>(
          `SELECT ${LETTER_COLUMNS()} FROM letters
            WHERE thread_id = $1 AND sender_id = $2 AND status = 'delivered' AND created_at > now() - make_interval(mins => $3)
            ORDER BY delivered_at DESC, id DESC LIMIT 1`,
          [threadId, userId, AGAIN_MINUTES],
        );
        if (last.rows[0]?.body === text) return { sent: toItem(last.rows[0], userId), told: null };
        throw new AppError('NOT_YOUR_TURN', 409, 'wait for their letter before you write again');
      }
      await this.withinDay(client, userId);
      const ins = await client.query<LetterRow>(
        `INSERT INTO letters (sender_id, recipient_id, thread_id, body, decor, age_band, status, delivered_at, idempotency_key)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, 'delivered', now(), $7)
         RETURNING ${LETTER_COLUMNS()}`,
        [userId, t.other, threadId, text, decor ? JSON.stringify(decor) : null, band, key],
      );
      await this.rememberPaper(client, userId, paper);
      await client.query(`UPDATE letter_threads SET last_letter_at = now() WHERE id = $1`, [threadId]);
      return { sent: toItem(ins.rows[0]!, userId), told: { other: t.other, name: me.name } };
    });
    if (told) {
      this.ping(userId, told.other);
      await this.tell(told.other, threadId, userId, told.name, 'window', sent.id);
    }
    return sent;
  }

  /** Say goodbye: the correspondence ends for both, and neither can write in it again. Not found for anybody outside it. */
  async end(userId: string, threadId: string): Promise<void> {
    const t = await this.threadRow(this.pool, userId, threadId);
    const r = await this.pool.query(`UPDATE letter_threads SET ended_at = now(), ended_by = $2 WHERE id = $1 AND ended_at IS NULL`, [threadId, userId]);
    if (r.rowCount) this.ping(userId, t.other);
  }

  /**
   * Tell somebody a letter has come: a pen pal's bird at their window, or
   * (`home`) their own bird home from somebody's window with an answer. A line
   * in their notifications and a push, under letters' own setting, in the
   * language they chose in the app (notice.ts); the apps write their own words
   * for the line from `data.kind` and `data.how`. `data.letterId` lets a push
   * held back by quiet hours ask, when they end, whether the letter still waits.
   * A block between the two keeps the line from being written at all
   * (notifications/inbox-service.ts).
   */
  private async tell(to: string, threadId: string, from: string, fromName: string, how: LetterNoticeHow, letterId: string): Promise<void> {
    try {
      const reader = await this.pool.query<{ locale: string | null }>(`SELECT locale FROM users WHERE id = $1`, [to]);
      const words = letterNoticeText(how, fromName, reader.rows[0]?.locale);
      const notification: Notification = {
        category: 'letters',
        title: words.title,
        body: words.body,
        data: { kind: 'letter', threadId, fromUserId: from, how, letterId },
      };
      await this.deps.inbox?.record(to, notification);
      await this.deps.push?.(to, notification);
    } catch (err) {
      this.deps.log?.warn({ err }, 'letter notification not sent');
    }
  }
}
