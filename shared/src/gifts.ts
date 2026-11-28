/**
 * Gifts: one of the gifts (gift-catalogue.ts) or a shop item sent to friends, arriving as a wrapped present in the chat
 * and unwrapped with an animation, or given onto a post, which shows them in a small row. Gifts are items, never
 * currency, and cannot be sold, converted or passed on; no "send one back" nudge to anyone but a known adult (never to
 * someone under 18 or of unknown age, for whom a gift must not become a debt), no gift leaderboards, no asking for
 * gifts; caps per day, narrow wherever someone under 18 is involved; and between anyone not a known adult, only once a
 * friendship is a day old. Shared so the API
 * and both apps agree on tiers, timings and shapes.
 */
import type { BagEntry } from './gift-catalogue.js';
import type { GiftSendLimits } from './gift-safety.js';

/** How big the unwrapping moment is; a grand gift takes the whole screen and stays on show where it was given. */
export const GIFT_TIERS = ['common', 'rare', 'legendary', 'grand'] as const;
export type GiftTier = (typeof GIFT_TIERS)[number];

/** A gift of this many Zêr or more (€200: the moon, the sun, the galaxy) is grand. */
export const GRAND_GIFT_PRICE = 20_000;

export interface GiftTierInput {
  price: number;
  /** a limited-time item, sold in its season (the Newroz fire, in March) or until an end date */
  limited: boolean;
}

/**
 * Gifts of `GRAND_GIFT_PRICE` or more are grand, limited items legendary, items of 750 Zêr or more rare, the rest
 * common. The API decides; clients only animate it.
 */
export function giftTierFor(item: GiftTierInput): GiftTier {
  if (item.price >= GRAND_GIFT_PRICE) return 'grand';
  if (item.limited) return 'legendary';
  if (item.price >= 750) return 'rare';
  return 'common';
}

/** The shop category of the gifts (gift-catalogue.ts), sold only to give. */
export const GIFT_CATEGORY = 'gift';

/**
 * The category of the gift stickers the gifts replaced: the app icons' pictures, retired from sale and kept for whoever
 * holds or gave one.
 */
export const GIFT_STICKER_CATEGORY = 'sticker';

/** Whether a shop category is given rather than bought for oneself or worn: a gift, or a retired gift sticker. */
export function isGiftOnly(category: string): boolean {
  return category === GIFT_CATEGORY || category === GIFT_STICKER_CATEGORY;
}

/**
 * How long each tier's unwrap plays: a burst in the bubble, a sheet with confetti, a full-screen moment. A tap skips any of
 * them, and under reduced motion each is a short fade.
 */
export const GIFT_UNWRAP_MS: Readonly<Record<GiftTier, number>> = {
  common: 700,
  rare: 1400,
  legendary: 2500,
  grand: 3200,
};

/** The fade that replaces every animation under reduced motion. */
export const GIFT_REDUCED_MOTION_MS = 200;

/** Friends one gift may go to at once, as a group gift. */
export const MAX_GIFT_RECIPIENTS = 7;

/**
 * The most of one gift a single send may give each recipient ("5 × Çay"): the widest day's cap to one friend, so the
 * caps, not this, are what usually stop a send.
 */
export const MAX_GIFT_QUANTITY = 20;

/**
 * A rolling day's caps on gifts, every gift counted (a send of 3 to two friends is 6): what one person may send in all
 * (`sent`) and to any one friend (`perFriend`), and what one person may be given by everyone together (`received`), so
 * throwaway accounts cannot pour gifts into one account.
 */
export interface GiftDayCaps {
  sent: number;
  perFriend: number;
  received: number;
}

/**
 * The caps by who is involved. Between two known adults they are wide: a gift is an item that cannot be sold or passed
 * on, and a glass of tea a day is not abuse. Wherever someone under 18 or of unknown age sends or receives, they stay
 * narrow, so a gift never becomes a stream to or from a child.
 */
export const GIFT_DAY_CAPS: Readonly<Record<'adult' | 'young', GiftDayCaps>> = {
  adult: { sent: 50, perFriend: 20, received: 50 },
  young: { sent: 10, perFriend: 3, received: 10 },
};

/** A sender's cap on all their gifts in a day, by whether they are a known adult. */
export function giftsSentCap(senderAdult: boolean): number {
  return GIFT_DAY_CAPS[senderAdult ? 'adult' : 'young'].sent;
}

/** A sender's cap on gifts to one friend in a day: wide only when both are known adults. */
export function giftsPerFriendCap(senderAdult: boolean, recipientAdult: boolean): number {
  return GIFT_DAY_CAPS[senderAdult && recipientAdult ? 'adult' : 'young'].perFriend;
}

/** What one person may be given in a day by everyone together, by whether they are a known adult. */
export function giftsReceivedCap(recipientAdult: boolean): number {
  return GIFT_DAY_CAPS[recipientAdult ? 'adult' : 'young'].received;
}

