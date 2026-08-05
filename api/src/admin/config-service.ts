import type pg from 'pg';
import type { ShopService } from '../shop/service.js';
import type { EventService } from '../events/service.js';

export type ConfigTarget = 'shop_item' | 'event';
export type ChangeStatus = 'pending' | 'applied' | 'rejected';

/** Price at/above which a shop change needs a second admin's sign-off. */
export const SENSITIVE_PRICE = 1000;

export interface ProposeResult {
  status: 'applied' | 'pending';
  id: string;
}
export type ProposeError = { ok: false; reason: 'invalid-target' | 'past-schedule' | 'bad-window' | 'bad-price' | 'invalid-payload' };
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

/**
 * Shop + event configuration with dual-admin approval (KUR-103). An admin
 * proposes an upsert; a **non-sensitive** change applies immediately, a
 * **sensitive** one (large price / currency-granting event) is queued for a
 * different admin to approve. Applying delegates to the existing Shop/Event
 * services (which validate + bust their caches). Past-dated events are rejected.
 */
export class ConfigService {
  private readonly pool: pg.Pool;
  private readonly shop: ShopService;
  private readonly events: EventService;
  private readonly now: () => Date;

  constructor(pool: pg.Pool, deps: { shop: ShopService; events: EventService; now?: () => Date }) {
    this.pool = pool;
    this.shop = deps.shop;
    this.events = deps.events;
    this.now = deps.now ?? (() => new Date());
  }

  /** Propose an upsert. Applies now if low-impact, else queues for approval. */
  async propose(proposerId: string, target: ConfigTarget, payload: Record<string, unknown>): Promise<ProposeOutcome> {
    if (target !== 'shop_item' && target !== 'event') return { ok: false, reason: 'invalid-target' };
    const invalid = this.validate(target, payload);
    if (invalid) return { ok: false, reason: invalid };

    const sensitive = this.isSensitive(target, payload);
    if (!sensitive) {
      await this.apply(target, payload);
      const row = await this.record(target, payload, false, 'applied', proposerId, proposerId);
      return { ok: true, status: 'applied', id: row };
    }
    const id = await this.record(target, payload, true, 'pending', proposerId, null);
    return { ok: true, status: 'pending', id };
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

      await this.apply(c.target, c.payload);
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
    const res = await this.pool.query(
      `UPDATE admin_config_changes SET status = 'rejected', reviewer_id = $2, reason = $3, decided_at = now()
       WHERE id = $1 AND status = 'pending'`,
      [id, reviewerId, reason ?? null],
    );
    return (res.rowCount ?? 0) > 0 ? { ok: true, status: 'rejected' } : { ok: false, reason: 'not-found' };
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
    if (target === 'shop_item') return typeof p.price === 'number' && p.price >= SENSITIVE_PRICE;
    // events that grant currency/rewards are sensitive
    const rewards = p.rewards as Record<string, unknown> | undefined;
    return !!rewards && Object.keys(rewards).length > 0;
  }

  private async apply(target: ConfigTarget, p: Record<string, unknown>): Promise<void> {
    if (target === 'shop_item') {
      await this.shop.createItem({
        sku: p.sku as string,
        name: p.name as string,
        description: p.description as string | undefined,
        category: p.category as string | undefined,
        currency: p.currency as 'zer' | 'gems',
        price: p.price as number,
        isUnique: p.isUnique as boolean | undefined,
        active: p.active as boolean | undefined,
        inStock: p.inStock as boolean | undefined,
        availableFrom: p.availableFrom ? new Date(p.availableFrom as string) : null,
        availableTo: p.availableTo ? new Date(p.availableTo as string) : null,
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
