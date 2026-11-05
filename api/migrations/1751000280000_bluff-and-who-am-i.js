/**
 * Kurdish Bluff and the Who Am I? race join the multiplayer learning games
 * (api/src/mp), and Who Am I? gets its first question templates, as drafts.
 *
 * - The lists of games the database keeps take the two new ones: the
 *   generic lobbies' own (`game_lobbies.game`), and every list migration
 *   multiplayer-learning-games widened for the play layer — invites, rematch
 *   offers, the chats' game cards and the Game Ranks tables. Each list is
 *   written out whole, with the party games built beside these on the same
 *   engine (Kurdish Impostor, Don't Say the Word!) included, so whichever of
 *   their migrations runs last leaves every game in. As before, the wider
 *   checks are added NOT VALID: every row already there passes them, and
 *   nothing is scanned while this runs.
 * - Who Am I? asks yes/no questions from approved `question_template` rows.
 *   A small set per variety is seeded here as drafts written for the app
 *   (`source = 'starter'`, unreviewed), one per fact an identity's table can
 *   answer, with what each means in the interface languages. They are never
 *   shown to a learner until a native speaker has approved and published them;
 *   each carries, as its review note, what the reviewer should look at first.
 *   Seeded once, here: one an editor deletes stays deleted.
 */

/** Every game that has lobbies (shared PLAY_GAMES; a test compares the two). */
const PLAY_GAMES = ['wordle-battle', 'rhyme-match', 'stories', 'last-letter', 'impostor', 'dont-say', 'bluff', 'who-am-i'];
/** The games the generic engine runs (shared MULTI_GAMES). */
const MULTI_GAMES = ['last-letter', 'impostor', 'dont-say', 'bluff', 'who-am-i'];
/** This migration's own, taken out again on the way down. */
const MINE = ['bluff', 'who-am-i'];

const list = (games) => `(${games.map((g) => `'${g}'`).join(',')})`;
const without = (games) => games.filter((g) => !MINE.includes(g));

/** The tables whose `game` column is checked against the list, with the check's name. */
const GAME_CHECKS = [
  ['play_invites', 'play_invites_game_check'],
  ['play_rematches', 'play_rematches_game_check'],
  ['game_ratings', 'game_ratings_game_check'],
  ['rated_games', 'rated_games_game_check'],
  ['rating_events', 'rating_events_game_check'],
  ['rated_leaves', 'rated_leaves_game_check'],
  ['rank_preferences', 'rank_preferences_game_check'],
  ['rating_pair_signals', 'rating_pair_signals_game_check'],
  ['rank_season_results', 'rank_season_results_game_check'],
];

const kindCheck = (games) => `(kind = 'text' AND body IS NOT NULL)
           OR (kind = 'gift' AND gift_batch_id IS NOT NULL)
           OR (kind = 'game' AND game IN ${list(games)} AND game_lobby_id IS NOT NULL)`;

