/**
 * Kurdish Impostor and Don't Say the Word! join the multiplayer learning games
 * (api/src/mp): their lobbies, seats and moves live in the generic engine's
 * tables, so all this migration does is let the database's lists of games take
 * their names — `game_lobbies.game`, and every list the play layer keeps
 * (invites, rematch offers, the chat's game cards and each Game Ranks table).
 *
 * Each list is widened from what it holds when this runs, rather than written
 * out again in full: other games may have joined the lists in a migration
 * written beside this one, and a list typed out here would drop them. The
 * checks are added NOT VALID, as the engine's own migration did: every row
 * already there passes the wider check, so no table is scanned while this
 * runs, and every new row is still checked.
 *
 * Going back takes the two names out of each list again, after deleting the
 * rows that name them (their lobbies cascade to their seats and moves).
 */

const NEW_GAMES = ['impostor', 'dont-say'];

/** The tables whose `game` column is checked against a list, with the check's name. */
const GAME_CHECKS = [
  ['game_lobbies', 'game_lobbies_game_check'],
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

/** The chat tables, whose `kind` check names the games a game card may be for. */
const MESSAGE_TABLES = ['dm_messages', 'group_messages'];

const list = (games) => `(${games.map((g) => `'${g}'`).join(',')})`;
const literals = (text) => [...text.matchAll(/'([a-z][a-z0-9-]*)'/g)].map((m) => m[1]);

const kindCheck = (games) => `(kind = 'text' AND body IS NOT NULL)
           OR (kind = 'gift' AND gift_batch_id IS NOT NULL)
           OR (kind = 'game' AND game IN ${list(games)} AND game_lobby_id IS NOT NULL)`;

async function definition(pgm, table, name) {
  const res = await pgm.db.query(
    `SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c WHERE c.conrelid = to_regclass($1) AND c.conname = $2`,
    [table, name],
  );
  if (!res.rows[0]) throw new Error(`no check ${name} on ${table}`);
  return res.rows[0].def;
}

/** The games a `game IN (...)` check names now. */
async function gamesIn(pgm, table, name) {
  return literals(await definition(pgm, table, name));
}

/** The games a chat table's game card may name now: the list inside its `kind = 'game'` branch. */
async function cardGames(pgm, table) {
  const def = await definition(pgm, table, `${table}_kind_check`);
  const inside = def.match(/game\s*=\s*ANY\s*\(\s*\(?ARRAY\[([^\]]*)\]/i) ?? def.match(/game\s+IN\s*\(([^)]*)\)/i);
  if (!inside) throw new Error(`cannot read the games in ${table}_kind_check`);
  return literals(inside[1]);
}

const union = (a, b) => [...new Set([...a, ...b])];
const without = (a, b) => a.filter((g) => !b.includes(g));

export const up = async (pgm) => {
  for (const [table, name] of GAME_CHECKS) {
    const games = union(await gamesIn(pgm, table, name), NEW_GAMES);
    pgm.sql(`ALTER TABLE ${table} DROP CONSTRAINT ${name}`);
    pgm.sql(`ALTER TABLE ${table} ADD CONSTRAINT ${name} CHECK (game IN ${list(games)}) NOT VALID`);
  }
  for (const table of MESSAGE_TABLES) {
    const games = union(await cardGames(pgm, table), NEW_GAMES);
    pgm.sql(`ALTER TABLE ${table} DROP CONSTRAINT ${table}_kind_check`);
    pgm.sql(`ALTER TABLE ${table} ADD CONSTRAINT ${table}_kind_check CHECK (${kindCheck(games)}) NOT VALID`);
  }
};

export const down = async (pgm) => {
  const gone = list(NEW_GAMES);
  for (const table of MESSAGE_TABLES) {
    const games = without(await cardGames(pgm, table), NEW_GAMES);
    pgm.sql(`DELETE FROM ${table} WHERE kind = 'game' AND game IN ${gone}`);
    pgm.sql(`ALTER TABLE ${table} DROP CONSTRAINT ${table}_kind_check`);
    pgm.sql(`ALTER TABLE ${table} ADD CONSTRAINT ${table}_kind_check CHECK (${kindCheck(games)}) NOT VALID`);
  }
  for (const [table, name] of GAME_CHECKS) {
    const games = without(await gamesIn(pgm, table, name), NEW_GAMES);
    pgm.sql(`DELETE FROM ${table} WHERE game IN ${gone}`);
    pgm.sql(`ALTER TABLE ${table} DROP CONSTRAINT ${name}`);
    pgm.sql(`ALTER TABLE ${table} ADD CONSTRAINT ${name} CHECK (game IN ${list(games)}) NOT VALID`);
  }
};
