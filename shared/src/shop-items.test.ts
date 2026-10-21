import { describe, expect, it } from 'vitest';
import {
  applyItemFilter,
  categoriesIn,
  countByCategory,
  DEFAULT_ITEM_FILTER,
  foldForSearch,
  groupByCategory,
  isFiltered,
  itemCategory,
  itemFilterParams,
  matchesQuery,
  readItemFilter,
  sortItems,
  type FilterableItem,
} from './shop-items.js';

const item = (name: string, category: string, price = 0, extra: Partial<FilterableItem> = {}): FilterableItem => ({ name, category, price, currency: 'zer', ...extra });

const hevalo = item('Hevalo', 'background', 0, { description: 'Hevalo violet' });
const glass = item('Îstîkan', 'icon', 900, { description: 'Tea glass' });
const lake = item('Gola Şîn', 'background', 500, { description: 'Blue lake' });
const tag = item('Kurdish Tag', 'tag', 500);
const seal = item('Mohra Rojê', 'icon', 600, { description: 'Sun seal' });
const frame = item('Gold frame', 'frame', 0);
const freeze = item('Streak freeze', 'freeze', 200);
const shelf = [hevalo, glass, lake, tag, seal, frame, freeze];

describe('kinds of item', () => {
  it('knows the named kinds and puts anything else under other', () => {
    expect(['background', 'icon', 'frame', 'tag'].map(itemCategory)).toEqual(['background', 'icon', 'frame', 'tag']);
    expect(itemCategory('freeze')).toBe('other');
    expect(itemCategory('other')).toBe('other');
    expect(itemCategory('')).toBe('other');
  });

  it('counts each kind, and all of them', () => {
    expect(countByCategory(shelf)).toEqual({ all: 7, background: 2, icon: 2, frame: 1, tag: 1, other: 1 });
  });

  it('offers only the kinds a list holds, in the shown order', () => {
    expect(categoriesIn([tag, glass, hevalo])).toEqual(['background', 'icon', 'tag']);
    expect(categoriesIn([])).toEqual([]);
  });

  it('splits a list into sections by kind, keeping the order within each', () => {
    const groups = groupByCategory(shelf);
    expect(groups.map((g) => g.category)).toEqual(['background', 'icon', 'frame', 'tag', 'other']);
    expect(groups[0]?.items.map((i) => i.name)).toEqual(['Hevalo', 'Gola Şîn']);
    expect(groups[1]?.items.map((i) => i.name)).toEqual(['Îstîkan', 'Mohra Rojê']);
  });
});

describe('searching', () => {
  it('folds Kurdish letters and accents, and case', () => {
    expect(foldForSearch('Çaydan')).toBe('caydan');
    expect(foldForSearch('Îstîkan Şîn Rojê Ûsiv')).toBe('istikan sin roje usiv');
    expect(foldForSearch('KILIM')).toBe('kilim');
    expect(foldForSearch('ılık')).toBe('ilik');
  });

  it('finds an item by its name or its description, typed with or without the marks', () => {
    expect(matchesQuery(glass, 'istikan')).toBe(true);
    expect(matchesQuery(glass, 'tea')).toBe(true);
    expect(matchesQuery(lake, 'şîn')).toBe(true);
    expect(matchesQuery(lake, 'sin')).toBe(true);
    expect(matchesQuery(lake, 'tea')).toBe(false);
  });

  it('needs every word, in any order, and an empty query finds everything', () => {
    expect(matchesQuery(seal, 'seal sun')).toBe(true);
    expect(matchesQuery(seal, 'seal moon')).toBe(false);
    expect(matchesQuery(seal, '   ')).toBe(true);
  });
});

describe('ordering', () => {
  it('keeps the shop order when featured, and does not touch the input', () => {
    const before = shelf.map((i) => i.name);
    expect(sortItems(shelf, 'featured').map((i) => i.name)).toEqual(before);
    sortItems(shelf, 'price-desc');
    expect(shelf.map((i) => i.name)).toEqual(before);
  });

  it('orders by price either way, ties in the shop order, Zêr before gems', () => {
    const items = [item('a', 'icon', 600), item('b', 'icon', 50, { currency: 'gems' }), item('c', 'icon', 400), item('d', 'icon', 600)];
    expect(sortItems(items, 'price-asc').map((i) => i.name)).toEqual(['c', 'a', 'd', 'b']);
    expect(sortItems(items, 'price-desc').map((i) => i.name)).toEqual(['b', 'a', 'd', 'c']);
  });

  it('orders by name the way people read it, a letter with marks read as the plain one', () => {
    const items = [item('Zozan', 'background'), item('Çiya', 'icon'), item('Ask', 'icon'), item('Cil', 'icon')];
    expect(sortItems(items, 'name', 'en').map((i) => i.name)).toEqual(['Ask', 'Cil', 'Çiya', 'Zozan']);
  });
});

describe('a whole filter', () => {
  it('narrows by kind and words, then orders', () => {
    const shown = applyItemFilter(shelf, { category: 'icon', query: '', sort: 'price-asc' });
    expect(shown.map((i) => i.name)).toEqual(['Mohra Rojê', 'Îstîkan']);
    expect(applyItemFilter(shelf, { category: 'all', query: 'lake', sort: 'featured' }).map((i) => i.name)).toEqual(['Gola Şîn']);
    expect(applyItemFilter(shelf, { category: 'other', query: '', sort: 'featured' }).map((i) => i.name)).toEqual(['Streak freeze']);
  });

  it('takes a screen’s own narrowing besides', () => {
    const affordable = applyItemFilter(shelf, DEFAULT_ITEM_FILTER, (i) => (i.price ?? 0) <= 500);
    expect(affordable.map((i) => i.name)).toEqual(['Hevalo', 'Gola Şîn', 'Kurdish Tag', 'Gold frame', 'Streak freeze']);
  });

  it('round-trips through the address bar, keeping only what differs from the default', () => {
    expect(itemFilterParams(DEFAULT_ITEM_FILTER)).toEqual({});
    const filter = { category: 'background' as const, query: 'gola', sort: 'price-desc' as const };
    const params = itemFilterParams(filter);
    expect(params).toEqual({ kind: 'background', q: 'gola', sort: 'price-desc' });
    expect(readItemFilter((k) => params[k] ?? null)).toEqual(filter);
  });

  it('reads anything unknown in the address bar as the default', () => {
    expect(readItemFilter((k) => ({ kind: 'hats', sort: 'random', q: null })[k])).toEqual(DEFAULT_ITEM_FILTER);
    expect(readItemFilter(() => undefined)).toEqual(DEFAULT_ITEM_FILTER);
    expect(readItemFilter((k) => (k === 'q' ? 'x'.repeat(200) : null)).query).toHaveLength(80);
  });

  it('knows when a filter narrows anything', () => {
    expect(isFiltered(DEFAULT_ITEM_FILTER)).toBe(false);
    expect(isFiltered({ ...DEFAULT_ITEM_FILTER, query: '  ' })).toBe(false);
    expect(isFiltered({ ...DEFAULT_ITEM_FILTER, query: 'tea' })).toBe(true);
    expect(isFiltered({ ...DEFAULT_ITEM_FILTER, sort: 'name' })).toBe(true);
  });
});
