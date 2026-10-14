/**
 * Learning-league emblems (contract 4, L1/B3): six water tiers, each a cut
 * crystal drop with its water glowing inside — a single drop, a spring
 * welling up, a river winding to the viewer, a lake under a mountain, the sea
 * rolling in, and the ocean's great wave.
 *
 * Every league emblem is a drop, so a league reads as a league before its
 * picture does — the way every rank emblem is a crest. The water deepens from
 * a pale dew-blue to the ocean's midnight, and the drop grows as it does: bare
 * for Dilop and Kanî, a pair of blades for Çem, two for Gol, two and a pearl
 * at the tip for Derya, and for Okyanûs three, the pearl, a burst of light and
 * the ocean's own living glints.
 */
import { cubic, offset, place } from './geometry.js';
import type { Part } from './icons.js';
import { circ, drop } from './icons.js';
import { paintIcon } from './iconpaint.js';
import type { LeagueTier } from './keys.js';
import { LEAGUE_TIER_NAMES, LEAGUE_TIERS } from './keys.js';
import type { Field } from './palette.js';
import { LEAGUE_METAL } from './palette.js';
import { blade, edge, facetBand, halo, rays, sparkle } from './paint.js';
import type { Pt } from './svg.js';
import { Drawing, checkSize, linearAt, mix, n, n2, polyPath, prefixFor, radialAt, seeded } from './svg.js';

/** The drop: a point at the top, a round body below, centred on 60,58 at full size. */
function dropOutline(): Pt[] {
  const top: Pt = [60, 7];
  const out: Pt[] = [top];
  out.push(...cubic(top, [67, 22], [97, 40], [97, 66], 18));
  out.push(...cubic([97, 66], [97, 86.5], [80.5, 103], [60, 103], 14));
  out.push(...cubic([60, 103], [39.5, 103], [23, 86.5], [23, 66], 14));
  out.push(...cubic([23, 66], [23, 40], [53, 22], top, 18).slice(0, -1));
  return out;
}

const DROP = dropOutline();

interface Grandeur {
  blades: number;
  pearl: boolean;
  glow: number;
  rays: number;
  glints: boolean;
}

const GRANDEUR: Record<LeagueTier, Grandeur> = {
  dilop: { blades: 0, pearl: false, glow: 0.14, rays: 0, glints: false },
  kani: { blades: 0, pearl: false, glow: 0.2, rays: 0, glints: false },
  cem: { blades: 1, pearl: false, glow: 0.26, rays: 0, glints: false },
  gol: { blades: 2, pearl: false, glow: 0.32, rays: 0, glints: false },
  derya: { blades: 2, pearl: true, glow: 0.42, rays: 0, glints: false },
  okyanus: { blades: 3, pearl: true, glow: 0.6, rays: 18, glints: true },
};

/** A league tier's water as a field: its deep tones, so its bright glyph stands out. */
function leagueField(t: LeagueTier): Field {
  const m = LEAGUE_METAL[t];
  if (t === 'okyanus') return { glow: '#163a8f', mid: '#0b1a5c', deep: m.deep };
  return { glow: mix(m.dark, m.deep, 0.15), mid: mix(m.dark, m.deep, 0.55), deep: m.deep };
}

/** A wave band across the glyph box at y, filled down to `bottom`. */
function wave(y: number, amp: number, len: number, bottom: number, x0 = -21, x1 = 21): string {
  let d = `M${n(x0)},${n(bottom)}L${n(x0)},${n(y)}`;
  for (let x = x0; x < x1 - 0.01; x += len) {
    const e = Math.min(x1, x + len);
    d += `Q${n(x + len * 0.25)},${n(y - amp)} ${n(x + len * 0.5)},${n(y)}Q${n(x + len * 0.75)},${n(y + amp)} ${n(e)},${n(y)}`;
  }
  return `${d}L${n(x1)},${n(bottom)}Z`;
}

