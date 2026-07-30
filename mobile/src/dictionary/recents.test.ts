import { describe, expect, it } from 'vitest';
import { pushRecent } from './recents';

describe('pushRecent', () => {
  it('adds a term to the front', () => {
    expect(pushRecent(['a'], 'b')).toEqual(['b', 'a']);
  });

  it('ignores blank terms', () => {
    expect(pushRecent(['a'], '   ')).toEqual(['a']);
  });

  it('de-duplicates case-insensitively, moving to the front', () => {
    expect(pushRecent(['sêv', 'av'], 'AV')).toEqual(['AV', 'sêv']);
  });

  it('caps the list', () => {
    const list = Array.from({ length: 10 }, (_, i) => `w${i}`);
    const out = pushRecent(list, 'new', 10);
    expect(out).toHaveLength(10);
    expect(out[0]).toBe('new');
    expect(out).not.toContain('w9'); // oldest dropped
  });
});
