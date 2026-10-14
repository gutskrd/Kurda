/**
 * Game-rank emblems (contract 4, R4/B3): six tiers, each a window onto the
 * climb — a harvested plain, green hills, a high pasture with a nomad's tent,
 * a snow-capped mountain, a summit above the clouds that breaks out of its own
 * frame, and the star over the peak.
 *
 * The frame grows with the tier as the landscape does: a plain ring for Deşt;
 * a gem, then woven diamonds, then wings of blades, a spike, a crown; rays
 * behind Stêrk. The division (III, II, I) is a plaque of drawn numerals under
 * the window — numerals, not colour, so it reads for everyone.
 */
import { circ } from './icons.js';
import type { RankDivision, RankTier } from './keys.js';
import { RANK_TIER_NAMES, RANK_TIERS } from './keys.js';
import type { Metal } from './palette.js';
import { INK, RANK_METAL, RANK_SKY } from './palette.js';
import { OUTLINE, bevel, diamondAt, dropShadow, inked, metalAcross, metalBox, numeral, ring } from './paint.js';
import { Drawing, checkSize, linearAt, n, n2, prefixFor, seeded } from './svg.js';

/** The window's radius in its own units; scenes are drawn in −27…27. */
const W = 27;

const sky = (dr: Drawing, top: string, bottom: string, y1 = -W, y2 = 8): string => {
  const id = dr.id('s');
  dr.def(
    linearAt(
      id,
      [
        [0, top],
        [1, bottom],
      ],
      0,
      y1,
      0,
      y2,
    ),
  );
  return `<rect x="-30" y="-30" width="60" height="60" fill="url(#${id})"/>`;
};

const vertical = (dr: Drawing, top: string, bottom: string, y1: number, y2: number): string => {
  const id = dr.id('g');
  dr.def(
    linearAt(
      id,
      [
        [0, top],
        [1, bottom],
      ],
      0,
      y1,
      0,
      y2,
    ),
  );
  return `url(#${id})`;
};

function stars(name: string, count: number, top: number, bottom: number): string {
  const rnd = seeded(name);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const x = -W + rnd() * W * 2;
    const y = top + rnd() * (bottom - top);
    const r = 0.35 + rnd() * 0.65;
    out.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n2(r)}" fill="#ffffff" fill-opacity="${n2(0.55 + rnd() * 0.45)}"/>`);
  }
  return out.join('');
}

/** Where a tier's peak is, for the tiers whose summit breaks out of the window. */
const APEX: Partial<Record<RankTier, number>> = { lutke: -37 };

/**
 * The scene inside the window, in window units (−27…27). The caller places,
 * scales and clips it.
 */
