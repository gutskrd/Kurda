/**
 * Two icons renamed to match their art.
 *
 * The icon called Çaydan ("Teapot") is painted as a glass of tea on its
 * saucer, with no teapot in it, and the one called Stêrk ("Eight-point star")
 * as a seal of red wax with the sun of the Kurdish flag pressed into it. They
 * keep their SKUs, their files and their prices; only what they are called
 * changes — on the items for sale and on the withdrawn items that wear the
 * same art, matched by `asset_key` as 1751000161000 matched them.
 *
 * A data migration because a database that already exists takes only
 * migrations (1751000108000 says why). A row an admin has renamed by hand is
 * left as it is: `up` touches only rows still carrying the old names, and
 * `down` only rows carrying the new ones.
 */

/** Each renamed piece by its art: its [name, description] before and after. */
export const RENAMED = [
  { assetKey: 'icons/made-08-caydan.png', from: ['Çaydan', 'Teapot'], to: ['Îstîkan', 'Tea glass'] },
  { assetKey: 'icons/made-07-sterk.png', from: ['Stêrk', 'Eight-point star'], to: ['Mohra Rojê', 'Sun seal'] },
];

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
