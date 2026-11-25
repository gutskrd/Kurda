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

/** The members' box, once each month a member is a member: Zêr, free gifts, and that month's members-only item. */
export const MEMBERS_BOX_ZER = 250;
export const MEMBERS_BOX_FREE_GIFTS = 3;

/** A free gift from the box pays for one gift priced up to this, every gift sticker included. */
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
