/**
 * The tea icon is called what it is: Çay.
 *
 * It was renamed once already, from Çaydan ("Teapot") to Îstîkan ("Tea
 * glass"), when its art became a glass of tea on its saucer (1751000179000).
 * But nobody asks for an îstîkan: they ask for çay, and the glass is how çay
 * comes. The art has been painted again as well, after a painting of the
 * narrow-waisted glass on its striped saucer. The item keeps its SKU, its
 * file and its price; only what it is called changes, on the item for sale
 * and on the withdrawn one that wears the same art, matched by `asset_key`.
 *
 * A row an admin has renamed by hand is left as it is: `up` touches only rows
 * still carrying the old name, and `down` only rows carrying the new one.
 */

/** Each renamed piece by its art: its [name, description] before and after. */
export const RENAMED = [{ assetKey: 'icons/made-08-caydan.png', from: ['Îstîkan', 'Tea glass'], to: ['Çay', 'Tea'] }];

async function rename(pgm, assetKey, [fromName, fromDescription], [toName, toDescription]) {
  await pgm.db.query(
    `UPDATE shop_items SET name = $2, description = $3
      WHERE asset_key = $1 AND name = $4 AND description IS NOT DISTINCT FROM $5`,
    [assetKey, toName, toDescription, fromName, fromDescription],
  );
}

export const up = async (pgm) => {
  for (const r of RENAMED) await rename(pgm, r.assetKey, r.from, r.to);
};

export const down = async (pgm) => {
  for (const r of RENAMED) await rename(pgm, r.assetKey, r.to, r.from);
};
