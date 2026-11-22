import { beforeAll, describe, expect, it } from 'vitest';
import CanvasKitInit, { type CanvasKit, type RuntimeEffect } from 'canvaskit-wasm';
import { GLASS } from '@kurda/shared';

// The Android glass shader (modules/hevalo-glass), compiled and run in Skia, the engine Android draws it with.

/** Node's file system, which this workspace's types do not describe: the shader is read from its Kotlin source. */
interface Files {
  readFileSync(path: string, encoding: 'utf8'): string;
}
const FILES = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ FILES)) as Files;
const source = readFileSync(new URL('../../modules/hevalo-glass/android/src/main/java/app/hevalo/glass/GlassShader.kt', import.meta.url).pathname, 'utf8');
const sksl = source.slice(source.indexOf('"""') + 3, source.lastIndexOf('"""'));

let CK: CanvasKit;
let effect: RuntimeEffect;
const errors: string[] = [];

beforeAll(async () => {
  CK = await CanvasKitInit();
  effect = CK.RuntimeEffect.Make(sksl, (e) => errors.push(e))!;
});

/** The shader drawn over stripes the colour of each column, so a bend shows up as a column's colour moved. */
function draw(width: number, height: number, radius: number): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      pixels[i] = Math.round((255 * x) / (width - 1));
      pixels[i + 1] = Math.round((255 * y) / (height - 1));
      pixels[i + 2] = 0;
      pixels[i + 3] = 255;
    }
  }
  const info = { width, height, alphaType: CK.AlphaType.Unpremul, colorType: CK.ColorType.RGBA_8888, colorSpace: CK.ColorSpace.SRGB };
  const backdrop = CK.MakeImage(info, pixels, width * 4)!;
  const child = backdrop.makeShaderOptions(CK.TileMode.Clamp, CK.TileMode.Clamp, CK.FilterMode.Nearest, CK.MipmapMode.None);
  const density = 1;
  // size, radius, bezel, thickness, density, tint, optics: neutral optics and a black tint, which can only darken, so
  // a colour that rises at the rim can only have been bent there.
  const shader = effect.makeShaderWithChildren(
    [width, height, radius, Math.min(GLASS.bezel, Math.min(width, height) / 2), GLASS.thickness, density, 0, 0, 0, 1, 1],
    [child],
  );
  const surface = CK.MakeSurface(width, height)!;
  const paint = new CK.Paint();
  paint.setShader(shader);
  surface.getCanvas().clear(CK.TRANSPARENT);
  surface.getCanvas().drawRect(CK.LTRBRect(0, 0, width, height), paint);
  const out = surface.getCanvas().readPixels(0, 0, { ...info, alphaType: CK.AlphaType.Unpremul })!;
  surface.delete();
  return out as Uint8Array;
}

describe('the Android glass shader', () => {
  it('compiles in Skia', () => {
    expect(errors).toEqual([]);
    expect(effect).toBeTruthy();
    expect(effect.getUniformCount()).toBe(7);
  });

  it('keeps the optics the website uses', () => {
    const constant = (name: string) => Number(new RegExp(`const float ${name} = ([\\d.]+);`).exec(sksl)?.[1]);
    expect(constant('IOR')).toBe(GLASS.ior);
    expect(constant('DISPERSION')).toBe(GLASS.dispersion);
    expect(constant('VEIL_RIM')).toBe(GLASS.veil.rim);
    expect(constant('VEIL_MIDDLE')).toBe(GLASS.veil.middle);
    expect(constant('VEIL_REACH')).toBe(GLASS.veil.reach);
    expect(sksl).toContain(`const float2 LIGHT = float2(${GLASS.light[0]}, ${GLASS.light[1]});`);
  });

  it('is clear outside its rounded corners and bends inward at the rim', () => {
    const w = 200;
    const h = 64;
    const px = draw(w, h, 32);
    const at = (x: number, y: number) => Array.from(px.slice((y * w + x) * 4, (y * w + x) * 4 + 4));
    // A corner outside the rounded shape is left transparent.
    expect(at(1, 1)[3]).toBe(0);
    // On the left rim the glass shows what lies further right, so red there is above the stripe's own.
    const ownRed = Math.round((255 * 3) / (w - 1));
    expect(at(3, 32)[0]).toBeGreaterThan(ownRed + 10);
    // On the top rim it shows what lies further down, so green there is above the stripe's own.
    const ownGreen = Math.round((255 * 2) / (h - 1));
    expect(at(100, 2)[1]).toBeGreaterThan(ownGreen + 10);
    // The flat middle shows the page unbent, under the deepest tint.
    const mid = Math.round((255 * 100) / (w - 1)) * (1 - GLASS.veil.middle);
    expect(Math.abs((at(100, 32)[0] ?? 0) - mid)).toBeLessThanOrEqual(2);
  });
});