function scene(dr: Drawing, tier: RankTier): string {
  const [top, bottom] = RANK_SKY[tier];
  const out: string[] = [sky(dr, top, bottom)];
  switch (tier) {
    case 'dest': {
      out.push(`<circle cx="8" cy="3" r="14" fill="#ffffff" fill-opacity="0.22"/>`);
      out.push(`<circle cx="8" cy="3" r="8.5" fill="#fff4cc"/>`);
      out.push(`<path d="M-30,4H30V30H-30Z" fill="${vertical(dr, '#e3b45a', '#9a6a28', 4, 27)}"/>`);
      const furrows: string[] = [];
      for (const x of [-60, -36, -18, -6, 6, 18, 36, 60]) furrows.push(`M${n(x * 0.06)},4.6L${n(x)},28`);
      out.push(`<path d="${furrows.join('')}" stroke="#7c4f1c" stroke-width="1.1" stroke-opacity="0.55" fill="none"/>`);
      out.push(`<path d="M-30,4H30" stroke="#8a5a22" stroke-width="0.9"/>`);
      // a lone tree on the horizon
      out.push(`<path d="M-15,4V0.5" stroke="#5a3a1a" stroke-width="0.9"/><circle cx="-15" cy="-0.6" r="2.4" fill="#6f7a2a"/>`);
      break;
    }
    case 'gir': {
      out.push(`<circle cx="-11" cy="-11" r="5" fill="#fff6cf"/>`);
      out.push(`<path d="M6,-12a3.5,3.5 0 0 1 6.5,-1.5a3,3 0 0 1 5,2.5H6Z" fill="#ffffff" fill-opacity="0.9"/>`);
      out.push(`<path d="M-30,6C-16,-6 -2,-4 8,2C16,-4 24,-2 30,2V30H-30Z" fill="#9ad47a"/>`);
      out.push(`<path d="M-30,14C-14,2 6,4 30,17V30H-30Z" fill="${vertical(dr, '#5fae4c', '#2f6e2c', 4, 27)}"/>`);
      out.push(`<path d="M-4,27C-2,20 4,16 1,11C-1,8 3,6 6,5" stroke="#e8f2c8" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-opacity="0.8"/>`);
      break;
    }
    case 'zozan': {
      out.push(`<path d="M-30,3L-20,-10L-13,-3L-3,-15L6,-4L14,-11L24,-1L30,-5V30H-30Z" fill="#87a4c8"/>`);
      out.push(`<path d="M-3,-15L-6.5,-10.5L-3.5,-11.5L-1,-9.5L0.4,-11.8Z M-20,-10L-22.5,-6.7L-20,-7.5L-18,-6.2Z M14,-11L11.8,-8L14,-8.8L16,-7.6Z" fill="#ffffff"/>`);
      out.push(`<path d="M-30,8C-14,0 4,2 30,8V30H-30Z" fill="#62bf98"/>`);
      out.push(`<path d="M-30,17C-8,9 10,13 30,21V30H-30Z" fill="${vertical(dr, '#3a9a76', '#1f6650', 10, 27)}"/>`);
      // a black goat-hair tent, the zozan's summer house
      out.push(`<path d="M3,12.5L6,8L13,8L16,12.5Z" fill="#2b2230"/><path d="M9.5,8V12.5" stroke="#5c4a60" stroke-width="0.8"/>`);
      const rnd = seeded('zozan-flowers');
      const flowers: string[] = [];
      const hues = ['#ffffff', '#ffd1dc', '#ffe58a'];
      for (let i = 0; i < 14; i++) {
        const x = -24 + rnd() * 48;
        const y = 15 + rnd() * 11;
        flowers.push(`<circle cx="${n(x)}" cy="${n(y)}" r="0.8" fill="${hues[i % 3]}"/>`);
      }
      out.push(flowers.join(''));
      break;
    }
    case 'ciya': {
      out.push(`<path d="M-30,10L-16,-7L-5,4Z" fill="#7d95c6"/>`);
      out.push(`<path d="M-24,30L2,-17L4,30Z" fill="#9aaed6"/>`);
      out.push(`<path d="M2,-17L28,30L4,30Z" fill="#4c5f90"/>`);
      out.push(`<path d="M2,-17L-6.5,-1.6L-2.6,-4.4L0.6,-0.6L4,-5.2L9.6,-3.4Z" fill="#ffffff"/>`);
      out.push(`<path d="M2,-17L9.6,-3.4L4,-5.2Z" fill="#c9d6ee"/>`);
      out.push(`<path d="M-30,18C-14,12 0,16 30,13V30H-30Z" fill="${vertical(dr, '#36507e', '#1d2f52', 12, 27)}"/>`);
      break;
    }
    case 'lutke': {
      const apex = APEX.lutke ?? -37;
      out.push(`<path d="M-21,30L0,${apex}L1.5,30Z" fill="#c4aee8"/>`);
      out.push(`<path d="M0,${apex}L21,30L1.5,30Z" fill="#6a4ea6"/>`);
      out.push(`<path d="M0,${apex}L-8.2,-10.8L-4.2,-13.2L-1,-9.4L2.6,-14.2L7.4,-11.2Z" fill="#ffffff"/>`);
      out.push(`<path d="M0,${apex}L7.4,-11.2L2.6,-14.2Z" fill="#dccdf2"/>`);
      // a sea of cloud below the summit
      out.push(
        `<path d="M-30,14C-26,9 -20,9 -17,12C-14,7 -7,7 -4,11C-1,7 6,7 9,11C12,7 19,8 21,12C24,9 29,10 30,12V30H-30Z" fill="#f6e9f6" fill-opacity="0.95"/>`,
      );
      out.push(`<path d="M-30,21C-22,17 -14,18 -9,21C-3,17 6,17 11,21C17,18 25,18 30,21V30H-30Z" fill="#e6d2ec"/>`);
      break;
    }
    case 'sterk': {
      out.push(stars('sterk-night', 26, -26, 6));
      const glow = dr.id('o');
      dr.def(`<radialGradient id="${glow}" gradientUnits="userSpaceOnUse" cx="0" cy="-27" r="22"><stop offset="0" stop-color="#ffe9a0" stop-opacity="0.55"/><stop offset="1" stop-color="#ffe9a0" stop-opacity="0"/></radialGradient>`);
      out.push(`<circle cx="0" cy="-27" r="22" fill="url(#${glow})"/>`);
      out.push(`<path d="M-26,30L0,-11L2,30Z" fill="#5b4c9a"/>`);
      out.push(`<path d="M0,-11L26,30L2,30Z" fill="#2d2462"/>`);
      out.push(`<path d="M0,-11L-6.6,0.6L-3.2,-1.2L-0.4,1.8L2.6,-1.6L6.4,0.2Z" fill="#ffffff"/>`);
      out.push(`<path d="M0,-11L6.4,0.2L2.6,-1.6Z" fill="#cfc8ee"/>`);
      out.push(`<path d="M-30,19C-16,14 -4,17 6,15C16,13 24,15 30,17V30H-30Z" fill="#1b1645"/>`);
      break;
    }
  }
  return out.join('');
}

