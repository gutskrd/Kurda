/**
 * Gifts: something from the shop, sent to a friend, that arrives as a wrapped
 * present in your chat together and is unwrapped with a moment of animation —
 * then shown on the profile, if it is something you wear.
 *
 * What this is careful about (see the research behind it): gifts are items,
 * never currency, and cannot be sold, converted or passed on; only between
 * friends; no "send one back" nudges, no gift leaderboards, no asking for
 * gifts; a cap per day; and between anyone who is not a known adult, only once
 * a friendship is a day old.
 *
 * Shared so the API, the browser and the phone agree on the tiers, the timings
 * and the shapes.
 */

/** How big the unwrapping moment is. */
export const GIFT_TIERS = ['common', 'rare', 'legendary'] as const;
export type GiftTier = (typeof GIFT_TIERS)[number];

export interface GiftTierInput {
  currency: 'zer' | 'gems';
  price: number;
  /** a limited-time item (it has an end date), e.g. for Newroz */
  limited: boolean;
}

/**
 * Limited items are legendary; items bought with gems, or with 1,500 Zêr or
 * more, are rare; everything else is common. The API computes it and sends it;
 * clients only animate it.
 */
export function giftTierFor(item: GiftTierInput): GiftTier {
  if (item.limited) return 'legendary';
  if (item.currency === 'gems' || item.price >= 1500) return 'rare';
  return 'common';
}

/**
 * How long each tier's unwrap plays: a burst in the bubble, a sheet with
 * confetti, a full-screen moment. Every one can be skipped with a tap, and with
 * reduced motion it is a short fade instead.
 */
export const GIFT_UNWRAP_MS: Readonly<Record<GiftTier, number>> = {
  common: 700,
  rare: 1400,
  legendary: 2500,
};

/** The fade that replaces every animation when the device asks for reduced motion. */
export const GIFT_REDUCED_MOTION_MS = 200;

/** Friends one gift may go to at once (a group gift). */
export const MAX_GIFT_RECIPIENTS = 7;

/** Gifts one person may send in a day (counting each recipient), and to any one friend. */
export const GIFTS_PER_DAY = 10;
export const GIFTS_PER_FRIEND_PER_DAY = 3;

/**
 * Between two people who are not both known adults, a friendship must be this
 * old before a gift can pass between them — the "add, gift, groom" pattern is
 * the one this blocks.
 */
export const GIFT_MIN_FRIENDSHIP_HOURS = 24;

/** Shop categories a recipient can put on straight from the unwrap. */
export const EQUIPPABLE_GIFT_CATEGORIES = ['background', 'icon'] as const;
export type EquippableCategory = (typeof EQUIPPABLE_GIFT_CATEGORIES)[number];

/** One recipient of a gift, as a viewer of the chat sees them. */
export interface GiftRecipient {
  /** null when this viewer may not see their name (then "a group member") */
  name: string | null;
  avatarUrl: string | null;
  isMe: boolean;
  opened: boolean;
}

/**
 * A gift as it appears in a chat message (kind 'gift'). The price is never on
 * it: the recipient is given a present, not a receipt.
 */
export interface GiftCard {
  batchId: string;
  sku: string;
  name: string;
  category: string;
  assetUrl: string | null;
  tier: GiftTier;
  recipients: GiftRecipient[];
  /** set when this viewer is one of the recipients */
  myGiftId: string | null;
  myOpened: boolean;
  /** what the viewer can put on after unwrapping, if anything */
  equippable: EquippableCategory | null;
}

/** An item in the gift picker (GET /gifts/catalog?to=…). */
export interface GiftCatalogItem {
  sku: string;
  name: string;
  category: string;
  assetUrl: string | null;
  currency: 'zer' | 'gems';
  price: number;
  tier: GiftTier;
  /** recipients (by user id, all your friends) who already own this unique item */
  alreadyOwnedBy: string[];
}

/** POST /gifts — send one item to one or more friends. */
export interface SendGiftResult {
  batchId: string;
  /** recipients who received it */
  sent: string[];
  /** recipients skipped, with why (only ever your friends, so this is safe to say) */
  skipped: Array<{ userId: string; reason: 'already_owned' | 'not_allowed' | 'daily_limit' }>;
  balance: { zer: number; gems: number };
}

/** Events on a user's own realtime channel. */
export type GiftUserEvent =
  | { type: 'gift_received'; giftId: string; batchId: string; from: { name: string; avatarUrl: string | null }; card: GiftCard; chat: GiftChatRef }
  | { type: 'gift_opened'; batchId: string; giftId: string };

/** Which chat a gift message is in, so a client can open it there. */
export type GiftChatRef = { kind: 'dm'; userId: string } | { kind: 'group'; groupId: string };
