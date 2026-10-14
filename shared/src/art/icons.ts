/**
 * The badge icons: one bold, simple picture per badge, in a 40-unit box
 * centred on 0,0.
 *
 * An icon is a list of parts, and a part says what it is rather than what
 * colour it is: the main metal, its shaded face, a named accent (a flame is a
 * flame on every tier), snow, a cut line, a stroked line, a highlight. The
 * badge decides the colours (iconpaint.ts), so the same icon is copper on a
 * Sifir badge, turquoise on a Firûze one and grey on one not yet earned — and
 * every icon gets the same cut between its parts and the same light from
 * within, which is what makes forty-four drawings read as one set.
 *
 * Parts marked `fine` are the details that turn to noise at 32 pixels (the
 * lines on a book's pages, a feather's barbs); the small drawing leaves them
 * out.
 */
import type { AccentName } from './palette.js';
import { n } from './svg.js';

export type Part =
  /** f: the metal, lit from above · a: its shaded face · w: snow-white */
  | { k: 'f' | 'a' | 'w'; d: string; tf?: string }
  /** an accent colour */
  | { k: 'c'; d: string; c: AccentName; tf?: string }
  /** a hole: the field's colour showing through */
  | { k: 'k'; d: string; tf?: string; fine?: boolean }
  /** a line cut into what is beneath, in the field's colour */
  | { k: 'd'; d: string; w?: number; tf?: string; fine?: boolean }
  /** a stroked line, cut out of what is beneath: metal, or an accent */
  | { k: 'l'; d: string; w?: number; c?: AccentName; tf?: string }
  /** a white highlight, no outline */
  | { k: 'h'; d: string; o?: number; tf?: string; fine?: boolean };

// ─────────────────────────────────────────────────────────────── helpers

const rad = (deg: number): number => (deg * Math.PI) / 180;

/** A circle as a path (two half arcs; every renderer draws that the same). */
export const circ = (cx: number, cy: number, r: number): string =>
  `M${n(cx - r)},${n(cy)}A${n(r)},${n(r)} 0 1 0 ${n(cx + r)},${n(cy)}A${n(r)},${n(r)} 0 1 0 ${n(cx - r)},${n(cy)}Z`;

const polygon = (pts: readonly (readonly [number, number])[]): string => `M${pts.map(([x, y]) => `${n(x)},${n(y)}`).join('L')}Z`;

/** An arc from `a0` to `a1` degrees (0 = right, clockwise on screen). */
function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const p0 = [cx + Math.cos(rad(a0)) * r, cy + Math.sin(rad(a0)) * r];
  const p1 = [cx + Math.cos(rad(a1)) * r, cy + Math.sin(rad(a1)) * r];
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sweep = a1 > a0 ? 1 : 0;
  return `M${n(p0[0] ?? 0)},${n(p0[1] ?? 0)}A${n(r)},${n(r)} 0 ${large} ${sweep} ${n(p1[0] ?? 0)},${n(p1[1] ?? 0)}`;
}

/** A triangular arrowhead at angle `a` on a circle, pointing clockwise. */
function arrowOnCircle(cx: number, cy: number, r: number, a: number, size: number): string {
  const px = cx + Math.cos(rad(a)) * r;
  const py = cy + Math.sin(rad(a)) * r;
  const tx = -Math.sin(rad(a));
  const ty = Math.cos(rad(a));
  const ox = Math.cos(rad(a));
  const oy = Math.sin(rad(a));
  return polygon([
    [px + tx * size * 1.1, py + ty * size * 1.1],
    [px + ox * size - tx * size * 0.2, py + oy * size - ty * size * 0.2],
    [px - ox * size - tx * size * 0.2, py - oy * size - ty * size * 0.2],
  ]);
}

/** A four-point sparkle. */
const sparkle = (cx: number, cy: number, r: number): string => {
  const s = r * 0.28;
  return polygon([
    [cx, cy - r],
    [cx + s, cy - s],
    [cx + r, cy],
    [cx + s, cy + s],
    [cx, cy + r],
    [cx - s, cy + s],
    [cx - r, cy],
    [cx - s, cy - s],
  ]);
};

/** A heart centred on cx,cy, `s` = 1 for one 38 units wide. */
function heart(cx: number, cy: number, s: number): string {
  const P = (x: number, y: number): string => `${n(cx + x * s)},${n(cy + y * s)}`;
  return (
    `M${P(0, 17)}C${P(-6, 12)} ${P(-19, 5)} ${P(-19, -5)}C${P(-19, -12)} ${P(-14, -16)} ${P(-9, -16)}` +
    `C${P(-5, -16)} ${P(-2, -13.5)} ${P(0, -10)}C${P(2, -13.5)} ${P(5, -16)} ${P(9, -16)}` +
    `C${P(14, -16)} ${P(19, -12)} ${P(19, -5)}C${P(19, 5)} ${P(6, 12)} ${P(0, 17)}Z`
  );
}

