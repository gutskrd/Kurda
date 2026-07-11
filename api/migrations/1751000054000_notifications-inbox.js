/**
 * In-app notification inbox (KUR-097). Every notification produced for a user is
 * recorded here (independent of push delivery) so the bell/inbox can show a
 * catch-up list with a server-side read state that syncs across devices. `data`
 * carries the deep-link target. Reads are the last 50 per user, newest first.
 */

export const up = (pgm) => {
  pgm.createTable('notifications', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    category: { type: 'text', notNull: true },
    title: { type: 'text', notNull: true },
    body: { type: 'text', notNull: true },
    data: { type: 'jsonb', notNull: true, default: '{}' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    read_at: { type: 'timestamptz' },
  });
  // inbox reads: newest-first per user
  pgm.createIndex('notifications', ['user_id', 'created_at']);
  // unread-count reads
  pgm.createIndex('notifications', ['user_id'], {
    where: 'read_at IS NULL',
    name: 'notifications_unread',
  });
};

export const down = (pgm) => {
  pgm.dropTable('notifications');
};