/** Each tier's glyph, in the 40-unit icon box. */
const LEAGUE_GLYPHS: Record<LeagueTier, () => Part[]> = {
  // Dilop, the drop: one drop falling, and the ring it will make
  dilop: () => [
    { k: 'l', d: 'M-13,15.5C-13,12.5 13,12.5 13,15.5C13,18.5 -13,18.5 -13,15.5Z', w: 1.8 },
    { k: 'f', d: drop(0, -1.5, 1.55) },
    { k: 'h', d: 'M-6,2C-6,-3 -3.5,-7 -1.5,-10C-2.6,-5.5 -3.4,-1.5 -3.2,2.5Z', o: 0.8 },
  ],
  // Kanî, the spring: water welling up between stones, throwing up drops
  kani: () => [
    { k: 'a', d: 'M-21,18C-21,12 -16,9 -11,10.5C-8,11.4 -7,14.5 -7,18Z' },
    { k: 'a', d: 'M21,18C21,13 17,10.5 13,11.5C10,12.3 9,15 9,18Z' },
    { k: 'f', d: 'M-12,18C-11,8 -6,2 0,2C6,2 11,8 12,18Z' },
    { k: 'w', d: drop(0, -11, 0.72) },
    { k: 'w', d: drop(-9, -4.5, 0.48) },
    { k: 'w', d: drop(9, -4.5, 0.48) },
    { k: 'h', d: 'M-7,13C-6,8.5 -3.5,5.4 -0.6,4.6C-3,6.8 -4.6,9.8 -5,13.5Z', o: 0.7, fine: true },
  ],
  // Çem, the river: narrow in the distance and wide at the viewer, between hills
  cem: () => [
    { k: 'a', d: 'M-21,-2C-14,-9 -6,-9 0,-5C6,-10 15,-10 21,-3V18H-21Z' },
    { k: 'f', d: 'M-1.5,-6C1,-6 3,-5 2,-3C0,0 -6,0 -6,4C-6,8 6,8 9,12C11,15 9,18 8,18H-10C-10,15 -14,12 -12,8C-9,3 -3,3 -2,0C-1.4,-2 -3,-4 -1.5,-6Z' },
    { k: 'd', d: 'M-2,9C0,10 3,11 4,13', w: 1.2, fine: true },
    { k: 'w', d: 'M-14.5,-11.5A4,4 0 1 1 -14.5,-11.4Z' },
  ],
  // Gol, the lake: a mountain and, upside down in the still water, its reflection
  gol: () => [
    { k: 'f', d: 'M-20,3L-7,-16L3,-3L9,-10L20,3Z' },
    { k: 'w', d: 'M-7,-16L-11.6,-9.2L-8.8,-10.2L-6.8,-8.4L-4.4,-10.2L-3.4,-9.6Z' },
    { k: 'a', d: 'M-21,5H21C21,13 12,19 0,19C-12,19 -21,13 -21,5Z' },
    { k: 'd', d: 'M-14,8.5H-2M4,11.5H14M-8,14.5H4', w: 1.5 },
    { k: 'h', d: 'M-14,3L-7,-7.5L-5,-5Z', o: 0.4, fine: true },
  ],
  // Derya, the sea: the sun on the horizon and rollers coming in
  derya: () => [
    { k: 'c', d: 'M-9,-3A9,9 0 0 1 9,-3Z', c: 'glow' },
    { k: 'f', d: wave(-1, 2.2, 10.5, 9) },
    { k: 'a', d: wave(7, 3, 14, 19) },
    { k: 'l', d: 'M-15,12C-12,9.5 -9,9.5 -6,12M5,12C8,9.5 11,9.5 14,12', w: 1.6, c: 'snow' },
  ],
  // Okyanûs, the ocean: the great wave rising and curling over, spray flying
  okyanus: () => [
    {
      k: 'f',
      d: 'M-21,19C-15,15 -10,10 -8,2C-6,-7 -2,-15 6,-17.5C13,-19.5 19.5,-15 19.5,-8.5C19.5,-3 15,0.5 10.5,-0.5C7,-1.3 6,-5.5 9,-7C4.5,-7.5 1.5,-3.5 2.5,2C3.5,8 10,12 21,13V19Z',
    },
    { k: 'w', d: 'M-2,-13C2,-17 8,-19 13,-17.5C18,-16 20.5,-11 19.2,-6.4C18.6,-4.4 17.2,-2.4 15,-1.4C16.8,-5 16.4,-10.4 11.6,-12.6C7,-14.6 2,-13.6 -2,-13Z' },
    { k: 'l', d: 'M-15,16C-11,11 -8,7 -6.5,1M-3,17C0,12 1,8 0.5,4', w: 1.5, c: 'blue' },
    { k: 'c', d: `${circ(-12.5, -10, 2)}${circ(-15.5, -3.5, 1.4)}${circ(-8, -15, 1.3)}`, c: 'water' },
  ],
};

/** Where the drop sits and how big, large or small. */
const BODY = { large: { s: 0.84, y: 60 }, small: { s: 0.97, y: 60 } };

export interface LeagueEmblemOptions {
  tier: LeagueTier;
  /** pixels; default 128 */
  size?: number;
  /** the accessible label; defaults to "Çem (River)" */
  title?: string;
  idPrefix?: string;
}

/** Under this many pixels an emblem is drawn in its small version: bolder, fewer blades, no rays. */
export const SMALL_LEAGUE = 56;

