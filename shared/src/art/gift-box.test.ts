/**
 * The wrapped gift box (gift-box.ts) and how it moves (gift-box-motion.ts): every tier drawn as a valid, self-contained
 * picture in parts with stable ids, in the palette's colours only, richer as the tier rises; and plays that start and
 * end where the renderers expect, squash before they spring, and fit each tier's unwrap time.
 */
import { describe, expect, it } from 'vitest';
import { GIFT_TIERS, GIFT_UNWRAP_MS, type GiftTier } from '../gifts.js';
import { HUES } from '../hues.js';
import {
  GIFT_BOX_COLOURS,
  GIFT_BOX_LID_PARTS,
  GIFT_BOX_PARTS,
  GIFT_BOX_SHUT,
  GIFT_BOX_WRAPS,
  giftBoxDrawing,
  giftBoxGlint,
  giftBoxLayerSvg,
  giftBoxSvg,
} from './gift-box.js';
import {
  GIFT_BOX_EXIT,
  GIFT_BOX_GLINT_PHASES,
  GIFT_BOX_IDLE,
  GIFT_BOX_REST,
  GIFT_BOX_TRACKS,
  GIFT_BOX_UNWRAPS,
  giftBoxGlintKeys,
  giftBoxPoseAt,
  giftBoxUnwrap,
  type GiftBoxKey,
  type GiftBoxPlay,
} from './gift-box-motion.js';
import { GOLD } from './palette.js';

/** Only what the phone's SVG renderer draws the same as a browser. */
const ALLOWED = new Set(['svg', 'title', 'defs', 'g', 'path', 'circle', 'ellipse', 'clipPath', 'radialGradient', 'stop']);

