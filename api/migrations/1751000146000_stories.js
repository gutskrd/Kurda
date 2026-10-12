/**
 * Stories: short Kurdish texts Hevalo writes, to read and then be quizzed on
 * (they replace the ranked quiz). The games played on them have their own
 * tables (1751000147000); this is the content.
 *
 * `stories` is written in the admin panel and published by a person: draft →
 * in_review → published, archived to retire one, with `lock_version` so two
 * editors cannot overwrite each other. A draft may be unfinished — no text yet,
 * or a word count between two lengths — so `length` is NULL until the text
 * falls in a band and `body` may be empty; only a published story must have a
 * length (the hub filters on it, and a game is sized by it), and the API
 * refuses to publish an empty or between-lengths text.
 *
 * `sentence_keys` holds the recording key (`lessonAudioKey`) of every sentence
 * the reader can play, written on each save, so "fully narrated" is one SQL
 * comparison against `lesson_audio` instead of splitting every story's text
 * on every list request.
 *
 * `story_questions` is each story's bank. Games copy the questions they use
 * when they start, so editing a story never changes a game in progress.
 *
 * `content_seeds` remembers which content the API has seeded on its own (the
 * starter stories, one row each), so a starter an editor archived or deleted
 * stays gone instead of coming back on the next restart.
 */

export const up = (pgm) => {
  pgm.createTable('stories', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    slug: { type: 'text', notNull: true, unique: true },
    dialect: { type: 'text', notNull: true },
    level: { type: 'smallint', notNull: true },
    title: { type: 'text', notNull: true },
    summary: { type: 'text' },
    body: { type: 'text', notNull: true, default: '' },
    /** countStoryWords(body) */
    word_count: { type: 'integer', notNull: true, default: 0 },
    /** storyLengthFor(dialect, word_count): null while a draft falls between bands */
    length: { type: 'text' },
    /** StoryGlossEntry[] */
    glossary: { type: 'jsonb', notNull: true, default: pgm.func(`'[]'::jsonb`) },
    /** lessonAudioKey of each storyAudioSentences sentence, without repeats */
    sentence_keys: { type: 'text[]', notNull: true, default: pgm.func(`'{}'::text[]`) },
    status: { type: 'text', notNull: true, default: 'draft' },
    lock_version: { type: 'integer', notNull: true, default: 0 },
    /** 'starter': seeded by the API from api/content/stories, waiting for a native speaker */
    source: { type: 'text', notNull: true, default: 'admin' },
    created_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    updated_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    published_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    published_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('stories', 'stories_slug_format', { check: "slug ~ '^[a-z0-9-]{3,80}$'" });
  pgm.addConstraint('stories', 'stories_dialect_check', { check: "dialect IN ('kurmanci', 'sorani')" });
  pgm.addConstraint('stories', 'stories_level_check', { check: 'level BETWEEN 1 AND 3' });
  pgm.addConstraint('stories', 'stories_title_length', { check: 'char_length(title) BETWEEN 1 AND 120' });
  pgm.addConstraint('stories', 'stories_summary_length', { check: 'summary IS NULL OR char_length(summary) <= 300' });
  pgm.addConstraint('stories', 'stories_body_length', { check: 'char_length(body) BETWEEN 0 AND 6000' });
  pgm.addConstraint('stories', 'stories_length_check', {
    check: "length IS NULL OR length IN ('short', 'medium', 'long')",
  });
  pgm.addConstraint('stories', 'stories_published_has_length', { check: "status <> 'published' OR length IS NOT NULL" });
  pgm.addConstraint('stories', 'stories_glossary_shape', {
    check: "jsonb_typeof(glossary) = 'array' AND jsonb_array_length(glossary) <= 20",
  });
  pgm.addConstraint('stories', 'stories_status_check', {
    check: "status IN ('draft', 'in_review', 'published', 'archived')",
  });
  pgm.addConstraint('stories', 'stories_source_check', { check: "source IN ('admin', 'starter')" });
  // the hub's filters: published stories of a variety, by length and level
  pgm.createIndex('stories', ['status', 'dialect', 'length', 'level']);
  pgm.createTrigger('stories', 'stories_set_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    level: 'ROW',
    function: 'set_updated_at',
  });

  pgm.createTable('story_questions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    story_id: { type: 'uuid', notNull: true, references: 'stories', onDelete: 'CASCADE' },
    /** authoring order, from 0 */
    position: { type: 'integer', notNull: true },
    kind: { type: 'text', notNull: true },
    prompt: { type: 'text', notNull: true },
    prompt_en: { type: 'text' },
    /** 2–4 strings; which is right is checked against their number in code */
    options: { type: 'jsonb', notNull: true },
    correct_index: { type: 'smallint', notNull: true },
    explanation: { type: 'text' },
    explanation_en: { type: 'text' },
    /** index into storyParagraphs(body) */
    evidence_paragraph: { type: 'smallint' },
    /** index into storySentences(paragraph) of that paragraph */
    evidence_sentence: { type: 'smallint' },
  });
  pgm.addConstraint('story_questions', 'story_questions_position_uniq', { unique: ['story_id', 'position'] });
  pgm.addConstraint('story_questions', 'story_questions_kind_check', {
    check: "kind IN ('gist', 'detail', 'vocabulary', 'sequence', 'inference')",
  });
  pgm.addConstraint('story_questions', 'story_questions_prompt_length', {
    check: 'char_length(prompt) BETWEEN 1 AND 300 AND (prompt_en IS NULL OR char_length(prompt_en) <= 300)',
  });
  pgm.addConstraint('story_questions', 'story_questions_options_shape', {
    check: "jsonb_typeof(options) = 'array' AND jsonb_array_length(options) BETWEEN 2 AND 4",
  });
  pgm.addConstraint('story_questions', 'story_questions_correct_index', { check: 'correct_index BETWEEN 0 AND 3' });
  // one line beside the answer (QUESTION_EXPLANATION_MAX)
  pgm.addConstraint('story_questions', 'story_questions_explanation_length', {
    check:
      '(explanation IS NULL OR char_length(explanation) <= 160) AND (explanation_en IS NULL OR char_length(explanation_en) <= 160)',
  });
  pgm.addConstraint('story_questions', 'story_questions_evidence_check', {
    check:
      '(evidence_paragraph IS NULL OR evidence_paragraph >= 0) AND (evidence_sentence IS NULL OR (evidence_sentence >= 0 AND evidence_paragraph IS NOT NULL))',
  });

  pgm.createTable('content_seeds', {
    /** e.g. 'stories:starter:kmr-qelema-sin' */
    name: { type: 'text', primaryKey: true },
    applied_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
};

export const down = (pgm) => {
  pgm.dropTable('content_seeds');
  pgm.dropTable('story_questions');
  pgm.dropTable('stories');
};
