/**
 * Fairer prices and bundles (docs/money/hevalo-plus.md, Spending).
 *
 * 1. The backgrounds, icons and frames move down a ladder of prices by their craft (shared `PRICE_LADDER`): a
 *    background 120 to 200 Zêr, an icon 150 to 250, a frame 250 to 450 and the five showpieces 600. A row is moved
 *    only while it is at the price it shipped at, so a price an admin set is left as they set it; each move is
 *    recorded in `shop_repricing`, so `down` puts back exactly what was there. Nobody's purchase changes: what was
 *    paid stays in the wallet ledger, and an owned item stays owned.
 * 2. Word tags go on sale: a Kurmancî word worn by the name (shared shop-tags.ts), one at a time through
 *    `equipped_tag_sku`, and shown only while owned, as a frame is.
 * 3. Bundles: a background, a frame, an icon and a tag that belong together, with a few small gifts for the gift bag,
 *    for less than their parts (`shop_bundles`, `shop_bundle_parts`). Each purchase is recorded with what it gave and
 *    what that cost (`bundle_purchases`, append-only), and its gifts land in the bag as a grant of their own
 *    (`gift_bag_grants.source = 'bundle'`, with how many).
 *
 * The data is frozen here rather than read from api/content/cosmetics.json, because the manifest will move on and
 * this migration must keep meaning what it meant (api/src/cosmetics/catalogue.test.ts checks the two agree today).
 */

