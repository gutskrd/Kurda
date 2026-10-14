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
    for (const b of CATALOGUE) expect(BADGES[b.key], b.key).toEqual({ family: b.family, name: b.nameKu, tiers: b.tiers.length });
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

  it('draws each tier differently, and tells them apart without colour: the chevrons count the tier', () => {
    const chevronPaths = (svg: string): number[] => {
      const out: number[] = [];
      walk(parse(svg), (e) => {
        // a chevron is a closed six-point outline; the lit ones are one path, the unlit another
        if (e.name === 'path' && /^(M[\d.,-]+l(?:[\d.,-]+ ){4}[\d.,-]+z)+$/.test(e.attrs.d ?? '') && (e.attrs.d?.match(/M/g)?.length ?? 0) <= 4) {
          out.push(e.attrs.d?.match(/M/g)?.length ?? 0);
        }
      });
      return out;
    };
    for (const key of ['ders', 'agir', 'peyvzan', 'rank-ciya', 'heval', 'newroz'] as BadgeKey[]) {
      const tiers = TIERS.map((tier) => badgeSvg({ key, tier }));
      expect(new Set(tiers).size).toBe(4);
      // four chevrons on every tiered badge, as many lit as the tier
      tiers.forEach((svg, i) => expect(chevronPaths(svg), `${key} tier ${i + 1}`).toEqual(i === 3 ? [4] : [i + 1, 3 - i]));
      // and the same count small
      TIERS.forEach((tier, i) => expect(chevronPaths(badgeSvg({ key, tier, size: 40 })), `${key} tier ${tier} small`).toEqual(i === 3 ? [4] : [i + 1, 3 - i]));
    }
    // a single badge has none
    expect(chevronPaths(badgeSvg({ key: 'hemereng' }))).toEqual([]);
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

  it('cuts the leaf the same at both tips, and runs its rim evenly into them', () => {
    const leaf = SHAPES.friends.outline;
    const key = ([x, y]: readonly [number, number]): string => `${x.toFixed(4)},${y.toFixed(4)}`;
    const points = new Set(leaf.map(key));
    // turned half round about its middle, the leaf is itself
    for (const [x, y] of leaf) expect(points.has(key([120 - x, 112 - y])), `${x},${y}`).toBe(true);
    // no long chords: every step along the outline is within a third of the others
    const steps = leaf.map((p, i) => {
      const q = leaf[(i + 1) % leaf.length] as readonly [number, number];
      return Math.hypot(q[0] - p[0], q[1] - p[1]);
    });
    expect(Math.max(...steps) / Math.min(...steps)).toBeLessThan(1.34);
  });

  it('respects the size it is asked for, and draws a small version under the threshold', () => {
    for (const size of [24, 32, 48, 55.5, 56, 96, 128, 256]) checkSvg(badgeSvg({ key: 'heval', tier: 2, size }), size);
    const small = badgeSvg({ key: 'heval', tier: 3, size: SMALL_BADGE - 1 });
    const large = badgeSvg({ key: 'heval', tier: 3, size: SMALL_BADGE });
    expect(small.replace(/width="\d+(\.\d+)?" height="\d+(\.\d+)?"/, '')).not.toBe(large.replace(/width="\d+" height="\d+"/, ''));
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
    expect(() => leagueEmblemSvg({ tier: 'diamond' as never })).toThrow(RangeError);
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

describe('weight', () => {
  it('keeps every drawing small enough to inline a page of them', () => {
    const biggest = Math.max(
      ...BADGE_KEYS.flatMap((key) => TIERS.map((tier) => badgeSvg({ key, tier }).length)),
      ...RANK_TIERS.map((tier) => rankEmblemSvg({ tier, division: 1 }).length),
      ...LEAGUE_TIERS.map((tier) => leagueEmblemSvg({ tier }).length),
      ...RANK_TIERS.map((tier) => seasonFrameSvg({ tier, shine: true }).length),
    );
    expect(biggest).toBeLessThan(24 * 1024);
  });
});
