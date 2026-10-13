import type pg from 'pg';
import {
  EQUIPPABLE_GIFT_CATEGORIES,
  giftTierFor,
  type EquippableCategory,
  type GiftCard,
  type GiftRecipient,
} from '@kurda/shared';
import { cosmeticAssetUrl, resolveAvatarUrl, type PublicUrl } from '../cosmetics/access.js';
import { shownToSql } from '../users/age.js';

/**
 * Who is looking at a gift card.
 *
 * `id` is null for an event published to a whole group room, which is read by
 * no one in particular: then nobody is "me" and nobody's own gift is on it —
 * each recipient is sent their own card besides (`gift_received`).
 *
 * `seesEveryone` is the group roster's rule (groups/service.ts `get`): a member
 * of an invite-only group sees every other member, someone they chose put them
 * there; anywhere else a name is shown only to whom `shownToSql` allows. In a
 * direct message both people are the pair, so it is true there.
 */
export interface CardViewer {
  id: string | null;
  seesEveryone: boolean;
}

interface CardRow {
  id: string;
  batch_id: string;
  to_user_id: string;
  price: number;
  currency: 'zer' | 'gems';
  opened_at: Date | null;
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
 * The gift cards for some batches, as one viewer sees them, keyed by batch.
 *
 * A batch is one send: one gift row per recipient, one chat message. The card
 * is built from the rows rather than stored on the message, so "opened" is
 * always the truth and never a copy to keep in step. The price is never on it
 * (shared `GiftCard`); the tier is worked out from what was paid, so a price
 * change later does not change how big a gift already given looks.
 *
 * Recipients whose accounts are gone are left out: a deleted account has no
 * name to show, and a child's closed account must not stay on as a
 * "deleted_…" entry in other people's chats.
 */
export async function giftCards(
  executor: Pick<pg.Pool, 'query'>,
  batchIds: readonly string[],
  viewer: CardViewer,
  publicUrl: PublicUrl = () => null,
): Promise<Map<string, GiftCard>> {
  const cards = new Map<string, GiftCard>();
  if (batchIds.length === 0) return cards;
  // created_at, then id: the order the recipients were given their gifts in
  const rows = await executor.query<CardRow>(
    `SELECT g.id, g.batch_id, g.to_user_id, g.price, g.currency, g.opened_at,
            i.sku, i.name, i.category, i.asset_key, i.active, i.available_to IS NOT NULL AS limited,
            u.username, u.profile_photo_key, u.selected_avatar_key, u.deleted_at IS NOT NULL AS gone,
            COALESCE($3::boolean OR ${shownToSql('u', '$2::uuid')}, false) AS shown
       FROM gifts g
       JOIN shop_items i ON i.sku = g.sku
       JOIN users u ON u.id = g.to_user_id
      WHERE g.batch_id = ANY($1::uuid[])
      ORDER BY g.batch_id, g.created_at, g.id`,
    [[...new Set(batchIds)], viewer.id, viewer.seesEveryone],
  );

  const byBatch = new Map<string, CardRow[]>();
  for (const r of rows.rows) {
    const list = byBatch.get(r.batch_id) ?? [];
    list.push(r);
    byBatch.set(r.batch_id, list);
  }

  for (const [batchId, list] of byBatch) {
    const first = list[0]!;
    const mine = viewer.id ? list.find((r) => r.to_user_id === viewer.id) ?? null : null;
    const recipients: GiftRecipient[] = list
      .filter((r) => !r.gone)
      .map((r) => {
        const isMe = r.to_user_id === viewer.id;
        const shown = isMe || r.shown;
        return {
          name: shown ? r.username : null,
          avatarUrl: shown ? resolveAvatarUrl(r.profile_photo_key, r.selected_avatar_key, publicUrl) : null,
          isMe,
          opened: r.opened_at !== null,
        };
      });
    cards.set(batchId, {
      batchId,
      sku: first.sku,
      name: first.name,
      category: first.category,
      assetUrl: cosmeticAssetUrl(first.category, first.asset_key),
      tier: giftTierFor({ currency: first.currency, price: first.price, limited: first.limited }),
      recipients,
      myGiftId: mine?.id ?? null,
      myOpened: mine ? mine.opened_at !== null : false,
      // something to put on straight from the unwrap: theirs, wearable, and
      // still in the catalog (an equip of a withdrawn item is refused)
      equippable: mine && isEquippable(first.category) && first.asset_key && first.active ? first.category : null,
    });
  }
  return cards;
}

/** Where a gift batch was posted, found from its message. Null for a gift older than gift messages. */
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
       FROM dm_messages m WHERE m.gift_batch_id = $1
     UNION ALL
     SELECT 'group', m.id, m.group_id, NULL::uuid, NULL::uuid
       FROM group_messages m WHERE m.gift_batch_id = $1
     LIMIT 1`,
    [batchId],
  );
  const row = r.rows[0];
  if (!row) return null;
  return row.kind === 'group'
    ? { kind: 'group', messageId: row.message_id, groupId: row.group_id! }
    : { kind: 'dm', messageId: row.message_id, userLo: row.user_lo!, userHi: row.user_hi! };
}