/**
 * The tier's scene, clipped to a round window of radius `r` at cx,cy, with the
 * window's inner shadow and ink edge. Used by the emblem and by the ranked
 * family's tier badges, so both show the same place.
 */
export function rankWindow(dr: Drawing, tier: RankTier, cx: number, cy: number, r: number): string {
  const s = r / W;
  const clip = dr.id('w');
  dr.def(`<clipPath id="${clip}"><circle cx="0" cy="0" r="${W}"/></clipPath>`);
  const shade = dr.id('i');
  dr.def(
    `<radialGradient id="${shade}" gradientUnits="userSpaceOnUse" cx="0" cy="-4" r="${W + 4}"><stop offset="0.72" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.38"/></radialGradient>`,
  );
  return (
    `<g transform="translate(${n(cx)} ${n(cy)}) scale(${n2(s)})"><g clip-path="url(#${clip})">${scene(dr, tier)}` +
    `<circle cx="0" cy="0" r="${W}" fill="url(#${shade})"/></g>` +
    `<circle cx="0" cy="0" r="${W}" fill="none" stroke="${INK}" stroke-width="${n2(1.6 / s)}"/></g>`
  );
}

/** The part of a summit that stands above the window, drawn over the frame. */
function summitBreakout(tier: RankTier, cx: number, cy: number, r: number): string {
  const apex = APEX[tier];
  if (apex === undefined) return '';
  const s = r / W;
  // where the peak's two faces cross the window's top edge, a little inside it
  const cut = -W + 3;
  const t = (cut - apex) / (30 - apex);
  const xl = -21 * t;
  const xr = 21 * t;
  const P = (x: number, y: number): string => `${n(cx + x * s)},${n(cy + y * s)}`;
  const snowL = -8.2 * ((cut - apex) / (-10.8 - apex));
  const snowR = 7.4 * ((cut - apex) / (-11.2 - apex));
  return (
    inked(`M${P(xl, cut)}L${P(0, apex)} ${P(xr, cut)}Z`, '#ffffff', OUTLINE) +
    `<path d="M${P(0, apex)}L${P(snowR, cut)} ${P(1, cut)}Z" fill="#dccdf2"/>` +
    `<path d="M${P(snowL + 1, cut)}L${P(0, apex + 1)}" stroke="#ffffff" stroke-width="0.8"/>`
  );
}

