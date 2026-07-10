import { describe, expect, it } from 'vitest';
import { canonicalPair } from './pair.js';

describe('canonicalPair', () => {
  it('orders the pair the same regardless of argument order', () => {
    const p1 = canonicalPair('aaa', 'bbb');
    const p2 = canonicalPair('bbb', 'aaa');
    expect(p1.lo).toBe('aaa');
    expect(p1.hi).toBe('bbb');
    expect(p2.lo).toBe('aaa');
    expect(p2.hi).toBe('bbb');
  });
  it('reports which side the first argument is on', () => {
    expect(canonicalPair('aaa', 'bbb').aIsLo).toBe(true);
    expect(canonicalPair('bbb', 'aaa').aIsLo).toBe(false);
  });
});
