/**
 * One currency: Gewher is retired and Zêr is the only money (docs/money/hevalo-plus.md).
 *
 * Every Gewher becomes 5 Zêr: balances, prices set in Gewher, event rewards,
 * the earning rules, store packs and the records that say what was paid. The
 * wallet ledger keeps its history and stays append-only: each balance moves by
 * two new rows, the Gewher taken out ('gewher_retired') and the Zêr put in
 * ('gewher_converted'), so every balance still equals its ledger's sum. From
 * here on only Zêr may be written; old Gewher rows stay as they were.
 *
 * `gewher_retirement` records what was converted, so the change can be read
 * back by anyone auditing it and undone exactly by `down`.
 *
 * It also adds what the new economy keeps: the members' box, streak
 * milestones, a streak won back by learning, gifts onto posts and paid with a
 * free gift, and the gift stickers.
 */

const RATE = 5;

/** The gift stickers (shared/src/gifts.ts `GIFT_STICKERS`), as they were first put on sale. */
const STICKERS = [
  ['sticker-kevok', 'Kevok', 'icons/made-10-kevok.png', 40],
  ['sticker-lale', 'Lale', 'icons/made-04-lale.png', 40],
  ['sticker-piyan', 'Piyan', 'icons/made-08-caydan.png', 40],
  ['sticker-hinar', 'Hinar', 'icons/made-01-hinar.png', 120],
  ['sticker-roj', 'Roj', 'icons/made-02-roj.png', 120],
  ['sticker-saz', 'Saz', 'icons/made-09-saz.png', 120],
  ['sticker-ask', 'Ask', 'icons/made-06-ask.png', 400],
  ['sticker-pet', 'Pêta Newrozê', 'icons/made-13-pet.png', 400],
  ['sticker-heyv', 'Heyv', 'icons/made-14-heyv.png', 400],
];

/** A jsonb reward's Gewher folded into its Zêr, for an expression `r` holding a reward object. */
const foldReward = (r) =>
  `((${r}) - 'gems') || jsonb_build_object('zer', COALESCE((${r}->>'zer')::numeric, 0) + (${r}->>'gems')::numeric * ${RATE})`;

