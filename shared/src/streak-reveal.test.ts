import { describe, expect, it } from 'vitest';
import { STREAK_LEAVE_MS, STREAK_LEAVE_POSE, smoothPoses, streakReveal } from './streak-reveal.js';

describe('the kept streak’s card coming alive', () => {
  const plan = streakReveal(false);

  it('rests on yesterday long enough to be read as yesterday before the medal moves', () => {
    expect(plan.medalAtMs).toBeGreaterThanOrEqual(400);
    expect(plan.travel).toBe(true);
  });

  it('gathers the medal, hops it and lands it: flat first, tall off the card, and a little flat as it lands', () => {
    const { poses } = plan;
    expect(poses[0]).toEqual({ at: 0, sx: 1, sy: 1, lift: 0 });
    expect(poses.at(-1)).toEqual({ at: 1, sx: 1, sy: 1, lift: 0 });
    // the moments of the turn come in order
    for (let i = 1; i < poses.length; i++) expect(poses[i]!.at).toBeGreaterThan(poses[i - 1]!.at);
    const flattest = poses.reduce((a, b) => (b.sy < a.sy ? b : a));
    const highest = poses.reduce((a, b) => (b.lift < a.lift ? b : a));
    // it squashes on the card before it leaves it
    expect(flattest.lift).toBe(0);
    expect(flattest.at).toBeLessThan(highest.at);
    expect(flattest.sx).toBeGreaterThan(1);
    // off the card it is taller than it is wide, or as it was
    expect(highest.lift).toBeLessThan(-0.3);
    const rising = poses.find((p) => p.lift < 0)!;
    expect(rising.sy).toBeGreaterThan(1);
    expect(rising.sx).toBeLessThan(1);
    // and it gives a little as it lands
    const landing = poses[poses.length - 2]!;
    expect(landing.lift).toBe(0);
    expect(landing.sy).toBeLessThan(1);
    // about as much medal all through: never a third bigger or smaller than it is
    for (const p of poses) {
      expect(p.sx * p.sy).toBeGreaterThan(0.5);
      expect(p.sx * p.sy).toBeLessThan(1.1);
    }
  });

  it('turns to gold while the medal is off the card, and bursts out of it there', () => {
    const share = (ms: number): number => (ms - plan.medalAtMs) / plan.medalMs;
    const up = plan.poses.filter((p) => p.lift < 0);
    expect(share(plan.lightAtMs)).toBeGreaterThan(up[0]!.at - 0.1);
    expect(share(plan.burstAtMs)).toBeGreaterThanOrEqual(up[0]!.at);
    expect(share(plan.burstAtMs)).toBeLessThanOrEqual(up.at(-1)!.at);
    expect(plan.lightAtMs).toBeLessThanOrEqual(plan.burstAtMs);
  });

  it('brings the rest in one thing after another, each after the last, and the way on last', () => {
    const order = [plan.medalAtMs, plan.burstAtMs, plan.countAtMs, plan.wordsAtMs, plan.weekAtMs, plan.afterAtMs, plan.onwardAtMs, plan.overMs];
    for (let i = 1; i < order.length; i++) expect(order[i]!).toBeGreaterThan(order[i - 1]!);
    // the words wait for the medal to stand
    expect(plan.wordsAtMs).toBeGreaterThanOrEqual(plan.medalAtMs + plan.medalMs);
    // the whole week is in before what stands under the card
    expect(plan.afterAtMs).toBeGreaterThan(plan.weekAtMs + 6 * plan.dayStepMs);
  });

  it('keeps the way on within three seconds: a moment, not a wait', () => {
    expect(plan.onwardAtMs).toBeLessThan(3000);
  });

  it('only cross-fades for a reader who asked for less motion, with everything else there at once', () => {
    const still = streakReveal(true);
    expect(still.travel).toBe(false);
    expect(still.poses).toEqual([]);
    expect([still.wordsAtMs, still.weekAtMs, still.afterAtMs, still.onwardAtMs, still.dayStepMs]).toEqual([0, 0, 0, 0, 0]);
    expect(still.overMs).toBeLessThan(500);
  });

  it('draws the turn finely for a driver that joins poses with straight lines: every pose kept, eased between, and in order', () => {
    const fine = smoothPoses(plan.poses, 4);
    expect(fine).toHaveLength((plan.poses.length - 1) * 4 + 1);
    // every pose of the turn is still one of them, where it was
    plan.poses.forEach((p, i) => {
      const kept = fine[i * 4]!;
      expect(kept.at).toBeCloseTo(p.at, 9);
      expect([kept.sx, kept.sy, kept.lift].map((n) => Number(n.toFixed(9)))).toEqual([p.sx, p.sy, p.lift]);
    });
    for (let i = 1; i < fine.length; i++) expect(fine[i]!.at).toBeGreaterThan(fine[i - 1]!.at);
    // slow away from a pose: a quarter of the way in time is less than a quarter of the way there
    const [a, b] = [plan.poses[1]!, plan.poses[2]!];
    expect(Math.abs(fine[5]!.sy - a.sy)).toBeLessThan(Math.abs(b.sy - a.sy) / 4);
    // and nothing in between goes past the poses it lies between
    for (let i = 0; i < plan.poses.length - 1; i++) {
      const [from, to] = [plan.poses[i]!, plan.poses[i + 1]!];
      for (const p of fine.slice(i * 4, i * 4 + 5)) {
        expect(p.sy).toBeGreaterThanOrEqual(Math.min(from.sy, to.sy) - 1e-9);
        expect(p.sy).toBeLessThanOrEqual(Math.max(from.sy, to.sy) + 1e-9);
      }
    }
    expect(smoothPoses([])).toEqual([]);
  });

  it('leaves fast, the medal gathered flat and small', () => {
    expect(STREAK_LEAVE_MS).toBeLessThanOrEqual(250);
    expect(STREAK_LEAVE_POSE.sy).toBeLessThan(STREAK_LEAVE_POSE.sx);
    expect(STREAK_LEAVE_POSE.scale).toBeLessThan(1);
  });
});
