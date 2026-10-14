/**
 * Season frames (contract 4, R5/B3): the ring a player's avatar wears in the
 * colour of the best rank tier they reached in a season, kept for good.
 *
 * The middle is empty: the frame is laid over the avatar, which shows through.
 * `SEASON_FRAME_INNER` says how much of the frame's width the avatar should
 * fill, so both apps size it the same.
 *
 * The frame grows like the emblems do — a plain ring for Deşt; gems, a woven
 * chain, a crest of peaks over the top, feathers, and for Stêrk a star with a
 * halo. Lûtke and Stêrk frames have a shine (SEASON_FRAME_SHINE): a glint that
 * travels round the ring. The glint is its own drawing, `seasonFrameShineSvg`,
 * the same size as the frame and centred on it, so an app lays it on top and
 * turns it (CSS on the web, Animated on the phone) — and leaves it still, or
 * does not draw it, when the person has asked for reduced motion. Passing
 * `shine: true` to `seasonFrameSvg` bakes one glint into the frame instead,
 * for a still picture.
 */
import { circ } from './icons.js';
import type { RankTier } from './keys.js';
import { RANK_TIER_NAMES, RANK_TIERS } from './keys.js';
import type { Metal } from './palette.js';
import { INK, RANK_METAL } from './palette.js';
import { OUTLINE, bevel, diamondAt, inked, metalAcross, metalBox, ring } from './paint.js';
import { Drawing, checkSize, linearAt, n, prefixFor } from './svg.js';

const C = 60;
const INNER = 40;
const OUTER = 48;

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
  gems: 0 | 1 | 2;
  chain: boolean;
  crest: 0 | 1 | 2;
  feathers: number;
  star: boolean;
}

const GRANDEUR: Record<RankTier, Grandeur> = {
  dest: { gems: 0, chain: false, crest: 0, feathers: 0, star: false },
  gir: { gems: 1, chain: false, crest: 0, feathers: 0, star: false },
  zozan: { gems: 2, chain: true, crest: 0, feathers: 0, star: false },
  ciya: { gems: 1, chain: true, crest: 1, feathers: 0, star: false },
  lutke: { gems: 1, chain: true, crest: 2, feathers: 2, star: false },
  sterk: { gems: 1, chain: true, crest: 0, feathers: 3, star: true },
};

const rad = (deg: number): number => (deg * Math.PI) / 180;

function feather(x: number, y: number, deg: number, len: number, w: number): string {
  const ux = Math.cos(rad(deg));
  const uy = Math.sin(rad(deg));
  const px = -uy;
  const py = ux;
  const tx = x + ux * len;
  const ty = y + uy * len;
  const P = (a: number, b: number): string => `${n(a)},${n(b)}`;
  return (
    `M${P(x + (px * w) / 2, y + (py * w) / 2)}C${P(x + ux * len * 0.5 + px * w * 0.75, y + uy * len * 0.5 + py * w * 0.75)} ${P(tx - ux * len * 0.2 + px * w * 0.2, ty - uy * len * 0.2 + py * w * 0.2)} ${P(tx, ty)}` +
    `C${P(tx - ux * len * 0.2 - px * w * 0.2, ty - uy * len * 0.2 - py * w * 0.2)} ${P(x + ux * len * 0.5 - px * w * 0.75, y + uy * len * 0.5 - py * w * 0.75)} ${P(x - (px * w) / 2, y - (py * w) / 2)}Z`
  );
}

function star4(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 8; i++) {
    const a = rad(i * 45 - 90);
    const rr = i % 2 === 0 ? (i % 4 === 0 ? r : r * 0.78) : r * 0.26;
    pts.push(`${n(cx + Math.cos(a) * rr)},${n(cy + Math.sin(a) * rr)}`);
  }
  return `M${pts.join('L')}Z`;
}

