/**
 * Rhyming Words — training (solo) backend (KUR-299, part of). One row per
 * training game: a prompt word, a timed answer window, and the running set of
 * accepted rhymes + score. Server-authoritative scoring uses the #298 engine.
 * (1v1 / free-for-all reuse the realtime game engine and land separately.)
 */

export const up = (pgm) => {
  pgm.createTable('rhyme_games', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    mode: { type: 'text', notNull: true, default: 'training', check: "mode IN ('training')" },
    dialect: { type: 'text', notNull: true, default: 'kurmanci', check: "dialect IN ('kurmanci','sorani')" },
    prompt: { type: 'text', notNull: true },
    window_ms: { type: 'integer', notNull: true },
    // normalized words already accepted this game (dedup + is-prompt guards)
    used_words: { type: 'jsonb', notNull: true, default: pgm.func("'[]'::jsonb") },
    score: { type: 'integer', notNull: true, default: 0 },
    accepted: { type: 'integer', notNull: true, default: 0 },
    status: { type: 'text', notNull: true, default: 'active', check: "status IN ('active','ended')" },
    started_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    ended_at: { type: 'timestamptz' },
  });
  pgm.createIndex('rhyme_games', ['user_id', 'status']);
};

export const down = (pgm) => {
  pgm.dropTable('rhyme_games');
};