/**
 * How many more gifts the sender may give one recipient now, by the day's caps, and when the next one frees up if
 * none: the moment the oldest gift holding a cap turns a day old.
 */
export interface GiftDayLeft {
  userId: string;
  left: number;
  /** ISO time the next gift may go, set only when `left` is 0 */
  moreAt: string | null;
}

/** How few gifts left for one friend today is worth saying before they run out. */
export const GIFT_DAY_FEW = 3;

/**
 * What the gift sheet says about the day's caps before anything is sent, if anything: for one recipient, how many are
 * left when few are (`few`), or that none are and from when there will be (`none`, no time when it is others' gifts
 * that filled their day); for several, who can be given nothing more now (`someFull`).
 */
export type GiftDayLine =
  | { kind: 'few'; userId: string; left: number }
  | { kind: 'none'; userId: string; moreAt: string | null }
  | { kind: 'someFull'; userIds: string[] };

export function giftDayLine(days: readonly GiftDayLeft[]): GiftDayLine | null {
  if (days.length === 1) {
    const day = days[0]!;
    if (day.left === 0) return { kind: 'none', userId: day.userId, moreAt: day.moreAt };
    return day.left <= GIFT_DAY_FEW ? { kind: 'few', userId: day.userId, left: day.left } : null;
  }
  const full = days.filter((d) => d.left === 0).map((d) => d.userId);
  return full.length > 0 ? { kind: 'someFull', userIds: full } : null;
}

/** Whether a send to these recipients can go at all by the day's caps: not when every one of them is full for now. */
export function giftDayFull(days: readonly GiftDayLeft[], to: readonly string[]): boolean {
  return to.length > 0 && to.every((id) => days.find((d) => d.userId === id)?.left === 0);
}

/** Between two people not both known adults, a friendship must be this old before a gift passes, which blocks "add, gift, groom". */
export const GIFT_MIN_FRIENDSHIP_HOURS = 24;

/** Shop categories a recipient can put on straight from the unwrap. */
export const EQUIPPABLE_GIFT_CATEGORIES = ['background', 'icon'] as const;
export type EquippableCategory = (typeof EQUIPPABLE_GIFT_CATEGORIES)[number];

/**
 * Who sent a gift, as one viewer may see them. Null when they may not: the sender is blocked either way, their account
 * is closed, or they are not someone this viewer may see in a list of people. The apps then say "a Hevalo member".
 */