/** A feather: a leaf-shaped blade from `x,y` in direction `deg`. */
function feather(x: number, y: number, deg: number, len: number, w: number): string {
  const a = (deg * Math.PI) / 180;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const px = -uy;
  const py = ux;
  const tx = x + ux * len;
  const ty = y + uy * len;
  const P = (px1: number, py1: number): string => `${n(px1)},${n(py1)}`;
  const bl = [x + px * (w / 2), y + py * (w / 2)] as const;
  const br = [x - px * (w / 2), y - py * (w / 2)] as const;
  return (
    `M${P(bl[0], bl[1])}C${P(bl[0] + ux * len * 0.5 + px * w * 0.25, bl[1] + uy * len * 0.5 + py * w * 0.25)} ` +
    `${P(tx - ux * len * 0.22 + px * w * 0.22, ty - uy * len * 0.22 + py * w * 0.22)} ${P(tx, ty)}` +
    `C${P(tx - ux * len * 0.22 - px * w * 0.22, ty - uy * len * 0.22 - py * w * 0.22)} ` +
    `${P(br[0] + ux * len * 0.5 - px * w * 0.25, br[1] + uy * len * 0.5 - py * w * 0.25)} ${P(br[0], br[1])}Z`
  );
}

/** A feather's spine, for a little engraving down its middle. */
function spine(x: number, y: number, deg: number, len: number): string {
  const a = (deg * Math.PI) / 180;
  return `M${n(x + Math.cos(a) * len * 0.3)},${n(y + Math.sin(a) * len * 0.3)}L${n(x + Math.cos(a) * len * 0.82)},${n(y + Math.sin(a) * len * 0.82)}`;
}

interface Grandeur {
  /** feathers per wing */
  wings: number;
  /** a woven chain of diamonds round the ring */
  chain: boolean;
  /** a gem at the top of the ring */
  gem: boolean;
  /** a peak-shaped spike over the ring */
  spike: boolean;
  /** a sunburst behind */
  rays: boolean;
}

const GRANDEUR: Record<RankTier, Grandeur> = {
  dest: { wings: 0, chain: false, gem: false, spike: false, rays: false },
  gir: { wings: 0, chain: false, gem: true, spike: false, rays: false },
  zozan: { wings: 2, chain: true, gem: true, spike: false, rays: false },
  ciya: { wings: 3, chain: true, gem: false, spike: true, rays: false },
  lutke: { wings: 4, chain: true, gem: false, spike: false, rays: false },
  sterk: { wings: 5, chain: true, gem: false, spike: false, rays: true },
};

/** A four-point star with long rays: Stêrk's star. */
function bigStar(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 8; i++) {
    const a = ((i * 45 - 90) * Math.PI) / 180;
    const rr = i % 2 === 0 ? (i % 4 === 0 ? r : r * 0.78) : r * 0.24;
    pts.push(`${n(cx + Math.cos(a) * rr)},${n(cy + Math.sin(a) * rr)}`);
  }
  return `M${pts.join('L')}Z`;
}

/** Under this many pixels an emblem is drawn in its small version: closer in, no plaque, no rays. */
export const SMALL_EMBLEM = 56;

export interface RankEmblemOptions {
  tier: RankTier;
  /** 3 = III (lowest) … 1 = I; leave out for the tier alone (and always for Stêrk) */
  division?: RankDivision;
  /** pixels; default 128 */
  size?: number;
  /** the accessible label; defaults to "Çiya II (Mountain)" */
  title?: string;
  idPrefix?: string;
}

