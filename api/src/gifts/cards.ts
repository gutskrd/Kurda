import type pg from 'pg';
import {
  EQUIPPABLE_GIFT_CATEGORIES,
  giftTierFor,
  isLimitedItem,
  type EquippableCategory,
  type GiftCard,
  type GiftRecipient,
  type GiftSender,
} from '@kurda/shared';
import { cosmeticAssetUrl, resolveAvatarUrl, type PublicUrl } from '../cosmetics/access.js';
import { notBlockedSql } from '../friends/blocked.js';
import { areFriendsSql, notKnownAdultSql, shownToSql } from '../users/age.js';

/**
 * SQL: a gift's sender `s` (joined on the gift's `from_user_id`, so null when it was deleted) may be named to `viewer`:
 * the viewer themself, or an open account with no block either way that the viewer may see, which is everyone in a
 * shared group or direct message (`seesEveryone`), a friend, or a known adult who has not hidden their profile.
 */
export function giftSenderShownSql(s: string, viewer: string, seesEveryone = 'false'): string {
  return `(${s}.id IS NOT NULL AND (${s}.id = ${viewer} OR (${s}.deleted_at IS NULL AND ${notBlockedSql(`${s}.id`, viewer)}
            AND (${seesEveryone} OR ${areFriendsSql(`${s}.id`, viewer)}
                 OR (NOT ${notKnownAdultSql(s)} AND ${s}.profile_visibility <> 'nobody')))))`;
}

/** A sender row as the queries read it, and the shape the apps get. */
export interface SenderRow {
  sender_id: string | null;
  sender_username: string | null;
  sender_display_name: string | null;
  sender_photo: string | null;
  sender_avatar: string | null;
  sender_shown: boolean;
}

/** The sender columns of a query that joins the sender as `s`, for `toSender`. */
export const SENDER_COLUMNS = `s.id AS sender_id, s.username AS sender_username, s.display_name AS sender_display_name,
            s.profile_photo_key AS sender_photo, s.selected_avatar_key AS sender_avatar`;

export function toSender(r: SenderRow, publicUrl: PublicUrl): GiftSender | null {
  if (!r.sender_shown || !r.sender_id || !r.sender_username) return null;
  return {
    userId: r.sender_id,
    username: r.sender_username,
    displayName: r.sender_display_name,
    avatarUrl: resolveAvatarUrl(r.sender_photo, r.sender_avatar, publicUrl),
  };
}

/**
 * Who is looking at a gift card. `id` is null for an event published to a whole group room, where nobody is "me";
 * each recipient also gets their own card (`gift_received`). `seesEveryone` follows the group roster's rule, since
 * members see one another; elsewhere names are shown only as `shownToSql` allows. In a direct message it is true.
 */
export interface CardViewer {
  id: string | null;
  seesEveryone: boolean;
}

interface CardRow extends SenderRow {
  id: string;
  batch_id: string;
  to_user_id: string;
  price: number;
  quantity: number;
  opened_at: Date | null;
  thanked_at: Date | null;
  sku: string;
  name: string;
  category: string;
  asset_key: string | null;
  active: boolean;
  limited: boolean;
  username: string;
  profile_photo_key: string | null;
  selected_avatar_key: string | null;
  gone: boolean;
  shown: boolean;
}

function isEquippable(category: string): category is EquippableCategory {
  return (EQUIPPABLE_GIFT_CATEGORIES as readonly string[]).includes(category);
}

/**
 * The gift cards for some batches as one viewer sees them, keyed by batch. A batch is one send: a gift row per
 * recipient and one chat message. Cards are built from the rows, so "opened" is always current; the price is never
 * on one, and the tier follows what was paid, so a later price change does not resize a given gift. Recipients
 * whose accounts are gone are left out, so a child's closed account does not linger in other people's chats.
 */
export async function giftCards(
  executor: Pick<pg.Pool, 'query'>,
  batchIds: readonly string[],
  viewer: CardViewer,
  publicUrl: PublicUrl = () => null,
): Promise<Map<string, GiftCard>> {
  return cardsFrom(await cardRows(executor, batchIds, viewer), viewer.id, publicUrl);
}

/**
 * A batch's card as each of these viewers sees it, keyed by viewer, from one read. Every viewer must see everyone
 * on the card (`seesEveryone`), which leaves only what is theirs to differ between them.
 */
export async function giftCardsForEach(
  executor: Pick<pg.Pool, 'query'>,
  batchId: string,
  viewerIds: ReadonlyArray<string | null>,
  publicUrl: PublicUrl = () => null,
): Promise<Map<string | null, GiftCard | null>> {
  // Everyone told of one send shares its chat, and a block between members already keeps the message from them.
  const rows = await cardRows(executor, [batchId], { id: null, seesEveryone: true });
  return new Map(viewerIds.map((id) => [id, cardsFrom(rows, id, publicUrl).get(batchId) ?? null]));
}

