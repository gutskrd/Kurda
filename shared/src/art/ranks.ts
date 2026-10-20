/**
 * Game-rank emblems (contract 4, R4/B3): six tiers, each a round enamel
 * medallion with a small scene of the climb inside it — the sun rising over
 * the wheat of the plain, green hills with a tree, a high pasture in flower
 * with a black tent under far peaks, a snow-capped mountain, the summit above
 * the clouds, and the sun of twenty-one rays rising over the summit.
 *
 * The medallion grows with the tier the way a collection of pins does, so a
 * higher tier is told by its silhouette before its colour: Deşt is the plain
 * medallion; Gir adds a ring of dots to its rim; Zozan a kilim band; Çiya
 * small laurel sprigs at its foot; Lûtke laurels up its sides and a crown of
 * three rounded peaks; Stêrk the full wreath, a star on its crown and a soft
 * glow of its own.
 *
 * The division is a row of three round pips under the medallion, lit as the
 * player climbs: one for III, two for II, three for I — counted, not
 * coloured, so it reads for everyone; the title carries the numeral.
 *
 * A season's emblem — the peak tier a player reached, kept for good (R5) —
 * swaps the pips for the season's own plaque: its glyph (blossom, sun, leaf,
 * snowflake, the same as the season event badges) and the year's last two
 * figures, so last spring's Çiya is not this spring's.
 *
 * Small sizes get their own drawing rather than a shrunken one: under
 * SMALL_EMBLEM pixels the medallion fills its square and the pips give way
 * (the app writes the division beside it); under TINY_EMBLEM the rim's dots
 * and kilim go and the scene keeps only the shapes that say the place.
 */
import { ICONS, circ } from './icons.js';
import { paintIcon } from './iconpaint.js';
import type { RankDivision, RankTier, Season } from './keys.js';
import { RANK_TIER_NAMES, RANK_TIERS, SEASONS, SEASON_NAMES } from './keys.js';
import type { Field, Metal } from './palette.js';
import { PEARL, PLACING, RANK_FIELD, RANK_METAL } from './palette.js';
import { capsule, crown, dotsAt, gloss, halo, kilimRing, laurel, lipMetal, pinShadow, pips, rimMetal, roundAbout } from './paint.js';
import type { Detail } from './scenes.js';
import { sceneAt } from './scenes.js';
import { Drawing, checkSize, linearAt, n, n2, prefixFor } from './svg.js';

/** A rank tier's enamel, for a glyph or a plaque drawn in its colours. */
function rankField(t: RankTier): Field {
  return RANK_FIELD[t];
}

/** Under this many pixels an emblem is drawn in its small version: filling its square, no pips. */
export const SMALL_EMBLEM = 56;
/** Under this many pixels an emblem keeps only what says its tier: no rim ornament, its scene at its boldest. */
export const TINY_EMBLEM = 32;

/** How much of a scene to draw at `size` pixels. */
export function detailFor(size: number, small = SMALL_EMBLEM, tiny = TINY_EMBLEM): Detail {
  return size < tiny ? 2 : size < small ? 1 : 0;
}

// ─────────────────────────────────────────────────────────── the ladder

interface Ladder {
  /** what is set into the rim: nothing, a ring of dots, or a kilim band */
  rim: 'plain' | 'dots' | 'kilim';
  /** laurel: none, sprigs at the foot, branches up the sides, or the full wreath */
  laurel: 0 | 1 | 2 | 3;
  crown: 'none' | 'pearls' | 'star';
  /** the soft light behind the medallion */
  glow: number;
}

const LADDER: Record<RankTier | 'placing', Ladder> = {
  placing: { rim: 'plain', laurel: 0, crown: 'none', glow: 0 },
  dest: { rim: 'plain', laurel: 0, crown: 'none', glow: 0 },
  gir: { rim: 'dots', laurel: 0, crown: 'none', glow: 0 },
  zozan: { rim: 'kilim', laurel: 0, crown: 'none', glow: 0 },
  ciya: { rim: 'kilim', laurel: 1, crown: 'none', glow: 0 },
  lutke: { rim: 'kilim', laurel: 2, crown: 'pearls', glow: 0.32 },
  sterk: { rim: 'kilim', laurel: 3, crown: 'star', glow: 0.6 },
};

