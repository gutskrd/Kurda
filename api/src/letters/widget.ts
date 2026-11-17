import { createHash, randomBytes } from 'node:crypto';
import type pg from 'pg';
import {
  WIDGET_TOKENS_MAX,
  isRtlText,
  letterBirdOf,
  isLetterBird,
  paperOf,
  widgetExcerpt,
  type LetterDecor,
  type WidgetFeed,
  type WidgetLetter,
  type WidgetPrefs,
  type WidgetSettings,
  type WidgetTokenResult,
} from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { notBlockedSql } from '../friends/blocked.js';
import { BIRD_SQL, NAME_SQL, NOT_BANNED_SQL, YOUR_TURN_SQL, personOf } from './service.js';

/**
 * The letter widget on a phone's home screen (shared/src/letter-paper.ts):
 * its tokens, what the account chooses for it, and the letter it shows.
 *
 * A widget cannot sign in, and should not hold the account's own session: it
 * runs outside the app, and keeps what it holds where the app shares it. So
 * it reads with a token of its own, made by the signed-in app and handed to
 * the widget, which these routes alone accept (`Authorization: Widget …`) and
 * which can read nothing but the letter it shows. The token is random and
 * kept only as its SHA-256, so the table never holds anything that would let
 * somebody read; each phone has one, a few phones per account, the one longest
 * unused making way for a new one. It also remembers the account's token
 * version when it was made: a new password, signing out everywhere or a ban
 * ends the widgets with the sessions.
 *
 * The letter shown is the one pinned, while it may still be shown, or else
 * the newest one a pen pal sent you in a correspondence still open: never a
 * stranger's bird at your window, never a letter taken down, never across a
 * block, never from an account closed or banned. Seeing it on the widget does
 * not mark it read: that is for opening it in the app.
 */

/** A widget's token: a prefix that says what it is, then 32 random bytes. */
const TOKEN_RE = /^hvw_[A-Za-z0-9_-]{43}$/;
/** How often a token's last use is written down: the widget's use, not each request. */
const LAST_USED_EVERY_MS = 5 * 60_000;
/**
 * How long a widget waits before it asks again, in seconds. The app asks it to
 * reload at once when a letter comes or the choices change, but only while the
 * app runs; so a widget showing the newest letter asks twice as often while a
 * letter may be on its way (your bird out, or a pen pal's turn to write), and
 * a pinned one, which nothing new replaces, least often.
 */
export const WIDGET_REFRESH = { newest: 30 * 60, awaited: 15 * 60, pinned: 60 * 60 } as const;

export const hashWidgetToken = (raw: string): string => createHash('sha256').update(raw).digest('hex');

/** Who a widget request is from: the token, and whose it is. */
export interface WidgetCaller {
  tokenId: string;
  userId: string;
}

/** What the widget's picture is of: a letter's paper with its writer's pigeon, or your own pigeon waiting on the sill. */
export type WidgetPicture =
  | { kind: 'letter'; letterId: string; decor: LetterDecor | null; bird: number; rtl: boolean }
  | { kind: 'empty'; bird: number };

interface ShownRow {
  id: string;
  thread_id: string;
  body: string;
  decor: LetterDecor | null;
  created_at: Date;
  sender_id: string;
  name: string;
  bird: number | null;
}

/**
 * SQL: the letter `l`, written by `u`, may be shown on the widget of `me` —
 * delivered to them in a correspondence, not taken down, its writer's account
 * open and not banned, and no block between the two. `me` is a literal from
 * this file.
 */
const SHOWABLE_SQL = (me: string): string => `l.recipient_id = ${me} AND l.thread_id IS NOT NULL AND l.status = 'delivered'
     AND u.deleted_at IS NULL AND ${NOT_BANNED_SQL('u')}
     AND ${notBlockedSql('l.sender_id', me)}`;

const SHOWN_COLUMNS = `l.id, l.thread_id, l.body, l.decor, l.created_at, l.sender_id, ${NAME_SQL('u')} AS name, ${BIRD_SQL('u')} AS bird`;

