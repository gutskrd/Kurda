/**
 * Cosmetics foundation (profile backgrounds, premium icons, default avatars,
 * favorites, premium state). Additive + reversible. The DB stores only compact
 * references (keys/SKUs/content ids) — never media bytes. Cosmetic catalog reuses
 * the existing shop_items + user_entitlements tables (KUR-071); this only adds:
 *
 *  shop_items.asset_key      the storage/static key the app resolves to a URL
 *  shop_items.premium_only   accessible while premium is active (still buyable)
 *  shop_items.display_order  catalog ordering
 *
 *  users.selected_avatar_key   chosen default avatar (web-static key)
 *  users.equipped_background_sku / equipped_icon_sku  equipped catalog items
 *  users.premium_until         server-authoritative premium/subscription expiry
 *  users.favorite_poem_id / favorite_story_id  references into library_posts
 *
 * Equipped-SKU and favorite FKs use ON DELETE SET NULL so removing an item or a
 * poem/story never breaks a profile (safe read-time fallback).
 */
export const up = (pgm) => {
  pgm.addColumns('shop_items', {
    asset_key: { type: 'text' },
    premium_only: { type: 'boolean', notNull: true, default: false },
    display_order: { type: 'integer', notNull: true, default: 0 },
  });
  pgm.createIndex('shop_items', ['category', 'display_order']);

  pgm.addColumns('users', {
    selected_avatar_key: { type: 'text' },
    equipped_background_sku: { type: 'text', references: 'shop_items', onDelete: 'SET NULL' },
    equipped_icon_sku: { type: 'text', references: 'shop_items', onDelete: 'SET NULL' },
    premium_until: { type: 'timestamptz' },
    favorite_poem_id: { type: 'uuid', references: 'library_posts', onDelete: 'SET NULL' },
    favorite_story_id: { type: 'uuid', references: 'library_posts', onDelete: 'SET NULL' },
  });
};

export const down = (pgm) => {
  pgm.dropColumns('users', [
    'selected_avatar_key',
    'equipped_background_sku',
    'equipped_icon_sku',
    'premium_until',
    'favorite_poem_id',
    'favorite_story_id',
  ]);
  pgm.dropIndex('shop_items', ['category', 'display_order']);
  pgm.dropColumns('shop_items', ['asset_key', 'premium_only', 'display_order']);
};
