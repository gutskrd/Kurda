/**
 * Shop items by kind, and finding a way through them.
 *
 * The shop, the inventory and the gift picker — in the browser and on the
 * phone alike — sort what they show into the same kinds, in the same order,
 * and search, filter and order it the same way, so that a background is
 * always found under Backgrounds, and "caydan" finds Çaydan wherever it is
 * typed. Only the words on the tabs and the buttons belong to each app.
 */

/**
 * The kinds of item, in the order they are shown: what is worn on a profile
 * first (a background, an icon, a frame), then a tag, then anything an admin
 * has put on sale under a category of their own ('other').
 */
export const ITEM_CATEGORIES = ['background', 'icon', 'frame', 'tag', 'other'] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

/** The kind a shop category belongs to; one that is none of the named kinds is 'other'. */
export function itemCategory(raw: string): ItemCategory {
  return (ITEM_CATEGORIES as readonly string[]).includes(raw) && raw !== 'other' ? (raw as ItemCategory) : 'other';
}

/**
 * How a list can be put in order. 'featured' is the shop's own order, as the
 * API sends it; price runs within a currency, Zêr before gems.
 */
export const ITEM_SORTS = ['featured', 'price-asc', 'price-desc', 'name'] as const;
export type ItemSort = (typeof ITEM_SORTS)[number];

/** What filtering needs to know about an item. */
export interface FilterableItem {
  name: string;
  description?: string | null;
  category: string;
  price?: number;
  currency?: 'zer' | 'gems';
}

/** A filter: one kind or all of them, words to look for, and an order. */
export interface ItemFilter {
  category: ItemCategory | 'all';
  query: string;
  sort: ItemSort;
}

export const DEFAULT_ITEM_FILTER: ItemFilter = { category: 'all', query: '', sort: 'featured' };

/**
 * Text folded for searching: lower case, with the marks taken off its letters
 * — Kurdish ç, ê, î, ş, û and anything else accented — so that what is typed on
 * a keyboard without them still finds them.
 */
export function foldForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .toLowerCase()
    .trim();
}

/** Whether an item's name or description holds every word of `query` (an empty query holds for all). */
export function matchesQuery(item: Pick<FilterableItem, 'name' | 'description'>, query: string): boolean {
  const words = foldForSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = foldForSearch(`${item.name} ${item.description ?? ''}`);
  return words.every((w) => hay.includes(w));
}

const currencyRank = (item: FilterableItem): number => (item.currency === 'gems' ? 1 : 0);

/**
 * The items in `sort`'s order (a new array; the input is left as it is). Ties
 * keep the order they came in, so items of one price stay in the shop's order.
 */
export function sortItems<T extends FilterableItem>(items: readonly T[], sort: ItemSort, locale?: string): T[] {
  const out = [...items];
  if (sort === 'price-asc') out.sort((a, b) => currencyRank(a) - currencyRank(b) || (a.price ?? 0) - (b.price ?? 0));
  else if (sort === 'price-desc') out.sort((a, b) => currencyRank(b) - currencyRank(a) || (b.price ?? 0) - (a.price ?? 0));
  else if (sort === 'name') out.sort((a, b) => a.name.localeCompare(b.name, locale, { sensitivity: 'base' }));
  return out;
}

/** How many items there are of each kind, and in all. */
export function countByCategory(items: readonly FilterableItem[]): Record<ItemCategory | 'all', number> {
  const counts = Object.fromEntries([['all', items.length], ...ITEM_CATEGORIES.map((c) => [c, 0])]) as Record<ItemCategory | 'all', number>;
  for (const item of items) counts[itemCategory(item.category)] += 1;
  return counts;
}

/** The kinds a list holds, in the shown order: the tabs worth offering for it. */
export function categoriesIn(items: readonly FilterableItem[]): ItemCategory[] {
  const counts = countByCategory(items);
  return ITEM_CATEGORIES.filter((c) => counts[c] > 0);
}

/**
 * The items a filter shows: of its kind, holding its words, in its order.
 * `keep` narrows further by whatever a screen offers besides (only what I can
 * afford, only what I own).
 */
export function applyItemFilter<T extends FilterableItem>(items: readonly T[], filter: ItemFilter, keep: (item: T) => boolean = () => true, locale?: string): T[] {
  const shown = items.filter((item) => (filter.category === 'all' || itemCategory(item.category) === filter.category) && matchesQuery(item, filter.query) && keep(item));
  return sortItems(shown, filter.sort, locale);
}

/** A list split by kind, in the shown order, each kind with its items in the order they came — for showing "all" in sections. */
export function groupByCategory<T extends FilterableItem>(items: readonly T[]): { category: ItemCategory; items: T[] }[] {
  return ITEM_CATEGORIES.map((category) => ({ category, items: items.filter((item) => itemCategory(item.category) === category) })).filter((g) => g.items.length > 0);
}

/** A filter read back from where it was kept (the address bar's `?kind=&q=&sort=`), anything unknown left at its default. */
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

/** Whether a filter narrows anything at all (so a screen knows to offer "Clear filters"). */
export function isFiltered(filter: ItemFilter): boolean {
  return filter.category !== 'all' || filter.query.trim() !== '' || filter.sort !== 'featured';
}
