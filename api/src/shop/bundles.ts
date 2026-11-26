/**
 * Bundles: a background, a frame, an icon and a word tag that belong together, with a few small gifts for the gift bag,
 * sold for less than their parts (shared shop-bundles.ts). The server alone prices them: from its own rows, less what
 * the buyer owns already (shared `bundleQuote`). A purchase is one transaction that takes the Zêr, gives every cosmetic
 * not yet owned, puts the gifts in the bag and records the purchase with its parts, or does none of it.
 *
 * Locks follow the order every purchase and gift takes: the buyer's entitlements (by sku), then their Zêr row, then
 * their bag (gifts/bag.ts), so a bundle, a single purchase and a gift can never wait on one another in a ring. A
 * per-buyer lock taken first makes a retry with the same request key wait for the first and answer what it did.
 */
import type pg from 'pg';
import {
  BAG_MAX_EACH,
  GIFT_CATEGORY,
  bundleQuote,
  itemCategory,
  type BundleGiftView,
  type BundlePartView,
  type BundlePurchaseResult,
  type BundleQuote,
  type BundleView,
  type BundlesView,
} from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { cosmeticAssetUrl, giftOnOffer, type PublicUrl } from '../cosmetics/access.js';
import { isKnownAdultAccount } from '../users/age.js';
import { lockZerRow } from '../gifts/bag.js';
import type { WalletService } from '../wallet/service.js';
import { SENSITIVE_PRICE } from '../admin/config-service.js';
import type { AuditService } from '../admin/audit-service.js';
import { isPurchasable, lockEntitlement, type ItemRow } from './service.js';

interface BundleRow {
  id: string;
  name: string;
  price: number;
  active: boolean;
  available_from: Date | null;
  available_to: Date | null;
  display_order: number;
}

/** A part joined with its catalogue row and whether the buyer owns it. */
interface PartRow extends ItemRow {
  bundle_id: string;
  quantity: number;
  owned: boolean;
}

/** A part as a purchase records it (`bundle_purchases.parts`). */
interface SettledPart {
  sku: string;
  category: string;
  price: number;
  quantity: number;
  owned: boolean;
}

/** A bundle as the admin sees it: its parts, and how many have bought it. */
export interface AdminBundle {
  id: string;
  name: string;
  price: number;
  active: boolean;
  availableFrom: Date | null;
  availableTo: Date | null;
  displayOrder: number;
  parts: { sku: string; name: string; category: string; price: number; quantity: number }[];
  /** what the parts cost one by one */
  worth: number;
  purchases: number;
}

/** The order a bundle shows its cosmetics in: worn behind, round and on the face, then by the name. */
const PART_ORDER = ['background', 'frame', 'icon', 'tag'];
const partRank = (category: string): number => {
  const at = PART_ORDER.indexOf(itemCategory(category));
  return at < 0 ? PART_ORDER.length : at;
};

const isGift = (row: { category: string }): boolean => row.category === GIFT_CATEGORY;

/** Whether a bundle is listed now: active and inside its window. */
function bundleListed(b: BundleRow, now: Date): boolean {
  if (!b.active) return false;
  if (b.available_from && b.available_from > now) return false;
  if (b.available_to && b.available_to < now) return false;
  return true;
}

/** Whether a part can be given now: a cosmetic owned already needs nothing; anything else must be on sale, a gift on offer too. */
function partAvailable(p: PartRow, now: Date): boolean {
  if (!isGift(p) && p.owned) return true;
  if (!isPurchasable(p, now) || p.retired_at) return false;
  return giftOnOffer({ sku: p.sku, category: p.category, assetKey: p.asset_key }, now);
}

function quoteOf(price: number, parts: readonly PartRow[]): BundleQuote {
  return bundleQuote(
    price,
    parts.map((p) => ({ price: p.price, quantity: p.quantity, gift: isGift(p), owned: !isGift(p) && p.owned })),
  );
}

/** A bundle's parts in the order they show, cosmetics first. */
function ordered(parts: PartRow[]): PartRow[] {
  return [...parts].sort((a, b) => Number(isGift(a)) - Number(isGift(b)) || partRank(a.category) - partRank(b.category) || a.price - b.price || a.sku.localeCompare(b.sku));
}

