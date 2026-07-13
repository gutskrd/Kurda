import { describe, expect, it } from 'vitest';
import { assignVariant, bucketFraction, type Variant } from './bucketing.js';

const AB: Variant[] = [
  { key: 'control', weight: 50 },
  { key: 'variant_b', weight: 50 },
];

describe('bucketFraction', () => {
  it('is stable for the same pair and in [0,1)', () => {
    const a = bucketFraction('user-1', 'exp');
    expect(a).toBe(bucketFraction('user-1', 'exp')); // deterministic
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
  });

  it('differs across experiments for the same user', () => {
    expect(bucketFraction('user-1', 'exp_a')).not.toBe(bucketFraction('user-1', 'exp_b'));
  });
});

describe('assignVariant', () => {
  it('is deterministic — same variant every time (across devices/reinstalls)', () => {
    const first = assignVariant('user-42', 'daily_goal_default', AB);
    for (let i = 0; i < 5; i++) expect(assignVariant('user-42', 'daily_goal_default', AB)).toBe(first);
  });

  it('splits a large population roughly by weight', () => {
    const counts: Record<string, number> = { control: 0, variant_b: 0 };
    const N = 10_000;
    for (let i = 0; i < N; i++) counts[assignVariant(`u${i}`, 'exp', AB)]! += 1;
    // 50/50 split, allow generous tolerance
    expect(counts.control! / N).toBeGreaterThan(0.45);
    expect(counts.control! / N).toBeLessThan(0.55);
  });

  it('honors uneven weights', () => {
    const weighted: Variant[] = [
      { key: 'control', weight: 90 },
      { key: 'variant_b', weight: 10 },
    ];
    let b = 0;
    const N = 10_000;
    for (let i = 0; i < N; i++) if (assignVariant(`u${i}`, 'w', weighted) === 'variant_b') b += 1;
    expect(b / N).toBeGreaterThan(0.05);
    expect(b / N).toBeLessThan(0.15);
  });

  it('falls back to control when no variant has positive weight (kill switch)', () => {
    expect(assignVariant('user-1', 'exp', [])).toBe('control');
    expect(assignVariant('user-1', 'exp', [{ key: 'x', weight: 0 }])).toBe('control');
  });
});
