/**
 * Word tags: a short Kurmancî word or phrase worn as a pill by the name on a profile, one at a time, bought in the shop
 * like a frame. They are shop items of the 'tag' kind; the one 'tag' item that is not worn this way is the Kurdish tag,
 * which makes a main tag (api tags/service.ts) and is managed with the other profile tags.
 */
import { itemCategory } from './shop-items.js';

/** The shop item behind the Kurdish main tag. */
export const KURDISH_TAG_SKU = 'tag_kurdish';

/** Whether a shop item is a word tag, worn by the name through `PUT /me/cosmetics/tag`. */
export function isWordTag(item: { sku: string; category: string }): boolean {
  return itemCategory(item.category) === 'tag' && item.sku !== KURDISH_TAG_SKU;
}

/** The word tag a profile shows (GET /users/:id, GET /me): its Kurmancî word and what it means in English. */
export interface ProfileWordTag {
  sku: string;
  /** the Kurmancî word, shown as written in every language */
  label: string;
  /** its English meaning, which the apps show in the reader's language (shared `shopItemDescription`) */
  meaning: string | null;
}
