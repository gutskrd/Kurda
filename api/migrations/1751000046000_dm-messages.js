/**
 * 1:1 direct messages (KUR-083). One row per message, addressed by the
 * canonically-ordered pair (user_lo < user_hi) so a conversation is a single
 * key regardless of direction. delivered_at / read_at back the receipts.
 * WebSocket push is live delivery; the rows are the offline-delivery + history
 * store fetched on reconnect.
 */

export const up = (pgm) => {
  pgm.createTable('dm_messages', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_lo: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    user_hi: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    sender_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    body: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    delivered_at: { type: 'timestamptz' },
    read_at: { type: 'timestamptz' },
  });
  pgm.addConstraint('dm_messages', 'dm_messages_order_check', { check: 'user_lo < user_hi' });
  pgm.addConstraint('dm_messages', 'dm_messages_len_check', {
    check: 'char_length(body) BETWEEN 1 AND 2000',
  });
  pgm.createIndex('dm_messages', ['user_lo', 'user_hi', 'created_at']);
  // fast unread lookups per recipient
  pgm.createIndex('dm_messages', ['sender_id', 'read_at']);
};

export const down = (pgm) => {
  pgm.dropTable('dm_messages');
};