/** A flame, `s` = 1 for one 38 units tall. */
function flame(cx: number, cy: number, s: number): string {
  const P = (x: number, y: number): string => `${n(cx + x * s)},${n(cy + y * s)}`;
  return (
    `M${P(1, -20)}C${P(3, -13)} ${P(13, -8)} ${P(13, 3)}C${P(13, 12)} ${P(7, 18)} ${P(0, 18)}` +
    `C${P(-7, 18)} ${P(-13, 12)} ${P(-13, 3)}C${P(-13, -3)} ${P(-10, -6)} ${P(-8, -11)}` +
    `C${P(-5.5, -8)} ${P(-4.5, -5.5)} ${P(-4, -2)}C${P(-1.5, -7)} ${P(-2.5, -14)} ${P(1, -20)}Z`
  );
}
function flameCore(cx: number, cy: number, s: number): string {
  const P = (x: number, y: number): string => `${n(cx + x * s)},${n(cy + y * s)}`;
  return (
    `M${P(0.5, -4)}C${P(2.5, 0)} ${P(7, 3)} ${P(7, 9)}C${P(7, 13.5)} ${P(4, 16)} ${P(0, 16)}` +
    `C${P(-4, 16)} ${P(-7, 13.5)} ${P(-7, 9.5)}C${P(-7, 6)} ${P(-5, 4)} ${P(-3.5, 1)}` +
    `C${P(-2.5, 3)} ${P(-1.5, 4)} ${P(-1, 5.5)}C${P(0, 2)} ${P(-0.5, -1)} ${P(0.5, -4)}Z`
  );
}

const rrect = (x: number, y: number, w: number, h: number, r: number): string =>
  `M${n(x + r)},${n(y)}H${n(x + w - r)}Q${n(x + w)},${n(y)} ${n(x + w)},${n(y + r)}V${n(y + h - r)}Q${n(x + w)},${n(y + h)} ${n(x + w - r)},${n(y + h)}` +
  `H${n(x + r)}Q${n(x)},${n(y + h)} ${n(x)},${n(y + h - r)}V${n(y + r)}Q${n(x)},${n(y)} ${n(x + r)},${n(y)}Z`;

/** A drop, point up, `s` = 1 for one 20 units tall. */
export function drop(cx: number, cy: number, s: number): string {
  const P = (x: number, y: number): string => `${n(cx + x * s)},${n(cy + y * s)}`;
  return `M${P(0, -10)}C${P(3, -5)} ${P(7, -1)} ${P(7, 3)}C${P(7, 7.2)} ${P(3.8, 10)} ${P(0, 10)}C${P(-3.8, 10)} ${P(-7, 7.2)} ${P(-7, 3)}C${P(-7, -1)} ${P(-3, -5)} ${P(0, -10)}Z`;
}

// ───────────────────────────────────────────────────────────────── icons

function snowflake(): Part[] {
  const arms: string[] = [];
  for (let k = 0; k < 6; k++) {
    const a = rad(60 * k - 90);
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    arms.push(`M0,0L${n(ux * 18)},${n(uy * 18)}`);
    for (const side of [-1, 1]) {
      const b = a + side * rad(48);
      const bx = ux * 10.5;
      const by = uy * 10.5;
      arms.push(`M${n(bx)},${n(by)}L${n(bx + Math.cos(b) * 6.5)},${n(by + Math.sin(b) * 6.5)}`);
    }
  }
  return [
    { k: 'l', d: arms.join(''), w: 3.2 },
    { k: 'f', d: polygon([0, 1, 2, 3, 4, 5].map((i) => [Math.cos(rad(60 * i - 90)) * 4.6, Math.sin(rad(60 * i - 90)) * 4.6] as const)) },
  ];
}

