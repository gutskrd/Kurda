/** User tags & badges (KUR-286/287) — types mirroring the API + native-free
 *  helpers for the management UI, so the helpers are unit-testable. */

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
  /** auto-granted (year_joined / level) — shown but not user-managed. */
  auto: boolean;
}

export interface ProfileTags {
  main: { key: string; label: string } | null;
  claimable: DisplayTag[];
}

/** A user's own self-claimed tag incl. its display state (GET /me/tags/claimed). */
export interface ClaimedTag {
  key: string;
  label: string;
  category: string;
  value: string | null;
  sensitive: boolean;
  displayed: boolean;
}

/**
 * Self-claim catalog tags the user hasn't claimed yet — the "claim a tag"
 * options. Auto-grant, role, and purchase tags aren't self-claimable, and
 * already-claimed keys are excluded.
 */
export function claimableCatalog(catalog: TagRow[], mine: readonly { key: string }[]): TagRow[] {
  const claimed = new Set(mine.map((t) => t.key));
  return catalog.filter((t) => t.active && t.acquisition === 'self_claim' && !claimed.has(t.key));
}

/** Purchase tags the user doesn't already have as their main tag (buy in shop). */
export function purchasableTags(catalog: TagRow[], main: ProfileTags['main']): TagRow[] {
  return catalog.filter((t) => t.active && t.acquisition === 'purchase' && t.shopSku != null && t.key !== main?.key);
}

/** A compact label like "Age: 25–34" or just "Level" when there's no value. */
export function tagLabel(tag: { label: string; value: string | null }): string {
  return tag.value ? `${tag.label}: ${tag.value}` : tag.label;
}
