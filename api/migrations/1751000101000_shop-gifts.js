/**
 * Gifts: one person buying a shop item for another.
 *
 * A row per gift, kept after the entitlement is granted so the recipient has a
 * "who sent me this" list rather than an item that silently appears in their
 * inventory. `seen_at` drives the unopened count, so the notification can be
 * followed to something that acknowledges it.
 *
 * The sender is nullable so deleting an account leaves the recipient's gift
 * intact — they still own the item, and the row should not vanish with the
 * person who sent it.
 */

export const up = (pgm) => {
  pgm.createTable('gifts', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    from_user_id: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    to_user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    sku: { type: 'text', notNull: true, references: 'shop_items', onDelete: 'CASCADE' },
    /** what the sender paid, recorded at the time — prices change */
    price: { type: 'integer', notNull: true },
    currency: { type: 'text', notNull: true },
    /**
     * The sender's retry key. The gift row — not the wallet ledger — is what
     * makes a gift idempotent: a retry has to be recognised BEFORE the
     * already-owns check, or the second attempt reports that the recipient
     * owns the very item the first attempt just gave them.
     */
    idempotency_key: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    seen_at: { type: 'timestamptz' },
  });
  pgm.createIndex('gifts', ['from_user_id', 'idempotency_key'], {
    unique: true,
    where: 'idempotency_key IS NOT NULL',
  });
  pgm.addConstraint('gifts', 'gifts_not_to_self', { check: 'from_user_id IS NULL OR from_user_id <> to_user_id' });
  // the recipient's list, and their unopened count
  pgm.createIndex('gifts', ['to_user_id', 'created_at']);
};

export const down = (pgm) => {
  pgm.dropTable('gifts');
};