function sun(): Part[] {
  const rays: (readonly [number, number])[] = [];
  for (let i = 0; i < 24; i++) {
    const a = rad(i * 15 - 90);
    const r = i % 2 === 0 ? (i % 4 === 0 ? 20 : 17) : 12.5;
    rays.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return [
    { k: 'a', d: polygon(rays) },
    { k: 'f', d: circ(0, 0, 10.5) },
    { k: 'h', d: 'M-6.5,-3.5C-6,-6 -4,-7.5 -1.5,-7.8C-3.5,-6.5 -4.8,-5 -5.3,-2.6Z', o: 0.6 },
  ];
}

function arrows(): Part[] {
  return [
    { k: 'l', d: arc(0, 0, 13.5, 196, 312), w: 4.4 },
    { k: 'l', d: arc(0, 0, 13.5, 16, 132), w: 4.4 },
    { k: 'f', d: arrowOnCircle(0, 0, 13.5, 318, 6.2) },
    { k: 'f', d: arrowOnCircle(0, 0, 13.5, 138, 6.2) },
    { k: 'a', d: circ(0, 0, 4.2) },
  ];
}

function arrow(): Part[] {
  // tail at bottom-left, head at top-right
  const u = [Math.SQRT1_2, -Math.SQRT1_2] as const;
  const nrm = [Math.SQRT1_2, Math.SQRT1_2] as const;
  const tail = [-13.5, 13.5] as const;
  const at = (s: number, o: number): readonly [number, number] => [tail[0] + u[0] * s + nrm[0] * o, tail[1] + u[1] * s + nrm[1] * o];
  const feather = (side: 1 | -1): string => polygon([at(1, 0), at(10, 0), at(6.5, 6 * side), at(-2.5, 6 * side)]);
  return [
    { k: 'c', d: feather(1), c: 'red' },
    { k: 'c', d: feather(-1), c: 'red' },
    { k: 'l', d: `M${n(tail[0] - 2)},${n(tail[1] + 2)}L11,-11`, w: 3.4 },
    { k: 'f', d: polygon([[18.5, -18.5], [5, -15.5], [15.5, -5]]) },
  ];
}

function mountainGlyph(snowcap: boolean, flag: boolean): Part[] {
  const parts: Part[] = [
    { k: 'a', d: 'M2,18L11,0L20,18Z' },
    { k: 'f', d: 'M-20,18L-3,-13L16,18Z' },
  ];
  if (snowcap) parts.push({ k: 'w', d: 'M-3,-13L-8.8,-2.4L-5.5,-4.2L-2.8,-1.4L0.2,-4.6L2.4,-3.1Z' });
  parts.push({ k: 'd', d: 'M-3,-13L-1,1L4,8', w: 1.4, fine: true });
  if (flag) {
    parts.push({ k: 'd', d: 'M-3,-13V-21.5', w: 1.8 });
    parts.push({ k: 'c', d: 'M-3,-21.5L7,-18.8L-3,-15.8Z', c: 'red' });
  }
  return parts;
}

export const ICONS: Record<string, () => Part[]> = {
  // ── learning
  ders: () => [
    { k: 'c', d: 'M8.5,6V19.5L11.2,16.8L14,19.5V6Z', c: 'red' },
    { k: 'a', d: 'M-21,-7L-21,14C-13,11 -6,12 0,16C6,12 13,11 21,14L21,-7Z' },
    { k: 'f', d: 'M-1,-9C-6,-13 -12,-14 -18,-12L-18,10C-12,8 -6,9 -1,12Z' },
    { k: 'f', d: 'M1,-9C6,-13 12,-14 18,-12L18,10C12,8 6,9 1,12Z' },
    { k: 'd', d: 'M-15,-6C-11,-8 -7,-8 -4,-6M-15,-1C-11,-3 -7,-3 -4,-1M-15,4C-11,2 -7,2 -4,4', w: 1.5, fine: true },
    { k: 'd', d: 'M15,-6C11,-8 7,-8 4,-6M15,-1C11,-3 7,-3 4,-1M15,4C11,2 7,2 4,4', w: 1.5, fine: true },
  ],
  'peyven-min': () => [
    { k: 'f', d: 'M-15,-16H15C18,-16 20,-14 20,-11V5C20,8 18,10 15,10H1L-9,18L-7.5,10H-15C-18,10 -20,8 -20,5V-11C-20,-14 -18,-16 -15,-16Z' },
    { k: 'd', d: 'M-13,-8.5H7M-13,-2.5H13M-13,3.5H2', w: 3 },
    { k: 'c', d: sparkle(14.5, 3.5, 4.5), c: 'gold' },
  ],
  bekemasi: () => [
    { k: 'a', d: 'M-18,-5H18L0,18Z' },
    { k: 'f', d: 'M-18,-5L-10,-15H10L18,-5Z' },
    { k: 'd', d: 'M-10,-15L-5,-5L0,18M10,-15L5,-5L0,18M0,-15L-5,-5M0,-15L5,-5M-18,-5H18', w: 1.3, fine: true },
    { k: 'h', d: 'M-13,-6.5L-8.5,-12.5L-6,-6.5Z', o: 0.7 },
    { k: 'w', d: sparkle(14.5, -15.5, 6) },
  ],
  dubare: arrows,
  cirokbej: () => [
    { k: 'f', d: 'M0,-21C9,-16 10,-3 4,9L0,11C-4,7 -7,-1 -7,-8C-7,-14 -4,-18 0,-21Z', tf: 'rotate(38)' },
    { k: 'd', d: 'M0,-15L5.5,-18M0,-8L7.5,-11M0,-1L6.5,-4M0,-11L-5.5,-14M0,-4L-6.5,-7', w: 1.2, tf: 'rotate(38)', fine: true },
    { k: 'd', d: 'M0,-21L0,16', w: 1.6, tf: 'rotate(38)' },
    { k: 'a', d: 'M-3,10.5H3L0,20.5Z', tf: 'rotate(38)' },
    { k: 'c', d: drop(-13, 13, 0.55), c: 'blue' },
  ],
  rewi: () => {
    const sole = 'M0,-10C4.5,-10 5.5,-5 4.6,0C4,3 -4,3 -4.6,0C-5.5,-5 -4.5,-10 0,-10Z';
    const heel = 'M0,5C3.6,5 3.8,10 0,10.5C-3.8,10 -3.6,5 0,5Z';
    return [
      { k: 'f', d: sole, tf: 'translate(-7.5 7) rotate(-14)' },
      { k: 'f', d: heel, tf: 'translate(-7.5 7) rotate(-14)' },
      { k: 'f', d: sole, tf: 'translate(7.5 -5) rotate(14)' },
      { k: 'f', d: heel, tf: 'translate(7.5 -5) rotate(14)' },
    ];
  },
  ferheng: () => [
    // a dictionary: a thick closed book, Ê on its cover, index tabs down its edge
    { k: 'c', d: 'M14,-13H18.5V-7.5H14Z', c: 'red' },
    { k: 'c', d: 'M14,-4H18.5V1.5H14Z', c: 'gold' },
    { k: 'c', d: 'M14,5H18.5V10.5H14Z', c: 'green' },
    { k: 'w', d: 'M-12,-17H13C14.5,-17 15.5,-16 15.5,-14.5V17.5C15.5,19 14.5,20 13,20H-12Z' },
    { k: 'd', d: 'M13,-13V16', w: 0.9, fine: true },
    { k: 'a', d: 'M-14,-20H11C12.5,-20 13.5,-19 13.5,-17.5V15C13.5,16.5 12.5,17.5 11,17.5H-14C-16.5,17.5 -18,16 -18,13.5V-16C-18,-18.5 -16.5,-20 -14,-20Z' },
    { k: 'd', d: 'M-13,-19.5V17', w: 1.4 },
    { k: 'f', d: 'M-8,-11H9V12H-8Z' },
    { k: 'd', d: 'M5,-2.5H-2.5V9.5H5M-2.5,3.5H3.5', w: 2.4 },
    { k: 'd', d: 'M-1.2,-5L0.8,-7.6L2.8,-5', w: 1.8 },
  ],

  // ── habit
  agir: () => [
    { k: 'c', d: flame(0, 0, 1), c: 'fire' },
    { k: 'c', d: flameCore(0, 1, 1), c: 'flame' },
    { k: 'h', d: 'M-9,4C-9,-1 -7,-4 -5.5,-7C-6,-3 -6.5,0 -6.5,4Z', o: 0.45 },
  ],
  hefte: () => [
    { k: 'f', d: rrect(-19, -12, 38, 30, 3) },
    { k: 'a', d: 'M-19,-3V-9C-19,-11 -18,-12 -16,-12H16C18,-12 19,-11 19,-9V-3Z' },
    { k: 'l', d: 'M-9,-17V-8M9,-17V-8', w: 3.2 },
    { k: 'l', d: 'M-8,7L-2,12.5L9,1', w: 3.6, c: 'green' },
  ],
  roj: () => {
    const rays: string[] = [];
    for (let i = 1; i < 8; i++) {
      const a = rad(180 + i * 22.5);
      rays.push(`M${n(Math.cos(a) * 14.5)},${n(5 + Math.sin(a) * 14.5)}L${n(Math.cos(a) * 20)},${n(5 + Math.sin(a) * 20)}`);
    }
    return [
      { k: 'l', d: rays.join(''), w: 3 },
      { k: 'f', d: 'M-11,8A11,11 0 0 1 11,8Z' },
      { k: 'l', d: 'M-19,9.5H19', w: 3.2 },
      { k: 'l', d: 'M-12,15H12M-6,19.5H6', w: 2.4 },
    ];
  },
  pela: () => [
    // a wave: the Okyanûs trophy
    { k: 'c', d: 'M-20,18C-15,12 -11,4 -9,-4C-7,-12 0,-18 8,-18C15,-18 19.5,-12.5 18.5,-6.5C17.5,-1.5 12.5,0.5 8.5,-1C5.5,-2.2 5.2,-6.8 8.4,-7.8C4.2,-9 0.8,-4.8 1.8,0.6C3,7 9.5,10.5 20,11.5V18Z', c: 'water' },
    { k: 'w', d: 'M-9,-4C-7,-12 0,-18 8,-18C15,-18 19.5,-12.5 18.5,-6.5C18,-3.6 16.3,-1.7 14,-1C16,-4.2 15.6,-10 10.5,-12.2C5,-14.6 -2.5,-11.5 -9,-4Z' },
    { k: 'l', d: 'M-12,12C-9,6 -6,1 -4,-4M-2,14C0,9 1,5 1,1', w: 1.6, c: 'snow' },
    { k: 'w', d: sparkle(-12.5, -12, 4.5) },
  ],
  vegera: () => [
    // a swallow coming home, seen from below: crescent wings, a forked tail, the red throat
    { k: 'a', d: 'M3,-9C9,-13.5 16.5,-11.5 20.5,-2.5C14.5,-4 8.5,-2.5 3,0Z' },
    { k: 'a', d: 'M-3,-9C-9,-13.5 -16.5,-11.5 -20.5,-2.5C-14.5,-4 -8.5,-2.5 -3,0Z' },
    { k: 'f', d: 'M0,-16.5C2.8,-16.5 4.2,-13.5 4.2,-9.5C4.2,-3.5 3.6,3.5 2.6,8.5L7.5,19.5L0,12.5L-7.5,19.5L-2.6,8.5C-3.6,3.5 -4.2,-3.5 -4.2,-9.5C-4.2,-13.5 -2.8,-16.5 0,-16.5Z' },
    { k: 'c', d: circ(0, -10, 2.4), c: 'red' },
    { k: 'd', d: 'M9,-8C12,-8 15,-6.5 17,-4M-9,-8C-12,-8 -15,-6.5 -17,-4', w: 1.1, fine: true },
  ],

  // ── games
  peyvzan: () => [
    { k: 'f', d: rrect(-18, -18, 16.5, 16.5, 3) },
    { k: 'c', d: rrect(1.5, -18, 16.5, 16.5, 3), c: 'gold' },
    { k: 'c', d: rrect(-18, 1.5, 16.5, 16.5, 3), c: 'green' },
    { k: 'c', d: rrect(1.5, 1.5, 16.5, 16.5, 3), c: 'green' },
    // K, Ê, V, A — fine letters on the tiles
    { k: 'd', d: 'M-13.5,-14V-5.5M-13.5,-9.5L-7,-14M-11.5,-10.8L-7,-5.5', w: 2, fine: true },
    { k: 'd', d: 'M13,-14H6.5V-5.5H13M6.5,-9.8H11.5', w: 2, fine: true },
    { k: 'd', d: 'M-13.5,5.5L-9.75,14L-6,5.5', w: 2, fine: true },
    { k: 'd', d: 'M6,14L9.75,5.5L13.5,14M7.4,11H12.1', w: 2, fine: true },
  ],
  helbestvan: () => {
    // a tembûr: a small pear-shaped body and a very long neck
    const tf = 'translate(1 1) rotate(34) scale(0.92)';
    return [
      { k: 'a', d: 'M-1.9,-18H1.9V3H-1.9Z', tf },
      { k: 'a', d: 'M-3.2,-23H3.2V-17H-3.2Z', tf },
      { k: 'd', d: 'M-3.2,-21.4H-5.6M3.2,-21.4H5.6M-3.2,-18.6H-5.6M3.2,-18.6H5.6', w: 1.5, tf },
      { k: 'f', d: 'M0,-1C4,-1 8.6,5 9,11C9.4,17 5.2,21 0,21C-5.2,21 -9.4,17 -9,11C-8.6,5 -4,-1 0,-1Z', tf },
      { k: 'k', d: `${circ(-3.2, 9, 1.1)}${circ(3.2, 9, 1.1)}`, tf },
      { k: 'd', d: 'M-3.2,17H3.2', w: 1.6, tf },
      { k: 'd', d: 'M-0.7,-16.5V17M0.7,-16.5V17', w: 0.55, tf, fine: true },
      { k: 'd', d: 'M-1.9,-13H1.9M-1.9,-9H1.9M-1.9,-5H1.9M-1.9,-1.5H1.9', w: 0.8, tf, fine: true },
    ];
  },
  bilez: () => [
    { k: 'a', d: rrect(-10, -15, 30, 32, 5) },
    { k: 'f', d: rrect(-7, -13, 24, 23, 3) },
    { k: 'd', d: 'M1,-8V5M1,0L9.5,-8M4,-2.5L10,5', w: 2.6 },
    { k: 'l', d: 'M-21,-7H-15M-22,-1H-15.5M-21,5H-15', w: 2.8 },
  ],
  rastnivis: () => [
    { k: 'f', d: circ(0, 0, 18.5) },
    { k: 'c', d: circ(0, 0, 13), c: 'red' },
    { k: 'f', d: circ(0, 0, 7.8) },
    { k: 'c', d: circ(0, 0, 3.2), c: 'red' },
    { k: 'h', d: 'M-13.5,-6C-12,-11 -7.5,-14.5 -2.5,-15C-7,-13 -10.5,-10 -12,-5.5Z', o: 0.55, fine: true },
  ],
  guhdar: () => [
    { k: 'l', d: 'M-15,5V0C-15,-9 -8,-16 0,-16C8,-16 15,-9 15,0V5', w: 4.2 },
    { k: 'a', d: 'M-19.5,3C-19.5,0.5 -18,-1 -16,-1H-11V17H-16C-18,17 -19.5,15.5 -19.5,13Z' },
    { k: 'a', d: 'M19.5,3C19.5,0.5 18,-1 16,-1H11V17H16C18,17 19.5,15.5 19.5,13Z' },
    { k: 'f', d: 'M-11,1H-8.5C-7,1 -6,2 -6,3.5V12.5C-6,14 -7,15 -8.5,15H-11Z' },
    { k: 'f', d: 'M11,1H8.5C7,1 6,2 6,3.5V12.5C6,14 7,15 8.5,15H11Z' },
    { k: 'l', d: 'M-2.5,4.5C-1,6.5 -1,9.5 -2.5,11.5M2,2C5,5.5 5,10.5 2,14', w: 1.8, c: 'blue' },
  ],
  hemereng: () => {
    const petal = 'M0,-1.5C-0.5,-9 4,-18 11,-18C16,-18 18,-13 16,-9C13.5,-4 7,-1.5 0,-1.5Z';
    return [
      { k: 'c', d: petal, c: 'red', tf: 'rotate(0)' },
      { k: 'c', d: petal, c: 'gold', tf: 'rotate(90)' },
      { k: 'c', d: petal, c: 'green', tf: 'rotate(180)' },
      { k: 'c', d: petal, c: 'blue', tf: 'rotate(270)' },
      { k: 'f', d: circ(0, 0, 4.6) },
    ];
  },
  dilpak: () => [
    { k: 'f', d: heart(0, 0.5, 1) },
    { k: 'h', d: 'M-13.5,-7.5C-13.5,-11 -11,-12.8 -8.2,-12.8C-10,-11.2 -11.2,-9.6 -11.3,-6.8Z', o: 0.7 },
    { k: 'w', d: sparkle(14, -13.5, 5.5) },
  ],

  // ── ranked (the six tier badges are drawn from the rank emblems, in badges.ts)
  hilkiser: () => [
    ...mountainGlyph(true, true),
    { k: 'd', d: 'M-12,16L-3,12L-9,7.5L-3,3L-6,-1', w: 1.6 },
  ],
  cihgirti: () => [
    { k: 'f', d: 'M0,20C-5,12 -14,4 -14,-5C-14,-13 -8,-19 0,-19C8,-19 14,-13 14,-5C14,4 5,12 0,20Z' },
    { k: 'a', d: circ(0, -5, 8) },
    { k: 'l', d: 'M-4,-5L-1,-2L4.5,-8.5', w: 2.8, c: 'snow' },
  ],

  // ── friends
  heval: () => [
    { k: 'a', d: 'M-1.5,15C-1.5,4 2.5,-1.5 8,-1.5C13.5,-1.5 18.5,4 18.5,15Z' },
    { k: 'a', d: circ(8, -10, 6.3) },
    { k: 'f', d: 'M-18.5,19C-18.5,8 -12.5,3 -5,3C2.5,3 8.5,8 8.5,19Z' },
    { k: 'f', d: circ(-5, -6, 7.3) },
  ],
  diyari: () => [
    { k: 'c', d: 'M0,-8C-3,-16 -13,-19 -13,-12C-13,-8 -6,-8 0,-8Z', c: 'red' },
    { k: 'c', d: 'M0,-8C3,-16 13,-19 13,-12C13,-8 6,-8 0,-8Z', c: 'red' },
    { k: 'f', d: rrect(-17, 0, 34, 18.5, 2.5) },
    { k: 'a', d: rrect(-20, -8, 40, 8.5, 2) },
    { k: 'c', d: 'M-3.2,-8H3.2V18.5H-3.2Z', c: 'red' },
    { k: 'c', d: circ(0, -8.5, 3), c: 'red' },
  ],
  // a lantern lit for the guests: the host
  mevandar: () => [
    { k: 'l', d: 'M-4,-15.5C-4,-21.5 4,-21.5 4,-15.5', w: 2.6 },
    { k: 'c', d: 'M-9,-11H9L8,11H-8Z', c: 'glow' },
    { k: 'c', d: flame(0, 3, 0.36), c: 'fire' },
    { k: 'd', d: 'M-5,-11L-4.5,11M5,-11L4.5,11', w: 1.3, fine: true },
    { k: 'a', d: 'M-11,-10L-6.5,-16H6.5L11,-10Z' },
    { k: 'a', d: rrect(-12, 10, 24, 7.5, 2.5) },
    { k: 'l', d: 'M-14,-1H-19M14,-1H19M-13.5,-8.5L-17,-12M13.5,-8.5L17,-12M-13.5,6.5L-17,10M13.5,6.5L17,10', w: 2, c: 'glow' },
  ],

  // ── events
  newroz: () => [
    { k: 'c', d: 'M-18,13L14,6C16,5.6 17.5,7 17.4,8.8C17.3,10 16.6,10.8 15.6,11L-16.6,18C-18.4,18.4 -19.8,17 -19.6,15.4C-19.5,14.2 -18.9,13.3 -18,13Z', c: 'brown' },
    { k: 'c', d: 'M18,13L-14,6C-16,5.6 -17.5,7 -17.4,8.8C-17.3,10 -16.6,10.8 -15.6,11L16.6,18C18.4,18.4 19.8,17 19.6,15.4C19.5,14.2 18.9,13.3 18,13Z', c: 'brown' },
    { k: 'c', d: flame(0, -4, 0.82), c: 'fire' },
    { k: 'c', d: flameCore(0, -4, 0.82), c: 'flame' },
    { k: 'c', d: sparkle(-14, -12, 3.2), c: 'gold' },
    { k: 'c', d: sparkle(14.5, -15, 2.8), c: 'gold' },
    { k: 'c', d: sparkle(16.5, -5, 2.2), c: 'gold' },
  ],
  'roja-ziman': () => [
    { k: 'f', d: 'M0,20C-6,14 -11,6 -11,-3L-5.5,-10H5.5L11,-3C11,6 6,14 0,20Z' },
    { k: 'a', d: 'M-6,-9.5V-18.5C-6,-20 -5,-21 -3.5,-21H3.5C5,-21 6,-20 6,-18.5V-9.5Z' },
    { k: 'd', d: 'M0,18V3', w: 1.6 },
    { k: 'k', d: circ(0, 1, 2.6) },
    { k: 'd', d: 'M-10.5,-3C-5,-0.5 5,-0.5 10.5,-3', w: 1.2, fine: true },
    { k: 'h', d: 'M-7.5,-2.5C-7.5,3 -5.5,8 -2.5,12.5C-5.5,9.5 -8.5,4 -8.5,-1.5Z', o: 0.6, fine: true },
  ],
  'zimane-dayike': () => [
    { k: 'f', d: 'M0,-17C11,-17 19,-10 19,-2C19,7 11,13 0,13C-2,13 -4,12.8 -6,12.3L-14,18.5L-12,8.5C-16.5,5.5 -19,2 -19,-2C-19,-10 -11,-17 0,-17Z' },
    { k: 'c', d: heart(0, -2.5, 0.48), c: 'red' },
  ],
  bihar: () => {
    const petal = 'M0,-3C-6.5,-6.5 -7.5,-17 0,-19.5C7.5,-17 6.5,-6.5 0,-3Z';
    return [
      ...[0, 72, 144, 216, 288].map((deg): Part => ({ k: 'c', d: petal, c: 'pink', tf: `rotate(${deg})` })),
      { k: 'c', d: circ(0, 0, 5.4), c: 'gold' },
      { k: 'k', d: `${circ(-1.8, -1.4, 0.9)}${circ(1.8, -1.2, 0.9)}${circ(0.2, 1.9, 0.9)}`, fine: true },
    ];
  },
  havin: sun,
  payiz: () => [
    { k: 'l', d: 'M-12,14L-18.5,20.5', w: 2.6, c: 'brown' },
    { k: 'c', d: 'M-13,15C-18,1 -9,-15 16,-18C17,3 3,16 -13,15Z', c: 'autumn' },
    { k: 'd', d: 'M-13,15C-5,6 4,-4 14,-15.5', w: 1.6 },
    { k: 'd', d: 'M-6,7L-8,-3M-6,7L5,8M1,0L0,-10M1,0L11,-0.5M7,-7L6.5,-14', w: 1.1, fine: true },
  ],
  zivistan: snowflake,
  mehane: () => [
    { k: 'f', d: circ(0, 0, 15.5) },
    { k: 'a', d: `${circ(-5.5, -4.5, 3.6)}` },
    { k: 'a', d: `${circ(5.5, 3, 2.6)}` },
    { k: 'a', d: `${circ(-2, 8.2, 2)}` },
    { k: 'h', d: 'M-11,-5C-10,-10 -6,-13.5 -1,-13.8C-5,-12 -8.5,-8.5 -9.5,-4Z', o: 0.6 },
    { k: 'w', d: sparkle(15.5, -15.5, 4.5) },
    { k: 'w', d: sparkle(-15.5, 14.5, 3.4) },
  ],

  // ── secret
  'tire-rast': arrow,
  'ji-nu-ve': () => [
    { k: 'a', d: 'M-16,19C-12,12.5 12,12.5 16,19Z' },
    { k: 'l', d: 'M0,15C0,8 -1,3 0,-3', w: 2.8, c: 'green' },
    { k: 'c', d: 'M0,-1C-3,-11 -12,-15 -18.5,-12C-15,-4 -7,0 0,-1Z', c: 'leaf' },
    { k: 'c', d: 'M0,3C3,-7 12,-12 18.5,-9C16,-1 8,4 0,3Z', c: 'green' },
    { k: 'd', d: 'M-1,-1.5C-6,-6 -11,-9 -15.5,-11M1,2.5C6,-2 11,-6 15.5,-8', w: 1.1, fine: true },
  ],
  'kewe-ciye': () => [
    { k: 'a', d: 'M-14.5,4.5L-21,-1.5L-20.5,8Z' },
    { k: 'f', d: 'M-16,7C-17,-3 -8,-9 1,-8C3,-13 7,-16 11,-16C15,-16 17,-13 17,-10L20.5,-8.5L17,-7C17,-1 13,8 5,12C-3,16 -13,15 -16,7Z' },
    { k: 'a', d: 'M-12,3C-9,-4 0,-6 6,-2C4,5 -4,9 -12,3Z' },
    { k: 'd', d: 'M-4,7L-1.5,12M0.5,6L3,11M5,4.5L7,9', w: 1.4, fine: true },
    { k: 'k', d: 'M6.5,-13.5C9.5,-12.6 13,-12.4 16,-11.8L16.2,-10.3C13.6,-10 13.2,-6.5 12,-3.5C10.5,-0.5 6.5,-0.3 4.5,-2C7.5,-3.5 9.2,-5.5 9.6,-8.6C8.3,-9.8 7.2,-11.6 6.5,-13.5Z' },
    { k: 'w', d: circ(12.3, -12, 1.5) },
    { k: 'c', d: 'M17,-10L20.5,-8.5L17,-7Z', c: 'red' },
    { k: 'l', d: 'M-3,12.5L-4,18.5M4,11.5L4.5,18.5', w: 1.8, c: 'red' },
  ],
  'deste-zerin': () => [
    {
      k: 'c',
      c: 'gold',
      d: 'M-7,20C-11,16 -13,11 -14,6L-18,-3C-19,-6 -15,-8 -13.5,-5L-10,1L-10,-14C-10,-17 -5.5,-17 -5.5,-14L-5.5,-3L-4.5,-17C-4.5,-20 0,-20 0,-17L0,-3L1,-15C1,-18 5.5,-18 5.5,-15L5,-2L6.5,-10C7,-13 11.5,-12.5 11,-9.5L10,5C9.5,12 7,17 4,20Z',
    },
    { k: 'd', d: 'M-5.5,-3.5V1M0,-3.5V1M5,-2.5V2', w: 1.3, fine: true },
    { k: 'w', d: sparkle(15, -15.5, 5.5) },
    { k: 'w', d: sparkle(-15.5, -14, 3.5) },
  ],
  'mevane-agir': () => [
    { k: 'a', d: 'M-17.5,14C-17.5,18.5 17.5,18.5 17.5,14C17.5,11.5 -17.5,11.5 -17.5,14Z' },
    { k: 'w', d: 'M-8.5,-10C-8.5,-5 -5,-2 -5,1C-5,5 -9,8 -9,13.5H9C9,8 5,5 5,1C5,-2 8.5,-5 8.5,-10Z' },
    { k: 'c', d: 'M-7,-4.5C-6,-2.5 -5,-1 -5,1C-5,5 -9,8 -9,13.5H9C9,8 5,5 5,1C5,-1 6,-2.5 7,-4.5Z', c: 'tea' },
    { k: 'h', d: 'M-6,-3C-4.5,0 -4,3 -6,6.5C-5,3 -5.2,0 -6.8,-3Z', o: 0.7, fine: true },
    { k: 'l', d: 'M-3,-13C-6,-16 0,-17.5 -3,-21M3.5,-13C0.5,-16 6.5,-17.5 3.5,-21', w: 2 },
  ],
  'kaniya-zanine': () => [
    // the spring of knowledge: an open book, and a spring rising out of it — a
    // jet from the spine, crowned with a drop, falling back in two arcs
    { k: 'f', d: 'M0,8.5C-5,5 -12,4.5 -19.5,6.5V18C-12,16 -5,16.5 0,19.5Z' },
    { k: 'a', d: 'M0,8.5C5,5 12,4.5 19.5,6.5V18C12,16 5,16.5 0,19.5Z' },
    { k: 'd', d: 'M-15.5,10.6C-11.5,9.6 -7.5,9.9 -4,11.6M-15.5,14.2C-11.5,13.2 -7.5,13.5 -4,15.2M15.5,10.6C11.5,9.6 7.5,9.9 4,11.6M15.5,14.2C11.5,13.2 7.5,13.5 4,15.2', w: 1.1, fine: true },
    { k: 'c', d: 'M-2.6,7.5C-2.6,0 -1.8,-5.5 0,-9.5C1.8,-5.5 2.6,0 2.6,7.5Z', c: 'water' },
    { k: 'c', d: 'M-0.6,-6.5C-3.5,-14 -12,-15.5 -15.5,-8C-16.6,-5.6 -16.6,-2.6 -15.6,0.5C-14.2,0.5 -13.2,0.4 -12.2,0.2C-13,-2.4 -13,-4.6 -12.2,-6.4C-10,-11 -4.6,-10.6 -0.6,-6.5Z', c: 'water' },
    { k: 'c', d: 'M0.6,-6.5C3.5,-14 12,-15.5 15.5,-8C16.6,-5.6 16.6,-2.6 15.6,0.5C14.2,0.5 13.2,0.4 12.2,0.2C13,-2.4 13,-4.6 12.2,-6.4C10,-11 4.6,-10.6 0.6,-6.5Z', c: 'water' },
    { k: 'c', d: drop(0, -15.5, 0.46), c: 'water' },
    { k: 'h', d: 'M-1.4,4C-1.4,-1 -1,-4.5 -0.2,-7C-0.4,-3.5 -0.4,0 -0.2,4Z', o: 0.7, fine: true },
  ],
};

/** The "?" a secret badge shows until it is found. */
export const QUESTION: Part[] = [
  { k: 'l', d: 'M-7.5,-8C-7.5,-15.5 7.5,-16.5 7.5,-8.5C7.5,-2.5 0,-2.5 0,4.5', w: 5.2 },
  { k: 'f', d: circ(0, 12.5, 3.4) },
];
