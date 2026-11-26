import type pg from 'pg';
import type { ShopService } from '../shop/service.js';
import type { EventService } from '../events/service.js';
import { claimArt, releaseArt } from '../shop/art.js';
import type { EarnRule } from '../earn/service.js';
import { AppError } from '../plugins/errors.js';

export type ConfigTarget = 'shop_item' | 'event' | 'earn_rule' | 'plus_grant' | 'shop_bundle';
export type ChangeStatus = 'pending' | 'applied' | 'rejected';

/** Price at/above which a shop change needs a second admin's sign-off. */
export const SENSITIVE_PRICE = 500;

export interface ProposeResult {
  status: 'applied' | 'pending';
  id: string;
}
export type ProposeError = {
  ok: false;
  reason:
    | 'invalid-target'
    | 'past-schedule'
    | 'bad-window'
    | 'bad-price'
    | 'invalid-payload'
    | 'art-missing'
    | 'art-wrong-kind'
    | 'bundle-not-found'
    | 'bundle-saves-nothing';
};
export type ProposeOutcome = ({ ok: true } & ProposeResult) | ProposeError;

export type DecideResult =
  | { ok: true; status: ChangeStatus }
  | { ok: false; reason: 'not-found' | 'not-pending' | 'self-approve' };

export interface PendingChange {
  id: string;
  target: ConfigTarget;
  payload: Record<string, unknown>;
  sensitive: boolean;
  proposerId: string | null;
  createdAt: Date;
}

/** Hevalo+ an admin asked for their own account: whose, for how long and why. */
export interface PlusGrantChange {
  userId: string;
  days: number;
  reason: string;
}

/** What applying the two kinds of change outside the shop and events takes, from the services that own them. */
export interface ConfigAppliers {
  earn?: { rules(): Promise<EarnRule[]>; upsertRule(rule: EarnRule): Promise<void> };
  /** gives Hevalo+ as `adminId` did, the second admin named in its history; false for an account that is gone */
  plus?: (adminId: string, change: PlusGrantChange, approvedBy: string) => Promise<boolean>;
}

/**
 * Whether a change to an earn rule pays more than the rule does now: a new rule that pays, switching one on, more each
 * time, a higher daily cap or none, or a shorter wait between payments. Anything else pays the same or less.
 */
export function earnRulePaysMore(current: EarnRule | null, next: EarnRule): boolean {
  if (!next.active) return false;
  if (!current || !current.active) return true;
  if (next.amount > current.amount || next.cooldownSeconds < current.cooldownSeconds) return true;
  return current.dailyCap !== null && (next.dailyCap === null || next.dailyCap > current.dailyCap);
}

/** A bundle's price as Approvals takes it (shop/bundles.ts): what would stop it, and setting it as the admin who decided. */
export interface BundlePrices {
  priceProblem(id: string, price: number): Promise<'bundle-not-found' | 'bundle-saves-nothing' | null>;
  setPrice(id: string, price: number, adminId: string): Promise<void>;
}

/**
 * Shop, bundle, event and earning configuration with dual-admin approval. A non-sensitive upsert applies immediately;
 * a sensitive one (large price, currency-granting event, an earn rule that pays more, Hevalo+ for an admin's own
 * account) waits for a different admin. Applying delegates to the services that own each (which validate and bust
 * their caches). Past-dated events are rejected.
 */
export class ConfigService {
  private readonly pool: pg.Pool;
  private readonly shop: ShopService;
  private readonly events: EventService;
  private readonly appliers: ConfigAppliers;
  private readonly bundles: BundlePrices | null;
  private readonly now: () => Date;

  constructor(pool: pg.Pool, deps: { shop: ShopService; events: EventService; bundles?: BundlePrices; now?: () => Date } & ConfigAppliers) {
    this.pool = pool;
    this.shop = deps.shop;
    this.events = deps.events;
    this.appliers = { earn: deps.earn, plus: deps.plus };
    this.bundles = deps.bundles ?? null;
    this.now = deps.now ?? (() => new Date());
  }