/** The glint: a bright arc over the ring's upper left, fading at both ends. */
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
        [0.55, '#ffffff', 0.85],
        [1, '#ffffff', 0],
      ],
      p0[0],
      p0[1],
      p1[0],
      p1[1],
    ),
  );
  const clip = dr.clip(ring(C, C, OUTER - 0.6, INNER + 0.6), true);
  const arcAt = (rr: number): string =>
    `M${n(C + Math.cos(rad(from)) * rr)},${n(C + Math.sin(rad(from)) * rr)}A${n(rr)},${n(rr)} 0 0 1 ${n(C + Math.cos(rad(to)) * rr)},${n(C + Math.sin(rad(to)) * rr)}`;
  const head = rad(from + (to - from) * 0.55);
  const hx = C + Math.cos(head) * r;
  const hy = C + Math.sin(head) * r;
  return (
    `<g clip-path="url(#${clip})"><path d="${arcAt(r)}" fill="none" stroke="url(#${id})" stroke-width="6" stroke-linecap="round"/>` +
    `<path d="${arcAt(OUTER - 1.6)}" fill="none" stroke="url(#${id})" stroke-width="1.4" stroke-linecap="round"/></g>` +
    `<path d="${star4(hx, hy, 5)}" fill="#ffffff" fill-opacity="0.95"/>`
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
  const fill = metalBox(dr, m);

  out.push(`<path d="${ring(C, C, OUTER + 1, INNER)}" fill="#000000" fill-opacity="0.24" fill-rule="evenodd" transform="translate(0 2.4)"/>`);

  if (g.star && !small) {
    const rays: string[] = [];
    for (let i = 0; i <= 8; i++) {
      const a = rad(-150 + i * 15);
      const long = i % 2 === 0;
      const len = long ? 59 : 55;
      const half = long ? 0.07 : 0.055;
      rays.push(
        `M${n(C + Math.cos(a - half) * 47)},${n(C + Math.sin(a - half) * 47)}L${n(C + Math.cos(a) * len)},${n(C + Math.sin(a) * len)}L${n(C + Math.cos(a + half) * 47)},${n(C + Math.sin(a + half) * 47)}Z`,
      );
    }
    out.push(inked(rays.join(''), `url(#${fill})`, 1.2));
  }

  if (g.feathers > 0 && !small) {
    const dark = dr.id('d');
    dr.def(linearAt(dark, [[0, m.light], [1, m.dark]], 0, 0, 0, 60));
    for (let i = g.feathers - 1; i >= 0; i--) {
      for (const side of [1, -1]) {
        const root = side === 1 ? -146 + i * 13 : -34 - i * 13;
        const x = C + Math.cos(rad(root)) * (OUTER - 3);
        const y = C + Math.sin(rad(root)) * (OUTER - 3);
        const dir = side === 1 ? 200 + i * 14 : -20 - i * 14;
        out.push(inked(feather(x, y, dir, 20 - i * 2, 7.5), i % 2 === 0 ? `url(#${fill})` : `url(#${dark})`, 1.8));
      }
    }
  }

  if (g.crest > 0) {
    // peaks rising over the top of the ring, snow on the highest
    const top = C - OUTER;
    const h = g.crest === 2 ? 11.5 : 9;
    const pts = [
      [C - 22, top + 9],
      [C - 13, top - h * 0.5],
      [C - 7.5, top + 0.5],
      [C, top - h],
      [C + 7.5, top + 0.5],
      [C + 13, top - h * 0.5],
      [C + 22, top + 9],
    ];
    out.push(inked(`M${pts.map(([x, y]) => `${n(x ?? 0)},${n(y ?? 0)}`).join('L')}Z`, `url(#${fill})`, small ? 2.6 : 2));
    const sx = (7.5 / (h + 0.5)) * 6.5;
    out.push(`<path d="M${n(C)},${n(top - h)}L${n(C - sx)},${n(top - h + 6.5)}L${n(C - sx * 0.35)},${n(top - h + 5)}L${n(C)},${n(top - h + 7)}L${n(C + sx * 0.45)},${n(top - h + 4.8)}L${n(C + sx)},${n(top - h + 6.5)}Z" fill="#ffffff"/>`);
  }

  // the ring
  const rim = metalAcross(dr, m, C - OUTER, C - OUTER, C + OUTER, C + OUTER);
  out.push(inked(ring(C, C, OUTER, INNER), `url(#${rim})`, small ? 3 : OUTLINE, ' fill-rule="evenodd"'));
  out.push(bevel(dr, circ(C, C, OUTER - 1.1), C - OUTER, C + 10, 1.2, 0.8));
  if (g.chain && !small) {
    out.push(`<path d="${ring(C, C, OUTER - 2, INNER + 2)}" fill="${m.dark}" fill-rule="evenodd"/>`);
    const mid = (INNER + OUTER) / 2;
    const count = Math.round((2 * Math.PI * mid) / 5.6);
    const ds: string[] = [];
    const dots: string[] = [];
    for (let i = 0; i < count; i++) {
      const deg = (360 / count) * i - 90;
      const x = C + Math.cos(rad(deg)) * mid;
      const y = C + Math.sin(rad(deg)) * mid;
      ds.push(diamondAt(x, y, (2 * Math.PI * mid) / count, OUTER - INNER - 4.6, deg + 90));
      if (i % 2 === 0) dots.push(diamondAt(x, y, 1.5, 1.5, deg + 90));
    }
    out.push(`<path d="${ds.join('')}" fill="${m.hi}"/><path d="${dots.join('')}" fill="#c2263f"/>`);
  }
  // the avatar's edge: a dark line so a light photo still has a border
  out.push(`<path d="${circ(C, C, INNER + 0.4)}" fill="none" stroke="${INK}" stroke-width="1.4"/>`);

  if (g.gems > 0) {
    const gem = (y: number): string => inked(diamondAt(C, y, small ? 11 : 8.5, small ? 13 : 10.5), `url(#${fill})`, small ? 2.4 : 1.8) + `<path d="${diamondAt(C, y, 3, 3.6)}" fill="#c2263f"/>`;
    if (g.crest === 0 && !g.star) out.push(gem(C - OUTER + 0.5));
    if (g.gems === 2 || g.crest > 0 || g.star) out.push(gem(C + OUTER - 0.5));
  }
  if (g.star) {
    const gold = dr.id('k');
    dr.def(linearAt(gold, [[0, '#fffbe6'], [0.5, m.light], [1, m.mid]], 0, 0, 0, 20));
    out.push(inked(star4(C, C - OUTER + 0.5, small ? 12 : 10.5), `url(#${gold})`, small ? 2.4 : 1.8));
    out.push(`<path d="${star4(C, C - OUTER + 0.5, 3.6)}" fill="#ffffff"/>`);
  }

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
