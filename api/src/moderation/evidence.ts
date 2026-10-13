import type { EvidenceMessage, EvidenceSnapshot, ReportTargetType, ReportableGame } from '@kurda/shared';
import { writtenForSql } from '../users/age.js';
import type { Executor } from './tx.js';

/**
 * Evidence snapshots: what the server freezes when something is reported.
 *
 * Every target type has a resolver that reads the thing as it is right now —
 * text, title or caption, author, created and edited times, media keys, and for
 * chats the messages around it — and returns it as an `EvidenceSnapshot`, which
 * the report stores and never changes. So the admin reads what the reporter
 * saw, even after the author edits or deletes it (the old queue re-read the live
 * row, and an author deleting a post made the report vanish).
 *
 * The resolvers also decide whether the reporter may report it at all: only
 * what they can see. A chat only from inside it (a stranger must not be able to
 * pull a private conversation into anyone's view), an invite-only group only by
 * a member, a post or comment only as the reader would find it — published,
 * not removed, and not a minor's written for their friends (users/age.ts
 * `writtenForSql`) — a game player only by someone in that game, and nobody
 * reports themselves. Anything else is "not found": an id is not a key to a
 * draft's title or a private group's name, which the receipt and "My reports"
 * would otherwise hand back as its label, with the text frozen into evidence.
 * Once reported, the snapshot is what matters: an author who unpublishes or
 * deletes it afterwards changes nothing.
 *
 * Game players are reported by seat, and each game says how seats map to
 * people through a small registry (`registerGameSeats`), so a new game plugs in
 * with one reader instead of a change to the report path.
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
    id: string; name: string; description: string | null; privacy: string; owner_id: string | null;
    owner_username: string | null; created_at: Date; archived_at: Date | null; visible: boolean;
  }>(
    `SELECT g.id, g.name, g.description, g.privacy, g.owner_id, o.username AS owner_username, g.created_at, g.archived_at,
            (g.privacy = 'open' OR EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = g.id AND m.user_id = $2::uuid)) AS visible
       FROM groups g LEFT JOIN users o ON o.id = g.owner_id
      WHERE g.id = $1`,
    [targetId, ctx.reporterId],
  );
  const g = r.rows[0];
  if (!g) return { refused: 'not_found' };
  const self = selfRefusal(ctx, g.owner_id);
  if (self) return self;
  // an invite-only group, only from inside it
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
      group: { id: g.id, name: g.name, privacy: g.privacy },
    },
  };
};

const resolveLibraryPost: Resolver = async (db, targetId, ctx) => {
  if (!UUID_RE.test(targetId)) return { refused: 'not_found' };
  const r = await db.query<{
    id: string; author_id: string; username: string | null; type: string; title: string | null; body: string;
    audio_media_id: string | null; language: string; status: string; created_at: Date; updated_at: Date; visible: boolean;
  }>(
    `SELECT p.id, p.author_id, u.username, p.type, p.title, p.body, p.audio_media_id, p.language, p.status,
            p.created_at, p.updated_at,
            (p.status = 'published' AND ${writtenForSql('p.author_id', '$2::uuid')}) AS visible
       FROM library_posts p LEFT JOIN users u ON u.id = p.author_id WHERE p.id = $1`,
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
      ...base('library_post', p.id, ctx.now),
      author: p.username ? { id: p.author_id, username: p.username } : null,
      // a gotin has no title; null here, never the string "null"
      title: p.title,
      text: p.body,
      createdAt: iso(p.created_at),
      editedAt: editedAt(p.created_at, p.updated_at),
      status: p.status,
      mediaKeys: p.audio_media_id ? [p.audio_media_id] : [],
      extra: { postType: p.type, language: p.language },
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
 * The reported message with the ones before and after it, in order. `scope` is
 * the SQL that picks the conversation (a literal from this file, never input);
 * its parameters come first, then the message's id. The message's own time is
 * read in SQL rather than passed in: a JavaScript Date drops the microseconds
 * Postgres keeps, and the message would then count as "after" itself.
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
  const r = await db.query<{ id: string; group_id: string; sender_id: string; created_at: Date; name: string; privacy: string; deleted_at: Date | null }>(
    `SELECT m.id, m.group_id, m.sender_id, m.created_at, g.name, g.privacy, m.deleted_at
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
      group: { id: m.group_id, name: m.name, privacy: m.privacy },
      context: rows.map((x) => toEvidenceMessage(x, m.id)),
      extra: { kind: reported?.kind ?? 'text' },
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
 * Teach the report endpoint how a game's seats map to people. Seats are the
 * order the game shows its players in; the mapping is done here, on the server,
 * so a client reports "seat 2" and never needs anyone's account id.
 */
