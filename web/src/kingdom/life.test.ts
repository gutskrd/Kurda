import { describe, expect, it } from 'vitest';
import { KINGDOM_BUILDINGS, kingdomLife, type KingdomBuilding, type KingdomLevel } from '@kurda/shared';
import { lifeMarkup } from './life';

const levels = Object.fromEntries(KINGDOM_BUILDINGS.map((b) => [b, 3])) as Record<KingdomBuilding, KingdomLevel>;

describe('the village’s life as markup', () => {
  it('writes keyframes for every loop its markup names, so nothing stands still that should move', () => {
    const life = lifeMarkup(kingdomLife(levels), () => '<svg></svg>');
    const named = new Set(life.actors.flatMap((a) => [...a.html.matchAll(/animation:(kg\d+) /g)].map((m) => m[1]!)));
    expect(named.size).toBeGreaterThan(100);
    for (const name of named) expect(life.css, name).toContain(`@keyframes ${name}{`);
  });

  it('runs every loop on the village’s one clock, and marks what a tap answers', () => {
    const life = lifeMarkup(kingdomLife(levels), () => '');
    expect(life.actors.every((a) => !a.html.includes('animation:') || a.html.includes('calc(var(--kg-age,0ms) * -1)'))).toBe(true);
    const deer = life.actors.find((a) => a.id === 'hevalo')!;
    expect(deer.tap).toBe('deer');
    expect(deer.html).toContain('data-role="happy"');
    expect(deer.reach.w).toBeGreaterThan(100);
    expect(life.actors.find((a) => a.id === 'waterfall')!.html).toContain('overflow:hidden');
  });
});
