/**
 * The learning games' tables (shared/src/games, api/src/games).
 *
 * - `game_content`: the games' own content, one row per sentence, passage,
 *   scenario, case file or card, each in exactly one variety ('kmr' or 'ckb')
 *   and at one level (1–5). It keeps the stories' review model: a status
 *   workflow (draft, in review, published, archived), a reviewer's approval
 *   with who, when and a note, a lock version every change must name, and the
 *   rule that nothing is published that was not approved — checked here as
 *   well as by the API. `payload` is validated against the kind's schema in
 *   @kurda/shared before it is written; the table only insists it is an
 *   object, so a game's track can add a kind without a migration. `source`
 *   says which door a row came in by ('admin', or 'starter' for drafts seeded
 *   for native review), and `origin` the lesson or story an importer took it
 *   from, unique per kind and variety so an import run twice adds nothing.
 * - `game_seen`: each learner's record of each item, per game: how often it
 *   was asked, when last, and when it was last answered right — a round asks
 *   unseen and long-unseen items first, and an item answered right within two
 *   weeks pays no XP again.
 * - `game_sessions` and `game_session_answers`: a solo round. The items, their
 *   answers included, are kept on the server (`items`); a learner is sent them
 *   without. Each try is a row, so a round can be come back to, an answer sent
 *   twice is one answer, and the finish pays once (`finished_at` is claimed by
 *   one UPDATE). A round can be come back to until `expires_at`.
 * - `game_progress`: how far up a game's ladder a learner has climbed, per
 *   variety (Build a Kurdish Sentence's rungs).
 *
 * Everything a learner has is deleted with their account (the cascade, and
 * the erasure that keeps the user row lists these tables too).
 */

