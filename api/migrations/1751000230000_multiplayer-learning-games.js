/**
 * One set of tables for every multiplayer learning game (The Last Letter
 * first; Impostor, Don't Say the Word, Bluff and the Who Am I race after it),
 * run by one engine (api/src/mp) instead of a pair of tables and a service per
 * game as Peyvok Battle and Rhyme Match have.
 *
 * - `game_lobbies`: a lobby, then the game played in it. `game` names which.
 *   The rules' state is one jsonb column the server alone reads: whatever a
 *   game hides (a secret word, who the impostor is) lives there and leaves only
 *   through the rules' per-seat view. `version` moves with every change, and a
 *   long-poll waits on it. `due_at` is the next deadline (a turn's time running
 *   out), so any replica's sweep finds the games that are due with SKIP LOCKED
 *   and none waits on the instance that last touched it. The lobby columns are
 *   the play layer's, as on the battle tables: who may join, the group chat it
 *   was shared into, the next round and the game before it, Rated or Friendly,
 *   and a join code from `new_game_code()`, cleared once the lobby is left.
 * - `game_lobby_players`: a seat, given once and never reused within a game.
 *   A person, or a computer seat (`bot`: Hevalo, in a game against Hevalo).
 *   `team` for team games; `away` and `missed_turns` for the turn timeouts
 *   (two missed turns in a row and the next are passed over until the player is
 *   back); `moves` counts a player's own moves, for whether they played at all;
 *   their place, score and the XP they were paid once it ends.
 * - `game_moves`: every move, in order, with what the player typed (`text`):
 *   a report about a player in a game is judged on what they wrote in it. The
 *   text is shown only inside the game, and cleared by the housekeeping a month
 *   after the game ends.
 *
 * The lists of games kept in the database grow to take these games:
 * invites, rematch offers, the chat's game cards and every Game Ranks table
 * check the game's name. Each check is widened rather than dropped. Every row
 * already there passes the wider one, so the checks are added NOT VALID: no
 * scan of the chat tables while this runs, and every new row is still checked.
 */

/** Every game that has lobbies, old and new (shared PLAY_GAMES; a test compares the two). */
const PLAY_GAMES = ['wordle-battle', 'rhyme-match', 'stories', 'last-letter'];
/** The games before this migration, for going back. */
const OLD_GAMES = ['wordle-battle', 'rhyme-match', 'stories'];
/** The games the new tables hold (shared MULTI_GAMES). */
const MULTI_GAMES = ['last-letter'];

const list = (games) => `(${games.map((g) => `'${g}'`).join(',')})`;

const STATES =
  "('rated','damped','chosen','solo','need-two','unverified','no-birth-month','restricted','cooldown','repeat-opponent')";

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

/** `new_game_code()` as migration game-join-codes made it, with or without the new lobbies among the tables it checks. */
const codeFunction = (withLobbies) => `
    CREATE OR REPLACE FUNCTION new_game_code() RETURNS text
    LANGUAGE plpgsql VOLATILE AS $$
    DECLARE
      alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
      candidate text;
      b int;
    BEGIN
      LOOP
        candidate := '';
        WHILE char_length(candidate) < 6 LOOP
          b := get_byte(gen_random_bytes(1), 0);
          -- 248 = 8 × 31: drawing again above it keeps every letter equally likely
          IF b < 248 THEN
            candidate := candidate || substr(alphabet, 1 + b % 31, 1);
          END IF;
        END LOOP;
        EXIT WHEN NOT EXISTS (SELECT 1 FROM story_games s WHERE s.code = candidate)
          AND NOT EXISTS (SELECT 1 FROM wordle_battles w WHERE w.code = candidate)
          AND NOT EXISTS (SELECT 1 FROM rhyme_matches r WHERE r.code = candidate)${
            withLobbies ? '\n          AND NOT EXISTS (SELECT 1 FROM game_lobbies l WHERE l.code = candidate)' : ''
          };
      END LOOP;
      RETURN candidate;
    END
    $$
  `;

