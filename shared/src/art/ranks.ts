/**
 * Game-rank emblems (contract 4, R4/B3): six tiers, each a crest — a cut
 * stone in a rounded bezel, set in the tier's own metal, with a setting that
 * grows as the player climbs (see crest.ts).
 *
 *   Deşt, the plain     a carnelian shield, alone in its bezel
 *   Gir, the hills      an emerald kite with a first pair of wings
 *   Zozan, the pasture  a turquoise hexagon, its wings fuller, beads round its bezel
 *   Çiya, the mountain  a sapphire peak on a laurel
 *   Lûtke, the summit   an amethyst octagon under a crown of pearls, glowing
 *   Stêrk, the star     a round stone of starlight in gold, the full crest: a star on its crown, a hanging stone, the sun's rays
 *
 * Into each stone is cut, in white, the place it is named for — a sheaf of
 * wheat, the hills, the black tent, the snowy peak, the star over the summit,
 * the eight-pointed star — so the crest still says where you are.
 *
 * The division is a small plaque under the crest with three stones set in
 * it, lit as the player climbs: one for III, two for II, three for I —
 * counted, not coloured, so it reads for everyone; the title carries the
 * numeral.
 *
 * A season's emblem — the peak tier a player reached, kept for good (R5) —
 * swaps the stones for the season's own plaque: its glyph (blossom, sun,
 * leaf, snowflake, the same as the season event badges) and the year's last
 * two figures, so last spring's Çiya is not this spring's.
 *
 * Small sizes get their own drawing rather than a shrunken one: under
 * SMALL_EMBLEM pixels the crest fills its square, keeps its longest feathers and
 * drops the division (the app writes it beside it); under TINY_EMBLEM the
 * stone's table and its glyph go, and the setting keeps only what makes its
 * outline.
 */
import { ICONS } from './icons.js';
import { paintIcon } from './iconpaint.js';
import type { Crest, CrestBox } from './crest.js';
import { crestMarkup, divisionStones } from './crest.js';
import { RANK_GLYPHS } from './crest-glyphs.js';
import type { RankDivision, RankTier, Season } from './keys.js';
import { RANK_TIER_NAMES, RANK_TIERS, SEASONS, SEASON_NAMES } from './keys.js';
import type { Field } from './palette.js';
import { PEARL, PLACING, RANK_FIELD, RANK_GEM, RANK_METAL } from './palette.js';
import { capsule, rimMetal } from './paint.js';
import type { Detail } from './scenes.js';
import { Drawing, checkSize, linearAt, n, prefixFor } from './svg.js';

/** A rank tier's enamel, for a glyph or a plaque drawn in its colours. */
function rankField(t: RankTier): Field {
  return RANK_FIELD[t];
}

/** Under this many pixels an emblem is drawn in its small version: filling its square, no division. */
export const SMALL_EMBLEM = 56;
/** Under this many pixels an emblem keeps only what says its tier: its outline, its colours, its cut. */
export const TINY_EMBLEM = 32;

/** How much of a drawing to keep at `size` pixels. */
export function detailFor(size: number, small = SMALL_EMBLEM, tiny = TINY_EMBLEM): Detail {
  return size < tiny ? 2 : size < small ? 1 : 0;
}

// ─────────────────────────────────────────────────────────── the ladder

/** Each tier's crest: the cut of its stone and how grand its setting is. */
const LADDER: Record<RankTier, Pick<Crest, 'cut' | 'wings' | 'base' | 'crown' | 'beads' | 'glow' | 'rays'>> = {
  dest: { cut: 'shield', wings: 0, base: 0, crown: 'none', beads: false, glow: 0, rays: false },
  gir: { cut: 'kite', wings: 1, base: 0, crown: 'none', beads: false, glow: 0, rays: false },
  zozan: { cut: 'hexagon', wings: 2, base: 0, crown: 'none', beads: true, glow: 0, rays: false },
  ciya: { cut: 'peak', wings: 3, base: 1, crown: 'none', beads: true, glow: 0, rays: false },
  lutke: { cut: 'octagon', wings: 4, base: 1, crown: 'pearls', beads: true, glow: 0.3, rays: false },
  sterk: { cut: 'brilliant', wings: 5, base: 2, crown: 'star', beads: true, glow: 0.55, rays: true },
};

/** A tier's crest, whole. */
export function rankCrest(tier: RankTier): Crest {
  return { ...LADDER[tier], gem: RANK_GEM[tier], metal: RANK_METAL[tier], glyph: RANK_GLYPHS[tier] };
}

/** How much room a crest has: large ones leave the foot for the division; small ones fill the square. */
export function crestBox(detail: Detail, marked: boolean): CrestBox {
  if (detail === 2) return { top: 2, bottom: 118, cap: 40 };
  if (detail === 1) return { top: 3, bottom: 117, cap: 36 };
  return marked ? { top: 4, bottom: 94, cap: 24 } : { top: 6, bottom: 114, cap: 26 };
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
 * The emblem before a first tier ("Placing 3/5"): a pearl crest whose stone
 * is cut in five facets round its table, one for each placement game, each
 * lit in Hevalo's violet as it is played — so the count shows in the stone
 * itself, at any size — and five small stones under it that count the same.
 */
export function placementEmblemSvg(opts: PlacementEmblemOptions): string {
  const { done } = opts;
  if (!Number.isInteger(done) || done < 0 || done > PLACEMENT_GAMES) throw new RangeError(`art: done must be 0–${PLACEMENT_GAMES}, got ${String(done)}`);
  const size = checkSize(opts.size, 128);
  const detail = detailFor(size);
  const dr = new Drawing(prefixFor(opts.idPrefix, 'placing', done, detail));
  const crest: Crest = { cut: 'pentagon', gem: PEARL, metal: PEARL, wings: 0, base: 0, crown: 'none', beads: false, glow: 0, rays: false };
  // the facet at the top is the first game, and the count goes round clockwise
  const order = [4, 0, 1, 2, 3];
  const { markup } = crestMarkup(dr, crest, { detail, box: crestBox(detail, detail === 0), table: (i) => (order.indexOf(i) < done ? PLACING : PEARL) });
  dr.add(markup);
  if (detail === 0) dr.add(divisionStones(dr, PLACING, PEARL, PLACEMENT_GAMES, done, 60, FOOT_Y, 10, 13, 5));
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
  const { markup } = crestMarkup(dr, rankCrest(tier), { detail, box: crestBox(detail, marked) });
  dr.add(markup);
  if (detail === 0) {
    if (season) dr.add(seasonMark(dr, tier, season.name, season.year, 60, FOOT_Y + 1));
    else if (shown !== undefined) dr.add(divisionStones(dr, RANK_GEM[tier], RANK_METAL[tier], 3, 4 - shown, 60, FOOT_Y, 11, 14, 7));
  }
  const nm = RANK_TIER_NAMES[tier];
  const when = season ? ` · ${SEASON_NAMES[season.name].ku} ${season.year}` : '';
  const title = opts.title ?? `${nm.ku}${shown === undefined ? '' : ` ${ROMAN[shown]}`} (${nm.en})${when}`;
  return dr.svg(size, title);
}
