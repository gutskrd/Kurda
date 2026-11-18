import { MULTI_GAMES, isMultiGame, type EvidenceMessage, type EvidenceSnapshot, type LetterDecor, type ReportTargetType, type ReportableGame } from '@kurda/shared';
import { writtenForSql } from '../users/age.js';
import type { Executor } from './tx.js';

/**
 * Evidence snapshots: what the server freezes when something is reported.
 *
 * Each target type has a resolver that reads the thing as it is now (text, title or caption, author, created and edited
 * times, media keys, and for chats the surrounding messages) and returns an `EvidenceSnapshot`, stored with the report
 * and never changed. The admin reads what the reporter saw even if the author later edits or deletes it.
 *
 * Resolvers also decide whether the reporter may report it: only what they can see. A chat only from inside it, a group
 * only by a member (groups are private), a post or comment only as a reader would find it (published, not removed, not
 * a minor's friends-only writing, users/age.ts `writtenForSql`), a game player only by someone in that game, and never
 * oneself. Anything else is "not found", so an id cannot reveal a draft's title or a private group's name via the
 * receipt or "My reports".
 *
 * Game players are reported by seat; each game registers how seats map to people (`registerGameSeats`), so a new game
 * needs only a reader.
 */

export interface ResolveContext {
  /** null when an automated feed resolves content (no reporter, no membership check) */
  reporterId: string | null;
  game?: ReportableGame;
  seat?: number;
  now: Date;
}

export interface ResolvedTarget {
  /** what is stored as the report's target id (a game player is '<game>:<gameId>:<seat>') */
  targetId: string;
  subjectUserId: string | null;
  evidence: EvidenceSnapshot;
}

/** True when the reporter (if there is one) may see it: automated feeds see everything. */
function visibleTo(ctx: ResolveContext, visible: boolean): boolean {
  return ctx.reporterId === null || visible;
}

/** Why a report cannot be filed. Every one of them answers "not found" except `self`. */
export type Refusal = 'not_found' | 'not_participant' | 'self' | 'bad_seat';

export type ResolveResult = ResolvedTarget | { refused: Refusal };

type Resolver = (db: Executor, targetId: string, ctx: ResolveContext) => Promise<ResolveResult>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

/** Only an edit at least a second after creation counts — an insert's own updated_at is not one. */
function editedAt(created: Date, updated: Date | null): string | null {
  return updated && updated.getTime() - created.getTime() > 1000 ? updated.toISOString() : null;
}

function base(targetType: ReportTargetType, targetId: string, now: Date): Pick<EvidenceSnapshot, 'targetType' | 'targetId' | 'capturedAt' | 'mediaKeys'> {
  return { targetType, targetId, capturedAt: now.toISOString(), mediaKeys: [] };
}

function selfRefusal(ctx: ResolveContext, authorId: string | null): ResolveResult | null {
  return ctx.reporterId !== null && authorId !== null && ctx.reporterId === authorId ? { refused: 'self' } : null;
}

// ---------------------------------------------------------------------------
// People, groups, posts, comments
// ---------------------------------------------------------------------------

