/**
 * The safeguards on Zêr spent on gifts (shared gift-safety.ts), as the server holds them: who counts as under 18 (a
 * minor, or anyone whose age is not known), what has been spent and what is left, an adult's own limit with its day's
 * wait on a raise, and the second confirmation of a big gift, a signed token bound to that one send so no client can
 * skip it or reuse it for another.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type pg from 'pg';
import {
  BIG_GIFT_CONFIRM_TTL_MS,
  BIG_GIFT_CONFIRM_ZER,
  MINOR_GIFT_MAX_PRICE,
  MINOR_GIFT_MONTHLY_ZER,
  SPEND_LIMIT_PERIOD_DAYS,
  SPEND_LIMIT_RAISE_DELAY_HOURS,
  TO_MINOR_GIFT_MAX_PRICE,
  limitAppliesAtOnce,
  type GiftSendLimits,
  type GiftSpendLimitChange,
  type GiftSpendLimitView,
  type SpendLimit,
  type SpendLimitPeriod,
} from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { notKnownAdultSql } from '../users/age.js';

type Executor = Pick<pg.Pool, 'query'>;

/** The start of this calendar month in UTC, as the monthly limit under 18 counts. */
const MONTH_START = `(date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')`;

/**
 * What gifts since `since` (SQL) count against a limit: the Zêr paid for them, and for the monthly limit under 18 the
 * gifts given from the bag too, at their price in the shop, since a bag can be filled with bought gifts (shop bundles).
 * A members' box's free gifts are never counted.
 */
async function spentSince(db: Executor, userId: string, since: string, opts: { bag?: boolean } = {}): Promise<number> {
  const res = await db.query<{ zer: string }>(
    `SELECT COALESCE(sum(price), 0)::text AS zer FROM gifts
      WHERE from_user_id = $1 AND paid_with = ANY($2::text[]) AND created_at >= ${since}`,
    [userId, opts.bag ? ['zer', 'bag'] : ['zer']],
  );
  return Number(res.rows[0]?.zer ?? 0);
}

const windowStart = (period: SpendLimitPeriod): string => `now() - make_interval(days => ${SPEND_LIMIT_PERIOD_DAYS[period]})`;

interface LimitRow {
  period: SpendLimitPeriod | null;
  zer: number | null;
  pending_period: SpendLimitPeriod | null;
  pending_zer: number | null;
  pending_from: Date | null;
}

/** A stored limit with a change whose day has passed already taken over. */
interface Effective {
  limit: SpendLimit | null;
  pending: { limit: SpendLimit | null; from: Date } | null;
}

function effective(row: LimitRow | undefined, now: Date): Effective {
  if (!row) return { limit: null, pending: null };
  const limit = row.period && row.zer ? { period: row.period, zer: row.zer } : null;
  if (!row.pending_from) return { limit, pending: null };
  const next = row.pending_period && row.pending_zer ? { period: row.pending_period, zer: row.pending_zer } : null;
  if (row.pending_from.getTime() <= now.getTime()) return { limit: next, pending: null };
  return { limit, pending: { limit: next, from: row.pending_from } };
}

async function readLimit(db: Executor, userId: string, now: Date, forUpdate: boolean): Promise<Effective> {
  const res = await db.query<LimitRow>(
    `SELECT period, zer, pending_period, pending_zer, pending_from FROM gift_spend_limits WHERE user_id = $1${forUpdate ? ' FOR UPDATE' : ''}`,
    [userId],
  );
  return effective(res.rows[0], now);
}

/** Whether each of these people counts as under 18 for gifts: a minor, or of unknown age. */
async function notAdults(db: Executor, ids: readonly string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const res = await db.query<{ id: string }>(`SELECT u.id FROM users u WHERE u.id = ANY($1::uuid[]) AND ${notKnownAdultSql('u')}`, [ids]);
  return new Set(res.rows.map((r) => r.id));
}

