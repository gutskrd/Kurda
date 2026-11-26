import { describe, expect, it } from 'vitest';
import { HAND_PHONE_SCREEN, HAND_PHONE_VIEW, handPhoneSvg } from './hand-phone.js';
import { HAND_STAMP_CARD, HAND_STAMP_VIEW, handStampSvg } from './hand-stamp.js';
import { KNIT, SKIN } from './hand-paint.js';

const back = handPhoneSvg({ part: 'back' });
const front = handPhoneSvg({ part: 'front' });
const stampBack = handStampSvg({ part: 'back' });
const stampFront = handStampSvg({ part: 'front' });
const colours = (svg: string): Set<string> => new Set([...svg.matchAll(/(?:fill|stroke)="(#[0-9a-f]{6})"/g)].map((m) => m[1]!));
const ids = (svg: string): string[] => [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]!);
/** Every point a layer's paths pass through or bend toward, in its own units. */
const points = (svg: string): [number, number][] =>
  [...svg.matchAll(/<path d="([^"]+)"/g)].flatMap((m) => {
    const v = (m[1]!.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    return Array.from({ length: Math.floor(v.length / 2) }, (_, i) => [v[i * 2]!, v[i * 2 + 1]!] as [number, number]);
  });

describe('the hand holding a phone', () => {
  it('draws both layers on the one frame, the same every time, hidden from screen readers since the words beside it say it all', () => {
    for (const svg of [back, front]) {
      expect(svg).toContain(`viewBox="0 0 ${HAND_PHONE_VIEW.w} ${HAND_PHONE_VIEW.h}"`);
      expect(svg).toContain('aria-hidden="true"');
    }
    expect(handPhoneSvg({ part: 'back' })).toBe(back);
  });

  it('keeps each layer’s ids its own, so both can sit on one page', () => {
    expect(ids(back).length).toBeGreaterThan(0);
    expect(ids(back).filter((id) => ids(front).includes(id))).toEqual([]);
    expect(ids(handPhoneSvg({ part: 'back', idPrefix: 'mine' })).every((id) => id.startsWith('mine'))).toBe(true);
  });

  it('paints the hand flat, in a face and one shade step, with no gradient, blur, filter or picture', () => {
    for (const svg of [back, front]) expect(svg).not.toMatch(/Gradient|<filter|blur|<image|href=/);
    // the finger pads in the skin’s face, and the island in the phone’s black
    expect(colours(front).size).toBe(2);
  });

  it('puts the screen inside the frame, on the glass the back layer leaves dark for it', () => {
    const s = HAND_PHONE_SCREEN;
    const a = (s.turn * Math.PI) / 180;
    for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const [dx, dy] = [(x * s.w) / 2, (y * s.h) / 2];
      const [px, py] = [s.cx + dx * Math.cos(a) - dy * Math.sin(a), s.cy + dx * Math.sin(a) + dy * Math.cos(a)];
      expect(px).toBeGreaterThan(0);
      expect(px).toBeLessThan(HAND_PHONE_VIEW.w);
      expect(py).toBeGreaterThan(0);
      expect(py).toBeLessThan(HAND_PHONE_VIEW.h);
    }
    expect(back).toContain(`width="${s.w}" height="${s.h}" rx="${s.r}"`);
    expect(back).toContain(`rotate(${s.turn})`);
  });

  it('holds the phone nearly upright, and lays nothing of the hand on the glass', () => {
    expect(Math.abs(HAND_PHONE_SCREEN.turn)).toBeLessThanOrEqual(3);
    // the finger pads come over the bezel's outer edge only, in the phone's own units, centred on it
    for (const [x] of points(front)) expect(x).toBeLessThan(-HAND_PHONE_SCREEN.w / 2);
  });

  it('refuses a part it does not draw', () => {
    expect(() => handPhoneSvg({ part: 'side' as 'back' })).toThrow(RangeError);
  });
});

describe('the hand holding up a game’s stamp', () => {
  it('draws both layers on the one frame, hidden from screen readers, with ids of their own', () => {
    for (const svg of [stampBack, stampFront]) {
      expect(svg).toContain(`viewBox="0 0 ${HAND_STAMP_VIEW.w} ${HAND_STAMP_VIEW.h}"`);
      expect(svg).toContain('aria-hidden="true"');
      expect(svg).not.toMatch(/Gradient|<filter|blur|<image|href=/);
    }
    expect(ids(stampBack).filter((id) => ids(stampFront).includes(id))).toEqual([]);
  });

  it('marks the thumb and the fingers, so they can give a little as the stamp turns', () => {
    expect(stampFront).toContain('data-part="thumb"');
    expect(stampBack).toContain('data-part="fingers"');
  });

  it('wears the same skin and sleeve as the hand holding the phone, and paints its gaps and lines in one dark shadow', () => {
    for (const c of [SKIN.face, SKIN.shade, KNIT.face, KNIT.rib]) expect(colours(back)).toContain(c);
    expect(colours(stampBack)).toContain(SKIN.face);
    expect(colours(stampFront)).toContain(SKIN.face);
    // the skin, and one shadow for the gaps between the digits and for the thumbnail and creases
    expect(new Set([...colours(stampBack), ...colours(stampFront)]).size).toBe(2);
  });

  it('covers only the stamp’s foot with the thumb, never its picture', () => {
    const c = HAND_STAMP_CARD;
    for (const [, y] of points(stampFront)) expect(y).toBeGreaterThanOrEqual(c.cy - c.h / 2 + c.clear);
    expect(c.cy - c.h / 2).toBeGreaterThan(0);
    expect(c.cx + c.w / 2).toBeLessThan(HAND_STAMP_VIEW.w);
  });

  it('refuses a part it does not draw', () => {
    expect(() => handStampSvg({ part: 'side' as 'front' })).toThrow(RangeError);
  });
});
