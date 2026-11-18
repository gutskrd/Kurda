import { GAME_NAMES, MULTI_GAMES, type MultiGame } from '@kurda/shared';

/**
 * Each multiplayer game's name for text the server writes itself (inbox fallback text, the profile's games played, the
 * social rail's "playing now"). Names are Kurmancî and the same for every reader (shared: games/names.ts); the apps
 * name games from their own catalogues.
 */
export const MULTI_GAME_TITLES: Readonly<Record<MultiGame, string>> = {
  'last-letter': GAME_NAMES['last-letter'],
  impostor: GAME_NAMES.impostor,
  'who-am-i': GAME_NAMES['who-am-i'],
};

/** SQL naming the game in `column` (a `game_lobbies.game`) by its title. Literals only: never built from input. */
export function multiTitleSql(column: string): string {
  const cases = Object.entries(MULTI_GAME_TITLES).map(([game, title]) => `WHEN '${game}' THEN '${title.replace(/'/g, "''")}'`);
  return `(CASE ${column} ${cases.join(' ')} ELSE ${column} END)`;
}

/**
 * `<column> IN (…)` naming the games the engine runs, for queries over stored lobbies. Lobbies of retired games (Don't
 * Say the Word!, Kurdish Bluff) stay in the database; this keeps them out of anything that plays, shows or walks games,
 * so nothing looks for a missing module. Literals from the one list, never built from input.
 */
export function playedGamesSql(column: string): string {
  return `${column} IN (${MULTI_GAMES.map((g) => `'${g}'`).join(', ')})`;
}