/** A learning league's emblem as an SVG string. */
export function leagueEmblemSvg(opts: LeagueEmblemOptions): string {
  const { tier } = opts;
  if (!LEAGUE_TIERS.includes(tier)) throw new RangeError(`art: unknown league tier ${String(tier)}`);
  const size = checkSize(opts.size, 128);
  const small = size < SMALL_LEAGUE;
  const dr = new Drawing(prefixFor(opts.idPrefix, 'league', tier, small));
  const g = GRANDEUR[tier];
  const m = LEAGUE_METAL[tier];
  const field = leagueField(tier);
  const body = small ? BODY.small : BODY.large;
  const outline = place(
    DROP.map(([x, y]) => [x - 60, y - 62] as Pt),
    { x: 60, y: body.y + 4 * body.s, s: body.s },
  );
  const top = Math.min(...outline.map((p) => p[1]));
  const cy = body.y + 8 * body.s;
  const out: string[] = [];

  out.push(halo(dr, 60, cy, small ? 54 : 60, m.mid, g.glow, 0.4));
  if (g.rays > 0 && !small) out.push(rays(dr, 60, cy, 38, 60, g.rays, m.glint, 0.75));

  const bladeCount = small ? Math.min(g.blades, 1) : g.blades;
  for (let i = bladeCount - 1; i >= 0; i--) {
    const len = (small ? 24 : 27) - i * 4.5;
    const deg = 30 - i * 19;
    const y = cy - 6 + i * 10;
    for (const side of [1, -1] as const) out.push(blade(60 + side * 28 * body.s, y, side, len, small ? 11 : 9.5, deg, m));
  }

  const rim = small ? 7 : 5.5;
  const inner = offset(outline, -rim);
  out.push(facetBand(outline, inner, m, 3 + Math.min(4, Math.ceil(LEAGUE_TIERS.indexOf(tier) * 0.8))));
  out.push(edge(polyPath(outline), m.deep, small ? 1.8 : 1.2, 0.95));
  const fieldPath = polyPath(offset(outline, -rim - 0.2));
  out.push(`<path d="${polyPath(inner)}" fill="${m.deep}"/>`);
  const ground = dr.id('e');
  dr.def(radialAt(ground, [[0, field.glow], [0.55, field.mid], [1, field.deep]], 60, cy - 6, 44));
  out.push(`<path d="${fieldPath}" fill="url(#${ground})"/>`);
  const clip = dr.clip(fieldPath);
  const rimLight = dr.id('l');
  dr.def(linearAt(rimLight, [[0, m.glint, 0], [0.5, m.glint, 0], [1, m.glint, 0.85]], 30, 20, 90, 104));
  let glints = '';
  if (g.glints) {
    const rnd = seeded('okyanus-glints');
    const dots: string[] = [];
    for (let i = 0; i < 16; i++) dots.push(`<circle cx="${n(30 + rnd() * 60)}" cy="${n(30 + rnd() * 66)}" r="${n2(0.5 + rnd() * 0.8)}" fill="${m.glint}" fill-opacity="${n2(0.35 + rnd() * 0.5)}"/>`);
    glints = dots.join('');
  }
  out.push(
    `<g clip-path="url(#${clip})">${glints}` +
      `<path d="M${n(60 + 70)},${n(cy - 70)}L${n(60 - 70)},${n(cy + 70)}L${n(60 - 70)},${n(cy - 70)}Z" fill="#ffffff" fill-opacity="0.07"/>` +
      `<path d="${fieldPath}" fill="none" stroke="url(#${rimLight})" stroke-width="${small ? 2.4 : 1.8}"/></g>`,
  );
  const scale = (small ? 1.3 : 1.12) * body.s;
  out.push(halo(dr, 60, cy, 24 * scale, mix(field.glow, '#ffffff', 0.3), 0.5));
  out.push(`<g transform="translate(60 ${n(cy)}) scale(${n2(scale)})">${paintIcon(LEAGUE_GLYPHS[tier](), { dr, metal: m, field, small, locked: false })}</g>`);

  if (g.pearl) {
    const py = top + (small ? 1 : 0);
    const pearl = dr.id('p');
    dr.def(radialAt(pearl, [[0, '#ffffff'], [0.6, m.light], [1, m.mid]], 58.4, py - 2, 7));
    out.push(halo(dr, 60, py, 14, m.glint, 0.7, 0.2));
    out.push(`<path d="${circ(60, py, small ? 6 : 5)}" fill="url(#${pearl})" stroke="${m.deep}" stroke-width="1.2"/>`);
  }
  if (g.glints && !small) out.push(`<path d="${sparkle(88, 34, 5.5)}${sparkle(33, 90, 3.6)}" fill="${m.glint}"/>`);

  dr.add(out.join(''));
  const nm = LEAGUE_TIER_NAMES[tier];
  return dr.svg(size, opts.title ?? `${nm.ku} (${nm.en})`);
}
