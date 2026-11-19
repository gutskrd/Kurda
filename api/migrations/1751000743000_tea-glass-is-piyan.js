/**
 * The tea glass is called Piyan, the word the course teaches for it, and described as a tea glass again.
 *
 * Like the rename before it (1751000430000), the item keeps its SKU, its file and its price, and both rows that wear
 * the art change: the one for sale and the withdrawn one. A row an admin has renamed by hand is left as it is.
 */

/** Each renamed piece by its art: its [name, description] before and after. */
export const RENAMED = [{ assetKey: 'icons/made-08-caydan.png', from: ['Çay', 'Tea'], to: ['Piyan', 'Tea glass'] }];

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
