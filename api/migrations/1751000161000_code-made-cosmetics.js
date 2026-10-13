/**
 * The shop's art is drawn by code now: the code-made pieces go on sale, and
 * every item that was on sale before gets new art in the same mood and is taken
 * out of the shop — but stays with whoever owns it.
 *
 * What it does, in order:
 *
 * 1. Puts the code-made backgrounds and icons (`bg-made-*`, `icon-made-*`) in
 *    the shop. On a row that already exists only the presentation is refreshed
 *    (name, description, art, order), the way the first catalogue seed treats
 *    an admin's price and availability.
 *
 * 2. Replaces the art of the 52 `bg-background-*` and 17 `icon-accessoire-*`
 *    items, and of any other item whose `asset_key` names one of the files
 *    that were removed — an item an admin made by hand through
 *    `POST /shop/items` would otherwise point at a picture that no longer
 *    exists. Each takes the name and art of the made piece it was matched with;
 *    what it looked like before is kept in `cosmetic_replacements`. Each is set
 *    inactive: not sold, not giftable. `api/src/cosmetics/access.ts` lets an
 *    owner keep using an inactive item, so nobody loses what they have.
 *
 * 3. Records each owner of a replaced item in `cosmetic_refreshes`, with what
 *    they paid for it: their own purchase in the wallet ledger, not counting
 *    a copy they bought as a present for somebody else. A gift received or an item
 *    granted refunds nothing — gifts are items, never currency (see
 *    shared/src/gifts.ts) — but its owner is still told the art changed.
 *
 * Re-running it changes nothing: every step skips what it already did, and a
 * replaced item's "before" is written once, so it is never overwritten with
 * the new art. The data is frozen here rather than read from
 * api/content/cosmetics.json, because the manifest will move on and this
 * migration must keep meaning what it meant (api/src/cosmetics/catalogue.test.ts
 * checks the two agree today).
 *
 * The shop's catalogue cache lives five minutes; until it expires the old
 * items may still be listed, but buying or gifting one reads the row and is
 * refused.
 */