/** What each question means, in the interface languages that are not Kurdish (the Kurdish is the row's own). */
const MEANINGS = {
  alive: { en: 'Is it alive?', de: 'Lebt es?', nl: 'Leeft het?', fr: 'Est-ce vivant ?', es: '¿Está vivo?', tr: 'Canlı mı?', ar: 'هل هو حيّ؟' },
  animal: { en: 'Is it an animal?', de: 'Ist es ein Tier?', nl: 'Is het een dier?', fr: 'Est-ce un animal ?', es: '¿Es un animal?', tr: 'Bir hayvan mı?', ar: 'هل هو حيوان؟' },
  person: { en: 'Is it a person?', de: 'Ist es ein Mensch?', nl: 'Is het een persoon?', fr: 'Est-ce une personne ?', es: '¿Es una persona?', tr: 'Bir insan mı?', ar: 'هل هو إنسان؟' },
  edible: { en: 'Do people eat it?', de: 'Isst man es?', nl: 'Eet je het?', fr: 'Est-ce que ça se mange ?', es: '¿Se come?', tr: 'Yenir mi?', ar: 'هل يؤكل؟' },
  place: { en: 'Is it a place?', de: 'Ist es ein Ort?', nl: 'Is het een plek?', fr: 'Est-ce un lieu ?', es: '¿Es un lugar?', tr: 'Bir yer mi?', ar: 'هل هو مكان؟' },
  'can-fly': { en: 'Can it fly?', de: 'Kann es fliegen?', nl: 'Kan het vliegen?', fr: 'Est-ce que ça vole ?', es: '¿Puede volar?', tr: 'Uçabilir mi?', ar: 'هل يستطيع الطيران؟' },
  'lives-in-water': {
    en: 'Does it live in water?',
    de: 'Lebt es im Wasser?',
    nl: 'Leeft het in het water?',
    fr: 'Est-ce que ça vit dans l’eau ?',
    es: '¿Vive en el agua?',
    tr: 'Suda mı yaşar?',
    ar: 'هل يعيش في الماء؟',
  },
  'four-legs': {
    en: 'Does it walk on four legs?',
    de: 'Läuft es auf vier Beinen?',
    nl: 'Loopt het op vier poten?',
    fr: 'Est-ce que ça marche à quatre pattes ?',
    es: '¿Camina a cuatro patas?',
    tr: 'Dört ayak üstünde mi yürür?',
    ar: 'هل يمشي على أربع؟',
  },
  'bigger-than-person': {
    en: 'Is it bigger than a person?',
    de: 'Ist es größer als ein Mensch?',
    nl: 'Is het groter dan een mens?',
    fr: 'Est-ce plus grand qu’une personne ?',
    es: '¿Es más grande que una persona?',
    tr: 'Bir insandan büyük mü?',
    ar: 'هل هو أكبر من الإنسان؟',
  },
  'at-home': {
    en: 'Do you find it at home?',
    de: 'Findet man es zu Hause?',
    nl: 'Vind je het thuis?',
    fr: 'Est-ce qu’on le trouve à la maison ?',
    es: '¿Se encuentra en casa?',
    tr: 'Evde bulunur mu?',
    ar: 'هل يوجد في البيت؟',
  },
  sweet: { en: 'Is it sweet?', de: 'Ist es süß?', nl: 'Is het zoet?', fr: 'Est-ce sucré ?', es: '¿Es dulce?', tr: 'Tatlı mı?', ar: 'هل هو حلو؟' },
  'uses-electricity': {
    en: 'Does it run on electricity?',
    de: 'Läuft es mit Strom?',
    nl: 'Werkt het op stroom?',
    fr: 'Est-ce que ça marche à l’électricité ?',
    es: '¿Funciona con electricidad?',
    tr: 'Elektrikle mi çalışır?',
    ar: 'هل يعمل بالكهرباء؟',
  },
  'helps-sick': {
    en: 'Does it help sick people?',
    de: 'Hilft es kranken Menschen?',
    nl: 'Helpt het zieke mensen?',
    fr: 'Est-ce que ça aide les malades ?',
    es: '¿Ayuda a los enfermos?',
    tr: 'Hastalara yardım eder mi?',
    ar: 'هل يساعد المرضى؟',
  },
  'works-outdoors': {
    en: 'Does it work outdoors?',
    de: 'Arbeitet es draußen?',
    nl: 'Werkt het buiten?',
    fr: 'Est-ce que ça travaille dehors ?',
    es: '¿Trabaja al aire libre?',
    tr: 'Dışarıda mı çalışır?',
    ar: 'هل يعمل في الخارج؟',
  },
};

/**
 * The starter questions, one per fact and variety, each with what the
 * reviewer should look at first. Written for review, simple on purpose: the
 * plainest yes/no question a learner can read, in the words the lessons teach
 * where they teach them.
 */
const STARTERS = [
  ['kmr', 'alive', 'Ew zindî ye?', 'Zindî for “alive”; would sax read more naturally?'],
  ['kmr', 'animal', 'Ew heywanek e?', 'Heywan as the Road teaches it, with -ek; or ajal, or without -ek?'],
  ['kmr', 'person', 'Ew mirovek e?', 'Mirov with -ek for “a person” (a job someone does): is kes better here?'],
  ['kmr', 'edible', 'Ew tê xwarin?', 'The passive tê xwarin for “is it eaten”: natural, or mirov wê dixwe?'],
  ['kmr', 'place', 'Ew cihek e?', 'Cih with -ek for “a place”; or der?'],
  ['kmr', 'can-fly', 'Ew dikare bifire?', 'Dikare bifire for “can it fly”.'],
  ['kmr', 'lives-in-water', 'Ew di avê de dijî?', 'Di avê de for “in water”, with the oblique ending.'],
  ['kmr', 'four-legs', 'Ew li ser çar lingan dimeşe?', 'Li ser çar lingan for “on four legs”; or bi çar lingan?'],
  ['kmr', 'bigger-than-person', 'Ew ji mirovekî mezintir e?', 'Mirovekî after ji, and mezintir.'],
  ['kmr', 'at-home', 'Ew li malê tê dîtin?', 'The passive tê dîtin for “is it found”; or li malê heye?'],
  ['kmr', 'sweet', 'Ew şîrîn e?', 'Şîrîn for the taste: or tama wê şîrîn e?'],
  ['kmr', 'uses-electricity', 'Ew bi elektrîkê dixebite?', 'Elektrîk with -ê, and xebitîn for a machine that runs.'],
  ['kmr', 'helps-sick', 'Ew alîkariya nexweşan dike?', 'Alîkarî kirin with nexweşan.'],
  ['kmr', 'works-outdoors', 'Ew li derve dixebite?', 'Li derve as the Road teaches it, for work done outdoors.'],
  ['ckb', 'alive', 'ئایا زیندووە؟', 'Is ئایا wanted at the start of each question, or is it too formal for a game?'],
  ['ckb', 'animal', 'ئایا ئاژەڵە؟', 'ئاژەڵ for “animal”; ئاژەڵێکە with -ێک?'],
  ['ckb', 'person', 'ئایا مرۆڤە؟', 'مرۆڤ for “a person”; or کەسێکە?'],
  ['ckb', 'edible', 'ئایا دەخورێت؟', 'The passive دەخورێت for “is it eaten”.'],
  ['ckb', 'place', 'ئایا شوێنێکە؟', 'شوێن with -ێک for “a place”.'],
  ['ckb', 'can-fly', 'ئایا دەتوانێت بفڕێت؟', 'دەتوانێت بفڕێت for “can it fly”.'],
  ['ckb', 'lives-in-water', 'ئایا لە ئاودا دەژی؟', 'لە ئاودا for “in water”.'],
  ['ckb', 'four-legs', 'ئایا بە چوار پێ دەڕوات؟', 'بە چوار پێ for “on four legs”, and دەڕوات for walking: is دەڕوات right for an animal?'],
  ['ckb', 'bigger-than-person', 'ئایا لە مرۆڤ گەورەترە؟', 'لە مرۆڤ گەورەترە for “bigger than a person”.'],
  ['ckb', 'at-home', 'ئایا لە ماڵدا دەبینرێت؟', 'The passive دەبینرێت for “is it found”; or لە ماڵەوە هەیە؟'],
  ['ckb', 'sweet', 'ئایا شیرینە؟', 'شیرین for the taste.'],
  ['ckb', 'uses-electricity', 'ئایا بە کارەبا کار دەکات؟', 'کارەبا for “electricity”, and کار دەکات for a machine that runs.'],
  ['ckb', 'helps-sick', 'ئایا یارمەتیی نەخۆش دەدات؟', 'یارمەتیی نەخۆش دەدات; or یارمەتیی نەخۆشەکان?'],
  ['ckb', 'works-outdoors', 'ئایا لە دەرەوە کار دەکات؟', 'لە دەرەوە for “outdoors”.'],
];