/** Where the right-hand laurel stem starts and ends (degrees, 90 = the foot), and how many leaves it carries. */
const LAUREL: Record<1 | 2 | 3, { from: number; to: number; leaves: number }> = {
  1: { from: 72, to: 24, leaves: 3 },
  2: { from: 76, to: -16, leaves: 5 },
  3: { from: 78, to: -60, leaves: 8 },
};

/**
 * A medallion of `key` at cx,cy, `r` in radius: its light, shadow and
 * ornaments, the metal rim, and its scene set in enamel. Returns markup.
 */
export function medallion(dr: Drawing, key: RankTier | 'placing', cx: number, cy: number, r: number, detail: Detail, lit = 0): string {
  const g = LADDER[key];
  const m: Metal = key === 'placing' ? PEARL : RANK_METAL[key];
  const out: string[] = [];
  const bold = detail > 0;

  // the glow fades out before the square's edge, so it never shows a hard side
  if (g.glow > 0) out.push(halo(dr, cx, cy, Math.min(r * 1.62, 59 - Math.abs(cy - 60), 59 - Math.abs(cx - 60)), m.light, g.glow, 0.5));
  out.push(pinShadow(dr, circ(cx, cy, r), m.deep, cx, cy + r, r * 2, bold ? 3 : 2.2));

  if (g.laurel !== 0) {
    const l = LAUREL[g.laurel];
    // small, the wreath keeps its shape with fewer, larger leaves
    const leaves = detail === 2 ? Math.max(2, Math.ceil(l.leaves / 2)) : detail === 1 ? Math.max(2, l.leaves - 1) : l.leaves;
    const scale = detail === 2 ? 1.5 : detail === 1 ? 1.2 : 1;
    out.push(laurel({ cx, cy, r: r + r * 0.11, from: l.from, to: l.to, leaves, len: r * 0.27 * scale, width: r * 0.105 * scale, m, edged: !bold }));
  }
  if (g.crown !== 'none') {
    const w = r * (bold ? 0.92 : 0.8);
    const h = r * (bold ? 0.4 : 0.34);
    out.push(crown(dr, m, cx, cy - r + r * 0.16, w, h, detail === 2 && g.crown === 'pearls' ? 'none' : g.crown));
  }

  // the rim: smooth metal, edged in its own darkest tone
  const rimW = r * (g.rim === 'kilim' && detail === 0 ? 0.22 : bold ? 0.17 : 0.18);
  const fr = r - rimW;
  const metal = rimMetal(dr, m, cx, cy, r);
  out.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="url(#${metal})" stroke="${m.deep}" stroke-width="${n2(detail === 2 ? 3 : bold ? 2.2 : 1.2)}"/>`);
  const mid = r - rimW / 2;
  if (detail < 2 && g.rim !== 'plain') {
    if (g.rim === 'kilim' && detail === 0) out.push(kilimRing(cx, cy, mid, 18, rimW * 0.62, m.hi, m.dark));
    else out.push(`<path d="${dotsAt(roundAbout(cx, cy, mid, detail === 0 ? 24 : 12, 0.5), rimW * (detail === 0 ? 0.17 : 0.2))}" fill="${m.hi}"/>`);
  }

  // the enamel: the scene, its one gloss, and the lip of the rim round it
  const clip = dr.clip(circ(cx, cy, fr));
  out.push(`<g clip-path="url(#${clip})">${sceneAt(dr, key, cx, cy, fr, detail, lit)}${gloss(dr, cx, cy, fr, bold ? 0.16 : 0.22)}</g>`);
  out.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(fr)}" fill="none" stroke="url(#${lipMetal(dr, m, cx, cy, fr)})" stroke-width="${n2(bold ? 2.4 : 1.6)}"/>`);
  return out.join('');
}

/** Where a medallion sits and how big it is: large ones leave the foot for pips; small ones fill the square. */
function layoutOf(tier: RankTier | 'placing', detail: Detail, marked: boolean): { cy: number; r: number } {
  const g = LADDER[tier];
  if (detail === 0) {
    if (g.laurel === 3) return marked ? { cy: 54, r: 32 } : { cy: 61, r: 36 };
    return marked ? { cy: 50, r: 37 } : { cy: 58, r: 38 };
  }
  // small: the ornaments need their room, so the medallion gives some up as they grow
  if (g.laurel === 0) return { cy: 59, r: 49 };
  if (g.laurel === 1) return { cy: 56, r: 44 };
  if (g.laurel === 2) return { cy: 63, r: 40 };
  return { cy: 64, r: 38 };
}

// ────────────────────────────────────────────────────── the season's plaque

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

