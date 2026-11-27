/**
 * Ten animal icons go on sale beside the made ones: drawn by the generator as the other icons are
 * (scripts/cosmetic-art/icons-friends.mjs), each in a hand of its own — a rabbit in brush and ink, a fox knight cut
 * as a print, an engraved cat in boots, a crayon kitten with a bow, a dove in one blue line, two bears, a round cow, a
 * hen and a kiwi. Like every made icon they are bought with Zêr and lent to members (`premium_only`).
 *
 * On a row that already exists only the presentation is refreshed (name, description, art, order), so an admin's
 * price and availability stand. Down takes them off whoever wears them, out of what people own and out of the shop;
 * what was paid for them is not handed back by a migration.
 *
 * The data is frozen here rather than read from api/content/cosmetics.json, so this migration keeps meaning what it
 * meant (api/src/cosmetics/catalogue.test.ts checks the two agree today).
 */

/** [sku, name, description, assetKey, price, displayOrder] */
export const ICONS = [
  ['icon-made-kerosk', 'Kêroşka Bihêz', 'Strong rabbit', 'icons/made-15-kerosk.png', 200, 14],
  ['icon-made-rovi', 'Rovîyê Şûrdar', 'Fox knight', 'icons/made-16-rovi.png', 250, 15],
  ['icon-made-pisik-cizme', 'Pisîka Bi Çizme', 'Cat in boots', 'icons/made-17-pisik-cizme.png', 250, 16],
  ['icon-made-pisik-qurdele', 'Pisîka Bi Qurdele', 'Kitten with a bow', 'icons/made-18-pisik-qurdele.png', 200, 17],
  ['icon-made-kevoka-sin', 'Kevoka Şîn', 'Blue dove', 'icons/made-19-kevoka-sin.png', 150, 18],
  ['icon-made-hirc', 'Hirç', 'Bear', 'icons/made-20-hirc.png', 200, 19],
  ['icon-made-hirca-spi', 'Hirça Spî', 'White bear', 'icons/made-21-hirca-spi.png', 150, 20],
  ['icon-made-celek', 'Çêlek', 'Cow', 'icons/made-22-celek.png', 200, 21],
  ['icon-made-mirisk', 'Mirîşk', 'Hen', 'icons/made-23-mirisk.png', 200, 22],
  ['icon-made-kiwi', 'Kîwî', 'Kiwi', 'icons/made-24-kiwi.png', 150, 23],
];

export const up = async (pgm) => {
  for (const [sku, name, description, assetKey, price, displayOrder] of ICONS) {
    await pgm.db.query(
      `INSERT INTO shop_items
         (sku, name, description, category, currency, price, is_unique, active, in_stock,
          asset_key, premium_only, display_order)
       VALUES ($1,$2,$3,'icon','zer',$4,true,true,true,$5,true,$6)
       ON CONFLICT (sku) DO UPDATE SET
         name = EXCLUDED.name, description = EXCLUDED.description,
         asset_key = EXCLUDED.asset_key, display_order = EXCLUDED.display_order`,
      [sku, name, description, price, assetKey, displayOrder],
    );
  }
};

export const down = async (pgm) => {
  const skus = ICONS.map(([sku]) => sku);
  await pgm.db.query(`UPDATE users SET equipped_icon_sku = NULL WHERE equipped_icon_sku = ANY($1)`, [skus]);
  await pgm.db.query(`DELETE FROM user_entitlements WHERE sku = ANY($1)`, [skus]);
  await pgm.db.query(`DELETE FROM shop_items WHERE sku = ANY($1)`, [skus]);
};