export class BundleService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly wallet: WalletService,
    private readonly publicUrl: PublicUrl,
  ) {}

  /** Every listed bundle as `userId` would buy it: their price, what they own of it, and whether its gifts fit their bag. */
  async list(userId: string, now: Date = new Date()): Promise<BundlesView> {
    const [bundles, parts, bag, nudges] = await Promise.all([
      this.pool.query<BundleRow>(`SELECT * FROM shop_bundles ORDER BY display_order, id`),
      this.pool.query<PartRow>(
        `SELECT p.bundle_id, p.quantity, i.*, (e.user_id IS NOT NULL) AS owned
           FROM shop_bundle_parts p
           JOIN shop_items i ON i.sku = p.sku
           LEFT JOIN user_entitlements e ON e.user_id = $1 AND e.sku = p.sku`,
        [userId],
      ),
      this.pool.query<{ sku: string; count: number }>(`SELECT sku, count FROM gift_bag WHERE user_id = $1`, [userId]),
      isKnownAdultAccount(this.pool, userId),
    ]);
    const held = new Map(bag.rows.map((r) => [r.sku, r.count]));
    const byBundle = new Map<string, PartRow[]>();
    for (const p of parts.rows) byBundle.set(p.bundle_id, [...(byBundle.get(p.bundle_id) ?? []), p]);

    const views: BundleView[] = [];
    for (const b of bundles.rows) {
      const its = ordered(byBundle.get(b.id) ?? []);
      if (!bundleListed(b, now) || its.length === 0) continue;
      views.push({
        id: b.id,
        name: b.name,
        listPrice: b.price,
        parts: its.filter((p) => !isGift(p)).map((p): BundlePartView => ({
          sku: p.sku,
          name: p.name,
          description: p.description,
          category: p.category,
          price: p.price,
          assetUrl: cosmeticAssetUrl(p.category, p.asset_key, this.publicUrl, p.sku),
          owned: p.owned,
        })),
        gifts: its.filter(isGift).map((p): BundleGiftView => ({
          sku: p.sku,
          name: p.name,
          count: p.quantity,
          price: p.price,
          assetUrl: cosmeticAssetUrl(p.category, p.asset_key, this.publicUrl, p.sku),
        })),
        quote: quoteOf(b.price, its),
        onSale: its.every((p) => partAvailable(p, now)),
        bagFull: its.some((p) => isGift(p) && (held.get(p.sku) ?? 0) + p.quantity > BAG_MAX_EACH),
      });
    }
    return { bundles: views, nudges };
  }

  /**
   * Buys a bundle at the price the server works out now. Refuses, before any Zêr moves: a child's profile
   * (CHILD_NO_PURCHASES), an unknown or unlisted bundle, a part that cannot be had, one whose every cosmetic is owned
   * (ALREADY_OWNED), a price that is not the one the buyer was shown (PRICE_CHANGED), gifts the bag has no room for
   * (BAG_FULL) and too little Zêr (INSUFFICIENT_FUNDS). The same request key answers the first purchase again.
   */
  async purchase(
    userId: string,
    bundleId: string,
    idempotencyKey: string,
    opts: { expectedPrice?: number; now?: Date } = {},
  ): Promise<BundlePurchaseResult> {
    const now = opts.now ?? new Date();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`bundle-buy:${userId}`]);

      const prior = await client.query<{ bundle_id: string; price: number; parts: SettledPart[] }>(
        `SELECT bundle_id, price, parts FROM bundle_purchases WHERE user_id = $1 AND idempotency_key = $2`,
        [userId, idempotencyKey],
      );
      if (prior.rows[0]) {
        const was = prior.rows[0];
        if (was.bundle_id !== bundleId) throw new AppError('IDEMPOTENCY_REUSED', 409, 'that request key was already used');
        const balance = await client.query<{ balance: number }>(`SELECT balance FROM wallet_balances WHERE user_id = $1 AND currency = 'zer'`, [userId]);
        await client.query('COMMIT');
        return settled(bundleId, was.price, balance.rows[0]?.balance ?? 0, was.parts, true);
      }

      // A child's profile has no Zêr and buys nothing; the child gate keeps it off this route, and this keeps it off the purchase.
      const who = await client.query<{ kind: string }>(`SELECT kind FROM users WHERE id = $1 AND deleted_at IS NULL`, [userId]);
      if (!who.rows[0] || who.rows[0].kind === 'child') throw new AppError('CHILD_NO_PURCHASES', 403, 'purchases are made by a parent');

      const found = await client.query<BundleRow>(`SELECT * FROM shop_bundles WHERE id = $1 FOR SHARE`, [bundleId]);
      const bundle = found.rows[0];
      if (!bundle) throw new AppError('BUNDLE_NOT_FOUND', 404, 'no such bundle');
      if (!bundleListed(bundle, now)) throw new AppError('BUNDLE_UNAVAILABLE', 409, 'this bundle is not on sale');

      // the parts' rows held as they are read, so an admin's price change waits for this purchase or comes before it
      const read = await client.query<Omit<PartRow, 'owned'>>(
        `SELECT p.bundle_id, p.quantity, i.* FROM shop_bundle_parts p JOIN shop_items i ON i.sku = p.sku
          WHERE p.bundle_id = $1 ORDER BY i.sku FOR SHARE OF i`,
        [bundleId],
      );
      const cosmetics = read.rows.filter((p) => !isGift(p));
      for (const p of cosmetics) await lockEntitlement(client, userId, p.sku);
      const owns = await client.query<{ sku: string }>(
        `SELECT sku FROM user_entitlements WHERE user_id = $1 AND sku = ANY($2::text[])`,
        [userId, cosmetics.map((p) => p.sku)],
      );
      const owned = new Set(owns.rows.map((r) => r.sku));
      const parts: PartRow[] = read.rows.map((p) => ({ ...p, owned: !isGift(p) && owned.has(p.sku) }));
      if (parts.length === 0 || !parts.every((p) => partAvailable(p, now))) {
        throw new AppError('BUNDLE_UNAVAILABLE', 409, 'something in this bundle is not on sale');
      }

      const quote = quoteOf(bundle.price, parts);
      if (quote.complete) throw new AppError('ALREADY_OWNED', 409, 'everything in this bundle is yours already');
      if (opts.expectedPrice != null && opts.expectedPrice !== quote.price) {
        throw new AppError('PRICE_CHANGED', 409, 'the price changed; please review and try again', { price: quote.price });
      }

      // the Zêr row before the bag, the one order every path takes (gifts/bag.ts)
      await lockZerRow(client, userId);
      await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`gift-bag:${userId}`]);
      const gifts = parts.filter(isGift);
      const bag = await client.query<{ sku: string; count: number }>(
        `SELECT sku, count FROM gift_bag WHERE user_id = $1 AND sku = ANY($2::text[])`,
        [userId, gifts.map((g) => g.sku)],
      );
      const inBag = new Map(bag.rows.map((r) => [r.sku, r.count]));
      if (gifts.some((g) => (inBag.get(g.sku) ?? 0) + g.quantity > BAG_MAX_EACH)) {
        throw new AppError('BAG_FULL', 409, 'your gift bag has no room for this bundle’s gifts; give some away first');
      }

      const debit = await this.wallet.debitWithin(client, {
        userId,
        currency: 'zer',
        amount: quote.price,
        reason: 'bundle_purchase',
        refId: bundleId,
        // filed under the buyer, as a single purchase's key is (shop/service.ts)
        idempotencyKey: `bundle:${userId}:${idempotencyKey}`,
      });
      // The key was looked up under the buyer's lock above, so a ledger row already under it is not this purchase's.
      if (debit.duplicate) throw new AppError('IDEMPOTENCY_REUSED', 409, 'that request key was already used');

      const record: SettledPart[] = parts.map((p) => ({ sku: p.sku, category: p.category, price: p.price, quantity: p.quantity, owned: p.owned }));
      const bought = await client.query<{ id: string }>(
        `INSERT INTO bundle_purchases (user_id, bundle_id, idempotency_key, price, worth, parts)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING id`,
        [userId, bundleId, idempotencyKey, quote.price, quote.worth, JSON.stringify(record)],
      );
      const purchaseId = bought.rows[0]!.id;

      const fresh = cosmetics.filter((p) => !owned.has(p.sku)).map((p) => p.sku);
      if (fresh.length > 0) {
        await client.query(
          `INSERT INTO user_entitlements (user_id, sku, source)
           SELECT $1, sku, 'bundle' FROM unnest($2::text[]) AS sku
           ON CONFLICT (user_id, sku) DO NOTHING`,
          [userId, fresh],
        );
      }
      for (const g of gifts) {
        await client.query(
          `INSERT INTO gift_bag (user_id, sku, count) VALUES ($1, $2, $3)
           ON CONFLICT (user_id, sku) DO UPDATE SET count = gift_bag.count + EXCLUDED.count, updated_at = now()`,
          [userId, g.sku, g.quantity],
        );
        // Told at once by the bundle's own moment, so no later line about it; never counted in the five earned a day.
        await client.query(
          `INSERT INTO gift_bag_grants (user_id, sku, source, ref, granted_on, seen_at, quantity)
           VALUES ($1, $2, 'bundle', $3, (now() AT TIME ZONE 'UTC')::date, now(), $4)`,
          [userId, g.sku, `${purchaseId}:${g.sku}`, g.quantity],
        );
      }

      await client.query('COMMIT');
      return settled(bundleId, quote.price, debit.balance, record, false);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Admin: every bundle, listed or not, with its parts, their worth and how many have bought it. */
  async allBundles(): Promise<AdminBundle[]> {
    const [bundles, parts, sold] = await Promise.all([
      this.pool.query<BundleRow>(`SELECT * FROM shop_bundles ORDER BY display_order, id`),
      this.pool.query<{ bundle_id: string; sku: string; name: string; category: string; price: number; quantity: number }>(
        `SELECT p.bundle_id, p.sku, i.name, i.category, i.price, p.quantity FROM shop_bundle_parts p JOIN shop_items i ON i.sku = p.sku`,
      ),
      this.pool.query<{ bundle_id: string; n: number }>(`SELECT bundle_id, count(*)::int AS n FROM bundle_purchases GROUP BY bundle_id`),
    ]);
    const count = new Map(sold.rows.map((r) => [r.bundle_id, r.n]));
    return bundles.rows.map((b) => {
      const its = parts.rows.filter((p) => p.bundle_id === b.id).map(({ bundle_id: _, ...p }) => p);
      return {
        id: b.id,
        name: b.name,
        price: b.price,
        active: b.active,
        availableFrom: b.available_from,
        availableTo: b.available_to,
        displayOrder: b.display_order,
        parts: its,
        worth: its.reduce((sum, p) => sum + p.price * p.quantity, 0),
        purchases: count.get(b.id) ?? 0,
      };
    });
  }

  /**
   * Why a bundle could not take this price, before Approvals holds it for a second admin: no such bundle, or a price at
   * or over its parts' worth, since a bundle must save something. Null when it could.
   */
  async priceProblem(id: string, price: number): Promise<'bundle-not-found' | 'bundle-saves-nothing' | null> {
    const found = await this.pool.query(`SELECT 1 FROM shop_bundles WHERE id = $1`, [id]);
    if (!found.rowCount) return 'bundle-not-found';
    return price >= (await partsWorth(this.pool, id)) ? 'bundle-saves-nothing' : null;
  }

  /**
   * Admin: lists a bundle or takes it off sale, or changes its price. A new price of SENSITIVE_PRICE or more goes through
   * Approvals, as an item's does (`approved` is Approvals applying one a second admin signed off); one at or over its
   * parts' worth is refused, since a bundle must save something.
   */
  async editBundle(
    audit: AuditService,
    adminId: string,
    requestId: string,
    id: string,
    edit: { active?: boolean; price?: number },
    opts: { approved?: boolean } = {},
  ): Promise<AdminBundle> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query<BundleRow>(`SELECT * FROM shop_bundles WHERE id = $1 FOR UPDATE`, [id]);
      const before = found.rows[0];
      if (!before) throw new AppError('BUNDLE_NOT_FOUND', 404, 'no such bundle');
      const price = edit.price ?? before.price;
      if (price !== before.price) {
        if (price >= SENSITIVE_PRICE && !opts.approved) {
          throw new AppError('PRICE_NEEDS_APPROVAL', 409, `a price of ${SENSITIVE_PRICE.toLocaleString('en')} or more goes through Approvals, where a second admin signs off`);
        }
        if (price >= (await partsWorth(client, id))) throw new AppError('BUNDLE_SAVES_NOTHING', 400, 'a bundle must cost less than its parts');
      }
      const active = edit.active ?? before.active;
      await client.query(`UPDATE shop_bundles SET price = $2, active = $3, updated_at = now() WHERE id = $1`, [id, price, active]);
      await audit.record(client, {
        adminId,
        action: 'shop.bundle.edit',
        targetType: 'shop_bundle',
        targetId: id,
        before: { price: before.price, active: before.active },
        after: { price, active },
        requestId,
      });
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    return (await this.allBundles()).find((b) => b.id === id)!;
  }
}

/** What a bundle's parts cost one by one. */
async function partsWorth(db: Pick<pg.Pool, 'query'>, id: string): Promise<number> {
  const worth = await db.query<{ worth: number }>(
    `SELECT COALESCE(sum(i.price * p.quantity), 0)::int AS worth FROM shop_bundle_parts p JOIN shop_items i ON i.sku = p.sku WHERE p.bundle_id = $1`,
    [id],
  );
  return worth.rows[0]!.worth;
}

/** The answer a purchase gives, from what it recorded. */
function settled(bundle: string, price: number, balance: number, parts: readonly SettledPart[], duplicate: boolean): BundlePurchaseResult {
  return {
    purchased: true,
    duplicate,
    bundle,
    price,
    balance,
    granted: parts.filter((p) => !isGift(p) && !p.owned).map((p) => p.sku),
    gifts: parts.filter(isGift).map((p) => ({ sku: p.sku, count: p.quantity })),
  };
}

