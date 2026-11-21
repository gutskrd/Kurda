import { describe, expect, it } from 'vitest';
import { mapMarkup, mapPath } from '../index.js';

const same = (x: number, y: number): readonly [number, number] => [x, y];
const shift = (x: number, y: number): readonly [number, number] => [x + 10, y * 2];
/** Every point a path's data names, as pairs. */
const points = (d: string): number[][] => (d.match(/-?[\d.]+,-?[\d.]+/g) ?? []).map((p) => p.split(',').map(Number));

describe('Bending a drawing through a map of the plane', () => {
  it('redraws every kind of step a path takes, relative or absolute, as cubic curves through the mapped points', () => {
    const d = mapPath('M10,10l10,0h5v5c1,1 2,2 3,3s4,4 5,5q1,1 2,2t3,3L10,40z', shift);
    expect(d.startsWith('M20,20C')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect(d).not.toMatch(/[lhvsqtLHVSQTA]/);
    // The corners the steps reach, in turn, mapped.
    const ends = d.slice(1, -1).split('C').slice(1).map((c) => points(c)[2]!);
    expect(ends.slice(0, 3)).toEqual([
      [30, 20],
      [35, 20],
      [35, 30],
    ]);
    expect(ends.at(-1)).toEqual([20, 20]);
  });

  it('turns arcs and ellipses into curves that stay on them', () => {
    const d = mapPath('M0,0a20,10 0 1 0 40,0a20,10 0 1 0 -40,0z', same);
    for (const [x, y] of points(d).filter((_, i) => i % 3 === 0)) expect(((x! - 20) / 20) ** 2 + (y! / 10) ** 2).toBeCloseTo(1, 1);
    const ellipse = mapMarkup('<ellipse cx="50" cy="40" rx="20" ry="10" fill="red" transform="rotate(90 50 40)"/>', same);
    expect(ellipse).toMatch(/^<path d="M[^"]+Z" fill="red"\/>$/);
    // Turned a quarter about its middle, it now stands upright.
    const ys = points(ellipse).map((p) => p[1]!);
    expect(Math.max(...ys)).toBeCloseTo(60, 0);
    expect(Math.min(...ys)).toBeCloseTo(20, 0);
  });

  it('moves gradients laid in canvas units with the drawing, leaves box-relative ones alone, and refuses what it cannot bend true', () => {
    const out = mapMarkup(
      '<radialGradient id="a" gradientUnits="userSpaceOnUse" cx="10" cy="10" r="5"></radialGradient><radialGradient id="b" cx="0.5" cy="0.5" r="0.5"></radialGradient>',
      shift,
    );
    expect(out).toContain('id="a" gradientUnits="userSpaceOnUse" cx="20" cy="20"');
    expect(out).toContain('<radialGradient id="b" cx="0.5" cy="0.5" r="0.5">');
    expect(() => mapMarkup('<g transform="scale(2)"><path d="M0,0L1,1"/></g>', same)).toThrow();
    expect(() => mapMarkup('<path d="M0,0L1,1" transform="scale(2)"/>', same)).toThrow();
  });
});
