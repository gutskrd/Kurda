/**
 * Story games: a quiz on a story, alone, with a friend or with a group.
 *
 * Postgres is the game, not a cache of it. The quiz it replaces ran in one
 * process's memory and lost every game on a deploy; a story quiz is played at
 * a reader's pace with deadlines in minutes, so every phase and deadline is a
 * column here, and any instance can serve any player.
 *
 * - `plan` is the questions this game asks, chosen and their options shuffled
 *   when the questions are built, with the right answers in it — it never
 *   leaves the server. `story_snapshot` is the text they were asked about
 *   (title, paragraphs, glossary), so unpublishing or editing a story never
 *   changes a game in progress. Both are cleared two days after a game ends.
 * - `version` goes up with every change; a waiting reader asks "anything after
 *   version N?" and is woken when there is.
 * - `access`: 'friends' (the host's friends join) or 'open' (any known adult
 *   with the code; only a known-adult host can choose it). `chat_group_id` is
 *   set when the host shared the game into a group chat, whose members may
 *   then join too.
 * - `next_game_id`: the next round, once the host opens one.
 *
 * Players keep their seat for the whole game (seats are the only handle other
 * players ever get — never a user id). Leaving a lobby deletes the row; leaving
 * a started game marks `left_at`; a removed player is marked and is no longer
 * a member anywhere. Totals (score, correct, correct_ms, answered) move only
 * when a question is revealed. `last_seen_at` is written at most every 15 s
 * per player, so a player who stopped polling is "away" on every instance.
 *
 * Answers are one row per player and question (the key makes a second answer
 * impossible); they are deleted with the plan two days after the game ends.
 * `story_completions` remembers the first time someone's game on a story
 * counted as learning: repeats pay less XP, and that has to outlive the
 * games themselves.
 */

export const up = (pgm) => {
  pgm.createTable('story_games', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    code: { type: 'text', check: 'code IS NULL OR char_length(code) = 6' },
    mode: { type: 'text', notNull: true, check: "mode IN ('solo','duo','group')" },
    host_id: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    story_id: { type: 'uuid', notNull: true, references: 'stories', onDelete: 'RESTRICT' },
    dialect: { type: 'text', notNull: true, check: "dialect IN ('kurmanci','sorani')" },
    level: { type: 'smallint', notNull: true, check: 'level BETWEEN 1 AND 3' },
    length: { type: 'text', notNull: true, check: "length IN ('short','medium','long')" },
    question_count: { type: 'smallint', notNull: true, check: 'question_count IN (3, 5, 10)' },
    timer_seconds: { type: 'smallint', notNull: true, check: 'timer_seconds IN (0, 30, 60)' },
    text_during: { type: 'text', notNull: true, default: 'visible', check: "text_during IN ('visible','hidden')" },
    access: { type: 'text', notNull: true, default: 'friends', check: "access IN ('friends','open')" },
    chat_group_id: { type: 'uuid', references: 'groups', onDelete: 'SET NULL' },
    status: {
      type: 'text',
      notNull: true,
      default: 'lobby',
      check: "status IN ('lobby','reading','question','reveal','finished','cancelled')",
    },
    current_index: { type: 'smallint', notNull: true, default: 0 },
    phase_started_at: { type: 'timestamptz' },
    phase_ends_at: { type: 'timestamptz' },
    reading_soft_cap_at: { type: 'timestamptz' },
    reading_hard_cap_at: { type: 'timestamptz' },
    version: { type: 'integer', notNull: true, default: 0 },
    plan: { type: 'jsonb' },
    story_snapshot: { type: 'jsonb' },
    next_game_id: { type: 'uuid', references: 'story_games', onDelete: 'SET NULL' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    started_at: { type: 'timestamptz' },
    finished_at: { type: 'timestamptz' },
  });
  pgm.createIndex('story_games', ['status', 'updated_at']);
  pgm.createIndex('story_games', 'host_id');
  // the RESTRICT check when a story is deleted, and "is this story in use"
  pgm.createIndex('story_games', 'story_id');
  // a deleted game nulls the next_game_id pointing at it: without this, a scan per deleted row
  pgm.createIndex('story_games', 'next_game_id', { where: 'next_game_id IS NOT NULL' });
  // deleting a group nulls the chat_group_id of every game shared into it: the
  // same scan otherwise, over a table that keeps games for 400 days
  pgm.createIndex('story_games', 'chat_group_id', { where: 'chat_group_id IS NOT NULL' });
  pgm.createIndex('story_games', 'code', { unique: true, where: 'code IS NOT NULL' });

  pgm.createTable('story_game_players', {
    game_id: { type: 'uuid', notNull: true, references: 'story_games', onDelete: 'CASCADE' },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    seat: { type: 'smallint', notNull: true },
    joined_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    last_seen_at: { type: 'timestamptz' },
    done_reading_at: { type: 'timestamptz' },
    continued_index: { type: 'smallint' },
    extra_time: { type: 'boolean', notNull: true, default: false },
    left_at: { type: 'timestamptz' },
    removed: { type: 'boolean', notNull: true, default: false },
    score: { type: 'integer', notNull: true, default: 0 },
    correct: { type: 'integer', notNull: true, default: 0 },
    answered: { type: 'integer', notNull: true, default: 0 },
    correct_ms: { type: 'bigint', notNull: true, default: 0 },
    xp_awarded: { type: 'integer', notNull: true, default: 0 },
    learning_counted: { type: 'boolean', notNull: true, default: false },
  });
  pgm.addConstraint('story_game_players', 'story_game_players_pkey', { primaryKey: ['game_id', 'user_id'] });
  pgm.addConstraint('story_game_players', 'story_game_players_seat_uniq', { unique: ['game_id', 'seat'] });
  // "my games": active, history, quests, erasure, blocks
  pgm.createIndex('story_game_players', 'user_id');

  pgm.createTable('story_game_answers', {
    game_id: { type: 'uuid', notNull: true },
    user_id: { type: 'uuid', notNull: true },
    question_index: { type: 'smallint', notNull: true },
    choice: { type: 'smallint', notNull: true },
    correct: { type: 'boolean', notNull: true },
    answered_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    elapsed_ms: { type: 'integer', notNull: true },
  });
  pgm.addConstraint('story_game_answers', 'story_game_answers_pkey', {
    primaryKey: ['game_id', 'user_id', 'question_index'],
  });
  pgm.addConstraint('story_game_answers', 'story_game_answers_player_fk', {
    foreignKeys: {
      columns: ['game_id', 'user_id'],
      references: 'story_game_players(game_id, user_id)',
      onDelete: 'CASCADE',
    },
  });

  pgm.createTable('story_completions', {
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    story_id: { type: 'uuid', notNull: true, references: 'stories', onDelete: 'CASCADE' },
    first_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('story_completions', 'story_completions_pkey', { primaryKey: ['user_id', 'story_id'] });
};

export const down = (pgm) => {
  pgm.dropTable('story_completions');
  pgm.dropTable('story_game_answers');
  pgm.dropTable('story_game_players');
  pgm.dropTable('story_games');
};
