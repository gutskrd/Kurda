/**
 * The safeguards on spending Zêr on gifts, which the server enforces and both apps mirror: what someone under 18 may
 * give and spend, what an adult may give someone under 18, the second confirmation with the money amount for a big
 * gift, and the spending limit an adult may set themself, which may be lowered at once but only raised a day later.
 */

/** Someone under 18 gives gifts of at most this many Zêr each (€5)... */
export const MINOR_GIFT_MAX_PRICE = 500;
/** ...and spends at most this many Zêr on gifts in a calendar month (€20), counted from the 1st at midnight UTC. */
export const MINOR_GIFT_MONTHLY_ZER = 2_000;
/** A gift to someone under 18 is at most this many Zêr, from anyone, and only from a friend. */
export const TO_MINOR_GIFT_MAX_PRICE = 500;

/** A send of this many Zêr or more, all its recipients together, asks a second time with the money amount shown. */
export const BIG_GIFT_CONFIRM_ZER = 2_000;
/** How long a second confirmation stays good for, so an old one cannot be kept and used later. */
export const BIG_GIFT_CONFIRM_TTL_MS = 10 * 60_000;

/** The windows an adult's own spending limit can cover, each counted back from now. */
export const SPEND_LIMIT_PERIODS = ['day', 'week', 'month'] as const;
export type SpendLimitPeriod = (typeof SPEND_LIMIT_PERIODS)[number];
export const SPEND_LIMIT_PERIOD_DAYS: Readonly<Record<SpendLimitPeriod, number>> = { day: 1, week: 7, month: 30 };

/** The smallest and largest limit one can set, in Zêr (€1 to €10,000). */
export const SPEND_LIMIT_MIN_ZER = 100;
export const SPEND_LIMIT_MAX_ZER = 1_000_000;

/** A raised or removed limit waits this long, so a moment's impulse cannot lift a limit set in a calmer one. */
export const SPEND_LIMIT_RAISE_DELAY_HOURS = 24;

export interface SpendLimit {
  period: SpendLimitPeriod;
  zer: number;
}

/**
 * Whether changing a limit from `current` to `next` (null for none) is a lowering that applies at once, allowing no more
 * in any window than before: any limit where there was none; the same or a longer window with the same or a smaller
 * amount; or a shorter window whose amount, over as many of its windows as cover the old one, is still no more than the
 * old amount (100 a day against 1,000 a week: at most 700 a week). Anything else (more, or no limit at all) waits
 * `SPEND_LIMIT_RAISE_DELAY_HOURS`.
 */
export function limitAppliesAtOnce(current: SpendLimit | null, next: SpendLimit | null): boolean {
  if (!current) return true;
  if (!next) return false;
  const was = SPEND_LIMIT_PERIOD_DAYS[current.period];
  const will = SPEND_LIMIT_PERIOD_DAYS[next.period];
  if (will >= was) return next.zer <= current.zer;
  return next.zer * Math.ceil(was / will) <= current.zer;
}

/** Whether a limit is one that can be set. */
export function isValidSpendLimit(limit: SpendLimit): boolean {
  return (
    (SPEND_LIMIT_PERIODS as readonly string[]).includes(limit.period) &&
    Number.isInteger(limit.zer) &&
    limit.zer >= SPEND_LIMIT_MIN_ZER &&
    limit.zer <= SPEND_LIMIT_MAX_ZER
  );
}

/** GET /me/gift-limit: the limit in force, one waiting to take over, and what is spent and left in its window. */
export interface GiftSpendLimitView {
  limit: SpendLimit | null;
  /** a raise or a removal, and when it takes over */
  pending: { limit: SpendLimit | null; from: string } | null;
  /** Zêr spent on gifts in the limit's window, or in the last 30 days with no limit */
  spent: number;
  /** left in the window, or null with no limit */
  left: number | null;
  /** an account under 18 has the fixed limits instead and cannot set its own */
  minor: boolean;
}

/** PUT /me/gift-limit: what changed, and whether it waits. */
export interface GiftSpendLimitChange extends GiftSpendLimitView {
  /** the change applies only from `pending.from` */
  delayed: boolean;
}

/**
 * What one send may cost, as the gift sheet needs to know before anything is picked. `maxPrice` is the dearest gift that
 * can go to everyone chosen (someone under 18 on either side), `left` the Zêr the sender may still spend on gifts now
 * (their own limit, or the monthly limit under 18), and `confirmFrom` the total that asks a second time.
 */
export interface GiftSendLimits {
  maxPrice: number | null;
  left: number | null;
  confirmFrom: number;
}

/** Why a gift could not go for its price, as the server refuses it (409). */
export type GiftLimitRefusal =
  /** dearer than `maxPrice` for these recipients */
  | 'GIFT_OVER_LIMIT'
  /** more than is left to spend: the monthly limit under 18, or one's own limit */
  | 'GIFT_SPEND_LIMIT'
  /** a big send that needs the second confirmation first; its details carry the token and the amount */
  | 'GIFT_NEEDS_CONFIRM';

/** The details of a GIFT_NEEDS_CONFIRM refusal: what to show, and the token that sends it. */
export interface GiftConfirmDetails {
  confirmToken: string;
  /** Zêr, every recipient together */
  total: number;
  recipients: number;
  expiresAt: string;
}
