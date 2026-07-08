import { describe, expect, it } from 'vitest';
import { emptyMatch, isLeftMatched, isRightMatched, tapLeft, tapRight } from './match';

describe('match interaction', () => {
  it('pairs a left then a right', () => {
    let s = tapLeft(emptyMatch, 'sêv');
    expect(s.selectedLeft).toBe('sêv');
    s = tapRight(s, 'apple');
    expect(s.matches).toEqual([{ left: 'sêv', right: 'apple' }]);
    expect(s.selectedLeft).toBeNull();
    expect(isLeftMatched(s, 'sêv')).toBe(true);
    expect(isRightMatched(s, 'apple')).toBe(true);
  });

  it('ignores a right tap with no left selected', () => {
    const s = tapRight(emptyMatch, 'apple');
    expect(s).toEqual(emptyMatch);
  });

  it('deselects a left when tapped twice', () => {
    let s = tapLeft(emptyMatch, 'sêv');
    s = tapLeft(s, 'sêv');
    expect(s.selectedLeft).toBeNull();
  });

  it('unmatches by tapping a matched left or right', () => {
    let s = tapRight(tapLeft(emptyMatch, 'av'), 'water');
    expect(s.matches).toHaveLength(1);
    s = tapLeft(s, 'av'); // tap matched left → remove
    expect(s.matches).toHaveLength(0);
  });

  it('switches selection between lefts before pairing', () => {
    let s = tapLeft(emptyMatch, 'a');
    s = tapLeft(s, 'b'); // change mind
    expect(s.selectedLeft).toBe('b');
    s = tapRight(s, 'B');
    expect(s.matches).toEqual([{ left: 'b', right: 'B' }]);
  });
});
