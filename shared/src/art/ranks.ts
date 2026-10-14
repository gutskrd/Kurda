/**
 * Game-rank emblems (contract 4, R4/B3): six tiers, each a cut crystal crest
 * in one hero hue with a glyph of the climb glowing inside it — the sun rising
 * over the plain, rolling hills, a high pasture under peaks, a snow-capped
 * mountain, the summit above the clouds, and the star over the peak.
 *
 * The crest grows with the tier the way the land does: Deşt is the bare gem;
 * Gir grows a pair of blades; Zozan two; Çiya two and a spike; Lûtke three
 * and a crown of three spikes; Stêrk three, a four-point star and a burst of
 * light. A higher tier is told by its silhouette before its colour.
 *
 * The division is a row of chevrons under the crest, lit as the player climbs:
 * one for III, two for II, three for I — counted, not coloured, so it reads
 * for everyone; the title carries the numeral.
 *
 * A season's emblem — the peak tier a player reached, kept for good (R5) —
 * swaps the chevrons for the season's own mark: its glyph (blossom, sun, leaf,
 * snowflake, the same as the season event badges) and the year's last two
 * figures, so last spring's Çiya is not this spring's.
 */
import { offset, roundedPolygon } from './geometry.js';
import { ICONS, circ } from './icons.js';
import type { Part } from './icons.js';
import { paintIcon } from './iconpaint.js';
import type { RankDivision, RankTier, Season } from './keys.js';
import { RANK_TIER_NAMES, RANK_TIERS, SEASONS, SEASON_NAMES } from './keys.js';
import type { Field, Metal } from './palette.js';
import { RANK_FIELD, RANK_METAL, SILVER } from './palette.js';
import { blade, capsule, chevrons, cutStar, diamondAt, edge, facetBand, halo, rays, sparkle, spike } from './paint.js';
import type { Pt } from './svg.js';
import { Drawing, checkSize, linearAt, mix, n, n2, polyPath, prefixFor, radialAt } from './svg.js';

/** A rank tier's field: the deep, saturated ground its bright glyph glows on. */
export function rankField(t: RankTier): Field {
  return RANK_FIELD[t];
}

/** The neutral the placement emblem is cut from: blue silver over slate. */
const MIST: Metal = SILVER;
const MIST_FIELD: Field = { glow: '#55607e', mid: '#343c58', deep: '#171b30' };

// ─────────────────────────────────────────────────────────────── glyphs

/** Short rays all round cx,cy from r0 to r1, as one path of lines. */
function rayRing(cx: number, cy: number, r0: number, r1: number, count: number): string {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const a = ((i * 360) / count - 90) * (Math.PI / 180);
    out.push(`M${n(cx + Math.cos(a) * r0)},${n(cy + Math.sin(a) * r0)}L${n(cx + Math.cos(a) * r1)},${n(cy + Math.sin(a) * r1)}`);
  }
  return out.join('');
}

/** The rising sun with its rays, over a horizon at y. */
function sunrise(y: number, r: number): Part[] {
  const rayLines: string[] = [];
  for (let i = 0; i < 7; i++) {
    const a = ((180 + 22.5 + i * 22.5) * Math.PI) / 180;
    rayLines.push(`M${n(Math.cos(a) * (r + 3.5))},${n(y + Math.sin(a) * (r + 3.5))}L${n(Math.cos(a) * (r + 8))},${n(y + Math.sin(a) * (r + 8))}`);
  }
  return [
    { k: 'l', d: rayLines.join(''), w: 2.6 },
    { k: 'f', d: `M${n(-r)},${n(y)}A${n(r)},${n(r)} 0 0 1 ${n(r)},${n(y)}Z` },
  ];
}