/** What a send from `fromId` to `toIds` may cost, read inside the send's transaction or for the gift sheet. */
export interface SendBounds extends GiftSendLimits {
  /** the sender counts as under 18 */
  minor: boolean;
  /** why `left` is what it is: the monthly limit under 18, or the sender's own */
  leftBy: 'minor_month' | 'own_limit' | null;
}

export async function sendBounds(db: Executor, fromId: string, toIds: readonly string[], now: Date = new Date()): Promise<SendBounds> {
  // compared with the database's own lower-case ids
  const from = fromId.toLowerCase();
  const to = toIds.map((id) => id.toLowerCase());
  const young = await notAdults(db, [from, ...to]);
  const minor = young.has(from);
  const toMinor = to.some((id) => young.has(id));
  const maxPrice = minor ? MINOR_GIFT_MAX_PRICE : toMinor ? TO_MINOR_GIFT_MAX_PRICE : null;
  if (minor) {
    const left = Math.max(0, MINOR_GIFT_MONTHLY_ZER - (await spentSince(db, fromId, MONTH_START, { bag: true })));
    return { maxPrice, left, confirmFrom: BIG_GIFT_CONFIRM_ZER, minor, leftBy: 'minor_month' };
  }
  const { limit } = await readLimit(db, fromId, now, false);
  if (!limit) return { maxPrice, left: null, confirmFrom: BIG_GIFT_CONFIRM_ZER, minor, leftBy: null };
  const left = Math.max(0, limit.zer - (await spentSince(db, fromId, windowStart(limit.period))));
  return { maxPrice, left, confirmFrom: BIG_GIFT_CONFIRM_ZER, minor, leftBy: 'own_limit' };
}

/**
 * Inside a send's transaction, after the sender's gift lock: refuses a gift dearer than these recipients may be given,
 * and more than is left to spend. `total` is what this send pays in Zêr (0 from a bag or a free gift); `fromBag` is
 * what the gifts it takes from the bag cost in the shop, which counts under 18 as Zêr does.
 */
export async function assertWithinBounds(
  client: pg.PoolClient,
  fromId: string,
  toIds: readonly string[],
  price: number,
  total: number,
  fromBag = 0,
): Promise<SendBounds> {
  // the limit row too, so a change to it waits for this send or this send for it
  await client.query(`SELECT 1 FROM gift_spend_limits WHERE user_id = $1 FOR UPDATE`, [fromId]);
  const bounds = await sendBounds(client, fromId, toIds);
  if (bounds.maxPrice != null && price > bounds.maxPrice) {
    throw new AppError('GIFT_OVER_LIMIT', 409, `a gift here can be at most ${bounds.maxPrice} Zêr`, { maxPrice: bounds.maxPrice });
  }
  const counted = total + (bounds.minor ? fromBag : 0);
  if (counted > 0 && bounds.left != null && counted > bounds.left) {
    throw new AppError('GIFT_SPEND_LIMIT', 409, 'that is more than is left to spend on gifts', { left: bounds.left, by: bounds.leftBy });
  }
  return bounds;
}

// ─────────────────────────────────────────────────────────── the second confirmation

/** What a confirmation is good for: this sender, this gift at this price, these recipients, this place, this request. */
export interface ConfirmSubject {
  fromId: string;
  sku: string;
  price: number;
  recipients: readonly string[];
  /** 'dm:<id>', 'group:<id>', 'post:<type>:<id>' or 'shop' */
  target: string;
  idempotencyKey: string;
}

function confirmBody(subject: ConfirmSubject, expiresMs: number): string {
  const to = [...subject.recipients].sort().join(',');
  return ['gift-confirm-v1', subject.fromId, subject.sku, subject.price, to, subject.target, subject.idempotencyKey, expiresMs].join('|');
}

