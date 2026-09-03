/**
 * Seed a baseline Kurmancî word pool so the word games are playable out of the
 * box (KUR-303/304/306/299). Wordle and Rhyme draw their targets + validate
 * guesses from `dict_entries`; an empty table yields EMPTY_POOL / EMPTY_LEXICON.
 *
 * Words are real Kurmancî (Hawar) headwords, chosen to cover the game difficulty
 * bands by *letter* length (easy = 4, medium = 5, hard = 6/7/8), with some 3s for
 * richer guess validation. `headword_normalized` is computed with the games'
 * normalizer (lowercase + NFC, keeping ç ê î ş û as single letters) so a guess of
 * the word validates — matching normalizeWord() in api/src/game/wordle.ts.
 *
 * Idempotent: each word is inserted only if its normalized form isn't already
 * present, so this never duplicates or clobbers a richer dictionary import.
 */

/** Matches normalizeWord() in the game engine (diacritic-keeping). */
function normalize(word) {
  return word.toLowerCase().normalize('NFC').replace(/[^\p{L}]/gu, '');
}

// grouped by letter length only for readability; the games bucket by length
const WORDS = [
  // 3 letters — extra guess coverage
  'roj', 'mal', 'nan', 'bav', 'dar', 'gul', 'dil', 'şev', 'sor', 'reş', 'sar', 'çem', 'keç', 'zêr', 'kal', 'war', 'gav',
  // 4 letters — easy
  'gund', 'dost', 'kurd', 'mala', 'çiya', 'dara', 'gula', 'ronî', 'masî', 'kanî', 'deng', 'reng', 'berf', 'êvar',
  'sibe', 'heft', 'pênc', 'kesk', 'xanî', 'peyv', 'bira', 'derî', 'agir', 'navê', 'çend',
  // 5 letters — medium
  'heval', 'welat', 'ziman', 'bajar', 'keçik', 'mezin', 'hesin', 'kevir', 'baran', 'bahar', 'dayik', 'zarok',
  'azadî', 'jiyan', 'stran', 'mirov', 'çîrok', 'gulan', 'huner', 'kewan', 'qelem', 'roman',
  // 6 letters — hard
  'pirtûk', 'newroz', 'govend', 'welatî', 'biratî', 'soranî', 'defter', 'heywan',
  // 7 letters — hard
  'mamoste', 'xwendin', 'helbest', 'pencere',
  // 8 letters — hard
  'kurmancî', 'zimannas', 'stranbêj',
];

export const up = (pgm) => {
  const rows = [...new Set(WORDS.map((w) => w.trim()).filter(Boolean))].map((w) => {
    const hw = w.replace(/'/g, "''");
    const norm = normalize(w).replace(/'/g, "''");
    return `('${hw}', '${norm}', 'kurmanji')`;
  });
  pgm.sql(
    `INSERT INTO dict_entries (headword, headword_normalized, dialect)
     SELECT v.hw, v.norm, v.dia
     FROM (VALUES ${rows.join(',\n            ')}) AS v(hw, norm, dia)
     WHERE NOT EXISTS (
       SELECT 1 FROM dict_entries d WHERE d.headword_normalized = v.norm
     );`,
  );
};

export const down = (pgm) => {
  // remove only the exact words this seed added (safe to re-run up afterwards)
  const norms = [...new Set(WORDS.map((w) => normalize(w)))].filter(Boolean).map((n) => `'${n.replace(/'/g, "''")}'`);
  pgm.sql(
    `DELETE FROM dict_entries
      WHERE dialect = 'kurmanji' AND headword_normalized IN (${norms.join(', ')});`,
  );
};