/** The tags of a drawing in order, checked to open and close in step; throws on anything malformed. */
function tags(svg: string): string[] {
  const names: string[] = [];
  const open: string[] = [];
  for (const m of svg.matchAll(/<(\/?)([A-Za-z][\w:-]*)((?:\s+[A-Za-z][\w:-]*="[^"<]*")*)\s*(\/?)>/g)) {
    const [, closing, name, , selfClosing] = m as unknown as [string, string, string, string, string];
    if (closing) {
      if (open.pop() !== name) throw new Error(`</${name}> out of order`);
      continue;
    }
    names.push(name);
    if (!selfClosing) open.push(name);
  }
  if (open.length) throw new Error(`<${open.at(-1)}> never closed`);
  return names;
}

/** A picture that stands alone: well formed, only allowed elements, every reference to an id in it, nothing foreign. */
function checkSvg(svg: string, label: string): void {
  const names = tags(svg);
  expect(names[0], label).toBe('svg');
  expect(names.filter((name) => !ALLOWED.has(name)), label).toEqual([]);
  const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  expect(new Set(ids).size, label).toBe(ids.length);
  for (const [, ref] of svg.matchAll(/url\(#([^)]+)\)/g)) expect(ids, label).toContain(ref);
  expect(/NaN|Infinity|undefined|https?:|<image|<script|<style|<text|<use|<pattern|<filter|<mask|data:|javascript:/.test(svg.replace('http://www.w3.org/2000/svg', '')), label).toBe(false);
}

const colours = (svg: string): string[] => [...new Set(svg.match(/#[0-9a-f]{6}/g) ?? [])];
const elements = (svg: string): number => tags(svg).length;
const SIZES = [34, 40, 64, 96, 200] as const;

describe('the gift box', () => {
  it('draws every tier at every size the apps show it as a picture that stands alone, the same each time', () => {
    for (const tier of GIFT_TIERS) {
      for (const size of SIZES) {
        const svg = giftBoxSvg({ tier, size });
        expect(svg.startsWith(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 120 120" role="img"`), tier).toBe(true);
        checkSvg(svg, `${tier} ${size}`);
        checkSvg(giftBoxSvg({ tier, size, allLayers: true }), `${tier} ${size} all`);
        expect(giftBoxSvg({ tier, size })).toBe(svg);
      }
    }
    expect(new Set(GIFT_TIERS.map((tier) => giftBoxSvg({ tier }))).size).toBe(GIFT_TIERS.length);
  });

  it('is drawn in parts with stable ids, back to front, each standing alone in its own box', () => {
    expect(GIFT_BOX_PARTS).toEqual([
      'shadow',
      'splash',
      'body',
      'ribbon',
      'lidShade',
      'inside',
      'light',
      'lid',
      'tag',
      'tailLeft',
      'tailRight',
      'loopLeft',
      'loopRight',
      'knot',
      'glint',
      'sparks',
    ]);
    expect(GIFT_BOX_LID_PARTS).toEqual(['lid', 'tag', 'tailLeft', 'tailRight', 'loopLeft', 'loopRight', 'knot']);
    for (const tier of GIFT_TIERS) {
      const drawing = giftBoxDrawing(tier, { idPrefix: 'box' });
      expect(Object.keys(drawing.layers)).toEqual([...GIFT_BOX_PARTS]);
      expect(Object.keys(drawing.pivots)).toEqual([...GIFT_BOX_PARTS]);
      const holder = new Map<string, string>();
      for (const part of GIFT_BOX_PARTS) {
        const layer = drawing.layers[part];
        expect(layer.id).toBe(part);
        expect(layer.box.w, part).toBeGreaterThan(0);
        expect(layer.box.h, part).toBeGreaterThan(0);
        expect(layer.markup.length, `${tier} ${part}`).toBeGreaterThan(0);
        const svg = giftBoxLayerSvg(layer);
        checkSvg(svg, `${tier} ${part}`);
        for (const [, id] of svg.matchAll(/ id="([^"]+)"/g)) {
          expect(holder.get(id!), `${id} in ${part} and ${holder.get(id!)}`).toBeUndefined();
          holder.set(id!, part);
          // the part's name is in its ids, so a page's ids say what they belong to
          expect(id!.startsWith(`box${part}`), id).toBe(true);
        }
      }
    }
    // the whole picture names each part, so a page can move the groups
    const parts = (svg: string): string[] => [...svg.matchAll(/data-part="([^"]+)"/g)].map((m) => m[1] ?? '');
    expect(parts(giftBoxSvg({ tier: 'rare' }))).toEqual([...GIFT_BOX_SHUT]);
    expect(parts(giftBoxSvg({ tier: 'rare', allLayers: true }))).toEqual([...GIFT_BOX_PARTS]);
  });

  it('turns the bow about its knot and the tag about its string, both on the lid', () => {
    for (const tier of GIFT_TIERS) {
      const { pivots, layers } = giftBoxDrawing(tier);
      for (const part of ['loopLeft', 'loopRight', 'tailLeft', 'tailRight'] as const) expect(pivots[part], `${tier} ${part}`).toEqual(pivots.knot);
      const within = ([x, y]: readonly [number, number], { box }: { box: { x: number; y: number; w: number; h: number } }): boolean =>
        x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
      expect(within(pivots.knot, layers.knot), tier).toBe(true);
      expect(within(pivots.tag, layers.tag), tier).toBe(true);
      expect(within(pivots.lid, layers.lid), tier).toBe(true);
      // the knot sits on the lid, above the box's foot
      expect(pivots.knot[1]).toBeLessThan(pivots.body[1]);
    }
  });

  it('draws every colour from its palette: our hues, the badges’ gold, and black only for the shadow', () => {
    const palette = new Set<string>(Object.values(GIFT_BOX_COLOURS).flatMap((tone) => Object.values(tone)));
    for (const tier of GIFT_TIERS) {
      for (const size of SIZES) {
        for (const limited of [false, true]) {
          const drawing = giftBoxDrawing(tier, { size, limited });
          for (const part of GIFT_BOX_PARTS) {
            for (const hex of colours(drawing.layers[part].markup)) {
              const ok = palette.has(hex) || (hex === '#000000' && part === 'shadow');
              expect(ok, `${tier} ${size} ${part} wears ${hex}`).toBe(true);
            }
          }
        }
      }
    }
    for (const phase of GIFT_BOX_GLINT_PHASES) for (const hex of colours(giftBoxGlint(phase).markup)) expect(palette.has(hex), hex).toBe(true);
    // the papers and ribbons are Hevalo's own hues, and the gold is the badges' sun gold
    expect(GIFT_BOX_COLOURS.teal.face).toBe(HUES.light.teal.base);
    expect(GIFT_BOX_COLOURS.wool.face).toBe(HUES.light.red.base);
    expect(GIFT_BOX_COLOURS.rose.face).toBe(HUES.light.pink.base);
    expect(GIFT_BOX_COLOURS.gold.face).toBe(GOLD.mid);
    expect(GIFT_BOX_COLOURS.gold.light).toBe(GOLD.light);
    // each tone steps from the lit top down to its darkest, so the planes read as one solid
    const lum = (hex: string): number => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i]!, 0);
    for (const [name, tone] of Object.entries(GIFT_BOX_COLOURS)) {
      expect(lum(tone.light), name).toBeGreaterThan(lum(tone.face));
      expect(lum(tone.face), name).toBeGreaterThan(lum(tone.shade));
      expect(lum(tone.shade), name).toBeGreaterThan(lum(tone.deep));
    }
  });

  it('wraps each tier its own way, richer as it rises: kraft and twine, teal with a kilim band, cut amethyst, the night', () => {
    expect(GIFT_BOX_WRAPS.common).toMatchObject({ paper: GIFT_BOX_COLOURS.kraft, bow: 'twine', sprig: true, tag: 'pomegranate', pattern: 'fibre' });
    expect(GIFT_BOX_WRAPS.rare).toMatchObject({ paper: GIFT_BOX_COLOURS.teal, bow: 'satin', pattern: 'kilim' });
    expect(GIFT_BOX_WRAPS.legendary).toMatchObject({ paper: GIFT_BOX_COLOURS.amethyst, bow: 'satin', goldEdge: true, pattern: 'facets' });
    expect(GIFT_BOX_WRAPS.grand).toMatchObject({ paper: GIFT_BOX_COLOURS.night, ribbon: GIFT_BOX_COLOURS.gold, pattern: 'stars' });
    // only the common gift is tied in wool, and only the legendary one edged in gold
    for (const tier of GIFT_TIERS) {
      const svg = giftBoxSvg({ tier, size: 200 });
      expect(svg.includes(GIFT_BOX_COLOURS.wool.face), tier).toBe(tier === 'common');
      expect(svg.includes(GIFT_BOX_COLOURS.leaf.face), tier).toBe(tier === 'common');
      expect(svg.includes(GIFT_BOX_COLOURS.cream.face), tier).toBe(tier === 'rare');
    }
    // the tier is told at a glance by its paper, even at the smallest size
    const papers = GIFT_TIERS.map((tier) => giftBoxDrawing(tier, { size: 34 }).layers.body.markup.match(/#[0-9a-f]{6}/g)?.slice(0, 2).join());
    expect(new Set(papers).size).toBe(GIFT_TIERS.length);
  });

  it('gives a season’s gift a Newroz flame for its tag, as a legendary gift is unless told otherwise', () => {
    const flame = GIFT_BOX_COLOURS.flame.face;
    expect(giftBoxDrawing('legendary').layers.tag.markup).toContain(flame);
    expect(giftBoxDrawing('legendary', { limited: false }).layers.tag.markup).not.toContain(flame);
    expect(giftBoxDrawing('common').layers.tag.markup).toContain(GIFT_BOX_COLOURS.pomegranate.face);
    expect(giftBoxDrawing('common', { limited: true }).layers.tag.markup).toContain(flame);
    expect(giftBoxSvg({ tier: 'rare', limited: true })).not.toBe(giftBoxSvg({ tier: 'rare' }));
  });

  it('draws less as it gets smaller, and keeps its cords and edges a line wide', () => {
    for (const tier of GIFT_TIERS) {
      expect(elements(giftBoxSvg({ tier, size: 34 })), tier).toBeLessThan(elements(giftBoxSvg({ tier, size: 64 })));
      expect(elements(giftBoxSvg({ tier, size: 64 })), tier).toBeLessThan(elements(giftBoxSvg({ tier, size: 200 })));
      // at 34 pixels across a canvas of 120, an edge of under 2.6 units would be thinner than a pixel and a half
      const widths = [...giftBoxDrawing(tier, { size: 34 }).layers.body.markup.matchAll(/stroke-width="([\d.]+)"/g)].map((m) => Number(m[1]));
      expect(Math.max(...widths), tier).toBeGreaterThanOrEqual(2.6);
    }
  });

  it('draws the glint at each phase, labels itself, and refuses what it cannot draw', () => {
    const phases = [0, 0.25, 0.5, 1].map((phase) => giftBoxLayerSvg(giftBoxGlint(phase)));
    expect(new Set(phases).size).toBe(4);
    expect(giftBoxSvg({ tier: 'grand' })).toMatch(/>Gift<\/title>/);
    expect(giftBoxSvg({ tier: 'grand', title: 'A <gift> & "more"' })).toContain('A &lt;gift&gt; &amp; &quot;more&quot;');
    expect(() => giftBoxGlint(1.5)).toThrow(RangeError);
    expect(() => giftBoxSvg({ tier: 'limited' as GiftTier })).toThrow(RangeError);
    expect(() => giftBoxSvg({ tier: 'rare', size: 0 })).toThrow(RangeError);
    expect(() => giftBoxSvg({ tier: 'rare', idPrefix: 'a b' })).toThrow(RangeError);
  });
});

describe('how the gift box moves', () => {
  const ordered = (keys: readonly GiftBoxKey[]): boolean => keys.every((k, i) => i === 0 || k.at > keys[i - 1]!.at);
  const wellFormed = (play: GiftBoxPlay, label: string): void => {
    for (const [name, keys] of Object.entries(play.tracks)) {
      expect(GIFT_BOX_TRACKS as readonly string[], label).toContain(name);
      expect(ordered(keys!), `${label} ${name}`).toBe(true);
      expect(keys![0]!.at, `${label} ${name}`).toBe(0);
      expect(keys![keys!.length - 1]!.at, `${label} ${name}`).toBe(1);
      for (const k of keys!) for (const v of Object.values(k)) expect(Number.isFinite(v), `${label} ${name}`).toBe(true);
      for (const k of keys!) expect(k.o >= 0 && k.o <= 1, `${label} ${name}`).toBe(true);
    }
    for (const [a, b] of play.glints) expect(0 <= a && a < b && b <= 1, label).toBe(true);
  };
  const first = (keys: readonly GiftBoxKey[], rest = keys[0]!): number => keys.find((k) => k.x !== rest.x || k.y !== rest.y || k.sx !== rest.sx || k.sy !== rest.sy || k.rot !== rest.rot || k.o !== rest.o)?.at ?? 1;

  it('waits calmly: one hop and one glint in a round of eight seconds, at rest in between and where it loops', () => {
    wellFormed(GIFT_BOX_IDLE, 'idle');
    expect(GIFT_BOX_IDLE.ms).toBe(8000);
    expect(GIFT_BOX_IDLE.loop).toBe(true);
    expect(GIFT_BOX_IDLE.glints).toHaveLength(1);
    const hop = GIFT_BOX_IDLE.tracks.hop!;
    expect(giftBoxPoseAt(hop, 0)).toEqual(GIFT_BOX_REST.hop);
    expect(giftBoxPoseAt(hop, 1)).toEqual(GIFT_BOX_REST.hop);
    // every part is back at rest well before the round ends, so the loop has no seam
    for (const [name, keys] of Object.entries(GIFT_BOX_IDLE.tracks)) expect(giftBoxPoseAt(keys!, 0.3), name).toEqual(giftBoxPoseAt(keys!, 1));
    // the hop is over in about a second: most of the round is stillness
    const moving = hop.filter((k) => k.y !== 0 || k.sx !== 1 || k.sy !== 1);
    expect(moving[moving.length - 1]!.at * GIFT_BOX_IDLE.ms).toBeLessThan(1100);
  });

  it('crouches before it springs, stretches in the air, squashes as it lands, and keeps its size while it does', () => {
    const hop = GIFT_BOX_IDLE.tracks.hop!;
    const top = hop.reduce((best, k) => (k.y < best.y ? k : best));
    const crouch = hop.find((k) => k.sy < 0.95)!;
    expect(crouch.at).toBeLessThan(top.at);
    expect(crouch.sx).toBeGreaterThan(1);
    expect(top.y).toBeLessThan(-10);
    const landing = hop.filter((k) => k.at > top.at).reduce((low, k) => (k.sy < low.sy ? k : low));
    expect(landing.y).toBe(0);
    expect(landing.sx).toBeGreaterThan(1);
    for (const k of hop) expect(k.sx * k.sy).toBeGreaterThan(0.9);
    for (const k of hop) expect(k.sx * k.sy).toBeLessThan(1.1);
    // the bow follows a beat behind the box, and the sparks come at the top and the gold as it lands
    expect(first(GIFT_BOX_IDLE.tracks.loopLeft!)).toBeGreaterThan(first(hop));
    expect(giftBoxPoseAt(GIFT_BOX_IDLE.tracks.loopLeft!, 0.1).rot).toBeCloseTo(-giftBoxPoseAt(GIFT_BOX_IDLE.tracks.loopRight!, 0.1).rot, 5);
    expect(first(GIFT_BOX_IDLE.tracks.sparks!)).toBeLessThan(landing.at);
    expect(first(GIFT_BOX_IDLE.tracks.splash!)).toBeGreaterThanOrEqual(landing.at - 0.01);
  });

  it('unwraps each tier in its own time, the richer ones longer, with shaking that grows before it opens', () => {
    for (const tier of GIFT_TIERS) {
      const play = GIFT_BOX_UNWRAPS[tier];
      wellFormed(play, tier);
      expect(play.ms, tier).toBe(GIFT_UNWRAP_MS[tier]);
      expect(play.loop).toBe(false);
      expect(play).toEqual(giftBoxUnwrap(tier));
      expect(play.burstMs, tier).toBeGreaterThan(0);
      expect(play.burstMs, tier).toBeLessThan(play.ms);
      const hop = play.tracks.hop!;
      // it shakes before it opens, harder in the second half of the wait than in the first
      const wait = (play.burstMs - 200) / play.ms;
      const turn = (from: number, to: number): number => Math.max(0, ...hop.filter((k) => k.at >= from && k.at < to).map((k) => Math.abs(k.rot)));
      expect(turn(0, wait), tier).toBeGreaterThan(3);
      if (tier !== 'common') expect(turn(wait / 2, wait), tier).toBeGreaterThan(turn(0, wait / 2));
      // a squash comes just before the burst
      const squash = hop.filter((k) => k.at * play.ms <= play.burstMs).reduce((low, k) => (k.sy < low.sy ? k : low));
      expect(squash.sy, tier).toBeLessThan(0.86);
      expect(giftBoxPoseAt(hop, 1)).toEqual(GIFT_BOX_REST.hop);
    }
    const shakes = (tier: GiftTier): number => GIFT_BOX_UNWRAPS[tier].tracks.hop!.filter((k) => k.rot !== 0).length;
    expect(shakes('common')).toBeLessThan(shakes('rare'));
    expect(shakes('rare')).toBeLessThan(shakes('legendary'));
    expect(shakes('legendary')).toBeLessThan(shakes('grand'));
    expect(() => giftBoxUnwrap('limited' as GiftTier)).toThrow(RangeError);
  });

  it('lets the ribbon go and the lid and bow fly off as the light bursts out, and ends open and lit for the gift', () => {
    for (const tier of GIFT_TIERS) {
      const play = GIFT_BOX_UNWRAPS[tier];
      const at = (name: keyof typeof play.tracks, share: number) => giftBoxPoseAt(play.tracks[name]!, share);
      const burst = play.burstMs / play.ms;
      // shut and dark until it opens, light coming through only in glimpses while it shakes
      expect(at('lid', 0).o).toBe(1);
      expect(at('inside', 0).o).toBe(0);
      expect(Math.max(...play.tracks.light!.filter((k) => k.at < burst - 0.05).map((k) => k.o)), tier).toBeLessThan(0.5);
      // the lid goes up and away to the right, turning, and is gone; the ribbon and the lid's shade go with it
      const lidTop = play.tracks.lid!.reduce((best, k) => (k.y < best.y ? k : best));
      expect(lidTop.y, tier).toBeLessThan(-20);
      expect(lidTop.at, tier).toBeGreaterThan(burst - 0.05);
      expect(at('lid', 1)).toMatchObject({ o: 0 });
      expect(at('lid', 1).x, tier).toBeGreaterThan(20);
      expect(at('ribbon', 1).o).toBe(0);
      expect(at('lidShade', 1).o).toBe(0);
      // the bow flaps as it goes: its loops turn both ways after the burst
      const loopTurns = play.tracks.loopLeft!.filter((k) => k.at > burst - 0.05).map((k) => k.rot);
      expect(Math.min(...loopTurns), tier).toBeLessThan(-5);
      expect(Math.max(...loopTurns), tier).toBeGreaterThan(5);
      // open and lit at the end, the sparks and gold gone, ready for the gift to come out
      expect(at('inside', 1).o).toBe(1);
      expect(at('light', 1).o).toBe(1);
      expect(at('sparks', 1).o).toBe(0);
      expect(at('splash', 1).o).toBe(0);
    }
  });

  it('gives way to the gift from where the unwrap leaves it, and plays every glint frame in turn', () => {
    wellFormed(GIFT_BOX_EXIT, 'exit');
    for (const tier of GIFT_TIERS) {
      for (const name of GIFT_BOX_TRACKS) {
        const end = GIFT_BOX_UNWRAPS[tier].tracks[name];
        if (!end) continue;
        const open = giftBoxPoseAt(end, 1);
        if (name === 'lid') expect(giftBoxPoseAt(GIFT_BOX_EXIT.tracks.lid!, 0).o, tier).toBe(open.o);
        else expect(giftBoxPoseAt(GIFT_BOX_EXIT.tracks[name]!, 0), `${tier} ${name}`).toEqual(open);
      }
    }
    expect(giftBoxPoseAt(GIFT_BOX_EXIT.tracks.hop!, 1).o).toBe(0);
    const frames = giftBoxGlintKeys(GIFT_BOX_IDLE);
    expect(frames).toHaveLength(GIFT_BOX_GLINT_PHASES.length);
    const peaks = frames.map((keys) => keys.find((k) => k.o === 1)!.at);
    expect(peaks.every((at, i) => i === 0 || at > peaks[i - 1]!)).toBe(true);
    for (const keys of frames) expect(ordered(keys)).toBe(true);
    const [a, b] = GIFT_BOX_IDLE.glints[0]!;
    for (const at of peaks) expect(at > a && at < b).toBe(true);
    expect(giftBoxGlintKeys(GIFT_BOX_UNWRAPS.common).every((keys) => keys.every((k) => k.o === 0))).toBe(true);
  });
});
