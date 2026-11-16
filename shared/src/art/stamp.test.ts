import { describe, expect, it } from 'vitest';
import {
  STAMP_GLOW,
  STAMP_GLOW_REACH,
  STAMP_NIGHT_GLOW,
  STAMP_SHAPE,
  STAMP_SHELF_GLOW,
  stampBox,
  stampOutline,
  stampPerforations,
  stampShapeFor,
  stampSize,
  stampSvg,
} from './stamp.js';

/** Every number written in a path, in order. */
const numbers = (d: string): number[] => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

describe('the stamp', () => {
  it('spaces a whole number of perforations evenly along an edge', () => {
    expect(stampPerforations(135, 13.5)).toEqual({ count: 10, step: 13.5 });
    const odd = stampPerforations(140, 13.5);
    expect(odd.count).toBe(10);
    expect(odd.step).toBe(14);
    // a very short edge still has two, or it would not read as a stamp
    expect(stampPerforations(10, 13.5).count).toBe(2);
  });

  it('draws one closed outline that never leaves its box', () => {
    const d = stampOutline(160, 200);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect(d.match(/M/g)).toHaveLength(1);
    for (const v of numbers(d)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(200);
    }
  });

  it('bites each edge once per perforation, and rounds the four corners', () => {
    // a whole number of steps each way, so the corner teeth are wide enough for their full rounding
    const d = stampOutline(162, 216);
    const across = stampPerforations(162, STAMP_SHAPE.pitch).count;
    const down = stampPerforations(216, STAMP_SHAPE.pitch).count;
    const bites = d.match(new RegExp(`A${STAMP_SHAPE.bite} ${STAMP_SHAPE.bite} 0 0 0 `, 'g')) ?? [];
    expect(bites).toHaveLength(2 * (across + down));
    expect(d.match(new RegExp(`A${STAMP_SHAPE.corner} ${STAMP_SHAPE.corner} 0 0 1 `, 'g'))).toHaveLength(4);
  });

  it('is the same outline every time, and a different one for a different size', () => {
    expect(stampOutline(120, 150)).toBe(stampOutline(120, 150));
    expect(stampOutline(120, 150)).not.toBe(stampOutline(121, 150));
  });

  it('keeps a tooth between two bites however large a bite is asked for', () => {
    const d = stampOutline(60, 60, { bite: 40, pitch: 20 });
    // three perforations of step 20: a bite is held to 8, leaving a tooth of 4
    expect(d).toContain('A8 8 0 0 0 ');
  });

  it('refuses a stamp with no size', () => {
    expect(() => stampOutline(0, 100)).toThrow(RangeError);
    expect(() => stampOutline(100, Number.NaN)).toThrow(RangeError);
  });

  it('draws the paper over its light, in a box that holds the reach of the light', () => {
    const svg = stampSvg({ width: 160, height: 200, paper: '#e8f2ff', glow: '#007df2' });
    const box = stampBox(160, 200);
    expect(box).toEqual({ width: 160 + STAMP_GLOW_REACH * 2, height: 200 + STAMP_GLOW_REACH * 2, inset: STAMP_GLOW_REACH });
    expect(svg).toContain(`viewBox="0 0 ${box.width} ${box.height}"`);
    expect(svg.match(/stroke="#007df2"/g)).toHaveLength(STAMP_GLOW.length);
    expect(svg.indexOf('fill="#e8f2ff"')).toBeGreaterThan(svg.lastIndexOf('stroke="#007df2"'));
    expect(svg).toContain('aria-hidden="true"');
  });

  it('draws no light at strength 0, and then takes no room for it', () => {
    const svg = stampSvg({ width: 160, height: 200, paper: '#e8f2ff', glow: '#007df2', strength: 0 });
    expect(svg).not.toContain('stroke=');
    expect(svg).toContain('viewBox="0 0 160 200"');
    expect(stampBox(160, 200, 0).inset).toBe(0);
  });

  it('reaches as far as half its widest stroke, and is brightest at the paper’s edge', () => {
    const widths = STAMP_GLOW.map((ring) => ring.width);
    expect(Math.max(...widths) / 2).toBe(STAMP_GLOW_REACH);
    // widest first, so each narrower stroke is laid over the wider ones
    expect([...widths].sort((a, b) => b - a)).toEqual(widths);
    // all of them overlap at the edge: together a little over half the colour, never the whole of it
    const atEdge = 1 - STAMP_GLOW.reduce((left, ring) => left * (1 - ring.opacity), 1);
    expect(atEdge).toBeGreaterThan(0.5);
    expect(atEdge).toBeLessThan(0.65);
  });

  it('gives off exactly the share of its light it is asked for, however faint', () => {
    const shown = (strength: number): number[] =>
      [...stampSvg({ width: 160, height: 200, paper: '#e8f2ff', glow: '#007df2', strength }).matchAll(/stroke-opacity="([\d.]+)"/g)].map((m) => Number(m[1]));
    // a stroke shows a few hundredths of the colour: written to the hundredth, a quiet stamp's light would be out by a quarter
    for (const strength of [1, STAMP_SHELF_GLOW, STAMP_NIGHT_GLOW, STAMP_SHELF_GLOW * STAMP_NIGHT_GLOW]) {
      const rings = shown(strength);
      expect(rings).toHaveLength(STAMP_GLOW.length);
      rings.forEach((opacity, i) => expect(Math.abs(opacity - STAMP_GLOW[i]!.opacity * strength), `strength ${strength}`).toBeLessThanOrEqual(0.0005));
    }
    // quieter among others than put forward, and quieter again by night, and never gone
    expect(STAMP_SHELF_GLOW).toBeLessThan(1);
    expect(STAMP_NIGHT_GLOW).toBeLessThan(1);
    expect(shown(STAMP_SHELF_GLOW * STAMP_NIGHT_GLOW).every((opacity) => opacity > 0)).toBe(true);
  });

  it('cuts the same stamp at any size: about thirteen bites across, whatever the width', () => {
    for (const width of [120, 173, 228, 420]) {
      const shape = stampShapeFor(width);
      const across = stampPerforations(width, shape.pitch).count;
      expect(across, `${width} wide`).toBeGreaterThanOrEqual(13);
      expect(across, `${width} wide`).toBeLessThanOrEqual(14);
      expect(shape.bite * 2).toBeLessThan(shape.pitch);
    }
  });
});

