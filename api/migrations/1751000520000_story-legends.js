/**
 * Stories long enough to hold a legend, and translations that can be put right
 * one language at a time.
 *
 * The library's stories were written for a few minutes' reading: at most 6,000
 * characters and three lengths. A legend such as Mem û Zîn runs to well over a
 * thousand words in sections, with notes on what is history and what is
 * legend, several sources, and questions a learner reads in their own
 * language. So:
 *
 * - `stories.body` holds up to 16,000 characters, and a story (and a game
 *   played on one) may be of the new length `saga`.
 * - `meta_translations` is the title and summary per interface language
 *   (`{locale: {title, summary}}`), beside `translations`, which stays the
 *   body per language.
 * - `reflections` are open questions to think about after reading, with their
 *   translations (`[{text, translations: {locale: text}}]`), at most six.
 * - `notes` say what is history, what is legend, how the versions differ, or
 *   what a custom means (`[{kind, title, body, translations}]`), at most four.
 * - `sources` lists where the telling comes from, each with its type
 *   (`[{title, author?, url?, type, note?}]`), at most eight; the single
 *   `story_source` and `source_url` stay for the stories that have them.
 * - `translation_review` records, per language, whether a native speaker has
 *   read its translation (`{locale: {status, by?, at?, note?}}`). A
 *   translation can be corrected on a published story without taking it
 *   offline, so its review is kept apart from the story's own.
 * - `story_questions.translations` is each question in the interface
 *   languages (`{locale: {prompt, options, explanation}}`), so a question is
 *   no longer only in Kurdish and English.
 *
 * The API checks what goes inside each of these (shared/src/story-authoring.ts);
 * the table checks only that each is the right kind of JSON and the lists stay
 * within their limits, as for the glossary.
 *
 * Every check is added NOT VALID (a moment's lock, and every new row is checked
 * from then on) and then validated against the rows already there under a lock
 * that lets readers and the running server carry on. The widened checks pass
 * every existing row and the new columns start at their defaults, so the
 * validation only confirms it. That needs each statement to commit on its own,
 * hence noTransaction(), and every step tolerates a second run after a failed
 * first one.
 */

/** Checks replaced by wider ones: [table, name, up, down]. */
const WIDENED = [
  ['stories', 'stories_body_length', 'char_length(body) BETWEEN 0 AND 16000', 'char_length(body) BETWEEN 0 AND 6000'],
  [
    'stories',
    'stories_length_check',
    "length IS NULL OR length IN ('short', 'medium', 'long', 'saga')",
    "length IS NULL OR length IN ('short', 'medium', 'long')",
  ],
  ['story_games', 'story_games_length_check', "length IN ('short', 'medium', 'long', 'saga')", "length IN ('short', 'medium', 'long')"],
];

/** The new columns: [table, column, type and default]. */
const COLUMNS = [
  ['stories', 'meta_translations', "jsonb NOT NULL DEFAULT '{}'::jsonb"],
  ['stories', 'reflections', "jsonb NOT NULL DEFAULT '[]'::jsonb"],
  ['stories', 'notes', "jsonb NOT NULL DEFAULT '[]'::jsonb"],
  ['stories', 'sources', "jsonb NOT NULL DEFAULT '[]'::jsonb"],
  ['stories', 'translation_review', "jsonb NOT NULL DEFAULT '{}'::jsonb"],
  ['story_questions', 'translations', "jsonb NOT NULL DEFAULT '{}'::jsonb"],
];

/** Their shapes: [table, name, check]. The limits are STORY_REFLECTIONS_MAX, STORY_NOTES_MAX and STORY_SOURCES_MAX. */
const SHAPES = [
  ['stories', 'stories_meta_translations_shape', "jsonb_typeof(meta_translations) = 'object'"],
  ['stories', 'stories_reflections_shape', "jsonb_typeof(reflections) = 'array' AND jsonb_array_length(reflections) <= 6"],
  ['stories', 'stories_notes_shape', "jsonb_typeof(notes) = 'array' AND jsonb_array_length(notes) <= 4"],
  ['stories', 'stories_sources_shape', "jsonb_typeof(sources) = 'array' AND jsonb_array_length(sources) <= 8"],
  ['stories', 'stories_translation_review_shape', "jsonb_typeof(translation_review) = 'object'"],
  ['story_questions', 'story_questions_translations_shape', "jsonb_typeof(translations) = 'object'"],
];

function replaceCheck(pgm, table, name, check, validate = true) {
  // dropped and added in one statement, so no write ever lands between the two unchecked
  pgm.sql(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${name}, ADD CONSTRAINT ${name} CHECK (${check}) NOT VALID`);
  if (validate) pgm.sql(`ALTER TABLE ${table} VALIDATE CONSTRAINT ${name}`);
}

export const up = (pgm) => {
  pgm.noTransaction();
  for (const [table, name, check] of WIDENED) replaceCheck(pgm, table, name, check);
  for (const [table, column, type] of COLUMNS) pgm.sql(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${type}`);
  for (const [table, name, check] of SHAPES) replaceCheck(pgm, table, name, check);
};

export const down = (pgm) => {
  pgm.noTransaction();
  for (const [table, name] of SHAPES) pgm.sql(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${name}`);
  for (const [table, column] of COLUMNS) pgm.sql(`ALTER TABLE ${table} DROP COLUMN IF EXISTS ${column}`);
  // a saga becomes the longest length the narrower checks know, on the stories and on the games played on them
  pgm.sql(`UPDATE story_games SET length = 'long' WHERE length = 'saga'`);
  pgm.sql(`UPDATE stories SET length = 'long' WHERE length = 'saga'`);
  for (const [table, name, , check] of WIDENED) {
    // a text written past 6,000 characters meanwhile is kept as it is (the narrower check holds for new writes only)
    replaceCheck(pgm, table, name, check, name !== 'stories_body_length');
  }
};
