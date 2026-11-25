/**
 * Gifts: a shop item or a gift sticker sent to friends, arriving as a wrapped present in the chat and unwrapped with an
 * animation, or given onto a post, which shows them in a small row. Gifts are items, never currency, and cannot be sold,
 * converted or passed on; no "send one back" nudges, leaderboards or asking; a daily cap; and between anyone not a known
 * adult, only once a friendship is a day old. Shared so the API and both apps agree on tiers, timings and shapes.
 */

/** How big the unwrapping moment is. */
export const GIFT_TIERS = ['common', 'rare', 'legendary'] as const;
export type GiftTier = (typeof GIFT_TIERS)[number];

export interface GiftTierInput {
  price: number;
  /** a limited-time item with an end date, such as for Newroz */
  limited: boolean;
}

/** Limited items are legendary, items of 1,500 Zêr or more rare, the rest common. The API decides; clients only animate it. */
export function giftTierFor(item: GiftTierInput): GiftTier {
  if (item.limited) return 'legendary';
  if (item.price >= 1500) return 'rare';
  return 'common';
}

/** The shop category of gift stickers: the app's icon pictures as small gifts, sold only to give. */
export const GIFT_STICKER_CATEGORY = 'sticker';

/** The gift stickers, three at each size, smallest first; the art is the matching app icon's picture. */
export const GIFT_STICKERS: ReadonlyArray<{ sku: string; name: string; assetKey: string; price: number }> = [
  { sku: 'sticker-kevok', name: 'Kevok', assetKey: 'icons/made-10-kevok.png', price: 40 },
  { sku: 'sticker-lale', name: 'Lale', assetKey: 'icons/made-04-lale.png', price: 40 },
  { sku: 'sticker-piyan', name: 'Piyan', assetKey: 'icons/made-08-caydan.png', price: 40 },
  { sku: 'sticker-hinar', name: 'Hinar', assetKey: 'icons/made-01-hinar.png', price: 120 },
  { sku: 'sticker-roj', name: 'Roj', assetKey: 'icons/made-02-roj.png', price: 120 },
  { sku: 'sticker-saz', name: 'Saz', assetKey: 'icons/made-09-saz.png', price: 120 },
  { sku: 'sticker-ask', name: 'Ask', assetKey: 'icons/made-06-ask.png', price: 400 },
  { sku: 'sticker-pet', name: 'Pêta Newrozê', assetKey: 'icons/made-13-pet.png', price: 400 },
  { sku: 'sticker-heyv', name: 'Heyv', assetKey: 'icons/made-14-heyv.png', price: 400 },
];

/** Whether a shop category is a gift sticker, which is given rather than bought for oneself or worn. */
export function isGiftSticker(category: string): boolean {
  return category === GIFT_STICKER_CATEGORY;
}

/**
 * How long each tier's unwrap plays: a burst in the bubble, a sheet with confetti, a full-screen moment. A tap skips any of
 * them, and under reduced motion each is a short fade.
 */
export const GIFT_UNWRAP_MS: Readonly<Record<GiftTier, number>> = {
  common: 700,
  rare: 1400,
  legendary: 2500,
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

/**
 * Why a gift to this one person or post cannot go yet, said in one calm line before anything is picked: a friendship
 * younger than a day where both are not known adults (`new_friend`), or someone who is not a friend at all where both
 * are not known adults (`friends_only`).
 */
export type GiftHold = 'new_friend' | 'friends_only';

/** The picker's answer: what can be given, the sender's Zêr, and the free gifts left from their members' boxes. */
export interface GiftCatalog {
  items: GiftCatalogItem[];
  balance: { zer: number };
  freeGifts: number;
  /** for one recipient or a post, why a gift cannot go yet; null when it can */
  hold: GiftHold | null;
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
}

/**
 * A post's gifts as the wall shows them, for one reader: how many, each item given with its own count (most given
 * first), how many people gave, and the latest giver this reader may see, for "Gifts from Hamo and 3 others".
 */
export interface PostGifts {
  count: number;
  items: Array<{ sku: string; name: string; assetUrl: string | null; count: number }>;
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
