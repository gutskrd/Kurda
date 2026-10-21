/**
 * Season frames (contract 4, R5/B3): the ring a player's avatar wears in the
 * colour of the best rank tier they reached in a season, kept for good.
 *
 * The middle is empty: the frame is laid over the avatar, which shows through.
 * `SEASON_FRAME_INNER` says how much of the frame's width the avatar should
 * fill, so both apps size it the same.
 *
 * The ring is the rank medallion's rim, and it grows the way the medallions
 * do: a plain metal ring for Deşt; a ring of dots for Gir; a kilim band for
 * Zozan; small laurel sprigs at the foot for Çiya; laurels up the sides and a
 * crown of three rounded peaks for Lûtke; and for Stêrk the full wreath, a
 * star on the crown and a soft glow round the outside. Lûtke and Stêrk frames
 * have a shine (SEASON_FRAME_SHINE): a soft gleam that travels round the
 * ring. The gleam is its own drawing, `seasonFrameShineSvg`, the same size as
 * the frame and centred on it, so an app lays it on top and turns it (CSS on
 * the web, Animated on the phone) — and leaves it still, or does not draw it,
 * when the person has asked for reduced motion. Passing `shine: true` to
 * `seasonFrameSvg` bakes one gleam into the frame instead, for a still picture.
 */
import { circ } from './icons.js';
import type { RankTier } from './keys.js';
import { RANK_TIER_NAMES, RANK_TIERS } from './keys.js';
import type { Metal } from './palette.js';
import { RANK_METAL } from './palette.js';
import { crown, dotsAt, kilimRing, laurel, lipMetal, rimMetal, ring, roundAbout } from './paint.js';
import { detailFor } from './ranks.js';
import { Drawing, checkSize, linearAt, n, n2, prefixFor, radialAt } from './svg.js';

const C = 60;
const INNER = 40;
const OUTER = 47;

/** The avatar's diameter as a fraction of the frame's size. */
export const SEASON_FRAME_INNER = INNER / C;

/** Which frames have the travelling gleam (the "animated variant" of R5). */
export const SEASON_FRAME_SHINE: Record<RankTier, boolean> = {
  dest: false,
  gir: false,
  zozan: false,
  ciya: false,
  lutke: true,
  sterk: true,
};

/** Under this many pixels a frame leaves out its finest ornament. */
export const SMALL_FRAME = 56;

interface Ladder {
  rim: 'plain' | 'dots' | 'kilim';
  laurel: 0 | 1 | 2 | 3;
  crown: 'none' | 'pearls' | 'star';
  glow: number;
}

const LADDER: Record<RankTier, Ladder> = {
  dest: { rim: 'plain', laurel: 0, crown: 'none', glow: 0 },
  gir: { rim: 'dots', laurel: 0, crown: 'none', glow: 0 },
  zozan: { rim: 'kilim', laurel: 0, crown: 'none', glow: 0 },
  ciya: { rim: 'kilim', laurel: 1, crown: 'none', glow: 0 },
  lutke: { rim: 'kilim', laurel: 2, crown: 'pearls', glow: 0.3 },
  sterk: { rim: 'kilim', laurel: 3, crown: 'star', glow: 0.55 },
};

const LAUREL: Record<1 | 2 | 3, { from: number; to: number; leaves: number }> = {
  1: { from: 74, to: 32, leaves: 3 },
  2: { from: 76, to: -6, leaves: 5 },
  3: { from: 78, to: -58, leaves: 8 },
};

const rad = (deg: number): number => (deg * Math.PI) / 180;

/** The gleam: a soft band of light along the ring's upper left, fading at both ends, brightest a little past its middle. */
function gleam(dr: Drawing, from = -158, to = -98): string {
  const r = (INNER + OUTER) / 2;
  const p0 = [C + Math.cos(rad(from)) * r, C + Math.sin(rad(from)) * r] as const;
  const p1 = [C + Math.cos(rad(to)) * r, C + Math.sin(rad(to)) * r] as const;
  const id = dr.id('s');
  dr.def(
    linearAt(
      id,
      [
        [0, '#ffffff', 0],
        [0.62, '#ffffff', 0.75],
        [1, '#ffffff', 0],
      ],
      p0[0],
      p0[1],
      p1[0],
      p1[1],
    ),
  );
  const clip = dr.clip(ring(C, C, OUTER - 0.4, INNER + 0.4), true);
  const head = rad(from + (to - from) * 0.62);
  const hx = C + Math.cos(head) * r;
  const hy = C + Math.sin(head) * r;
  const soft = dr.id('s');
  dr.def(
    radialAt(
      soft,
      [
        [0, '#ffffff', 0.7],
        [1, '#ffffff', 0],
      ],
      hx,
      hy,
      6,
    ),
  );
  return (
    `<g clip-path="url(#${clip})"><path d="M${n(p0[0])},${n(p0[1])}A${r},${r} 0 0 1 ${n(p1[0])},${n(p1[1])}" fill="none" stroke="url(#${id})" stroke-width="8" stroke-linecap="round"/></g>` +
    `<circle cx="${n(hx)}" cy="${n(hy)}" r="6" fill="url(#${soft})"/>`
  );
}

