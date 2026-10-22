import type pg from 'pg';
import {
  LOBBY_IDLE_MINUTES,
  MAX_HOSTED_GAMES,
  limitDetails,
  type GameAccess,
  type InviteSummary,
  type LobbyCard,
  type LobbyCardStatus,
} from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { lockPersonFor } from '../limits/limits.js';
import type { PublicUrl } from '../cosmetics/access.js';
import { canJoin, identities } from './access.js';
import type { LobbyFacts, LobbyPhase } from './types.js';

type Executor = Pick<pg.Pool, 'query'>;

/**
 * Peyvok Battle and Rhyme Match keep their lobbies the same way — a game row,
 * a row per player — so the lobby rules they share (who may join, seats,
 * names, idle lobbies, what a chat card says) live here once, over either
 * pair of tables.
 */
export interface BattleTables {
  game: 'wordle-battle' | 'rhyme-match';
  table: 'wordle_battles' | 'rhyme_matches';
  players: 'wordle_battle_players' | 'rhyme_match_players';
  /** the player table's column that points at the game */
  fk: 'battle_id' | 'match_id';
}

export const WORDLE_BATTLES: BattleTables = {
  game: 'wordle-battle',
  table: 'wordle_battles',
  players: 'wordle_battle_players',
  fk: 'battle_id',
};

export const RHYME_MATCHES: BattleTables = {
  game: 'rhyme-match',
  table: 'rhyme_matches',
  players: 'rhyme_match_players',
  fk: 'match_id',
};

export type BattleStatus = 'lobby' | 'active' | 'finished' | 'cancelled';

/** The lobby columns both game tables have. */
export interface LobbyRow {
  id: string;
  created_by: string;
  status: BattleStatus;
  access: GameAccess;
  chat_group_id: string | null;
  max_players: number;
  next_lobby_id: string | null;
  rematch_of: string | null;
  updated_at: Date;
}

/** A player's place in a game: their seat, and whether they left or were removed. */
export interface SeatRow {
  user_id: string;
  seat: number;
  left_at: Date | null;
  removed: boolean;
}

/** A lobby nobody started for LOBBY_IDLE_MINUTES is closed. */
export function lobbyIdle(row: Pick<LobbyRow, 'status' | 'updated_at'>, now: Date): boolean {
  return row.status === 'lobby' && now.getTime() - row.updated_at.getTime() >= LOBBY_IDLE_MINUTES * 60_000;
}

/**
 * A game under way that has not been touched for this long is not held
 * against its host's limit: every game ends long before it, and one left
 * hanging by a failed sweep must not stop its host from playing.
 */
const HOSTED_ACTIVE_MINUTES = 120;

/**
 * Room for one more game hosted by `hostId`, inside the transaction that
 * makes it: at most MAX_HOSTED_GAMES lobbies and games under way of this kind
 * that the host is still in, as Stories has always kept (story-games
 * `insertGame`). A new one beyond that closes the host's oldest lobby nobody
 * has started, and is refused (409 TOO_MANY_GAMES) only when every one of
 * them is being played. A lobby gone idle, which the sweep is about to close,
 * does not count.
 *
 * Under the host's lock for this game, taken before the closed lobby's row,
 * so two lobbies made at once cannot both find room. Returns the lobby it
 * closed, for the caller to announce once the transaction has committed.
 */
export async function makeRoomToHost(executor: Executor, t: BattleTables, hostId: string, now: Date): Promise<string | null> {
  await lockPersonFor(executor, `hosting:${t.game}`, hostId);
  const hosted = await executor.query<{ id: string; status: BattleStatus }>(
    `SELECT g.id, g.status FROM ${t.table} g
      WHERE g.created_by = $1 AND g.finished_at IS NULL
        AND ((g.status = 'lobby' AND g.updated_at > $2::timestamptz - ($3 || ' minutes')::interval)
          OR (g.status = 'active' AND g.updated_at > $2::timestamptz - ($4 || ' minutes')::interval))
        AND EXISTS (SELECT 1 FROM ${t.players} p WHERE p.${t.fk} = g.id AND p.user_id = $1 AND p.left_at IS NULL AND NOT p.removed)
      ORDER BY g.created_at`,
    [hostId, now, String(LOBBY_IDLE_MINUTES), String(HOSTED_ACTIVE_MINUTES)],
  );
  if (hosted.rows.length < MAX_HOSTED_GAMES) return null;
  const oldest = hosted.rows.find((g) => g.status === 'lobby');
  if (!oldest) throw new AppError('TOO_MANY_GAMES', 409, 'finish one of your games first', limitDetails('hosted_games'));
  const closed = await executor.query<{ id: string }>(
    `UPDATE ${t.table} SET status = 'cancelled', finished_at = $2, updated_at = $2 WHERE id = $1 AND status = 'lobby' RETURNING id`,
    [oldest.id, now],
  );
  return closed.rows[0]?.id ?? null;
}

