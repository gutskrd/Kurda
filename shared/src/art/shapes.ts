/**
 * One silhouette per badge family, so a badge says what kind it is before its
 * colour does (research §5.2): learning a circle, habit a rounded square,
 * games a hexagon, ranked a shield, friends a leaf, events a rosette, secret
 * a gem. Every corner is soft — a badge is something to collect, not a
 * weapon — and each shape stays far enough from its neighbours to be told
 * apart at 24 pixels.
 *
 * Each is an outline on the 120-unit canvas centred a little above the middle,
 * leaving the bottom for the tier capsule, plus where its icon sits and how big:
 * a gem's field is narrower than a circle's, so its icon is smaller.
 *
 * An outline is kept as its corners and how round each is, not as points:
 * written out it is a dozen exact curves (`roundPath`), and moved in for the
 * rim it stays exact (`insetRound`).
 */
import { circle, insetRound, place, placeRound, regular, roundPath, roundedPolygon, star } from './geometry.js';
import type { RoundShape } from './geometry.js';
import { circ } from './icons.js';
import type { BadgeFamily } from './keys.js';
import type { Pt } from './svg.js';

export type Body = { kind: 'circle'; r: number } | { kind: 'round'; shape: RoundShape };

export interface Shape {
  body: Body;
  /** where the icon is centred */
  icon: Pt;
  /** the icon's scale (1 = the 40-unit icon box at 1:1) */
  scale: number;
}

const CX = 60;
const CY = 56;

/** A shield with a soft top and a soft point. */
function shield(): RoundShape {
  return {
    vertices: [
      [14, 11],
      [106, 11],
      [106, 58],
      [CX, 110],
      [14, 58],
    ],
    radii: [13, 13, 36, 14, 36],
  };
}

/**
 * A leaf on the diagonal: a soft point at each end and full, curved sides —
 * each side one curve through its far corner, which is what a rounded corner
 * becomes when it is rounder than its sides are long.
 */
function leaf(): RoundShape {
  const L = 62;
  const W = 50;
  return {
    vertices: place(
      [
        [-L, 0],
        [0, -W],
        [L, 0],
        [0, W],
      ],
      { x: CX, y: CY, deg: -45 },
    ),
    radii: [7, 200, 7, 200],
  };
}

/** A rosette: ten round lobes, the way a festival's paper rosette or a rug's medallion is cut. */
function rosette(): RoundShape {
  const vertices = star(CX, CY, 54, 45.5, 10, -90);
  return { vertices, radii: vertices.map((_, i) => (i % 2 === 0 ? 11 : 3)) };
}

export const SHAPES: Record<BadgeFamily, Shape> = {
  learning: { body: { kind: 'circle', r: 48 }, icon: [CX, CY], scale: 1.24 },
  habit: {
    body: {
      kind: 'round',
      shape: {
        vertices: [
          [15, 11],
          [105, 11],
          [105, 101],
          [15, 101],
        ],
        radii: [28, 28, 28, 28],
      },
    },
    icon: [CX, CY],
    scale: 1.24,
  },
  games: { body: { kind: 'round', shape: { vertices: regular(CX, CY, 52, 6, -90), radii: [13, 13, 13, 13, 13, 13] } }, icon: [CX, CY], scale: 1.16 },
  ranked: { body: { kind: 'round', shape: shield() }, icon: [CX, 54], scale: 1.12 },
  friends: { body: { kind: 'round', shape: leaf() }, icon: [CX, CY], scale: 1.06 },
  events: { body: { kind: 'round', shape: rosette() }, icon: [CX, CY], scale: 1.08 },
  secret: {
    body: {
      kind: 'round',
      shape: {
        vertices: [
          [CX, 3],
          [113, CY],
          [CX, 109],
          [7, CY],
        ],
        radii: [18, 18, 18, 18],
      },
    },
    icon: [CX, CY],
    scale: 1.02,
  },
};

/** Where a badge's body is drawn: scaled by `s` about its centre and moved so its centre is at 60,y. */
export interface Placement {
  s: number;
  y: number;
}

/** A body placed and moved in by `inset`: its corners, or its circle. */
function placed(body: Body, at: Placement, inset: number): Body {
  if (body.kind === 'circle') return { kind: 'circle', r: Math.max(0.5, body.r * at.s - inset) };
  const moved = placeRound(
    { vertices: body.shape.vertices.map(([x, y]) => [x - CX, y - CY] as Pt), radii: body.shape.radii },
    { x: CX, y: at.y, s: at.s },
  );
  return { kind: 'round', shape: inset === 0 ? moved : insetRound(moved, inset) };
}

/** A family's outline, placed and moved in by `inset`, as path data. */
export function shapePath(family: BadgeFamily, at: Placement, inset = 0): string {
  const b = placed(SHAPES[family].body, at, inset);
  return b.kind === 'circle' ? circ(CX, at.y, b.r) : roundPath(b.shape.vertices, b.shape.radii);
}

/** The same outline as points, for setting beads along it. */
export function shapePoints(family: BadgeFamily, at: Placement, inset = 0): Pt[] {
  const b = placed(SHAPES[family].body, at, inset);
  return b.kind === 'circle' ? circle(CX, at.y, b.r, 96) : roundedPolygon(b.shape.vertices, b.shape.radii, 8);
}
