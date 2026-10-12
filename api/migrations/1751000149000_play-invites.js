/**
 * Inviting friends to a game, and playing again — the same for every online
 * game (Wordle Battle, Rhyme Match, Stories; @kurda/shared `play`).
 *
 * Until now a lobby was a URL. Anyone signed in who had it could walk in, the
 * host could not take anyone out or call the lobby off, a lobby nobody started
 * stayed open for ever, and one closed tab could hold a Wordle Battle open for
 * good. Friends saw each other as "Opponent". So:
 *
 * - `play_invites`: one row per friend invited to a lobby. At most one pending
 *   invite per host, friend and game — a newer one cancels the older in the
 *   same transaction, which the partial unique index makes impossible to get
 *   wrong. `lobby_id` has no foreign key on purpose: it points into whichever
 *   game's table `game` names.
 * - `play_rematches`: a two-player rematch is two offers; the game starts when
 *   both are there. `declined_at` is "no thanks", or leaving the results.
 * - Both battle tables gain who may join (`access`, and `chat_group_id` when
 *   the host shared the lobby into a group chat — its members may join too),
 *   the next round or rematch (`next_lobby_id`) and the game it followed
 *   (`rematch_of`, for the running score), `updated_at` for closing idle
 *   lobbies, and a `cancelled` status for a lobby its host left or nobody
 *   started.
 * - Players gain a `seat`: the only handle other players are ever given for
 *   them (never a user id), so a host can remove someone without learning who
 *   they are. `left_at` marks a player who left a started game (leaving a lobby
 *   deletes the row), and `removed` one the host took out of a lobby — kept, so
 *   they cannot simply join again.
 * - Wordle Battle gains `ends_at`, and its players `last_seen_at`: a battle
 *   ends at that time, or as soon as nobody still racing is around, instead of
 *   waiting for a player who closed the tab.
 */

const GAMES = "('wordle-battle','rhyme-match','stories')";

/** the two existing battle tables, with their player tables and the column that joins them */
const BATTLES = [
  { table: 'wordle_battles', players: 'wordle_battle_players', fk: 'battle_id' },
  { table: 'rhyme_matches', players: 'rhyme_match_players', fk: 'match_id' },
];

export const up = (pgm) => {
  pgm.createTable('play_invites', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    game: { type: 'text', notNull: true, check: `game IN ${GAMES}` },
    lobby_id: { type: 'uuid', notNull: true },
    host_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    invitee_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    status: {
      type: 'text',
      notNull: true,
      default: 'pending',
      check: "status IN ('pending','accepted','declined','cancelled','expired')",
    },
    decline_reason: {
      type: 'text',
      check: "decline_reason IS NULL OR decline_reason IN ('later','not_this_game')",
    },
    // the game this one follows, when the invitee played it with the host
    rematch_of: { type: 'uuid' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    expires_at: { type: 'timestamptz', notNull: true },
    responded_at: { type: 'timestamptz' },
  });
  // one pending invite per host, friend and game: a new one replaces the old
  pgm.createIndex('play_invites', ['host_id', 'invitee_id', 'game'], {
    name: 'play_invites_one_pending',
    unique: true,
    where: "status = 'pending'",
  });
  // the invitee's banner and list
  pgm.createIndex('play_invites', ['invitee_id', 'status']);
  // the host's list, newest first, and the decline cooldown
  pgm.createIndex('play_invites', ['host_id', 'created_at']);
  // expiring a lobby's invites when it starts, fills or is called off
  pgm.createIndex('play_invites', ['game', 'lobby_id']);

  pgm.createTable('play_rematches', {
    game: { type: 'text', notNull: true, check: `game IN ${GAMES}` },
    lobby_id: { type: 'uuid', notNull: true },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    declined_at: { type: 'timestamptz' },
  });
  pgm.addConstraint('play_rematches', 'play_rematches_pkey', { primaryKey: ['game', 'lobby_id', 'user_id'] });

  for (const { table, players, fk } of BATTLES) {
    pgm.addColumns(table, {
      access: { type: 'text', notNull: true, default: 'friends', check: "access IN ('friends','open')" },
      chat_group_id: { type: 'uuid', references: 'groups', onDelete: 'SET NULL' },
      next_lobby_id: { type: 'uuid', references: table, onDelete: 'SET NULL' },
      rematch_of: { type: 'uuid', references: table, onDelete: 'SET NULL' },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    });
    pgm.sql(`UPDATE ${table} SET updated_at = COALESCE(finished_at, started_at, created_at)`);
    pgm.dropConstraint(table, `${table}_status_check`);
    pgm.addConstraint(table, `${table}_status_check`, {
      check: "status IN ('lobby','active','finished','cancelled')",
    });
    // the idle-lobby sweep
    pgm.createIndex(table, ['status', 'updated_at']);
    // a deleted game nulls the pointers to it: without these, a scan per deleted row
    pgm.createIndex(table, 'next_lobby_id', { where: 'next_lobby_id IS NOT NULL' });
    pgm.createIndex(table, 'rematch_of', { where: 'rematch_of IS NOT NULL' });

    pgm.addColumns(players, {
      seat: { type: 'smallint' },
      left_at: { type: 'timestamptz' },
      removed: { type: 'boolean', notNull: true, default: false },
    });
    pgm.sql(`
      UPDATE ${players} p SET seat = s.n
        FROM (SELECT ${fk}, user_id, row_number() OVER (PARTITION BY ${fk} ORDER BY joined_at, user_id) AS n
                FROM ${players}) s
       WHERE s.${fk} = p.${fk} AND s.user_id = p.user_id`);
    pgm.alterColumn(players, 'seat', { notNull: true });
    pgm.addConstraint(players, `${players}_seat_uniq`, { unique: [fk, 'seat'] });
    // "my games", blocks and account erasure look players up by user
    pgm.createIndex(players, 'user_id');
  }

  pgm.addColumns('wordle_battles', { ends_at: { type: 'timestamptz' } });
  pgm.addColumns('wordle_battle_players', { last_seen_at: { type: 'timestamptz' } });
};

export const down = (pgm) => {
  pgm.dropColumns('wordle_battle_players', ['last_seen_at']);
  pgm.dropColumns('wordle_battles', ['ends_at']);
  for (const { table, players } of BATTLES) {
    pgm.dropIndex(players, 'user_id');
    pgm.dropConstraint(players, `${players}_seat_uniq`);
    pgm.dropColumns(players, ['seat', 'left_at', 'removed']);
    pgm.dropIndex(table, 'rematch_of', { where: 'rematch_of IS NOT NULL' });
    pgm.dropIndex(table, 'next_lobby_id', { where: 'next_lobby_id IS NOT NULL' });
    pgm.dropIndex(table, ['status', 'updated_at']);
    // a called-off lobby has nothing to keep
    pgm.sql(`DELETE FROM ${table} WHERE status = 'cancelled'`);
    pgm.dropConstraint(table, `${table}_status_check`);
    pgm.addConstraint(table, `${table}_status_check`, { check: "status IN ('lobby','active','finished')" });
    pgm.dropColumns(table, ['access', 'chat_group_id', 'next_lobby_id', 'rematch_of', 'updated_at']);
  }
  pgm.dropTable('play_rematches');
  pgm.dropTable('play_invites');
};
