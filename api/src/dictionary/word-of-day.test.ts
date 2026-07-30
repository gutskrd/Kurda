import { describe, expect, it } from 'vitest';
import { wordOfDayIndex } from './word-of-day.js';

describe('wordOfDayIndex', () => {
  it('is deterministic for a given day + pool size', () => {
    expect(wordOfDayIndex('2026-07-09', 50)).toBe(wordOfDayIndex('2026-07-09', 50));
  });

  it('steps by one each day (no repeat until the pool cycles)', () => {
    const a = wordOfDayIndex('2026-07-09', 90);
    const b = wordOfDayIndex('2026-07-10', 90);
    expect((a + 1) % 90).toBe(b);
  });

  it('a 90-word pool does not repeat within 90 days', () => {
    const seen = new Set<number>();
    let d = Date.parse('2026-07-09T00:00:00Z');
    for (let i = 0; i < 90; i++) {
      const day = new Date(d).toISOString().slice(0, 10);
      seen.add(wordOfDayIndex(day, 90));
      d += 86_400_000;
    }
    expect(seen.size).toBe(90); // all distinct across 90 days
  });

  it('returns -1 for an empty pool', () => {
    expect(wordOfDayIndex('2026-07-09', 0)).toBe(-1);
  });
});