async function cardRows(executor: Pick<pg.Pool, 'query'>, batchIds: readonly string[], viewer: CardViewer): Promise<CardRow[]> {
  if (batchIds.length === 0) return [];
  // created_at, then id: the order the recipients were given their gifts in
  const rows = await executor.query<CardRow>(
    `SELECT g.id, g.batch_id, g.to_user_id, g.price, g.quantity, g.opened_at, g.thanked_at,
            i.sku, i.name, i.category, i.asset_key, i.active, i.available_to IS NOT NULL AS limited,
            u.username, u.profile_photo_key, u.selected_avatar_key, u.deleted_at IS NOT NULL AS gone,
            COALESCE($3::boolean OR ${shownToSql('u', '$2::uuid')}, false) AS shown,
            ${SENDER_COLUMNS}, COALESCE(${giftSenderShownSql('s', '$2::uuid', '$3::boolean')}, false) AS sender_shown
       FROM gifts g
       JOIN shop_items i ON i.sku = g.sku
       JOIN users u ON u.id = g.to_user_id
       LEFT JOIN users s ON s.id = g.from_user_id
      WHERE g.batch_id = ANY($1::uuid[])
      ORDER BY g.batch_id, g.created_at, g.id`,
    [[...new Set(batchIds)], viewer.id, viewer.seesEveryone],
  );
  return rows.rows;
}

function cardsFrom(rows: readonly CardRow[], viewerId: string | null, publicUrl: PublicUrl): Map<string, GiftCard> {
  const byBatch = new Map<string, CardRow[]>();
  for (const r of rows) {
    const list = byBatch.get(r.batch_id) ?? [];
    list.push(r);
    byBatch.set(r.batch_id, list);
  }

  const cards = new Map<string, GiftCard>();
  for (const [batchId, list] of byBatch) {
    const first = list[0]!;
    const mine = viewerId ? list.find((r) => r.to_user_id === viewerId) ?? null : null;
    const recipients: GiftRecipient[] = list
      .filter((r) => !r.gone)
      .map((r) => {
        const isMe = r.to_user_id === viewerId;
        const shown = isMe || r.shown;
        return {
          name: shown ? r.username : null,
          avatarUrl: shown ? resolveAvatarUrl(r.profile_photo_key, r.selected_avatar_key, publicUrl) : null,
          isMe,
          opened: r.opened_at !== null,
          thanked: r.thanked_at !== null,
        };
      });
    cards.set(batchId, {
      batchId,
      sku: first.sku,
      name: first.name,
      category: first.category,
      assetUrl: cosmeticAssetUrl(first.category, first.asset_key, publicUrl, first.sku),
      tier: giftTierFor({ price: first.price, limited: first.limited || isLimitedItem(first.sku, null) }),
      recipients,
      from: toSender(first, publicUrl),
      myGiftId: mine?.id ?? null,
      myOpened: mine ? mine.opened_at !== null : false,
      myThanked: mine ? mine.thanked_at !== null : false,
      // Something to wear straight from the unwrap: theirs, wearable and still on sale, since equipping a withdrawn item
      // is refused.
      equippable: mine && isEquippable(first.category) && first.asset_key && first.active ? first.category : null,
      // one send gives every recipient the same number
      quantity: first.quantity,
    });
  }
  return cards;
}

/** Where a gift batch was posted, from its message; null for a gift older than gift messages. */
export type BatchChat =
  | { kind: 'dm'; messageId: string; userLo: string; userHi: string }
  | { kind: 'group'; messageId: string; groupId: string };

export async function batchChat(executor: Pick<pg.Pool, 'query'>, batchId: string): Promise<BatchChat | null> {
  const r = await executor.query<{
    kind: 'dm' | 'group';
    message_id: string;
    group_id: string | null;
    user_lo: string | null;
    user_hi: string | null;
  }>(
    `SELECT 'dm' AS kind, m.id AS message_id, NULL::uuid AS group_id, m.user_lo, m.user_hi
       FROM dm_messages m WHERE m.gift_batch_id = $1 AND m.kind = 'gift'
     UNION ALL
     SELECT 'group', m.id, m.group_id, NULL::uuid, NULL::uuid
       FROM group_messages m WHERE m.gift_batch_id = $1 AND m.kind = 'gift'
     LIMIT 1`,
    [batchId],
  );
  const row = r.rows[0];
  if (!row) return null;
  return row.kind === 'group'
    ? { kind: 'group', messageId: row.message_id, groupId: row.group_id! }
    : { kind: 'dm', messageId: row.message_id, userLo: row.user_lo!, userHi: row.user_hi! };
}