/** Each tier's glyph, in the 40-unit icon box. */
const RANK_GLYPHS: Record<RankTier | 'placing', () => Part[]> = {
  // Deşt, the plain: the sun rising over a flat horizon, furrows running to it
  dest: () => [
    ...sunrise(4, 11),
    { k: 'l', d: 'M-21,7H21', w: 3.4 },
    { k: 'l', d: 'M-14,12.5H14', w: 2.8 },
    { k: 'l', d: 'M-7,17.5H7', w: 2.4 },
  ],
  // Gir, the hill: two rounded hills, the near one lit, and the sun over them
  gir: () => [
    { k: 'f', d: circ(6, -14, 4.6) },
    { k: 'a', d: 'M-2,14C0,2 6,-4 12,-4C18,-4 21,4 21,10C14,14 6,15 -2,14Z' },
    { k: 'f', d: 'M-21,12C-21,2 -13,-4 -5,-4C3,-4 10,3 11,12C3,17 -13,17 -21,12Z' },
    { k: 'h', d: 'M-16,4C-14.5,-0.5 -10.5,-2.6 -6.6,-2.8C-10,-0.8 -12.6,2.2 -13.6,5.6Z', o: 0.6, fine: true },
  ],
  // Zozan, the high pasture: snow peaks behind, the summer meadow under them and a herder's tent on it
  zozan: () => [
    { k: 'a', d: 'M-21,10L-9,-13L-3,-5L7,-18L21,10Z' },
    { k: 'w', d: 'M7,-18L3.2,-13L5.4,-13.8L7.2,-11.8L9,-13.8L10.6,-12.8Z' },
    { k: 'w', d: 'M-9,-13L-11.6,-8.6L-9.8,-9.4L-8.4,-8L-6.2,-9Z' },
    { k: 'f', d: 'M-21,12C-10,6.5 10,6.5 21,12C21,15.6 18,18 13,18H-13C-18,18 -21,15.6 -21,12Z' },
    { k: 'f', d: 'M-14,13L-12,5L-7,2.4L-3.5,4.2L0,2.4L5,5L7,13Z' },
    { k: 'k', d: 'M-5.2,13L-3.5,7.4L-1.8,13Z' },
    { k: 'h', d: 'M-12,5L-7,2.4L-3.5,4.2L0,2.4L5,5L4.4,6.4L0,4.2L-3.5,6L-7,4.2L-11.4,6.4Z', o: 0.5, fine: true },
  ],
  // Çiya, the mountain: one great peak, its lit face and its shaded face, and snow
  ciya: () => [
    { k: 'a', d: 'M6,18L14,3L22,18Z' },
    { k: 'f', d: 'M-21,18L-1,-19L-1,18Z' },
    { k: 'a', d: 'M-1,-19L18,18H-1Z' },
    { k: 'w', d: 'M-1,-19L-8.6,-5L-4.6,-7.4L-1,-3.4L2.8,-7.8L6.4,-5.6Z' },
  ],
  // Lûtke, the summit: a needle of rock above a sea of cloud
  lutke: () => [
    { k: 'f', d: 'M-15,14L0,-21L0,14Z' },
    { k: 'a', d: 'M0,-21L15,14H0Z' },
    { k: 'w', d: 'M0,-21L-5.4,-8.4L-2.6,-10L0,-6.6L2.6,-10.6L5.2,-9Z' },
    { k: 'w', d: 'M-21,18C-21,13 -16,11 -12,13C-10,9 -3,8.5 0,12C3,9 9,9 11,12.5C15,10.5 21,12.5 21,18Z' },
    { k: 'h', d: sparkle(13, -14, 3.8), o: 0.95 },
  ],
  // Stêrk, the star: the peak, and behind it the sun disc with its rays — the star of the day
  sterk: () => [
    { k: 'l', d: rayRing(0, -2, 13, 19, 12), w: 2.6 },
    { k: 'f', d: circ(0, -2, 10.5) },
    { k: 'a', d: 'M-21,19L-6,0L0,7L7,-1L21,19Z' },
    { k: 'w', d: 'M-6,0L-10.2,5.4L-7.6,4.6L-5.6,6.6L-3.4,4.4Z' },
    { k: 'w', d: 'M7,-1L3.6,3.6L5.8,3L7.4,4.6L9.4,3.2Z' },
  ],
  // before a first tier: ridges fading into mist
  placing: () => [
    { k: 'a', d: 'M-20,4L-9,-10L-2,-2L7,-15L20,4C10,8 -10,8 -20,4Z' },
    { k: 'f', d: 'M-21,14L-8,1L1,9L10,0L21,14C10,19 -10,19 -21,14Z' },
  ],
};