  /**
   * A change to an earn rule (PUT /admin/earn-rules/:key): one that pays the same or less applies now, one that pays
   * more (`earnRulePaysMore`) waits for a second admin.
   */
  async proposeEarnRule(proposerId: string, rule: EarnRule): Promise<ProposeResult> {
    const earn = this.appliers.earn;
    if (!earn) throw new Error('earn rules are not wired into approvals');
    const current = (await earn.rules()).find((r) => r.key === rule.key) ?? null;
    const payload = { ...rule } as unknown as Record<string, unknown>;
    if (!earnRulePaysMore(current, rule)) {
      await earn.upsertRule(rule);
      return { status: 'applied', id: await this.record('earn_rule', payload, false, 'applied', proposerId, proposerId) };
    }
    return { status: 'pending', id: await this.record('earn_rule', payload, true, 'pending', proposerId, null) };
  }

  /** Hevalo+ an admin gives their own account, which always waits for a second admin: nobody grants themselves alone. */
  async proposePlusGrant(proposerId: string, change: PlusGrantChange): Promise<ProposeResult> {
    if (!this.appliers.plus) throw new Error('Hevalo+ grants are not wired into approvals');
    const payload = { ...change } as unknown as Record<string, unknown>;
    return { status: 'pending', id: await this.record('plus_grant', payload, true, 'pending', proposerId, null) };
  }

  /** Propose an upsert. Applies now if low-impact, else queues for approval. */
  async propose(proposerId: string, target: ConfigTarget, payload: Record<string, unknown>): Promise<ProposeOutcome> {
    if (target !== 'shop_item' && target !== 'event' && !(target === 'shop_bundle' && this.bundles)) return { ok: false, reason: 'invalid-target' };
    const invalid =
      this.validate(target, payload) ?? (target === 'shop_bundle' ? await this.bundles!.priceProblem(payload.id as string, payload.price as number) : null);
    if (invalid) return { ok: false, reason: invalid };

    const sensitive = this.isSensitive(target, payload);
    if (!sensitive) {
      await this.apply(target, payload, { proposerId, reviewerId: proposerId });
      const row = await this.record(target, payload, false, 'applied', proposerId, proposerId);
      return { ok: true, status: 'applied', id: row };
    }
    const held = await this.holdArt(target, payload);
    if (held) return { ok: false, reason: held };
    const id = await this.record(target, payload, true, 'pending', proposerId, null);
    return { ok: true, status: 'pending', id };
  }

  /**
   * Hold the art a pending shop change names (shop/art.ts). Uploaded art is kept only once an item uses it, and a
   * change can wait in Approvals longer than an unused upload survives, which would put an item on sale without its
   * picture.
   */
  private async holdArt(target: ConfigTarget, p: Record<string, unknown>): Promise<'art-missing' | 'art-wrong-kind' | null> {
    if (target !== 'shop_item' || typeof p.assetKey !== 'string') return null;
    const stored = await this.pool.query<{ category: string }>(`SELECT category FROM shop_items WHERE sku = $1`, [p.sku]);
    const category = typeof p.category === 'string' ? p.category : (stored.rows[0]?.category ?? 'misc');
    const claimed = await claimArt(this.pool, p.assetKey, category);
    if (claimed.ok) return null;
    return claimed.code === 'ART_MISSING' ? 'art-missing' : 'art-wrong-kind';
  }

