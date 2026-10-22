import { describe, expect, it } from 'vitest';
import {
  BADGE_FAMILIES,
  BADGE_KEYS,
  BADGES,
  badgeArt,
  isBadgeKey,
  RANK_BADGE,
  LEAGUE_TIERS,
  PLACEMENT_GAMES,
  RANK_TIERS,
  SEASON_FRAME_INNER,
  SEASON_FRAME_SHINE,
  SEASONS,
  SMALL_BADGE,
  badgeShineSvg,
  badgeShines,
  badgeSvg,
  leagueEmblemSvg,
  placementEmblemSvg,
  rankEmblemSvg,
  seasonFrameShineSvg,
  seasonFrameSvg,
  type BadgeKey,
  type BadgeTier,
} from './index.js';
import { ICONS } from './icons.js';
import { SHAPES } from './shapes.js';
import { SMALL_EMBLEM, TINY_EMBLEM } from './ranks.js';
import { TINY_BADGE } from './badges.js';
import { escapeXml, wholePath } from './svg.js';
import { characterArt } from '../characters/index.js';
import { BADGES as CATALOGUE, BADGE_FAMILIES as CATALOGUE_FAMILIES, BADGE_TIERS as CATALOGUE_TIERS } from '../badges.js';
import { LEAGUE_TIERS as CATALOGUE_LEAGUE_TIERS } from '../leagues.js';
import { RANK_TIER_KEYS, SEASON_NAMES as SEASON_LABEL_KEYS } from '../ranks.js';

/**
 * A strict little XML reader: enough to say a drawing is well-formed (every
 * tag closed in order, every attribute quoted and named once, no stray `<` or
 * `&`) and to hand back its elements for the checks below. Written here rather
 * than taken from node_modules because shared has no XML dependency of its own.
 */
interface El {
  name: string;
  attrs: Record<string, string>;
  text: string;
  children: El[];
}

function parse(xml: string): El {
  let i = 0;
  const root: El = { name: '#root', attrs: {}, text: '', children: [] };
  const stack: El[] = [root];
  const entity = /&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/iy;
  const textUntil = (end: number): string => {
    const raw = xml.slice(i, end);
    for (let k = 0; k < raw.length; k++) {
      if (raw[k] === '&') {
        entity.lastIndex = k;
        if (!entity.test(raw)) throw new Error(`bare & at ${i + k}`);
      }
      if (raw[k] === '>') throw new Error(`stray > at ${i + k}`);
    }
    return raw;
  };
  while (i < xml.length) {
    const lt = xml.indexOf('<', i);
    const top = stack[stack.length - 1] as El;
    if (lt === -1) {
      if (xml.slice(i).trim()) throw new Error('text after the root element');
      break;
    }
    if (lt > i) top.text += textUntil(lt);
    i = lt;
    if (xml.startsWith('</', i)) {
      const m = /^<\/([A-Za-z][\w:-]*)\s*>/.exec(xml.slice(i));
      if (!m) throw new Error(`bad closing tag at ${i}`);
      const open = stack.pop();
      if (!open || open.name !== m[1]) throw new Error(`</${m[1]}> closes <${open?.name}>`);
      i += m[0].length;
      continue;
    }
    const m = /^<([A-Za-z][\w:-]*)((?:\s+[A-Za-z][\w:-]*="[^"<]*")*)\s*(\/?)>/.exec(xml.slice(i));
    if (!m) throw new Error(`bad tag at ${i}: ${xml.slice(i, i + 40)}`);
    const attrs: Record<string, string> = {};
    for (const a of (m[2] ?? '').matchAll(/([A-Za-z][\w:-]*)="([^"]*)"/g)) {
      const [, k, v] = a as unknown as [string, string, string];
      if (k in attrs) throw new Error(`attribute ${k} twice on <${m[1]}>`);
      attrs[k] = v;
    }
    const el: El = { name: m[1] as string, attrs, text: '', children: [] };
    top.children.push(el);
    if (!m[3]) stack.push(el);
    i += m[0].length;
  }
  if (stack.length !== 1) throw new Error(`<${stack[stack.length - 1]?.name}> never closed`);
  if (root.children.length !== 1) throw new Error('not exactly one root element');
  return root.children[0] as El;
}

function walk(el: El, visit: (e: El) => void): void {
  visit(el);
  for (const c of el.children) walk(c, visit);
}

/** Only what react-native-svg's SvgXml draws the same as a browser. */
const ALLOWED = new Set(['svg', 'title', 'defs', 'g', 'path', 'circle', 'ellipse', 'rect', 'linearGradient', 'radialGradient', 'stop', 'clipPath']);

/**
 * Every structural rule a drawing must keep. Problems are collected and
 * asserted once, because a page of badges is thousands of attributes.
 */