/**
 * A rank tier's glyph, glowing, at cx,cy and `scale` × the 40-unit icon box.
 * The emblems draw it inside their crest; the ranked family's tier badges draw
 * it inside their shield, so a badge and an emblem show the same place.
 */
export function rankGlyph(dr: Drawing, tier: RankTier | 'placing', cx: number, cy: number, scale: number, small: boolean, field?: Field): string {
  const m = tier === 'placing' ? MIST : RANK_METAL[tier];
  const f = field ?? (tier === 'placing' ? MIST_FIELD : rankField(tier));
  const glow = halo(dr, cx, cy, 24 * scale, mix(f.glow, '#ffffff', 0.3), 0.5);
  return glow + `<g transform="translate(${n(cx)} ${n(cy)}) scale(${n2(scale)})">${paintIcon(RANK_GLYPHS[tier](), { dr, metal: m, field: f, small, locked: false })}</g>`;
}

// ─────────────────────────────────────────────────────────────── the crest

interface Grandeur {
  /** the crest's half width and half height */
  w: number;
  h: number;
  /** blades per side */
  blades: number;
  crown: 'none' | 'spike' | 'three' | 'star';
  /** the halo's strength, and rays behind */
  glow: number;
  rays: number;
}

const GRANDEUR: Record<RankTier | 'placing', Grandeur> = {
  placing: { w: 29, h: 38, blades: 0, crown: 'none', glow: 0, rays: 0 },
  dest: { w: 30, h: 39, blades: 0, crown: 'none', glow: 0.2, rays: 0 },
  gir: { w: 30, h: 39, blades: 1, crown: 'none', glow: 0.26, rays: 0 },
  zozan: { w: 30.5, h: 40, blades: 2, crown: 'none', glow: 0.32, rays: 0 },
  ciya: { w: 31, h: 40, blades: 2, crown: 'spike', glow: 0.4, rays: 0 },
  lutke: { w: 31, h: 40, blades: 3, crown: 'three', glow: 0.52, rays: 10 },
  sterk: { w: 31, h: 40, blades: 3, crown: 'star', glow: 0.72, rays: 20 },
};

/** The crest's outline: a gem pointed at top and bottom with straight shoulders. */
function crestOutline(cx: number, cy: number, w: number, h: number): Pt[] {
  return roundedPolygon(
    [
      [cx, cy - h],
      [cx + w, cy - h * 0.48],
      [cx + w, cy + h * 0.3],
      [cx, cy + h],
      [cx - w, cy + h * 0.3],
      [cx - w, cy - h * 0.48],
    ],
    [3, 3, 3, 4, 3, 3],
    4,
  );
}

/**
 * The crest at cx,cy: light behind, blades, the cut gem, its glowing field and
 * glyph, and its crown. `small` thickens it for 32–48 pixels.
 */
