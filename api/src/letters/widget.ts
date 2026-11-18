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
 * The letter widget on a phone's home screen: its tokens, the account's choices for it, and the letter it shows.
 *
 * A widget runs outside the app and must not hold the account's session, so it reads with its own token, made by the
 * signed-in app, accepted only by the widget routes (`Authorization: Widget …`) and able to read only the letter
 * shown. Tokens are random and stored only as SHA-256; each phone has one, a few per account, the longest unused
 * making way. A token records the account's token version, so a new password, signing out everywhere or a ban ends
 * it, and the session it was made in, so it reads only while that session is live (migration
 * `widget-ends-with-its-session`). It lasts at most WIDGET_TOKEN_DAYS; the app makes a new one at each start.
 *
 * The letter shown is the pinned one while it may still be shown, else the newest a pen pal sent in an open
 * correspondence: never a stranger's visiting bird, a removed letter, one across a block, or one from a closed or
 * banned account. Showing it does not mark it read.
 */

/** A widget's token: a prefix that says what it is, then 32 random bytes. */
const TOKEN_RE = /^hvw_[A-Za-z0-9_-]{43}$/;
/** How often a token's last use is written down: the widget's use, not each request. */
const LAST_USED_EVERY_MS = 5 * 60_000;
/** The longest a widget's token lasts from when it was made, whatever happens to its session. */
export const WIDGET_TOKEN_DAYS = 30;
/** A session's id as access tokens carry it (auth/tokens.ts). */
const FAMILY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * Seconds a widget waits before asking again. The app reloads it at once on changes, but only while running, so a
 * widget showing the newest letter asks more often while one may be on its way, and a pinned one least often.
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
 * SQL: letter `l` by `u` may be shown on `me`'s widget: delivered to them in a correspondence, not removed, its
 * writer's account open and not banned, and no block between them. `me` is a literal from this file.
 */
const SHOWABLE_SQL = (me: string): string => `l.recipient_id = ${me} AND l.thread_id IS NOT NULL AND l.status = 'delivered'
     AND u.deleted_at IS NULL AND ${NOT_BANNED_SQL('u')}
     AND ${notBlockedSql('l.sender_id', me)}`;

const SHOWN_COLUMNS = `l.id, l.thread_id, l.body, l.decor, l.created_at, l.sender_id, ${NAME_SQL('u')} AS name, ${BIRD_SQL('u')} AS bird`;

export class LetterWidgetService {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * A token for a new widget, shown once. `replaces` is the phone's previous token, removed in the same step so a phone
   * keeps one token; past `WIDGET_TOKENS_MAX` the longest unused goes. `familyId` is the asking session, which the
   * widget depends on; a request whose access token names no session gets 401, as an expired one does, so the app
   * renews and asks again rather than receiving a token that could never read.
   */
  async createToken(userId: string, familyId: string | null | undefined, replaces?: string): Promise<WidgetTokenResult> {
    if (!familyId || !FAMILY_RE.test(familyId)) throw new AppError('UNAUTHORIZED', 401, 'authentication required');
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
      await client.query(`INSERT INTO letter_widget_tokens (user_id, token_hash, token_version, family_id) VALUES ($1, $2, $3, $4)`, [
        userId,
        hashWidgetToken(token),
        me.rows[0].token_version,
        familyId,
      ]);
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

  /**
   * The owner of a widget token, or null when it is not a token, was removed, is past WIDGET_TOKEN_DAYS, was made in an
   * ended session or in none, or belongs to an account that can no longer read.
   */
  async authenticate(raw: string): Promise<WidgetCaller | null> {
    if (!TOKEN_RE.test(raw)) return null;
    const r = await this.pool.query<{ id: string; user_id: string; last_used_at: Date | null }>(
      `SELECT t.id, t.user_id, t.last_used_at
         FROM letter_widget_tokens t JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = $1 AND t.token_version = u.token_version
          AND t.created_at > now() - make_interval(days => $2::int)
          AND EXISTS (SELECT 1 FROM refresh_tokens rt
                       WHERE rt.family_id = t.family_id AND rt.user_id = t.user_id AND rt.revoked_at IS NULL AND rt.expires_at > now())
          AND u.deleted_at IS NULL AND NOT u.guest
          AND ${NOT_BANNED_SQL('u')}`,
      [hashWidgetToken(raw), WIDGET_TOKEN_DAYS],
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
      // A pinned letter may be from an ended correspondence; it was chosen to stay.
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
   * Pins a letter to the widgets, or returns them to the newest (null), and sets whether they show the words; either
   * may be left out. Only a letter a pen pal sent you can be pinned: 404 NOT_FOUND otherwise (including across a
   * block), 409 LETTER_REMOVED for one moderation took down.
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
