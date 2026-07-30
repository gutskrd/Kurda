import { describe, expect, it } from 'vitest';
import { PRACTICE_TARGET, selectPracticeItems } from './practice-select.js';

describe('selectPracticeItems', () => {
  it('takes due items when there are enough, capped at the target', () => {
    const due = Array.from({ length: 15 }, (_, i) => `d${i}`);
    const out = selectPracticeItems(due, []);
    expect(out).toHaveLength(PRACTICE_TARGET);
    expect(out.every((id) => id.startsWith('d'))).toBe(true);
  });

  it('returns exactly the due items when between min and target', () => {
    const due = ['d0', 'd1', 'd2', 'd3', 'd4', 'd5'];
    expect(selectPracticeItems(due, ['w0', 'w1'])).toEqual(due); // no padding needed
  });

  it('pads with weak words when too few are due (edge: only 2 due)', () => {
    const out = selectPracticeItems(['d0', 'd1'], ['w0', 'w1', 'w2', 'w3', 'w4']);
    expect(out.slice(0, 2)).toEqual(['d0', 'd1']); // due first
    expect(out.length).toBeGreaterThanOrEqual(4); // padded to at least min
    expect(out).toContain('w0');
  });

  it('never duplicates an item that is both due and weak', () => {
    const out = selectPracticeItems(['d0'], ['d0', 'w1', 'w2', 'w3']);
    expect(new Set(out).size).toBe(out.length);
  });

  it('returns nothing when there is nothing to review', () => {
    expect(selectPracticeItems([], [])).toEqual([]);
  });
});