function crest(dr: Drawing, tier: RankTier | 'placing', cx: number, cy: number, small: boolean): string {
  const g = GRANDEUR[tier];
  const m = tier === 'placing' ? MIST : RANK_METAL[tier];
  const field = tier === 'placing' ? MIST_FIELD : rankField(tier);
  const out: string[] = [];

  if (g.glow > 0) out.push(halo(dr, cx, cy - 2, small ? 52 : 58, m.mid, small ? g.glow * 0.8 : g.glow, 0.4));
  if (g.rays > 0 && !small) out.push(rays(dr, cx, cy - 4, 36, tier === 'sterk' ? 60 : 52, g.rays, m.light, tier === 'sterk' ? 0.95 : 0.6, tier === 'sterk' ? [-90, 270] : [-170, -10]));

  // blades, the lowest first so the higher lie over them
  const bladeCount = small ? Math.min(g.blades, 2) : g.blades;
  for (let i = bladeCount - 1; i >= 0; i--) {
    const len = (small ? 22 : 27) - i * (small ? 4 : 4.5);
    const deg = 34 - i * 19;
    const y = cy - g.h * 0.28 + i * (small ? 11 : 10);
    for (const side of [1, -1] as const) out.push(blade(cx + side * (g.w - 7), y, side, len + 7, small ? 11 : 9.5, deg, m));
  }

  // the crown, behind the gem's top
  const top = cy - g.h;
  if (g.crown === 'spike') out.push(spike(cx, top + 8, small ? 20 : 19, small ? 15 : 13, 0, m));
  if (g.crown === 'three') {
    out.push(spike(cx - 11, top + 14, small ? 16 : 15, 10, -5, m));
    out.push(spike(cx + 11, top + 14, small ? 16 : 15, 10, 5, m));
    out.push(spike(cx, top + 8, small ? 19 : 18, 13, 0, m));
  }

  // the gem: a cut rim, and the field glowing inside it
  const outline = crestOutline(cx, cy, g.w, g.h);
  const rim = small ? 7 : 5.5;
  const inner = offset(outline, -rim);
  out.push(facetBand(outline, inner, m, tier === 'placing' ? 4 : 6));
  out.push(edge(polyPath(outline), m.deep, small ? 1.8 : 1.2, 0.95));
  const fieldPath = polyPath(offset(outline, -rim - 0.2));
  out.push(`<path d="${polyPath(inner)}" fill="${m.deep}"/>`);
  const ground = dr.id('e');
  dr.def(radialAt(ground, [[0, field.glow], [0.55, field.mid], [1, field.deep]], cx, cy - 6, g.h + 4));
  out.push(`<path d="${fieldPath}" fill="url(#${ground})"/>`);
  const clip = dr.clip(fieldPath);
  const rimLight = dr.id('l');
  dr.def(linearAt(rimLight, [[0, m.hi, 0], [0.55, m.hi, 0], [1, m.hi, 0.8]], cx - g.w, cy - g.h, cx + g.w, cy + g.h));
  // a kilim eye in the field, faint, behind the glyph — and the field's cut
  const kilim = small
    ? ''
    : `<path d="${diamondAt(cx, cy - 1, g.w * 1.5, g.h * 1.5)}${diamondAt(cx, cy - 1, g.w * 1.2, g.h * 1.2)}" fill="${m.light}" fill-opacity="0.09" fill-rule="evenodd"/>` +
      `<path d="${diamondAt(cx, cy - g.h - 1, 9, 11)}${diamondAt(cx, cy + g.h - 1, 9, 11)}${diamondAt(cx - g.w, cy - 1, 9, 11)}${diamondAt(cx + g.w, cy - 1, 9, 11)}" fill="${m.light}" fill-opacity="0.12"/>`;
  out.push(
    `<g clip-path="url(#${clip})">${kilim}` +
      `<path d="M${n(cx + 70)},${n(cy - 70)}L${n(cx - 70)},${n(cy + 70)}L${n(cx - 70)},${n(cy - 70)}Z" fill="#ffffff" fill-opacity="0.07"/>` +
      `<path d="${fieldPath}" fill="none" stroke="url(#${rimLight})" stroke-width="${small ? 2.4 : 1.8}"/></g>`,
  );
  out.push(rankGlyph(dr, tier, cx, cy + (tier === 'sterk' ? 1 : 0), small ? 1.3 : 1.1, small, field));

  if (g.crown === 'star') {
    const sy = top + 2;
    out.push(halo(dr, cx, sy, small ? 22 : 26, '#ffffff', 0.7, 0.15));
    out.push(cutStar(cx, sy, small ? 15 : 15.5, m));
  }
  if (tier === 'lutke' || tier === 'sterk') {
    if (!small) out.push(`<path d="${sparkle(cx + g.w + 6, cy - g.h * 0.75, 5)}${sparkle(cx - g.w - 4, cy + g.h * 0.55, 3.4)}" fill="#ffffff"/>`);
  }
  return out.join('');
}

/** Under this many pixels an emblem is drawn in its small version: bolder, no rays, no chevrons. */
export const SMALL_EMBLEM = 56;

