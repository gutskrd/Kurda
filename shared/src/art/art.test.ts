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
import { coinSvg, gemSvg } from './currency.js';
import { wordSetSvg } from './word-sets.js';
import {
  IMPOSTOR_CATEGORY_PICTURES,
  IMPOSTOR_EMBLEMS_DRAWN,
  IMPOSTOR_WAYS_DRAWN,
  impostorCategoriesInOrder,
  impostorCategoryRank,
  impostorCategorySvg,
  impostorCategoryTone,
  impostorEmblemSvg,
  impostorWaySvg,
  impostorWayTone,
} from './impostor.js';
import { GAME_EMBLEMS, GAME_EMBLEM_SAMPLES, gameEmblemLayers, gameEmblemLoopMs, gameEmblemSvg, gameEmblemTone, isGameEmblem } from './games.js';
import { EMAIL_PICTURES, emailPictureLoopMs, emailPictureStill, emailPictureSvg, emailPictureTone, type EmailPicture } from './email.js';
import { TICKET_ART_BOX, TICKET_ART_TEAR, TICKET_ART_TILES } from './ticket.js';
import {
  PATH_LANDMARK_LOOP,
  PATH_STOP_ART,
  PATH_STOP_LOOKS,
  pathLandSvg,
  pathLandmarkSvg,
  pathLoopSvg,
  pathStonesSvg,
  pathStopSvg,
  type PathStopLook,
} from './path-land.js';
import { PATH_CAIRN_GROUNDS, PATH_LANDMARKS, PATH_LANDS, cairnBox, trailStones } from '../path-world.js';
import { lessonPath } from '../lesson-path.js';
import { WORD_SET_IDS } from '../word-sets/words.js';
import {
  CHEST_BOX,
  CHEST_FOOT,
  CHEST_HOP,
  CHEST_HOP_LAND,
  CHEST_HOP_LID,
  CHEST_HOP_LIGHT,
  CHEST_HOP_MS,
  CHEST_HOP_SHADOW,
  CHEST_HOP_SPARKLE,
  CHEST_LAYERS,
  CHEST_TINTS,
  chestDrawing,
  chestGlint,
  chestHopAt,
  chestLayerSvg,
  chestSvg,
  type ChestHopCurve,
  type ChestLayerId,
} from './chest.js';
import type { ChestTier } from '../quests.js';
import { SEASON_ICONS } from './icons.js';
import { PICTURES } from './pictures.js';
import { PROPS } from './props/index.js';
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
  it('has the 62 badge types of the catalogue, in their seven families', () => {
    expect(BADGE_KEYS).toHaveLength(62);
    const count = (family: string): number => BADGE_KEYS.filter((k) => badgeArt(k).family === family).length;
    expect(BADGE_FAMILIES.map(count)).toEqual([11, 8, 10, 8, 5, 10, 10]);
    expect(new Set(BADGE_KEYS).size).toBe(62);
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
    // a picture Hevalo shows (props/) or one that stands alone (pictures.ts); the ranked tiers show their rank's stone
    const drawn = (key: string): number => (PROPS[key] ? 1 : 0) + (PICTURES[key] ? 1 : 0);
    const stones = Object.values(RANK_BADGE) as string[];
    const undrawn = CATALOGUE.filter((b) => !stones.includes(b.key) && drawn(b.key) === 0).map((b) => b.key);
    expect(undrawn, 'catalogue badges with no picture').toEqual([]);
    expect(CATALOGUE.filter((b) => drawn(b.key) > 1).map((b) => b.key), 'badges drawn twice').toEqual([]);
    for (const tier of RANK_TIERS) expect(isBadgeKey(RANK_BADGE[tier]), `${tier} has a ranked badge`).toBe(true);
    expect([...Object.keys(PROPS), ...Object.keys(PICTURES)].filter((k) => !isBadgeKey(k)), 'drawings for no catalogue badge').toEqual([]);
    // the flat glyphs left are the seasons' marks on a season's emblem
    expect(Object.keys(SEASON_ICONS).sort()).toEqual([...SEASONS].sort());
  });

  it('draws every secret whole, in its own colours', () => {
    for (const b of CATALOGUE.filter((d) => d.family === 'secret')) expect(PICTURES[b.key], b.key).toBeDefined();
  });

  it('sets a picture drawn whole on its plate without Hevalo, and with him every badge that has an icon', () => {
    const hevalo = (svg: string): boolean => /-antler|-head|-ear/.test(svg);
    for (const key of BADGE_KEYS.filter((k) => badgeArt(k).family !== 'secret' && !Object.values(RANK_BADGE).includes(k))) {
      expect(hevalo(badgeSvg({ key, tier: 2 })), key).toBe(PICTURES[key] === undefined);
    }
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
        // a glow is a radial fade to nothing; the enamel's own gradient is clipped to the piece and never fades out, and a
        // picture's own gradients (pen.ts) are in its own small box, placed with it
        if (e.name !== 'radialGradient' || e.attrs.gradientUnits !== 'userSpaceOnUse' || e.children.at(-1)?.attrs['stop-opacity'] !== '0') return;
        if (/pen[lbro]\d+$/.test(e.attrs.id ?? '')) return;
        const [cx, cy, r] = [Number(e.attrs.cx), Number(e.attrs.cy), Number(e.attrs.r)];
        expect(Math.min(cx - r, cy - r), svg.slice(0, 160)).toBeGreaterThanOrEqual(0);
        expect(Math.max(cx + r, cy + r), svg.slice(0, 160)).toBeLessThanOrEqual(120);
      });
    }
  });
});

