import { describe, expect, it } from 'vitest';
import { CHASE, CHASE_VIEW, chaseArt, chaseFrame, mapMarkup } from '../index.js';

describe('Hevalo chasing the winged apple', () => {
  const art = chaseArt({ ground: '#ddd5c8', idPrefix: 'test' });

  it('draws one stride in its frames, each different, well-formed and under its own ids', () => {
    expect(art.frames).toHaveLength(CHASE.frames);
    expect(new Set(art.frames).size).toBe(CHASE.frames);
    const ids = art.frames.flatMap((f) => [...f.matchAll(/id="([^"]+)"/g)].map((m) => m[1]!));
    expect(ids.every((id) => id.startsWith('test-'))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    for (const markup of [...art.frames, art.ground, art.apple, art.nearWing, art.farWing]) {
      expect(markup).toMatch(/^<svg [^>]*viewBox="30 -66 310 226"/);
      expect(markup).not.toMatch(/NaN|Infinity|<image|<filter|<mask|<pattern|<style|<text|<use|<script|data:|https?:\/\/(?!www\.w3\.org)/i);
    }
  });

  it('keeps him and his dust inside the picture through the whole stride', () => {
    for (let i = 0; i < CHASE.frames; i++) {
      // Every shape as cubic curves through points in the picture's own units.
      const drawn = mapMarkup(chaseFrame(i, 'p'), (x, y) => [x, y]);
      const points = [...drawn.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])]);
      expect(points.length).toBeGreaterThan(100);
      for (const [x, y] of points) {
        expect(x).toBeGreaterThanOrEqual(CHASE_VIEW.x - 20);
        expect(x).toBeLessThanOrEqual(CHASE_VIEW.x + CHASE_VIEW.w);
        expect(y).toBeGreaterThanOrEqual(CHASE_VIEW.y);
        expect(y).toBeLessThanOrEqual(CHASE_VIEW.y + CHASE_VIEW.h);
      }
    }
  });

  it('times a stride, a wingbeat and the apple’s drift so each loops cleanly', () => {
    expect(CHASE.strideMs / CHASE.frames).toBeGreaterThanOrEqual(1000 / 60);
    expect(CHASE.beatDown).toBeGreaterThan(0);
    expect(CHASE.beatDown).toBeLessThan(1);
    expect(CHASE.beatFrom).toBeLessThan(CHASE.beatTo);
  });
});
