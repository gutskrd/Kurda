import type { MultiGame } from '@kurda/shared';

/**
 * Each multiplayer learning game's name in English, for the places the server
 * writes one itself: an inbox entry's fallback text, the profile's list of
 * games played and the social rail's "playing now". The apps name games from
 * their own catalogues.
 */
export const MULTI_GAME_TITLES: Readonly<Record<MultiGame, string>> = {
  'last-letter': 'The Last Letter',
};

/** SQL naming the game in `column` (a `game_lobbies.game`) by its title. Literals only: never built from input. */
export function multiTitleSql(column: string): string {
  const cases = Object.entries(MULTI_GAME_TITLES).map(([game, title]) => `WHEN '${game}' THEN '${title.replace(/'/g, "''")}'`);
  return `(CASE ${column} ${cases.join(' ')} ELSE ${column} END)`;
}
