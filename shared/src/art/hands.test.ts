import { describe, expect, it } from 'vitest';
import { HAND_PHONE_SCREEN, HAND_PHONE_VIEW, handPhoneSvg } from './hand-phone.js';
import { HAND_STAMP_CARD, HAND_STAMP_FLIP, HAND_STAMP_PARTS, HAND_STAMP_VIEW, handStampFlip, handStampSvg } from './hand-stamp.js';
import { SKIN } from './hand-paint.js';

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

  it('marks each digit, turning about its own knuckle, so the hand can move through a turn', () => {
    const marked = (svg: string, part: string): boolean => new RegExp(`data-part="${part}" style="transform-origin:[\\d.]+px [\\d.]+px"`).test(svg);
    for (const part of ['thumb', 'thumb-tip']) expect(marked(stampFront, part)).toBe(true);
    for (const part of ['index', 'index-tip', 'reaching', 'curled']) expect(marked(stampBack, part)).toBe(true);
  });

  it('wears the skin of the hand holding the phone, its shadows in the antlers’ brown and its lines a warm one', () => {
    const used = new Set([...colours(stampBack), ...colours(stampFront)]);
    for (const c of [SKIN.face, SKIN.shade]) expect(used).toContain(c);
    // a warm brown for the lines: red over green over blue, darker than the skin's shade
    const rgb = (c: string): number[] => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    const warm = [...used].filter((c) => {
      const [r, g, b] = rgb(c);
      return r! > g! && g! > b! && r! < rgb(SKIN.shade)[0]!;
    });
    expect(warm.length).toBeGreaterThan(0);
    for (const c of [SKIN.face, SKIN.shade]) expect(colours(back)).toContain(c);
    // nothing near black: every colour has some light in it
    for (const c of used) expect(Math.max(...[1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)))).toBeGreaterThan(64);
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

describe('the turn of the stamp in the hand', () => {
  const flip = handStampFlip();
  const turnOf = (transform: string): number => Number(/rotateY\((-?[\d.]+)deg\)/.exec(transform)![1]);

  it('moves every part on the same clock, a frame every 40 ms through the whole turn', () => {
    const frames = HAND_STAMP_FLIP.ms / 40 + 1;
    for (const part of HAND_STAMP_PARTS) expect(flip[part]).toHaveLength(frames);
    expect(HAND_STAMP_FLIP.ms).toBe(1360);
  });

  it('starts and ends every finger at rest, and the stamp at rest but for showing its other face', () => {
    for (const part of HAND_STAMP_PARTS) {
      if (part === 'card') continue;
      expect(flip[part][0]).toBe('translate(0px, 0px) rotate(0deg)');
      expect(flip[part].at(-1)).toBe('translate(0px, 0px) rotate(0deg)');
    }
    expect(flip.card[0]).toBe(`translate(0px, 0px) rotate(${HAND_STAMP_CARD.turn}deg) rotateY(0deg)`);
    expect(flip.card.at(-1)).toBe(`translate(0px, 0px) rotate(${HAND_STAMP_CARD.turn}deg) rotateY(180deg)`);
  });

  it('holds the stamp a third turned, then turns it over fast, edge-on where its words change, and lands it softly', () => {
    const at = (share: number): number => turnOf(flip.card[Math.round(share * (flip.card.length - 1))]!);
    expect(at(5 / 17)).toBeGreaterThan(25);
    expect(at(5 / 17)).toBeLessThan(40);
    expect(Math.abs(at(HAND_STAMP_FLIP.edgeOn) - 90)).toBeLessThan(8);
    // it never turns back on itself once it is over, and slows as it lands
    const turns = flip.card.map(turnOf);
    const over = turns.findIndex((v) => v > 90);
    for (let i = over + 1; i < turns.length; i++) expect(turns[i]!).toBeGreaterThanOrEqual(turns[i - 1]! - 0.5);
    expect(turns.at(-1)! - turns.at(-3)!).toBeLessThan(turns[over + 2]! - turns[over]!);
  });

  it('refuses a step that is not a positive time', () => {
    expect(() => handStampFlip(0)).toThrow(RangeError);
  });
});
