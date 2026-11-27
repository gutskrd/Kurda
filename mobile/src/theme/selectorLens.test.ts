// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
import { planSwitch, retarget } from '@kurda/shared';
import { piecesFor, sampleMove } from './selectorLens';

describe('a selector on the phone', () => {
  it('samples a move frame by frame until it rests, the lens up and the tint out on the way', () => {
    const { frames, ms } = sampleMove(planSwitch(0, 2, 0), 0);
    expect(ms).toBeGreaterThan(300);
    expect(ms).toBeLessThan(560);
    expect(frames[0]!.tint).toBe(1);
    expect(Math.max(...frames.map((f) => f.lens))).toBe(1);
    expect(frames.at(-1)).toMatchObject({ phase: 'rest', at: 2, tint: 1, lens: 0 });
  });

  it('places the capsule round its tab at rest and keeps a stretched lens within a hair of the bar’s ends', () => {
    const [rest] = piecesFor([{ phase: 'rest', at: 1, velocity: 0, scale: 1, stretch: 0, tint: 1, lens: 0, squash: 1, lead: 0, magnify: 1 }], 80, 52, 320);
    expect(rest).toMatchObject({ left: 80, endLeft: 108, lensScale: 1, copyX: -80, copyY: 0, copyScaleX: 1, copyScaleY: 1 });
    const [edge] = piecesFor([{ phase: 'moving', at: 3, velocity: 0, scale: 1.12, stretch: 0.45, tint: 0, lens: 1, squash: 1, lead: 0, magnify: 1.3 }], 80, 52, 320);
    expect(edge!.left + 80 * edge!.lensScale).toBeCloseTo(322, 5);
  });

  it('moves the copy inside the lens so the row shows magnified about the lens’s middle, frame by frame', () => {
    const { frames } = sampleMove(planSwitch(0, 2, 0), 0);
    for (const [i, p] of piecesFor(frames, 80, 52, 320).entries()) {
      const f = frames[i]!;
      // A point of the row at the lens's middle stays there; one 10 points right of it lands 10 × magnify right.
      const middle = p.left + (80 * p.lensScale) / 2;
      const seen = (x: number) => p.left + p.lensScale * (p.copyX + p.copyScaleX * x);
      expect(seen(middle)).toBeCloseTo(middle, 6);
      expect(seen(middle + 10) - middle).toBeCloseTo(10 * f.magnify, 6);
    }
  });

  it('starts a retargeted run where the one before it was', () => {
    const first = planSwitch(0, 3, 0);
    const { frames } = sampleMove(first, 0);
    const next = retarget(first, 1, 100);
    expect(sampleMove(next, 100).frames[0]!.at).toBeCloseTo(frames[6]!.at, 2);
  });
});