/** The emblem's frame and window, without a plaque — shared with the season emblem. */
function emblemBody(dr: Drawing, tier: RankTier, cx: number, cy: number, compact = false): string {
  const m: Metal = RANK_METAL[tier];
  const g = GRANDEUR[tier];
  const R = 33;
  const r = 26;
  const out: string[] = [];

  out.push(dropShadow(circ(cx, cy, R + 1), 3, 0.24));

  if (g.rays && !compact) {
    const rays: string[] = [];
    for (let i = 0; i <= 10; i++) {
      const a = ((-165 + i * 15) * Math.PI) / 180;
      const long = i % 2 === 1;
      const len = long ? 53 : 45;
      const half = long ? 0.1 : 0.08;
      rays.push(
        `M${n(cx + Math.cos(a - half) * 30)},${n(cy + Math.sin(a - half) * 30)}L${n(cx + Math.cos(a) * len)},${n(cy + Math.sin(a) * len)}L${n(cx + Math.cos(a + half) * 30)},${n(cy + Math.sin(a + half) * 30)}Z`,
      );
    }
    const glow = dr.id('r');
    dr.def(
      `<radialGradient id="${glow}" gradientUnits="userSpaceOnUse" cx="${n(cx)}" cy="${n(cy)}" r="56"><stop offset="0.5" stop-color="${m.light}"/><stop offset="1" stop-color="${m.mid}" stop-opacity="0.15"/></radialGradient>`,
    );
    out.push(`<path d="${rays.join('')}" fill="url(#${glow})" stroke="${INK}" stroke-width="1" stroke-opacity="0.5" stroke-linejoin="round"/>`);
  }

  // wings: a fan of feathers from a root low on each side, the upper ones
  // drawn first so the lower ones lie over them
  if (g.wings > 0) {
    const fill = metalBox(dr, m);
    const dark = dr.id('d');
    dr.def(linearAt(dark, [[0, m.light], [1, m.dark]], 0, cy - 40, 0, cy + 20));
    const parts: string[] = [];
    const k = g.wings;
    for (let i = k - 1; i >= 0; i--) {
      const deg = 184 + i * (72 / k);
      const len = compact ? 17 + k * 0.6 - i * 0.8 : 33 + k * 1.6 - i * 1.2;
      const w = 9.5 - i * 0.4;
      const lines: string[] = [];
      for (const side of [1, -1]) {
        const rootDeg = side === 1 ? 158 : 22;
        const x = cx + Math.cos((rootDeg * Math.PI) / 180) * (R - 9);
        const y = cy + Math.sin((rootDeg * Math.PI) / 180) * (R - 9);
        const d = side === 1 ? deg : 180 - deg;
        parts.push(inked(feather(x, y, d, len, w), i % 2 === 0 ? `url(#${fill})` : `url(#${dark})`, OUTLINE));
        lines.push(spine(x, y, d, len));
      }
      parts.push(`<path d="${lines.join('')}" stroke="${m.dark}" stroke-width="0.9" stroke-opacity="0.7" stroke-linecap="round" fill="none"/>`);
    }
    out.push(parts.join(''));
  }

  if (g.spike) out.push(inked(feather(cx, cy - R + 6, -90, compact ? 15 : 22, 13), `url(#${metalBox(dr, m)})`, OUTLINE));

  // the ring
  const rim = metalAcross(dr, m, cx - R, cy - R, cx + R, cy + R);
  out.push(inked(ring(cx, cy, R, r), `url(#${rim})`, OUTLINE, ' fill-rule="evenodd"'));
  out.push(bevel(dr, circ(cx, cy, R - 1.2), cy - R, cy + R * 0.3, 1.3, 0.8));
  if (g.chain) {
    // diamonds tip to tip round the ring, every other one dotted with madder
    out.push(`<path d="${ring(cx, cy, R - 2.2, r + 1.4)}" fill="${m.dark}" fill-rule="evenodd"/>`);
    const mid = (R + r) / 2 - 0.4;
    const count = Math.round((2 * Math.PI * mid) / 5.4);
    const ds: string[] = [];
    const dots: string[] = [];
    for (let i = 0; i < count; i++) {
      const deg = (360 / count) * i - 90;
      const a = (deg * Math.PI) / 180;
      const x = cx + Math.cos(a) * mid;
      const y = cy + Math.sin(a) * mid;
      ds.push(diamondAt(x, y, (2 * Math.PI * mid) / count, R - r - 3.4, deg + 90));
      if (i % 2 === 0) dots.push(diamondAt(x, y, 1.5, 1.5, deg + 90));
    }
    out.push(`<path d="${ds.join('')}" fill="${m.hi}"/>`);
    out.push(`<path d="${dots.join('')}" fill="#c2263f"/>`);
  }
  out.push(rankWindow(dr, tier, cx, cy, r));

  if (g.gem) {
    out.push(inked(diamondAt(cx, cy - R + 0.5, 9, 11), `url(#${metalBox(dr, m)})`, OUTLINE));
    out.push(`<path d="${diamondAt(cx, cy - R + 0.5, 3.4, 4.2)}" fill="#c2263f"/>`);
  }
  out.push(summitBreakout(tier, cx, cy, r));
  if (tier === 'sterk') {
    const gold = dr.id('k');
    dr.def(linearAt(gold, [[0, '#fffbe6'], [0.5, m.light], [1, m.mid]], 0, cy - 52, 0, cy - 24));
    const sy = compact ? cy - 35 : cy - 37;
    out.push(inked(bigStar(cx, sy, compact ? 11.5 : 15), `url(#${gold})`, OUTLINE));
    out.push(`<path d="${bigStar(cx, sy, compact ? 4 : 5)}" fill="#ffffff"/>`);
  }
  return out.join('');
}

