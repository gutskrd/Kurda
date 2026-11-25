/**
 * Shop items by kind, with search, filters and order shared by the shop, the inventory and the gift picker in both apps,
 * so a background is always under Backgrounds and "caydan" finds Çaydan. Only the labels belong to each app.
 */

/**
 * The kinds of item in display order: what is worn on a profile (background, icon, frame), then tags, gift stickers,
 * then an admin's own categories ('other').
 */
export const ITEM_CATEGORIES = ['background', 'icon', 'frame', 'tag', 'sticker', 'other'] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

/** The kind a shop category belongs to; anything not a named kind is 'other'. */
export function itemCategory(raw: string): ItemCategory {
  return (ITEM_CATEGORIES as readonly string[]).includes(raw) && raw !== 'other' ? (raw as ItemCategory) : 'other';
}

/** How a list can be ordered. 'featured' is the shop's own order from the API. */
export const ITEM_SORTS = ['featured', 'price-asc', 'price-desc', 'name'] as const;
export type ItemSort = (typeof ITEM_SORTS)[number];

/** What filtering needs to know about an item. */
export interface FilterableItem {
  name: string;
  description?: string | null;
  category: string;
  price?: number;
}

/** A filter: one kind or all of them, words to look for, and an order. */
export interface ItemFilter {
  category: ItemCategory | 'all';
  query: string;
  sort: ItemSort;
}

export const DEFAULT_ITEM_FILTER: ItemFilter = { category: 'all', query: '', sort: 'featured' };

/** Text folded for search: lower case without the marks on its letters (Kurdish ç ê î ş û and other accents), so a keyboard without them still finds them. */
export function foldForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .toLowerCase()
    .trim();
}

/** Whether an item's name or description holds every word of `query`; an empty query matches all. */
export function matchesQuery(item: Pick<FilterableItem, 'name' | 'description'>, query: string): boolean {
  const words = foldForSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = foldForSearch(`${item.name} ${item.description ?? ''}`);
  return words.every((w) => hay.includes(w));
}

/** The items in `sort`'s order, as a new array. Ties keep their incoming order, so items of one price stay in the shop's order. */
export function sortItems<T extends FilterableItem>(items: readonly T[], sort: ItemSort, locale?: string): T[] {
  const out = [...items];
  if (sort === 'price-asc') out.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
  else if (sort === 'price-desc') out.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
  else if (sort === 'name') out.sort((a, b) => a.name.localeCompare(b.name, locale, { sensitivity: 'base' }));
  return out;
}

/** How many items there are of each kind, and in all. */
export function countByCategory(items: readonly FilterableItem[]): Record<ItemCategory | 'all', number> {
  const counts = Object.fromEntries([['all', items.length], ...ITEM_CATEGORIES.map((c) => [c, 0])]) as Record<ItemCategory | 'all', number>;
  for (const item of items) counts[itemCategory(item.category)] += 1;
  return counts;
}

/** The kinds a list holds, in display order: the tabs worth offering. */
export function categoriesIn(items: readonly FilterableItem[]): ItemCategory[] {
  const counts = countByCategory(items);
  return ITEM_CATEGORIES.filter((c) => counts[c] > 0);
}

/** The items a filter shows: of its kind, holding its words, in its order; `keep` narrows by a screen's own options (affordable, owned). */
export function applyItemFilter<T extends FilterableItem>(items: readonly T[], filter: ItemFilter, keep: (item: T) => boolean = () => true, locale?: string): T[] {
  const shown = items.filter((item) => (filter.category === 'all' || itemCategory(item.category) === filter.category) && matchesQuery(item, filter.query) && keep(item));
  return sortItems(shown, filter.sort, locale);
}

/** A list split by kind in display order, each kind's items in incoming order, for showing "all" in sections. */
export function groupByCategory<T extends FilterableItem>(items: readonly T[]): { category: ItemCategory; items: T[] }[] {
  return ITEM_CATEGORIES.map((category) => ({ category, items: items.filter((item) => itemCategory(item.category) === category) })).filter((g) => g.items.length > 0);
}

/** A filter read back from the address bar's `?kind=&q=&sort=`, anything unknown left at its default. */
export function readItemFilter(get: (key: 'kind' | 'q' | 'sort') => string | null | undefined): ItemFilter {
  const kind = get('kind');
  const sort = get('sort');
  return {
    category: kind && (ITEM_CATEGORIES as readonly string[]).includes(kind) ? (kind as ItemCategory) : 'all',
    query: (get('q') ?? '').slice(0, 80),
    sort: sort && (ITEM_SORTS as readonly string[]).includes(sort) ? (sort as ItemSort) : 'featured',
  };
}

/** A filter as the address bar keeps it: only what differs from the default, so a plain page has a plain address. */
export function itemFilterParams(filter: ItemFilter): Partial<Record<'kind' | 'q' | 'sort', string>> {
  const out: Partial<Record<'kind' | 'q' | 'sort', string>> = {};
  if (filter.category !== 'all') out.kind = filter.category;
  if (filter.query.trim()) out.q = filter.query;
  if (filter.sort !== 'featured') out.sort = filter.sort;
  return out;
}

/** Whether a filter narrows anything, so a screen knows to offer "Clear filters". */
export function isFiltered(filter: ItemFilter): boolean {
  return filter.category !== 'all' || filter.query.trim() !== '' || filter.sort !== 'featured';
}
