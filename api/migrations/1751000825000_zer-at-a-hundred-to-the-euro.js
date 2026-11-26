/**
 * Zêr at 100 to the euro (docs/money/hevalo-plus.md): 100 Zêr is now one unit of the store's currency, a euro or a
 * dollar, so what Zêr prices and pays is halved and rounded to a tidy 5: shop prices, event rewards and tournament
 * prizes. It runs before the one currency (1751000830000), which sets what was in Gewher at the new rate itself.
 *
 * Balances are not touched. Nobody's number goes down, and with prices halved what an early learner saved now buys
 * twice as much: a small thank-you to the people who were here first.
 *
 * 1751000092000 seeds the icons and backgrounds from api/content/cosmetics.json as it is when it runs, so on a database
 * made after the manifest took its new prices they arrive halved already; a row at its manifest price is left as it is.
 * Every change is recorded in `zer_rebase`, so `down` puts back exactly what was there.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Half of a Zêr amount, rounded half up to a multiple of 5, or under 10 up to the next whole Zêr, so nothing priced becomes free. */
const half = (v) => `(CASE WHEN (${v}) < 10 THEN CEIL((${v}) / 2.0) ELSE 5 * ROUND((${v}) / 10.0) END)::int`;

/** The icons' and backgrounds' prices in the manifest now, as a jsonb literal ({ sku: price }). */
function manifestPrices() {
  const p = join(dirname(fileURLToPath(import.meta.url)), '..', 'content', 'cosmetics.json');
  const m = JSON.parse(readFileSync(p, 'utf8'));
  const prices = Object.fromEntries([...m.backgrounds, ...m.icons].map((r) => [r.sku, r.price]));
  return `'${JSON.stringify(prices).replaceAll("'", "''")}'::jsonb`;
}

export const up = (pgm) => {
  pgm.createTable('zer_rebase', {
    /** what was halved: a 'shop_item', an 'event' or a 'tournament' */
    kind: { type: 'text', notNull: true },
    /** which one, by its key */
    ref: { type: 'text', notNull: true },
    before: { type: 'integer' },
    after: { type: 'integer' },
    /** an event's quests and rewards before */
    config: { type: 'jsonb' },
    rebased_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('zer_rebase', 'zer_rebase_pkey', { primaryKey: ['kind', 'ref'] });

  pgm.sql(`
    INSERT INTO zer_rebase (kind, ref, before, after)
    SELECT 'shop_item', s.sku, s.price, ${half('s.price')}
      FROM shop_items s
      LEFT JOIN jsonb_each_text(${manifestPrices()}) AS m(sku, price) ON m.sku = s.sku
     WHERE s.currency = 'zer' AND s.price > 0 AND m.price IS DISTINCT FROM s.price::text`);
  pgm.sql(`UPDATE shop_items s SET price = r.after FROM zer_rebase r WHERE r.kind = 'shop_item' AND r.ref = s.sku`);

  pgm.sql(`
    INSERT INTO zer_rebase (kind, ref, config)
    SELECT 'event', key, jsonb_build_object('quests', quests, 'rewards', rewards) FROM events
     WHERE jsonb_typeof(rewards->'zer') = 'number'
        OR (jsonb_typeof(quests) = 'array'
            AND EXISTS (SELECT 1 FROM jsonb_array_elements(quests) q WHERE jsonb_typeof(q->'reward'->'zer') = 'number'))`);
  pgm.sql(`
    UPDATE events e SET quests = (
      SELECT jsonb_agg(CASE WHEN jsonb_typeof(q->'reward'->'zer') = 'number'
                            THEN jsonb_set(q, '{reward,zer}', to_jsonb(${half(`(q->'reward'->>'zer')::numeric`)})) ELSE q END ORDER BY ord)
        FROM jsonb_array_elements(e.quests) WITH ORDINALITY AS t(q, ord)), updated_at = now()
     WHERE jsonb_typeof(e.quests) = 'array'
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(e.quests) q WHERE jsonb_typeof(q->'reward'->'zer') = 'number')`);
  pgm.sql(`
    UPDATE events SET rewards = jsonb_set(rewards, '{zer}', to_jsonb(${half(`(rewards->>'zer')::numeric`)})), updated_at = now()
     WHERE jsonb_typeof(rewards->'zer') = 'number'`);

  pgm.sql(`
    INSERT INTO zer_rebase (kind, ref, before, after)
    SELECT 'tournament', id::text, reward_zer, ${half('reward_zer')} FROM tournaments WHERE reward_zer > 0`);
  pgm.sql(`UPDATE tournaments t SET reward_zer = r.after FROM zer_rebase r WHERE r.kind = 'tournament' AND r.ref = t.id::text`);
};

export const down = (pgm) => {
  pgm.sql(`UPDATE shop_items s SET price = r.before FROM zer_rebase r WHERE r.kind = 'shop_item' AND r.ref = s.sku`);
  pgm.sql(`
    UPDATE events e SET quests = r.config->'quests', rewards = r.config->'rewards', updated_at = now()
      FROM zer_rebase r WHERE r.kind = 'event' AND r.ref = e.key`);
  pgm.sql(`UPDATE tournaments t SET reward_zer = r.before FROM zer_rebase r WHERE r.kind = 'tournament' AND r.ref = t.id::text`);
  pgm.dropTable('zer_rebase');
};
