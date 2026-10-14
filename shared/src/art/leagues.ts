/**
 * Learning-league emblems (contract 4, L1/B3): six water tiers, each a drop-
 * shaped frame around its water — a single drop falling, a spring rising
 * between stones, a river winding to the viewer, a lake under a mountain, the
 * sea at sunrise, and the ocean's great wave.
 *
 * Every league emblem is a drop, so a league reads as a league before its
 * picture does — the way every rank emblem is a round window. The frame grows
 * with the water: a plain rim, a bead at the tip, a beaded line and small wave
 * crests, a woven chain, gold, and for Okyanûs a turquoise rim set in gold
 * with wave wings and a pearl.
 */
import { cubic, offset, stations } from './geometry.js';
import { circ, drop } from './icons.js';
import type { LeagueTier } from './keys.js';
import { LEAGUE_TIER_NAMES, LEAGUE_TIERS } from './keys.js';
import type { Metal } from './palette.js';
import { GOLD, INK, LEAGUE_METAL, LEAGUE_WATER } from './palette.js';
import { OUTLINE, bevel, diamondAt, dropShadow, inked, metalAcross, metalBox } from './paint.js';
import type { Pt } from './svg.js';
import { Drawing, checkSize, linearAt, n, n2, polyPath, prefixFor, seeded } from './svg.js';

/** The drop: a point at the top, a round body below. */
function dropOutline(): Pt[] {
  const top: Pt = [60, 7];
  const out: Pt[] = [top];
  out.push(...cubic(top, [67, 22], [97, 40], [97, 66], 18));
  out.push(...cubic([97, 66], [97, 86.5], [80.5, 103], [60, 103], 14));
  out.push(...cubic([60, 103], [39.5, 103], [23, 86.5], [23, 66], 14));
  out.push(...cubic([23, 66], [23, 40], [53, 22], top, 18).slice(0, -1));
  return out;
}

const OUTLINE_PTS = dropOutline();

interface Grandeur {
  rim: number;
  /** a bead at the tip */
  bead: boolean;
  /** a beaded line in the rim */
  beads: boolean;
  /** a woven chain in the rim */
  chain: boolean;
  /** wave crests per side */
  crests: number;
  /** set in gold like Firûze */
  setting: boolean;
}

const GRANDEUR: Record<LeagueTier, Grandeur> = {
  dilop: { rim: 6, bead: false, beads: false, chain: false, crests: 0, setting: false },
  kani: { rim: 6.5, bead: true, beads: false, chain: false, crests: 0, setting: false },
  cem: { rim: 7.5, bead: true, beads: true, chain: false, crests: 1, setting: false },
  gol: { rim: 9.5, bead: true, beads: false, chain: true, crests: 2, setting: false },
  derya: { rim: 9.5, bead: true, beads: false, chain: true, crests: 3, setting: false },
  okyanus: { rim: 10, bead: true, beads: false, chain: true, crests: 3, setting: true },
};

const vertical = (dr: Drawing, stops: readonly (readonly [number, string, number?])[], y1: number, y2: number): string => {
  const id = dr.id('g');
  dr.def(linearAt(id, stops, 0, y1, 0, y2));
  return `url(#${id})`;
};

/** A wavy band across the scene at `y`, from x0 to x1, filled down to `bottom`. */
function waveBand(y: number, amp: number, len: number, bottom: number, phase = 0): string {
  let d = `M10,${n(bottom)}L10,${n(y)}`;
  for (let x = 10; x < 110; x += len) {
    const p = phase * len;
    d += `C${n(x + len * 0.25 + p)},${n(y - amp)} ${n(x + len * 0.25 + p)},${n(y - amp)} ${n(x + len * 0.5)},${n(y)}`;
    d += `C${n(x + len * 0.75 - p)},${n(y + amp)} ${n(x + len * 0.75 - p)},${n(y + amp)} ${n(x + len)},${n(y)}`;
  }
  return `${d}L110,${n(bottom)}Z`;
}