export const up = (pgm) => {
  pgm.createTable('gewher_retirement', {
    id: 'bigserial',
    /** what was converted: a 'balance', a 'shop_item', a 'gift', an 'event', ... */
    kind: { type: 'text', notNull: true },
    /** which one, by its key */
    ref: { type: 'text', notNull: true },
    gewher: { type: 'integer' },
    zer: { type: 'integer' },
    /** the row's value before, where a number does not say it */
    before: { type: 'jsonb' },
    converted_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('gewher_retirement', ['kind', 'ref']);

  // Nothing may pay or charge while balances move; held only for this transaction.
  pgm.sql(`LOCK TABLE wallet_balances IN SHARE ROW EXCLUSIVE MODE`);

  // Balances: each Gewher balance taken out and put back as Zêr, two ledger rows each.
  pgm.sql(`
    INSERT INTO gewher_retirement (kind, ref, gewher, zer)
    SELECT 'balance', user_id::text, balance, balance * ${RATE} FROM wallet_balances WHERE currency = 'gems' AND balance > 0`);
  pgm.sql(`
    INSERT INTO wallet_ledger (user_id, currency, amount, reason, ref_id)
    SELECT ref::uuid, 'gems', -gewher, 'gewher_retired', 'one-currency' FROM gewher_retirement WHERE kind = 'balance'`);
  pgm.sql(`
    INSERT INTO wallet_ledger (user_id, currency, amount, reason, ref_id)
    SELECT ref::uuid, 'zer', zer, 'gewher_converted', 'one-currency' FROM gewher_retirement WHERE kind = 'balance'`);
  pgm.sql(`
    INSERT INTO wallet_balances (user_id, currency, balance)
    SELECT ref::uuid, 'zer', zer FROM gewher_retirement WHERE kind = 'balance'
    ON CONFLICT (user_id, currency) DO UPDATE SET balance = wallet_balances.balance + EXCLUDED.balance, updated_at = now()`);
  pgm.sql(`DELETE FROM wallet_balances WHERE currency = 'gems'`);
  // Old rows keep their Gewher; NOT VALID checks only what is written from now on.
  pgm.sql(`ALTER TABLE wallet_ledger ADD CONSTRAINT wallet_ledger_zer_only CHECK (currency = 'zer') NOT VALID`);
  pgm.sql(`ALTER TABLE wallet_balances ADD CONSTRAINT wallet_balances_zer_only CHECK (currency = 'zer')`);

  // Prices set in Gewher, and what gifts and refunds recorded in it.
  pgm.sql(`
    INSERT INTO gewher_retirement (kind, ref, gewher, zer)
    SELECT 'shop_item', sku, price, price * ${RATE} FROM shop_items WHERE currency = 'gems'`);
  pgm.sql(`UPDATE shop_items SET price = price * ${RATE}, currency = 'zer' WHERE currency = 'gems'`);
  pgm.sql(`ALTER TABLE shop_items ADD CONSTRAINT shop_items_zer_only CHECK (currency = 'zer')`);
  pgm.sql(`
    INSERT INTO gewher_retirement (kind, ref, gewher, zer)
    SELECT 'gift', id::text, price, price * ${RATE} FROM gifts WHERE currency = 'gems'`);
  pgm.sql(`UPDATE gifts SET price = price * ${RATE}, currency = 'zer' WHERE currency = 'gems'`);
  pgm.sql(`ALTER TABLE gifts ADD CONSTRAINT gifts_zer_only CHECK (currency = 'zer')`);
  pgm.sql(`
    INSERT INTO gewher_retirement (kind, ref, gewher, zer)
    SELECT 'refresh', user_id::text || ':' || sku, refund_amount, refund_amount * ${RATE} FROM cosmetic_refreshes WHERE refund_currency = 'gems'`);
  pgm.sql(`UPDATE cosmetic_refreshes SET refund_amount = refund_amount * ${RATE}, refund_currency = 'zer' WHERE refund_currency = 'gems'`);
  pgm.sql(`ALTER TABLE cosmetic_refreshes ADD CONSTRAINT cosmetic_refreshes_zer_only CHECK (refund_currency = 'zer')`);

  // The earning rules pay Zêr: a league promotion 50, a tournament win 250.
  pgm.renameTable('gem_rules', 'earn_rules');
  pgm.sql(`ALTER TABLE earn_rules RENAME CONSTRAINT gem_rules_amount_check TO earn_rules_amount_check`);
  pgm.sql(`
    INSERT INTO gewher_retirement (kind, ref, gewher, zer, before)
    SELECT 'rule', key, amount, amount * ${RATE}, jsonb_build_object('daily_cap', daily_cap) FROM earn_rules`);
  pgm.sql(`UPDATE earn_rules SET amount = amount * ${RATE}, daily_cap = daily_cap * ${RATE}, updated_at = now()`);

  // Store packs and receipts count Zêr; a refund then claws back what the converted balance holds.
  pgm.renameTable('gem_packs', 'zer_packs');
  pgm.renameColumn('zer_packs', 'gems', 'zer');
  pgm.sql(`ALTER TABLE zer_packs RENAME CONSTRAINT gem_packs_pkey TO zer_packs_pkey`);
  pgm.sql(`ALTER TABLE zer_packs RENAME CONSTRAINT gem_packs_platform_check TO zer_packs_platform_check`);
  pgm.sql(`ALTER TABLE zer_packs RENAME CONSTRAINT gem_packs_gems_check TO zer_packs_zer_check`);
  pgm.sql(`UPDATE zer_packs SET zer = zer * ${RATE}`);
  pgm.renameColumn('iap_receipts', 'gems', 'zer');
  pgm.sql(`UPDATE iap_receipts SET zer = zer * ${RATE}, clawed_back = clawed_back * ${RATE}`);

  // What tournaments, seasons and leagues pay or paid, in Zêr.
  pgm.sql(`
    INSERT INTO gewher_retirement (kind, ref, gewher, zer)
    SELECT 'tournament', id::text, reward_gems, reward_gems * ${RATE} FROM tournaments WHERE reward_gems > 0`);
  pgm.sql(`UPDATE tournaments SET reward_zer = reward_zer + reward_gems * ${RATE} WHERE reward_gems > 0`);
  pgm.dropColumns('tournaments', ['reward_gems']);
  pgm.renameColumn('seasons', 'reward_gems', 'reward_zer');
  pgm.sql(`UPDATE seasons SET reward_zer = reward_zer * ${RATE}`);
  pgm.renameColumn('rank_season_rewards', 'gems', 'zer');
  pgm.sql(`UPDATE rank_season_rewards SET zer = zer * ${RATE}`);
  pgm.renameColumn('league_weeks', 'gems', 'zer');
  pgm.sql(`UPDATE league_weeks SET zer = zer * ${RATE}`);

  // Event rewards: each quest's, the event's own, and the claims already paid.
  pgm.sql(`
    INSERT INTO gewher_retirement (kind, ref, before)
    SELECT 'event', key, jsonb_build_object('quests', quests, 'rewards', rewards) FROM events
     WHERE jsonb_typeof(rewards->'gems') = 'number'
        OR (jsonb_typeof(quests) = 'array'
            AND EXISTS (SELECT 1 FROM jsonb_array_elements(quests) q WHERE jsonb_typeof(q->'reward'->'gems') = 'number'))`);
  pgm.sql(`
    UPDATE events e SET quests = (
      SELECT jsonb_agg(CASE WHEN jsonb_typeof(q->'reward'->'gems') = 'number'
                            THEN jsonb_set(q, '{reward}', ${foldReward(`q->'reward'`)}) ELSE q END ORDER BY ord)
        FROM jsonb_array_elements(e.quests) WITH ORDINALITY AS t(q, ord)), updated_at = now()
     WHERE jsonb_typeof(e.quests) = 'array'
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(e.quests) q WHERE jsonb_typeof(q->'reward'->'gems') = 'number')`);
  pgm.sql(`UPDATE events SET rewards = ${foldReward('rewards')}, updated_at = now() WHERE jsonb_typeof(rewards->'gems') = 'number'`);
  pgm.sql(`
    INSERT INTO gewher_retirement (kind, ref, before)
    SELECT 'event_claim', user_id::text || ':' || event_key || ':' || quest_id, reward FROM event_quest_claims
     WHERE jsonb_typeof(reward->'gems') = 'number'`);
  pgm.sql(`UPDATE event_quest_claims SET reward = ${foldReward('reward')} WHERE jsonb_typeof(reward->'gems') = 'number'`);

  // A restore is never bought now: a member's free one, or a streak won back by learning.
  pgm.renameColumn('streak_repairs', 'cost_gems', 'cost');
  pgm.sql(`UPDATE streak_repairs SET cost = cost * ${RATE}`);
  pgm.addColumns('streak_repairs', { won_back: { type: 'boolean', notNull: true, default: false } });
  pgm.dropConstraint('streak_repairs', 'streak_repairs_free_costs_nothing');
  pgm.addConstraint('streak_repairs', 'streak_repairs_how', {
    check: '(won_back AND NOT free AND cost = 0) OR (free AND NOT won_back AND cost = 0) OR (NOT free AND NOT won_back AND cost > 0)',
  });
  // Lessons and practice sessions finished on the learner's day, toward winning an ended streak back.
  pgm.addColumns('user_streaks', {
    sessions_on: { type: 'date' },
    sessions_today: { type: 'integer', notNull: true, default: 0 },
  });

  // When each streak milestone last paid, so it pays again only for a new streak two months on.
  pgm.createTable('streak_milestones', {
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    days: { type: 'integer', notNull: true },
    /** the learner's day it paid on */
    paid_on: { type: 'date', notNull: true },
    zer: { type: 'integer', notNull: true, check: 'zer >= 0' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('streak_milestones', 'streak_milestones_pkey', { primaryKey: ['user_id', 'days', 'paid_on'] });

  // The members' box: one row a member a month, which is what makes it once.
  pgm.createTable('members_boxes', {
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    /** the first day of the box's month */
    month: { type: 'date', notNull: true },
    zer: { type: 'integer', notNull: true, check: 'zer >= 0' },
    free_gifts: { type: 'integer', notNull: true, check: 'free_gifts >= 0' },
    free_gifts_left: { type: 'integer', notNull: true },
    /** the month's members-only item, or null when the member had it already */
    item_sku: { type: 'text', references: 'shop_items', onDelete: 'SET NULL' },
    granted_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    seen_at: { type: 'timestamptz' },
  });
  pgm.addConstraint('members_boxes', 'members_boxes_pkey', { primaryKey: ['user_id', 'month'] });
  pgm.addConstraint('members_boxes', 'members_boxes_free_gifts_left', { check: 'free_gifts_left BETWEEN 0 AND free_gifts' });

  // Gifts onto a post, and gifts paid with a free gift from a members' box.
  pgm.addColumns('gifts', {
    post_type: { type: 'text', check: "post_type IN ('library', 'image')" },
    post_id: { type: 'uuid' },
    paid_with: { type: 'text', notNull: true, default: 'zer', check: "paid_with IN ('zer', 'free_gift')" },
  });
  pgm.addConstraint('gifts', 'gifts_post_whole', { check: '(post_type IS NULL) = (post_id IS NULL)' });
  pgm.createIndex('gifts', ['post_type', 'post_id', 'created_at'], { name: 'gifts_on_post_idx', where: 'post_id IS NOT NULL' });

  // The gift stickers: the app icons' pictures, given rather than worn.
  STICKERS.forEach(([sku, name, assetKey, price], i) => {
    pgm.sql(
      `INSERT INTO shop_items (sku, name, category, currency, price, is_unique, active, asset_key, display_order)
       VALUES ('${sku}', '${name}', 'sticker', 'zer', ${price}, false, true, '${assetKey}', ${i})
       ON CONFLICT (sku) DO NOTHING`,
    );
  });
};

export const down = (pgm) => {
  pgm.sql(`LOCK TABLE wallet_balances IN SHARE ROW EXCLUSIVE MODE`);

  pgm.sql(`DELETE FROM shop_items s WHERE s.category = 'sticker' AND NOT EXISTS (SELECT 1 FROM user_entitlements e WHERE e.sku = s.sku)
                                       AND NOT EXISTS (SELECT 1 FROM gifts g WHERE g.sku = s.sku)`);
  pgm.dropIndex('gifts', ['post_type', 'post_id', 'created_at'], { name: 'gifts_on_post_idx' });
  pgm.dropConstraint('gifts', 'gifts_post_whole');
  pgm.dropColumns('gifts', ['post_type', 'post_id', 'paid_with']);
  pgm.dropTable('members_boxes');
  pgm.dropTable('streak_milestones');
  pgm.dropColumns('user_streaks', ['sessions_on', 'sessions_today']);

  pgm.dropConstraint('streak_repairs', 'streak_repairs_how');
  // A restore won back by learning has no place in the old rules, which only knew bought and free ones.
  pgm.sql(`DELETE FROM streak_repairs WHERE won_back`);
  pgm.dropColumns('streak_repairs', ['won_back']);
  pgm.sql(`UPDATE streak_repairs SET cost = cost / ${RATE}`);
  pgm.renameColumn('streak_repairs', 'cost', 'cost_gems');
  pgm.addConstraint('streak_repairs', 'streak_repairs_free_costs_nothing', { check: '(free AND cost_gems = 0) OR (NOT free AND cost_gems > 0)' });

  pgm.sql(`
    UPDATE event_quest_claims c SET reward = r.before
      FROM gewher_retirement r
     WHERE r.kind = 'event_claim' AND r.ref = c.user_id::text || ':' || c.event_key || ':' || c.quest_id`);
  pgm.sql(`
    UPDATE events e SET quests = r.before->'quests', rewards = r.before->'rewards', updated_at = now()
      FROM gewher_retirement r WHERE r.kind = 'event' AND r.ref = e.key`);

  pgm.sql(`UPDATE league_weeks SET zer = zer / ${RATE}`);
  pgm.renameColumn('league_weeks', 'zer', 'gems');
  pgm.sql(`UPDATE rank_season_rewards SET zer = zer / ${RATE}`);
  pgm.renameColumn('rank_season_rewards', 'zer', 'gems');
  pgm.sql(`UPDATE seasons SET reward_zer = reward_zer / ${RATE}`);
  pgm.renameColumn('seasons', 'reward_zer', 'reward_gems');
  pgm.addColumns('tournaments', { reward_gems: { type: 'integer', notNull: true, default: 0 } });
  pgm.sql(`
    UPDATE tournaments t SET reward_gems = r.gewher, reward_zer = GREATEST(0, t.reward_zer - r.zer)
      FROM gewher_retirement r WHERE r.kind = 'tournament' AND r.ref = t.id::text`);

  pgm.sql(`UPDATE iap_receipts SET zer = zer / ${RATE}, clawed_back = clawed_back / ${RATE}`);
  pgm.renameColumn('iap_receipts', 'zer', 'gems');
  pgm.sql(`UPDATE zer_packs SET zer = zer / ${RATE}`);
  pgm.sql(`ALTER TABLE zer_packs RENAME CONSTRAINT zer_packs_zer_check TO gem_packs_gems_check`);
  pgm.sql(`ALTER TABLE zer_packs RENAME CONSTRAINT zer_packs_platform_check TO gem_packs_platform_check`);
  pgm.sql(`ALTER TABLE zer_packs RENAME CONSTRAINT zer_packs_pkey TO gem_packs_pkey`);
  pgm.renameColumn('zer_packs', 'zer', 'gems');
  pgm.renameTable('zer_packs', 'gem_packs');

  pgm.sql(`
    UPDATE earn_rules e SET amount = r.gewher, daily_cap = (r.before->>'daily_cap')::int, updated_at = now()
      FROM gewher_retirement r WHERE r.kind = 'rule' AND r.ref = e.key`);
  pgm.sql(`ALTER TABLE earn_rules RENAME CONSTRAINT earn_rules_amount_check TO gem_rules_amount_check`);
  pgm.renameTable('earn_rules', 'gem_rules');

  pgm.dropConstraint('cosmetic_refreshes', 'cosmetic_refreshes_zer_only');
  pgm.sql(`
    UPDATE cosmetic_refreshes c SET refund_amount = r.gewher, refund_currency = 'gems'
      FROM gewher_retirement r WHERE r.kind = 'refresh' AND r.ref = c.user_id::text || ':' || c.sku`);
  pgm.dropConstraint('gifts', 'gifts_zer_only');
  pgm.sql(`UPDATE gifts g SET price = r.gewher, currency = 'gems' FROM gewher_retirement r WHERE r.kind = 'gift' AND r.ref = g.id::text`);
  pgm.dropConstraint('shop_items', 'shop_items_zer_only');
  pgm.sql(`UPDATE shop_items s SET price = r.gewher, currency = 'gems' FROM gewher_retirement r WHERE r.kind = 'shop_item' AND r.ref = s.sku`);

  // Balances back as they were, by two more ledger rows each; Zêr spent since can only be taken back as far as it is held.
  pgm.dropConstraint('wallet_balances', 'wallet_balances_zer_only');
  pgm.dropConstraint('wallet_ledger', 'wallet_ledger_zer_only');
  pgm.sql(`
    CREATE TEMP TABLE gewher_undo ON COMMIT DROP AS
    SELECT r.ref::uuid AS user_id, r.gewher, LEAST(r.zer, COALESCE(b.balance, 0)) AS zer
      FROM gewher_retirement r LEFT JOIN wallet_balances b ON b.user_id = r.ref::uuid AND b.currency = 'zer'
     WHERE r.kind = 'balance'`);
  pgm.sql(`
    INSERT INTO wallet_ledger (user_id, currency, amount, reason, ref_id)
    SELECT user_id, 'zer', -zer, 'gewher_restored', 'one-currency' FROM gewher_undo WHERE zer > 0`);
  pgm.sql(`
    INSERT INTO wallet_ledger (user_id, currency, amount, reason, ref_id)
    SELECT user_id, 'gems', gewher, 'gewher_restored', 'one-currency' FROM gewher_undo`);
  pgm.sql(`UPDATE wallet_balances b SET balance = b.balance - u.zer, updated_at = now() FROM gewher_undo u WHERE b.user_id = u.user_id AND b.currency = 'zer'`);
  pgm.sql(`
    INSERT INTO wallet_balances (user_id, currency, balance) SELECT user_id, 'gems', gewher FROM gewher_undo
    ON CONFLICT (user_id, currency) DO UPDATE SET balance = wallet_balances.balance + EXCLUDED.balance, updated_at = now()`);

  pgm.dropTable('gewher_retirement');
};
