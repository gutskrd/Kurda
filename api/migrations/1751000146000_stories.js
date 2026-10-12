/**
 * Stories: short Kurdish texts Hevalo writes, to read and then be quizzed on
 * (they replace the ranked quiz). The texts and their question banks; the
 * games played on them are 1751000147000.
 *
 * A story is edited as a draft and reaches learners only when a reviewer
 * publishes it, so a draft has to be saveable half-written: its length band
 * may still be unknown (the word count falls between bands, or there is no
 * text yet) and its body may be empty. A published story always has a length
 * — every list and "Surprise me" filters on it.
 *
 * `sentence_keys` holds the recording key of every sentence a reader could
 * hear (`lessonAudioKey` over `storyAudioSentences`), written on every save,
 * so "fully narrated" is a SQL question against `lesson_audio` rather than a
 * re-split of every body on every list.
 *
 * A question bank belongs to its story and goes with it. Games keep their own
 * copy of the questions they ask, so editing a story never changes a game.
 */

export const up = (pgm) => {
  pgm.createTable('stories', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    slug: { type: 'text', notNull: true, unique: true, check: "slug ~ '^[a-z0-9-]{3,80}$'" },
    dialect: { type: 'text', notNull: true, check: "dialect IN ('kurmanci','sorani')" },
    level: { type: 'smallint', notNull: true, check: 'level BETWEEN 1 AND 3' },
    title: { type: 'text', notNull: true, check: 'char_length(title) BETWEEN 1 AND 120' },
    summary: { type: 'text', check: 'summary IS NULL OR char_length(summary) <= 300' },
    body: { type: 'text', notNull: true, default: '', check: 'char_length(body) BETWEEN 0 AND 6000' },
    word_count: { type: 'integer', notNull: true, default: 0 },
    length: { type: 'text', check: "length IS NULL OR length IN ('short','medium','long')" },
    glossary: { type: 'jsonb', notNull: true, default: '[]' },
    sentence_keys: { type: 'text[]', notNull: true, default: '{}' },
    status: {
      type: 'text',
      notNull: true,
      default: 'draft',
      check: "status IN ('draft','in_review','published','archived')",
    },
    lock_version: { type: 'integer', notNull: true, default: 0 },
    source: { type: 'text', notNull: true, default: 'admin', check: "source IN ('admin','starter')" },
    created_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    updated_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    published_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    published_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('stories', 'stories_published_has_length', {
    check: "status <> 'published' OR length IS NOT NULL",
  });
  pgm.createIndex('stories', ['status', 'dialect', 'length', 'level']);

  pgm.createTable('story_questions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    story_id: { type: 'uuid', notNull: true, references: 'stories', onDelete: 'CASCADE' },
    position: { type: 'integer', notNull: true },
    kind: {
      type: 'text',
      notNull: true,
      check: "kind IN ('gist','detail','vocabulary','sequence','inference')",
    },
    prompt: { type: 'text', notNull: true, check: 'char_length(prompt) <= 300' },
    prompt_en: { type: 'text', check: 'prompt_en IS NULL OR char_length(prompt_en) <= 300' },
    // an array of 2..4 strings; the editor and publish check the rest
    options: { type: 'jsonb', notNull: true, check: "jsonb_typeof(options) = 'array'" },
    correct_index: { type: 'smallint', notNull: true, check: 'correct_index BETWEEN 0 AND 3' },
    explanation: { type: 'text', check: 'explanation IS NULL OR char_length(explanation) <= 160' },
    explanation_en: { type: 'text', check: 'explanation_en IS NULL OR char_length(explanation_en) <= 160' },
    evidence_paragraph: { type: 'integer' },
    evidence_sentence: { type: 'smallint' },
  });
  pgm.addConstraint('story_questions', 'story_questions_story_position_uniq', {
    unique: ['story_id', 'position'],
  });
};

export const down = (pgm) => {
  pgm.dropTable('story_questions');
  pgm.dropTable('stories');
};