function checkSvg(svg: string, size: number): Set<string> {
  const problems: string[] = [];
  const root = parse(svg);
  const want = (ok: boolean, what: string): void => {
    if (!ok) problems.push(what);
  };
  want(root.name === 'svg', 'root is not <svg>');
  want(root.attrs.xmlns === 'http://www.w3.org/2000/svg', 'no SVG namespace');
  want(root.attrs.width === String(size) && root.attrs.height === String(size), `size is ${root.attrs.width}×${root.attrs.height}, not ${size}`);
  want(root.attrs.viewBox === '0 0 120 120', `viewBox ${root.attrs.viewBox}`);
  want(root.attrs.role === 'img', 'no role="img"');
  // the accessible label: a non-empty <title> first, which aria-labelledby names
  const title = root.children[0];
  want(title?.name === 'title' && title.text.trim().length > 0, 'no <title> first');
  want(Boolean(title?.attrs.id) && root.attrs['aria-labelledby'] === title?.attrs.id, 'aria-labelledby does not name the title');

  const ids = new Set<string>();
  const refs: string[] = [];
  walk(root, (e) => {
    want(ALLOWED.has(e.name), `<${e.name}> is not drawn the same everywhere`);
    for (const [k, v] of Object.entries(e.attrs)) {
      want(!k.startsWith('on'), `event handler ${k}`);
      want(!/href$/i.test(k), `link attribute ${k}`);
      for (const m of v.matchAll(/url\(([^)]*)\)/g)) {
        want(m[1]?.startsWith('#') === true, `external url(${m[1]})`);
        refs.push((m[1] ?? '').slice(1));
      }
      if (k !== 'xmlns') want(!/NaN|Infinity|undefined|null/.test(v), `${k}="${v}" on <${e.name}>`);
    }
    if (e.attrs.id) {
      want(!ids.has(e.attrs.id), `id ${e.attrs.id} twice`);
      ids.add(e.attrs.id);
    }
  });
  for (const r of refs) want(ids.has(r), `url(#${r}) points at nothing`);
  // nothing reaches outside the drawing, however it is spelled
  const outside = svg.replace('xmlns="http://www.w3.org/2000/svg"', '');
  want(!/https?:|\/\/|<image|<script|<style|<foreignObject|<use|<text|data:|javascript:/i.test(outside), 'reaches outside the drawing');
  expect(problems).toEqual([]);
  return ids;
}

const TIERS: readonly BadgeTier[] = [1, 2, 3, 4];

/**
 * The pips in a drawing: the small circles drawn with an edge. A lit one is a
 * raised bead filled with its own gradient, an unlit one an empty socket — so
 * the count is told by shape, not only by colour.
 */
