/**
 * Season frames (contract 4, R5/B3): the ring a player's avatar wears in the
 * hue of the best rank tier they reached in a season, kept for good.
 *
 * The middle is empty: the frame is laid over the avatar, which shows through.
 * `SEASON_FRAME_INNER` says how much of the frame's width the avatar should
 * fill, so both apps size it the same.
 *
 * The ring is cut like the rank crests, finer as the tier climbs, with a halo
 * of its own light round the outside. It grows like the crests do — a plain cut
 * ring for Deşt; a kilim jewel at the top for Gir, and one at the foot too for
 * Zozan; a spike for Çiya; for Lûtke a crown of three spikes and a pair of
 * blades either side; for Stêrk the four-point star, three blades a side and a
 * burst of light. Lûtke and Stêrk frames have a shine (SEASON_FRAME_SHINE): a
 * glint that travels round the ring. The glint is its own drawing,
 * `seasonFrameShineSvg`, the same size as the frame and centred on it, so an
 * app lays it on top and turns it (CSS on the web, Animated on the phone) —
 * and leaves it still, or does not draw it, when the person has asked for
 * reduced motion. Passing `shine: true` to `seasonFrameSvg` bakes one glint
 * into the frame instead, for a still picture.
 */
import { circle } from './geometry.js';
import { circ } from './icons.js';
import type { RankTier } from './keys.js';
import { RANK_TIER_NAMES, RANK_TIERS } from './keys.js';
import type { Metal } from './palette.js';
import { RANK_METAL } from './palette.js';
import { blade, cutStar, edge, facetBand, kilimGem, ring, sparkle, spike } from './paint.js';
import { Drawing, checkSize, linearAt, n, prefixFor, radialAt } from './svg.js';

const C = 60;
const INNER = 40;
const OUTER = 47;

/** The avatar's diameter as a fraction of the frame's size. */
export const SEASON_FRAME_INNER = INNER / C;

/** Which frames have the travelling glint (the "animated variant" of R5). */
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

interface Grandeur {
  /** kilim jewels: at the top, and at the foot */
  top: boolean;
  foot: boolean;
  crown: 'none' | 'spike' | 'three' | 'star';
  blades: number;
  /** how finely the ring is cut */
  cut: number;
  glow: number;
}

const GRANDEUR: Record<RankTier, Grandeur> = {
  dest: { top: false, foot: false, crown: 'none', blades: 0, cut: 3, glow: 0.2 },
  gir: { top: true, foot: false, crown: 'none', blades: 0, cut: 4, glow: 0.26 },
  zozan: { top: true, foot: true, crown: 'none', blades: 0, cut: 5, glow: 0.32 },
  ciya: { top: false, foot: true, crown: 'spike', blades: 0, cut: 5, glow: 0.4 },
  lutke: { top: false, foot: true, crown: 'three', blades: 2, cut: 6, glow: 0.5 },
  sterk: { top: false, foot: true, crown: 'star', blades: 3, cut: 7, glow: 0.7 },
};

const rad = (deg: number): number => (deg * Math.PI) / 180;

/** The glint: a bright arc over the ring's upper left, fading at both ends, with a spark at its head. */
function glint(dr: Drawing, from = -158, to = -98): string {
  const r = (INNER + OUTER) / 2;
  const p0 = [C + Math.cos(rad(from)) * r, C + Math.sin(rad(from)) * r] as const;
  const p1 = [C + Math.cos(rad(to)) * r, C + Math.sin(rad(to)) * r] as const;
  const id = dr.id('s');
  dr.def(
    linearAt(
      id,
      [
        [0, '#ffffff', 0],
        [0.6, '#ffffff', 0.9],
        [1, '#ffffff', 0],
      ],
      p0[0],
      p0[1],
      p1[0],
      p1[1],
    ),
  );
  const clip = dr.clip(ring(C, C, OUTER - 0.4, INNER + 0.4), true);
  const arcAt = (rr: number): string =>
    `M${n(C + Math.cos(rad(from)) * rr)},${n(C + Math.sin(rad(from)) * rr)}A${n(rr)},${n(rr)} 0 0 1 ${n(C + Math.cos(rad(to)) * rr)},${n(C + Math.sin(rad(to)) * rr)}`;
  const head = rad(from + (to - from) * 0.6);
  const hx = C + Math.cos(head) * r;
  const hy = C + Math.sin(head) * r;
  return (
    `<g clip-path="url(#${clip})"><path d="${arcAt(r)}" fill="none" stroke="url(#${id})" stroke-width="7" stroke-linecap="round"/></g>` +
    `<path d="${sparkle(hx, hy, 6.5, 0.16)}" fill="#ffffff"/>`
  );
}