/** Everyone the host has not removed, by seat — still there or gone. */
export function inGame(seats: readonly SeatRow[]): SeatRow[] {
  return seats.filter((s) => !s.removed);
}

/** Everyone in the game right now: not removed, not gone. */
export function present(seats: readonly SeatRow[]): SeatRow[] {
  return seats.filter((s) => !s.removed && s.left_at === null);
}

/**
 * The only id another player is ever given for someone. Installed phone
 * builds key their rows by `userId` and compare it with their own, so the
 * field stays — holding the viewer's own id, and `seat:N` for everyone else.
 */
export function seatId(seat: number): string {
  return `seat:${seat}`;
}

export async function seatsOf(executor: Executor, t: BattleTables, id: string): Promise<SeatRow[]> {
  const res = await executor.query<SeatRow>(
    `SELECT user_id, seat, left_at, removed FROM ${t.players} WHERE ${t.fk} = $1 ORDER BY seat`,
    [id],
  );
  return res.rows;
}

/**
 * The seat a new player takes: the one after every seat the game has ever
 * handed out. Not after the seats still on record — leaving a lobby deletes
 * the row, and the next joiner would sit in the seat just left, so a host's
 * "remove seat 3" from a screen a moment old would take out somebody else.
 * Call it under the game row's lock (the join's FOR UPDATE).
 */
export async function takeSeat(executor: Executor, t: BattleTables, id: string): Promise<number> {
  const res = await executor.query<{ seat: number }>(
    `UPDATE ${t.table} SET seats_issued = seats_issued + 1 WHERE id = $1 RETURNING seats_issued AS seat`,
    [id],
  );
  return res.rows[0]!.seat;
}

/** The join rule (play/access.ts) for this game as it stands. */
export async function mayJoin(executor: Executor, row: LobbyRow, seats: readonly SeatRow[], userId: string): Promise<boolean> {
  return canJoin(executor, {
    joinerId: userId,
    hostId: row.created_by,
    access: row.access,
    memberIds: inGame(seats).map((s) => s.user_id),
    chatGroupId: row.chat_group_id,
    removed: seats.some((s) => s.user_id === userId && s.removed),
  });
}

/** A player as another player sees them (the identity rule). */
export interface SeatPlayer {
  seat: number;
  /** the viewer's own id on their own entry; `seat:N` on everyone else's */
  userId: string;
  /** null unless the viewer may see it: shown as "Player N" */
  name: string | null;
  avatarUrl: string | null;
  isMe: boolean;
  isHost: boolean;
  /** left the game after it started; stays listed so seats do not move */
  gone: boolean;
}

/**
 * The players, by seat, as `viewerId` may see them. The viewer's own name is
 * left for the client, which has it.
 */
export async function seatPlayers(
  executor: Executor,
  row: LobbyRow,
  seats: readonly SeatRow[],
  viewerId: string,
  publicUrl: PublicUrl,
): Promise<SeatPlayer[]> {
  const listed = inGame(seats);
  const shown = await identities(
    executor,
    viewerId,
    listed.map((s) => s.user_id),
    row.access,
    publicUrl,
  );
  return listed.map((s) => {
    const isMe = s.user_id === viewerId;
    const who = isMe ? undefined : shown.get(s.user_id);
    return {
      seat: s.seat,
      userId: isMe ? s.user_id : seatId(s.seat),
      name: who?.name ?? null,
      avatarUrl: who?.avatarUrl ?? null,
      isMe,
      isHost: s.user_id === row.created_by,
      gone: s.left_at !== null,
    };
  });
}

/** The host as a viewer may refer to them: their own id if it is them, else the host's seat. */
export function hostRef(row: LobbyRow, seats: readonly SeatRow[], viewerId: string): string {
  if (row.created_by === viewerId) return viewerId;
  const host = seats.find((s) => s.user_id === row.created_by);
  return host ? seatId(host.seat) : seatId(0);
}

function phaseOf(row: LobbyRow, now: Date): LobbyPhase {
  if (row.status === 'cancelled' || lobbyIdle(row, now)) return 'cancelled';
  if (row.status === 'lobby') return 'lobby';
  if (row.status === 'active') return 'started';
  return 'finished';
}

/** The play layer's view of one of these games (play/types.ts). */
export function factsOf(t: BattleTables, row: LobbyRow, seats: readonly SeatRow[], now: Date): LobbyFacts {
  const phase = phaseOf(row, now);
  const members = inGame(seats);
  return {
    game: t.game,
    lobbyId: row.id,
    hostId: row.created_by,
    phase,
    joinable: phase === 'lobby',
    access: row.access,
    chatGroupId: row.chat_group_id,
    maxPlayers: row.max_players,
    memberIds: members.map((s) => s.user_id),
    activeIds: present(seats).map((s) => s.user_id),
    removedIds: seats.filter((s) => s.removed).map((s) => s.user_id),
    nextLobbyId: row.next_lobby_id,
    rematchOf: row.rematch_of,
    rematchKind: members.length > 2 ? 'round' : 'pair',
  };
}

