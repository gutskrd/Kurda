/**
 * What each game is called.
 *
 * A game has one name, and it is Kurmancî: "Peyvok" was never translated,
 * and neither is "Xapînok" or "Ez kî me?". The apps show that name in every
 * language they speak and put what it means beside it in the reader's own
 * (their catalogues' `games.*.meaning`); only the Soranî interface, which is
 * Kurdish already, names the games in its own variety.
 *
 * The names are here, once, for whatever has to name a game without a
 * catalogue to ask: the server's own words about a game (an inbox entry's
 * fallback text, the list of games someone played), the card a link to an
 * invitation unfurls into, and the admin panel. The apps' catalogues carry
 * the same names, and their tests hold them to this list.
 */
export const GAME_NAMES = {
  peyvok: 'Peyvok',
  'wordle-battle': 'Pêşbaziya Peyvan',
  rhyme: 'Peyvên Hevserwa',
  'rhyme-match': 'Pêşbaziya Serwayan',
  race: 'Pêşbaziya Nivîsandinê',
  'memory-thief': 'Dizê Bîrê',
  detective: 'Detektîf',
  'last-letter': 'Tîpa Dawî',
  impostor: 'Xapînok',
  'who-am-i': 'Ez kî me?',
} as const;

export type NamedGame = keyof typeof GAME_NAMES;
