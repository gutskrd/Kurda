/**
 * The shop's price ladder: what a background, an icon, a tag and a frame cost by the craft in it, and the rarity each
 * step is shown as. The prices themselves are the server's catalogue; this only names a price, so a label always
 * follows what an item is sold at, and an admin's new price moves its label with it.
 */
import { KURDISH_TAG_SKU } from './shop-tags.js';

export const RARITIES = ['classic', 'fine', 'rare', 'masterwork'] as const;
export type Rarity = (typeof RARITIES)[number];

/** The kinds the ladder prices. */
export type LadderKind = 'background' | 'icon' | 'tag' | 'frame';

/**
 * Each kind's steps in Zêr, cheapest first. A background stays under an icon and an icon under a frame, every step is
 * at least a flower gift's worth (shared gift-catalogue.ts) and the dearest frame costs less than two months of Hevalo+,
 * which lends every members' icon and background besides (docs/money/hevalo-plus.md).
 */
export const PRICE_LADDER: Readonly<Record<LadderKind, Readonly<Partial<Record<Rarity, number>>>>> = {
  background: { classic: 120, fine: 150, rare: 200 },
  icon: { classic: 150, fine: 200, rare: 250 },
  tag: { classic: 100, fine: 150, rare: 200 },
  frame: { classic: 250, fine: 350, rare: 450, masterwork: 600 },
};

const isLadderKind = (category: string): category is LadderKind => category in PRICE_LADDER;

/**
 * What an item's price makes it on the ladder: the highest step its price reaches, and under the first step still the
 * first. Null for anything free, anything the ladder does not price (a gift, a power-up) and the Kurdish tag, which is
 * an identity, not a rarity.
 */
export function itemRarity(item: { sku?: string; category: string; price: number }): Rarity | null {
  if (!isLadderKind(item.category) || item.price <= 0 || item.sku === KURDISH_TAG_SKU) return null;
  const steps = PRICE_LADDER[item.category];
  let found: Rarity = 'classic';
  for (const r of RARITIES) {
    const at = steps[r];
    if (at != null && item.price >= at) found = r;
  }
  return found;
}