/** The water inside the drop, in canvas units; the caller clips it. */
function scene(dr: Drawing, tier: LeagueTier): string {
  const [surface, depth] = LEAGUE_WATER[tier];
  const out: string[] = [];
  switch (tier) {
    case 'dilop': {
      out.push(`<rect x="0" y="0" width="120" height="120" fill="${vertical(dr, [[0, '#eaf7ff'], [1, '#9fd2ee']], 10, 100)}"/>`);
      out.push(`<ellipse cx="60" cy="88" rx="26" ry="6.5" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-opacity="0.8"/>`);
      out.push(`<ellipse cx="60" cy="88" rx="14" ry="3.6" fill="none" stroke="#ffffff" stroke-width="1.6"/>`);
      out.push(inked(drop(60, 58, 2.2), vertical(dr, [[0, surface], [1, depth]], 36, 80), 2));
      out.push(`<path d="M53.5,60C53.5,55 56,51.5 58.5,48.5C57.5,52 56.5,55.5 56.5,60Z" fill="#ffffff" fill-opacity="0.8"/>`);
      break;
    }
    case 'kani': {
      out.push(`<rect x="0" y="0" width="120" height="120" fill="${vertical(dr, [[0, '#e3fbf2'], [1, '#b5ecd9']], 10, 70)}"/>`);
      out.push(`<path d="M20,74C34,70 46,72 60,71C74,70 86,70 100,73V120H20Z" fill="${vertical(dr, [[0, surface], [1, depth]], 70, 104)}"/>`);
      // the spring welling up: a swell of water, rings spreading from it, drops thrown up
      out.push(`<ellipse cx="60" cy="80" rx="27" ry="6.5" fill="none" stroke="#ffffff" stroke-width="1.3" stroke-opacity="0.55"/>`);
      out.push(`<ellipse cx="60" cy="79" rx="17" ry="4.2" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-opacity="0.8"/>`);
      out.push(`<path d="M50,78C51,71 55,67 60,67C65,67 69,71 70,78C66,80 54,80 50,78Z" fill="#ffffff" fill-opacity="0.9"/>`);
      out.push(inked(drop(60, 52, 0.75), '#ffffff', 1.4));
      out.push(inked(drop(50.5, 60, 0.5), '#ffffff', 1.2));
      out.push(inked(drop(69.5, 60, 0.5), '#ffffff', 1.2));
      // stones at the water's edge
      out.push(inked('M22,96C21,87 27,82 34,83C41,84 45,90 44,97Z', '#8d9a95', 1.6));
      out.push(`<path d="M27,88C29,86 32,85.5 34.5,86" stroke="#ffffff" stroke-width="1.2" stroke-opacity="0.6" stroke-linecap="round" fill="none"/>`);
      out.push(inked('M77,97C76,89 81,85 88,86C94,87 98,92 97,98Z', '#a5b1ac', 1.6));
      out.push(inked('M43,101C43,96 47,94 51,94.5C55,95 57,98 56,102Z', '#76837e', 1.6));
      break;
    }
    case 'cem': {
      out.push(`<rect x="0" y="0" width="120" height="120" fill="${vertical(dr, [[0, '#cfeaff'], [1, '#f4fbff']], 10, 50)}"/>`);
      out.push(`<path d="M20,48C34,40 48,44 60,42C74,40 88,38 100,46V110H20Z" fill="#7cb86a"/>`);
      out.push(`<path d="M20,60C36,54 52,58 66,56C82,54 92,56 100,60V110H20Z" fill="#5a9e4e"/>`);
      // the river, narrow in the distance and wide at the viewer
      out.push(
        `<path d="M62,44C58,48 54,52 57,56C61,61 72,63 70,70C68,78 48,80 44,90C42,96 44,102 46,108H80C78,100 76,94 80,88C86,80 92,72 84,64C78,58 66,58 66,52C66,48 64,46 62,44Z" fill="${vertical(dr, [[0, surface], [1, depth]], 44, 108)}"/>`,
      );
      out.push(`<path d="M64,62C68,64 70,66 69,69M54,86C58,82 64,80 70,79M60,98C64,95 70,94 74,94" stroke="#ffffff" stroke-width="1.3" stroke-linecap="round" fill="none" stroke-opacity="0.85"/>`);
      break;
    }
    case 'gol': {
      out.push(`<rect x="0" y="0" width="120" height="120" fill="${vertical(dr, [[0, '#8fd0f0'], [1, '#e2f6ff']], 10, 62)}"/>`);
      out.push(`<path d="M20,64L40,40L50,50L62,32L78,52L86,44L100,64Z" fill="#6d8fb0"/>`);
      out.push(`<path d="M62,32L56.5,39.5L59.8,38.3L62.4,41L65.2,38.2L67.6,39Z" fill="#ffffff"/>`);
      out.push(`<rect x="0" y="63" width="120" height="60" fill="${vertical(dr, [[0, surface], [1, depth]], 63, 104)}"/>`);
      // the mountain again, upside down in the still water
      out.push(`<path d="M20,64L40,86L50,76L62,94L78,74L86,82L100,64Z" fill="#4f7f9c" fill-opacity="0.55"/>`);
      out.push(`<path d="M30,72H48M66,78H84M44,90H58" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" stroke-opacity="0.7"/>`);
      // reeds
      out.push(`<path d="M30,100C30,90 29,84 27,78M34,100C34,92 35,86 37,80M86,100C86,92 85,86 83,81" stroke="#2f5d3a" stroke-width="1.6" stroke-linecap="round" fill="none"/>`);
      out.push(`<path d="M26.4,79.5C26,76 27,73.5 28.4,72.6C29,75 28.6,77.5 27.8,79.6Z M36.6,81.6C36.6,78.4 37.8,76 39.2,75.6C39.4,78 38.8,80.2 37.8,81.8Z" fill="#7a4a26"/>`);
      break;
    }
    case 'derya': {
      out.push(`<rect x="0" y="0" width="120" height="120" fill="${vertical(dr, [[0, '#ffb36b'], [0.6, '#ffe2a8']], 10, 60)}"/>`);
      out.push(`<circle cx="60" cy="58" r="13" fill="#fff1c4"/>`);
      out.push(`<path d="${waveBand(58, 1.2, 12, 120)}" fill="${vertical(dr, [[0, surface], [1, depth]], 58, 104)}"/>`);
      out.push(`<path d="M50,62H70M46,66H74M52,70H68" stroke="#fff1c4" stroke-width="1.3" stroke-linecap="round" stroke-opacity="0.85"/>`);
      out.push(`<path d="${waveBand(78, 3, 18, 120, 0.2)}" fill="#2b5fae"/>`);
      out.push(`<path d="${waveBand(90, 3.5, 22, 120, 0.25)}" fill="#1c3f86"/>`);
      out.push(`<path d="M24,79C28,75 32,75 35,78M60,79C64,75 68,75 71,78M84,91C88,87 93,87 96,90M42,91C46,87 50,87 53,90" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round" fill="none" stroke-opacity="0.9"/>`);
      // a gull
      out.push(`<path d="M76,36C78,34 80,34 82,36C84,34 86,34 88,36" stroke="${INK}" stroke-width="1.3" stroke-linecap="round" fill="none"/>`);
      break;
    }
    case 'okyanus': {
      out.push(`<rect x="0" y="0" width="120" height="120" fill="${vertical(dr, [[0, '#13184f'], [1, '#3a62b0']], 10, 70)}"/>`);
      const rnd = seeded('okyanus-night');
      const stars: string[] = [];
      for (let i = 0; i < 14; i++) stars.push(`<circle cx="${n(30 + rnd() * 60)}" cy="${n(20 + rnd() * 30)}" r="${n2(0.4 + rnd() * 0.6)}" fill="#ffffff" fill-opacity="${n2(0.5 + rnd() * 0.5)}"/>`);
      out.push(stars.join(''));
      out.push(`<circle cx="76" cy="40" r="6" fill="#fff4cf"/>`);
      out.push(`<path d="${waveBand(86, 2.5, 16, 120)}" fill="${depth}"/>`);
      // the great wave: a body of water rising and curling over to the left
      out.push(
        `<path d="M14,100C24,94 34,88 40,78C46,68 48,56 58,48C68,40 82,42 86,52C90,62 82,70 74,68C68,66 66,58 72,56C66,54 60,60 62,68C64,78 76,84 92,86C98,87 104,90 108,96V110H14Z" fill="${vertical(dr, [[0, surface], [1, depth]], 44, 104)}" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>`,
      );
      out.push(`<path d="M58,48C68,40 82,42 86,52C88,57 86,62 82,65C84,58 80,50 72,50C66,50 62,52 58,48Z" fill="#ffffff"/>`);
      out.push(`<path d="M48,64C52,74 60,82 74,88M40,80C46,88 56,94 70,98" stroke="#bff6ff" stroke-width="1.4" stroke-linecap="round" fill="none" stroke-opacity="0.8"/>`);
      out.push(`<circle cx="88" cy="47" r="1.6" fill="#ffffff"/><circle cx="92" cy="52" r="1.2" fill="#ffffff"/><circle cx="90" cy="42" r="1" fill="#ffffff"/>`);
      break;
    }
  }
  return out.join('');
}

