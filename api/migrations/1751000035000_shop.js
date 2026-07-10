/**
 * Shop + inventory (KUR-071). shop_items is the sellable catalog (the avatar
 * cosmetic system it originally fed was removed in #182, so this is a generic
 * entitlements catalog: PFP frames, UI themes, consumables, etc.).
 * user_entitlements is what a user owns — unique items are one-per-user via the
 * (user_id, sku) primary key, which also makes the purchase grant idempotent.
 */

export const up = (pgm) => {
  pgm.createTable('shop_items', {
    sku: { type: 'text', primaryKey: true },
    name: { type: 'text', notNull: true },
    description: { type: 'text' },
    category: { type: 'text', notNull: true, default: 'misc' },
    currency: { type: 'text', notNull: true },
    price: { type: 'integer', notNull: true },
    /** unique items can be owned once; non-unique are re-buyable consumables */
    is_unique: { type: 'boolean', notNull: true, default: true },
    active: { type: 'boolean', notNull: true, default: true },
    /** optional availability window for limited-time drops */
    available_from: { type: 'timestamptz' },
    available_to: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('shop_items', 'shop_items_currency_check', {
    check: "currency IN ('zer','gems')",
  });
  pgm.addConstraint('shop_items', 'shop_items_price_check', { check: 'price >= 0' });
  pgm.createIndex('shop_items', ['active', 'category']);

  pgm.createTable('user_entitlements', {
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    sku: { type: 'text', notNull: true, references: 'shop_items', onDelete: 'CASCADE' },
    /** how it was acquired: 'purchase' | 'grant' | 'reward' */
    source: { type: 'text', notNull: true, default: 'purchase' },
    /** count for stackable/consumable items; unique items stay at 1 */
    quantity: { type: 'integer', notNull: true, default: 1 },
    acquired_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('user_entitlements', 'user_entitlements_pkey', {
    primaryKey: ['user_id', 'sku'],
  });
};

export const down = (pgm) => {
  pgm.dropTable('user_entitlements');
  pgm.dropTable('shop_items');
};