export interface SeasonFrameOptions {
  tier: RankTier;
  /** pixels; default 128 */
  size?: number;
  /** bake one still gleam into the frame */
  shine?: boolean;
  /** the accessible label; defaults to "Lûtke season frame" */
  title?: string;
  idPrefix?: string;
}

/** A season frame as an SVG string; the middle is empty for the avatar beneath. */
export function seasonFrameSvg(opts: SeasonFrameOptions): string {
  const { tier } = opts;
  if (!RANK_TIERS.includes(tier)) throw new RangeError(`art: unknown rank tier ${String(tier)}`);
  const size = checkSize(opts.size, 128);
  const detail = detailFor(size, SMALL_FRAME);
  const bold = detail > 0;
  const dr = new Drawing(prefixFor(opts.idPrefix, 'frame', tier, Boolean(opts.shine), detail));
  const m: Metal = RANK_METAL[tier];
  const g = LADDER[tier];
  const out: string[] = [];

  // the ring's own light, round the outside only: nothing is laid over the avatar
  if (g.glow > 0) {
    const glow = dr.id('o');
    dr.def(
      radialAt(
        glow,
        [
          [OUTER / 59, m.light, g.glow],
          [1, m.light, 0],
        ],
        C,
        C,
        59,
      ),
    );
    out.push(`<path d="${ring(C, C, 59, OUTER - 1)}" fill="url(#${glow})" fill-rule="evenodd"/>`);
  }
  // the ring's shadow: the pin's edge below it, falling a little onto the avatar's top
  out.push(`<path d="${ring(C, C, OUTER, INNER)}" transform="translate(0 ${bold ? 2.6 : 2})" fill="${m.deep}" fill-opacity="0.5" fill-rule="evenodd"/>`);

  if (g.laurel !== 0) {
    const l = LAUREL[g.laurel];
    const leaves = detail === 2 ? Math.max(2, Math.ceil(l.leaves / 2)) : detail === 1 ? Math.max(2, l.leaves - 2) : l.leaves;
    const scale = detail === 2 ? 1.3 : detail === 1 ? 1.15 : 1;
    out.push(laurel({ cx: C, cy: C, r: OUTER + 3.2, from: l.from, to: l.to, leaves, len: 8.2 * scale, width: 3.3 * scale, m, edged: !bold }));
  }
  // the crown stands in the thirteen units above the ring, its star kept inside the square
  if (g.crown !== 'none') out.push(crown(dr, m, C, C - OUTER + 4.5, bold ? 27 : 24, bold ? 12.5 : 11.5, detail === 2 && g.crown === 'pearls' ? 'none' : g.crown, bold ? 5.2 : 4.8));

  // the ring: smooth metal, edged in its own darkest tone, with the lip at the avatar's edge
  out.push(
    `<path d="${ring(C, C, OUTER, INNER)}" fill="url(#${rimMetal(dr, m, C, C, OUTER)})" fill-rule="evenodd" stroke="${m.deep}" stroke-width="${n2(detail === 2 ? 3 : bold ? 2.2 : 1.2)}"/>`,
  );
  const mid = (INNER + OUTER) / 2;
  if (detail < 2 && g.rim !== 'plain') {
    if (g.rim === 'kilim' && detail === 0) out.push(kilimRing(C, C, mid, 24, 4.4, m.hi, m.dark));
    else out.push(`<path d="${dotsAt(roundAbout(C, C, mid, detail === 0 ? 30 : 16, 0.5), detail === 0 ? 1.15 : 1.6)}" fill="${m.hi}"/>`);
  }
  out.push(`<path d="${circ(C, C, INNER + 0.6)}" fill="none" stroke="url(#${lipMetal(dr, m, C, C, INNER)})" stroke-width="${n2(bold ? 2.2 : 1.4)}"/>`);

  if (opts.shine) out.push(gleam(dr));
  dr.add(out.join(''));
  return dr.svg(size, opts.title ?? `${RANK_TIER_NAMES[tier].ku} season frame`);
}

export interface SeasonFrameShineOptions {
  /** the frame the gleam is for; it only changes the default title */
  tier: RankTier;
  size?: number;
  idPrefix?: string;
}

/**
 * The frame's gleam on its own, to lay over the frame and turn about its
 * centre. Decorative: its title says so, and apps hide it from screen readers.
 */
export function seasonFrameShineSvg(opts: SeasonFrameShineOptions): string {
  if (!RANK_TIERS.includes(opts.tier)) throw new RangeError(`art: unknown rank tier ${String(opts.tier)}`);
  const size = checkSize(opts.size, 128);
  const dr = new Drawing(prefixFor(opts.idPrefix, 'shine', opts.tier));
  dr.add(gleam(dr));
  return dr.svg(size, 'Shine');
}
