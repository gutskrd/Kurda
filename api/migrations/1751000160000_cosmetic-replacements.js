/**
 * Where the shop's art was replaced, and what each owner of a replaced item may
 * still do about it.
 *
 * The shop's backgrounds and icons are drawn by code now
 * (scripts/generate-cosmetic-art.mjs). The items that were on sale before keep
 * their rows, because people own them, and each is pointed at new art in the
 * same mood; the next migration does that to the catalogue. These two tables
 * are what it leaves behind:
 *
 *  cosmetic_replacements  one row per catalogue item whose art was swapped,
 *                         holding what the row looked like before — so the
 *                         swap can be undone, and so the API can tell a
 *                         replaced item from one that was merely withdrawn.
 *
 *  cosmetic_refreshes     one row per owner of a replaced item: what they paid
 *                         for it (the refund a return gives back, recorded
 *                         once, when the art changed), whether they have seen
 *                         the one-time "we refreshed your items" notice, and
 *                         whether they have returned it. A return is refunded
 *                         once: `returned_at` is set in the same transaction as
 *                         the credit, and the credit's ledger key is made from
 *                         the row's `id` — unique, and never shown to anyone,
 *                         so no request can take that key first.
 */

export const up = (pgm) => {
  pgm.createTable('cosmetic_replacements', {
    sku: { type: 'text', primaryKey: true, references: 'shop_items', onDelete: 'CASCADE' },
    previous_asset_key: { type: 'text' },
    previous_name: { type: 'text', notNull: true },
    previous_description: { type: 'text' },
    previous_active: { type: 'boolean', notNull: true },
    replaced_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('cosmetic_refreshes', {
    /** the refund's ledger key is made from this; it never leaves the server */
    id: { type: 'uuid', notNull: true, unique: true, default: pgm.func('gen_random_uuid()') },
    user_id:{ type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    sku: { type: 'text', notNull: true, references: 'shop_items', onDelete: 'CASCADE' },
    /** what returning it gives back: the owner's own purchase, never a gift's price */
    refund_currency: { type: 'text', notNull: true },
    refund_amount: { type: 'integer', notNull: true, default: 0 },
    /** when the owner acknowledged the notice; null shows it once more */
    noticed_at: { type: 'timestamptz' },
    returned_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('cosmetic_refreshes', 'cosmetic_refreshes_pkey', { primaryKey: ['user_id', 'sku'] });
  pgm.addConstraint('cosmetic_refreshes', 'cosmetic_refreshes_currency_check', {
    check: "refund_currency IN ('zer','gems')",
  });
  pgm.addConstraint('cosmetic_refreshes', 'cosmetic_refreshes_amount_check', { check: 'refund_amount >= 0' });
};

export const down = (pgm) => {
  pgm.dropTable('cosmetic_refreshes');
  pgm.dropTable('cosmetic_replacements');
};