/** The season's plaque: a rounded enamel bar with the season's glyph and the year's last two figures. */
function seasonMark(dr: Drawing, tier: RankTier, season: Season, year: number, cx: number, cy: number): string {
  const m = RANK_METAL[tier];
  const field = rankField(tier);
  const w = 52;
  const h = 18;
  const pill = capsule(cx, cy, w, h);
  const ground = dr.id('p');
  dr.def(linearAt(ground, [[0, field.glow], [1, field.deep]], 0, cy - h / 2, 0, cy + h / 2));
  const draw = ICONS[season];
  const glyph = draw ? `<g transform="translate(${n(cx - 12.5)} ${n(cy)}) scale(0.36)">${paintIcon(draw(), { dr, metal: m, field, small: true, locked: false })}</g>` : '';
  const yy = String(((year % 100) + 100) % 100).padStart(2, '0');
  const fig = `M${n(cx + 1.5)},${n(cy - 4.6)}L${n(cx + 0.6)},${n(cy - 2.2)}` + figures(yy, cx + 4, cy - 4.2, 4.6, 8.4, 3);
  return (
    `<path d="${pill}" transform="translate(0 1.6)" fill="${m.deep}" fill-opacity="0.55"/>` +
    `<path d="${pill}" fill="url(#${ground})" stroke="url(#${rimMetal(dr, m, cx, cy, w / 2)})" stroke-width="2"/>` +
    glyph +
    `<path d="${fig}" fill="none" stroke="${m.hi}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>`
  );
}

// ─────────────────────────────────────────────────────────── the emblems

export interface RankEmblemOptions {
  tier: RankTier;
  /** 3 = III (lowest) … 1 = I; leave out for the tier alone (and always for Stêrk) */
  division?: RankDivision;
  /**
   * For a season's emblem: the season and its year, shown under the
   * medallion in place of a division.
   */
  season?: { name: Season; year: number };
  /** pixels; default 128 */
  size?: number;
  /** the accessible label; defaults to "Çiya II (Mountain)" */
  title?: string;
  idPrefix?: string;
}

const ROMAN: Record<RankDivision, string> = { 3: 'III', 2: 'II', 1: 'I' };

/** Where the pips or the plaque sit under a large medallion. */
const FOOT_Y = 104;

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
 * The emblem before a first tier ("Placing 3/5"): a pearl medallion with a
 * path of five stepping stones winding up toward peaks in the mist, one for
 * each placement game and lit as it is played, and five pips under it that
 * count the same — so the count still shows when the emblem is too small for
 * pips.
 */
export function placementEmblemSvg(opts: PlacementEmblemOptions): string {
  const { done } = opts;
  if (!Number.isInteger(done) || done < 0 || done > PLACEMENT_GAMES) throw new RangeError(`art: done must be 0–${PLACEMENT_GAMES}, got ${String(done)}`);
  const size = checkSize(opts.size, 128);
  const detail = detailFor(size);
  const dr = new Drawing(prefixFor(opts.idPrefix, 'placing', done, detail));
  const at = layoutOf('placing', detail, true);
  dr.add(medallion(dr, 'placing', 60, at.cy, at.r, detail, done));
  if (detail === 0) dr.add(pips(dr, PLACING, PLACEMENT_GAMES, done, 60, FOOT_Y, 4.2, 4.2));
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
  const detail = detailFor(size);
  const shown = tier === 'sterk' || season ? undefined : division;
  const dr = new Drawing(prefixFor(opts.idPrefix, 'rank', tier, shown, detail, season?.name, season?.year));
  const marked = detail === 0 && (shown !== undefined || season !== undefined);
  const at = layoutOf(tier, detail, marked);
  dr.add(medallion(dr, tier, 60, at.cy, at.r, detail));
  if (detail === 0) {
    if (season) dr.add(seasonMark(dr, tier, season.name, season.year, 60, FOOT_Y + 1));
    else if (shown !== undefined) dr.add(pips(dr, RANK_METAL[tier], 3, 4 - shown, 60, FOOT_Y, 4.8, 5.2));
  }
  const nm = RANK_TIER_NAMES[tier];
  const when = season ? ` · ${SEASON_NAMES[season.name].ku} ${season.year}` : '';
  const title = opts.title ?? `${nm.ku}${shown === undefined ? '' : ` ${ROMAN[shown]}`} (${nm.en})${when}`;
  return dr.svg(size, title);
}