/** A wave's curl: a line out from the drop's side that rolls over into a spiral, `side` 1 = right. */
function curl(x: number, y: number, side: 1 | -1, k: number): string {
  const P = (dx: number, dy: number): string => `${n(x + dx * side * k)},${n(y + dy * k)}`;
  return `M${P(0, 0)}C${P(8, 1)} ${P(16, -2)} ${P(19, -9)}C${P(21, -14)} ${P(17, -18)} ${P(13, -17)}C${P(9.5, -16)} ${P(9.5, -11.5)} ${P(13, -11)}`;
}

export interface LeagueEmblemOptions {
  tier: LeagueTier;
  /** pixels; default 128 */
  size?: number;
  /** the accessible label; defaults to "Çem (River)" */
  title?: string;
  idPrefix?: string;
}

/** Under this many pixels an emblem is drawn in its small version: no crests, closer in. */
export const SMALL_LEAGUE = 56;

/** A learning league's emblem as an SVG string. */
export function leagueEmblemSvg(opts: LeagueEmblemOptions): string {
  const { tier } = opts;
  if (!LEAGUE_TIERS.includes(tier)) throw new RangeError(`art: unknown league tier ${String(tier)}`);
  const size = checkSize(opts.size, 128);
  const small = size < SMALL_LEAGUE;
  const dr = new Drawing(prefixFor(opts.idPrefix, 'league', tier, small));
  const g = GRANDEUR[tier];
  const m: Metal = LEAGUE_METAL[tier];
  const outline = OUTLINE_PTS;
  const parts: string[] = [];

  parts.push(dropShadow(polyPath(offset(outline, 1.2)), 2.8, 0.26));

  if (g.crests > 0 && !small) {
    // wave curls rising off each side, the lowest in front
    for (let i = g.crests - 1; i >= 0; i--) {
      for (const side of [1, -1] as const) {
        const d = curl(60 + side * 33, 86 - i * 12, side, 0.92 - i * 0.12 + g.crests * 0.06);
        parts.push(`<path d="${d}" fill="none" stroke="${INK}" stroke-width="${n2(4.6 + OUTLINE * 2)}" stroke-linecap="round" stroke-linejoin="round"/>`);
        parts.push(`<path d="${d}" fill="none" stroke="${i % 2 === 0 ? m.light : m.mid}" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/>`);
        parts.push(`<path d="${d}" fill="none" stroke="${m.hi}" stroke-width="1.2" stroke-linecap="round" stroke-opacity="0.8" transform="translate(0 -1)"/>`);
      }
    }
  }

  if (g.setting) {
    const gold = `url(#${metalAcross(dr, GOLD, 20, 4, 100, 110)})`;
    const prongs = stations(offset(outline, 3.4), 8).map((s) => diamondAt(s.p[0], s.p[1], 10, 13, s.angle));
    parts.push(inked(prongs.join(''), gold, 1.8) + inked(polyPath(offset(outline, 3.4)), gold, 1.8));
  }

  const rimFill = metalAcross(dr, m, 24, 8, 96, 104);
  parts.push(inked(polyPath(offset(outline, 0.2)), `url(#${rimFill})`, small ? 3.2 : OUTLINE));
  parts.push(bevel(dr, polyPath(offset(outline, -1.1)), 8, 70, 1.2, 0.8));

  const rim = small ? 8 : g.rim;
  if (!small && (g.chain || g.beads)) {
    const mid = offset(outline, -rim / 2);
    if (g.chain) {
      parts.push(`<path d="${polyPath(offset(outline, -2))}${polyPath(offset(outline, -(rim - 1.6)))}" fill="${m.dark}" fill-rule="evenodd"/>`);
      const st = stations(mid, 44);
      parts.push(`<path d="${st.map((s) => diamondAt(s.p[0], s.p[1], 6.4, rim - 4.4, s.angle)).join('')}" fill="${m.hi}"/>`);
      parts.push(`<path d="${st.filter((_, i) => i % 2 === 0).map((s) => diamondAt(s.p[0], s.p[1], 1.6, 1.6, s.angle)).join('')}" fill="#c2263f"/>`);
    } else {
      const st = stations(mid, 40);
      parts.push(`<path d="${st.map((s) => circ(s.p[0], s.p[1], 1.05)).join('')}" fill="${m.hi}" stroke="${m.dark}" stroke-width="0.5"/>`);
    }
  }

  // the water, behind a thin ink line
  const edge = offset(outline, -rim);
  const field = offset(outline, -rim - 1.1);
  const fieldPath = polyPath(field);
  parts.push(`<path d="${polyPath(edge)}" fill="${INK}"/>`);
  const clip = dr.clip(fieldPath);
  const shade = dr.id('h');
  dr.def(linearAt(shade, [[0, '#000000', 0.35], [0.3, '#000000', 0]], 0, 10, 0, 104));
  parts.push(`<g clip-path="url(#${clip})">${scene(dr, tier)}<path d="${fieldPath}" fill="none" stroke="url(#${shade})" stroke-width="6"/></g>`);

  if (g.bead) {
    const tipY = 7 - (small ? 1 : 2);
    parts.push(inked(circ(60, tipY, small ? 6 : 4.6), `url(#${metalBox(dr, tier === 'okyanus' ? { hi: '#ffffff', light: '#f4f1ff', mid: '#d9d2f2', dark: '#a79fcc', deep: '#4c4570' } : m)})`, small ? 2.4 : 1.8));
  }

  const nm = LEAGUE_TIER_NAMES[tier];
  const body = small ? `<g transform="translate(60 60) scale(1.12) translate(-60 -57)">${parts.join('')}</g>` : parts.join('');
  dr.add(body);
  return dr.svg(size, opts.title ?? `${nm.ku} (${nm.en})`);
}