/** Figures 0–9 as strokes on a unit box, for the season's year. */
const FIGURES: readonly string[] = [
  'M0,0H1V1H0Z',
  'M0.15,0.25L0.55,0V1',
  'M0,0H1V0.5H0V1H1',
  'M0,0H1V1H0M0.2,0.5H1',
  'M0,0V0.55H1M0.8,0V1',
  'M1,0H0V0.5H1V1H0',
  'M1,0H0V1H1V0.5H0',
  'M0,0H1L0.45,1',
  'M0,0H1V1H0ZM0,0.5H1',
  'M1,0.5H0V0H1V1H0',
];

function figures(text: string, x: number, y: number, w: number, h: number, gap: number): string {
  const out: string[] = [];
  let at = x;
  for (const ch of text) {
    const f = FIGURES[Number(ch)];
    if (f === undefined) continue;
    out.push(
      f.replace(/([MLHV])([\d.]+)(?:,([\d.]+))?/g, (_m, cmd: string, a: string, b?: string) => {
        const ax = Number(a);
        if (cmd === 'H') return `H${n(at + ax * w)}`;
        if (cmd === 'V') return `V${n(y + ax * h)}`;
        return `${cmd}${n(at + ax * w)},${n(y + Number(b) * h)}`;
      }),
    );
    at += w + gap;
  }
  return out.join('');
}

export interface RankEmblemOptions {
  tier: RankTier;
  /** 3 = III (lowest) … 1 = I; leave out for the tier alone (and always for Stêrk) */
  division?: RankDivision;
  /**
   * For a season's emblem: the season and its year, shown under the crest in
   * place of a division.
   */
  season?: { name: Season; year: number };
  /** pixels; default 128 */
  size?: number;
  /** the accessible label; defaults to "Çiya II (Mountain)" */
  title?: string;
  idPrefix?: string;
}

/** The division's chevrons: one lit for III, two for II, three for I. */
function divisionMark(dr: Drawing, m: Metal, division: RankDivision, cx: number, cy: number): string {
  const [on, off] = chevrons(3, 4 - division, cx, cy, 11, 8.5, 3, 3.2);
  const lit = dr.id('q');
  dr.def(linearAt(lit, [[0, m.hi], [0.45, m.light], [1, m.mid]], 0, cy - 4, 0, cy + 4));
  // lit chevrons are solid and edged, unlit ones a faint tint: the count reads the same on a dark page and a light one
  return (
    (off ? `<path d="${off}" fill="${m.mid}" fill-opacity="0.3"/>` : '') +
    (on ? `<path d="${on}" fill="${m.deep}" stroke="${m.deep}" stroke-width="2.4" stroke-linejoin="round"/><path d="${on}" fill="url(#${lit})"/>` : '')
  );
}

/** The season's mark: a capsule with its glyph and the year's last two figures. */
function seasonMark(dr: Drawing, tier: RankTier, season: Season, year: number, cx: number, cy: number): string {
  const m = RANK_METAL[tier];
  const field = rankField(tier);
  const w = 50;
  const h = 17;
  const pill = capsule(cx, cy, w, h);
  const ground = dr.id('p');
  dr.def(linearAt(ground, [[0, field.mid], [1, field.deep]], 0, cy - h / 2, 0, cy + h / 2));
  const draw = ICONS[season];
  const glyph = draw ? `<g transform="translate(${n(cx - 12)} ${n(cy)}) scale(0.34)">${paintIcon(draw(), { dr, metal: m, field, small: true, locked: false })}</g>` : '';
  const yy = String(((year % 100) + 100) % 100).padStart(2, '0');
  const fig = `M${n(cx + 1.5)},${n(cy - 4.6)}L${n(cx + 0.6)},${n(cy - 2.2)}` + figures(yy, cx + 4, cy - 4.2, 4.6, 8.4, 3);
  return (
    `<path d="${pill}" fill="url(#${ground})" stroke="${m.mid}" stroke-width="1.4"/>` +
    glyph +
    `<path d="${fig}" fill="none" stroke="${m.hi}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>`
  );
}

const ROMAN: Record<RankDivision, string> = { 3: 'III', 2: 'II', 1: 'I' };

/** How many rated games place a player (R4). */
export const PLACEMENT_GAMES = 5;

