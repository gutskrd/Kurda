/**
 * The gift economy: the thirty-three gifts (shared/src/gift-catalogue.ts) on sale in place of the gift stickers, the
 * gift bag that everyone fills from the moments that pay members Zêr, and an adult's own limit on spending Zêr on gifts.
 *
 * The stickers are retired, not deleted: whoever holds or was given one keeps it, and every gift of one still reads in
 * its chat, on its post and in a collection; the ones this migration retired are listed so `down` puts back only those.
 * The gifts carry no picture of their own; the server finds each one's drawn picture by its sku, so a gift goes on offer
 * when its picture is drawn, and the Newroz fire's March is kept in code (shared `giftInSeason`), every year. A gift
 * sent from the bag is recorded with the rest, as paid with the bag. What landed in a bag is append-only: only when it
 * was seen may change, and its rows go only with the account.
 */

/** The gifts as first put on sale: id, Kurmancî name, Zêr. */
const GIFTS = [
  ['cay', 'Çay', 1],
  ['qehwe', 'Qehwe', 2],
  ['beybun', 'Beybûn', 3],
  ['sev', 'Sêv', 3],
  ['lale', 'Lale', 10],
  ['gul', 'Gul', 25],
  ['nergiz', 'Nêrgiz', 50],
  ['kevok', 'Kevok', 50],
  ['sosin', 'Sosin', 100],
  ['pisik', 'Pisîk', 150],
  ['kew', 'Kew', 300],
  ['semawer', 'Semawer', 300],
  ['def', 'Def', 400],
  ['deste-gul', 'Desteya gulan', 500],
  ['sterk', 'Stêrka xişok', 500],
  ['kelek', 'Kelek', 800],
  ['saz', 'Saz', 1000],
  ['ask', 'Ask', 1000],
  ['keskesor', 'Keskesor', 1200],
  ['pezkovi', 'Pezkovî', 1500],
  ['belem', 'Belem', 2000],
  ['pet', 'Pêta Newrozê', 2000],
  ['hesp', 'Hesp', 2500],
  ['kon', 'Reşmal', 3000],
  ['mal', 'Mala gund', 5000],
  ['kawa', 'Çakûçê Kawa', 5000],
  ['sahmaran', 'Wêneyê Şahmaranê', 7500],
  ['gemi', 'Gemiya bayê', 10000],
  ['kosk', 'Koşk', 15000],
  ['heyv', 'Heyv', 20000],
  ['keleh', 'Keleh', 30000],
  ['roj', 'Roj', 50000],
  ['kadiz', 'Rêya Kadizê', 100000],
];

/**
 * The retired time `down` gives a gift it has to keep for those who hold one, which no admin's retiring can give, so a
 * later `up` lists again those gifts and no gift an admin retired.
 */
const KEPT_BY_DOWN = "'1970-01-01T00:00:00Z'";

const BAG_SOURCES = "('daily', 'streak', 'win', 'podium', 'harvest')";
const PERIODS = "('day', 'week', 'month')";