/** [sku, the price it shipped at, its price on the ladder] */
export const REPRICE = [
  ['bg-made-seva-zozanan', 250, 150], ['bg-made-ezmane-sterkan', 250, 150], ['bg-made-heyva-zivin', 250, 150], ['bg-made-berfa-ciyayan', 250, 150],
  ['bg-made-gola-sin', 200, 120], ['bg-made-ronahiya-bakur', 300, 200], ['bg-made-bin-erxewanan', 250, 150], ['bg-made-mija-gulan', 200, 120],
  ['bg-made-evara-zerin', 250, 150], ['bg-made-agire-newroze', 250, 150], ['bg-made-evara-sor', 200, 120], ['bg-made-seva-sor', 250, 150],
  ['bg-made-lalezar', 250, 150], ['bg-made-bihar', 250, 150], ['bg-made-daristana-seve', 250, 150], ['bg-made-mij', 200, 120], ['bg-made-newroz', 250, 150],
  ['bg-made-kilima-sor', 300, 200], ['bg-made-kilima-mor', 300, 200], ['bg-made-kilima-zer', 300, 200], ['bg-made-kilima-kesk', 300, 200],
  ['bg-made-kilima-sin', 300, 200], ['bg-made-kilima-gulan', 300, 200], ['bg-made-kilima-seve', 300, 200], ['bg-background-01', 250, 150],
  ['bg-background-02', 250, 150], ['bg-background-03', 250, 150], ['bg-background-04', 250, 150], ['bg-background-05', 250, 150],
  ['bg-background-06', 250, 150], ['bg-background-07', 250, 150], ['bg-background-08', 250, 150], ['bg-background-09', 250, 150],
  ['bg-background-10', 250, 150], ['bg-background-11', 250, 150], ['bg-background-12', 250, 150], ['bg-background-13', 250, 150],
  ['bg-background-14', 250, 150], ['bg-background-15', 250, 150], ['bg-background-16', 250, 150], ['bg-background-17', 250, 150],
  ['bg-background-18', 250, 150], ['bg-background-19', 250, 150], ['bg-background-20', 250, 150], ['bg-background-21', 250, 150],
  ['bg-background-22', 250, 150], ['bg-background-23', 250, 150], ['bg-background-24', 250, 150], ['bg-background-25', 250, 150],
  ['bg-background-26', 250, 150], ['bg-background-27', 250, 150], ['bg-background-28', 250, 150], ['bg-background-29', 250, 150],
  ['bg-background-30', 250, 150], ['bg-background-31', 250, 150], ['bg-background-32', 250, 150], ['bg-background-33', 250, 150],
  ['bg-background-34', 250, 150], ['bg-background-35', 250, 150], ['bg-background-36', 250, 150], ['bg-background-37', 250, 150],
  ['bg-background-38', 250, 150], ['bg-background-39', 250, 150], ['bg-background-40', 250, 150], ['bg-background-41', 250, 150],
  ['bg-background-42', 250, 150], ['bg-background-43', 250, 150], ['bg-background-44', 250, 150], ['bg-background-46', 250, 150],
  ['bg-background-47', 250, 150], ['bg-background-48', 250, 150], ['bg-background-49', 250, 150], ['bg-background-50', 250, 150],
  ['bg-background-51', 250, 150], ['bg-background-52', 250, 150], ['bg-background-53', 250, 150], ['icon-made-hinar', 400, 200], ['icon-made-roj', 300, 150],
  ['icon-made-ciya', 300, 150], ['icon-made-lale', 350, 200], ['icon-made-laleya-mor', 350, 200], ['icon-made-ask', 450, 250], ['icon-made-sterk', 300, 150],
  ['icon-made-caydan', 450, 250], ['icon-made-saz', 450, 250], ['icon-made-kevok', 350, 200], ['icon-made-genim', 350, 200], ['icon-made-kilim', 400, 200],
  ['icon-made-pet', 400, 200], ['icon-made-heyv', 300, 150], ['icon-accessoire-icon-01', 400, 200], ['icon-accessoire-icon-02', 400, 200],
  ['icon-accessoire-icon-03', 400, 200], ['icon-accessoire-icon-04', 400, 200], ['icon-accessoire-icon-05', 400, 200], ['icon-accessoire-icon-07', 400, 200],
  ['icon-accessoire-icon-08', 400, 200], ['icon-accessoire-icon-09', 400, 200], ['icon-accessoire-icon-10', 400, 200], ['icon-accessoire-icon-11', 400, 200],
  ['icon-accessoire-icon-12', 400, 200], ['icon-accessoire-icon-13', 400, 200], ['icon-accessoire-icon-14', 400, 200], ['icon-accessoire-icon-15', 400, 200],
  ['icon-accessoire-icon-16', 400, 200], ['icon-accessoire-icon-17', 400, 200], ['icon-accessoire-icon-18', 400, 200], ['frame-made-lale', 700, 250],
  ['frame-made-genim', 600, 250], ['frame-made-kilim', 800, 350], ['frame-made-roj', 1000, 600], ['frame-made-sev', 900, 450],
  ['frame-made-newroz', 1000, 600], ['frame-made-bihar', 650, 250], ['frame-made-gul', 700, 250], ['frame-made-binefs', 750, 350],
  ['frame-made-nergiz', 700, 250], ['frame-made-behiv', 850, 450], ['frame-made-ask', 800, 350], ['frame-made-rovi', 800, 350], ['frame-made-mar', 900, 450],
  ['frame-made-bask-spi', 950, 450], ['frame-made-bask-res', 950, 450], ['frame-made-sterkan', 850, 450], ['frame-made-ronahiya-bakur', 1000, 600],
  ['frame-made-dem', 750, 350], ['frame-made-efsun', 900, 450], ['frame-made-res', 850, 450], ['frame-made-neqs', 750, 350], ['frame-made-zerin', 1000, 600],
  ['frame-made-nisan', 650, 250], ['frame-made-wene', 650, 250], ['frame-made-tari', 900, 450], ['frame-made-ziv', 950, 450], ['frame-made-stiri', 850, 450],
  ['frame-made-dukel', 800, 350], ['frame-made-rojgirtin', 1000, 600],
];

/** [sku, Kurmancî word, English meaning, price, displayOrder] */
export const TAGS = [
  ['tag-heval', 'Heval', 'Friend', 100, 0],
  ['tag-xwendekar', 'Xwendekar', 'Learner', 100, 1],
  ['tag-rewi', 'Rêwî', 'Traveller', 100, 2],
  ['tag-gundi', 'Gundî', 'Villager', 100, 3],
  ['tag-baxcevan', 'Baxçevan', 'Gardener', 100, 4],
  ['tag-dilovan', 'Dilovan', 'Kind-hearted', 150, 5],
  ['tag-mevanperwer', 'Mêvanperwer', 'Hospitable', 150, 6],
  ['tag-ciyayi', 'Çiyayî', 'Highlander', 150, 7],
  ['tag-roja-nu', 'Roja Nû', 'A new day', 150, 8],
  ['tag-sterknas', 'Stêrknas', 'Stargazer', 150, 9],
  ['tag-dengbej', 'Dengbêj', 'Singer of tales', 200, 10],
  ['tag-helbestvan', 'Helbestvan', 'Poet', 200, 11],
];