export interface PlacementEmblemOptions {
  /** placement games played so far, 0–5 */
  done: number;
  /** pixels; default 128 */
  size?: number;
  /** the accessible label; defaults to "Placing 2/5" */
  title?: string;
  idPrefix?: string;
}

/**
 * The emblem before a first tier ("Placing 3/5"): an uncut silver crest round
 * ridges in mist, and five segments under it, as many lit as games played.
 */
export function placementEmblemSvg(opts: PlacementEmblemOptions): string {
  const { done } = opts;
  if (!Number.isInteger(done) || done < 0 || done > PLACEMENT_GAMES) throw new RangeError(`art: done must be 0–${PLACEMENT_GAMES}, got ${String(done)}`);
  const size = checkSize(opts.size, 128);
  const small = size < SMALL_EMBLEM;
  const dr = new Drawing(prefixFor(opts.idPrefix, 'placing', done, small));
  if (small) {
    dr.add(`<g transform="translate(60 60) scale(1.32) translate(-60 -60)">${crest(dr, 'placing', 60, 60, true)}</g>`);
  } else {
    dr.add(crest(dr, 'placing', 60, 52, false));
    const segs: string[] = [];
    const lit: string[] = [];
    for (let i = 0; i < PLACEMENT_GAMES; i++) (i < done ? lit : segs).push(capsule(60 + (i - 2) * 11, 103, 8.5, 5));
    // games played light up in Hevalo's violet; games to come are an outline, on either theme
    const glow = dr.id('q');
    dr.def(linearAt(glow, [[0, '#e3c4ff'], [1, '#b874f0']], 0, 100, 0, 106));
    if (segs.length) dr.add(`<path d="${segs.join('')}" fill="none" stroke="${MIST.dark}" stroke-width="1.2"/>`);
    if (lit.length) dr.add(`<path d="${lit.join('')}" fill="url(#${glow})" stroke="#6b3fa0" stroke-width="1.2"/>`);
  }
  return dr.svg(size, opts.title ?? `Placing ${done}/${PLACEMENT_GAMES}`);
}

/** A rank tier's emblem, with its division if given. */
export function rankEmblemSvg(opts: RankEmblemOptions): string {
  const { tier, division, season } = opts;
  if (!RANK_TIERS.includes(tier)) throw new RangeError(`art: unknown rank tier ${String(tier)}`);
  if (division !== undefined && ![1, 2, 3].includes(division)) throw new RangeError(`art: division must be 1, 2 or 3, got ${String(division)}`);
  if (season !== undefined && (!SEASONS.includes(season.name) || !Number.isInteger(season.year) || season.year < 2000 || season.year > 2999)) {
    throw new RangeError(`art: season must be one of ${SEASONS.join(', ')} with a four-figure year`);
  }
  const size = checkSize(opts.size, 128);
  const small = size < SMALL_EMBLEM;
  const shown = tier === 'sterk' || season ? undefined : division;
  const dr = new Drawing(prefixFor(opts.idPrefix, 'rank', tier, shown, small, season?.name, season?.year));
  const nm = RANK_TIER_NAMES[tier];
  const starred = tier === 'sterk' ? 4 : 0;
  if (small) {
    // the crest alone, closer in; the division is in the title and beside it in the app
    const cy = 60 + (tier === 'ciya' || tier === 'lutke' ? 3 : 0) + starred / 2;
    dr.add(`<g transform="translate(60 60) scale(${tier === 'dest' ? 1.3 : 1.1}) translate(-60 ${-cy})">${crest(dr, tier, 60, cy, true)}</g>`);
  } else {
    const marked = shown !== undefined || season !== undefined;
    const cy = (marked ? 54 : 58) + starred;
    dr.add(crest(dr, tier, 60, cy, false));
    if (season) dr.add(seasonMark(dr, tier, season.name, season.year, 60, 107));
    else if (shown !== undefined) dr.add(divisionMark(dr, RANK_METAL[tier], shown, 60, 106));
  }
  const when = season ? ` · ${SEASON_NAMES[season.name].ku} ${season.year}` : '';
  const title = opts.title ?? `${nm.ku}${shown === undefined ? '' : ` ${ROMAN[shown]}`} (${nm.en})${when}`;
  return dr.svg(size, title);
}
