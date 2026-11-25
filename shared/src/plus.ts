/**
 * What a Hevalo+ member is given, as numbers the server pays by and the apps can say; membership itself is the server's
 * (an end date on the account). The streak benefits live with the streak rules: a free restore a month
 * (`PLUS_FREE_REPAIRS_PER_MONTH`, streak-repair.ts) and room for a second freeze (the server's streak logic).
 */

/**
 * Whether the apps may show Hevalo+ to people who are not members. Off until the phone stores can sell it, since a pitch
 * for something nobody can buy would only mislead; members still see what is theirs.
 */
export const PLUS_ON_SALE = false;

/**
 * What an earning source pays: its amount to a member, nothing to anyone else. Only members earn Zêr; anyone else keeps
 * what they have, spends it and can buy more, so nobody's balance is taken away.
 */
export function memberPay(amount: number, plus: boolean): number {
  return plus ? amount : 0;
}

/** How the apps offer Hevalo+: by the year, by the month, or for a family by the year. */
export type PlusPlanId = 'yearly' | 'monthly' | 'family';

export interface PlusPlan {
  id: PlusPlanId;
  /** The phone stores' product id. */
  storeId: string;
  /** What each renewal costs, in euro cents: the price the stores list until they give the phone a local one. */
  priceCents: number;
  period: 'month' | 'year';
  /** A cheaper first period, in euro cents, where the store offers one. */
  introCents?: number;
  /** How many people one plan makes members: the buyer alone, or a family's owner and up to five more. */
  people: number;
}

/** The plans in the order the page shows them, the yearly first (docs/money/hevalo-plus.md). */
export const PLUS_PLANS: readonly PlusPlan[] = [
  { id: 'yearly', storeId: 'app.hevalo.plus.yearly', priceCents: 2999, period: 'year', people: 1 },
  { id: 'monthly', storeId: 'app.hevalo.plus.monthly', priceCents: 399, period: 'month', introCents: 99, people: 1 },
  { id: 'family', storeId: 'app.hevalo.family.yearly', priceCents: 5999, period: 'year', people: 6 },
];

/** A plan's price spread over its months, in cents rounded to the cent, for the smaller line under a yearly price. */
export function planMonthlyCents(plan: PlusPlan): number {
  return plan.period === 'month' ? plan.priceCents : Math.round(plan.priceCents / 12);
}

/** How much a yearly plan saves against paying the monthly price for twelve months, as a whole percent rounded down. */
export function planSavingPercent(plan: PlusPlan, monthly: PlusPlan): number {
  if (plan.period !== 'year' || monthly.period !== 'month') return 0;
  return Math.max(0, Math.floor((1 - plan.priceCents / (monthly.priceCents * 12)) * 100));
}

/** A price in euros for a locale ("€29.99", "29,99 €"); a locale the runtime does not know is written as English is. */
export function formatEuros(cents: number, locale: string): string {
  const options = { style: 'currency', currency: 'EUR' } as const;
  try {
    return new Intl.NumberFormat(locale, options).format(cents / 100);
  } catch {
    return new Intl.NumberFormat('en', options).format(cents / 100);
  }
}

/** The members' box, once each month a member is a member: Zêr, free gifts, and that month's members-only item. */
export const MEMBERS_BOX_ZER = 250;
export const MEMBERS_BOX_FREE_GIFTS = 3;

/** A free gift from the box pays for one gift priced up to this: the gifts from a glass of tea to the kitten. */
export const FREE_GIFT_MAX_PRICE = 150;

/**
 * Each calendar month's members-only icon or background, January first, chosen from the items only members wear and
 * matched to the season: snow in winter, Newroz's fire in March, wheat at harvest.
 */
export const MEMBERS_BOX_ITEMS: readonly string[] = [
  'bg-made-berfa-ciyayan',
  'icon-made-kevok',
  'bg-made-agire-newroze',
  'icon-made-lale',
  'bg-made-bihar',
  'icon-made-roj',
  'bg-made-ezmane-sterkan',
  'icon-made-genim',
  'bg-made-evara-zerin',
  'icon-made-hinar',
  'bg-made-daristana-seve',
  'icon-made-heyv',
];

/** The box month a day falls in, 'YYYY-MM', from a 'YYYY-MM-DD' day or an instant (UTC). */
export function membersBoxMonth(day: string | Date): string {
  return (typeof day === 'string' ? day : day.toISOString()).slice(0, 7);
}

/** The members-only item in a month's box ('YYYY-MM'). */
export function membersBoxItem(month: string): string {
  const index = Number(month.slice(5, 7)) - 1;
  return MEMBERS_BOX_ITEMS[Math.min(11, Math.max(0, Number.isFinite(index) ? index : 0))]!;
}

/** A month's box as the apps show it (GET /me/members-box). */
export interface MembersBox {
  /** 'YYYY-MM' */
  month: string;
  zer: number;
  freeGifts: number;
  /** the month's item, or null when the member owned it already */
  item: { sku: string; name: string; category: string; assetUrl: string | null } | null;
  grantedAt: string;
  /** the member has seen it opened */
  seen: boolean;
}

/** GET /me/members-box: this month's box for a member (null for anyone else), and the free gifts left from every box. */
export interface MembersBoxView {
  box: MembersBox | null;
  freeGifts: number;
}
