/**
 * What each game is called: one Kurmancî name, never translated ("Peyvok", "Xapînok", "Ez kî me?"), shown in every
 * interface language with its meaning beside it (catalogues' `games.*.meaning`); only the Soranî interface names games in
 * its own variety. Here for whatever names a game without a catalogue: the server's own texts, invitation link cards and
 * the admin. The apps' catalogues carry the same names, and their tests hold them to this list.
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