/** [id, Kurmancî name, price, displayOrder, [background, frame, icon, tag], [[gift sku, count], …]] */
export const BUNDLES = [
  ['cayxane', 'Çayxane', 500, 0, ['bg-made-kilima-sor', 'frame-made-kilim', 'icon-made-caydan', 'tag-mevanperwer'], [['gift-cay', 5], ['gift-qehwe', 2], ['gift-sev', 1]]],
  ['gund', 'Gund', 375, 1, ['bg-made-evara-zerin', 'frame-made-genim', 'icon-made-genim', 'tag-gundi'], [['gift-cay', 5], ['gift-qehwe', 2], ['gift-sev', 3]]],
  ['baxce', 'Baxçe', 400, 2, ['bg-made-lalezar', 'frame-made-gul', 'icon-made-lale', 'tag-baxcevan'], [['gift-cay', 5], ['gift-beybun', 2], ['gift-gul', 1]]],
  ['zagros', 'Zagros', 450, 3, ['bg-made-berfa-ciyayan', 'frame-made-ask', 'icon-made-ciya', 'tag-ciyayi'], [['gift-cay', 5], ['gift-qehwe', 2], ['gift-beybun', 2]]],
  ['seva-sterkan', 'Şeva Stêrkan', 600, 4, ['bg-made-ezmane-sterkan', 'frame-made-rojgirtin', 'icon-made-heyv', 'tag-sterknas'], [['gift-cay', 5], ['gift-qehwe', 2], ['gift-sev', 1]]],
  ['newroz', 'Newroz', 650, 5, ['bg-made-agire-newroze', 'frame-made-newroz', 'icon-made-pet', 'tag-roja-nu'], [['gift-cay', 5], ['gift-lale', 2], ['gift-nergiz', 1]]],
];

const BAG_SOURCES_BEFORE = "('daily', 'streak', 'win', 'podium', 'harvest')";
const BAG_SOURCES = "('daily', 'streak', 'win', 'podium', 'harvest', 'bundle')";