export const up = (pgm) => {
  // a gift an earlier `down` kept for those who hold one is listed again, and nothing an admin retired
  GIFTS.forEach(([id, name, price], i) => {
    pgm.sql(
      `INSERT INTO shop_items (sku, name, category, currency, price, is_unique, active, in_stock, asset_key, display_order)
       VALUES ('gift-${id}', '${name}', 'gift', 'zer', ${price}, false, true, true, NULL, ${i})
       ON CONFLICT (sku) DO UPDATE SET active = true, in_stock = true, retired_at = NULL
        WHERE shop_items.category = 'gift' AND shop_items.retired_at = ${KEPT_BY_DOWN}`,
    );
  });
  // Off sale and out of the admin's list, kept for their owners and their gifts' history; which ones, for `down`.
  pgm.createTable('gift_stickers_retired', { sku: { type: 'text', primaryKey: true } });
  pgm.sql(`INSERT INTO gift_stickers_retired (sku) SELECT sku FROM shop_items WHERE category = 'sticker' AND retired_at IS NULL`);
  pgm.sql(`UPDATE shop_items SET active = false, in_stock = false, retired_at = now() WHERE sku IN (SELECT sku FROM gift_stickers_retired)`);

  pgm.dropConstraint('gifts', 'gifts_paid_with_check');
  pgm.addConstraint('gifts', 'gifts_paid_with_check', { check: "paid_with IN ('zer', 'free_gift', 'bag')" });

  // What each bag holds: one row a kind, never more than 99.
  pgm.createTable('gift_bag', {
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    sku: { type: 'text', notNull: true, references: 'shop_items', onDelete: 'CASCADE' },
    count: { type: 'integer', notNull: true, check: 'count BETWEEN 0 AND 99' },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('gift_bag', 'gift_bag_pkey', { primaryKey: ['user_id', 'sku'] });

  // Every gift that landed in a bag and why: the day's count, a moment never paying twice, and the line that says so.
  pgm.createTable('gift_bag_grants', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    sku: { type: 'text', notNull: true, references: 'shop_items', onDelete: 'CASCADE' },
    source: { type: 'text', notNull: true, check: `source IN ${BAG_SOURCES}` },
    /** the moment, as its source names it: a day, a milestone, a game, a harvest */
    ref: { type: 'text', notNull: true },
    /** the UTC day it landed, which the daily cap counts */
    granted_on: { type: 'date', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    seen_at: { type: 'timestamptz' },
  });
  pgm.addConstraint('gift_bag_grants', 'gift_bag_grants_once', { unique: ['user_id', 'source', 'ref'] });
  // Append-only: only seen_at changes; a row goes only with its account (the user row gone, as a cascade deletes it, or
  // an account's erase under its own transaction's flag); and nothing empties the table at once.
  pgm.sql(`
    CREATE FUNCTION gift_bag_grants_guard() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP = 'UPDATE' THEN
        IF (to_jsonb(NEW) - 'seen_at') = (to_jsonb(OLD) - 'seen_at') THEN
          RETURN NEW;
        END IF;
        RAISE EXCEPTION 'gift_bag_grants is append-only: only seen_at may change';
      END IF;
      IF TG_OP = 'DELETE' THEN
        IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = OLD.user_id) OR current_setting('kurda.gift_bag_erase', true) = 'on' THEN
          RETURN OLD;
        END IF;
        RAISE EXCEPTION 'gift_bag_grants keeps what landed in a bag for as long as the account lasts';
      END IF;
      RAISE EXCEPTION 'gift_bag_grants cannot be truncated';
    END;
    $$`);
  pgm.sql(`CREATE TRIGGER gift_bag_grants_guard BEFORE UPDATE OR DELETE ON gift_bag_grants FOR EACH ROW EXECUTE FUNCTION gift_bag_grants_guard()`);
  pgm.sql(`CREATE TRIGGER gift_bag_grants_no_truncate BEFORE TRUNCATE ON gift_bag_grants FOR EACH STATEMENT EXECUTE FUNCTION gift_bag_grants_guard()`);
  pgm.createIndex('gift_bag_grants', ['user_id', 'granted_on']);
  pgm.createIndex('gift_bag_grants', ['user_id'], { name: 'gift_bag_grants_unseen_idx', where: 'seen_at IS NULL' });

  // An adult's own limit on Zêr spent on gifts, and a raise or removal waiting its day.
  pgm.createTable('gift_spend_limits', {
    user_id: { type: 'uuid', primaryKey: true, references: 'users', onDelete: 'CASCADE' },
    period: { type: 'text', check: `period IN ${PERIODS}` },
    zer: { type: 'integer', check: 'zer > 0' },
    pending_period: { type: 'text', check: `pending_period IN ${PERIODS}` },
    pending_zer: { type: 'integer', check: 'pending_zer > 0' },
    /** when the waiting change takes over; null when nothing waits */
    pending_from: { type: 'timestamptz' },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('gift_spend_limits', 'gift_spend_limits_whole', { check: '(period IS NULL) = (zer IS NULL)' });
  pgm.addConstraint('gift_spend_limits', 'gift_spend_limits_pending_whole', {
    check: '(pending_period IS NULL) = (pending_zer IS NULL) AND (pending_from IS NOT NULL OR pending_period IS NULL)',
  });
};

export const down = (pgm) => {
  pgm.dropTable('gift_spend_limits');
  pgm.dropTable('gift_bag_grants');
  pgm.sql(`DROP FUNCTION gift_bag_grants_guard()`);
  pgm.dropTable('gift_bag');
  // The old rule knew no bag; checked only for rows written from now on, so a gift given from a bag keeps saying so.
  pgm.dropConstraint('gifts', 'gifts_paid_with_check');
  pgm.sql(`ALTER TABLE gifts ADD CONSTRAINT gifts_paid_with_check CHECK (paid_with IN ('zer', 'free_gift')) NOT VALID`);
  // the stickers this migration retired, and no other
  pgm.sql(`UPDATE shop_items SET active = true, in_stock = true, retired_at = NULL WHERE sku IN (SELECT sku FROM gift_stickers_retired)`);
  pgm.dropTable('gift_stickers_retired');
  pgm.sql(`
    DELETE FROM shop_items s WHERE s.category = 'gift'
       AND NOT EXISTS (SELECT 1 FROM user_entitlements e WHERE e.sku = s.sku)
       AND NOT EXISTS (SELECT 1 FROM gifts g WHERE g.sku = s.sku)`);
  // kept for those who hold one, marked so a later `up` lists them again; one an admin retired keeps its own time
  pgm.sql(`UPDATE shop_items SET active = false, in_stock = false, retired_at = ${KEPT_BY_DOWN} WHERE category = 'gift' AND retired_at IS NULL`);
};
