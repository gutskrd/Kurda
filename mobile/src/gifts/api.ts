import type {
  ChatMessageExtras,
  EquippableCategory,
  GiftCard,
  GiftCatalogItem,
  GiftChatRef,
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
  /** null for a gift or a game card */
  body: string | null;
  createdAt: string;
  readAt?: string | null;
  /** a group message deleted by its author or a group moderator */
  deleted?: boolean;
}

export interface GiftCatalog {
  items: GiftCatalogItem[];
  balance: { zer: number; gems: number };
}

/** What can be given to these friends, who owns what already, and the sender's balance. */
export function giftCatalog(client: ApiClient, toUserIds: readonly string[]): Promise<ApiResult<GiftCatalog>> {
  return client.get<GiftCatalog>(`/gifts/catalog?to=${toUserIds.map(encodeURIComponent).join(',')}`);
}

export interface SentGift extends SendGiftResult {
  /** the gift message as the sender sees it, when this send posted one */
  message: ChatMessage | null;
}

/**
 * Send one item to one or more friends in a chat. `idempotencyKey` is made
 * once per choice (see `newGiftKey`), so a retry after a dropped connection
 * replays the same send instead of paying twice.
 */
export function sendGift(
  client: ApiClient,
  input: { sku: string; toUserIds: readonly string[]; chat: GiftChatRef; idempotencyKey: string; expectedPrice: number },
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

/** One gift card as this viewer sees it — after "opened" changed somewhere else. */
export function giftBatchCard(client: ApiClient, batchId: string): Promise<ApiResult<{ card: GiftCard }>> {
  return client.get<{ card: GiftCard }>(`/gifts/batches/${encodeURIComponent(batchId)}`);
}

/** Put on what you were given (the cosmetics routes). */
export function wearGift(client: ApiClient, category: EquippableCategory, sku: string): Promise<ApiResult<unknown>> {
  return client.put(`/me/cosmetics/${category}`, { sku });
}

/** A message list with one gift card replaced, wherever its batch appears. */
export function withCard<T extends ChatMessage>(messages: T[], card: GiftCard): T[] {
  return messages.map((m) => (m.kind === 'gift' && m.gift?.batchId === card.batchId ? { ...m, gift: card } : m));
}
