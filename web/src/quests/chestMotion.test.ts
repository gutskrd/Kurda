import { describe, expect, it } from 'vitest';
import { CHEST_FOOT, CHEST_HOP_SEAM, CHEST_KNOCK, CHEST_KNOCK_LIFT, chestDrawing } from '@kurda/shared';

/*
 * The page plays the chest's knock and seam light from keyframes written into quests.css, so they are checked here
 * against the shared timing the phone reads, along with the points the parts turn about. The stylesheet is read from
 * disk, since an imported stylesheet arrives empty in tests.
 */
interface FileSystem {
  readFileSync(file: URL, encoding: 'utf8'): string;
}
const fileSystem = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ fileSystem)) as FileSystem;
// beside this file, wherever the suite is run from
const here = import.meta.url;
const css = readFileSync(new URL('quests.css', here), 'utf8');

/** A keyframes rule's frames: each percentage with the declarations under it. */
function keyframes(name: string): { at: number; body: string }[] {
  const start = css.indexOf(`@keyframes ${name} {`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  let depth = 0;
  let end = start;
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) {
      end = i;
      break;
    }
  }
  const block = css.slice(css.indexOf('{', start) + 1, end);
  return [...block.matchAll(/([\d.%,\s]+)\{([^}]*)\}/g)].flatMap((m) =>
    m[1]!
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => ({ at: Math.round(Number.parseFloat(p) * 10) / 1000, body: m[2]!.trim() })),
  );
}
const number = (body: string, pattern: RegExp): number => Number.parseFloat(pattern.exec(body)?.[1] ?? 'NaN');

describe('the chest’s motion on the page', () => {
  it('knocks frame for frame as the shared knock: the lid’s lift, the seam’s light and the box’s squat', () => {
    const lid = keyframes('chest-knock-lid');
    const seam = keyframes('chest-knock-seam');
    const body = keyframes('chest-knock-body');
    for (const frames of [lid, seam, body]) expect(frames.map((f) => f.at)).toEqual(CHEST_KNOCK.map((f) => f.at).map((at) => Math.round(at * 1000) / 1000));
    CHEST_KNOCK.forEach((f, i) => {
      const l = lid[i]!.body;
      if (f.lid === 0) expect(l).toBe('transform: none;');
      else {
        expect(number(l, /rotate\((-?[\d.]+)deg\)/)).toBeCloseTo(f.lid * CHEST_KNOCK_LIFT.deg, 2);
        expect(number(l, /translateY\((-?[\d.]+)px\)/)).toBeCloseTo(-f.lid * CHEST_KNOCK_LIFT.rise, 2);
      }
      expect(number(seam[i]!.body, /opacity:\s*([\d.]+)/)).toBeCloseTo(f.seam, 2);
      const b = body[i]!.body;
      if (f.wide === 1 && f.tall === 1) expect(b).toBe('transform: none;');
      else {
        expect(number(b, /scale\(([\d.]+),/)).toBeCloseTo(f.wide, 3);
        expect(number(b, /scale\([\d.]+,\s*([\d.]+)\)/)).toBeCloseTo(f.tall, 3);
      }
    });
  });

  it('lights the seam through the opening as the shared hop does', () => {
    const frames = keyframes('chest-hop-seam');
    for (const [at, value] of CHEST_HOP_SEAM) {
      const frame = frames.find((f) => Math.abs(f.at - at) < 0.001);
      expect(frame, `${at}`).toBeDefined();
      expect(number(frame!.body, /opacity:\s*([\d.]+)/)).toBeCloseTo(value, 2);
    }
  });

  it('turns the lid about the drawing’s hinge, sways the beams about its mouth and squats the box on its foot', () => {
    const { hinge, mouth } = chestDrawing('rare');
    expect(css).toContain(`transform-origin: ${hinge[0]}px ${hinge[1]}px;`);
    expect(css).toContain(`transform-origin: ${mouth[0]}px ${mouth[1]}px;`);
    expect(css).toContain(`transform-origin: ${CHEST_FOOT[0]}px ${CHEST_FOOT[1]}px;`);
  });
});
