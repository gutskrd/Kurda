import { describe, expect, it } from 'vitest';
import { pickJumpItems } from './pick.js';

/** A fixed draw, so a test sees the same order every run. */
function seeded(seed = 7): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const skill = (name: string, n: number) => Array.from({ length: n }, (_, i) => `${name}${i + 1}`);

describe('pickJumpItems', () => {
  it('asks about every skill before asking any of them twice', () => {
    const picked = pickJumpItems([skill('a', 5), skill('b', 5), skill('c', 5)], 10, seeded());
    expect(picked).toHaveLength(10);
    expect(new Set(picked).size).toBe(10);
    // three rounds of one from each, and a tenth from the first
    expect(picked.slice(0, 3).map((id) => id[0])).toEqual(['a', 'b', 'c']);
    expect(picked.slice(3, 6).map((id) => id[0])).toEqual(['a', 'b', 'c']);
  });

  it('takes what there is when the skills hold fewer than a test, and skips a skill with none', () => {
    const picked = pickJumpItems([skill('a', 2), [], skill('c', 1)], 10, seeded());
    expect(picked.sort()).toEqual(['a1', 'a2', 'c1']);
  });

  it('draws which skills to ask about when there are more than questions, in course order', () => {
    const skills = Array.from({ length: 15 }, (_, i) => skill(String.fromCharCode(97 + i), 3));
    const picked = pickJumpItems(skills, 10, seeded());
    expect(picked).toHaveLength(10);
    const letters = picked.map((id) => id[0]!);
    expect(new Set(letters).size).toBe(10);
    expect([...letters].sort()).toEqual(letters);
  });

  it('asks a skill in a different order on another draw', () => {
    const runs = new Set(Array.from({ length: 8 }, (_, i) => pickJumpItems([skill('a', 6)], 3, seeded(i + 2)).join()));
    expect(runs.size).toBeGreaterThan(1);
  });

  it('asks nothing when there is nothing to ask', () => {
    expect(pickJumpItems([], 10)).toEqual([]);
    expect(pickJumpItems([[], []], 10)).toEqual([]);
  });
});
