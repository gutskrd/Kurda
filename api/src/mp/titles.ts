import { MULTI_GAMES, type MultiGame } from '@kurda/shared';

/**
 * Each multiplayer learning game's name in English, for the places the server
 * writes one itself: an inbox entry's fallback text, the profile's list of
 * games played and the social rail's "playing now". The apps name games from
 * their own catalogues.
 */
export const MULTI_GAME_TITLES: Readonly<Record<MultiGame, string>> = {
  'last-letter': 'The Last Letter',
  impostor: 'Kurdish Impostor',
  'who-am-i': 'Who Am I?',
};

/** SQL naming the game in `column` (a `game_lobbies.game`) by its title. Literals only: never built from input. */
export function multiTitleSql(column: string): string {
  const cases = Object.entries(MULTI_GAME_TITLES).map(([game, title]) => `WHEN '${game}' THEN '${title.replace(/'/g, "''")}'`);
  return `(CASE ${column} ${cases.join(' ')} ELSE ${column} END)`;
}

/**
 * `<column> IN (…)` naming the games the engine runs, for a query that reads
 * stored lobbies. Don't Say the Word! and Kurdish Bluff are no longer part of
 * Hevalo, and the lobbies played while they were stay in the database: with
 * this in its WHERE, such a lobby is not there for anything that plays, shows
 * or walks games, so no request and no timer ever looks for a module that
 * does not exist. Literals from the one list, never built from input.
 */
export function playedGamesSql(column: string): string {
  return `${column} IN (${MULTI_GAMES.map((g) => `'${g}'`).join(', ')})`;
}