export const up = (pgm) => {
  pgm.sql(`ALTER TABLE game_lobbies DROP CONSTRAINT IF EXISTS game_lobbies_game_check`);
  pgm.sql(`ALTER TABLE game_lobbies ADD CONSTRAINT game_lobbies_game_check CHECK (game IN ${list(MULTI_GAMES)}) NOT VALID`);
  for (const [table, name] of GAME_CHECKS) {
    pgm.sql(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${name}`);
    pgm.sql(`ALTER TABLE ${table} ADD CONSTRAINT ${name} CHECK (game IN ${list(PLAY_GAMES)}) NOT VALID`);
  }
  for (const table of ['dm_messages', 'group_messages']) {
    pgm.sql(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${table}_kind_check`);
    pgm.sql(`ALTER TABLE ${table} ADD CONSTRAINT ${table}_kind_check CHECK (${kindCheck(PLAY_GAMES)}) NOT VALID`);
  }

  const rows = STARTERS.map(([dialect, fact, ku, doubt]) => ({
    dialect,
    note: `Starter, written for the app — check first: ${doubt}`,
    payload: { ku, meanings: MEANINGS[fact], fact },
  }));
  pgm.sql(
    `INSERT INTO game_content (kind, dialect, level, payload, status, review_status, source, review_note)
     SELECT 'question_template', r.dialect, 1, r.payload, 'draft', 'unreviewed', 'starter', r.note
       FROM jsonb_to_recordset('${JSON.stringify(rows).replace(/'/g, "''")}'::jsonb) AS r(dialect text, note text, payload jsonb)`,
  );
};

export const down = (pgm) => {
  // the starters nobody has touched since; one an editor worked on is theirs now
  pgm.sql(`DELETE FROM game_content WHERE kind = 'question_template' AND source = 'starter' AND status = 'draft' AND review_status = 'unreviewed' AND lock_version = 0`);
  const theirs = list(MINE);
  for (const table of ['dm_messages', 'group_messages']) {
    pgm.sql(`DELETE FROM ${table} WHERE kind = 'game' AND game IN ${theirs}`);
    pgm.sql(`ALTER TABLE ${table} DROP CONSTRAINT ${table}_kind_check`);
    pgm.sql(`ALTER TABLE ${table} ADD CONSTRAINT ${table}_kind_check CHECK (${kindCheck(without(PLAY_GAMES))}) NOT VALID`);
  }
  for (const [table, name] of GAME_CHECKS) {
    pgm.sql(`DELETE FROM ${table} WHERE game IN ${theirs}`);
    pgm.sql(`ALTER TABLE ${table} DROP CONSTRAINT ${name}`);
    pgm.sql(`ALTER TABLE ${table} ADD CONSTRAINT ${name} CHECK (game IN ${list(without(PLAY_GAMES))}) NOT VALID`);
  }
  pgm.sql(`DELETE FROM game_lobbies WHERE game IN ${theirs}`);
  pgm.sql(`ALTER TABLE game_lobbies DROP CONSTRAINT game_lobbies_game_check`);
  pgm.sql(`ALTER TABLE game_lobbies ADD CONSTRAINT game_lobbies_game_check CHECK (game IN ${list(without(MULTI_GAMES))}) NOT VALID`);
};