/** [sku, category, name, description, assetKey, price, premiumOnly, displayOrder] */
const MADE = [
  ['bg-made-hevalo', 'background', 'Hevalo', 'Hevalo violet', 'backgrounds/made-01-hevalo.webp', 0, false, 0],
  ['bg-made-seva-zozanan', 'background', 'Şeva Zozanan', 'Night on the high pastures', 'backgrounds/made-02-seva-zozanan.webp', 500, true, 1],
  ['bg-made-ezmane-sterkan', 'background', 'Ezmanê Stêrkan', 'Sky full of stars', 'backgrounds/made-03-ezmane-sterkan.webp', 500, true, 2],
  ['bg-made-heyva-zivin', 'background', 'Heyva Zîvîn', 'Silver moon', 'backgrounds/made-04-heyva-zivin.webp', 500, true, 3],
  ['bg-made-berfa-ciyayan', 'background', 'Berfa Çiyayan', 'Snow on the mountains', 'backgrounds/made-05-berfa-ciyayan.webp', 500, true, 4],
  ['bg-made-gola-sin', 'background', 'Gola Şîn', 'Blue lake', 'backgrounds/made-06-gola-sin.webp', 400, true, 5],
  ['bg-made-ronahiya-bakur', 'background', 'Ronahiya Bakur', 'Northern lights', 'backgrounds/made-07-ronahiya-bakur.webp', 600, true, 6],
  ['bg-made-bin-erxewanan', 'background', 'Binê Erxewanan', 'Under the Judas trees', 'backgrounds/made-08-bin-erxewanan.webp', 500, true, 7],
  ['bg-made-berbang', 'background', 'Berbang', 'Daybreak', 'backgrounds/made-09-berbang.webp', 0, false, 8],
  ['bg-made-mija-gulan', 'background', 'Mija Gulan', 'Rose mist', 'backgrounds/made-10-mija-gulan.webp', 400, true, 9],
  ['bg-made-evara-zerin', 'background', 'Êvara Zêrîn', 'Golden evening', 'backgrounds/made-11-evara-zerin.webp', 500, true, 10],
  ['bg-made-agire-newroze', 'background', 'Agirê Newrozê', 'Newroz fire', 'backgrounds/made-12-agire-newroze.webp', 500, true, 11],
  ['bg-made-evara-sor', 'background', 'Êvara Sor', 'Red evening', 'backgrounds/made-13-evara-sor.webp', 400, true, 12],
  ['bg-made-seva-sor', 'background', 'Şeva Sor', 'Red night', 'backgrounds/made-14-seva-sor.webp', 500, true, 13],
  ['bg-made-lalezar', 'background', 'Lalezar', 'Tulip field', 'backgrounds/made-15-lalezar.webp', 500, true, 14],
  ['bg-made-zozan', 'background', 'Zozan', 'High pasture', 'backgrounds/made-16-zozan.webp', 0, false, 15],
  ['bg-made-bihar', 'background', 'Bihar', 'Spring', 'backgrounds/made-17-bihar.webp', 500, true, 16],
  ['bg-made-daristana-seve', 'background', 'Daristana Şevê', 'Forest at night', 'backgrounds/made-18-daristana-seve.webp', 500, true, 17],
  ['bg-made-mij', 'background', 'Mij', 'Mist', 'backgrounds/made-19-mij.webp', 400, true, 18],
  ['bg-made-newroz', 'background', 'Rengên Newrozê', 'The colours of Newroz', 'backgrounds/made-20-newroz.webp', 500, true, 19],
  ['bg-made-kilima-sor', 'background', 'Kilîma Sor', 'Red kilim', 'backgrounds/made-21-kilima-sor.webp', 600, true, 20],
  ['bg-made-kilima-mor', 'background', 'Kilîma Mor', 'Purple kilim', 'backgrounds/made-22-kilima-mor.webp', 600, true, 21],
  ['bg-made-kilima-zer', 'background', 'Kilîma Zer', 'Gold kilim', 'backgrounds/made-23-kilima-zer.webp', 600, true, 22],
  ['bg-made-kilima-kesk', 'background', 'Kilîma Kesk', 'Green kilim', 'backgrounds/made-24-kilima-kesk.webp', 600, true, 23],
  ['bg-made-kilima-sin', 'background', 'Kilîma Şîn', 'Blue kilim', 'backgrounds/made-25-kilima-sin.webp', 600, true, 24],
  ['bg-made-kilima-gulan', 'background', 'Kilîma Gulan', 'Rose kilim', 'backgrounds/made-26-kilima-gulan.webp', 600, true, 25],
  ['bg-made-kilima-seve', 'background', 'Kilîma Şevê', 'Night kilim', 'backgrounds/made-27-kilima-seve.webp', 600, true, 26],
  ['icon-made-hinar', 'icon', 'Hinar', 'Pomegranate', 'icons/made-01-hinar.png', 800, true, 0],
  ['icon-made-roj', 'icon', 'Roj', 'Sun', 'icons/made-02-roj.png', 600, true, 1],
  ['icon-made-ciya', 'icon', 'Çiya', 'Mountain', 'icons/made-03-ciya.png', 600, true, 2],
  ['icon-made-lale', 'icon', 'Lale', 'Tulip', 'icons/made-04-lale.png', 700, true, 3],
  ['icon-made-laleya-mor', 'icon', 'Laleya Mor', 'Purple tulip', 'icons/made-05-laleya-mor.png', 700, true, 4],
  ['icon-made-ask', 'icon', 'Ask', 'Deer', 'icons/made-06-ask.png', 900, true, 5],
  ['icon-made-sterk', 'icon', 'Stêrk', 'Eight-point star', 'icons/made-07-sterk.png', 600, true, 6],
  ['icon-made-caydan', 'icon', 'Çaydan', 'Teapot', 'icons/made-08-caydan.png', 900, true, 7],
  ['icon-made-saz', 'icon', 'Saz', 'Saz', 'icons/made-09-saz.png', 900, true, 8],
  ['icon-made-kevok', 'icon', 'Kevok', 'Dove', 'icons/made-10-kevok.png', 700, true, 9],
  ['icon-made-genim', 'icon', 'Genim', 'Wheat', 'icons/made-11-genim.png', 700, true, 10],
  ['icon-made-kilim', 'icon', 'Kilîm', 'Kilim diamond', 'icons/made-12-kilim.png', 800, true, 11],
  ['icon-made-pet', 'icon', 'Pêta Newrozê', 'Newroz flame', 'icons/made-13-pet.png', 800, true, 12],
  ['icon-made-heyv', 'icon', 'Heyv', 'Crescent moon', 'icons/made-14-heyv.png', 600, true, 13],
];