export interface SeasonFrameOptions {
  tier: RankTier;
  /** pixels; default 128 */
  size?: number;
  /** bake one still glint into the frame */
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
  const small = size < SMALL_FRAME;
  const dr = new Drawing(prefixFor(opts.idPrefix, 'frame', tier, Boolean(opts.shine), small));
  const m: Metal = RANK_METAL[tier];
  const g = GRANDEUR[tier];
  const out: string[] = [];

  // the ring's own light, round the outside only: nothing is laid over the avatar
  const glow = dr.id('o');
  const reach = small ? 56 : 59;
  dr.def(
    radialAt(
      glow,
      [
        [OUTER / reach - 0.04, m.mid, g.glow],
        [1, m.mid, 0],
      ],
      C,
      C,
      reach,
    ),
  );
  out.push(`<path d="${ring(C, C, reach, OUTER - 2)}" fill="url(#${glow})" fill-rule="evenodd"/>`);
  if (tier === 'sterk' && !small) {
    // a burst of light behind the top half, kept outside the ring
    const id = dr.id('r');
    dr.def(radialAt(id, [[0.78, m.light, 0.9], [1, m.light, 0]], C, C, 60));
    const spokes: string[] = [];
    for (let i = 0; i < 11; i++) {
      const a = rad(-165 + i * 15);
      const len = i % 2 === 0 ? 60 : 55;
      const half = i % 2 === 0 ? 0.05 : 0.04;
      spokes.push(
        `M${n(C + Math.cos(a - half) * 46)},${n(C + Math.sin(a - half) * 46)}L${n(C + Math.cos(a) * len)},${n(C + Math.sin(a) * len)}L${n(C + Math.cos(a + half) * 46)},${n(C + Math.sin(a + half) * 46)}Z`,
      );
    }
    out.push(`<path d="${spokes.join('')}" fill="url(#${id})"/>`);
  }

  // blades swept up off the ring's shoulders
  const bladeCount = small ? Math.min(g.blades, 1) : g.blades;
  for (let i = bladeCount - 1; i >= 0; i--) {
    for (const side of [1, -1] as const) {
      const a = rad(side === 1 ? -38 + i * 17 : -142 - i * 17);
      out.push(blade(C + Math.cos(a) * (OUTER - 3), C + Math.sin(a) * (OUTER - 3), side, (small ? 14 : 15) - i * 2.5, small ? 8.5 : 7, 40 - i * 22, m));
    }
  }

  // the crown, behind the ring's top
  const top = C - OUTER;
  if (g.crown === 'spike') out.push(spike(C, top + 6, small ? 17 : 17, small ? 14 : 13, 0, m));
  if (g.crown === 'three') {
    out.push(spike(C - 10, top + 8, small ? 12 : 11, 9, -4, m));
    out.push(spike(C + 10, top + 8, small ? 12 : 11, 9, 4, m));
    out.push(spike(C, top + 5, small ? 17 : 16, 11, 0, m));
  }

  // the ring: cut facets, its edge, and the avatar's edge
  const count = 96;
  out.push(facetBand(circle(C, C, OUTER, count), circle(C, C, INNER, count), m, g.cut));
  out.push(edge(`${ring(C, C, OUTER, INNER)}`, m.deep, small ? 1.8 : 1.2, 0.95));
  const rimLight = dr.id('l');
  dr.def(linearAt(rimLight, [[0, m.hi, 0], [0.55, m.hi, 0], [1, m.hi, 0.9]], C - OUTER, C - OUTER, C + OUTER, C + OUTER));
  out.push(`<path d="${circ(C, C, OUTER - 1.2)}" fill="none" stroke="url(#${rimLight})" stroke-width="1.2"/>`);

  if (g.top) out.push(kilimGem(dr, C, top + 3.5, small ? 12 : 9.5, small ? 14 : 11.5, m));
  if (g.foot) out.push(kilimGem(dr, C, C + OUTER - 3.5, small ? 12 : 9.5, small ? 14 : 11.5, m));
  if (g.crown === 'star') out.push(cutStar(C, top + 1, small ? 13 : 12, m));

  if (opts.shine) out.push(glint(dr));
  dr.add(out.join(''));
  return dr.svg(size, opts.title ?? `${RANK_TIER_NAMES[tier].ku} season frame`);
}

export interface SeasonFrameShineOptions {
  /** the frame the glint is for; it only changes the default title */
  tier: RankTier;
  size?: number;
  idPrefix?: string;
}

/**
 * The frame's glint on its own, to lay over the frame and turn about its
 * centre. Decorative: its title says so, and apps hide it from screen readers.
 */
export function seasonFrameShineSvg(opts: SeasonFrameShineOptions): string {
  if (!RANK_TIERS.includes(opts.tier)) throw new RangeError(`art: unknown rank tier ${String(opts.tier)}`);
  const size = checkSize(opts.size, 128);
  const dr = new Drawing(prefixFor(opts.idPrefix, 'shine', opts.tier));
  dr.add(glint(dr));
  return dr.svg(size, 'Shine');
}