export const up = (pgm) => {
  pgm.createTable('game_content', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    kind: { type: 'text', notNull: true },
    dialect: { type: 'text', notNull: true },
    level: { type: 'smallint', notNull: true },
    payload: { type: 'jsonb', notNull: true },
    status: { type: 'text', notNull: true, default: 'draft' },
    review_status: { type: 'text', notNull: true, default: 'unreviewed' },
    reviewed_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    reviewed_at: { type: 'timestamptz' },
    review_note: { type: 'text' },
    source: { type: 'text', notNull: true, default: 'admin' },
    /** 'lesson:<exerciseId>', 'conversation:<exerciseId>:<line>', 'story:<storyId>:<paragraph>' */
    origin: { type: 'text' },
    lock_version: { type: 'integer', notNull: true, default: 0 },
    created_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    updated_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    published_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    published_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('game_content', 'game_content_kind_format', { check: "kind ~ '^[a-z][a-z_]{1,39}$'" });
  pgm.addConstraint('game_content', 'game_content_dialect_check', { check: "dialect IN ('kmr', 'ckb')" });
  pgm.addConstraint('game_content', 'game_content_level_check', { check: 'level BETWEEN 1 AND 5' });
  pgm.addConstraint('game_content', 'game_content_payload_shape', { check: "jsonb_typeof(payload) = 'object'" });
  pgm.addConstraint('game_content', 'game_content_status_check', { check: "status IN ('draft', 'in_review', 'published', 'archived')" });
  pgm.addConstraint('game_content', 'game_content_review_status_check', { check: "review_status IN ('unreviewed', 'approved')" });
  pgm.addConstraint('game_content', 'game_content_review_note_length', { check: 'review_note IS NULL OR char_length(review_note) <= 600' });
  pgm.addConstraint('game_content', 'game_content_source_check', { check: "source IN ('admin', 'starter')" });
  pgm.addConstraint('game_content', 'game_content_origin_length', { check: 'origin IS NULL OR char_length(origin) <= 200' });
  pgm.addConstraint('game_content', 'game_content_published_is_approved', { check: "status <> 'published' OR review_status = 'approved'" });
  pgm.createTrigger('game_content', 'game_content_set_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    level: 'ROW',
    function: 'set_updated_at',
  });
  // what a game reads (published rows of a kind, variety and level) and what the admin list filters by
  pgm.createIndex('game_content', ['kind', 'dialect', 'status', 'level']);
  pgm.createIndex('game_content', ['status', 'updated_at']);
  pgm.createIndex('game_content', ['kind', 'dialect', 'origin'], { unique: true, where: 'origin IS NOT NULL', name: 'game_content_origin_once' });

  pgm.createTable('game_seen', {
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    game: { type: 'text', notNull: true },
    item_key: { type: 'text', notNull: true },
    attempts: { type: 'integer', notNull: true, default: 0 },
    correct: { type: 'integer', notNull: true, default: 0 },
    last_seen_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    last_correct_at: { type: 'timestamptz' },
  });
  pgm.addConstraint('game_seen', 'game_seen_pkey', { primaryKey: ['user_id', 'game', 'item_key'] });
  pgm.addConstraint('game_seen', 'game_seen_item_key_length', { check: "char_length(item_key) BETWEEN 1 AND 200" });
  // the housekeeping prunes by age
  pgm.createIndex('game_seen', 'last_seen_at');

  pgm.createTable('game_sessions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    game: { type: 'text', notNull: true },
    dialect: { type: 'text', notNull: true },
    difficulty: { type: 'text', notNull: true },
    /** the round as the server keeps it: every item with its answer */
    items: { type: 'jsonb', notNull: true },
    /** what the game decided about the round as a whole (Build a Kurdish Sentence: the rung it was played on) */
    meta: { type: 'jsonb', notNull: true, default: pgm.func(`'{}'::jsonb`) },
    /** the results as the finish paid them, so asking again answers the same */
    results: { type: 'jsonb' },
    total_count: { type: 'smallint', notNull: true },
    correct_count: { type: 'smallint', notNull: true, default: 0 },
    first_try_count: { type: 'smallint', notNull: true, default: 0 },
    xp_awarded: { type: 'integer', notNull: true, default: 0 },
    learning_counted: { type: 'boolean', notNull: true, default: false },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    expires_at: { type: 'timestamptz', notNull: true },
    finished_at: { type: 'timestamptz' },
  });
  pgm.addConstraint('game_sessions', 'game_sessions_dialect_check', { check: "dialect IN ('kmr', 'ckb')" });
  pgm.addConstraint('game_sessions', 'game_sessions_difficulty_check', { check: "difficulty IN ('beginner', 'intermediate', 'advanced')" });
  pgm.addConstraint('game_sessions', 'game_sessions_items_shape', { check: "jsonb_typeof(items) = 'array'" });
  // a learner's open round of a game in a variety, to come back to
  pgm.createIndex('game_sessions', ['user_id', 'game', 'dialect', { name: 'created_at', sort: 'DESC' }], { where: 'finished_at IS NULL' });
  pgm.createIndex('game_sessions', ['user_id', 'finished_at'], { where: 'finished_at IS NOT NULL' });
  pgm.createIndex('game_sessions', 'expires_at', { where: 'finished_at IS NULL' });

  pgm.createTable('game_session_answers', {
    session_id: { type: 'uuid', notNull: true, references: 'game_sessions', onDelete: 'CASCADE' },
    item_index: { type: 'smallint', notNull: true },
    attempt: { type: 'smallint', notNull: true },
    answer: { type: 'jsonb', notNull: true },
    correct: { type: 'boolean', notNull: true },
    answered_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('game_session_answers', 'game_session_answers_pkey', { primaryKey: ['session_id', 'item_index', 'attempt'] });
  pgm.addConstraint('game_session_answers', 'game_session_answers_attempt_check', { check: 'attempt BETWEEN 1 AND 3' });

  pgm.createTable('game_progress', {
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    game: { type: 'text', notNull: true },
    dialect: { type: 'text', notNull: true },
    step: { type: 'smallint', notNull: true, default: 1 },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('game_progress', 'game_progress_pkey', { primaryKey: ['user_id', 'game', 'dialect'] });
  pgm.addConstraint('game_progress', 'game_progress_dialect_check', { check: "dialect IN ('kmr', 'ckb')" });
  pgm.addConstraint('game_progress', 'game_progress_step_check', { check: 'step BETWEEN 1 AND 20' });
};

export const down = (pgm) => {
  pgm.dropTable('game_progress');
  pgm.dropTable('game_session_answers');
  pgm.dropTable('game_sessions');
  pgm.dropTable('game_seen');
  pgm.dropTable('game_content');
};
