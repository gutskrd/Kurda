/**
 * Learning-league emblems (contract 4, L1/B3): six water tiers, each an enamel
 * piece with a scene of the water's journey inside it — a dewdrop on a leaf,
 * a spring bubbling up between stones, a river winding through its valley, a
 * mountain lake holding its peak, the sea with the sun on the horizon, and the
 * ocean's swell with a whale's tail rising from it.
 *
 * The shape is the journey too: Dilop is a drop, and each tier the drop
 * fills out and rounds, until Okyanûs is a full round medallion — the drop
 * has become the ocean. The rim's metal climbs with it (pearl, silver, gold,
 * rose gold, platinum, mother-of-pearl), and from Çem up a ring of beads is
 * set into it; the sea and the ocean glow. So the ladder reads at a glance by
 * its outline and its rim, before its colours or its picture.
 */
import { stations } from './geometry.js';
import type { LeagueTier } from './keys.js';
import { LEAGUE_TIER_NAMES, LEAGUE_TIERS } from './keys.js';
import { LEAGUE_METAL, LEAGUE_RIM } from './palette.js';
import { dotsAt, gloss, halo, lipMetal, pinShadow, rimMetal } from './paint.js';
import { detailFor } from './ranks.js';
import { sceneAt } from './scenes.js';
import type { Pt } from './svg.js';
import { Drawing, checkSize, n, n2, prefixFor } from './svg.js';

interface Ladder {
  /** how far the drop's point stands above its round body, as a share of the body's radius */
  point: number;
  beads: boolean;
  glow: number;
}

const LADDER: Record<LeagueTier, Ladder> = {
  dilop: { point: 0.66, beads: false, glow: 0 },
  kani: { point: 0.52, beads: false, glow: 0 },
  cem: { point: 0.39, beads: true, glow: 0 },
  gol: { point: 0.27, beads: true, glow: 0 },
  derya: { point: 0.14, beads: true, glow: 0.28 },
  okyanus: { point: 0, beads: true, glow: 0.5 },
};

/**
 * A drop at cx,cy (the middle of its round body), `r` in radius, its point
 * `h` above the body and rounded by `tip`: straight sides running into the
 * circle where they meet it, so the outline is smooth all the way round.
 * With no point it is a circle. Returns path data.
 */
function dropPath(cx: number, cy: number, r: number, h: number, tip: number): string {
  if (h < 0.5) return `M${n(cx - r)},${n(cy)}A${n(r)},${n(r)} 0 1 0 ${n(cx + r)},${n(cy)}A${n(r)},${n(r)} 0 1 0 ${n(cx - r)},${n(cy)}Z`;
  const d = r + h;
  const cos = r / d;
  const sin = Math.sqrt(1 - cos * cos);
  const top: Pt = [cx, cy - d];
  const right: Pt = [cx + r * sin, cy - r * cos];
  const left: Pt = [cx - r * sin, cy - r * cos];
  const side = Math.hypot(right[0] - top[0], right[1] - top[1]);
  const k = Math.min(0.45, tip / side);
  const nearL: Pt = [top[0] + (left[0] - top[0]) * k, top[1] + (left[1] - top[1]) * k];
  const nearR: Pt = [top[0] + (right[0] - top[0]) * k, top[1] + (right[1] - top[1]) * k];
  return `M${n(left[0])},${n(left[1])}L${n(nearL[0])},${n(nearL[1])}Q${n(top[0])},${n(top[1])} ${n(nearR[0])},${n(nearR[1])}L${n(right[0])},${n(right[1])}A${n(r)},${n(r)} 0 1 1 ${n(left[0])},${n(left[1])}Z`;
}

