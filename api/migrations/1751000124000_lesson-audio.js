/**
 * Native recordings of the Kurdish that lessons use: one per sentence or word.
 *
 * The key is `lessonAudioKey` from @kurda/shared — the text lower-cased, with
 * its whitespace, letter variants and trailing punctuation evened out — so a
 * sentence recorded once serves every exercise that uses it, in any lesson.
 * `text` is how it was typed when it was recorded, for the studio to show.
 *
 * Rows are not tied to exercises: published lessons are immutable and each
 * edit is a new version with new exercise ids, so a recording keyed on the
 * text survives every version of every lesson that says it.
 *
 * The audio itself lives in media storage, content-addressed, like the
 * alphabet recordings (1751000119000).
 */

export const up = (pgm) => {
  pgm.createTable('lesson_audio', {
    key: { type: 'text', primaryKey: true },
    text: { type: 'text', notNull: true },
    /** the media_uploads key of the file */
    media_key: { type: 'text', notNull: true },
    url: { type: 'text', notNull: true },
    content_type: { type: 'text', notNull: true },
    duration_ms: { type: 'integer', notNull: true },
    /** who recorded or uploaded it; kept if they are later deleted */
    recorded_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('lesson_audio', 'lesson_audio_key_not_blank', { check: "key <> ''" });
};

export const down = (pgm) => {
  pgm.dropTable('lesson_audio');
};
