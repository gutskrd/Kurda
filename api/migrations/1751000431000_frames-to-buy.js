/**
 * Frames go on sale.
 *
 * A frame round a profile picture could only be won: the six season frames,
 * one for each rank tier, given at a season's end and never sold
 * (1751000170000). These are for anybody: drawn by the generator as the
 * shop's icons are (scripts/cosmetic-art/frames.mjs) — rings of Kurdish
 * things, wreaths of spring flowers, a fawn, a fox, a snake, wings, stars
 * and light — bought with Zêr, one to a person, and worn through the same
 * `equipped_frame_sku` a season frame is. A frame shows only while it is owned (social/service.ts), so
 * none is `premium_only`: there is no wearing one on a membership alone.
 *
 * On a row that already exists only the presentation is refreshed (name,
 * description, art, order), the way the first catalogue seed treats an
 * admin's price and availability. Down takes the frames off whoever wears
 * them, out of what people own and out of the shop; what was paid for them
 * is not handed back by a migration.
 *
 * The data is frozen here rather than read from api/content/cosmetics.json,
 * because the manifest will move on and this migration must keep meaning what
 * it meant (api/src/cosmetics/catalogue.test.ts checks the two agree today).
 */

/** [sku, name, description, assetKey, price, displayOrder] */
export const FRAMES = [
  ['frame-made-lale', 'Xeleka Laleyan', 'Tulip wreath', 'frames/made-01-lale.png', 1400, 0],
  ['frame-made-genim', 'Xeleka Genim', 'Wheat wreath', 'frames/made-02-genim.png', 1200, 1],
  ['frame-made-kilim', 'Xeleka Kilîmê', 'Kilim band', 'frames/made-03-kilim.png', 1600, 2],
  ['frame-made-roj', 'Xeleka Rojê', 'Sun rays', 'frames/made-04-roj.png', 2000, 3],
  ['frame-made-sev', 'Xeleka Şevê', 'Night sky', 'frames/made-05-sev.png', 1800, 4],
  ['frame-made-newroz', 'Xeleka Newrozê', 'Newroz fire', 'frames/made-06-newroz.png', 2000, 5],
  ['frame-made-bihar', 'Xeleka Biharê', 'Spring vine', 'frames/made-07-bihar.png', 1300, 6],
  ['frame-made-gul', 'Xeleka Gulan', 'Rose wreath', 'frames/made-08-gul.png', 1400, 7],
  ['frame-made-binefs', 'Xeleka Binefşan', 'Violet wreath', 'frames/made-09-binefs.png', 1500, 8],
  ['frame-made-nergiz', 'Xeleka Nêrgizan', 'Narcissus wreath', 'frames/made-10-nergiz.png', 1400, 9],
  ['frame-made-behiv', 'Xeleka Behîvê', 'Almond blossom', 'frames/made-11-behiv.png', 1700, 10],
  ['frame-made-ask', 'Xeleka Askê', 'Fawn', 'frames/made-12-ask.png', 1600, 11],
  ['frame-made-rovi', 'Xeleka Rovî', 'Sleeping fox', 'frames/made-13-rovi.png', 1600, 12],
  ['frame-made-mar', 'Xeleka Marî', 'Serpent', 'frames/made-14-mar.png', 1800, 13],
  ['frame-made-bask-spi', 'Baskên Spî', 'White wings', 'frames/made-15-bask-spi.png', 1900, 14],
  ['frame-made-bask-res', 'Baskên Reş', 'Black wings', 'frames/made-16-bask-res.png', 1900, 15],
  ['frame-made-sterkan', 'Xeleka Stêrkan', 'Ring of stars', 'frames/made-17-sterkan.png', 1700, 16],
  ['frame-made-keskesor', 'Keskesor', 'Rainbow light', 'frames/made-18-keskesor.png', 2000, 17],
  ['frame-made-dem', 'Xeleka Demê', 'Clock face', 'frames/made-19-dem.png', 1500, 18],
  ['frame-made-efsun', 'Xeleka Efsûnê', 'Enchanted ring', 'frames/made-20-efsun.png', 1800, 19],
  ['frame-made-res', 'Xeleka Reş', 'Black scrollwork', 'frames/made-21-res.png', 1700, 20],
];

export const up = async (pgm) => {
  for (const [sku, name, description, assetKey, price, displayOrder] of FRAMES) {
    await pgm.db.query(
      `INSERT INTO shop_items
         (sku, name, description, category, currency, price, is_unique, active, in_stock,
          asset_key, premium_only, display_order)
       VALUES ($1,$2,$3,'frame','zer',$4,true,true,true,$5,false,$6)
       ON CONFLICT (sku) DO UPDATE SET
         name = EXCLUDED.name, description = EXCLUDED.description,
         asset_key = EXCLUDED.asset_key, display_order = EXCLUDED.display_order`,
      [sku, name, description, price, assetKey, displayOrder],
    );
  }
};

export const down = async (pgm) => {
  const skus = FRAMES.map(([sku]) => sku);
  await pgm.db.query(`UPDATE users SET equipped_frame_sku = NULL WHERE equipped_frame_sku = ANY($1)`, [skus]);
  await pgm.db.query(`DELETE FROM user_entitlements WHERE sku = ANY($1)`, [skus]);
  await pgm.db.query(`DELETE FROM shop_items WHERE sku = ANY($1)`, [skus]);
};
