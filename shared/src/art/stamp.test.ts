import { describe, expect, it } from 'vitest';
import { HUE_NAMES, hueSteps } from '../hues.js';
import { contrastRatio, luminance } from '../letter-paper.js';
import {
  STAMP_GLOW,
  STAMP_GLOW_REACH,
  STAMP_MEANING_INK,
  STAMP_NIGHT_GLOW,
  STAMP_NIGHT_REACH,
  STAMP_SHAPE,
  STAMP_SHELF_GLOW,
  stampBox,
  stampGlow,
  stampLook,
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

describe('a stamp’s light at a shorter reach', () => {
  it('reaches exactly as far as it is asked, and takes only that much room', () => {
    const rings = stampGlow(STAMP_NIGHT_REACH);
    expect(rings).toHaveLength(STAMP_GLOW.length);
    expect(Math.max(...rings.map((ring) => ring.width)) / 2).toBe(STAMP_NIGHT_REACH);
    // the same light, drawn over a shorter distance: as strong at the edge, gone sooner
    rings.forEach((ring, i) => expect(ring.opacity).toBe(STAMP_GLOW[i]!.opacity));
    expect(stampBox(160, 200, 1, STAMP_NIGHT_REACH).inset).toBe(STAMP_NIGHT_REACH);
    const svg = stampSvg({ width: 160, height: 200, paper: '#e8f2ff', glow: '#7ab4fe', reach: STAMP_NIGHT_REACH });
    expect(svg).toContain(`viewBox="0 0 ${160 + STAMP_NIGHT_REACH * 2} ${200 + STAMP_NIGHT_REACH * 2}"`);
    expect(svg).toContain(`stroke-width="${STAMP_NIGHT_REACH * 2}"`);
    expect(svg).not.toContain(`stroke-width="${STAMP_GLOW_REACH * 2}"`);
  });

  it('is the day’s full reach when nothing else is asked', () => {
    expect(stampGlow()).toEqual(STAMP_GLOW);
    expect(stampBox(160, 200)).toEqual(stampBox(160, 200, 1, STAMP_GLOW_REACH));
  });
});

describe('what a game’s stamp is printed in', () => {
  it('is the hue’s palest step and its deep shade by day, with the long light it always had', () => {
    for (const hue of HUE_NAMES) {
      const { tint, base, deep } = hueSteps('light', hue);
      expect(stampLook('light', hue, true)).toMatchObject({ paper: tint, ink: deep, glow: base, reach: STAMP_GLOW_REACH, strength: 1 });
      expect(stampLook('light', hue).strength).toBe(STAMP_SHELF_GLOW);
    }
  });

  /*
   * A stamp is paper, and paper on a dark table stays light. It used to take
   * the night's own ground for its paper, a dark fill in its hue that the
   * perforations were lost against.
   */
  it('stays light paper by night: between the day’s tint and its wash, never the night’s dark ground', () => {
    for (const hue of HUE_NAMES) {
      const day = hueSteps('light', hue);
      const { paper } = stampLook('dark', hue);
      expect(luminance(paper), hue).toBeLessThan(luminance(day.tint));
      expect(luminance(paper), hue).toBeGreaterThan(luminance(day.wash));
      // as far from the night's own ground as the day's paper is from the day's page, near enough
      expect(contrastRatio(paper, hueSteps('dark', hue).tint), hue).toBeGreaterThan(8);
    }
  });

  it('writes the name at 7:1 or better and what it means at 4.5:1 or better on its paper, by day and by night', () => {
    for (const scheme of ['light', 'dark'] as const) {
      for (const hue of HUE_NAMES) {
        const look = stampLook(scheme, hue);
        expect(contrastRatio(look.ink, look.paper), `${scheme} ${hue} name`).toBeGreaterThanOrEqual(7);
        expect(contrastRatio(look.inkSoft, look.paper), `${scheme} ${hue} meaning`).toBeGreaterThanOrEqual(4.5);
        // a step quieter than the name, and still the name's own colour
        expect(contrastRatio(look.inkSoft, look.paper)).toBeLessThan(contrastRatio(look.ink, look.paper));
        expect(STAMP_MEANING_INK).toBeGreaterThan(0.5);
      }
    }
  });

  it('gives off a short, faint halo by night in the night’s own hue, where the day’s long glow would be a fog', () => {
    for (const hue of HUE_NAMES) {
      for (const large of [true, false]) {
        const day = stampLook('light', hue, large);
        const night = stampLook('dark', hue, large);
        expect(night.reach).toBeLessThan(day.reach);
        expect(night.strength).toBeCloseTo(day.strength * STAMP_NIGHT_GLOW, 6);
        expect(night.glow).toBe(hueSteps('dark', hue).base);
      }
    }
  });
});