export const up = (pgm) => {
  pgm.createTable('game_lobbies', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    game: { type: 'text', notNull: true, check: `game IN ${list(MULTI_GAMES)}` },
    // null once the host's account is erased: nobody new joins a game without one
    host_id: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    mode: { type: 'text', notNull: true, default: 'group', check: "mode IN ('group','solo')" },
    status: { type: 'text', notNull: true, default: 'lobby', check: "status IN ('lobby','active','finished','cancelled')" },
    dialect: { type: 'text', notNull: true, check: "dialect IN ('kmr','ckb')" },
    settings: { type: 'jsonb', notNull: true, default: '{}' },
    state: { type: 'jsonb' },
    seed: { type: 'text', notNull: true, default: pgm.func("encode(gen_random_bytes(12), 'hex')") },
    version: { type: 'integer', notNull: true, default: 0 },
    due_at: { type: 'timestamptz' },
    // when the game began waiting on the seats it waits on now: an away player's turn is passed over a moment after it
    wait_since: { type: 'timestamptz' },
    min_players: { type: 'smallint', notNull: true, default: 2 },
    max_players: { type: 'smallint', notNull: true, default: 6 },
    teams: { type: 'smallint', notNull: true, default: 0, check: 'teams BETWEEN 0 AND 4' },
    seats_issued: { type: 'integer', notNull: true, default: 0 },
    access: { type: 'text', notNull: true, default: 'friends', check: "access IN ('friends','open')" },
    chat_group_id: { type: 'uuid', references: 'groups', onDelete: 'SET NULL' },
    next_lobby_id: { type: 'uuid', references: 'game_lobbies', onDelete: 'SET NULL' },
    rematch_of: { type: 'uuid', references: 'game_lobbies', onDelete: 'SET NULL' },
    rated: { type: 'boolean', notNull: true, default: false },
    rated_state: { type: 'text', check: `rated_state IS NULL OR rated_state IN ${STATES}` },
    code: { type: 'text', check: 'code IS NULL OR char_length(code) = 6' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    started_at: { type: 'timestamptz' },
    finished_at: { type: 'timestamptz' },
  });
  pgm.addConstraint('game_lobbies', 'game_lobbies_players_range', {
    check: 'min_players BETWEEN 1 AND max_players AND max_players <= 12',
  });
  // the idle-lobby sweep, and a host's lobbies (the hosting limit)
  pgm.createIndex('game_lobbies', ['status', 'updated_at']);
  pgm.createIndex('game_lobbies', ['host_id', 'status']);
  // the deadline sweep: only games under way have one
  pgm.createIndex('game_lobbies', 'due_at', { name: 'game_lobbies_due', where: "status = 'active' AND due_at IS NOT NULL" });
  pgm.createIndex('game_lobbies', 'code', { unique: true, where: 'code IS NOT NULL' });
  // a deleted game or group nulls the pointers to it: without these, a scan per deleted row
  pgm.createIndex('game_lobbies', 'next_lobby_id', { where: 'next_lobby_id IS NOT NULL' });
  pgm.createIndex('game_lobbies', 'rematch_of', { where: 'rematch_of IS NOT NULL' });
  pgm.createIndex('game_lobbies', 'chat_group_id', { where: 'chat_group_id IS NOT NULL' });
  // the housekeeping: ended games by when they ended
  pgm.createIndex('game_lobbies', 'finished_at', { where: 'finished_at IS NOT NULL' });

  pgm.sql(codeFunction(true));
  pgm.sql(`ALTER TABLE game_lobbies ALTER COLUMN code SET DEFAULT new_game_code()`);
  // the code goes as soon as the lobby is left (release_game_code, migration game-join-codes); a solo game never has one
  pgm.sql(`
    CREATE TRIGGER game_lobbies_release_code
    BEFORE INSERT OR UPDATE OF status ON game_lobbies
    FOR EACH ROW EXECUTE FUNCTION release_game_code()
  `);

  pgm.createTable('game_lobby_players', {
    lobby_id: { type: 'uuid', notNull: true, references: 'game_lobbies', onDelete: 'CASCADE' },
    seat: { type: 'smallint', notNull: true },
    // a person; null for a computer seat
    user_id: { type: 'uuid', references: 'users', onDelete: 'CASCADE' },
    bot: { type: 'text', check: "bot IS NULL OR bot IN ('hevalo')" },
    team: { type: 'smallint' },
    joined_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    last_seen_at: { type: 'timestamptz' },
    left_at: { type: 'timestamptz' },
    removed: { type: 'boolean', notNull: true, default: false },
    away: { type: 'boolean', notNull: true, default: false },
    missed_turns: { type: 'smallint', notNull: true, default: 0 },
    moves: { type: 'integer', notNull: true, default: 0 },
    place: { type: 'smallint' },
    score: { type: 'integer' },
    xp_awarded: { type: 'integer' },
  });
  pgm.addConstraint('game_lobby_players', 'game_lobby_players_pkey', { primaryKey: ['lobby_id', 'seat'] });
  pgm.addConstraint('game_lobby_players', 'game_lobby_players_person_or_bot', {
    check: '(user_id IS NULL) <> (bot IS NULL)',
  });
  pgm.createIndex('game_lobby_players', ['lobby_id', 'user_id'], {
    name: 'game_lobby_players_once',
    unique: true,
    where: 'user_id IS NOT NULL',
  });
  // a person's games: badges, the profile, finished games, the rail and account deletion
  pgm.createIndex('game_lobby_players', 'user_id', { where: 'user_id IS NOT NULL' });

  pgm.createTable('game_moves', {
    id: { type: 'bigserial', primaryKey: true },
    lobby_id: { type: 'uuid', notNull: true, references: 'game_lobbies', onDelete: 'CASCADE' },
    seq: { type: 'integer', notNull: true },
    seat: { type: 'smallint', notNull: true },
    // the mover; null for Hevalo, or once their account is erased
    user_id: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    kind: { type: 'text', notNull: true, check: "kind IN ('move','timeout','skip','leave')" },
    text: { type: 'text', check: 'text IS NULL OR char_length(text) <= 300' },
    payload: { type: 'jsonb', notNull: true, default: '{}' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('game_moves', 'game_moves_seq_once', { unique: ['lobby_id', 'seq'] });
  pgm.createIndex('game_moves', 'user_id', { where: 'user_id IS NOT NULL' });

  // every list of games in the database takes the new ones
  for (const [table, name] of GAME_CHECKS) {
    pgm.sql(`ALTER TABLE ${table} DROP CONSTRAINT ${name}`);
    pgm.sql(`ALTER TABLE ${table} ADD CONSTRAINT ${name} CHECK (game IN ${list(PLAY_GAMES)}) NOT VALID`);
  }
  for (const table of ['dm_messages', 'group_messages']) {
    pgm.sql(`ALTER TABLE ${table} DROP CONSTRAINT ${table}_kind_check`);
    pgm.sql(`ALTER TABLE ${table} ADD CONSTRAINT ${table}_kind_check CHECK (${kindCheck(PLAY_GAMES)}) NOT VALID`);
  }
};

export const down = (pgm) => {
  // the rows that name the new games first, or the narrower checks would refuse them
  const newGames = list(MULTI_GAMES);
  for (const table of ['dm_messages', 'group_messages']) {
    pgm.sql(`DELETE FROM ${table} WHERE kind = 'game' AND game IN ${newGames}`);
    pgm.sql(`ALTER TABLE ${table} DROP CONSTRAINT ${table}_kind_check`);
    pgm.sql(`ALTER TABLE ${table} ADD CONSTRAINT ${table}_kind_check CHECK (${kindCheck(OLD_GAMES)})`);
  }
  for (const [table, name] of GAME_CHECKS) {
    pgm.sql(`DELETE FROM ${table} WHERE game IN ${newGames}`);
    pgm.sql(`ALTER TABLE ${table} DROP CONSTRAINT ${name}`);
    pgm.sql(`ALTER TABLE ${table} ADD CONSTRAINT ${name} CHECK (game IN ${list(OLD_GAMES)})`);
  }
  pgm.dropTable('game_moves');
  pgm.dropTable('game_lobby_players');
  pgm.sql('DROP TRIGGER IF EXISTS game_lobbies_release_code ON game_lobbies');
  pgm.sql(`ALTER TABLE game_lobbies ALTER COLUMN code DROP DEFAULT`);
  pgm.sql(codeFunction(false));
  pgm.dropTable('game_lobbies');
};
