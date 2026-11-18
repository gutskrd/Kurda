/**
 * User tags and badges: the API's shapes and the view logic both apps use to decide what to offer. The rules are the
 * server's (`api/src/tags/service.ts` settles each claim); these helpers only choose what to show.
 */

export type TagKind = 'main' | 'claimable';
export type Acquisition = 'default' | 'role' | 'purchase' | 'self_claim' | 'auto_grant';

/** A catalog entry (GET /tags). */
export interface TagRow {
  id: string;
  key: string;
  label: string;
  kind: TagKind;
  category: string;
  acquisition: Acquisition;
  roleRequired: string | null;
  shopSku: string | null;
  sensitive: boolean;
  active: boolean;
}

/** One of a user's displayed tags (GET /me/tags). */
export interface DisplayTag {
  key: string;
  label: string;
  category: string;
  value: string | null;
  sensitive: boolean;
  /** auto-granted (year joined, level): shown but not user-managed */
  auto: boolean;
}

export interface ProfileTags {
  main: { key: string; label: string } | null;
  claimable: DisplayTag[];
}

/** A user's own self-claimed tag with its display state (GET /me/tags/claimed). */
export interface ClaimedTag {
  key: string;
  label: string;
  category: string;
  value: string | null;
  sensitive: boolean;
  displayed: boolean;
}

/** Self-claim catalogue tags not yet claimed: the "claim a tag" options. Auto-grant, role and purchase tags cannot be self-claimed. */
export function claimableCatalog(catalog: TagRow[], mine: readonly { key: string }[]): TagRow[] {
  const claimed = new Set(mine.map((t) => t.key));
  return catalog.filter((t) => t.active && t.acquisition === 'self_claim' && !claimed.has(t.key));
}

/** Purchase tags the user does not already have as their main tag, for the shop. */
export function purchasableTags(catalog: TagRow[], main: ProfileTags['main']): TagRow[] {
  return catalog.filter((t) => t.active && t.acquisition === 'purchase' && t.shopSku != null && t.key !== main?.key);
}

/** A compact label such as "Age: 25–34", or just "Level" without a value. */
export function tagLabel(tag: { label: string; value: string | null }): string {
  return tag.value ? `${tag.label}: ${tag.value}` : tag.label;
}
