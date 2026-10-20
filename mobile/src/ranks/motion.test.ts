import { describe, expect, it } from 'vitest';
import { FLECKS, countUpMs } from './motion';

describe('FLECKS', () => {
  it('is calm: a division is a nod, never a screenful', () => {
    expect(FLECKS.division).toBeLessThan(FLECKS.tier);
    expect(Math.max(...Object.values(FLECKS))).toBeLessThanOrEqual(24);
  });
});

describe('countUpMs', () => {
  it('is quick for a small change and never drags for a big one', () => {
    expect(countUpMs(0, false)).toBe(0);
    expect(countUpMs(6, false)).toBeLessThan(countUpMs(40, false));
    expect(countUpMs(400, false)).toBe(1400);
    expect(countUpMs(-6, false)).toBe(countUpMs(6, false));
  });

  it('does not count at all under Reduce Motion', () => {
    expect(countUpMs(24, true)).toBe(0);
  });
});