describe('a stamp that carries a picture over a name', () => {
  it('has a margin inside the perforations, a square picture, and a height that holds the words', () => {
    // a stamp on a phone's shelf, the stamp put forward, and the narrowest one drawn
    expect(stampSize(169)).toEqual({ pad: 18, art: 133, height: 225 });
    expect(stampSize(228, true)).toEqual({ pad: 24, art: 180, height: 296 });
    expect(stampSize(130)).toEqual({ pad: 14, art: 102, height: 190 });
  });

  it('is the same height at one width whatever is written on it, and taller put forward', () => {
    expect(stampSize(170)).toEqual(stampSize(170));
    expect(stampSize(228, true).height).toBeGreaterThan(stampSize(228).height);
    expect(stampSize(228, true).art).toBe(stampSize(228).art);
  });

  it('grows its room for the words with the reader’s text size, and never below the usual', () => {
    expect(stampSize(170, false, 1.3).height).toBeGreaterThan(stampSize(170).height);
    expect(stampSize(170, false, 0.8).height).toBe(stampSize(170).height);
    // the picture stays as it is: only the words asked for more
    expect(stampSize(170, false, 1.3).art).toBe(stampSize(170).art);
  });

  it('keeps a margin on the narrowest stamp, and never gives the picture less than nothing', () => {
    expect(stampSize(100).pad).toBe(14);
    expect(stampSize(20).art).toBe(0);
  });
});