const resolveUser: Resolver = async (db, targetId, ctx) => {
  if (!UUID_RE.test(targetId)) return { refused: 'not_found' };
  const r = await db.query<{
    id: string; username: string; display_name: string | null; bio: string | null;
    profile_photo_key: string | null; created_at: Date; updated_at: Date | null;
  }>(
    `SELECT id, username, display_name, bio, profile_photo_key, created_at, updated_at
       FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [targetId],
  );
  const u = r.rows[0];
  if (!u) return { refused: 'not_found' };
  const self = selfRefusal(ctx, u.id);
  if (self) return self;
  return {
    targetId: u.id,
    subjectUserId: u.id,
    evidence: {
      ...base('user', u.id, ctx.now),
      author: { id: u.id, username: u.username },
      title: u.display_name,
      text: u.bio,
      createdAt: iso(u.created_at),
      mediaKeys: u.profile_photo_key ? [u.profile_photo_key] : [],
    },
  };
};

const resolveGroup: Resolver = async (db, targetId, ctx) => {
  if (!UUID_RE.test(targetId)) return { refused: 'not_found' };
  const r = await db.query<{
    id: string; name: string; description: string | null; owner_id: string | null;
    owner_username: string | null; created_at: Date; archived_at: Date | null; visible: boolean;
    photo_key: string | null; edited_by: string | null; editor_username: string | null; photo_set_by: string | null; photo_setter_username: string | null;
  }>(
    `SELECT g.id, g.name, g.description, g.owner_id, o.username AS owner_username, g.created_at, g.archived_at,
            g.photo_key, g.edited_by, e.username AS editor_username, g.photo_set_by, p.username AS photo_setter_username,
            EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = g.id AND m.user_id = $2::uuid) AS visible
       FROM groups g LEFT JOIN users o ON o.id = g.owner_id
                     LEFT JOIN users e ON e.id = g.edited_by
                     LEFT JOIN users p ON p.id = g.photo_set_by
      WHERE g.id = $1`,
    [targetId, ctx.reporterId],
  );
  const g = r.rows[0];
  if (!g) return { refused: 'not_found' };
  const self = selfRefusal(ctx, g.owner_id);
  if (self) return self;
  // a group is its members' alone: reported only from inside it
  if (!visibleTo(ctx, g.visible)) return { refused: 'not_found' };
  return {
    targetId: g.id,
    // the owner answers for the group's name and description
    subjectUserId: g.owner_id,
    evidence: {
      ...base('group', g.id, ctx.now),
      author: g.owner_id && g.owner_username ? { id: g.owner_id, username: g.owner_username } : null,
      title: g.name,
      text: g.description,
      createdAt: iso(g.created_at),
      status: g.archived_at ? 'archived' : 'active',
      // the group's picture is kept with the report like any other media
      mediaKeys: g.photo_key ? [g.photo_key] : [],
      group: {
        id: g.id,
        name: g.name,
        editedBy: g.edited_by && g.editor_username ? { id: g.edited_by, username: g.editor_username } : null,
        photoSetBy: g.photo_set_by && g.photo_setter_username ? { id: g.photo_set_by, username: g.photo_setter_username } : null,
      },
    },
  };
};

const resolveLibraryPost: Resolver = async (db, targetId, ctx) => {
  if (!UUID_RE.test(targetId)) return { refused: 'not_found' };
  const r = await db.query<{
    id: string; author_id: string; username: string | null; type: string; title: string | null; body: string;
    audio_media_id: string | null; language: string; status: string; is_meme: boolean; source_credit: string | null;
    created_at: Date; updated_at: Date; visible: boolean;
  }>(
    `SELECT p.id, p.author_id, u.username, p.type, p.title, p.body, p.audio_media_id, p.language, p.status,
            p.is_meme, p.source_credit, p.created_at, p.updated_at,
            (p.status = 'published' AND ${writtenForSql('p.author_id', '$2::uuid')}) AS visible
       FROM library_posts p LEFT JOIN users u ON u.id = p.author_id WHERE p.id = $1`,
    [targetId, ctx.reporterId],
  );
  const p = r.rows[0];
  if (!p) return { refused: 'not_found' };
  const self = selfRefusal(ctx, p.author_id);
  if (self) return self;
  if (!visibleTo(ctx, p.visible)) return { refused: 'not_found' };
  // A written post's pictures (up to four, library_post_media) and their alt text are part of the report and kept from
  // cleanup with the evidence, so editing them off or deleting the post removes nothing from the case.
  const pictures = await db.query<{ media_key: string; alt_text: string | null }>(
    `SELECT media_key, alt_text FROM library_post_media WHERE post_id = $1 ORDER BY position`,
    [p.id],
  );
  return {
    targetId: p.id,
    subjectUserId: p.author_id,
    evidence: {
      ...base('library_post', p.id, ctx.now),
      author: p.username ? { id: p.author_id, username: p.username } : null,
      // a gotin has no title; null here, never the string "null"
      title: p.title,
      text: p.body,
      createdAt: iso(p.created_at),
      editedAt: editedAt(p.created_at, p.updated_at),
      status: p.status,
      mediaKeys: [...pictures.rows.map((m) => m.media_key), ...(p.audio_media_id ? [p.audio_media_id] : [])],
      pictures: pictures.rows.map((m) => ({ mediaKey: m.media_key, altText: m.alt_text })),
      extra: { postType: p.type, language: p.language, meme: p.is_meme, sourceCredit: p.source_credit },
    },
  };
};

const resolveLibraryComment: Resolver = async (db, targetId, ctx) => {
  if (!UUID_RE.test(targetId)) return { refused: 'not_found' };
  const r = await db.query<{
    id: string; post_id: string; parent_comment_id: string | null; author_id: string; username: string | null;
    body: string | null; audio_media_id: string | null; status: string; created_at: Date; updated_at: Date; visible: boolean;
  }>(
    `SELECT c.id, c.post_id, c.parent_comment_id, c.author_id, u.username, c.body, c.audio_media_id, c.status,
            c.created_at, c.updated_at,
            (c.status = 'visible' AND ${writtenForSql('c.author_id', '$2::uuid')}
             AND EXISTS (SELECT 1 FROM library_posts lp WHERE lp.id = c.post_id AND ${writtenForSql('lp.author_id', '$2::uuid')})) AS visible
       FROM library_comments c LEFT JOIN users u ON u.id = c.author_id WHERE c.id = $1`,
    [targetId, ctx.reporterId],
  );
  const c = r.rows[0];
  if (!c) return { refused: 'not_found' };
  const self = selfRefusal(ctx, c.author_id);
  if (self) return self;
  if (!visibleTo(ctx, c.visible)) return { refused: 'not_found' };
  return {
    targetId: c.id,
    subjectUserId: c.author_id,
    evidence: {
      ...base('library_comment', c.id, ctx.now),
      author: c.username ? { id: c.author_id, username: c.username } : null,
      text: c.body,
      createdAt: iso(c.created_at),
      editedAt: editedAt(c.created_at, c.updated_at),
      status: c.status,
      mediaKeys: c.audio_media_id ? [c.audio_media_id] : [],
      extra: { postId: c.post_id, parentCommentId: c.parent_comment_id },
    },
  };
};

const resolveImagePost: Resolver = async (db, targetId, ctx) => {
  if (!UUID_RE.test(targetId)) return { refused: 'not_found' };
  const r = await db.query<{
    id: string; author_id: string; username: string | null; image_media_id: string; caption: string | null;
    category: string; language: string | null; status: string; created_at: Date; updated_at: Date; visible: boolean;
  }>(
    `SELECT p.id, p.author_id, u.username, p.image_media_id, p.caption, p.category, p.language, p.status,
            p.created_at, p.updated_at,
            (p.status = 'published' AND ${writtenForSql('p.author_id', '$2::uuid')}) AS visible
       FROM image_posts p LEFT JOIN users u ON u.id = p.author_id WHERE p.id = $1`,
    [targetId, ctx.reporterId],
  );
  const p = r.rows[0];
  if (!p) return { refused: 'not_found' };
  const self = selfRefusal(ctx, p.author_id);
  if (self) return self;
  if (!visibleTo(ctx, p.visible)) return { refused: 'not_found' };
  return {
    targetId: p.id,
    subjectUserId: p.author_id,
    evidence: {
      ...base('image_post', p.id, ctx.now),
      author: p.username ? { id: p.author_id, username: p.username } : null,
      caption: p.caption,
      createdAt: iso(p.created_at),
      editedAt: editedAt(p.created_at, p.updated_at),
      status: p.status,
      mediaKeys: [p.image_media_id],
      extra: { category: p.category, language: p.language },
    },
  };
};

const resolveImageComment: Resolver = async (db, targetId, ctx) => {
  if (!UUID_RE.test(targetId)) return { refused: 'not_found' };
  const r = await db.query<{
    id: string; post_id: string; parent_comment_id: string | null; author_id: string; username: string | null;
    body: string | null; status: string; created_at: Date; updated_at: Date; visible: boolean;
  }>(
    `SELECT c.id, c.post_id, c.parent_comment_id, c.author_id, u.username, c.body, c.status, c.created_at, c.updated_at,
            (c.status = 'visible' AND ${writtenForSql('c.author_id', '$2::uuid')}
             AND EXISTS (SELECT 1 FROM image_posts ip WHERE ip.id = c.post_id AND ${writtenForSql('ip.author_id', '$2::uuid')})) AS visible
       FROM image_comments c LEFT JOIN users u ON u.id = c.author_id WHERE c.id = $1`,
    [targetId, ctx.reporterId],
  );
  const c = r.rows[0];
  if (!c) return { refused: 'not_found' };
  const self = selfRefusal(ctx, c.author_id);
  if (self) return self;
  if (!visibleTo(ctx, c.visible)) return { refused: 'not_found' };
  return {
    targetId: c.id,
    subjectUserId: c.author_id,
    evidence: {
      ...base('image_comment', c.id, ctx.now),
      author: c.username ? { id: c.author_id, username: c.username } : null,
      text: c.body,
      createdAt: iso(c.created_at),
      editedAt: editedAt(c.created_at, c.updated_at),
      status: c.status,
      extra: { postId: c.post_id, parentCommentId: c.parent_comment_id },
    },
  };
};

// ---------------------------------------------------------------------------
// Chats
// ---------------------------------------------------------------------------

/** Messages kept around a reported one: enough to read the exchange, not the whole history. */
export const CONTEXT_BEFORE = 10;
export const CONTEXT_AFTER = 5;

interface MessageRow {
  id: string;
  sender_id: string;
  username: string | null;
  kind: string;
  body: string | null;
  created_at: Date;
}

function toEvidenceMessage(m: MessageRow, reportedId: string): EvidenceMessage {
  return {
    id: m.id,
    senderId: m.sender_id,
    username: m.username,
    kind: m.kind,
    body: m.body,
    createdAt: m.created_at.toISOString(),
    reported: m.id === reportedId,
  };
}

/**
 * The reported message with those before and after it, in order. `scope` is the SQL selecting the conversation (a
 * literal from this file, never input); its parameters come first, then the message id. The message's time is read in
 * SQL because a JavaScript Date drops Postgres's microseconds and the message would count as "after" itself.
 */
async function contextAround(
  db: Executor,
  table: 'dm_messages' | 'group_messages',
  scope: string,
  scopeParams: unknown[],
  id: string,
): Promise<MessageRow[]> {
  const n = scopeParams.length;
  const cols = `m.id, m.sender_id, u.username, m.kind, m.body, m.created_at`;
  const res = await db.query<MessageRow>(
    `WITH ref AS (SELECT created_at, id FROM ${table} WHERE id = $${n + 1}::uuid)
     SELECT * FROM (
       (SELECT ${cols} FROM ${table} m LEFT JOIN users u ON u.id = m.sender_id, ref
         WHERE ${scope} AND (m.created_at, m.id) < (ref.created_at, ref.id)
         ORDER BY m.created_at DESC, m.id DESC LIMIT ${CONTEXT_BEFORE})
       UNION ALL
       (SELECT ${cols} FROM ${table} m LEFT JOIN users u ON u.id = m.sender_id WHERE m.id = $${n + 1}::uuid)
       UNION ALL
       (SELECT ${cols} FROM ${table} m LEFT JOIN users u ON u.id = m.sender_id, ref
         WHERE ${scope} AND (m.created_at, m.id) > (ref.created_at, ref.id)
         ORDER BY m.created_at ASC, m.id ASC LIMIT ${CONTEXT_AFTER})
     ) ctx ORDER BY created_at, id`,
    [...scopeParams, id],
  );
  return res.rows;
}

const resolveDmMessage: Resolver = async (db, targetId, ctx) => {
  if (!UUID_RE.test(targetId)) return { refused: 'not_found' };
  const r = await db.query<{ id: string; user_lo: string; user_hi: string; sender_id: string; created_at: Date }>(
    `SELECT id, user_lo, user_hi, sender_id, created_at FROM dm_messages WHERE id = $1`,
    [targetId],
  );
  const m = r.rows[0];
  if (!m) return { refused: 'not_found' };
  // only from inside the conversation — and answered as "not found", so the
  // endpoint cannot be used to learn which message ids exist
  if (ctx.reporterId !== null && ctx.reporterId !== m.user_lo && ctx.reporterId !== m.user_hi) {
    return { refused: 'not_found' };
  }
  const self = selfRefusal(ctx, m.sender_id);
  if (self) return self;
  const rows = await contextAround(db, 'dm_messages', 'm.user_lo = $1 AND m.user_hi = $2', [m.user_lo, m.user_hi], m.id);
  const reported = rows.find((x) => x.id === m.id);
  return {
    targetId: m.id,
    subjectUserId: m.sender_id,
    evidence: {
      ...base('dm_message', m.id, ctx.now),
      author: reported?.username ? { id: m.sender_id, username: reported.username } : null,
      text: reported?.body ?? null,
      createdAt: iso(m.created_at),
      context: rows.map((x) => toEvidenceMessage(x, m.id)),
      extra: { kind: reported?.kind ?? 'text' },
    },
  };
};

const resolveGroupMessage: Resolver = async (db, targetId, ctx) => {
  if (!UUID_RE.test(targetId)) return { refused: 'not_found' };
  const r = await db.query<{ id: string; group_id: string; sender_id: string; created_at: Date; name: string; deleted_at: Date | null }>(
    `SELECT m.id, m.group_id, m.sender_id, m.created_at, g.name, m.deleted_at
       FROM group_messages m JOIN groups g ON g.id = m.group_id WHERE m.id = $1`,
    [targetId],
  );
  const m = r.rows[0];
  if (!m) return { refused: 'not_found' };
  if (ctx.reporterId !== null) {
    const member = await db.query(`SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2`, [m.group_id, ctx.reporterId]);
    if (!member.rowCount) return { refused: 'not_found' };
  }
  const self = selfRefusal(ctx, m.sender_id);
  if (self) return self;
  const rows = await contextAround(db, 'group_messages', 'm.group_id = $1', [m.group_id], m.id);
  const reported = rows.find((x) => x.id === m.id);
  return {
    targetId: m.id,
    subjectUserId: m.sender_id,
    evidence: {
      ...base('group_message', m.id, ctx.now),
      author: reported?.username ? { id: m.sender_id, username: reported.username } : null,
      text: reported?.body ?? null,
      createdAt: iso(m.created_at),
      status: m.deleted_at ? 'deleted' : 'visible',
      group: { id: m.group_id, name: m.name },
      context: rows.map((x) => toEvidenceMessage(x, m.id)),
      extra: { kind: reported?.kind ?? 'text' },
    },
  };
};

/** A letter round a reported one, as the case lists it: its words, and the notes on its paper and whether it was drawn on. */
function toLetterMessage(m: MessageRow & { decor: LetterDecor | null }, reportedId: string): EvidenceMessage {
  const message = toEvidenceMessage(m, reportedId);
  if (!m.decor) return message;
  return { ...message, notes: m.decor.notes.map((n) => n.text), drawn: m.decor.strokes.length > 0 };
}

/**
 * A pen-pal letter (letters/service.ts): reportable only by someone in its correspondence, never its writer, kept with
 * the letters around it like a chat message. A letter still in flight can be reported, on its own, by whoever received
 * and read it; to anyone else it is not found. The whole letter is kept as the reader saw it (paper, drawings, notes in
 * `decor`); surrounding letters keep their notes too.
 */
const resolveLetter: Resolver = async (db, targetId, ctx) => {
  if (!UUID_RE.test(targetId)) return { refused: 'not_found' };
  const r = await db.query<{ id: string; sender_id: string; recipient_id: string | null; thread_id: string | null; status: string; created_at: Date }>(
    `SELECT id, sender_id, recipient_id, thread_id, status, created_at FROM letters WHERE id = $1`,
    [targetId],
  );
  const l = r.rows[0];
  if (!l) return { refused: 'not_found' };
  if (l.thread_id === null) {
    // a bird out there: only somebody it visited has read its letter
    const visited =
      ctx.reporterId !== null &&
      ((await db.query(`SELECT 1 FROM letter_visits WHERE letter_id = $1 AND visitor_id = $2`, [l.id, ctx.reporterId])).rowCount ?? 0) > 0;
    if (!visited) return { refused: 'not_found' };
  } else if (ctx.reporterId !== null && ctx.reporterId !== l.sender_id && ctx.reporterId !== l.recipient_id) return { refused: 'not_found' };
  const self = selfRefusal(ctx, l.sender_id);
  if (self) return self;
  // a letter still out with its bird stands alone; one in a correspondence is kept with the letters round it
  const rows = l.thread_id === null
    ? await db.query<MessageRow & { decor: LetterDecor | null }>(
        `SELECT m.id, m.sender_id, u.username, 'letter' AS kind, m.body, m.decor, m.created_at FROM letters m LEFT JOIN users u ON u.id = m.sender_id WHERE m.id = $1`,
        [l.id],
      )
    : await db.query<MessageRow & { decor: LetterDecor | null }>(
        `WITH ref AS (SELECT created_at, id FROM letters WHERE id = $2::uuid)
         SELECT * FROM (
           (SELECT m.id, m.sender_id, u.username, 'letter' AS kind, m.body, m.decor, m.created_at
              FROM letters m LEFT JOIN users u ON u.id = m.sender_id, ref
             WHERE m.thread_id = $1 AND (m.created_at, m.id) <= (ref.created_at, ref.id)
             ORDER BY m.created_at DESC, m.id DESC LIMIT ${CONTEXT_BEFORE + 1})
           UNION ALL
           (SELECT m.id, m.sender_id, u.username, 'letter' AS kind, m.body, m.decor, m.created_at
              FROM letters m LEFT JOIN users u ON u.id = m.sender_id, ref
             WHERE m.thread_id = $1 AND (m.created_at, m.id) > (ref.created_at, ref.id)
             ORDER BY m.created_at ASC, m.id ASC LIMIT ${CONTEXT_AFTER})
         ) ctx ORDER BY created_at, id`,
        [l.thread_id, l.id],
      );
  const reported = rows.rows.find((x) => x.id === l.id);
  return {
    targetId: l.id,
    subjectUserId: l.sender_id,
    evidence: {
      ...base('letter', l.id, ctx.now),
      author: reported?.username ? { id: l.sender_id, username: reported.username } : null,
      text: reported?.body ?? null,
      createdAt: iso(l.created_at),
      status: l.status,
      decor: reported?.decor ?? null,
      context: rows.rows.map((x) => toLetterMessage(x, l.id)),
      extra: { threadId: l.thread_id },
    },
  };
};

// ---------------------------------------------------------------------------
// Game players, by seat
// ---------------------------------------------------------------------------

/** A game's players by seat, as the game shows them (seat 1 first; a seat that was left stays empty). */
export interface GameSeats {
  status: string | null;
  players: Array<{ seat: number; userId: string }>;
}

/** Reads one game's seats; null when there is no such game. */
export type GameSeatsReader = (db: Executor, gameId: string) => Promise<GameSeats | null>;

const gameSeatReaders = new Map<string, GameSeatsReader>();

/**
 * Register how a game's seats map to people. Seats are the order the game shows its players; mapping on the server
 * means a client reports "seat 2" without ever needing an account id.
 */
export function registerGameSeats(game: ReportableGame, reader: GameSeatsReader): void {
  gameSeatReaders.set(game, reader);
}

/**
 * Peyvok Battle and Rhyme Match seats: the `seat` column from the shared lobby rules (migration 1751000149000),
 * assigned in join order and never reused, as their views show ("Player 2"). A player who left a started game keeps
 * theirs (`left_at`); leaving an unstarted lobby deletes the row, so there is nobody to report.
 */
function battleSeats(gameTable: string, playerTable: string, fk: string): GameSeatsReader {
  return async (db, gameId) => {
    const g = await db.query<{ status: string }>(`SELECT status FROM ${gameTable} WHERE id = $1`, [gameId]);
    if (!g.rows[0]) return null;
    const p = await db.query<{ seat: number; user_id: string }>(
      `SELECT seat, user_id FROM ${playerTable} WHERE ${fk} = $1 ORDER BY seat`,
      [gameId],
    );
    return { status: g.rows[0].status, players: p.rows.map((r) => ({ seat: Number(r.seat), userId: r.user_id })) };
  };
}

registerGameSeats('wordle-battle', battleSeats('wordle_battles', 'wordle_battle_players', 'battle_id'));
registerGameSeats('rhyme-match', battleSeats('rhyme_matches', 'rhyme_match_players', 'match_id'));

/**
 * Stories keeps real seats (`story_game_players.seat`, migration 1751000147000, never reused within a game). A player
 * who left or was removed keeps their seat, so what they did before is still reportable.
 */
registerGameSeats('stories', async (db, gameId) => {
  const g = await db.query<{ status: string }>(`SELECT status FROM story_games WHERE id = $1`, [gameId]);
  if (!g.rows[0]) return null;
  const p = await db.query<{ seat: number; user_id: string }>(
    `SELECT seat, user_id FROM story_game_players WHERE game_id = $1 ORDER BY seat`,
    [gameId],
  );
  return { status: g.rows[0].status, players: p.rows.map((r) => ({ seat: Number(r.seat), userId: r.user_id })) };
});

/**
 * The multiplayer games share the engine's seats (`game_lobby_players.seat`, never reused in a game); a computer seat
 * has nobody to report. What the reported player typed is frozen with the report (`extra.typed`), since the game clears
 * its own copy a month after it ends.
 */
const multiSeats =
  (game: string): GameSeatsReader =>
  async (db, gameId) => {
    // the lobby must be of the game the report names: one filed under another game's name is not found, not stored under the wrong one
    const g = await db.query<{ status: string }>(`SELECT status FROM game_lobbies WHERE id = $1 AND game = $2`, [gameId, game]);
    if (!g.rows[0]) return null;
    const p = await db.query<{ seat: number; user_id: string }>(
      `SELECT seat, user_id FROM game_lobby_players WHERE lobby_id = $1 AND user_id IS NOT NULL ORDER BY seat`,
      [gameId],
    );
    return { status: g.rows[0].status, players: p.rows.map((r) => ({ seat: Number(r.seat), userId: r.user_id })) };
  };
for (const game of MULTI_GAMES) registerGameSeats(game, multiSeats(game));

/** What a reported player typed in a multiplayer learning game, in order (the last 50 moves with text). */
async function typedInGame(db: Executor, gameId: string, seat: number): Promise<Array<{ text: string; at: string }>> {
  const r = await db.query<{ text: string; created_at: Date }>(
    `SELECT text, created_at FROM (
       SELECT text, created_at, seq FROM game_moves WHERE lobby_id = $1 AND seat = $2 AND text IS NOT NULL ORDER BY seq DESC LIMIT 50
     ) m ORDER BY seq`,
    [gameId, seat],
  );
  return r.rows.map((x) => ({ text: x.text, at: x.created_at.toISOString() }));
}

const resolveGamePlayer: Resolver = async (db, targetId, ctx) => {
  if (!UUID_RE.test(targetId) || !ctx.game || ctx.seat === undefined) return { refused: 'not_found' };
  const reader = gameSeatReaders.get(ctx.game);
  if (!reader) return { refused: 'not_found' };
  const seats = await reader(db, targetId);
  if (!seats) return { refused: 'not_found' };
  // only someone who played in it
  if (ctx.reporterId !== null && !seats.players.some((p) => p.userId === ctx.reporterId)) {
    return { refused: 'not_found' };
  }
  const target = seats.players.find((p) => p.seat === ctx.seat);
  if (!target) return { refused: 'bad_seat' };
  const self = selfRefusal(ctx, target.userId);
  if (self) return self;
  const names = await db.query<{ id: string; username: string }>(
    `SELECT id, username FROM users WHERE id = ANY($1::uuid[])`,
    [seats.players.map((p) => p.userId)],
  );
  const nameOf = new Map(names.rows.map((r) => [r.id, r.username]));
  const storedId = `${ctx.game}:${targetId}:${ctx.seat}`;
  const typed = isMultiGame(ctx.game) ? await typedInGame(db, targetId, ctx.seat) : null;
  return {
    targetId: storedId,
    subjectUserId: target.userId,
    evidence: {
      ...base('game_player', storedId, ctx.now),
      author: nameOf.has(target.userId) ? { id: target.userId, username: nameOf.get(target.userId)! } : null,
      game: {
        game: ctx.game,
        gameId: targetId,
        status: seats.status,
        seat: ctx.seat,
        players: seats.players.map((p) => ({ seat: p.seat, userId: p.userId, username: nameOf.get(p.userId) ?? null })),
      },
      ...(typed ? { extra: { typed } } : {}),
    },
  };
};

// ---------------------------------------------------------------------------

const RESOLVERS: Readonly<Record<ReportTargetType, Resolver>> = {
  user: resolveUser,
  dm_message: resolveDmMessage,
  group_message: resolveGroupMessage,
  group: resolveGroup,
  library_post: resolveLibraryPost,
  library_comment: resolveLibraryComment,
  image_post: resolveImagePost,
  image_comment: resolveImageComment,
  game_player: resolveGamePlayer,
  letter: resolveLetter,
};

/** Snapshot a report's target, or say why it cannot be reported. */
export function resolveTarget(db: Executor, targetType: ReportTargetType, targetId: string, ctx: ResolveContext): Promise<ResolveResult> {
  return RESOLVERS[targetType](db, targetId, ctx);
}
