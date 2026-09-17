import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';

/** A cosmetic somebody sent you. */
export interface ReceivedGift {
  id: string;
  sku: string;
  name: string;
  category: string;
  assetUrl: string | null;
  /** null when they have since left — the item is still yours */
  from: { id: string; username: string } | null;
  seenAt: string | null;
  createdAt: string;
}

/**
 * Buy an item for somebody else.
 *
 * `expectedPrice` is the price the screen was showing when it was tapped. The
 * server compares it to the real one and refuses on a mismatch rather than
 * quietly charging the difference, so a price that changed while the sheet was
 * open is an error instead of a surprise.
 *
 * `idempotencyKey` is what stops a double tap, or a retry after a dropped
 * connection, from sending — and charging for — two gifts.
 */
export function giftItem(
  client: ApiClient,
  input: { sku: string; toUserId: string; expectedPrice: number; idempotencyKey: string },
): Promise<ApiResult<{ balance: number }>> {
  return client.post<{ balance: number }>('/shop/gift', input);
}

export function receivedGifts(client: ApiClient): Promise<ApiResult<{ gifts: ReceivedGift[]; unseen: number }>> {
  return client.get<{ gifts: ReceivedGift[]; unseen: number }>('/me/gifts');
}

/** Clears the badge. Sent once the list has actually been on screen. */
export function markGiftsSeen(client: ApiClient): Promise<ApiResult<{ seen: number }>> {
  return client.post<{ seen: number }>('/me/gifts/seen');
}
