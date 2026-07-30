/**
 * Tournaments (KUR-060). Admin-scheduled single-elimination brackets.
 * tournaments holds config + lifecycle; tournament_participants is the
 * registration roster (seeded by rating at start); tournament_matches is the
 * bracket tree addressed by (round, slot) so a winner propagates to
 * slot>>1 one round up without explicit parent pointers.
 */

export const up = (pgm) => {
  pgm.createTable('tournaments', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'text', notNull: true },
    /** registration capacity (8–64); bracket size is derived at start */
    capacity: { type: 'integer', notNull: true },
    status: { type: 'text', notNull: true, default: 'registering' },
    starts_at: { type: 'timestamptz', notNull: true },
    reward_zer: { type: 'integer', notNull: true, default: 0 },
    reward_gems: { type: 'integer', notNull: true, default: 0 },
    rounds: { type: 'integer' },
    winner_id: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    created_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('tournaments', 'tournaments_status_check', {
    check: "status IN ('registering','running','completed','cancelled')",
  });
  pgm.addConstraint('tournaments', 'tournaments_capacity_check', {
    check: 'capacity BETWEEN 8 AND 64',
  });
  pgm.createIndex('tournaments', ['status', 'starts_at']);

  pgm.createTable('tournament_participants', {
    tournament_id: { type: 'uuid', notNull: true, references: 'tournaments', onDelete: 'CASCADE' },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    seed: { type: 'integer' },
    /** rating snapshot at start (drives seeding + is stable for the bracket) */
    rating: { type: 'integer', notNull: true, default: 1000 },
    eliminated: { type: 'boolean', notNull: true, default: false },
    registered_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('tournament_participants', 'tournament_participants_pk', {
    primaryKey: ['tournament_id', 'user_id'],
  });

  pgm.createTable('tournament_matches', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tournament_id: { type: 'uuid', notNull: true, references: 'tournaments', onDelete: 'CASCADE' },
    round: { type: 'integer', notNull: true },
    slot: { type: 'integer', notNull: true },
    player_a: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    player_b: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    winner: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    /** live game room once both players are known (KUR-051 engine) */
    game_room_id: { type: 'text' },
    status: { type: 'text', notNull: true, default: 'pending' },
    /** set when both players are known — starts the no-show clock */
    ready_at: { type: 'timestamptz' },
    /** players who confirmed presence, for no-show forfeits */
    checked_in: { type: 'jsonb', notNull: true, default: '[]' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('tournament_matches', 'tournament_matches_status_check', {
    check: "status IN ('pending','ready','completed')",
  });
  pgm.addConstraint('tournament_matches', 'tournament_matches_slot_unique', {
    unique: ['tournament_id', 'round', 'slot'],
  });
  pgm.createIndex('tournament_matches', ['tournament_id', 'round']);
  pgm.createIndex('tournament_matches', ['status', 'ready_at']);
};

export const down = (pgm) => {
  pgm.dropTable('tournament_matches');
  pgm.dropTable('tournament_participants');
  pgm.dropTable('tournaments');
};