export async function loadFacts(executor: Executor, t: BattleTables, id: string, now: Date): Promise<LobbyFacts | null> {
  const res = await executor.query<LobbyRow>(`SELECT * FROM ${t.table} WHERE id = $1`, [id]);
  const row = res.rows[0];
  if (!row) return null;
  return factsOf(t, row, await seatsOf(executor, t, id), now);
}

/** What a viewer who may not see a lobby is told: the same as for one that does not exist. */
export function unavailableCard(game: LobbyCard['game'], lobbyId: string): LobbyCard {
  return { game, lobbyId, status: 'unavailable', players: 0, maxPlayers: 0, summary: {}, canJoin: false, isMember: false };
}

/**
 * A chat card for one of these games, as one viewer sees it: its live state to
 * members and to anyone the join rule lets in; 'unavailable' to everyone else
 * (contract §B3 `GET /play/cards`).
 */
export async function lobbyCard(
  executor: Executor,
  t: BattleTables,
  viewerId: string,
  lobbyId: string,
  summary: InviteSummary,
  now: Date,
): Promise<LobbyCard> {
  const res = await executor.query<LobbyRow>(`SELECT * FROM ${t.table} WHERE id = $1`, [lobbyId]);
  const row = res.rows[0];
  if (!row) return unavailableCard(t.game, lobbyId);
  const seats = await seatsOf(executor, t, lobbyId);
  const mine = seats.find((s) => s.user_id === viewerId);
  if (mine?.removed) return unavailableCard(t.game, lobbyId);
  const isMember = mine !== undefined;
  if (!isMember && !(await mayJoin(executor, row, seats, viewerId))) return unavailableCard(t.game, lobbyId);
  const facts = factsOf(t, row, seats, now);
  const players = facts.activeIds.length;
  let status: LobbyCardStatus;
  if (facts.phase === 'cancelled') status = 'cancelled';
  else if (facts.phase === 'finished') status = 'finished';
  else if (facts.phase === 'started') status = 'started';
  else status = players >= row.max_players ? 'full' : 'open';
  return {
    game: t.game,
    lobbyId,
    status,
    players,
    maxPlayers: row.max_players,
    summary,
    canJoin: !isMember && status === 'open',
    isMember,
  };
}

/**
 * Closes lobbies nobody started for LOBBY_IDLE_MINUTES (`finished_at` too, so
 * nothing that counts open games — the social rail's "playing now" — counts
 * them). Returns the ones it closed.
 */
export async function cancelIdleLobbies(executor: Executor, t: BattleTables, now: Date): Promise<string[]> {
  const res = await executor.query<{ id: string }>(
    `UPDATE ${t.table} SET status = 'cancelled', finished_at = $1, updated_at = $1
      WHERE status = 'lobby' AND updated_at <= $1::timestamptz - ($2 || ' minutes')::interval
      RETURNING id`,
    [now, String(LOBBY_IDLE_MINUTES)],
  );
  return res.rows.map((r) => r.id);
}

/** Wins between two players over a run of rematches, from each game's winners. */
export function tallySeries(
  games: ReadonlyArray<{ winners: readonly string[]; players: readonly string[] }>,
  me: string,
  other: string,
): { me: number; other: number; draws: number } {
  const tally = { me: 0, other: 0, draws: 0 };
  for (const g of games) {
    // only games the two of them played together count
    if (!g.players.includes(me) || !g.players.includes(other)) continue;
    const mine = g.winners.includes(me);
    const theirs = g.winners.includes(other);
    if (mine && !theirs) tally.me++;
    else if (theirs && !mine) tally.other++;
    else tally.draws++;
  }
  return tally;
}

/**
 * The games of a run of rematches ending in `id`, newest first: each one's
 * `rematch_of` back to where it began (at most 100 games back).
 */
export async function rematchChain(executor: Executor, t: BattleTables, id: string): Promise<string[]> {
  const res = await executor.query<{ id: string }>(
    `WITH RECURSIVE chain(id, rematch_of, depth) AS (
       SELECT id, rematch_of, 1 FROM ${t.table} WHERE id = $1
       UNION ALL
       SELECT g.id, g.rematch_of, c.depth + 1 FROM ${t.table} g JOIN chain c ON g.id = c.rematch_of
        WHERE c.depth < 100
     )
     SELECT id FROM chain ORDER BY depth`,
    [id],
  );
  return res.rows.map((r) => r.id);
}
