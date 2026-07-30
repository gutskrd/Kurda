/**
 * Group chat (KUR-085). group_messages is the per-channel message store (soft
 * delete via deleted_at so moderators can remove without gaps). group_mutes
 * records timed/permanent mutes (muted_until NULL = permanent). group_reads is
 * each member's last-read marker, driving per-group unread counts. Live fan-out
 * rides the KUR-049 room bus (Redis pub/sub) on the `group:{id}` room.
 */

export const up = (pgm) => {
  pgm.createTable('group_messages', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    group_id: { type: 'uuid', notNull: true, references: 'groups', onDelete: 'CASCADE' },
    sender_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    body: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    deleted_at: { type: 'timestamptz' },
  });
  pgm.addConstraint('group_messages', 'group_messages_len_check', {
    check: 'char_length(body) BETWEEN 1 AND 2000',
  });
  pgm.createIndex('group_messages', ['group_id', 'created_at']);

  pgm.createTable('group_mutes', {
    group_id: { type: 'uuid', notNull: true, references: 'groups', onDelete: 'CASCADE' },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    /** NULL = permanent mute */
    muted_until: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('group_mutes', 'group_mutes_pkey', { primaryKey: ['group_id', 'user_id'] });

  pgm.createTable('group_reads', {
    group_id: { type: 'uuid', notNull: true, references: 'groups', onDelete: 'CASCADE' },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    last_read_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('group_reads', 'group_reads_pkey', { primaryKey: ['group_id', 'user_id'] });
};

export const down = (pgm) => {
  pgm.dropTable('group_reads');
  pgm.dropTable('group_mutes');
  pgm.dropTable('group_messages');
};