/** Old catalogue SKU → the made piece whose art and name it takes. */
const REPLACED_BY = {
  'bg-background-01': 'bg-made-evara-zerin',
  'bg-background-02': 'bg-made-berbang',
  'bg-background-03': 'bg-made-bihar',
  'bg-background-04': 'bg-made-zozan',
  'bg-background-05': 'bg-made-gola-sin',
  'bg-background-06': 'bg-made-zozan',
  'bg-background-07': 'bg-made-bihar',
  'bg-background-08': 'bg-made-bihar',
  'bg-background-09': 'bg-made-berfa-ciyayan',
  'bg-background-10': 'bg-made-daristana-seve',
  'bg-background-11': 'bg-made-evara-sor',
  'bg-background-12': 'bg-made-kilima-sor',
  'bg-background-13': 'bg-made-evara-sor',
  'bg-background-14': 'bg-made-lalezar',
  'bg-background-15': 'bg-made-kilima-sor',
  'bg-background-16': 'bg-made-mija-gulan',
  'bg-background-17': 'bg-made-seva-zozanan',
  'bg-background-18': 'bg-made-daristana-seve',
  'bg-background-19': 'bg-made-bin-erxewanan',
  'bg-background-20': 'bg-made-daristana-seve',
  'bg-background-21': 'bg-made-agire-newroze',
  'bg-background-22': 'bg-made-evara-sor',
  'bg-background-23': 'bg-made-agire-newroze',
  'bg-background-24': 'bg-made-gola-sin',
  'bg-background-25': 'bg-made-ronahiya-bakur',
  'bg-background-26': 'bg-made-kilima-sin',
  'bg-background-27': 'bg-made-seva-zozanan',
  'bg-background-28': 'bg-made-ezmane-sterkan',
  'bg-background-29': 'bg-made-berfa-ciyayan',
  'bg-background-30': 'bg-made-kilima-zer',
  'bg-background-31': 'bg-made-mij',
  'bg-background-32': 'bg-made-kilima-seve',
  'bg-background-33': 'bg-made-heyva-zivin',
  'bg-background-34': 'bg-made-seva-sor',
  'bg-background-35': 'bg-made-berbang',
  'bg-background-36': 'bg-made-mija-gulan',
  'bg-background-37': 'bg-made-ronahiya-bakur',
  'bg-background-38': 'bg-made-bin-erxewanan',
  'bg-background-39': 'bg-made-kilima-gulan',
  'bg-background-40': 'bg-made-kilima-gulan',
  'bg-background-41': 'bg-made-hevalo',
  'bg-background-42': 'bg-made-bin-erxewanan',
  'bg-background-43': 'bg-made-bin-erxewanan',
  'bg-background-44': 'bg-made-lalezar',
  'bg-background-46': 'bg-made-kilima-seve',
  'bg-background-47': 'bg-made-heyva-zivin',
  'bg-background-48': 'bg-made-mij',
  'bg-background-49': 'bg-made-ezmane-sterkan',
  'bg-background-50': 'bg-made-berfa-ciyayan',
  'bg-background-51': 'bg-made-mij',
  'bg-background-52': 'bg-made-seva-sor',
  'bg-background-53': 'bg-made-seva-sor',
  'icon-accessoire-icon-01': 'icon-made-lale',
  'icon-accessoire-icon-02': 'icon-made-genim',
  'icon-accessoire-icon-03': 'icon-made-laleya-mor',
  'icon-accessoire-icon-04': 'icon-made-caydan',
  'icon-accessoire-icon-05': 'icon-made-hinar',
  'icon-accessoire-icon-07': 'icon-made-ask',
  'icon-accessoire-icon-08': 'icon-made-kevok',
  'icon-accessoire-icon-09': 'icon-made-ask',
  'icon-accessoire-icon-10': 'icon-made-saz',
  'icon-accessoire-icon-11': 'icon-made-pet',
  'icon-accessoire-icon-12': 'icon-made-kevok',
  'icon-accessoire-icon-13': 'icon-made-heyv',
  'icon-accessoire-icon-14': 'icon-made-heyv',
  'icon-accessoire-icon-15': 'icon-made-roj',
  'icon-accessoire-icon-16': 'icon-made-sterk',
  'icon-accessoire-icon-17': 'icon-made-kilim',
  'icon-accessoire-icon-18': 'icon-made-ciya',
};

/** For an admin-made item pointing at a removed file with no catalogue twin. */
const FALLBACK = { background: 'bg-made-hevalo', icon: 'icon-made-sterk' };

/** The removed files, by the number in their name. */
const REMOVED_BACKGROUND = /^backgrounds\/background-(\d+)\.[a-z0-9]+$/;
const REMOVED_ICON = /^icons\/accessoire-icon-(\d+)\.[a-z0-9]+$/;

/** The made piece a row should take, or null when it is not one being replaced. */
export function replacementFor(sku, assetKey) {
  // own keys only: an admin's SKU could be any string, "constructor" included
  const known = (key) => (Object.hasOwn(REPLACED_BY, key) ? REPLACED_BY[key] : null);
  if (known(sku)) return known(sku);
  const bg = assetKey ? REMOVED_BACKGROUND.exec(assetKey) : null;
  if (bg) return known(`bg-background-${bg[1]}`) ?? FALLBACK.background;
  const icon = assetKey ? REMOVED_ICON.exec(assetKey) : null;
  if (icon) return known(`icon-accessoire-icon-${icon[1]}`) ?? FALLBACK.icon;
  return null;
}

export { MADE, REPLACED_BY };

