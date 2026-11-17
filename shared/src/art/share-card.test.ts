/**
 * The postcard a shared win is drawn with (art/share-card.ts). It is put
 * together from drawings that are each held to their own rules elsewhere, so
 * what is checked here is the putting together: one sound picture of the
 * right size, nothing in it that a link preview's renderer cannot draw,
 * nothing written, nothing named twice, and each win's own news on its stamp.
 */
import { describe, expect, it } from 'vitest';
import * as shared from '../index.js';
import { LEAGUE_TIERS } from '../leagues.js';
import { WIN_KINDS, WIN_STREAK_CARDS } from '../win-link.js';
import { SHARE_CARD, SHARE_CARD_KINDS, isShareCardKind, shareCardSvg, type ShareCardOptions } from './share-card.js';

interface Tag {
  name: string;
  attrs: Record<string, string>;
}

/**
 * Every tag of a drawing in the order it opens, having seen each closed by
 * its own, every attribute quoted and said once, and nothing written between
 * them: enough to call the markup sound and to look at what it is made of.
 */
function tagsOf(svg: string): Tag[] {
  const tags: Tag[] = [];
  const open: string[] = [];
  let at = 0;
  for (const m of svg.matchAll(/<(\/?)([A-Za-z][\w:-]*)((?:\s+[A-Za-z][\w:-]*="[^"<]*")*)\s*(\/?)>/g)) {
    if (svg.slice(at, m.index).trim()) throw new Error(`something written before ${m.index}: ${svg.slice(at, m.index).slice(0, 40)}`);
    at = m.index + m[0].length;
    if (m[1]) {
      const was = open.pop();
      if (was !== m[2]) throw new Error(`</${m[2]}> closes <${was}>`);
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const [, k, v] of (m[3] ?? '').matchAll(/([A-Za-z][\w:-]*)="([^"]*)"/g)) {
      if (k! in attrs) throw new Error(`attribute ${k} twice on <${m[2]}>`);
      attrs[k!] = v!;
    }
    tags.push({ name: m[2]!, attrs });
    if (!m[4]) open.push(m[2]!);
  }
  if (svg.slice(at).trim()) throw new Error('something after the last tag');
  if (open.length > 0) throw new Error(`<${open.at(-1)}> never closed`);
  return tags;
}

/** Only what every renderer a card goes to draws the same: a browser, the phone, and the one that makes the picture files. */
const DRAWN_ALIKE = new Set(['svg', 'defs', 'g', 'path', 'circle', 'ellipse', 'rect', 'linearGradient', 'radialGradient', 'stop', 'clipPath']);

/** Every card there is: each kind, a streak with each of its days and without, a week in each league and in none. */
const CARDS: ReadonlyArray<readonly [string, ShareCardOptions]> = [
  ['lesson', { kind: 'lesson' }],
  ['streak', { kind: 'streak' }],
  ...WIN_STREAK_CARDS.map((days) => [`streak of ${days}`, { kind: 'streak', days }] as const),
  ['badge', { kind: 'badge' }],
  ['league', { kind: 'league' }],
  ...LEAGUE_TIERS.map((tier) => [`league ${tier}`, { kind: 'league', tier }] as const),
  ['peyvok', { kind: 'peyvok' }],
];

describe('the postcard of a win', () => {
  it('has a card for every win that has a link, and no other', () => {
    expect([...SHARE_CARD_KINDS]).toEqual([...WIN_KINDS]);
    for (const kind of WIN_KINDS) expect(isShareCardKind(kind)).toBe(true);
    expect(isShareCardKind('profile')).toBe(false);
    expect(isShareCardKind(undefined)).toBe(false);
  });

  it('draws every card as one sound picture of the size a link preview shows', () => {
    for (const [what, opts] of CARDS) {
      const svg = shareCardSvg(opts);
      const tags = tagsOf(svg);
      const root = tags[0]!;
      expect(root.name, what).toBe('svg');
      expect(root.attrs.xmlns, what).toBe('http://www.w3.org/2000/svg');
      expect(root.attrs.viewBox, what).toBe(`0 0 ${SHARE_CARD.width} ${SHARE_CARD.height}`);
      expect([Number(root.attrs.width), Number(root.attrs.height)], what).toEqual([SHARE_CARD.width, SHARE_CARD.height]);
      // 1200 by 630 is the shape every preview keeps whole
      expect(SHARE_CARD.width / SHARE_CARD.height).toBeCloseTo(1.905, 2);
    }
  });

  it('is made only of what is drawn the same everywhere, and reaches for nothing outside itself', () => {
    for (const [what, opts] of CARDS) {
      const svg = shareCardSvg(opts);
      const tags = tagsOf(svg);
      const ids = new Set<string>();
      const refs: string[] = [];
      for (const tag of tags) {
        expect(DRAWN_ALIKE.has(tag.name), `${what}: <${tag.name}>`).toBe(true);
        for (const [k, v] of Object.entries(tag.attrs)) {
          expect(k.startsWith('on') || /href$/i.test(k), `${what}: ${k} on <${tag.name}>`).toBe(false);
          if (k !== 'xmlns') expect(v, `${what}: ${k}="${v}"`).not.toMatch(/NaN|Infinity|undefined|null|https?:|\/\/|data:|javascript:/);
          for (const m of v.matchAll(/url\(([^)]*)\)/g)) {
            expect(m[1]?.startsWith('#'), `${what}: url(${m[1]})`).toBe(true);
            refs.push((m[1] ?? '').slice(1));
          }
        }
        if (tag.attrs.id) {
          expect(ids.has(tag.attrs.id), `${what}: id ${tag.attrs.id} twice`).toBe(false);
          ids.add(tag.attrs.id);
        }
      }
      for (const ref of refs) expect(ids.has(ref), `${what}: url(#${ref}) points at nothing`).toBe(true);
      // the namespace is said once, by the card, and by none of the pictures laid into it
      expect(tags.filter((tag) => 'xmlns' in tag.attrs), what).toHaveLength(1);
    }
  });

  it('writes nothing: no word in any language, and a streak’s days in drawn figures', () => {
    for (const [what, opts] of CARDS) {
      const svg = shareCardSvg(opts);
      expect(svg, what).not.toMatch(/<text\b|<tspan\b|<title\b|font-family|<foreignObject\b/);
    }
  });

  it('is hidden from a screen reader until it is named, and then is one picture with one name', () => {
    const plain = tagsOf(shareCardSvg({ kind: 'lesson' }));
    expect(plain[0]!.attrs['aria-hidden']).toBe('true');
    expect(plain.some((tag) => tag.attrs.role === 'img' || 'aria-labelledby' in tag.attrs || 'aria-label' in tag.attrs)).toBe(false);
    const named = tagsOf(shareCardSvg({ kind: 'lesson', title: 'A postcard: a lesson finished' }));
    expect(named[0]!.attrs.role).toBe('img');
    expect(named[0]!.attrs['aria-label']).toBe('A postcard: a lesson finished');
    expect(named[0]!.attrs['aria-hidden']).toBeUndefined();
    // the friends, the bird and the stamp are parts of it, with no names of their own
    expect(named.filter((tag) => tag.attrs.role === 'img' || 'aria-labelledby' in tag.attrs || 'aria-label' in tag.attrs)).toHaveLength(1);
  });

  it('keeps a name from breaking the picture it names', () => {
    const svg = shareCardSvg({ kind: 'badge', title: 'A "medal" <b>& more</b>' });
    expect(tagsOf(svg)[0]!.attrs['aria-label']).toBe('A medal b more/b');
  });

  it('is the same drawing every time, and each card its own', () => {
    const drawn = new Map<string, string>();
    for (const [what, opts] of CARDS) {
      const svg = shareCardSvg(opts);
      expect(shareCardSvg({ ...opts }), what).toBe(svg);
      for (const [other, was] of drawn) {
        // a week in no named league is drawn as the first league's, to the letter
        if ((what === 'league dilop' && other === 'league') || (what === 'league' && other === 'league dilop')) expect(svg, what).toBe(was);
        else expect(svg === was, `${what} is ${other}`).toBe(false);
      }
      drawn.set(what, svg);
    }
  });

  it('prints a streak’s days on its stamp, and the fire alone where there are none to print', () => {
    const fire = shareCardSvg({ kind: 'streak' });
    for (const days of [0, -4, Number.NaN, Number.POSITIVE_INFINITY]) expect(shareCardSvg({ kind: 'streak', days }), String(days)).toBe(fire);
    expect(shareCardSvg({ kind: 'streak', days: 7.9 })).toBe(shareCardSvg({ kind: 'streak', days: 7 }));
    expect(shareCardSvg({ kind: 'streak', days: 7 })).not.toBe(fire);
    // more figures are more drawing, and a streak past four of them is drawn as the longest that fits
    expect(shareCardSvg({ kind: 'streak', days: 1000 }).length).toBeGreaterThan(shareCardSvg({ kind: 'streak', days: 7 }).length);
    expect(shareCardSvg({ kind: 'streak', days: 123456 })).toBe(shareCardSvg({ kind: 'streak', days: 9999 }));
  });

  it('lets only the win it is about change it: days mean nothing to a lesson, a league nothing to a badge', () => {
    expect(shareCardSvg({ kind: 'lesson', days: 30 })).toBe(shareCardSvg({ kind: 'lesson' }));
    expect(shareCardSvg({ kind: 'badge', tier: 'okyanus' })).toBe(shareCardSvg({ kind: 'badge' }));
    expect(shareCardSvg({ kind: 'streak', days: 30, tier: 'okyanus' })).toBe(shareCardSvg({ kind: 'streak', days: 30 }));
    expect(shareCardSvg({ kind: 'league', tier: 'cem', days: 30 })).toBe(shareCardSvg({ kind: 'league', tier: 'cem' }));
  });

  it('is by day except for the fire, which is lit at night', () => {
    const night = shareCardSvg({ kind: 'streak', days: 30 });
    for (const kind of ['lesson', 'badge', 'league', 'peyvok'] as const) {
      const sky = /<rect width="1200" height="630" fill="(#[0-9a-f]{6})"\/>/.exec(shareCardSvg({ kind }));
      const dark = /<rect width="1200" height="630" fill="(#[0-9a-f]{6})"\/>/.exec(night);
      expect(sky, kind).not.toBeNull();
      expect(dark).not.toBeNull();
      const light = (hex: string): number => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
      expect(light(sky![1]!), kind).toBeGreaterThan(light(dark![1]!) * 3);
    }
  });

  it('stays light enough to be drawn at once wherever it is shown', () => {
    for (const [what, opts] of CARDS) expect(shareCardSvg(opts).length, what).toBeLessThan(120_000);
  });

  it('takes ids of its own where two cards share a page', () => {
    const a = shareCardSvg({ kind: 'lesson', idPrefix: 'one' });
    const b = shareCardSvg({ kind: 'lesson', idPrefix: 'two' });
    const idsOf = (svg: string): string[] => tagsOf(svg).flatMap((tag) => (tag.attrs.id ? [tag.attrs.id] : []));
    expect(idsOf(a).length).toBeGreaterThan(0);
    expect(idsOf(a).every((id) => id.startsWith('one'))).toBe(true);
    expect(idsOf(a).some((id) => idsOf(b).includes(id))).toBe(false);
    expect(() => shareCardSvg({ kind: 'lesson', idPrefix: 'not an id' })).toThrow(RangeError);
  });

  it('refuses a card there is none of', () => {
    expect(() => shareCardSvg({ kind: 'profile' as never })).toThrow(RangeError);
  });

  it('is offered by the package under the same names', () => {
    expect(shared.shareCardSvg).toBe(shareCardSvg);
    expect(shared.SHARE_CARD).toBe(SHARE_CARD);
    expect(shared.SHARE_CARD_KINDS).toBe(SHARE_CARD_KINDS);
    expect(shared.isShareCardKind).toBe(isShareCardKind);
  });
});
