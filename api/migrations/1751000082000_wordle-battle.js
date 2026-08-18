/**
 * Wordle multiplayer Battle mode (KUR-306). Server-authoritative: the shared
 * hidden `target` lives on `wordle_battles` and every guess is scored server-side
 * (via the #303 engine), so a player never sees the answer — or an opponent's
 * letters — until the match ends. `wordle_battle_players` holds each racer's own
 * guess history + finish state; placement is computed by the pure `wordle-battle.ts`
 * ranker (first-solve → fewest-guesses → fastest-time) and XP awarded by placement.
 *
 * The realtime transport (gateway #049 push of opponent *progress*) + matchmaking
 * (#050) layer on top — state here is drivable over plain requests (poll-safe) so
 * the whole match is integration-testable without a live socket.
 */

export const up = (pgm) => {
  pgm.createTable('wordle_battles', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    created_by: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    difficulty: { type: 'text', notNull: true, check: "difficulty IN ('easy','medium','hard')" },
    // server-held answer — never serialised to a client while status <> 'finished'
    target: { type: 'text', notNull: true },
    target_length: { type: 'integer', notNull: true },
    max_players: { type: 'integer', notNull: true, default: 8, check: 'max_players BETWEEN 2 AND 8' },
    status: { type: 'text', notNull: true, default: 'lobby', check: "status IN ('lobby','active','finished')" },
    started_at: { type: 'timestamptz' },
    finished_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  // open lobbies for a quick-match / listing
  pgm.createIndex('wordle_battles', ['status', 'created_at']);

  pgm.createTable('wordle_battle_players', {
    battle_id: { type: 'uuid', notNull: true, references: 'wordle_battles', onDelete: 'CASCADE' },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    // this player's own scored guesses (GuessRow[]); never exposes the target
    guesses: { type: 'jsonb', notNull: true, default: '[]' },
    status: { type: 'text', notNull: true, default: 'playing', check: "status IN ('playing','won','lost')" },
    solved: { type: 'boolean', notNull: true, default: false },
    guess_count: { type: 'integer', notNull: true, default: 0 },
    // best green-letter count, for ranking players who didn't solve
    progress: { type: 'integer', notNull: true, default: 0 },
    time_ms: { type: 'integer' },
    xp_awarded: { type: 'integer' },
    joined_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    finished_at: { type: 'timestamptz' },
  });
  pgm.addConstraint('wordle_battle_players', 'wordle_battle_players_pkey', { primaryKey: ['battle_id', 'user_id'] });
};

export const down = (pgm) => {
  pgm.dropTable('wordle_battle_players');
  pgm.dropTable('wordle_battles');
};
