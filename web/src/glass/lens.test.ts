import { describe, expect, it } from 'vitest';
import { BEZEL, lensMap } from './lens';

/** The red and green of the map at a point in CSS pixels: 128 is no shift, above it looks right or down. */
function at(map: ReturnType<typeof lensMap>, x: number, y: number, dpr = 1): [number, number] {
  const i = (Math.floor(y * dpr) * map.width + Math.floor(x * dpr)) * 4;
  return [map.data[i] ?? -1, map.data[i + 1] ?? -1];
}

describe('lensMap', () => {
  const bar = { width: 358, height: 64, radius: 32 };
  const map = lensMap(bar);

  it('leaves the flat middle and the corners outside the shape as they are', () => {
    expect(at(map, 179, 32)).toEqual([128, 128]);
    expect(at(map, BEZEL + 40, 32)).toEqual([128, 128]);
    expect(at(map, 1, 1)).toEqual([128, 128]);
  });

  it('bends inward at every rim, as thick glass with a rounded edge does', () => {
    const [topX, topY] = at(map, 179, 2);
    expect(topY).toBeGreaterThan(128);
    expect(Math.abs(topX - 128)).toBeLessThanOrEqual(1);
    expect(at(map, 179, 61)[1]).toBeLessThan(128);
    expect(at(map, 2, 32)[0]).toBeGreaterThan(128);
    expect(at(map, 355, 32)[0]).toBeLessThan(128);
  });

  it('is the same at either end, and bends hardest nearest the edge', () => {
    const left = at(map, 3, 32)[0] - 128;
    const right = 128 - at(map, 354, 32)[0];
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
    expect(at(map, 179, 1)[1]).toBeGreaterThan(at(map, 179, 10)[1]);
    expect(map.scale).toBeGreaterThan(0);
  });

  it('draws at the screen’s own density, every pixel opaque', () => {
    const sharp = lensMap({ width: 44, height: 44, radius: 22 }, 3);
    expect([sharp.width, sharp.height]).toEqual([132, 132]);
    expect(sharp.data.length).toBe(132 * 132 * 4);
    for (let i = 3; i < sharp.data.length; i += 4) if (sharp.data[i] !== 255) throw new Error(`alpha at ${i}`);
  });
});