function pipsOf(svg: string): { lit: number; all: number } {
  let lit = 0;
  let all = 0;
  walk(parse(svg), (e) => {
    if (e.name !== 'circle' || !e.attrs.stroke || Number(e.attrs.r) > 8) return;
    all += 1;
    if (/^url\(#[\w-]*pip\d+\)$/.test(e.attrs.fill ?? '')) lit += 1;
  });
  return { lit, all };
}

/**
 * The division stones under a crest: small diamonds drawn with an edge. A lit
 * one is filled with its own gradient, an empty one is a faint setting — so
 * the count is told by shape and fill, not only by colour.
 */
function stonesOf(svg: string): { lit: number; all: number } {
  let lit = 0;
  let all = 0;
  walk(parse(svg), (e) => {
    if (e.name !== 'path' || !e.attrs.stroke) return;
    if (/^url\(#[\w-]*pip\d+\)$/.test(e.attrs.fill ?? '')) {
      lit += 1;
      all += 1;
    } else if (e.attrs['fill-opacity'] === '0.25') all += 1;
  });
  return { lit, all };
}
/** A crest's glow: a radial fade to nothing behind it, in a colour — the shadow under every crest is black. */
function glows(svg: string): number {
  let count = 0;
  walk(parse(svg), (e) => {
    if (e.name !== 'radialGradient' || e.attrs.gradientUnits !== 'userSpaceOnUse') return;
    if (e.children.at(-1)?.attrs['stop-opacity'] === '0' && e.children[0]?.attrs['stop-color'] !== '#000000') count += 1;
  });
  return count;
}
/** A crest's feathers — its wings — each one three curved edges: up to its rounded tip, round it, and back; a mirrored pair shares a path. */
function blades(svg: string): number {
  let count = 0;
  walk(parse(svg), (e) => {
    if (e.name === 'path' && /^(M[^QLZ]+Q[^QLZ]+Q[^QLZ]+Q[^QLZ]+Z){2}$/.test(e.attrs.d ?? '')) count += 2;
  });
  return count;
}
/** What is cut into a crest's stone: its glyph, in its own white. */
const hasGlyph = (svg: string): boolean => /(fill|stroke)="url\(#[\w-]*gl\d+\)"/.test(svg);

/** Paths that are only a run of ten or more small diamonds: a kilim band's eyes. */
/**
 * The number under a large badge: the face of its chunky figures, a round
 * pen stroke filled with its own gradient. Each figure starts a line, so the
 * count of moves is the count of figures.
 */
function figuresOf(svg: string): number {
  let count = 0;
  walk(parse(svg), (e) => {
    if (e.name === 'path' && e.attrs['stroke-linecap'] === 'round' && /^url\(#[\w-]*nf\d+\)$/.test(e.attrs.stroke ?? '')) count += (e.attrs.d ?? '').split('M').length - 1;
  });
  return count;
}
/** How many elements a drawing has: a measure of how much detail it carries. */
function elements(svg: string): number {
  let count = 0;
  walk(parse(svg), () => {
    count += 1;
  });
  return count;
}

describe('the checks themselves', () => {
  it('reject a drawing that is broken, unlabelled or reaches outside', () => {
    const good = badgeSvg({ key: 'agir' });
    expect(() => checkSvg(good, 96)).not.toThrow();
    expect(() => checkSvg(good.replace('</svg>', ''), 96)).toThrow();
    expect(() => checkSvg(good.replace('</g>', '</defs>'), 96)).toThrow();
    expect(() => checkSvg(good.replace(/<title[^<]*<\/title>/, ''), 96)).toThrow();
    expect(() => checkSvg(good.replace('</svg>', '<image href="https://example.org/a.png"/></svg>'), 96)).toThrow();
    expect(() => checkSvg(good.replace(/url\(#[^)]+\)/, 'url(https://example.org/a.svg#g)'), 96)).toThrow();
    expect(() => checkSvg(good.replace(/url\(#([^)]+)\)/, 'url(#missing)'), 96)).toThrow();
    expect(() => checkSvg(good.replace('<path ', '<path d2="NaN" '), 96)).toThrow();
    expect(() => checkSvg(good, 64)).toThrow();
  });
});

describe('the badge catalogue the art draws', () => {
  it('has the 44 badge types of the catalogue, in their seven families', () => {
    expect(BADGE_KEYS).toHaveLength(44);
    const count = (family: string): number => BADGE_KEYS.filter((k) => badgeArt(k).family === family).length;
    expect(BADGE_FAMILIES.map(count)).toEqual([7, 5, 7, 8, 3, 8, 6]);
    expect(new Set(BADGE_KEYS).size).toBe(44);
    for (const key of BADGE_KEYS) expect(key).toMatch(/^[a-z][a-z-]*$/);
  });

  it('is the catalogue itself, not a copy of it', () => {
    expect(BADGE_KEYS).toEqual(CATALOGUE.map((b) => b.key));
    expect(BADGE_FAMILIES).toEqual(CATALOGUE_FAMILIES);
    for (const b of CATALOGUE) expect(BADGES[b.key], b.key).toEqual({ family: b.family, name: b.nameKu, tiers: b.tiers.length, milestones: b.tiers });
    expect(RANK_TIERS).toEqual(RANK_TIER_KEYS);
    expect(LEAGUE_TIERS).toEqual(CATALOGUE_LEAGUE_TIERS);
    expect(SEASONS).toEqual(SEASON_LABEL_KEYS);
    // the art counts tiers 1–4 and has four metals: the catalogue's tiers are those four
    expect(CATALOGUE_TIERS).toHaveLength(4);
    for (const b of CATALOGUE) expect([1, 4], b.key).toContain(b.tiers.length);
  });

  it('has a drawing for every badge of the catalogue, and none for a badge it does not have', () => {
    const undrawn = CATALOGUE.filter((b) => !(b.family === 'ranked' && Object.values(RANK_BADGE).includes(b.key)) && ICONS[b.key] === undefined).map((b) => b.key);
    expect(undrawn, 'catalogue badges with no drawing in icons.ts').toEqual([]);
    for (const tier of RANK_TIERS) expect(isBadgeKey(RANK_BADGE[tier]), `${tier} has a ranked badge`).toBe(true);
    expect(Object.keys(ICONS).filter((k) => !isBadgeKey(k)), 'drawings for no catalogue badge').toEqual([]);
  });
});

describe('badgeSvg', () => {
  it.each(BADGE_KEYS)('draws %s at every tier, in every state, large and small, as valid SVG', (key) => {
    for (const tier of TIERS) {
      for (const size of [32, 96]) {
        checkSvg(badgeSvg({ key, tier, size }), size);
        checkSvg(badgeSvg({ key, tier, size, state: 'locked' }), size);
      }
    }
    checkSvg(badgeSvg({ key, state: 'secret', size: 64 }), 64);
  });

  it('is deterministic: the same badge is the same string, whatever was drawn in between', () => {
    const first = badgeSvg({ key: 'agir', tier: 3, size: 96 });
    badgeSvg({ key: 'kewe-ciye', size: 40 });
    rankEmblemSvg({ tier: 'lutke', division: 2 });
    expect(badgeSvg({ key: 'agir', tier: 3, size: 96 })).toBe(first);
    for (const key of BADGE_KEYS) expect(badgeSvg({ key, tier: 4 })).toBe(badgeSvg({ key, tier: 4 }));
  });

  it('draws each tier differently, and tells them apart without colour: the number it was earned at, the pips when small', () => {
    for (const key of ['ders', 'agir', 'peyvzan', 'rank-ciya', 'heval', 'newroz'] as BadgeKey[]) {
      const tiers = TIERS.map((tier) => badgeSvg({ key, tier }));
      expect(new Set(tiers).size).toBe(4);
      // large: the tier's milestone in figures, and no pips
      const milestones = badgeArt(key).milestones;
      TIERS.forEach((tier) => {
        const svg = badgeSvg({ key, tier });
        expect(figuresOf(svg), `${key} tier ${tier}`).toBe(String(milestones[tier - 1]).length);
        expect(pipsOf(svg).all, `${key} tier ${tier}`).toBe(0);
      });
      // small and tiny: four pips, as many lit as the tier, and no figures to squint at
      for (const size of [40, 24]) {
        TIERS.forEach((tier) => {
          const svg = badgeSvg({ key, tier, size });
          expect(pipsOf(svg), `${key} tier ${tier} at ${size}`).toEqual({ lit: tier, all: 4 });
          expect(figuresOf(svg)).toBe(0);
        });
      }
      // not yet earned: the first milestone to reach, quietly; small, four empty sockets
      expect(figuresOf(badgeSvg({ key, state: 'locked' }))).toBe(String(milestones[0]).length);
      expect(pipsOf(badgeSvg({ key, state: 'locked', size: 40 }))).toEqual({ lit: 0, all: 4 });
    }
    // "every unit of the course" is a star, not a figure
    expect(figuresOf(badgeSvg({ key: 'rewi', tier: 4 }))).toBe(0);
    expect(badgeSvg({ key: 'rewi', tier: 4 })).not.toBe(badgeSvg({ key: 'rewi', tier: 3 }));
    // a single badge has neither
    expect(pipsOf(badgeSvg({ key: 'hemereng' }))).toEqual({ lit: 0, all: 0 });
    expect(figuresOf(badgeSvg({ key: 'hemereng' }))).toBe(0);
  });

  it('gives single badges no pips and the same look whatever tier is asked for', () => {
    expect(badgeSvg({ key: 'hemereng', tier: 1 })).toBe(badgeSvg({ key: 'hemereng', tier: 4 }));
    expect(badgeSvg({ key: 'cihgirti' })).not.toBe(badgeSvg({ key: 'cihgirti', tiers: 4, tier: 2 }));
  });

  it('draws not-yet-earned and secret badges differently from earned ones', () => {
    for (const key of ['agir', 'tire-rast'] as BadgeKey[]) {
      const earned = badgeSvg({ key });
      expect(badgeSvg({ key, state: 'locked' })).not.toBe(earned);
      expect(badgeSvg({ key, state: 'secret' })).not.toBe(earned);
    }
    // a secret not yet found gives nothing away: every secret looks the same
    const secrets = BADGE_KEYS.filter((k) => badgeArt(k).family === 'secret').map((key) =>
      badgeSvg({ key, state: 'secret', idPrefix: 'x' }).replace(/<title[^<]*<\/title>/, ''),
    );
    expect(new Set(secrets.map((s) => s.replace(/<circle[^>]*fill-opacity[^>]*\/>/g, ''))).size).toBe(1);
  });

  it('shows Hevalo himself, the drawing he speaks with, in greys until it is earned', () => {
    const art = characterArt('hevalo', 'own');
    const antlers = wholePath(/ d="([^"]*)"/.exec(art.head)?.[1] ?? '');
    const fur = /fill="(#[0-9a-f]{6})"/.exec(art.head)?.[1] ?? '';
    expect(antlers.length).toBeGreaterThan(200);
    for (const key of ['agir', 'rank-ciya', 'newroz'] as BadgeKey[]) {
      expect(badgeSvg({ key })).toContain(antlers);
      expect(badgeSvg({ key, size: 40 })).toContain(antlers);
      expect(badgeSvg({ key, state: 'locked' })).toContain(antlers);
      expect(badgeSvg({ key, state: 'locked' })).not.toContain(fur);
    }
    // a secret, found or not, is not his
    expect(badgeSvg({ key: 'tire-rast' })).not.toContain(antlers);
    expect(badgeSvg({ key: 'tire-rast', state: 'secret' })).not.toContain(antlers);
  });

  it('gives every family a soft, symmetrical silhouette: every outward corner rounded', () => {
    for (const family of BADGE_FAMILIES) {
      const body = SHAPES[family].body;
      if (body.kind === 'circle') continue;
      const { vertices: v, radii } = body.shape;
      const area = v.reduce((sum, p, i) => {
        const q = v[(i + 1) % v.length] as readonly [number, number];
        return sum + p[0] * q[1] - q[0] * p[1];
      }, 0);
      v.forEach((p, i) => {
        const a = v[(i - 1 + v.length) % v.length] as readonly [number, number];
        const b = v[(i + 1) % v.length] as readonly [number, number];
        const outward = ((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])) * area > 0;
        if (outward) expect(radii[i], `${family} corner ${i}`).toBeGreaterThanOrEqual(7);
      });
      const key = ([x, y]: readonly [number, number]): string => `${x.toFixed(3)},${y.toFixed(3)}`;
      const points = new Set(v.map(key));
      // the leaf lies on the diagonal, so it is itself turned half round; the rest are their own mirror image
      for (const [x, y] of v) expect(points.has(key(family === 'friends' ? [120 - x, 112 - y] : [120 - x, y])), `${family} ${x},${y}`).toBe(true);
    }
  });

  it('respects the size it is asked for, and draws a small version under the threshold', () => {
    for (const size of [24, 32, 48, 55.5, 56, 96, 128, 256]) checkSvg(badgeSvg({ key: 'heval', tier: 2, size }), size);
    const small = badgeSvg({ key: 'heval', tier: 3, size: SMALL_BADGE - 1 });
    const large = badgeSvg({ key: 'heval', tier: 3, size: SMALL_BADGE });
    expect(small.replace(/width="\d+(\.\d+)?" height="\d+(\.\d+)?"/, '')).not.toBe(large.replace(/width="\d+" height="\d+"/, ''));
  });

  it('keeps a small badge to its plate, picture and pips: the light and the sparkle go', () => {
    for (const key of ['ders', 'agir', 'rank-lutke', 'newroz'] as BadgeKey[]) {
      const large = badgeSvg({ key, tier: 4 });
      const tiny = badgeSvg({ key, tier: 4, size: TINY_BADGE - 8 });
      const small = badgeSvg({ key, tier: 4, size: SMALL_BADGE - 8 });
      const lights = (svg: string): number => (svg.match(/<radialGradient/g) ?? []).length;
      expect(lights(tiny), key).toBeLessThan(lights(large));
      expect(elements(tiny), key).toBeLessThan(elements(small));
      expect(elements(small), key).toBeLessThan(elements(large));
    }
  });

  it('labels itself, and escapes a caller’s label', () => {
    expect(badgeSvg({ key: 'agir', tier: 3 })).toContain('<title id="');
    expect(badgeSvg({ key: 'agir', tier: 3 })).toMatch(/>Agir · Zêr<\/title>/);
    expect(badgeSvg({ key: 'agir', state: 'locked' })).toMatch(/>Agir · not earned yet<\/title>/);
    expect(badgeSvg({ key: 'tire-rast', state: 'secret' })).toMatch(/>Secret badge<\/title>/);
    const svg = badgeSvg({ key: 'agir', title: 'Fire & <b>"streak"</b>' });
    checkSvg(svg, 96);
    expect(svg).toContain('Fire &amp; &lt;b&gt;&quot;streak&quot;&lt;/b&gt;');
  });

  it('has a glint for Zêr and Firûze (and the single badges that wear their borders), drawn as its own layer', () => {
    expect(TIERS.map((tier) => badgeShines('ders', tier))).toEqual([false, false, true, true]);
    expect(badgeShines('hemereng')).toBe(true);
    expect(badgeShines('newroz', 4)).toBe(true);
    expect(badgeShines('vegera')).toBe(false);
    for (const family of BADGE_FAMILIES) {
      const key = BADGE_KEYS.find((k) => badgeArt(k).family === family) as BadgeKey;
      const frames = [0, 0.25, 0.5, 0.75, 1].map((phase) => badgeShineSvg({ key, phase, size: 96 }));
      for (const svg of frames) checkSvg(svg, 96);
      expect(new Set(frames).size).toBe(5);
      expect(badgeShineSvg({ key, phase: 0.25 })).toBe(frames[1]);
    }
    expect(() => badgeShineSvg({ key: 'agir', phase: 1.5 })).toThrow(RangeError);
    expect(() => badgeShineSvg({ key: 'agir', phase: Number.NaN })).toThrow(RangeError);
  });

  it('refuses what it cannot draw', () => {
    expect(() => badgeSvg({ key: 'night-owl' as BadgeKey })).toThrow(RangeError);
    expect(() => badgeSvg({ key: 'agir', tier: 5 as BadgeTier })).toThrow(RangeError);
    expect(() => badgeSvg({ key: 'agir', size: 0 })).toThrow(RangeError);
    expect(() => badgeSvg({ key: 'agir', size: Number.NaN })).toThrow(RangeError);
    expect(() => badgeSvg({ key: 'agir', idPrefix: 'a b"' })).toThrow(RangeError);
  });
});

/** Every point a path passes through or pulls toward, where it truly is on the page. */
function pointsOf(d: string): (readonly [number, number])[] {
  const ARGS: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
  const tokens = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)/g) ?? [];
  const out: (readonly [number, number])[] = [];
  let [x, y, sx, sy] = [0, 0, 0, 0];
  let cmd = '';
  for (let i = 0; i < tokens.length; ) {
    const t = tokens[i] as string;
    if (/[A-Za-z]/.test(t)) {
      cmd = t;
      i += 1;
      if (t === 'z' || t === 'Z') [x, y] = [sx, sy];
      continue;
    }
    const lower = cmd.toLowerCase();
    const args = tokens.slice(i, i + (ARGS[lower] ?? 0)).map(Number);
    i += args.length;
    const [ox, oy] = cmd === lower ? [x, y] : [0, 0];
    if (lower === 'h') x = ox + (args[0] ?? 0);
    else if (lower === 'v') y = oy + (args[0] ?? 0);
    else {
      const from = lower === 'a' ? 5 : 0;
      for (let k = from; k < args.length; k += 2) out.push([ox + (args[k] ?? 0), oy + (args[k + 1] ?? 0)]);
      [x, y] = [ox + (args[args.length - 2] ?? 0), oy + (args[args.length - 1] ?? 0)];
      if (lower === 'm') {
        [sx, sy] = [x, y];
        cmd = cmd === 'm' ? 'l' : 'L';
      }
    }
    out.push([x, y]);
  }
  return out;
}

describe('wholePath', () => {
  const near = (d: string): void => {
    const was = pointsOf(d);
    const now = pointsOf(wholePath(d));
    expect(now).toHaveLength(was.length);
    now.forEach(([x, y], i) => {
      const [wx, wy] = was[i] as readonly [number, number];
      expect(Math.abs(x - wx)).toBeLessThanOrEqual(0.5 + 1e-9);
      expect(Math.abs(y - wy)).toBeLessThanOrEqual(0.5 + 1e-9);
      expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true);
    });
  };

  it('never lets rounding add up along a long outline of small steps', () => {
    near(`M0.4,0.4${'c0.4,0.4 0.8,0.8 1.4,1.4s0.4,0.4 1.4,1.4'.repeat(60)}l-0.3,40.4h-20.4v-0.4z`);
    near('M174,266.6a10.4,10.4 0 1 0 20.8,0a10.4,10.4 0 1 0 -20.8,0zm5.5,1.5l2.4,2.4 2.4,2.4z');
    near('M10.6,10.4L30.4,20.6C40.4,40.6 50.5,60.5 70.4,80.6S90.4,100.4 110.6,90.4H5.5V2.5Z');
  });

  it('keeps every point of Hevalo within half a unit of where he was drawn', () => {
    const art = characterArt('hevalo', 'whole');
    const markup = (art.chest ?? '') + art.head + art.overlay + Object.values(art.eyes).join('') + Object.values(art.mouths).join('');
    const paths = [...markup.matchAll(/ d="([^"]*)"/g)].map((m) => m[1] as string);
    expect(paths.length).toBeGreaterThan(20);
    for (const d of paths) near(d);
  });

  it('gives back a path it cannot read as it came', () => {
    expect(wholePath('M1.5,2.5Q3.5')).toBe('M1.5,2.5Q3.5');
    expect(wholePath('M1.5,2.5X4,5')).toBe('M1.5,2.5X4,5');
  });
});

describe('ids across drawings', () => {
  it('never collide between two different drawings on one page', () => {
    const owner = new Map<string, string>();
    const drawings = [
      ...BADGE_KEYS.flatMap((key) => TIERS.map((tier) => badgeSvg({ key, tier }))),
      ...BADGE_KEYS.map((key) => badgeSvg({ key, state: 'locked', size: 40 })),
      ...RANK_TIERS.flatMap((tier) => [rankEmblemSvg({ tier }), rankEmblemSvg({ tier, division: 1 }), rankEmblemSvg({ tier, size: 40 })]),
      ...LEAGUE_TIERS.map((tier) => leagueEmblemSvg({ tier })),
      ...RANK_TIERS.flatMap((tier) => [seasonFrameSvg({ tier }), seasonFrameSvg({ tier, shine: true }), seasonFrameShineSvg({ tier })]),
      ...RANK_TIERS.map((tier) => rankEmblemSvg({ tier, season: { name: 'payiz', year: 2026 } })),
      ...BADGE_FAMILIES.map((family) => badgeShineSvg({ key: BADGE_KEYS.find((k) => badgeArt(k).family === family) as BadgeKey })),
    ];
    for (const svg of new Set(drawings)) {
      walk(parse(svg), (e) => {
        if (!e.attrs.id) return;
        const seen = owner.get(e.attrs.id);
        expect(seen === undefined || seen === svg, `id ${e.attrs.id} in two drawings`).toBe(true);
        owner.set(e.attrs.id, svg);
      });
    }
  });

  it('uses the caller’s prefix when given one', () => {
    const svg = badgeSvg({ key: 'diyari', tier: 2, idPrefix: 'gift-a' });
    walk(parse(svg), (e) => {
      if (e.attrs.id) expect(e.attrs.id.startsWith('gift-a')).toBe(true);
    });
  });
});

describe('rankEmblemSvg', () => {
  it('draws every tier with and without each division, large and small', () => {
    for (const tier of RANK_TIERS) {
      for (const division of [undefined, 3, 2, 1] as const) {
        for (const size of [32, 128]) checkSvg(rankEmblemSvg({ tier, division, size }), size);
      }
    }
  });

  it('is deterministic and draws each tier and division differently', () => {
    const all = RANK_TIERS.flatMap((tier) => ([3, 2, 1] as const).map((division) => rankEmblemSvg({ tier, division })));
    expect(all).toEqual(RANK_TIERS.flatMap((tier) => ([3, 2, 1] as const).map((division) => rankEmblemSvg({ tier, division }))));
    // Stêrk has no divisions, so its three are one
    expect(new Set(all).size).toBe(5 * 3 + 1);
  });

  it('names the tier, the division and the meaning', () => {
    expect(rankEmblemSvg({ tier: 'ciya', division: 2 })).toMatch(/>Çiya II \(Mountain\)<\/title>/);
    expect(rankEmblemSvg({ tier: 'dest', division: 3 })).toMatch(/>Deşt III \(Plain\)<\/title>/);
    expect(rankEmblemSvg({ tier: 'sterk', division: 1 })).toMatch(/>Stêrk \(Star\)<\/title>/);
  });

  it('counts the division in stones under the crest: one lit for III, two for II, three for I', () => {
    for (const tier of RANK_TIERS.filter((t) => t !== 'sterk')) {
      for (const division of [3, 2, 1] as const) expect(stonesOf(rankEmblemSvg({ tier, division })), `${tier} ${division}`).toEqual({ lit: 4 - division, all: 3 });
      expect(stonesOf(rankEmblemSvg({ tier }))).toEqual({ lit: 0, all: 0 });
      // small, the stones give way to a bigger crest; the app writes the division beside it
      expect(stonesOf(rankEmblemSvg({ tier, division: 1, size: SMALL_EMBLEM - 1 }))).toEqual({ lit: 0, all: 0 });
    }
    expect(stonesOf(rankEmblemSvg({ tier: 'sterk', division: 1 }))).toEqual({ lit: 0, all: 0 });
  });

  it('grows its setting with every tier, and keeps the light for the top two', () => {
    // a lone stone at the foot, the full crest at the top: each tier has more feathers than the one under it
    const setting = RANK_TIERS.map((tier) => blades(rankEmblemSvg({ tier })));
    expect(setting[0]).toBe(0);
    for (let i = 1; i < setting.length; i++) expect(setting[i], RANK_TIERS[i]).toBeGreaterThan(setting[i - 1] as number);
    expect(RANK_TIERS.map((tier) => glows(rankEmblemSvg({ tier })) > 0)).toEqual([false, false, false, false, true, true]);
    // each stone has the place it is named for cut into it
    for (const tier of RANK_TIERS) expect(hasGlyph(rankEmblemSvg({ tier })), tier).toBe(true);
  });

  it('draws less as it gets smaller: the fine things go first, then the stone’s table and its glyph', () => {
    for (const tier of RANK_TIERS) {
      const large = rankEmblemSvg({ tier, size: 128 });
      const small = rankEmblemSvg({ tier, size: SMALL_EMBLEM - 8 });
      const tiny = rankEmblemSvg({ tier, size: TINY_EMBLEM - 8 });
      expect(elements(small), tier).toBeLessThan(elements(large));
      expect(elements(tiny), tier).toBeLessThan(elements(small));
      expect(tiny.length, tier).toBeLessThan(large.length);
      expect(hasGlyph(tiny), tier).toBe(false);
    }
  });

  it('refuses an unknown tier or division', () => {
    expect(() => rankEmblemSvg({ tier: 'bronze' as never })).toThrow(RangeError);
    expect(() => rankEmblemSvg({ tier: 'gir', division: 4 as never })).toThrow(RangeError);
  });

  it('draws the placement emblem, counting the games played', () => {
    const all = [0, 1, 2, 3, 4, 5].map((done) => placementEmblemSvg({ done }));
    expect(new Set(all).size).toBe(6);
    all.forEach((svg) => checkSvg(svg, 128));
    checkSvg(placementEmblemSvg({ done: 2, size: 32 }), 32);
    expect(placementEmblemSvg({ done: 2 })).toMatch(/>Placing 2\/5<\/title>/);
    expect(placementEmblemSvg({ done: 2 })).toBe(all[2]);
    expect(PLACEMENT_GAMES).toBe(5);
    // five stones under it, as many lit as games played; small, the stones go but the stone's own facets still count
    all.forEach((svg, done) => expect(stonesOf(svg)).toEqual({ lit: done, all: 5 }));
    const small = [0, 1, 2, 3, 4, 5].map((done) => placementEmblemSvg({ done, size: 24, idPrefix: 'p' }));
    expect(new Set(small).size).toBe(6);
    small.forEach((svg) => expect(stonesOf(svg).all).toBe(0));
    expect(() => placementEmblemSvg({ done: 6 })).toThrow(RangeError);
    expect(() => placementEmblemSvg({ done: 1.5 })).toThrow(RangeError);
  });

  it('draws a season’s emblem with the season’s mark in place of the division', () => {
    for (const tier of RANK_TIERS) {
      for (const name of SEASONS) {
        const svg = rankEmblemSvg({ tier, season: { name, year: 2027 } });
        checkSvg(svg, 128);
        expect(svg).not.toBe(rankEmblemSvg({ tier }));
      }
    }
    // a season is told apart by its glyph and its year, and the division gives way to it
    const spring27 = rankEmblemSvg({ tier: 'ciya', season: { name: 'bihar', year: 2027 } });
    expect(rankEmblemSvg({ tier: 'ciya', season: { name: 'bihar', year: 2028 } })).not.toBe(spring27);
    expect(rankEmblemSvg({ tier: 'ciya', season: { name: 'havin', year: 2027 } })).not.toBe(spring27);
    expect(rankEmblemSvg({ tier: 'ciya', division: 1, season: { name: 'bihar', year: 2027 } })).toBe(spring27);
    expect(spring27).toMatch(/>Çiya \(Mountain\) · Bihar 2027<\/title>/);
    expect(() => rankEmblemSvg({ tier: 'ciya', season: { name: 'monsoon' as never, year: 2027 } })).toThrow(RangeError);
    expect(() => rankEmblemSvg({ tier: 'ciya', season: { name: 'bihar', year: 27 } })).toThrow(RangeError);
  });
});

describe('leagueEmblemSvg', () => {
  it('draws every water tier, large and small, differently and deterministically', () => {
    const all = LEAGUE_TIERS.map((tier) => leagueEmblemSvg({ tier }));
    expect(new Set(all).size).toBe(6);
    for (const tier of LEAGUE_TIERS) {
      for (const size of [32, 128]) checkSvg(leagueEmblemSvg({ tier, size }), size);
      expect(leagueEmblemSvg({ tier })).toBe(leagueEmblemSvg({ tier }));
    }
    expect(leagueEmblemSvg({ tier: 'okyanus' })).toMatch(/>Okyanûs \(Ocean\)<\/title>/);
    // smaller, less: the tiny size keeps the outline and loses the stone's table and its glyph
    for (const tier of LEAGUE_TIERS) {
      expect(elements(leagueEmblemSvg({ tier, size: 24 })), tier).toBeLessThan(elements(leagueEmblemSvg({ tier })));
      expect(hasGlyph(leagueEmblemSvg({ tier })), tier).toBe(true);
      expect(hasGlyph(leagueEmblemSvg({ tier, size: 24 })), tier).toBe(false);
    }
    // the setting grows from a lone drop to the ocean's full crest, and the sea and the ocean glow
    const setting = LEAGUE_TIERS.map((tier) => blades(leagueEmblemSvg({ tier })));
    expect(setting[0]).toBe(0);
    for (let i = 1; i < setting.length; i++) expect(setting[i], LEAGUE_TIERS[i]).toBeGreaterThan(setting[i - 1] as number);
    expect(LEAGUE_TIERS.map((tier) => glows(leagueEmblemSvg({ tier })) > 0)).toEqual([false, false, false, false, true, true]);
    expect(() => leagueEmblemSvg({ tier: 'diamond' as never })).toThrow(RangeError);
  });

  it('draws a league not reached yet as its own outline, flat, with a keyhole and no stone', () => {
    const locked = { body: '#dfe3e8', mark: '#9aa3ad' };
    for (const tier of LEAGUE_TIERS) {
      const svg = leagueEmblemSvg({ tier, locked, size: 64 });
      checkSvg(svg, 64);
      // two groups, the body and then the marks, with no colour of their own inside — so a page recolours each with one rule
      const groups = parse(svg).children.filter((e) => e.name === 'g');
      expect(groups.map((g) => g.attrs.fill)).toEqual(['#dfe3e8', '#9aa3ad']);
      walk(parse(svg), (e) => {
        if (e.name === 'path') expect(['none', undefined], tier).toContain(e.attrs.fill);
      });
      expect(elements(svg), tier).toBeLessThan(elements(leagueEmblemSvg({ tier, size: 64 })) / 3);
    }
    // each keeps its own outline — its cut and its setting — so the ladder still reads from a drop to the ocean
    expect(new Set(LEAGUE_TIERS.map((tier) => leagueEmblemSvg({ tier, locked })))).toHaveProperty('size', 6);
  });
});

describe('seasonFrameSvg', () => {
  it('draws every tier, with and without a still shine, and leaves the middle for the avatar', () => {
    for (const tier of RANK_TIERS) {
      for (const size of [40, 128]) {
        checkSvg(seasonFrameSvg({ tier, size }), size);
        checkSvg(seasonFrameSvg({ tier, size, shine: true }), size);
      }
      expect(seasonFrameSvg({ tier, shine: true })).not.toBe(seasonFrameSvg({ tier }));
      // nothing is painted over the avatar: no filled shape covers the centre
      expect(seasonFrameSvg({ tier })).not.toMatch(/<rect /);
    }
    expect(SEASON_FRAME_INNER).toBeGreaterThan(0.5);
    expect(SEASON_FRAME_INNER).toBeLessThan(0.8);
  });

  it('marks Lûtke and Stêrk as the animated frames, and draws their glint as its own layer', () => {
    expect(RANK_TIERS.filter((t) => SEASON_FRAME_SHINE[t])).toEqual(['lutke', 'sterk']);
    for (const tier of RANK_TIERS) {
      const shine = seasonFrameShineSvg({ tier, size: 96 });
      checkSvg(shine, 96);
      expect(shine).toBe(seasonFrameShineSvg({ tier, size: 96 }));
    }
  });
});

describe('the label', () => {
  /** A caller's title can be anything: markup, quotes, an ampersand, characters XML cannot carry. */
  const nasty = `</title><script>alert("hi")</script> & 'q' \u0007\u0000\ud800 Çiya`;
  const builders: [string, (title: string) => string][] = [
    ['badge', (title) => badgeSvg({ key: 'agir', tier: 2, title })],
    ['rank', (title) => rankEmblemSvg({ tier: 'ciya', division: 2, title })],
    ['season', (title) => rankEmblemSvg({ tier: 'gir', season: { name: 'bihar', year: 2027 }, title })],
    ['placement', (title) => placementEmblemSvg({ done: 2, title })],
    ['league', (title) => leagueEmblemSvg({ tier: 'gol', title })],
    ['frame', (title) => seasonFrameSvg({ tier: 'lutke', title })],
  ];

  it.each(builders)('is escaped in the %s, so it is only ever text', (_name, build) => {
    const svg = build(nasty);
    const size = Number(/width="([\d.]+)"/.exec(svg)?.[1]);
    checkSvg(svg, size);
    expect(svg).not.toMatch(/<script|<\/title><script/);
    const title = parse(svg).children[0];
    expect(title?.name).toBe('title');
    expect(title?.children).toEqual([]);
    expect(title?.text).toBe('&lt;/title&gt;&lt;script&gt;alert(&quot;hi&quot;)&lt;/script&gt; &amp; &apos;q&apos;  Çiya');
    // nothing XML cannot carry: no control characters, no half of a surrogate pair
    expect(svg).not.toMatch(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/);
    expect(/[\ud800-\udfff]/.test(svg.replace(/[\ud800-\udbff][\udc00-\udfff]/g, ''))).toBe(false);
  });

  it('keeps whole characters, emoji and all, and only drops what XML cannot carry', () => {
    expect(escapeXml('Heval 🌸 & <b>')).toBe('Heval 🌸 &amp; &lt;b&gt;');
    expect(escapeXml('a\tb\nc')).toBe('a\tb\nc');
    expect(escapeXml('x\u0001y\ufffez\udc00')).toBe('xyz');
  });
});

describe('light', () => {
  it('never reaches the edge of the square, so no glow shows a hard side', () => {
    const drawings = [
      ...RANK_TIERS.flatMap((tier) => [rankEmblemSvg({ tier }), rankEmblemSvg({ tier, division: 1 }), rankEmblemSvg({ tier, size: 40 }), rankEmblemSvg({ tier, season: { name: 'havin', year: 2026 } })]),
      ...LEAGUE_TIERS.flatMap((tier) => [leagueEmblemSvg({ tier }), leagueEmblemSvg({ tier, size: 40 })]),
      ...RANK_TIERS.flatMap((tier) => [seasonFrameSvg({ tier }), seasonFrameSvg({ tier, size: 40 })]),
      ...TIERS.flatMap((tier) => [badgeSvg({ key: 'agir', tier }), badgeSvg({ key: 'agir', tier, size: 40 })]),
    ];
    for (const svg of drawings) {
      walk(parse(svg), (e) => {
        // a glow is a radial fade to nothing; the enamel's own gradient is clipped to the piece and never fades out
        if (e.name !== 'radialGradient' || e.attrs.gradientUnits !== 'userSpaceOnUse' || e.children.at(-1)?.attrs['stop-opacity'] !== '0') return;
        const [cx, cy, r] = [Number(e.attrs.cx), Number(e.attrs.cy), Number(e.attrs.r)];
        expect(Math.min(cx - r, cy - r), svg.slice(0, 160)).toBeGreaterThanOrEqual(0);
        expect(Math.max(cx + r, cy + r), svg.slice(0, 160)).toBeLessThanOrEqual(120);
      });
    }
  });
});

describe('weight', () => {
  it('keeps every drawing small enough to inline a page of them', () => {
    // a badge carries Hevalo himself, the drawing he speaks with, so it may be half as heavy again as an emblem
    const badges = Math.max(...BADGE_KEYS.flatMap((key) => TIERS.flatMap((tier) => [badgeSvg({ key, tier }).length, badgeSvg({ key, tier, size: 40 }).length])));
    expect(badges).toBeLessThan(24 * 1024);
    const biggest = Math.max(
      ...RANK_TIERS.map((tier) => rankEmblemSvg({ tier, division: 1 }).length),
      ...LEAGUE_TIERS.map((tier) => leagueEmblemSvg({ tier }).length),
      ...RANK_TIERS.map((tier) => seasonFrameSvg({ tier, shine: true }).length),
      ...RANK_TIERS.map((tier) => rankEmblemSvg({ tier, season: { name: 'payiz', year: 2026 } }).length),
      ...[0, 5].map((done) => placementEmblemSvg({ done }).length),
    );
    expect(biggest).toBeLessThan(16 * 1024);
  });
});
