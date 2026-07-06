/**
 * Tracks issued upload tickets (KUR-013). A row is created when a signed
 * URL is issued and confirmed when the owning record (avatar, lesson
 * audio, ...) references the key. Unconfirmed rows older than 24h are
 * orphans: the cleanup job deletes the object and the row.
 */

export const up = (pgm) => {
  pgm.createTable('media_uploads', {
    key: { type: 'text', primaryKey: true },
    content_type: { type: 'text', notNull: true },
    content_length: { type: 'integer', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    confirmed_at: { type: 'timestamptz' },
  });
  pgm.createIndex('media_uploads', 'created_at', {
    name: 'media_uploads_orphan_scan',
    where: 'confirmed_at IS NULL',
  });
};

export const down = (pgm) => {
  pgm.dropTable('media_uploads');
};
