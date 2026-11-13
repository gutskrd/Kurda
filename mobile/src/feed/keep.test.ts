import { describe, expect, it, vi } from 'vitest';
// the module's hook listens for its screen's focus; the merging under test is plain data
vi.mock('@react-navigation/native', () => ({ useFocusEffect: () => undefined }));
import { mergeFresh, withOnTop } from './keep';

interface Row {
  id: string;
  likes: number;
}
const row = (id: string, likes = 0): Row => ({ id, likes });
const keyOf = (r: Row): string => r.id;
const ids = (rows: readonly Row[]): string[] => rows.map((r) => r.id);

/** A first page that is full: there may be more behind it, so nothing is known to be gone. */
const page = (...rows: Row[]) => ({ fresh: rows, pageSize: rows.length });

describe('a list brought up to date with its first page', () => {
  it('gives each post shown what the read says of it, in its place, and drops none', () => {
    const { fresh, pageSize } = page(row('b', 4), row('c'));
    const merged = mergeFresh([row('a'), row('b'), row('c'), row('d')], fresh, { keyOf, pageSize, onTop: true });
    expect(ids(merged.items)).toEqual(['a', 'b', 'c', 'd']);
    expect(merged.items[1]!.likes).toBe(4);
  });

  it('puts new posts on top while the list is at its top, and holds them back while it is not', () => {
    const { fresh, pageSize } = page(row('n1'), row('n2'), row('a'));
    const top = mergeFresh([row('a'), row('z')], fresh, { keyOf, pageSize, onTop: true });
    expect(ids(top.items)).toEqual(['n1', 'n2', 'a', 'z']);
    expect(top.waiting).toEqual([]);
    const down = mergeFresh([row('a'), row('z')], fresh, { keyOf, pageSize, onTop: false });
    expect(ids(down.items)).toEqual(['a', 'z']);
    expect(ids(down.waiting)).toEqual(['n1', 'n2']);
  });

  it('takes a read shorter than a page as the whole list: what it no longer holds is gone', () => {
    const merged = mergeFresh([row('a'), row('b'), row('c')], [row('a', 2), row('c')], { keyOf, pageSize: 20, onTop: false });
    expect(ids(merged.items)).toEqual(['a', 'c']);
    expect(merged.items[0]!.likes).toBe(2);
    expect(merged.waiting).toEqual([]);
  });

  it('puts the posts held back on top once the list is there, without doubling one it took on since', () => {
    expect(ids(withOnTop([row('n2'), row('a')], [row('n1'), row('n2')], keyOf))).toEqual(['n1', 'n2', 'a']);
  });
});
