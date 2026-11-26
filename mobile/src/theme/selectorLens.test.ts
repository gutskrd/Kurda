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
    const [rest] = piecesFor([{ phase: 'rest', at: 1, velocity: 0, scale: 1, stretch: 0, tint: 1, lens: 0 }], 80, 52, 320);
    expect(rest).toMatchObject({ left: 80, endLeft: 108, lensScale: 1 });
    const [edge] = piecesFor([{ phase: 'moving', at: 3, velocity: 0, scale: 1.12, stretch: 0.45, tint: 0, lens: 1 }], 80, 52, 320);
    expect(edge!.left + 80 * edge!.lensScale).toBeCloseTo(322, 5);
  });

  it('starts a retargeted run where the one before it was', () => {
    const first = planSwitch(0, 3, 0);
    const { frames } = sampleMove(first, 0);
    const next = retarget(first, 1, 100);
    expect(sampleMove(next, 100).frames[0]!.at).toBeCloseTo(frames[6]!.at, 2);
  });
});