export const up = async (pgm) => {
  const db = pgm.db;

  for (const [sku, category, name, description, assetKey, price, premiumOnly, displayOrder] of MADE) {
    await db.query(
      `INSERT INTO shop_items
         (sku, name, description, category, currency, price, is_unique, active, in_stock,
          asset_key, premium_only, display_order)
       VALUES ($1,$2,$3,$4,'zer',$5,true,true,true,$6,$7,$8)
       ON CONFLICT (sku) DO UPDATE SET
         name = EXCLUDED.name, description = EXCLUDED.description,
         asset_key = EXCLUDED.asset_key, display_order = EXCLUDED.display_order`,
      [sku, name, description, category, price, assetKey, premiumOnly, displayOrder],
    );
  }

  const made = new Map(MADE.map(([sku, , name, description, assetKey]) => [sku, { name, description, assetKey }]));
  const candidates = await db.query(
    `SELECT s.sku, s.asset_key, s.name, s.description, s.active
       FROM shop_items s
      WHERE NOT EXISTS (SELECT 1 FROM cosmetic_replacements r WHERE r.sku = s.sku)
        AND (s.sku = ANY($1) OR s.asset_key ~ '^backgrounds/background-[0-9]+\\.' OR s.asset_key ~ '^icons/accessoire-icon-[0-9]+\\.')`,
    [Object.keys(REPLACED_BY)],
  );
  for (const row of candidates.rows) {
    const target = made.get(replacementFor(row.sku, row.asset_key));
    if (!target) continue;
    await db.query(
      `INSERT INTO cosmetic_replacements (sku, previous_asset_key, previous_name, previous_description, previous_active)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (sku) DO NOTHING`,
      [row.sku, row.asset_key, row.name, row.description, row.active],
    );
    await db.query(
      `UPDATE shop_items SET asset_key = $2, name = $3, description = $4, active = false WHERE sku = $1`,
      [row.sku, target.assetKey, target.name, target.description],
    );
  }

  // Somebody who returned an item and has it again — bought back while a
  // rollback had it on sale — owns it afresh: their old record goes, and the
  // insert below writes a new one, with what they paid this time and a new key
  // for its refund. Everyone else's record, noticed or returned, is kept.
  await db.query(
    `DELETE FROM cosmetic_refreshes rf
      WHERE rf.returned_at IS NOT NULL
        AND EXISTS (SELECT 1 FROM user_entitlements e WHERE e.user_id = rf.user_id AND e.sku = rf.sku)`,
  );

  // what each owner paid: the latest debit for this item in their own ledger
  // that did not pay for a gift to somebody else
  await db.query(
    `INSERT INTO cosmetic_refreshes (user_id, sku, refund_currency, refund_amount)
     SELECT e.user_id, e.sku, COALESCE(paid.currency, i.currency), COALESCE(paid.amount, 0)
       FROM user_entitlements e
       JOIN cosmetic_replacements r ON r.sku = e.sku
       JOIN shop_items i ON i.sku = e.sku
       LEFT JOIN LATERAL (
         SELECT l.currency, -l.amount AS amount
           FROM wallet_ledger l
          WHERE e.source = 'purchase'
            AND l.user_id = e.user_id
            AND l.reason = 'shop_purchase'
            AND l.ref_id = e.sku
            AND l.amount < 0
            AND NOT EXISTS (
              SELECT 1 FROM gifts g WHERE g.from_user_id = e.user_id AND g.idempotency_key = l.idempotency_key
            )
          ORDER BY l.created_at DESC
          LIMIT 1
       ) paid ON true
     ON CONFLICT (user_id, sku) DO NOTHING`,
  );
};

/**
 * Puts every replaced row back as it was and takes the made pieces nobody owns
 * out of the shop again.
 *
 * A made piece somebody has bought stays: deleting it would take their
 * purchase with it. `cosmetic_refreshes` is left alone — without a matching
 * `cosmetic_replacements` row nothing reads it — and the previous migration's
 * down sets it aside rather than dropping it, so going up again, after either
 * rollback, keeps who has seen the notice and who has already been refunded.
 */
export const down = async (pgm) => {
  const db = pgm.db;
  await db.query(
    `UPDATE shop_items s
        SET asset_key = r.previous_asset_key, name = r.previous_name,
            description = r.previous_description, active = r.previous_active
       FROM cosmetic_replacements r
      WHERE s.sku = r.sku`,
  );
  await db.query(`DELETE FROM cosmetic_replacements`);
  await db.query(
    `DELETE FROM shop_items s
      WHERE s.sku = ANY($1)
        AND NOT EXISTS (SELECT 1 FROM user_entitlements e WHERE e.sku = s.sku)
        AND NOT EXISTS (SELECT 1 FROM gifts g WHERE g.sku = s.sku)`,
    [MADE.map(([sku]) => sku)],
  );
};