describe('weight', () => {
  it('keeps every drawing small enough to inline a page of them', () => {
    // a badge carries Hevalo himself, the drawing he speaks with, and its metal, ribbon and wings, so it may be heavier than an
    // emblem; the most detailed of the drawings (the boy fishing the sky from the moon) sets how much heavier
    const badges = Math.max(...BADGE_KEYS.flatMap((key) => TIERS.flatMap((tier) => [badgeSvg({ key, tier }).length, badgeSvg({ key, tier, size: 40 }).length])));
    expect(badges).toBeLessThan(32 * 1024);
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

describe('the currencies', () => {
  const SIZES = [13, 15, 20, 26, 36, 64, 160];

  it('draws Zêr and the gem as valid, self-contained pictures at every size the apps show them', () => {
    for (const size of SIZES) {
      checkSvg(coinSvg({ size }), size);
      checkSvg(gemSvg({ size }), size);
    }
  });

  it('draws the same picture every time, with ids of its own beside the other', () => {
    expect(coinSvg({ size: 30 })).toBe(coinSvg({ size: 30 }));
    const coin = new Set([...coinSvg({ size: 30 }).matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
    const gem = [...gemSvg({ size: 30 }).matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(gem.filter((id) => coin.has(id))).toEqual([]);
  });

  it('raises one deer on the coin, its shadow down and to the left, its edges lit where there is room', () => {
    // the deer is one outline, antlers and ears and all, drawn again for each of its layers
    const deerLayers = (svg: string): number => {
      const counts = new Map<string, number>();
      for (const m of svg.matchAll(/ d="([^"]+)"/g)) counts.set(m[1]!, (counts.get(m[1]!) ?? 0) + 1);
      return Math.max(...counts.values());
    };
    // the shadow and the gold
    expect(deerLayers(coinSvg({ size: 26 }))).toBe(2);
    // and, large, the light along its upper edges: the lit copy, the gold clipped to the outline, and the clip itself
    expect(deerLayers(coinSvg({ size: 64 }))).toBe(4);
    expect(coinSvg({ size: 64 })).toContain('transform="translate(-0.9 1.3)"');
    expect(coinSvg({ size: 64 })).toContain('<title');
  });

  it('keeps the fine lines and the sparkle for the sizes with room for them', () => {
    const paths = (svg: string): number => (svg.match(/<path/g) ?? []).length;
    expect(paths(coinSvg({ size: 15 }))).toBeLessThan(paths(coinSvg({ size: 26 })));
    expect(paths(coinSvg({ size: 26 }))).toBeLessThan(paths(coinSvg({ size: 64 })));
    expect(paths(gemSvg({ size: 15 }))).toBeLessThan(paths(gemSvg({ size: 26 })));
    expect(paths(gemSvg({ size: 26 }))).toBeLessThan(paths(gemSvg({ size: 64 })));
  });
});

describe('the word sets’ pictures', () => {
  it('draws a valid, self-contained picture for every set and for the alphabet, at the cards’ size and larger', () => {
    for (const set of WORD_SET_IDS) {
      for (const size of [44, 120]) checkSvg(wordSetSvg({ set, size }), size);
    }
    for (const script of ['latin', 'arabic'] as const) {
      for (const size of [44, 120]) checkSvg(wordSetSvg({ set: 'letters', script, size }), size);
    }
  });

  it('writes the alphabet’s first letters on its blocks in the reader’s script, with pe’s three dots and be’s one', () => {
    const latin = wordSetSvg({ set: 'letters', size: 44 });
    const arabic = wordSetSvg({ set: 'letters', script: 'arabic', size: 44 });
    expect(latin).not.toBe(arabic);
    expect(wordSetSvg({ set: 'letters', script: 'latin', size: 44 })).toBe(latin);
    // the letters are pen strokes, never text
    for (const svg of [latin, arabic]) expect(svg).not.toMatch(/<text/);
    expect((latin.match(/<circle/g) ?? []).length).toBe(0);
    expect((arabic.match(/<circle/g) ?? []).length).toBe(4);
  });

  it('gives every set its own picture, the same every time, with ids that never meet another set’s', () => {
    const svgs = WORD_SET_IDS.map((set) => wordSetSvg({ set, size: 44 }));
    expect(new Set(svgs).size).toBe(WORD_SET_IDS.length);
    expect(wordSetSvg({ set: 'months', size: 44 })).toBe(svgs[WORD_SET_IDS.indexOf('months')]);
    const seen = new Set<string>();
    for (const svg of svgs) {
      for (const [, id] of svg.matchAll(/ id="([^"]+)"/g)) {
        expect(seen.has(id!), id).toBe(false);
        seen.add(id!);
      }
    }
  });

  it('counts the numbers on the abacus instead of writing them, one bead, then two, then three', () => {
    // each bead is three ellipses: its edge, its face and its spot of light
    expect((wordSetSvg({ set: 'numbers', size: 44 }).match(/<ellipse/g) ?? []).length).toBe(6 * 3);
  });
});

describe('the games’ emblems', () => {
  // every game Learn's Games page can list: the three with pages of their own, and the registry's games
  const LISTED = ['peyvok', 'rhyme', 'race', 'memory-thief', 'what-would-you-say', 'detective', 'last-letter', 'impostor', 'who-am-i'];

  it('draws a valid, self-contained emblem for every game, small and large', () => {
    for (const size of [40, 84, 148]) for (const game of GAME_EMBLEMS) checkSvg(gameEmblemSvg({ game, size }), size);
  });

  it('has an emblem of its own for every game on the page, and no two alike', () => {
    expect([...GAME_EMBLEMS].sort()).toEqual([...LISTED].sort());
    const strip = (svg: string): string => svg.replace(/hv[0-9a-z]+/g, 'id').replace(/<title[^>]*>[^<]*<\/title>/, '');
    const all = GAME_EMBLEMS.map((game) => strip(gameEmblemSvg({ game })));
    expect(new Set(all).size).toBe(all.length);
  });

  it('writes nothing in a picture: no letters and no numerals, so it reads the same in every language', () => {
    for (const game of GAME_EMBLEMS) expect(gameEmblemSvg({ game })).not.toMatch(/<text\b/);
  });

  it('gives Kurdish Impostor the hand of cards its own page shows', () => {
    const strip = (svg: string): string => svg.replace(/ (id|aria-labelledby)="[^"]*"/g, '').replace(/url\(#[^)]*\)/g, 'url()');
    expect(strip(gameEmblemSvg({ game: 'impostor', size: 120 }))).toBe(strip(impostorEmblemSvg({ emblem: 'cards', size: 120 })));
  });

  describe('in motion', () => {
    const layersOf = (game: (typeof GAME_EMBLEMS)[number]) => gameEmblemLayers({ game, size: 120 });

    it('draws every emblem in layers, each a whole valid picture, with a pose for every moment of the loop', () => {
      for (const game of GAME_EMBLEMS) {
        const layers = layersOf(game);
        expect(layers.length, game).toBeGreaterThanOrEqual(2);
        // something in every emblem acts: a picture that only sits there has no loop to speak of
        expect(layers.some((l) => l.poses !== null), game).toBe(true);
        for (const layer of layers) {
          checkSvg(layer.svg, 120);
          expect(layer.svg).not.toMatch(/<text\b/);
          if (layer.poses) expect(layer.poses).toHaveLength(GAME_EMBLEM_SAMPLES + 1);
          for (const edge of layer.pivot) expect(edge >= 0 && edge <= 120, game).toBe(true);
        }
        expect(gameEmblemLoopMs(game), game).toBeGreaterThanOrEqual(4000);
        expect(gameEmblemLoopMs(game), game).toBeLessThanOrEqual(7000);
      }
    });

    it('ends every loop where it began, so it goes round without a jump', () => {
      for (const game of GAME_EMBLEMS) {
        for (const layer of layersOf(game)) {
          if (!layer.poses) continue;
          const [first, last] = [layer.poses[0]!, layer.poses[GAME_EMBLEM_SAMPLES]!];
          for (const field of ['x', 'y', 'sx', 'sy', 'o'] as const) expect(last[field], `${game} ${field}`).toBeCloseTo(first[field], 2);
          // a hand that has gone once round is where it started
          expect(((last.r - first.r) % 360 + 360) % 360, `${game} turn`).toBeCloseTo(0, 2);
        }
      }
    });

    it('keeps every part inside the picture, at a size and an opacity a part can have', () => {
      for (const game of GAME_EMBLEMS) {
        for (const layer of layersOf(game)) {
          for (const pose of layer.poses ?? []) {
            for (const value of Object.values(pose)) expect(Number.isFinite(value), game).toBe(true);
            expect(Math.abs(pose.x) <= 40 && Math.abs(pose.y) <= 40, game).toBe(true);
            expect(pose.sx >= 0 && pose.sx <= 1.5 && pose.sy >= 0 && pose.sy <= 1.5, game).toBe(true);
            expect(pose.o >= 0 && pose.o <= 1, game).toBe(true);
          }
        }
      }
    });

    it('is never an empty picture: at every moment something of the emblem is there to see', () => {
      for (const game of GAME_EMBLEMS) {
        const layers = layersOf(game);
        for (let at = 0; at <= GAME_EMBLEM_SAMPLES; at++) {
          const seen = layers.some((l) => l.poses === null || (l.poses[at]!.o > 0.6 && l.poses[at]!.sx > 0.6 && l.poses[at]!.sy > 0.6));
          expect(seen, `${game} at ${at}`).toBe(true);
        }
      }
    });

    it('rests: for a good part of every loop nothing in the emblem moves at all', () => {
      for (const game of GAME_EMBLEMS.filter((g) => g !== 'race' && g !== 'who-am-i')) {
        const moving = layersOf(game).filter((l) => l.poses !== null);
        let still = 0;
        for (let at = 1; at <= GAME_EMBLEM_SAMPLES; at++) {
          const same = moving.every((l) => JSON.stringify(l.poses![at]) === JSON.stringify(l.poses![at - 1]));
          if (same) still++;
        }
        // the race's hand and the asker's sway never stop; everything else has moments of rest between its beats
        expect(still / GAME_EMBLEM_SAMPLES, game).toBeGreaterThanOrEqual(0.08);
      }
    });

    it('is the same loop every time it is asked for', () => {
      for (const game of GAME_EMBLEMS) expect(JSON.stringify(layersOf(game).map((l) => l.poses))).toBe(JSON.stringify(layersOf(game).map((l) => l.poses)));
    });
  });

  it('has a colour for every game’s card, and refuses a game it has never heard of', () => {
    for (const game of GAME_EMBLEMS) expect(gameEmblemTone(game)).toMatch(/^#[0-9a-f]{6}$/);
    expect(isGameEmblem('peyvok')).toBe(true);
    expect(isGameEmblem('constructor')).toBe(false);
    expect(() => gameEmblemSvg({ game: 'bluff' as never })).toThrow(RangeError);
    expect(() => gameEmblemTone('toString' as never)).toThrow(RangeError);
  });
});

describe('Kurdish Impostor’s pictures', () => {
  // the starter categories (api/src/games/word-categories.ts): every one of them has a picture of its own
  const STARTER = [
    'animals', 'food', 'fruit', 'vegetables', 'drinks', 'family', 'body', 'clothes', 'home', 'jobs', 'nature', 'town', 'transport', 'colours',
    'school', 'time', 'kitchen', 'feelings', 'play', 'music', 'celebrations', 'tools', 'village', 'numbers', 'weather', 'health', 'people',
    'taste', 'stories', 'money', 'qualities', 'character', 'actions', 'culture', 'language', 'work', 'travel', 'things', 'sports', 'world',
  ];

  it('draws a valid, self-contained picture for every category, way to play and emblem, small and large', () => {
    for (const size of [40, 56, 120]) {
      for (const category of [null, ...IMPOSTOR_CATEGORY_PICTURES, 'a-category-an-editor-made']) checkSvg(impostorCategorySvg({ category, size }), size);
      for (const way of IMPOSTOR_WAYS_DRAWN) checkSvg(impostorWaySvg({ way, size }), size);
      for (const emblem of IMPOSTOR_EMBLEMS_DRAWN) checkSvg(impostorEmblemSvg({ emblem, size }), size);
    }
  });

  it('has a picture of its own for each of the forty starter categories, and no two alike', () => {
    expect([...IMPOSTOR_CATEGORY_PICTURES].sort()).toEqual([...STARTER].sort());
    const strip = (svg: string): string => svg.replace(/hv[0-9a-z]+/g, 'id').replace(/<title[^>]*>[^<]*<\/title>/, '');
    const all = [null, ...IMPOSTOR_CATEGORY_PICTURES].map((category) => strip(impostorCategorySvg({ category })));
    expect(new Set(all).size).toBe(all.length);
    const ways = IMPOSTOR_WAYS_DRAWN.map((way) => strip(impostorWaySvg({ way })));
    expect(new Set(ways).size).toBe(3);
  });

  it('gives a category nobody has drawn the label every category can wear, and any category the fan of cards', () => {
    const strip = (svg: string): string => svg.replace(/ (id|aria-labelledby)="[^"]*"/g, '').replace(/url\(#[^)]*\)/g, 'url()');
    const label = impostorCategorySvg({ category: 'made-later' });
    expect(strip(impostorCategorySvg({ category: 'another-one' }))).toBe(strip(label));
    expect(strip(label)).not.toBe(strip(impostorCategorySvg({ category: 'animals' })));
    expect(strip(impostorCategorySvg({ category: null }))).not.toBe(strip(label));
    // a slug that is a word of the language's own is no picture: only the listed ones are
    expect(strip(impostorCategorySvg({ category: 'constructor' }))).toBe(strip(label));
    expect(impostorCategoryTone('constructor')).toBe(impostorCategoryTone('made-later'));
  });

  it('is the same picture every time, labels itself, and never writes a word or a numeral', () => {
    for (const category of [null, ...IMPOSTOR_CATEGORY_PICTURES]) {
      const svg = impostorCategorySvg({ category });
      expect(impostorCategorySvg({ category })).toBe(svg);
      expect(svg).toMatch(/<title id="[^"]+">[^<]+<\/title>/);
      expect(svg).not.toMatch(/<text/);
    }
    expect(impostorCategorySvg({ category: 'fruit', title: 'fêkî & <sêv>' })).toContain('fêkî &amp; &lt;sêv&gt;');
    // the numbers are counted, one bead, two, three: each bead is three ellipses
    expect((impostorCategorySvg({ category: 'numbers' }).match(/<ellipse/g) ?? []).length).toBe(6 * 3);
  });

  it('keeps ids apart between the pictures on one page, and uses a caller’s prefix', () => {
    const seen = new Set<string>();
    const all = [
      ...[null, ...IMPOSTOR_CATEGORY_PICTURES].map((category) => impostorCategorySvg({ category })),
      ...IMPOSTOR_WAYS_DRAWN.map((way) => impostorWaySvg({ way })),
      ...IMPOSTOR_EMBLEMS_DRAWN.map((emblem) => impostorEmblemSvg({ emblem })),
    ];
    for (const svg of all) {
      for (const [, id] of svg.matchAll(/ id="([^"]+)"/g)) {
        expect(seen.has(id!), id).toBe(false);
        seen.add(id!);
      }
    }
    expect(impostorWaySvg({ way: 'odd', idPrefix: 'mine' })).toContain('id="minet"');
  });

  it('has a colour for every tile, and stays light enough to put a page of them on one screen', () => {
    for (const category of [null, ...IMPOSTOR_CATEGORY_PICTURES, 'made-later']) expect(impostorCategoryTone(category)).toMatch(/^#[0-9a-f]{6}$/);
    for (const way of IMPOSTOR_WAYS_DRAWN) expect(impostorWayTone(way)).toMatch(/^#[0-9a-f]{6}$/);
    const heaviest = Math.max(...[null, ...IMPOSTOR_CATEGORY_PICTURES].map((category) => impostorCategorySvg({ category }).length));
    expect(heaviest).toBeLessThan(6 * 1024);
  });

  it('lists categories with the easily named ones first, and one nobody has drawn after them all', () => {
    const listed = impostorCategoriesInOrder([{ slug: 'world' }, { slug: 'made-later' }, { slug: 'fruit' }, { slug: 'another-one' }, { slug: 'animals' }]);
    expect(listed.map((c) => c.slug)).toEqual(['animals', 'fruit', 'world', 'made-later', 'another-one']);
    expect(impostorCategoryRank('animals')).toBe(0);
    expect(impostorCategoryRank('made-later')).toBe(IMPOSTOR_CATEGORY_PICTURES.length);
  });

  it('refuses a way, an emblem or a size it cannot draw', () => {
    expect(() => impostorWaySvg({ way: 'loud' as never })).toThrow(RangeError);
    expect(() => impostorEmblemSvg({ emblem: 'crown' as never })).toThrow(RangeError);
    expect(() => impostorCategorySvg({ category: 'fruit', size: 0 })).toThrow(RangeError);
  });
});

/**
 * The emails' pictures (art/email.ts): one small scene for what each email is
 * about, drawn as the app's other object pictures are, each a loop. They are
 * written out as images for the emails themselves, which is why every moment
 * of every loop must stand alone as a drawing.
 */
describe('the emails’ pictures', () => {
  const MOMENTS = [0, 0.1, 0.25, 0.37, 0.5, 0.62, 0.75, 0.9, 0.99];
  const strip = (svg: string): string => svg.replace(/hv[0-9a-z]+/g, 'id').replace(/<title[^>]*>[^<]*<\/title>/, '');

  it('draws a valid, self-contained picture at every moment of every loop, small and large', () => {
    for (const picture of EMAIL_PICTURES) {
      for (const at of MOMENTS) checkSvg(emailPictureSvg({ picture, size: 120, at }), 120);
      for (const size of [56, 248]) checkSvg(emailPictureSvg({ picture, size }), size);
    }
  });

  it('is the same picture every time, no two alike, labelled, and without a word or a numeral', () => {
    const all = EMAIL_PICTURES.map((picture) => {
      const svg = emailPictureSvg({ picture });
      expect(emailPictureSvg({ picture })).toBe(svg);
      expect(svg).toMatch(/<title id="[^"]+">[^<]+<\/title>/);
      for (const at of MOMENTS) expect(emailPictureSvg({ picture, at }), `${picture} at ${at}`).not.toMatch(/<text/);
      return strip(svg);
    });
    expect(new Set(all).size).toBe(all.length);
    expect(emailPictureSvg({ picture: 'key', title: 'kilît & <mifte>' })).toContain('kilît &amp; &lt;mifte&gt;');
  });

  it('moves, comes back to where it began, and rests on a moment of its own loop', () => {
    for (const picture of EMAIL_PICTURES) {
      const moments = new Set(MOMENTS.map((at) => strip(emailPictureSvg({ picture, at }))));
      // a loop is more than a still: most of its moments differ from each other
      expect(moments.size, picture).toBeGreaterThanOrEqual(6);
      // the end of a turn is the start of the next, wherever the count has got to
      expect(emailPictureSvg({ picture, at: 1 })).toBe(emailPictureSvg({ picture, at: 0 }));
      expect(emailPictureSvg({ picture, at: 2.25 })).toBe(emailPictureSvg({ picture, at: 0.25 }));
      expect(emailPictureSvg({ picture, at: -0.75 })).toBe(emailPictureSvg({ picture, at: 0.25 }));
      const still = emailPictureStill(picture);
      expect(still, picture).toBeGreaterThanOrEqual(0);
      expect(still, picture).toBeLessThan(1);
      expect(emailPictureSvg({ picture })).toBe(emailPictureSvg({ picture, at: still }));
      // slow enough to be calm, short enough that a glance sees the whole of it
      expect(emailPictureLoopMs(picture), picture).toBeGreaterThanOrEqual(2000);
      expect(emailPictureLoopMs(picture), picture).toBeLessThanOrEqual(4500);
    }
  });

  it('closes its loop on the bell hanging still, so its ringing starts and ends at rest', () => {
    // the bell and its clapper are each turned about their own point: no turn at all at the seam
    for (const at of [0, 0.999]) {
      const turns = [...emailPictureSvg({ picture: 'bell', at }).matchAll(/rotate\((-?[0-9.]+) /g)].map((m) => Math.abs(Number(m[1])));
      expect(turns.length, `at ${at}`).toBe(2);
      for (const turn of turns) expect(turn, `at ${at}`).toBeLessThan(0.5);
    }
    // and in between it swings
    expect(emailPictureSvg({ picture: 'bell', at: 1 / 12 })).toMatch(/rotate\(1[0-9](\.[0-9]+)? /);
  });

  it('stands each picture on a pale tile of its own colour', () => {
    for (const picture of EMAIL_PICTURES) {
      const tone = emailPictureTone(picture);
      expect(tone, picture).toMatch(/^#[0-9a-f]{6}$/);
      // pale enough that the picture reads on it: every channel in the upper part of its range
      for (const channel of [1, 3, 5]) expect(parseInt(tone.slice(channel, channel + 2), 16), picture).toBeGreaterThanOrEqual(0xc8);
    }
  });

  it('refuses a picture nobody has drawn, a size that is not one, and a moment that is not a number', () => {
    expect(() => emailPictureSvg({ picture: 'dragon' as EmailPicture })).toThrow(RangeError);
    expect(() => emailPictureTone('constructor' as EmailPicture)).toThrow(RangeError);
    expect(() => emailPictureLoopMs('toString' as EmailPicture)).toThrow(RangeError);
    expect(() => emailPictureSvg({ picture: 'key', size: 0 })).toThrow(RangeError);
    expect(() => emailPictureSvg({ picture: 'key', at: Number.NaN })).toThrow(RangeError);
  });
});

describe('the chest', () => {
  const CHESTS: readonly ChestTier[] = ['common', 'rare', 'epic'];

  it('draws every tier shut and open, large and small, as a valid picture, and the same picture each time', () => {
    for (const tier of CHESTS) {
      for (const size of [28, 46, 96, 220]) {
        checkSvg(chestSvg({ tier, size }), size);
        checkSvg(chestSvg({ tier, size, open: true }), size);
      }
      checkSvg(chestSvg({ tier, allLayers: true }), 96);
      expect(chestSvg({ tier })).toBe(chestSvg({ tier }));
      expect(chestSvg({ tier, open: true })).not.toBe(chestSvg({ tier }));
    }
    expect(new Set(CHESTS.map((tier) => chestSvg({ tier }))).size).toBe(3);
  });

  it('is drawn as the layers the apps move, back to front, each standing alone in its own box', () => {
    expect(CHEST_LAYERS).toEqual(['shadow', 'lidOpen', 'rays', 'body', 'light', 'lock', 'glint', 'lid', 'sparkle']);
    const drawing = chestDrawing('rare');
    expect(Object.keys(drawing.layers)).toEqual([...CHEST_LAYERS]);
    const holder = new Map<string, ChestLayerId>();
    for (const id of CHEST_LAYERS) {
      const layer = drawing.layers[id];
      expect(layer.id).toBe(id);
      expect(layer.box.w).toBeGreaterThan(0);
      expect(layer.box.h).toBeGreaterThan(0);
      // a layer carries its own defs: every reference in it points inside it, and no id is another layer's
      const refs: string[] = [];
      const ids = new Set<string>();
      walk(parse(chestLayerSvg(layer)), (e) => {
        if (e.attrs.id) ids.add(e.attrs.id);
        for (const v of Object.values(e.attrs)) for (const m of v.matchAll(/url\(#([^)]*)\)/g)) refs.push(m[1] ?? '');
      });
      for (const r of refs) expect(ids.has(r), `${id} refers to ${r}`).toBe(true);
      for (const i of ids) {
        expect(holder.get(i), `id ${i} in ${id} and ${holder.get(i)}`).toBeUndefined();
        holder.set(i, id);
      }
    }
    // the whole picture names each part, so a page can move the groups
    const parts = (svg: string): string[] => [...svg.matchAll(/data-part="([^"]+)"/g)].map((m) => m[1] ?? '');
    expect(parts(chestSvg({ tier: 'rare', allLayers: true }))).toEqual([...CHEST_LAYERS]);
    expect(parts(chestSvg({ tier: 'rare' }))).toEqual(['shadow', 'body', 'lock', 'lid']);
    expect(parts(chestSvg({ tier: 'rare', open: true }))).toEqual(['shadow', 'lidOpen', 'rays', 'body', 'light', 'lock']);
    // the hinge is on the lid and the mouth in the light, both inside the shut chest's box; the rays turn about the mouth
    const within = (pt: readonly [number, number], box: { x: number; y: number; w: number; h: number }): boolean =>
      pt[0] >= box.x && pt[0] <= box.x + box.w && pt[1] >= box.y && pt[1] <= box.y + box.h;
    expect(within(drawing.hinge, drawing.layers.lid.box)).toBe(true);
    expect(within(drawing.mouth, drawing.layers.light.box)).toBe(true);
    expect(within(drawing.hinge, CHEST_BOX)).toBe(true);
    const rays = drawing.layers.rays.box;
    expect([rays.x + rays.w / 2, rays.y + rays.h / 2]).toEqual(drawing.mouth);
    expect(drawing.box).toEqual(CHEST_BOX);
  });

  it('wears warm colours only: amber wood in iron, amber in gold, and pomegranate lacquer in gold with a garnet', () => {
    expect(CHEST_TINTS.common.wood).toBe(CHEST_TINTS.rare.wood);
    expect(CHEST_TINTS.common.metal).not.toBe(CHEST_TINTS.rare.metal);
    expect(CHEST_TINTS.rare.metal).toBe(CHEST_TINTS.epic.metal);
    expect(CHEST_TINTS.epic.wood.face).toBe('#a8233a');
    expect(CHEST_TINTS.epic.gem).toBe(true);
    expect(CHEST_TINTS.rare.gem).toBe(false);
    // nothing blue, violet or green anywhere: every colour drawn has at least as much red as blue, and as green
    for (const tier of CHESTS) {
      for (const [hex] of chestSvg({ tier, allLayers: true }).matchAll(/#[0-9a-f]{6}/g)) {
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
        expect(r >= b && r >= g, `${tier} wears ${hex}`).toBe(true);
      }
    }
    expect(chestSvg({ tier: 'epic' })).toContain('#c8243f');
    expect(chestSvg({ tier: 'rare' })).not.toContain('#c8243f');
  });

  it('draws less as it gets smaller, draws the glint at each phase, and refuses what it cannot draw', () => {
    for (const tier of CHESTS) {
      expect(elements(chestSvg({ tier, size: 24 })), tier).toBeLessThan(elements(chestSvg({ tier, size: 46 })));
      expect(elements(chestSvg({ tier, size: 46 })), tier).toBeLessThan(elements(chestSvg({ tier, size: 96 })));
    }
    const phases = [0, 0.25, 0.5, 1].map((phase) => chestLayerSvg(chestGlint(phase)));
    expect(new Set(phases).size).toBe(4);
    expect(chestLayerSvg(chestGlint(0.25))).toBe(phases[1]);
    for (const svg of phases) parse(svg);
    expect(() => chestGlint(1.5)).toThrow(RangeError);
    expect(() => chestSvg({ tier: 'legendary' as ChestTier })).toThrow(RangeError);
    expect(() => chestSvg({ tier: 'rare', size: 0 })).toThrow(RangeError);
    expect(() => chestSvg({ tier: 'rare', idPrefix: 'a b' })).toThrow(RangeError);
  });

  it('labels itself, and escapes a caller’s label', () => {
    expect(chestSvg({ tier: 'epic' })).toMatch(/>Chest<\/title>/);
    const svg = chestSvg({ tier: 'epic', title: 'Epic <chest> & "more"' });
    checkSvg(svg, 96);
    expect(svg).toContain('Epic &lt;chest&gt; &amp; &quot;more&quot;');
  });
});

describe('the chest’s hop', () => {
  const shares = (curve: ChestHopCurve): number[] => curve.map(([at]) => at);
  const ordered = (ats: number[]): boolean => ats.every((at, i) => i === 0 || at > (ats[i - 1] as number));

  it('runs a second from rest to rest, every frame later than the last', () => {
    expect(CHEST_HOP_MS).toBe(1000);
    expect(ordered(CHEST_HOP.map((f) => f.at))).toBe(true);
    expect(CHEST_HOP[0]).toEqual({ at: 0, rise: 0, wide: 1, tall: 1, tilt: 0 });
    expect(CHEST_HOP[CHEST_HOP.length - 1]).toEqual({ at: 1, rise: 0, wide: 1, tall: 1, tilt: 0 });
    for (const curve of [CHEST_HOP_LID, CHEST_HOP_LIGHT, CHEST_HOP_SHADOW, CHEST_HOP_SPARKLE]) {
      expect(ordered(shares(curve))).toBe(true);
      expect(curve[0]?.[0]).toBe(0);
      expect(curve[curve.length - 1]?.[0]).toBe(1);
    }
  });

  it('crouches before it springs, is highest before it lands, and never leaves the ground again', () => {
    const top = CHEST_HOP.reduce((best, f) => (f.rise > best.rise ? f : best));
    const crouch = CHEST_HOP.find((f) => f.tall < 1) as (typeof CHEST_HOP)[number];
    expect(crouch.at).toBeLessThan(top.at);
    expect(crouch.wide).toBeGreaterThan(1);
    expect(top.at).toBeLessThan(CHEST_HOP_LAND);
    expect(top.tall).toBeGreaterThan(1);
    const landing = CHEST_HOP.find((f) => f.at === CHEST_HOP_LAND) as (typeof CHEST_HOP)[number];
    expect(landing.rise).toBe(0);
    expect(landing.wide).toBeGreaterThan(1);
    expect(landing.tall).toBeLessThan(1);
    expect(CHEST_HOP.filter((f) => f.at > CHEST_HOP_LAND).every((f) => f.rise === 0)).toBe(true);
    // a squash keeps roughly the chest's area, so it reads as the same chest pressed, not a smaller one
    for (const f of CHEST_HOP) expect(f.wide * f.tall).toBeGreaterThan(0.9);
    for (const f of CHEST_HOP) expect(f.wide * f.tall).toBeLessThan(1.1);
    // the shiver is in the crouch, and the chest flies straight
    expect(CHEST_HOP.filter((f) => f.tilt !== 0).every((f) => f.at < top.at && f.tall < 1)).toBe(true);
  });

  it('keeps the lid shut through the crouch, opens it on the way up, and rocks it back as it lands', () => {
    const top = CHEST_HOP.reduce((best, f) => (f.rise > best.rise ? f : best));
    const crouchEnd = CHEST_HOP.filter((f) => f.rise === 0 && f.at < top.at).pop() as (typeof CHEST_HOP)[number];
    expect(chestHopAt(CHEST_HOP_LID, crouchEnd.at)).toBe(0);
    expect(chestHopAt(CHEST_HOP_LID, top.at)).toBeGreaterThan(0.5);
    expect(chestHopAt(CHEST_HOP_LID, CHEST_HOP_LAND)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...CHEST_HOP_LID.map(([, v]) => v))).toBeGreaterThan(1);
    expect(chestHopAt(CHEST_HOP_LID, 1)).toBe(1);
    // the light comes with the lid, the stars with the landing
    expect(chestHopAt(CHEST_HOP_LIGHT, crouchEnd.at)).toBe(0);
    expect(chestHopAt(CHEST_HOP_LIGHT, 1)).toBe(1);
    expect(chestHopAt(CHEST_HOP_SPARKLE, top.at)).toBe(0);
    expect(chestHopAt(CHEST_HOP_SPARKLE, CHEST_HOP_LAND)).toBeGreaterThan(0);
    expect(chestHopAt(CHEST_HOP_SPARKLE, 1)).toBe(1);
    // the shadow is smallest under the chest in the air and pressed wide as it lands
    expect(chestHopAt(CHEST_HOP_SHADOW, top.at)).toBeLessThan(1);
    expect(chestHopAt(CHEST_HOP_SHADOW, CHEST_HOP_LAND)).toBeGreaterThan(1);
    expect(chestHopAt(CHEST_HOP_SHADOW, 0)).toBe(1);
    expect(chestHopAt(CHEST_HOP_SHADOW, 1)).toBe(1);
  });

  it('reads a curve by straight lines, flat beyond its ends', () => {
    const curve: ChestHopCurve = [
      [0, 0],
      [0.5, 1],
      [1, 0.5],
    ];
    expect(chestHopAt(curve, -1)).toBe(0);
    expect(chestHopAt(curve, 0.25)).toBeCloseTo(0.5);
    expect(chestHopAt(curve, 0.5)).toBe(1);
    expect(chestHopAt(curve, 0.75)).toBeCloseTo(0.75);
    expect(chestHopAt(curve, 2)).toBe(0.5);
    expect(() => chestHopAt([], 0.5)).toThrow(RangeError);
  });

  it('stands on a foot inside the shut chest’s box, under its body', () => {
    const [x, y] = CHEST_FOOT;
    expect(x).toBeGreaterThan(CHEST_BOX.x);
    expect(x).toBeLessThan(CHEST_BOX.x + CHEST_BOX.w);
    expect(y).toBeGreaterThan(CHEST_BOX.y);
    expect(y).toBeLessThan(CHEST_BOX.y + CHEST_BOX.h);
    // the body's box (what the chest stands on) ends at the foot
    const { body, shadow } = chestDrawing('common').layers;
    expect(body.box.y + body.box.h).toBeGreaterThanOrEqual(y);
    expect(shadow.box.y).toBeLessThanOrEqual(y + 2);
  });
});

describe('the join ticket', () => {
  it('sets its three tiles on the body, as far from the tear line as from the far edge', () => {
    const first = TICKET_ART_TILES[0]!;
    const last = TICKET_ART_TILES[TICKET_ART_TILES.length - 1]!;
    expect(TICKET_ART_TILES).toHaveLength(3);
    expect(first.x - TICKET_ART_TEAR).toBeCloseTo(TICKET_ART_BOX.width - (last.x + last.width));
    for (const tile of TICKET_ART_TILES) {
      expect(tile.y - 0).toBeCloseTo(TICKET_ART_BOX.height - (tile.y + tile.height));
    }
  });
});

/**
 * The lesson path's world (art/path-land.ts) is drawn with depth — isometric,
 * outlined in one ink, cel shaded — the one exception, with the village, to
 * the flat cut-outs: the owner asked for the path and the village to read as
 * one board-game world. Every other rule holds: only what both renderers draw
 * alike, nothing outside the drawing, every reference resolved, and a budget
 * on how much a unit's land may weigh, since a path draws two or three at once.
 */
describe('the lesson path’s world', () => {
  const TONES = ['clay', 'saffron', 'meadow', 'rose', 'pine'] as const;

  /** The structural rules, for a drawing that is decorative or of its own size. */
  function sound(svg: string, viewBox?: string): number {
    const root = parse(svg);
    expect(root.name).toBe('svg');
    if (viewBox) expect(root.attrs.viewBox).toBe(viewBox);
    const ids = new Set<string>();
    let count = 0;
    walk(root, (e) => {
      count += 1;
      expect(ALLOWED.has(e.name), e.name).toBe(true);
      for (const [k, v] of Object.entries(e.attrs)) {
        expect(k.startsWith('on') || /href$/i.test(k), k).toBe(false);
        if (k !== 'xmlns') expect(v, `${k} on <${e.name}>`).not.toMatch(/NaN|Infinity|undefined|null/);
      }
      if (e.attrs.id) {
        expect(ids.has(e.attrs.id), `id ${e.attrs.id} twice`).toBe(false);
        ids.add(e.attrs.id);
      }
    });
    for (const m of svg.matchAll(/url\(#([^)]+)\)/g)) expect(ids.has(m[1]!), m[1]).toBe(true);
    expect(svg.replace('xmlns="http://www.w3.org/2000/svg"', '')).not.toMatch(/https?:|\/\/|<image|<script|<style|<text|<use|data:/i);
    return count;
  }

  it('draws every landmark, by day and by evening, labelled when named and hidden when not', () => {
    for (const landmark of PATH_LANDMARKS) {
      for (const dark of [false, true]) {
        checkSvg(pathLandmarkSvg({ landmark, dark, size: 132, title: landmark }), 132);
        const still = pathLandmarkSvg({ landmark, dark });
        sound(still, '0 0 120 120');
        expect(parse(still).attrs['aria-hidden']).toBe('true');
      }
      // twelve different places, not one drawing twelve times
      expect(new Set(PATH_LANDMARKS.map((l) => pathLandmarkSvg({ landmark: l, idPrefix: 'p' }))).size).toBe(PATH_LANDMARKS.length);
    }
  });

  it('puts each landmark’s moving part inside its canvas, and draws every kind of it', () => {
    for (const landmark of PATH_LANDMARKS) {
      const loop = PATH_LANDMARK_LOOP[landmark];
      expect(loop.x, landmark).toBeGreaterThanOrEqual(0);
      expect(loop.y, landmark).toBeGreaterThanOrEqual(0);
      expect(loop.x + loop.w, landmark).toBeLessThanOrEqual(120);
      expect(loop.y + loop.h, landmark).toBeLessThanOrEqual(120);
      for (const dark of [false, true]) sound(pathLoopSvg({ kind: loop.kind, dark, size: 24 }));
    }
  });

  it('draws every look of a stop in every unit colour, base and face, by day and by evening', () => {
    for (const look of PATH_STOP_LOOKS) {
      for (const tone of TONES) {
        for (const dark of [false, true]) {
          for (const part of ['base', 'face'] as const) sound(pathStopSvg({ look, tone, part, dark }), `0 0 ${PATH_STOP_ART.box} ${PATH_STOP_ART.box}`);
        }
      }
    }
    // every look its own: the stop to do now is a finished one's face on a taller base
    const looks = PATH_STOP_LOOKS.map((look) => (['base', 'face'] as const).map((part) => pathStopSvg({ look, tone: 'clay', part, idPrefix: 's' })).join(''));
    expect(new Set(looks).size).toBe(PATH_STOP_LOOKS.length);
    expect(pathStopSvg({ look: 'current', tone: 'clay', part: 'face', idPrefix: 's' })).toBe(pathStopSvg({ look: 'done', tone: 'clay', part: 'face', idPrefix: 's' }));
    expect(() => pathStopSvg({ look: 'gold' as PathStopLook, tone: 'clay', part: 'face' })).toThrow(RangeError);
  });

  it('stands a cairn beside the road in the lands of open country, and nowhere else', () => {
    const skills = [0, 1, 2, 3].map((i) => ({ skillId: `k${i}`, title: 'S', state: (i === 0 ? 'unlocked' : 'locked') as 'unlocked' | 'locked', strength: 0, hasGrammar: i === 0, firstLessonId: `l${i}` }));
    const unit = lessonPath({ units: [{ unitId: 'u', title: 'U', skills }] }, { guides: true }).units[0]!;
    const stops = unit.stops.map((p) => ({ key: p.stop.key, x: p.x, y: p.y }));
    const stones = trailStones(unit.stops);
    for (const land of PATH_LANDS) {
      for (const width of [390, 720]) {
        const day = pathLandSvg({ ground: land.ground, width, height: unit.height, stops, stones, seed: 'u' });
        const dusk = pathLandSvg({ ground: land.ground, width, height: unit.height, stops, stones, dark: true, seed: 'u' });
        const has = PATH_CAIRN_GROUNDS.includes(land.ground);
        expect(day.includes('#e2a334'), `${land.ground} ${width}`).toBe(has);
        expect(dusk.includes('#c98f3c'), `${land.ground} ${width} dusk`).toBe(has);
        if (!has) continue;
        // fitted to its box, which lies inside the land, out of the river where one runs across it
        const streams = land.ground === 'valley' || land.ground === 'alpine';
        const stream = (stops[1]!.y + stops[2]!.y) / 2 + 6;
        const box = cairnBox(stops, width, streams ? [{ x: 0, y: stream - 26, w: 2 * width, h: 52 }] : [])!;
        const scale = Number(/scale\(([\d.]+)\)/.exec(day)![1]);
        expect(scale * 57).toBeCloseTo(box.h, 0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.h).toBeLessThanOrEqual(unit.height);
        if (streams) expect(box.y >= stream + 26 || box.y + box.h <= stream - 26, land.ground).toBe(true);
      }
    }
  });

  it('draws each unit’s land within its budget, the same every time, and changes it with the season', () => {
    const skills = [0, 1, 2, 3].map((i) => ({ skillId: `k${i}`, title: 'S', state: (i === 0 ? 'unlocked' : 'locked') as 'unlocked' | 'locked', strength: 0, hasGrammar: i === 0, firstLessonId: `l${i}` }));
    const unit = lessonPath({ units: [{ unitId: 'u', title: 'U', skills }] }, { guides: true }).units[0]!;
    const stops = unit.stops.map((p) => ({ key: p.stop.key, x: p.x, y: p.y }));
    const stones = trailStones(unit.stops);
    const drawings = new Set<string>();
    for (const land of PATH_LANDS) {
      for (const dark of [false, true]) {
        for (const width of [390, 720]) {
          const svg = pathLandSvg({ ground: land.ground, width, height: unit.height, stops, stones, dark, seed: 'u' });
          const elements = sound(svg, `0 0 ${width} ${unit.height}`);
          expect(parse(svg).attrs['aria-hidden']).toBe('true');
          // a few hundred elements, and no more than the whole village weighs on a wide page
          expect(elements, `${land.ground} ${width}`).toBeLessThan(width > 400 ? 420 : 260);
          expect(svg.length, `${land.ground} ${width}`).toBeLessThan((width > 400 ? 64 : 36) * 1024);
          drawings.add(svg);
        }
      }
      expect(pathLandSvg({ ground: land.ground, width: 390, height: unit.height, stops, stones, seed: 'u' })).toBe(
        pathLandSvg({ ground: land.ground, width: 390, height: unit.height, stops, stones, seed: 'u' }),
      );
    }
    expect(drawings.size).toBe(PATH_LANDS.length * 4);
    const walked = pathStonesSvg({ width: 390, height: unit.height, stones, walked: true });
    // three elements however many stones: shade, face and light
    expect(sound(walked)).toBe(4);
    expect(() => pathLandSvg({ ground: 'moon' as never, width: 390, height: 600, stops, stones })).toThrow(RangeError);
    expect(() => pathLandSvg({ ground: 'snow', width: 0, height: 600, stops, stones })).toThrow(RangeError);
  });
});
