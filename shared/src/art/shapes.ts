/**
 * One silhouette per badge family, so a badge says what kind it is before its
 * colour does (research §5.2): learning a circle, habit a rounded square,
 * games a hexagon, ranked a shield, friends a leaf, events an eight-point
 * star, secret a diamond.
 *
 * Each is an outline on the 120-unit canvas centred a little above the middle,
 * leaving the bottom for the tier plaque, plus where its icon sits and how big:
 * a diamond's field is narrower than a circle's, so its icon is smaller.
 */
import { circle, cubic, place, regular, roundedPolygon, star } from './geometry.js';
import type { BadgeFamily } from './keys.js';
import type { Pt } from './svg.js';

export interface Shape {
  outline: Pt[];
  /** where the icon is centred */
  icon: Pt;
  /** the icon's scale (1 = the 40-unit icon box at 1:1) */
  scale: number;
  /** where the tier plaque's centre sits */
  plaque: number;
  /** extra pieces drawn behind the medallion (a leaf's stalk), already outlined */
  stalk?: Pt[];
}

const CX = 60;
const CY = 56;

function shield(): Pt[] {
  const top = 11;
  const left = 15;
  const right = 105;
  const shoulder = 58;
  const tip: Pt = [CX, 110];
  const out: Pt[] = [];
  // top edge, dipping a little in the middle the way a heater shield's does
  out.push([left + 10, top]);
  out.push(...cubic([left + 10, top], [40, top], [50, top + 3.5], [CX, top + 3.5], 8));
  out.push(...cubic([CX, top + 3.5], [70, top + 3.5], [80, top], [right - 10, top], 8));
  out.push(...cubic([right - 10, top], [right - 3, top], [right, top + 3], [right, top + 10], 5));
  out.push([right, shoulder]);
  out.push(...cubic([right, shoulder], [right, 84], [80, 98], tip, 18));
  out.push(...cubic(tip, [40, 98], [left, 84], [left, shoulder], 18));
  out.push([left, top + 10]);
  out.push(...cubic([left, top + 10], [left, top + 3], [left + 3, top], [left + 10, top], 5).slice(0, -1));
  return out;
}

/** A leaf: two arcs meeting in a point at each end, laid on the diagonal. */
function leaf(): Pt[] {
  const L = 59;
  const H = 35;
  const upper = cubic([-L, 0], [-L * 0.45, -H * 1.36], [L * 0.45, -H * 1.36], [L, 0], 28);
  const lower = cubic([L, 0], [L * 0.45, H * 1.36], [-L * 0.45, H * 1.36], [-L, 0], 28);
  return place([...upper, ...lower], { x: CX, y: CY, deg: -45 });
}

function leafStalk(): Pt[] {
  // a short curved stalk off the lower-left point, as a closed outline
  const base = place(
    [
      [-55, -3],
      [-62, -4.2],
      [-68.5, -2],
      [-72.5, 2.6],
      [-70, 4.6],
      [-65.5, 1.8],
      [-55, 3],
    ],
    { x: CX, y: CY, deg: -45 },
  );
  return base;
}

export const SHAPES: Record<BadgeFamily, Shape> = {
  learning: { outline: circle(CX, CY, 48, 72), icon: [CX, CY], scale: 1.24, plaque: 103 },
  habit: {
    outline: roundedPolygon(
      [
        [16, 12],
        [104, 12],
        [104, 100],
        [16, 100],
      ],
      17,
      8,
    ),
    icon: [CX, CY],
    scale: 1.24,
    plaque: 101,
  },
  games: { outline: roundedPolygon(regular(CX, CY, 51, 6, -90), 7, 6), icon: [CX, CY], scale: 1.16, plaque: 104 },
  ranked: { outline: shield(), icon: [CX, 52], scale: 1.12, plaque: 104 },
  friends: { outline: leaf(), icon: [CX, CY], scale: 1.06, plaque: 104, stalk: leafStalk() },
  events: {
    outline: roundedPolygon(star(CX, CY, 53, 53 * 0.78, 8, -90), [4, 2, 4, 2, 4, 2, 4, 2, 4, 2, 4, 2, 4, 2, 4, 2], 5),
    icon: [CX, CY],
    scale: 1.08,
    plaque: 105,
  },
  secret: {
    outline: roundedPolygon(
      [
        [CX, 3],
        [113, CY],
        [CX, 109],
        [7, CY],
      ],
      9,
      7,
    ),
    icon: [CX, CY],
    scale: 1.02,
    plaque: 105,
  },
};