function sign(secret: Buffer, body: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

/** A token for one confirmed send, good for `BIG_GIFT_CONFIRM_TTL_MS`. */
export function confirmToken(secret: Buffer, subject: ConfirmSubject, now: Date = new Date()): { token: string; expiresAt: Date } {
  const expiresMs = now.getTime() + BIG_GIFT_CONFIRM_TTL_MS;
  return { token: `${expiresMs}.${sign(secret, confirmBody(subject, expiresMs))}`, expiresAt: new Date(expiresMs) };
}

/** Whether a token confirms exactly this send and is still good; compared in constant time. */
export function confirmTokenValid(secret: Buffer, token: string | undefined, subject: ConfirmSubject, now: Date = new Date()): boolean {
  if (!token) return false;
  const match = /^(\d{10,16})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return false;
  const expiresMs = Number(match[1]);
  if (!(expiresMs > now.getTime()) || expiresMs > now.getTime() + BIG_GIFT_CONFIRM_TTL_MS) return false;
  const want = Buffer.from(sign(secret, confirmBody(subject, expiresMs)));
  const got = Buffer.from(match[2]!);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** The key a server's confirmations are signed with, kept apart from what the same secret signs elsewhere. */
export function confirmSecretFrom(serverSecret: string): Buffer {
  return createHmac('sha256', serverSecret).update('hevalo gift confirmations').digest();
}

// ─────────────────────────────────────────────────────────── an adult's own limit

function view(eff: Effective, spent: number, minor: boolean): GiftSpendLimitView {
  return {
    limit: eff.limit,
    pending: eff.pending ? { limit: eff.pending.limit, from: eff.pending.from.toISOString() } : null,
    spent,
    left: eff.limit ? Math.max(0, eff.limit.zer - spent) : null,
    minor,
  };
}

/** GET /me/gift-limit. */
export async function giftLimitView(db: Executor, userId: string, now: Date = new Date()): Promise<GiftSpendLimitView> {
  const minor = (await notAdults(db, [userId])).has(userId);
  const eff = minor ? { limit: null, pending: null } : await readLimit(db, userId, now, false);
  const spent = await spentSince(db, userId, minor ? MONTH_START : windowStart(eff.limit?.period ?? 'month'), { bag: minor });
  return view(eff, spent, minor);
}

/**
 * Sets, changes or removes an adult's own limit. A lowering applies at once and drops a raise that was waiting; a raise
 * or a removal waits `SPEND_LIMIT_RAISE_DELAY_HOURS` and says from when. Under 18 the fixed limits apply instead: 403.
 */
export async function setGiftLimit(pool: pg.Pool, userId: string, next: SpendLimit | null, now: Date = new Date()): Promise<GiftSpendLimitChange> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // the sender's gift lock, so a send and a change to its limit happen one after the other
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`gift-send:${userId}`]);
    if ((await notAdults(client, [userId])).has(userId)) {
      throw new AppError('MINOR_GIFT_LIMITS', 403, 'under 18 the gift limits are fixed');
    }
    const eff = await readLimit(client, userId, now, true);
    const atOnce = limitAppliesAtOnce(eff.limit, next);
    // asking again for the change already waiting keeps its time rather than starting the day over
    const waiting = eff.pending?.limit ?? null;
    const same = eff.pending !== null && waiting?.period === next?.period && waiting?.zer === next?.zer;
    const from = same ? eff.pending!.from : new Date(now.getTime() + SPEND_LIMIT_RAISE_DELAY_HOURS * 3_600_000);
    const [limit, pending] = atOnce ? [next, null] : [eff.limit, { limit: next, from }];
    await client.query(
      `INSERT INTO gift_spend_limits (user_id, period, zer, pending_period, pending_zer, pending_from, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (user_id) DO UPDATE SET period = EXCLUDED.period, zer = EXCLUDED.zer, pending_period = EXCLUDED.pending_period,
         pending_zer = EXCLUDED.pending_zer, pending_from = EXCLUDED.pending_from, updated_at = now()`,
      [userId, limit?.period ?? null, limit?.zer ?? null, pending?.limit?.period ?? null, pending?.limit?.zer ?? null, pending?.from ?? null],
    );
    const spent = await spentSince(client, userId, windowStart(limit?.period ?? 'month'));
    await client.query('COMMIT');
    return { ...view({ limit, pending }, spent, false), delayed: !atOnce };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