export class LetterWidgetService {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * A token for a new widget, shown once. `replaces` is the token this phone
   * had before, if any: it goes in the same step, so a phone keeps one token
   * however often the app hands its widget a fresh one (after a new password,
   * say). Past `WIDGET_TOKENS_MAX` the token longest unused is dropped.
   */
  async createToken(userId: string, replaces?: string): Promise<WidgetTokenResult> {
    const token = `hvw_${randomBytes(32).toString('base64url')}`;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // two phones made a widget at once still end with no more than the limit
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('letter-widget:' || $1::text))`, [userId]);
      const me = await client.query<{ token_version: number }>(`SELECT token_version FROM users WHERE id = $1 AND deleted_at IS NULL`, [userId]);
      if (!me.rows[0]) throw new AppError('NOT_FOUND', 404, 'account not found');
      if (replaces && TOKEN_RE.test(replaces)) {
        await client.query(`DELETE FROM letter_widget_tokens WHERE user_id = $1 AND token_hash = $2`, [userId, hashWidgetToken(replaces)]);
      }
      await client.query(`INSERT INTO letter_widget_tokens (user_id, token_hash, token_version) VALUES ($1, $2, $3)`, [userId, hashWidgetToken(token), me.rows[0].token_version]);
      await client.query(
        `DELETE FROM letter_widget_tokens WHERE id IN (
           SELECT id FROM letter_widget_tokens WHERE user_id = $1
            ORDER BY COALESCE(last_used_at, created_at) DESC, created_at DESC OFFSET $2)`,
        [userId, WIDGET_TOKENS_MAX],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    return { token };
  }

  /** Whose a widget token is, or null for one that is not a token, was removed, or belongs to an account that can no longer read. */
  async authenticate(raw: string): Promise<WidgetCaller | null> {
    if (!TOKEN_RE.test(raw)) return null;
    const r = await this.pool.query<{ id: string; user_id: string; last_used_at: Date | null }>(
      `SELECT t.id, t.user_id, t.last_used_at
         FROM letter_widget_tokens t JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = $1 AND t.token_version = u.token_version
          AND u.deleted_at IS NULL AND NOT u.guest
          AND ${NOT_BANNED_SQL('u')}`,
      [hashWidgetToken(raw)],
    );
    const row = r.rows[0];
    if (!row) return null;
    if (!row.last_used_at || Date.now() - row.last_used_at.getTime() > LAST_USED_EVERY_MS) {
      await this.pool.query(`UPDATE letter_widget_tokens SET last_used_at = now() WHERE id = $1`, [row.id]);
    }
    return { tokenId: row.id, userId: row.user_id };
  }

  /** A widget removing its own token: the phone's app signing out. */
  async revokeToken(tokenId: string): Promise<void> {
    await this.pool.query(`DELETE FROM letter_widget_tokens WHERE id = $1`, [tokenId]);
  }

  /** Every widget of the account, on every phone; how many there were. */
  async revokeAll(userId: string): Promise<number> {
    const r = await this.pool.query(`DELETE FROM letter_widget_tokens WHERE user_id = $1`, [userId]);
    return r.rowCount ?? 0;
  }

  private async storedPrefs(userId: string): Promise<WidgetPrefs> {
    const r = await this.pool.query<{ pinned_letter_id: string | null; show_words: boolean }>(
      `SELECT pinned_letter_id, show_words FROM letter_widget_prefs WHERE user_id = $1`,
      [userId],
    );
    const row = r.rows[0];
    return { pinnedLetterId: row?.pinned_letter_id ?? null, showWords: row?.show_words ?? true };
  }

  /** The letter the widgets show now, and whether it is the pinned one. */
  private async shown(userId: string, pinnedLetterId: string | null): Promise<{ row: ShownRow | null; pinned: boolean }> {
    if (pinnedLetterId) {
      // a letter pinned may be from a correspondence since ended: it was chosen to stay
      const pinned = await this.pool.query<ShownRow>(
        `SELECT ${SHOWN_COLUMNS} FROM letters l JOIN users u ON u.id = l.sender_id WHERE l.id = $2 AND ${SHOWABLE_SQL('$1::uuid')}`,
        [userId, pinnedLetterId],
      );
      if (pinned.rows[0]) return { row: pinned.rows[0], pinned: true };
    }
    const newest = await this.pool.query<ShownRow>(
      `SELECT ${SHOWN_COLUMNS}
         FROM letters l JOIN users u ON u.id = l.sender_id JOIN letter_threads t ON t.id = l.thread_id
        WHERE ${SHOWABLE_SQL('$1::uuid')} AND t.ended_at IS NULL
        ORDER BY l.delivered_at DESC, l.id DESC
        LIMIT 1`,
      [userId],
    );
    return { row: newest.rows[0] ?? null, pinned: false };
  }

  private static letterOf(row: ShownRow, showWords: boolean): WidgetLetter {
    const person = personOf(row.sender_id, row.name, row.bird);
    return {
      id: row.id,
      threadId: row.thread_id,
      from: { name: person.name, bird: person.bird },
      excerpt: showWords ? widgetExcerpt(row.body) : '',
      sentAt: row.created_at.toISOString(),
      paper: paperOf(row.decor),
      rtl: isRtlText(row.body),
      drawn: (row.decor?.strokes.length ?? 0) > 0,
    };
  }

  /** Whether a letter may be on its way to this person: their bird is out, or a pen pal owes them a letter. */
  private async awaited(userId: string): Promise<boolean> {
    const r = await this.pool.query<{ awaited: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM letters WHERE sender_id = $1 AND status = 'flying')
           OR EXISTS (SELECT 1 FROM letter_threads t WHERE t.ended_at IS NULL AND (t.user_lo = $1 OR t.user_hi = $1)
                        AND NOT ${YOUR_TURN_SQL('t.id', '$1::uuid')}) AS awaited`,
      [userId],
    );
    return r.rows[0]?.awaited === true;
  }

  /** What a widget is told each time it refreshes. */
  async feed(userId: string): Promise<WidgetFeed> {
    const prefs = await this.storedPrefs(userId);
    const { row, pinned } = await this.shown(userId, prefs.pinnedLetterId);
    return {
      letter: row ? LetterWidgetService.letterOf(row, prefs.showWords) : null,
      pinned,
      showWords: prefs.showWords,
      refreshAfter: pinned ? WIDGET_REFRESH.pinned : (await this.awaited(userId)) ? WIDGET_REFRESH.awaited : WIDGET_REFRESH.newest,
    };
  }

  /** The widget page in letter settings. A pin that can no longer be shown reads as none, and the newest letter is shown instead. */
  async settings(userId: string): Promise<WidgetSettings> {
    const prefs = await this.storedPrefs(userId);
    const { row, pinned } = await this.shown(userId, prefs.pinnedLetterId);
    const widgets = await this.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM letter_widget_tokens WHERE user_id = $1`, [userId]);
    return {
      pinnedLetterId: pinned ? prefs.pinnedLetterId : null,
      showWords: prefs.showWords,
      letter: row ? LetterWidgetService.letterOf(row, prefs.showWords) : null,
      pinned,
      widgets: widgets.rows[0]?.n ?? 0,
    };
  }

  /**
   * Pin a letter to the widgets, or let them show the newest again (null), and
   * whether they show the words; either may be left out to keep it as it is.
   * Only a letter a pen pal sent you in a correspondence can be pinned: 404
   * NOT_FOUND for any other (or across a block, where the correspondence is
   * not there at all), 409 LETTER_REMOVED for one moderation took down.
   */
  async setPrefs(userId: string, change: Partial<WidgetPrefs>): Promise<WidgetSettings> {
    if (change.pinnedLetterId) {
      const r = await this.pool.query<{ status: string }>(
        `SELECT l.status FROM letters l JOIN users u ON u.id = l.sender_id
          WHERE l.id = $2 AND l.recipient_id = $1 AND l.thread_id IS NOT NULL AND u.deleted_at IS NULL
            AND ${notBlockedSql('l.sender_id', '$1::uuid')}`,
        [userId, change.pinnedLetterId],
      );
      const status = r.rows[0]?.status;
      if (!status) throw new AppError('NOT_FOUND', 404, 'no such letter of yours');
      if (status === 'removed') throw new AppError('LETTER_REMOVED', 409, 'this letter was taken down');
    }
    await this.pool.query(
      `INSERT INTO letter_widget_prefs (user_id, pinned_letter_id, show_words)
       VALUES ($1, CASE WHEN $2::boolean THEN $3::uuid END, COALESCE($4::boolean, true))
       ON CONFLICT (user_id) DO UPDATE SET
         pinned_letter_id = CASE WHEN $2::boolean THEN $3::uuid ELSE letter_widget_prefs.pinned_letter_id END,
         show_words = COALESCE($4::boolean, letter_widget_prefs.show_words),
         updated_at = now()`,
      [userId, change.pinnedLetterId !== undefined, change.pinnedLetterId ?? null, change.showWords ?? null],
    );
    return this.settings(userId);
  }

  /** What the widget's picture shows: the letter's paper and its writer's pigeon, or, with no letter yet, your own pigeon waiting. */
  async picture(userId: string): Promise<WidgetPicture> {
    const prefs = await this.storedPrefs(userId);
    const { row } = await this.shown(userId, prefs.pinnedLetterId);
    if (row) return { kind: 'letter', letterId: row.id, decor: row.decor, bird: personOf(row.sender_id, row.name, row.bird).bird, rtl: isRtlText(row.body) };
    const mine = await this.pool.query<{ bird: number }>(`SELECT bird FROM letter_birds WHERE user_id = $1`, [userId]);
    const bird = mine.rows[0]?.bird;
    return { kind: 'empty', bird: isLetterBird(bird) ? bird : letterBirdOf(userId) };
  }
}
