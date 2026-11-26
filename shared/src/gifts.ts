/**
 * Gifts: one of the gifts (gift-catalogue.ts) or a shop item sent to friends, arriving as a wrapped present in the chat
 * and unwrapped with an animation, or given onto a post, which shows them in a small row. Gifts are items, never
 * currency, and cannot be sold, converted or passed on; no "send one back" nudge to anyone but a known adult (never to
 * someone under 18 or of unknown age, for whom a gift must not become a debt), no gift leaderboards, no asking for
 * gifts; a cap per day; and between anyone not a known adult, only once a friendship is a day old. Shared so the API
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

/** Gifts one person may send a day, counting each recipient, and to any one friend. */
export const GIFTS_PER_DAY = 10;
export const GIFTS_PER_FRIEND_PER_DAY = 3;

/**
 * Gifts one person may receive a day from everyone together. The sender caps alone would let ten throwaway accounts feed
 * one main account thirty gifts a day, which is the pattern a present must not become.
 */
export const GIFTS_RECEIVED_PER_DAY = 10;

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
  /** what the viewer can put on after unwrapping, if anything */
  equippable: EquippableCategory | null;
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
  nudges: boolean;
}

/** Whether a shelf item is out of reach for this send by the safeguards (gift-safety.ts), and why. */
export function giftLockFor(item: Pick<GiftCatalogItem, 'price'>, recipients: number, limits: GiftSendLimits | null | undefined): GiftLock | null {
  if (!limits) return null;
  if (limits.maxPrice != null && item.price > limits.maxPrice) return 'over_limit';
  if (limits.left != null && item.price * Math.max(1, recipients) > limits.left) return 'spend_limit';
  return null;
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
