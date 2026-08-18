import { describe, expect, it } from 'vitest';
import { claimableCatalog, purchasableTags, tagLabel, type DisplayTag, type TagRow } from './types';

const row = (over: Partial<TagRow>): TagRow => ({
  id: over.key ?? 'x', key: 'x', label: 'X', kind: 'claimable', category: 'c', acquisition: 'self_claim',
  roleRequired: null, shopSku: null, sensitive: false, active: true, ...over,
});
const disp = (over: Partial<DisplayTag>): DisplayTag => ({
  key: 'x', label: 'X', category: 'c', value: null, sensitive: false, auto: false, ...over,
});

describe('claimableCatalog', () => {
  it('keeps only active self-claim tags the user has not claimed', () => {
    const catalog = [
      row({ key: 'age', acquisition: 'self_claim' }),
      row({ key: 'gender', acquisition: 'self_claim' }),
      row({ key: 'level', acquisition: 'auto_grant' }),
      row({ key: 'kurdish', acquisition: 'purchase' }),
      row({ key: 'old', acquisition: 'self_claim', active: false }),
    ];
    const mine = [disp({ key: 'age' })];
    expect(claimableCatalog(catalog, mine).map((t) => t.key)).toEqual(['gender']);
  });
});

describe('purchasableTags', () => {
  it('lists purchase tags with a SKU that are not the current main tag', () => {
    const catalog = [
      row({ key: 'kurdish', acquisition: 'purchase', shopSku: 'tag_kurdish' }),
      row({ key: 'noSku', acquisition: 'purchase', shopSku: null }),
    ];
    expect(purchasableTags(catalog, null).map((t) => t.key)).toEqual(['kurdish']);
    expect(purchasableTags(catalog, { key: 'kurdish', label: 'Kurdish' })).toEqual([]);
  });
});

describe('tagLabel', () => {
  it('appends a value when present', () => {
    expect(tagLabel({ label: 'Age', value: '25–34' })).toBe('Age: 25–34');
    expect(tagLabel({ label: 'Level', value: null })).toBe('Level');
  });
});
