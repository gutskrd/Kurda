/**
 * The glyphs still drawn as a few flat parts, in a 40-unit box centred on
 * 0,0: the four seasons' marks on a season's rank emblem — spring's flower,
 * summer's Kurdish sun of twenty-one rays, an autumn leaf, a snowflake —
 * painted in the emblem's metal (iconpaint.ts), and the "?" of a secret not
 * yet found. Every badge's own picture is drawn whole instead: what Hevalo
 * shows (props/), and the secrets and the pictures that stand alone
 * (pictures.ts).
 *
 * A part says what it is rather than what colour it is: the main body, its
 * shaded face, a named accent, snow, a cut line, a stroked line, a
 * highlight. Parts marked `fine` turn to noise at 32 pixels and are left out
 * of the small drawing.
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

/** The seeds at a flower's heart: five dots in a ring, so they read as seeds and never as a face. */
const seeds = (r: number, dot: number): string =>
  Array.from({ length: 5 }, (_, i) => circ(Math.cos(rad(i * 72 - 90)) * r, Math.sin(rad(i * 72 - 90)) * r, dot)).join('');

// ─────────────────────────────────────────────────────────────── glyphs

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

/** The Kurdish sun: twenty-one even rays, each pair parted by a notch at half their reach. */
function sun(): Part[] {
  const rays = Array.from({ length: 42 }, (_, i): readonly [number, number] => {
    const a = rad((i * 360) / 42 - 90);
    const r = i % 2 === 0 ? 20 : 10;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
  return [
    { k: 'a', d: polygon(rays) },
    { k: 'f', d: circ(0, 0, 8.6) },
    { k: 'h', d: 'M-5.4,-2.8C-5,-5 -3.4,-6.4 -1.2,-6.6C-2.9,-5.6 -4,-4.2 -4.4,-2.2Z', o: 0.6 },
  ];
}

/** The four seasons' marks, by season: Zivistan, Bihar, Havîn, Payîz. */
export const SEASON_ICONS: Readonly<Record<string, () => Part[]>> = {
  zivistan: snowflake,
  bihar: () => {
    const petal = 'M0,-3C-6.5,-6.5 -7.5,-17 0,-19.5C7.5,-17 6.5,-6.5 0,-3Z';
    return [
      ...[0, 72, 144, 216, 288].map((deg): Part => ({ k: 'c', d: petal, c: 'pink', tf: `rotate(${deg})` })),
      { k: 'c', d: circ(0, 0, 5.4), c: 'gold' },
      { k: 'k', d: seeds(2.9, 0.8), fine: true },
    ];
  },
  havin: sun,
  payiz: () => [
    { k: 'l', d: 'M-12,14L-18.5,20.5', w: 2.6, c: 'brown' },
    { k: 'c', d: 'M-13,15C-18,1 -9,-15 16,-18C17,3 3,16 -13,15Z', c: 'autumn' },
    { k: 'd', d: 'M-13,15C-5,6 4,-4 14,-15.5', w: 1.6 },
    { k: 'd', d: 'M-6,7L-8,-3M-6,7L5,8M1,0L0,-10M1,0L11,-0.5M7,-7L6.5,-14', w: 1.1, fine: true },
  ],
};

/** The "?" a secret badge shows until it is found. */
export const QUESTION: Part[] = [
  { k: 'l', d: 'M-7.5,-8C-7.5,-15.5 7.5,-16.5 7.5,-8.5C7.5,-2.5 0,-2.5 0,4.5', w: 5.2 },
  { k: 'f', d: circ(0, 12.5, 3.4) },
];