function plaque(dr: Drawing, m: Metal, count: number, cx: number, cy: number): string {
  const w = 40;
  const h = 15;
  const d =
    `M${n(cx - w / 2 - 5)},${n(cy)}L${n(cx - w / 2)},${n(cy - h / 2)}H${n(cx + w / 2)}L${n(cx + w / 2 + 5)},${n(cy)}` +
    `L${n(cx + w / 2)},${n(cy + h / 2)}H${n(cx - w / 2)}Z`;
  const ground = dr.id('p');
  dr.def(linearAt(ground, [[0, m.dark], [1, m.deep]], 0, cy - h / 2, 0, cy + h / 2));
  return (
    inked(d, `url(#${ground})`, OUTLINE) +
    `<path d="${d}" fill="none" stroke="${m.light}" stroke-width="0.9" stroke-opacity="0.7" transform="translate(${n(cx)} ${n(cy)}) scale(0.86) translate(${n(-cx)} ${n(-cy)})"/>` +
    inked(numeral(count, cx, cy, 8.6), `url(#${metalBox(dr, m)})`, 1.2)
  );
}

const ROMAN: Record<RankDivision, string> = { 3: 'III', 2: 'II', 1: 'I' };

/** A rank tier's emblem, with its division if given. */
export function rankEmblemSvg(opts: RankEmblemOptions): string {
  const { tier, division } = opts;
  if (!RANK_TIERS.includes(tier)) throw new RangeError(`art: unknown rank tier ${String(tier)}`);
  if (division !== undefined && ![1, 2, 3].includes(division)) throw new RangeError(`art: division must be 1, 2 or 3, got ${String(division)}`);
  const size = checkSize(opts.size, 128);
  const small = size < SMALL_EMBLEM;
  const shown = tier === 'sterk' ? undefined : division;
  const dr = new Drawing(prefixFor(opts.idPrefix, 'rank', tier, shown, small));
  const nm = RANK_TIER_NAMES[tier];
  if (small) {
    // the window and its frame, closer in; the division is in the title and beside it in the app
    const cy = tier === 'sterk' ? 65 : tier === 'lutke' || tier === 'ciya' ? 63 : 60;
    dr.add(`<g transform="translate(60 60) scale(1.38) translate(-60 ${-cy})">${emblemBody(dr, tier, 60, cy, true)}</g>`);
  } else {
    const cy = shown === undefined ? 58 : 52;
    dr.add(emblemBody(dr, tier, 60, tier === 'sterk' ? 64 : cy));
    if (shown !== undefined) dr.add(plaque(dr, RANK_METAL[tier], shown, 60, 96));
  }
  const title = opts.title ?? `${nm.ku}${shown === undefined ? '' : ` ${ROMAN[shown]}`} (${nm.en})`;
  return dr.svg(size, title);
}