export interface GiftSender {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

/** The name to say for a gift's sender, or null for "a Hevalo member". */
export function giftSenderName(sender: GiftSender | null | undefined): string | null {
  if (!sender) return null;
  return sender.displayName?.trim() || sender.username || null;
}

/** One recipient of a gift, as a viewer of the chat sees them. */
export interface GiftRecipient {
  /** null when this viewer may not see their name ("a group member") */
  name: string | null;
  avatarUrl: string | null;
  isMe: boolean;
  opened: boolean;
  /** they said thanks with one tap; absent from an API older than thanks */
  thanked?: boolean;
}

/** A gift as it appears in a chat message (kind 'gift'). The price is never on it: a present, not a receipt. */
export interface GiftCard {
  batchId: string;
  sku: string;
  name: string;
  category: string;
  assetUrl: string | null;
  tier: GiftTier;
  recipients: GiftRecipient[];
  /** who sent it, as this viewer may see them (`GiftSender`) */
  from: GiftSender | null;
  /** set when this viewer is one of the recipients */
  myGiftId: string | null;
  myOpened: boolean;
  /** the viewer already said thanks for it, so the apps offer no second thanks */
  myThanked?: boolean;
  /** what the viewer can put on after unwrapping, if anything */
  equippable: EquippableCategory | null;
  /** how many of it each recipient was given; absent from an API older than several at once, which means one */
  quantity?: number;
}

/** How many of a gift a card holds, one for a card from before several could be sent at once. */
export function giftQuantity(card: Pick<GiftCard, 'quantity'>): number {
  return card.quantity && card.quantity > 1 ? card.quantity : 1;
}

/** An item in the gift picker (GET /gifts/catalog?to=… or ?post=…). Prices are in Zêr. */
export interface GiftCatalogItem {
  sku: string;
  name: string;
  category: string;
  assetUrl: string | null;
  price: number;
  tier: GiftTier;
  /** recipients, by user id, who already own this unique item */
  alreadyOwnedBy: string[];
  /** a free gift from a members' box can pay for it (`FREE_GIFT_MAX_PRICE`) */
  freeGiftEligible: boolean;
}

/** Why a gift on the shelf cannot be chosen for this send, beyond what the sender's Zêr covers. */
export type GiftLock = 'over_limit' | 'spend_limit';

/**
 * Why a gift to this one person or post cannot go yet, said in one calm line before anything is picked: a friendship
 * younger than a day where both are not known adults (`new_friend`), or someone who is not a friend at all where both
 * are not known adults (`friends_only`).
 */
export type GiftHold = 'new_friend' | 'friends_only';

/**
 * The picker's answer: the gifts on offer (gift-catalogue.ts, only those drawn), the gift bag, the sender's Zêr and the
 * free gifts left from their members' boxes, and what this send may cost (`GiftSendLimits`). `nudges` is false for anyone
 * under 18 or of unknown age, who is never shown a suggestion to buy.
 */
export interface GiftCatalog {
  items: GiftCatalogItem[];
  bag: BagEntry[];
  balance: { zer: number };
  freeGifts: number;
  /** for one recipient or a post, why a gift cannot go yet; null when it can */
  hold: GiftHold | null;
  limits: GiftSendLimits;
  /** for each recipient, in the order asked, how many more gifts may reach them from this sender now */
  dayLeft: GiftDayLeft[];
  nudges: boolean;
}

/** Whether a shelf item is out of reach for this send by the safeguards (gift-safety.ts), and why. */
export function giftLockFor(item: Pick<GiftCatalogItem, 'price'>, recipients: number, limits: GiftSendLimits | null | undefined): GiftLock | null {
  if (!limits) return null;
  if (limits.maxPrice != null && item.price > limits.maxPrice) return 'over_limit';
  if (limits.left != null && item.price * Math.max(1, recipients) > limits.left) return 'spend_limit';
  return null;
}

/**
 * The most of one gift the sheet lets a send hold for each recipient: no more than the day's caps leave for any of them,
 * than what pays for it covers (`units`: how many the sender's Zêr, bag or free gifts pay for in all, null when not
 * known), than the spending limit leaves, or than `MAX_GIFT_QUANTITY`. Never under 1: a gift that cannot go at all is
 * held back by its own lines, not by its count.
 */
export function giftQuantityMax(input: {
  price: number;
  recipients: number;
  /** what the day's caps leave for each recipient (`GiftDayLeft.left`) */
  dayLeft: readonly number[];
  units: number | null;
  limits?: Pick<GiftSendLimits, 'left'> | null;
}): number {
  const people = Math.max(1, input.recipients);
  let most = MAX_GIFT_QUANTITY;
  for (const left of input.dayLeft) most = Math.min(most, left);
  if (input.units != null) most = Math.min(most, Math.floor(input.units / people));
  if (input.limits?.left != null && input.price > 0) most = Math.min(most, Math.floor(input.limits.left / (input.price * people)));
  return Math.max(1, most);
}

/** Whether a send of `total` Zêr asks a second time, with the money amount, before it goes. */
export function needsBigGiftConfirm(total: number, limits: Pick<GiftSendLimits, 'confirmFrom'> | null | undefined): boolean {
  return limits != null && total >= limits.confirmFrom;
}

/** POST /gifts: one item to one or more friends, or onto a post. */
export interface SendGiftResult {
  batchId: string;
  /** recipients who received it */
  sent: string[];
  /** recipients skipped, with why; only ever your friends, so safe to say */
  skipped: Array<{ userId: string; reason: 'already_owned' | 'not_allowed' | 'daily_limit' }>;
  balance: { zer: number };
  /** free gifts left after this send */
  freeGifts: number;
  /** the gift bag after this send, so a sheet sent from it can show what is left */
  bag?: BagEntry[];
}

/**
 * A post's gifts as the wall shows them, for one reader: how many, each item given with its own count (most given
 * first), how many people gave, and the latest giver this reader may see, for "Gifts from Hamo and 3 others".
 */
export interface PostGifts {
  count: number;
  /** a grand gift's tier is 'grand', and the post shows it large (`GRAND_GIFT_PRICE`) */
  items: Array<{ sku: string; name: string; assetUrl: string | null; count: number; tier?: GiftTier }>;
  senders: number;
  from: GiftSender | null;
}

/** The line under a post's gifts: who gave, as the reader may see them, and how many others did. */
export function postGiftsLine(gifts: Pick<PostGifts, 'count' | 'senders' | 'from'>): { name: string | null; others: number; many: boolean } {
  return { name: giftSenderName(gifts.from), others: Math.max(0, gifts.senders - 1), many: gifts.count > 1 };
}

/** One gift onto a post, as its senders list shows it (GET /gifts/posts/:type/:id); who sent it as the reader may see them. */
export interface PostGiftSender {
  from: GiftSender | null;
  sku: string;
  itemName: string;
  assetUrl: string | null;
  at: string;
}

/** Events on a user's own realtime channel. */
export type GiftUserEvent =
  | { type: 'gift_received'; giftId: string; batchId: string; from: { name: string; avatarUrl: string | null }; card: GiftCard; chat: GiftChatRef }
  | { type: 'gift_opened'; batchId: string; giftId: string };

/** Which chat a gift message is in, so a client can open it there. */
export type GiftChatRef = { kind: 'dm'; userId: string } | { kind: 'group'; groupId: string };
