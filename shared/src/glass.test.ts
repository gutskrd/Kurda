import { describe, expect, it } from 'vitest';
import { GLASS, bendAt, bendImage, glassField, shineImage } from './glass.js';

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