export function registerGameSeats(game: ReportableGame, reader: GameSeatsReader): void {
  gameSeatReaders.set(game, reader);
}

export function hasGameSeats(game: string): boolean {
  return gameSeatReaders.has(game);
}

/**
 * Wordle Battle and Rhyme Match seats. The shared lobby rules (built on another
 * branch, migration 1751000149000) give their players a real `seat` column,
 * filled in join order and never reused, and that is what their views show;
 * until it exists here, a seat is the place in join order — the same numbers
 * the column starts from.
 */
function battleSeats(gameTable: string, playerTable: string, fk: string): GameSeatsReader {
  return async (db, gameId) => {
    const g = await db.query<{ status: string }>(`SELECT status FROM ${gameTable} WHERE id = $1`, [gameId]);
    if (!g.rows[0]) return null;
    const col = await db.query<{ ok: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM pg_attribute
                       WHERE attrelid = to_regclass($1) AND attname = 'seat' AND NOT attisdropped) AS ok`,
      [playerTable],
    );
    const seat = col.rows[0]?.ok ? 'seat' : 'row_number() OVER (ORDER BY joined_at, user_id)';
    const p = await db.query<{ seat: number; user_id: string }>(
      `SELECT ${seat} AS seat, user_id FROM ${playerTable} WHERE ${fk} = $1 ORDER BY 1`,
      [gameId],
    );
    return { status: g.rows[0].status, players: p.rows.map((r) => ({ seat: Number(r.seat), userId: r.user_id })) };
  };
}

registerGameSeats('wordle-battle', battleSeats('wordle_battles', 'wordle_battle_players', 'battle_id'));
registerGameSeats('rhyme-match', battleSeats('rhyme_matches', 'rhyme_match_players', 'match_id'));

/**
 * Stories keeps real seats (`story_game_players.seat`, never reused within a
 * game), so they are read as they are. Its tables arrive with the Stories
 * engine (migration 1751000147000), which is built on another branch: until
 * they exist here, a Stories game is "not found", and once they do this reader
 * works with no further change. A player who left or was removed keeps their
 * seat: what they did before leaving is still reportable.
 */
registerGameSeats('stories', async (db, gameId) => {
  const exists = await db.query<{ ok: boolean }>(`SELECT to_regclass('story_game_players') IS NOT NULL AS ok`);
  if (!exists.rows[0]?.ok) return null;
  const g = await db.query<{ status: string }>(`SELECT status FROM story_games WHERE id = $1`, [gameId]);
  if (!g.rows[0]) return null;
  const p = await db.query<{ seat: number; user_id: string }>(
    `SELECT seat, user_id FROM story_game_players WHERE game_id = $1 ORDER BY seat`,
    [gameId],
  );
  return { status: g.rows[0].status, players: p.rows.map((r) => ({ seat: Number(r.seat), userId: r.user_id })) };
});

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
};

/** Snapshot a report's target, or say why it cannot be reported. */
export function resolveTarget(db: Executor, targetType: ReportTargetType, targetId: string, ctx: ResolveContext): Promise<ResolveResult> {
  return RESOLVERS[targetType](db, targetId, ctx);
}

/** Parse a stored game-player target id back into its parts. */
export function parseGamePlayerTarget(stored: string): { game: string; gameId: string; seat: number } | null {
  const parts = stored.split(':');
  if (parts.length !== 3) return null;
  const seat = Number(parts[2]);
  if (!Number.isInteger(seat) || seat < 1) return null;
  return { game: parts[0]!, gameId: parts[1]!, seat };
}