  /** A second admin approves a pending change → it applies. */
  async approve(reviewerId: string, id: string): Promise<DecideResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query<{ target: ConfigTarget; payload: Record<string, unknown>; status: string; proposer_id: string | null }>(
        `SELECT target, payload, status, proposer_id FROM admin_config_changes WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const c = res.rows[0];
      if (!c) { await client.query('ROLLBACK'); return { ok: false, reason: 'not-found' }; }
      if (c.status !== 'pending') { await client.query('ROLLBACK'); return { ok: false, reason: 'not-pending' }; }
      if (c.proposer_id && c.proposer_id === reviewerId) { await client.query('ROLLBACK'); return { ok: false, reason: 'self-approve' }; }

      await this.apply(c.target, c.payload, { proposerId: c.proposer_id, reviewerId });
      await client.query(
        `UPDATE admin_config_changes SET status = 'applied', reviewer_id = $2, decided_at = now() WHERE id = $1`,
        [id, reviewerId],
      );
      await client.query('COMMIT');
      return { ok: true, status: 'applied' };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Reject a pending change. */
  async reject(reviewerId: string, id: string, reason?: string): Promise<DecideResult> {
    const res = await this.pool.query<{ target: ConfigTarget; payload: Record<string, unknown> }>(
      `UPDATE admin_config_changes SET status = 'rejected', reviewer_id = $2, reason = $3, decided_at = now()
       WHERE id = $1 AND status = 'pending'
       RETURNING target, payload`,
      [id, reviewerId, reason ?? null],
    );
    const rejected = res.rows[0];
    if (!rejected) return { ok: false, reason: 'not-found' };
    // art held for a change that will not happen goes back to the orphan sweep, unless an item uses it
    if (rejected.target === 'shop_item' && typeof rejected.payload.assetKey === 'string') {
      await releaseArt(this.pool, rejected.payload.assetKey);
    }
    return { ok: true, status: 'rejected' };
  }

  /** Pending changes awaiting a second admin, oldest first. */
  async pending(): Promise<PendingChange[]> {
    const res = await this.pool.query<{ id: string; target: ConfigTarget; payload: Record<string, unknown>; sensitive: boolean; proposer_id: string | null; created_at: Date }>(
      `SELECT id, target, payload, sensitive, proposer_id, created_at
       FROM admin_config_changes WHERE status = 'pending' ORDER BY created_at ASC`,
    );
    return res.rows.map((r) => ({ id: r.id, target: r.target, payload: r.payload, sensitive: r.sensitive, proposerId: r.proposer_id, createdAt: r.created_at }));
  }

  // ---- internals ------------------------------------------------------------

  private validate(target: ConfigTarget, p: Record<string, unknown>): ProposeError['reason'] | null {
    if (target === 'shop_bundle') {
      if (typeof p.id !== 'string' || p.id === '') return 'invalid-payload';
      return Number.isInteger(p.price) && (p.price as number) > 0 && (p.price as number) <= 10_000_000 ? null : 'bad-price';
    }
    if (target === 'shop_item') {
      if (typeof p.sku !== 'string' || typeof p.name !== 'string' || typeof p.currency !== 'string') return 'invalid-payload';
      if (typeof p.price !== 'number' || p.price < 0) return 'bad-price';
      return null;
    }
    // event
    if (typeof p.key !== 'string' || typeof p.name !== 'string' || typeof p.startsAt !== 'string' || typeof p.endsAt !== 'string') return 'invalid-payload';
    const start = new Date(p.startsAt).getTime();
    const end = new Date(p.endsAt).getTime();
    if (Number.isNaN(start) || Number.isNaN(end)) return 'invalid-payload';
    if (end <= start) return 'bad-window';
    if (start < this.now().getTime()) return 'past-schedule'; // no scheduling in the past
    return null;
  }

  private isSensitive(target: ConfigTarget, p: Record<string, unknown>): boolean {
    if (target === 'shop_item' || target === 'shop_bundle') return typeof p.price === 'number' && p.price >= SENSITIVE_PRICE;
    // events that grant currency/rewards are sensitive
    const rewards = p.rewards as Record<string, unknown> | undefined;
    return !!rewards && Object.keys(rewards).length > 0;
  }

  /**
   * Apply a change. A shop proposal names only what it changes, but the shop's upsert writes the whole row, so every
   * field the proposal omits is taken from the current item (otherwise a price change would wipe the picture, premium
   * flag, position, sale window and kind). `who` decided it: the proposer for a change that needed nobody else, else
   * the approving reviewer.
   */
  private async apply(target: ConfigTarget, p: Record<string, unknown>, who: { proposerId: string | null; reviewerId: string }): Promise<void> {
    if (target === 'shop_bundle') {
      if (!this.bundles) throw new Error('bundles are not wired into approvals');
      await this.bundles.setPrice(p.id as string, p.price as number, who.reviewerId);
      return;
    }
    if (target === 'earn_rule') {
      if (!this.appliers.earn) throw new Error('earn rules are not wired into approvals');
      await this.appliers.earn.upsertRule({
        key: p.key as string,
        amount: p.amount as number,
        dailyCap: (p.dailyCap as number | null) ?? null,
        cooldownSeconds: p.cooldownSeconds as number,
        active: p.active as boolean,
      });
      return;
    }
    if (target === 'plus_grant') {
      if (!this.appliers.plus || !who.proposerId) throw new Error('a Hevalo+ grant is applied from Approvals, for the admin who asked');
      const given = await this.appliers.plus(who.proposerId, { userId: p.userId as string, days: p.days as number, reason: p.reason as string }, who.reviewerId);
      if (!given) throw new AppError('NOT_FOUND', 404, 'that account is gone');
      return;
    }
    if (target === 'shop_item') {
      const { rows } = await this.pool.query<{
        description: string | null; category: string; is_unique: boolean; active: boolean; in_stock: boolean;
        available_from: Date | null; available_to: Date | null; asset_key: string | null; premium_only: boolean; display_order: number;
      }>(
        `SELECT description, category, is_unique, active, in_stock, available_from, available_to, asset_key, premium_only, display_order
           FROM shop_items WHERE sku = $1`,
        [p.sku],
      );
      const was = rows[0];
      const pick = <T>(key: string, stored: T | undefined): T | undefined => (key in p ? (p[key] as T) : stored);
      const date = (key: string, stored: Date | null | undefined): Date | null =>
        key in p ? (p[key] ? new Date(p[key] as string) : null) : (stored ?? null);
      await this.shop.createItem({
        sku: p.sku as string,
        name: p.name as string,
        description: pick('description', was?.description ?? undefined),
        category: pick('category', was?.category),
        currency: 'zer',
        price: p.price as number,
        isUnique: pick('isUnique', was?.is_unique),
        active: pick('active', was?.active),
        inStock: pick('inStock', was?.in_stock),
        availableFrom: date('availableFrom', was?.available_from),
        availableTo: date('availableTo', was?.available_to),
        assetKey: pick('assetKey', was?.asset_key ?? undefined),
        premiumOnly: pick('premiumOnly', was?.premium_only),
        displayOrder: pick('displayOrder', was?.display_order),
      });
      return;
    }
    await this.events.upsert({
      key: p.key as string,
      name: p.name as string,
      type: (p.type as string) ?? 'seasonal',
      startsAt: p.startsAt as string,
      endsAt: p.endsAt as string,
      priority: p.priority as number | undefined,
      theme: p.theme as string | null | undefined,
      quests: p.quests as unknown[] | undefined,
      rewards: p.rewards as Record<string, unknown> | undefined,
      enabled: p.enabled as boolean | undefined,
    });
  }

  private async record(target: ConfigTarget, payload: Record<string, unknown>, sensitive: boolean, status: ChangeStatus, proposerId: string, reviewerId: string | null): Promise<string> {
    const res = await this.pool.query<{ id: string }>(
      `INSERT INTO admin_config_changes (target, payload, sensitive, status, proposer_id, reviewer_id, decided_at)
       VALUES ($1,$2::jsonb,$3,$4,$5,$6, CASE WHEN $4 = 'applied' THEN now() ELSE NULL END) RETURNING id`,
      [target, JSON.stringify(payload), sensitive, status, proposerId, reviewerId],
    );
    return res.rows[0]!.id;
  }
}