/** The same drop as points, for setting beads along its rim. */
function dropPoints(cx: number, cy: number, r: number, h: number): Pt[] {
  const d = r + h;
  const a = h < 0.5 ? 0 : Math.acos(r / d);
  const out: Pt[] = [];
  if (h >= 0.5) out.push([cx, cy - d]);
  // round the body from the right tangent point, under, to the left one
  const from = -90 + (a * 180) / Math.PI;
  const to = 270 - (a * 180) / Math.PI;
  const steps = 72;
  for (let i = 0; i <= steps; i++) {
    const deg = from + ((to - from) * i) / steps;
    const t = (deg * Math.PI) / 180;
    out.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]);
  }
  if (h < 0.5) out.pop();
  return out;
}

/** Where a league emblem sits: every tier the same height, so the drop widens as it rounds. */
function layoutOf(tier: LeagueTier, small: boolean): { cy: number; r: number; h: number } {
  const p = LADDER[tier].point;
  const top = small ? 3 : 9;
  const tall = small ? 111 : 94;
  const r = tall / (2 + p);
  return { cy: top + p * r + r, r, h: p * r };
}

export interface LeagueEmblemOptions {
  tier: LeagueTier;
  /** pixels; default 128 */
  size?: number;
  /** the accessible label; defaults to "Çem (River)" */
  title?: string;
  idPrefix?: string;
}

/** Under this many pixels an emblem is drawn in its small version: filling its square, bolder. */
export const SMALL_LEAGUE = 56;

/** A learning league's emblem as an SVG string. */
export function leagueEmblemSvg(opts: LeagueEmblemOptions): string {
  const { tier } = opts;
  if (!LEAGUE_TIERS.includes(tier)) throw new RangeError(`art: unknown league tier ${String(tier)}`);
  const size = checkSize(opts.size, 128);
  const detail = detailFor(size, SMALL_LEAGUE);
  const bold = detail > 0;
  const dr = new Drawing(prefixFor(opts.idPrefix, 'league', tier, detail));
  const g = LADDER[tier];
  const m = LEAGUE_RIM[tier];
  const { cy, r, h } = layoutOf(tier, bold);
  const out: string[] = [];

  // the water's own light, fading out before the square's edge so it never shows a hard side
  if (g.glow > 0) out.push(halo(dr, 60, 60, 59, LEAGUE_METAL[tier].light, g.glow, 0.55));
  const outline = dropPath(60, cy, r, h, r * 0.16);
  out.push(pinShadow(dr, outline, m.deep, 60, cy + r, r * 2, bold ? 3 : 2.2));

  const rimW = r * (bold ? 0.16 : 0.17);
  const fr = r - rimW;
  const fh = (h * fr) / r;
  out.push(`<path d="${outline}" fill="url(#${rimMetal(dr, m, 60, cy - h / 2, r + h / 2)})" stroke="${m.deep}" stroke-width="${n2(detail === 2 ? 3 : bold ? 2.2 : 1.2)}" stroke-linejoin="round"/>`);
  if (g.beads && detail < 2) {
    const mid = dropPoints(60, cy, r - rimW / 2, (h * (r - rimW / 2)) / r);
    const count = detail === 0 ? 26 : 13;
    out.push(`<path d="${dotsAt(stations(mid, count, 0.5).map((s) => s.p), rimW * (detail === 0 ? 0.17 : 0.2))}" fill="${m.hi}"/>`);
  }

  const field = dropPath(60, cy, fr, fh, r * 0.1);
  const clip = dr.clip(field);
  out.push(`<g clip-path="url(#${clip})">${sceneAt(dr, tier, 60, cy, fr, detail)}${gloss(dr, 60, cy - fh * 0.3, fr + fh * 0.3, bold ? 0.16 : 0.22)}</g>`);
  out.push(`<path d="${field}" fill="none" stroke="url(#${lipMetal(dr, m, 60, cy - fh / 2, fr + fh / 2)})" stroke-width="${n2(bold ? 2.4 : 1.6)}" stroke-linejoin="round"/>`);

  dr.add(out.join(''));
  const nm = LEAGUE_TIER_NAMES[tier];
  return dr.svg(size, opts.title ?? `${nm.ku} (${nm.en})`);
}

