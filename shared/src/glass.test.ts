import { describe, expect, it } from 'vitest';
import { GLASS, bendAt, bendImage, glassField, lensBendAt, shineImage } from './glass.js';
import { SELECTOR_LENS } from './selector-lens.js';

/** The red and green of the bend image at a point in points: 128 is none, above it looks right or down. */
function at(field: ReturnType<typeof glassField>, x: number, y: number, dpr = 1): [number, number] {
  const img = bendImage(field);
  const i = (Math.floor(y * dpr) * field.width + Math.floor(x * dpr)) * 4;
  return [img[i] ?? -1, img[i + 1] ?? -1];
}

describe('glassField', () => {
  const bar = { width: 358, height: 64, radius: 32 };
  const field = glassField(bar);

  it('leaves the flat middle and the corners outside the shape as they are', () => {
    expect(at(field, 179, 32)).toEqual([128, 128]);
    expect(at(field, GLASS.bezel + 40, 32)).toEqual([128, 128]);
    expect(at(field, 1, 1)).toEqual([128, 128]);
  });

  it('bends inward at every rim, as thick glass with a rounded edge does', () => {
    const [topX, topY] = at(field, 179, 2);
    expect(topY).toBeGreaterThan(128);
    expect(Math.abs(topX - 128)).toBeLessThanOrEqual(1);
    expect(at(field, 179, 61)[1]).toBeLessThan(128);
    expect(at(field, 2, 32)[0]).toBeGreaterThan(128);
    expect(at(field, 355, 32)[0]).toBeLessThan(128);
  });

  it('is the same at either end, and bends hardest nearest the edge', () => {
    expect(Math.abs(at(field, 3, 32)[0] - 128 - (128 - at(field, 354, 32)[0]))).toBeLessThanOrEqual(1);
    expect(bendAt(0.05, GLASS.bezel)).toBeGreaterThan(bendAt(0.5, GLASS.bezel));
    expect(bendAt(1, GLASS.bezel)).toBe(0);
    expect(field.reach).toBeGreaterThan(8);
  });

  it('lights the rim brightest where it faces up, and leaves the middle clear', () => {
    const shine = shineImage(field);
    const alpha = (x: number, y: number) => shine[(y * field.width + x) * 4 + 3] ?? 0;
    expect(alpha(179, 0)).toBeGreaterThan(alpha(179, 63));
    expect(alpha(179, 63)).toBeGreaterThan(0);
    expect(alpha(179, 32)).toBe(0);
  });

  it('draws at the screen’s own density, every pixel of the bend opaque', () => {
    const disc = glassField({ width: 44, height: 44, radius: 22 }, 3);
    expect([disc.width, disc.height]).toEqual([132, 132]);
    const img = bendImage(disc);
    for (let i = 3; i < img.length; i += 4) if (img[i] !== 255) throw new Error(`alpha at ${i}`);
  });
});

describe('a selector lens’s rim', () => {
  const { bezel, reach, split } = SELECTOR_LENS.rim;

  it('bends most at the edge and not at all past the rim', () => {
    expect(lensBendAt(0, reach)).toBe(reach);
    expect(lensBendAt(0.5, reach)).toBeLessThan(reach / 2);
    expect(lensBendAt(1, reach)).toBe(0);
  });

  it('never folds what lies near its edge back on itself, even in red, which bends furthest', () => {
    const lens = glassField({ width: 87, height: 52, radius: 26 }, 3, { bezel, reach });
    // Down the middle from the bottom edge up, where a name sits: each pixel looks further in than the one below it.
    const x = Math.floor(lens.width / 2);
    let seen = -Infinity;
    for (let y = lens.height - 1; y >= lens.height / 2; y--) {
      const up = -(lens.bend[(y * lens.width + x) * 2 + 1] ?? 0) * (1 + split) * 3;
      const looks = lens.height - 1 - y + up;
      expect(looks).toBeGreaterThan(seen);
      seen = looks;
    }
    expect(lens.reach).toBeCloseTo(reach, 0);
  });
});