/** Every statement runs at once, in order, so the data steps find the tables the steps before them made. */
export const up = async (pgm) => {
  const db = pgm.db;

  // 1. the ladder, for rows still at the price they shipped at
  await db.query(`
    CREATE TABLE shop_repricing (
      sku text PRIMARY KEY REFERENCES shop_items ON DELETE CASCADE,
      before integer NOT NULL,
      after integer NOT NULL,
      repriced_at timestamptz NOT NULL DEFAULT now()
    )`);
  for (const [sku, from, to] of REPRICE) {
    await db.query(
      `WITH moved AS (UPDATE shop_items SET price = $3 WHERE sku = $1 AND price = $2 AND currency = 'zer' RETURNING sku)
       INSERT INTO shop_repricing (sku, before, after) SELECT sku, $2, $3 FROM moved`,
      [sku, from, to],
    );
  }

  // 2. word tags, and the one a person wears
  for (const [sku, name, description, price, displayOrder] of TAGS) {
    await db.query(
      `INSERT INTO shop_items
         (sku, name, description, category, currency, price, is_unique, active, in_stock, asset_key, premium_only, display_order)
       VALUES ($1, $2, $3, 'tag', 'zer', $4, true, true, true, NULL, false, $5)
       ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, display_order = EXCLUDED.display_order`,
      [sku, name, description, price, displayOrder],
    );
  }
  await db.query(`ALTER TABLE users ADD COLUMN equipped_tag_sku text REFERENCES shop_items ON DELETE SET NULL`);

  // 3. bundles, their parts, and what each purchase gave
  await db.query(`
    CREATE TABLE shop_bundles (
      id text PRIMARY KEY,
      name text NOT NULL,
      price integer NOT NULL CHECK (price > 0),
      active boolean NOT NULL DEFAULT true,
      available_from timestamptz,
      available_to timestamptz,
      display_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
  // One of a cosmetic, a few of a gift. An item in a bundle is retired rather than deleted (shop/catalogue.ts); only an
  // earlier migration's rollback deletes one, and the bundle then goes without it.
  await db.query(`
    CREATE TABLE shop_bundle_parts (
      bundle_id text NOT NULL REFERENCES shop_bundles ON DELETE CASCADE,
      sku text NOT NULL REFERENCES shop_items ON DELETE CASCADE,
      quantity integer NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 20),
      PRIMARY KEY (bundle_id, sku)
    )`);
  await db.query(`CREATE INDEX shop_bundle_parts_sku_index ON shop_bundle_parts (sku)`);

  // Each purchase as it was settled: the buyer's own request key (a retry answers the first purchase), the Zêr paid,
  // what the parts new to them cost one by one, and every part with its price and whether it was owned already.
  await db.query(`
    CREATE TABLE bundle_purchases (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
      bundle_id text NOT NULL REFERENCES shop_bundles ON DELETE RESTRICT,
      idempotency_key text NOT NULL,
      price integer NOT NULL CHECK (price >= 0),
      worth integer NOT NULL CHECK (worth >= 0),
      parts jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT bundle_purchases_key_once UNIQUE (user_id, idempotency_key)
    )`);
  await db.query(`CREATE INDEX bundle_purchases_user_index ON bundle_purchases (user_id, created_at)`);
  // History: nothing changes a purchase, and it goes only with the account (a cascade) or the ledger admin's own flag.
  await db.query(`
    CREATE FUNCTION bundle_purchases_guard() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP = 'DELETE' AND (NOT EXISTS (SELECT 1 FROM users u WHERE u.id = OLD.user_id) OR current_setting('kurda.ledger_admin', true) = 'on') THEN
        RETURN OLD;
      END IF;
      RAISE EXCEPTION 'bundle_purchases is append-only';
    END;
    $$`);
  await db.query(`CREATE TRIGGER bundle_purchases_guard BEFORE UPDATE OR DELETE ON bundle_purchases FOR EACH ROW EXECUTE FUNCTION bundle_purchases_guard()`);
  await db.query(`CREATE TRIGGER bundle_purchases_no_truncate BEFORE TRUNCATE ON bundle_purchases FOR EACH STATEMENT EXECUTE FUNCTION bundle_purchases_guard()`);

  // A bundle's gifts land in the bag as one grant a kind, saying how many, and never count toward the five earned a day.
  await db.query(`ALTER TABLE gift_bag_grants DROP CONSTRAINT gift_bag_grants_source_check`);
  await db.query(`ALTER TABLE gift_bag_grants ADD CONSTRAINT gift_bag_grants_source_check CHECK (source IN ${BAG_SOURCES})`);
  await db.query(`ALTER TABLE gift_bag_grants ADD COLUMN quantity integer NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 99)`);

  // the bundles, once all their parts are in the catalogue (a database without them gets none)
  for (const [id, name, price, displayOrder, parts, gifts] of BUNDLES) {
    const skus = [...parts, ...gifts.map(([sku]) => sku)];
    const found = await db.query(`SELECT count(*)::int AS n FROM shop_items WHERE sku = ANY($1)`, [skus]);
    if (found.rows[0].n !== skus.length) continue;
    await db.query(
      `INSERT INTO shop_bundles (id, name, price, display_order) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order`,
      [id, name, price, displayOrder],
    );
    for (const [sku, count] of [...parts.map((sku) => [sku, 1]), ...gifts]) {
      await db.query(`INSERT INTO shop_bundle_parts (bundle_id, sku, quantity) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [id, sku, count]);
    }
  }
};

/**
 * Takes the bundles, the word tags and the ladder back. A bundle's background, frame and icon stay owned and its gifts
 * stay in the bag; the record of each bundle and of what it put in a bag goes, since the old rules know no bundle, and
 * so do the word tags, since nothing before this could show one. A price an admin changed since is left as it is.
 */
export const down = async (pgm) => {
  const db = pgm.db;
  await db.query(`SET LOCAL kurda.ledger_admin = 'on'`);
  await db.query(`SET LOCAL kurda.gift_bag_erase = 'on'`);
  await db.query(`DELETE FROM gift_bag_grants WHERE source = 'bundle'`);
  await db.query(`ALTER TABLE gift_bag_grants DROP COLUMN quantity`);
  await db.query(`ALTER TABLE gift_bag_grants DROP CONSTRAINT gift_bag_grants_source_check`);
  await db.query(`ALTER TABLE gift_bag_grants ADD CONSTRAINT gift_bag_grants_source_check CHECK (source IN ${BAG_SOURCES_BEFORE})`);

  await db.query(`DROP TABLE bundle_purchases`);
  await db.query(`DROP FUNCTION bundle_purchases_guard()`);
  await db.query(`DROP TABLE shop_bundle_parts`);
  await db.query(`DROP TABLE shop_bundles`);

  await db.query(`ALTER TABLE users DROP COLUMN equipped_tag_sku`);
  await db.query(`DELETE FROM shop_items WHERE sku = ANY($1)`, [TAGS.map(([sku]) => sku)]);

  await db.query(`UPDATE shop_items s SET price = r.before FROM shop_repricing r WHERE r.sku = s.sku AND s.price = r.after`);
  await db.query(`DROP TABLE shop_repricing`);
};
