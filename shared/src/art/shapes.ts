/**
 * One silhouette per badge family, so a badge says what kind it is before its
 * colour does (research §5.2): learning a circle, habit a rounded square,
 * games a hexagon, ranked a shield, friends a leaf, events an eight-point
 * star, secret a diamond.
 *
 * Each is an outline on the 120-unit canvas centred a little above the middle,
 * leaving the bottom for the tier capsule, plus where its icon sits and how big:
 * a diamond's field is narrower than a circle's, so its icon is smaller.
 */
import { circle, cubic, evenCubic, place, regular, roundedPolygon, star } from './geometry.js';
import type { BadgeFamily } from './keys.js';
import type { Pt } from './svg.js';

export interface Shape {
  outline: Pt[];
  /** where the icon is centred */
  icon: Pt;
  /** the icon's scale (1 = the 40-unit icon box at 1:1) */
  scale: number;
}

const CX = 60;
const CY = 56;

/** A crest shield: its top rising to a peak in the middle, like the ridge it is won on. */
function shield(): Pt[] {
  const tl: Pt = [16, 19];
  const peak: Pt = [CX, 8];
  const tr: Pt = [104, 19];
  const tip: Pt = [CX, 111];
  return [
    tl,
    ...cubic(tl, [32, 15], [48, 11], peak, 8),
    ...cubic(peak, [72, 11], [88, 15], tr, 8),
    ...cubic(tr, [105.5, 19.5], [106, 21], [106, 24], 3),
    ...cubic([106, 24], [106, 40], [106, 50], [106, 62], 6),
    ...cubic([106, 62], [106, 86], [84, 101], tip, 18),
    ...cubic(tip, [36, 101], [14, 86], [14, 62], 18),
    ...cubic([14, 62], [14, 50], [14, 40], [14, 24], 6),
    ...cubic([14, 24], [14, 21], [14.5, 19.5], tl, 3).slice(0, -1),
  ];
}

/**
 * A leaf: two arcs meeting in a point at each end, laid on the diagonal —
 * fuller than a willow leaf, so it holds a glyph. The two sides are mirror
 * images and meet at the same clean angle at both tips, and are sampled at
 * even steps of length, so the rim runs as evenly into each point as it does
 * round the shoulders.
 */
function leaf(): Pt[] {
  const { L, along, out } = LEAF;
  const side = evenCubic([-L, 0], [-L + along, -out], [L - along, -out], [L, 0], 36);
  // the other side is the same turned half round, so both tips are the same point
  const other = side.slice(0, -1).map(([x, y]) => [-x, -y] as Pt);
  return place([...side, ...other, [-L, 0]], { x: CX, y: CY, deg: -45 });
}
/**
 * Half the leaf's length, and how far each side's handles reach along it and
 * out from it: the leaf is 0.75 × `out` wide each side of its middle, and
 * meets itself at each tip at twice atan(out / along).
 */
const LEAF = { L: 64, along: 38, out: 52 };

export const SHAPES: Record<BadgeFamily, Shape> = {
  learning: { outline: circle(CX, CY, 48, 72), icon: [CX, CY], scale: 1.24 },
  habit: {
    outline: roundedPolygon(
      [
        [16, 12],
        [104, 12],
        [104, 100],
        [16, 100],
      ],
      26,
      10,
    ),
    icon: [CX, CY],
    scale: 1.24,
  },
  games: { outline: roundedPolygon(regular(CX, CY, 51, 6, -90), 7, 6), icon: [CX, CY], scale: 1.16 },
  ranked: { outline: shield(), icon: [CX, 52], scale: 1.12 },
  friends: { outline: leaf(), icon: [CX, CY], scale: 1.06 },
  events: {
    outline: roundedPolygon(star(CX, CY, 53, 53 * 0.78, 8, -90), [4, 2, 4, 2, 4, 2, 4, 2, 4, 2, 4, 2, 4, 2, 4, 2], 5),
    icon: [CX, CY],
    scale: 1.08,
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
  },
};
