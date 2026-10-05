/**
 * Recordings for the alphabet page, one per sound.
 *
 * The page ships with synthesised clips for every letter and example word; a
 * row here is a person's recording that replaces one of them. The key is the
 * sound's key from @kurda/shared's ALPHABET_CLIPS, so there is at most one
 * recording per sound, and deleting the row brings the synthesised clip back.
 *
 * The audio itself lives in media storage, content-addressed, like every other
 * upload; this only says which file now speaks for which sound, and who put it
 * there.
 */

export const up = (pgm) => {
  pgm.createTable('alphabet_audio', {
    key: { type: 'text', primaryKey: true },
    /** the media_uploads key of the file */
    media_key: { type: 'text', notNull: true },
    url: { type: 'text', notNull: true },
    content_type: { type: 'text', notNull: true },
    duration_ms: { type: 'integer' },
    /** who recorded or uploaded it; kept if they are later deleted */
    updated_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
};

export const down = (pgm) => {
  pgm.dropTable('alphabet_audio');
};
