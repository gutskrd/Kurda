import type {
  ChatMessageExtras,
  EquippableCategory,
  GiftCard,
  GiftCatalog,
  GiftBagView,
  GiftChatRef,
  GiftSpendLimitChange,
  GiftSpendLimitView,
  PostGifts,
  SpendLimit,
  PostGiftSender,
  SendGiftResult,
} from '@kurda/shared';
import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';
import { generateRequestId } from '../api/client';

/** A chat message as the gift and thread screens hold it: a DM's or a group's, with its kind. */
export interface ChatMessage extends ChatMessageExtras {
  id: string;
  senderId: string;
  username?: string;
  avatarUrl?: string | null;
  /** Null for a gift or a game card. */
  body: string | null;
  createdAt: string;
  /** A DM's receipts: when it reached their phone, and when they read it. */
  deliveredAt?: string | null;
  readAt?: string | null;
  /** A group message deleted by its author or a group moderator. */
  deleted?: boolean;
}

export type { GiftCatalog };

/** A post a gift is given onto, as the wall names it. */
export interface PostTarget {
  type: 'library' | 'image';
  id: string;
}

/** What can be given to these friends or onto this post, who owns what already, the sender's Zêr and free gifts. */
export function giftCatalog(client: ApiClient, to: readonly string[] | PostTarget): Promise<ApiResult<GiftCatalog>> {
  if (!Array.isArray(to)) {
    const post = to as PostTarget;
    return client.get<GiftCatalog>(`/gifts/catalog?post=${encodeURIComponent(`${post.type}:${post.id}`)}`);
  }
  return client.get<GiftCatalog>(`/gifts/catalog?to=${to.map(encodeURIComponent).join(',')}`);
}

/** The gift bag: what it holds, what landed since it was last looked at, and whether this account earns Zêr too. */
export function giftBag(client: ApiClient): Promise<ApiResult<GiftBagView>> {
  return client.get<GiftBagView>('/gifts/bag');
}

/** What landed in the bag has been told of. */
export function bagSeen(client: ApiClient): Promise<ApiResult<{ seen: number }>> {
  return client.post<{ seen: number }>('/gifts/bag/seen');
}

/** The account's own limit on Zêr spent on gifts. */
export function giftLimit(client: ApiClient): Promise<ApiResult<GiftSpendLimitView>> {
  return client.get<GiftSpendLimitView>('/me/gift-limit');
}

/** Sets, changes or removes it: lower at once, higher or none a day later (`delayed`). */
export function setGiftLimit(client: ApiClient, limit: SpendLimit | null): Promise<ApiResult<GiftSpendLimitChange>> {
  return client.put<GiftSpendLimitChange>('/me/gift-limit', { limit });
}

/** A post's gifts and who gave them, as this reader may see them. */
export function postGifts(client: ApiClient, post: PostTarget): Promise<ApiResult<{ gifts: PostGifts; senders: PostGiftSender[] }>> {
  return client.get(`/gifts/posts/${post.type}/${encodeURIComponent(post.id)}`);
}

export interface SentGift extends SendGiftResult {
  /** The gift message as the sender sees it, when this send posted one. */
  message: ChatMessage | null;
}

/**
 * Send one item to one or more friends in a chat, `quantity` of it to each (one when left out). `idempotencyKey` is made
 * once per choice and count (`newGiftKey`), so a retry after a dropped connection replays the send instead of paying
 * twice.
 */
export function sendGift(
  client: ApiClient,
  input: { sku: string; idempotencyKey: string; expectedPrice: number; quantity?: number; useFreeGift?: boolean; fromBag?: boolean; confirmToken?: string } & (
    | { toUserIds: readonly string[]; chat: GiftChatRef }
    | { post: PostTarget }
  ),
): Promise<ApiResult<SentGift>> {
  return client.post<SentGift>('/gifts', input);
}

/** A key for one gift choice; the API keys each recipient's gift on it. */
export function newGiftKey(): string {
  return `gift-${generateRequestId()}`;
}

/** Unwrap a gift you were given. Opening it again is fine. */
export function openGift(
  client: ApiClient,
  giftId: string,
): Promise<ApiResult<{ card: GiftCard; equippable: EquippableCategory | null }>> {
  return client.post<{ card: GiftCard; equippable: EquippableCategory | null }>(`/gifts/${encodeURIComponent(giftId)}/open`);
}

/** One gift card as this viewer sees it, after "opened" changed somewhere else. */
export function giftBatchCard(client: ApiClient, batchId: string): Promise<ApiResult<{ card: GiftCard }>> {
  return client.get<{ card: GiftCard }>(`/gifts/batches/${encodeURIComponent(batchId)}`);
}

/** Put on what you were given (the cosmetics routes). */
export function wearGift(client: ApiClient, category: EquippableCategory, sku: string): Promise<ApiResult<unknown>> {
  return client.put(`/me/cosmetics/${category}`, { sku });
}

/** Sends a one-tap thanks for a gift into a direct chat or a group; the server stores its own short text with it. */
export function sendThanks(client: ApiClient, where: { userId: string } | { groupId: string }, body: string, card: GiftCard): Promise<ApiResult<ChatMessage>> {
  const url = 'userId' in where ? `/chat/${where.userId}/messages` : `/groups/${where.groupId}/chat`;
  return client.post<ChatMessage>(url, { body, thanksFor: card.batchId });
}

/** A message list with one gift card replaced, wherever its batch appears. */
export function withCard<T extends ChatMessage>(messages: T[], card: GiftCard): T[] {
  return messages.map((m) => (m.kind === 'gift' && m.gift?.batchId === card.batchId ? { ...m, gift: card } : m));
}
