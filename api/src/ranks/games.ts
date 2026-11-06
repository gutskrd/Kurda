import { MULTI_GAMES, type FriendlyReason, type MultiGame, type RankedGame, type RatedState } from '@kurda/shared';
import type { Executor } from './store.js';

/**
 * Where each ranked game keeps its lobbies, for the few reads Game Ranks makes
 * of them itself (who is in a lobby, by seat, for the expected gains; whether
 * a finished game was rated). Literals only: never built from input.
 */
interface GameTables {
  table: string;
  players: string;
  fk: string;
  host: string;
}

/** Every multiplayer learning game keeps its lobbies in the one pair of tables the generic engine runs on (api/src/mp). */
const MULTI_TABLES: GameTables = { table: 'game_lobbies', players: 'game_lobby_players', fk: 'lobby_id', host: 'host_id' };

export const RANKED_TABLES: Readonly<Record<RankedGame, GameTables>> = {
  'wordle-battle': { table: 'wordle_battles', players: 'wordle_battle_players', fk: 'battle_id', host: 'created_by' },
  'rhyme-match': { table: 'rhyme_matches', players: 'rhyme_match_players', fk: 'match_id', host: 'created_by' },
  stories: { table: 'story_games', players: 'story_game_players', fk: 'game_id', host: 'host_id' },
  ...(Object.fromEntries(MULTI_GAMES.map((g) => [g, MULTI_TABLES])) as Record<MultiGame, GameTables>),
};

/** A game whose lobbies live in the generic engine's tables, where a game against Hevalo is `mode = 'solo'`. */
function isMulti(game: RankedGame): boolean {
  return (MULTI_GAMES as readonly string[]).includes(game);
}

/**
 * A ranked game's tables. The name is checked against the map itself, not only
 * where a route reads it, so nothing but these literals can reach the SQL that
 * names them.
 */
export function tablesOf(game: RankedGame): GameTables {
  if (!Object.hasOwn(RANKED_TABLES, game)) throw new Error('not a ranked game');
  return RANKED_TABLES[game];
}

/** What a game row says about Rated/Friendly: the host's choice, and what the start decided. */
export interface RatedColumns {
  rated: boolean;
  rated_state: string | null;
}

/** `rated_state` values that mean the game counts ('damped': with less weight). */
export const COUNTING_STATES: readonly string[] = ['rated', 'damped'];

/** The Rated/Friendly badge of a game, from its row (shared `RatedState`). */
export function ratedStateOf(row: RatedColumns): RatedState {
  const decided = row.rated_state;
  const counts = decided === null ? null : COUNTING_STATES.includes(decided);
  return {
    rated: row.rated,
    counts,
    friendlyReason: decided === null || counts ? null : (decided as FriendlyReason),
    damped: decided === 'damped',
  };
}

export interface LobbySeat {
  userId: string;
  seat: number;
}

export interface LobbyView {
  rated: boolean;
  ratedState: string | null;
  /** solo Stories has nobody to rank against */
  solo: boolean;
  /** everyone in it now (not removed, not gone), by seat */
  seats: LobbySeat[];
}

/** A lobby as Game Ranks needs it, or null when there is none. */
export async function loadLobby(db: Executor, game: RankedGame, id: string): Promise<LobbyView | null> {
  const t = tablesOf(game);
  const row = await db.query<{ rated: boolean; rated_state: string | null; solo: boolean }>(
    `SELECT rated, rated_state, ${game === 'stories' || isMulti(game) ? `mode = 'solo'` : 'false'} AS solo FROM ${t.table} WHERE id = $1`,
    [id],
  );
  const g = row.rows[0];
  if (!g) return null;
  const seats = await db.query<{ user_id: string; seat: number }>(
    // people only: a computer seat (Hevalo) has no rating
    `SELECT user_id, seat FROM ${t.players} WHERE ${t.fk} = $1 AND NOT removed AND left_at IS NULL AND user_id IS NOT NULL ORDER BY seat`,
    [id],
  );
  return {
    rated: g.rated,
    ratedState: g.rated_state,
    solo: g.solo,
    seats: seats.rows.map((r) => ({ userId: r.user_id, seat: r.seat })),
  };
}

/** Whether `userId` is (or was) in this game and not removed by the host. */
export async function isInGame(db: Executor, game: RankedGame, id: string, userId: string): Promise<boolean> {
  const t = tablesOf(game);
  const r = await db.query(`SELECT 1 FROM ${t.players} WHERE ${t.fk} = $1 AND user_id = $2 AND NOT removed`, [id, userId]);
  return (r.rowCount ?? 0) > 0;
}
