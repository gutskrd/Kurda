/**
 * The landmarks of the road's first six chapters, painted in the valley's
 * hand (art/valley.ts): Sêvan's blue gate, Hamo's teahouse, the spring under
 * the walnut, market day, the bus stop on the road out, and the black walls
 * of Amed.
 *
 * Each stands on the 120-unit canvas with its foot near y 114, seen a little
 * from above in the late-afternoon light: flat planes with no outlines, each
 * form one face and one step of shade, the light from the upper left, and
 * every shadow a flat patch of the meadow's darker green to the lower right.
 * Its one moving part is drawn here at rest, inside the box `loop` names, so
 * the picture is whole before the apps lay the moving sprite over it.
 *
 * By evening every colour goes through `dusk` (or `warm` for a lit window),
 * so `draw(true, …)` is the same picture at dusk. Nothing is random but the
 * generator the caller passes in, so a drawing is the same string every time.
 */
import { n, type Pt } from './svg.js';
import {
  VALLEY,
  bark,
  blobPath,
  bush,
  dusk,
  earthHouse,
  ellipsePath,
  fill,
  foliage,
  grownTree,
  kurdistanFlagAt,
  orchardTree,
  smoothPath,
  stroke,
  warm,
  type TreeShape,
  type ValleyLandmark,
} from './valley.js';

// ───────────────────────────────────────────────────────────── colours

/**
 * The few colours these landmarks need that the valley's palette does not
 * carry. Wood is its own three tones because benches, tables, crates and
 * posts are boxes like the houses; the rest are single things.
 */
const WOOD = { top: '#c08f5e', face: '#a06d43', side: '#7c5133' } as const;
/** A ripe grape on the teahouse vine. */
const GRAPE = '#6e4c86';
/** A pomegranate at the market, deeper than an apple. */
const POMEGRANATE = '#b3313f';
/** The lit top of a cut stone, a step above the valley's stone face. */
const STONE_TOP = '#f2eee3';
/** Tea in a glass, the deep amber of a strong brew. */
const TEA = '#b4452a';
/** A bale of straw, a warmer gold than the stubble it lies on so it stands out from the field. */
const HAY = { top: '#f4dc90', face: '#e3c06a', side: '#c69e4c' } as const;
/** A copper water jug: its face and its side in shade. */
const COPPER = { face: '#c97a3d', side: '#9a5326' } as const;
/** The dark of an opening in a basalt wall: the gate's passage and the arrow slits. */
const BASALT_DARK = '#34333b';
/** A walnut's bark, silvery grey and paler than the valley's other trunks, and its side in shade. */
const WALNUT_BARK = { face: '#b0a696', shade: '#8a8073' } as const;
/** A window lit by evening, the same warm the valley's own houses use (`earthHouse`). */
const LAMPLIGHT = '#f2c35c';

/** Every shadow is the meadow's own darker green, since the road lays its landmarks on the meadow. */
const GROUND = VALLEY.meadowShade;

// ───────────────────────────────────────────────────────────── brushes

/** A coordinate as written into a path: one decimal, as everywhere in the art. */
const f = (v: number): string => n(v);

/** A closed polygon through the points. */
const poly = (pts: readonly Pt[]): string => `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z`;

/** A polygon with its corners rounded off by `r`, for a painted plot of land that should not look ruled. */
function softPoly(pts: readonly Pt[], r: number): string {
  let d = '';
  pts.forEach((p, i) => {
    const toward = (q: Pt): Pt => {
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      return [p[0] + ((q[0] - p[0]) / len) * r, p[1] + ((q[1] - p[1]) / len) * r];
    };
    const a = toward(pts[(i + pts.length - 1) % pts.length]!);
    const b = toward(pts[(i + 1) % pts.length]!);
    d += `${i === 0 ? 'M' : 'L'}${f(a[0])} ${f(a[1])}Q${f(p[0])} ${f(p[1])} ${f(b[0])} ${f(b[1])}`;
  });
  return `${d}Z`;
}

/** A rectangle as a path, so several can share one element. */
const box = (x: number, y: number, w: number, h: number): string => `M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${f(-w)}Z`;

/** One form's three tones: its lit top, the face toward the viewer, and its side in shade. */
interface Tones {
  top: string;
  face: string;
  side: string;
}

/** A form's three tones, taken toward the dusk by evening. */
const tones = (top: string, face: string, side: string, dark: boolean): Tones => ({ top: dusk(top, dark), face: dusk(face, dark), side: dusk(side, dark) });

/**
 * A block seen a little from above, as the valley's houses are: its front
 * `w` × `h` standing on (x, y) at its lower left, its depth `d` going back
 * to the upper right (half as far up as across), so the right side is in
 * shade and the top is lit.
 */
function block(x: number, y: number, w: number, h: number, d: number, t: Tones): string {
  const up = d / 2;
  return (
    fill(poly([[x + w, y], [x + w + d, y - up], [x + w + d, y - h - up], [x + w, y - h]]), t.side) +
    fill(box(x, y - h, w, h), t.face) +
    fill(poly([[x, y - h], [x + d, y - h - up], [x + w + d, y - h - up], [x + w, y - h]]), t.top)
  );
}

/**
 * The flat shadow a block of that footprint casts to the lower right: its
 * foot pushed `len` across and a little over half that down, and joined back
 * to the block, which is drawn over it.
 */
function castShadow(x: number, y: number, w: number, d: number, len: number, colour: string): string {
  const up = d / 2;
  const dy = len * 0.5;
  return fill(poly([[x, y], [x + len, y + dy], [x + w + len, y + dy], [x + w + d + len, y - up + dy], [x + w + d, y - up], [x + d, y - up]]), colour);
}

/**
 * A kilim hung from its top edge, filling its 18 × 22 box as the moving
 * sprite does: a madder field with its turned edge in shade, two cream bands,
 * the saffron "eye" diamond with its indigo heart and a small eye either side
 * (the commonest mark of Kurdish flat weaves), and the wool fringe below.
 */
function kilim(x: number, y: number, dark: boolean): string {
  const cx = x + 8.5;
  const cy = y + 10.5;
  const eye = (ex: number, ey: number, rx: number, ry: number): string =>
    `M${f(ex)} ${f(ey - ry)}L${f(ex + rx)} ${f(ey)}L${f(ex)} ${f(ey + ry)}L${f(ex - rx)} ${f(ey)}Z`;
  let fringe = '';
  for (let k = 0; k < 6; k++) fringe += `M${f(x + 2.5 + k * 2.6)} ${f(y + 19.4)}v2`;
  return (
    stroke(fringe, dusk(VALLEY.woolShade, dark), 0.9) +
    fill(box(x + 1, y + 1, 16, 18.6), dusk(VALLEY.red, dark)) +
    fill(box(x + 14.4, y + 1, 2.6, 18.6), dusk(VALLEY.redDark, dark)) +
    fill(box(x + 1, y + 3.6, 13.4, 1.6) + box(x + 1, y + 15.8, 13.4, 1.6), dusk(VALLEY.cream, dark)) +
    fill(eye(cx, cy, 4.2, 5), dusk(VALLEY.gold, dark)) +
    fill(eye(cx, cy, 1.7, 2.1) + eye(x + 3.3, cy, 1.3, 1.6) + eye(x + 13.4, cy, 1.3, 1.6), dusk(VALLEY.indigo, dark))
  );
}

/**
 * Steam at rest over a samovar, in its 16 × 24 box: three soft puffs going up
 * from the box's foot. By evening it takes a little more of the dusk than a
 * solid thing would, because it is thin and the light comes through it.
 */
function steam(x: number, y: number, dark: boolean, random: () => number): string {
  const puffs =
    blobPath(x + 8, y + 19.5, 3.6, 3, 7, 0.2, random) + blobPath(x + 6.4, y + 12, 4.4, 3.6, 7, 0.2, random) + blobPath(x + 9, y + 4.6, 3.6, 3, 7, 0.2, random);
  return fill(puffs, dusk('#ffffff', dark, 0.3));
}

// ───────────────────────────────────────────────────────────── the landmarks

/** The first six chapters' landmarks, by name. */
/** Where the flag of Kurdistan flies over Amed's tower: its pole at x 71, the cloth the apps make stir laid exactly over the one drawn. */
const CITY_FLAG: ValleyLandmark['loop'] = { kind: 'colours', x: 71, y: 12, w: 20, h: 16 };

export const VALLEY_LANDMARKS_1: Record<'gate' | 'teahouse' | 'spring' | 'bazaar' | 'busstop' | 'citywall', ValleyLandmark> = {
  /**
   * Sêvan's blue gate: a low earth wall across the picture, the gate's pier
   * standing a little forward of it with the blue double door in its arch,
   * two flat-roofed houses behind (apricots drying on the taller one's
   * roof), an apricot tree over the wall, and a kilim hung on a post by the
   * gate to greet whoever comes up the road.
   */
  gate: {
    loop: { kind: 'kilim', x: 16, y: 61, w: 18, h: 22 },
    draw(dark, random) {
      const c = (hex: string): string => dusk(hex, dark);
      const ground = c(GROUND);
      const earth = tones(VALLEY.roof, VALLEY.wall, VALLEY.wallSide, dark);
      let out = '';
      // The far house goes down first so the near one overlaps it; the wall hides both their feet.
      out += earthHouse(66, 86, 30, 30, 12, { dark, ground, roofLine: VALLEY.fruit });
      out += earthHouse(20, 90, 30, 22, 12, { dark, ground });
      // The apricot over the wall forks into its limbs under the crown, and its fruit never runs together at phone size.
      out += grownTree({ ...orchardTree(97, 88, 0.9, -0.6, random), dot: 1.3 }, foliage(dark, VALLEY.fruit), bark(dark), ground, random);
      // The wall's shadow goes down before the wall, whose lit top reads as the walk along it.
      out += castShadow(6, 110, 94, 8, 9, ground);
      out += block(6, 110, 94, 20, 8, earth);
      // The gate's pier stands a step forward of the wall and above it, so the gate is the first thing seen.
      out += castShadow(42, 112, 32, 8, 9, ground);
      out += block(42, 112, 32, 34, 8, earth);
      out += stroke('M42 78h32l8 -4', c(VALLEY.parapet), 2);
      // The arch is a step darker than the two blue leaves set in it; each leaf has its brass knob.
      out += fill('M48 112V96A10 10 0 0 1 68 96V112Z', c(VALLEY.gateDark));
      out += fill('M50 112V97A8 8 0 0 1 58 89V112Z', c(VALLEY.gate));
      out += fill('M66 112V97A8 8 0 0 0 58 89V112Z', c(VALLEY.gateLight));
      out += fill(ellipsePath(56.2, 102, 0.9, 0.9) + ellipsePath(59.8, 102, 0.9, 0.9), c(VALLEY.gold));
      // The kilim hangs on its post by the gate, at rest where the moving sprite will lie.
      // the post's shadow: a thin sliver along the ground to the lower right, as every shadow in the valley falls
      out += fill('M14.2 111.4L21.4 114.2L22 113.2L15.8 110.8Z', ground);
      out += stroke('M15 112V60M14 61.4H36', c(VALLEY.trunk), 1.8);
      out += kilim(16, 61, dark);
      return out;
    },
  },

  /**
   * Hamo's teahouse: a long, low earth house, a vine over a wooden trellis
   * along its front with grapes hanging at the edge, a bench with a kilim
   * cushion in the vine's shade, and the red samovar on its little table at
   * the porch's edge, steam going up from its chimney.
   */
  teahouse: {
    loop: { kind: 'steam', x: 41, y: 66, w: 16, h: 24 },
    draw(dark, random) {
      const c = (hex: string): string => dusk(hex, dark);
      const ground = c(GROUND);
      const earth = tones(VALLEY.roof, VALLEY.wall, VALLEY.wallSide, dark);
      const wood = tones(WOOD.top, WOOD.face, WOOD.side, dark);
      const leaf = foliage(dark);
      let out = '';
      // The house stands behind; its door and window sit right of the vine, where they can be seen.
      out += castShadow(28, 96, 70, 12, 6, ground);
      out += block(28, 96, 70, 26, 12, earth);
      out += stroke('M28 70h70l12 -6', c(VALLEY.parapet), 2);
      out += fill('M80 96v-13a4.5 4.5 0 0 1 9 0v13Z', c(VALLEY.gate));
      out += fill(box(91.5, 78, 4, 6.4), dark ? warm(LAMPLIGHT, true) : VALLEY.window);
      // The vine's shade lies under the trellis; the back posts and the bench with its kilim cushion stand in it.
      out += fill(poly([[6, 111], [60, 111], [80, 101], [22, 101]]), ground);
      out += stroke('M22 102V77M76 102V77', c(WOOD.side), 1.8);
      out += block(10, 103, 26, 5, 5, wood);
      out += fill(poly([[11.5, 98], [34, 98], [36.5, 96.7], [14, 96.7]]) + box(11.5, 97.4, 22.5, 1.8), c(VALLEY.red));
      out += fill(box(15, 97.8, 2, 1.4) + box(22, 97.8, 2, 1.4) + box(29, 97.8, 2, 1.4), c(VALLEY.gold));
      // The front posts carry the trellis, the vine's old stem twists up the left one, and the beams' ends show either side.
      out += stroke('M6 111V85M58 111V85', c(WOOD.face), 2);
      out += stroke('M7 111C4 104 9 98 6 92C4 88 7 86 8 84', c(VALLEY.trunk), 1.6);
      out += stroke('M1.5 85H4M61 85H64', c(WOOD.top), 1.6);
      // The vine is one leafy roof rather than separate clusters, so it reads as a trellis and not as a row of bushes:
      // in shade along its hanging front, lit where it heaps up on top, with grapes hanging from its edge.
      const vine: Pt[] = [
        [3, 86], [11, 88.6], [19, 86.4], [28, 89], [38, 86.8], [47, 88.6], [56, 86.4], [63, 85], [71, 81.6], [79, 77.4],
        [80, 73.6], [72, 70.6], [62, 71.8], [52, 69.2], [40, 71.4], [30, 70], [20, 73], [11, 77.4], [4, 81.6],
      ];
      out += fill(smoothPath(vine.map(([x, y]) => [x + 1.4, y + 2.4] as Pt), true), leaf.shade);
      out += fill(smoothPath(vine, true), leaf.face);
      const lit = blobPath(27, 73.6, 9, 2.6, 8, 0.25, random) + blobPath(51, 72.4, 7, 2.2, 7, 0.25, random) + blobPath(12, 80, 4, 1.6, 6, 0.25, random);
      out += fill(lit, leaf.light);
      // three bunches hanging from the vine's edge, each of its own size and none quite like another
      const bunch = [[-2.4, -1.9], [0, -1.9], [2.4, -1.9], [-1.3, 0], [1.3, 0], [0, 2.1], [-1.2, 4]] as const;
      let grapes = '';
      for (const [gx, gy, count] of [[14, 87.5, 6], [33, 87, 7], [62, 85, 5]] as const) {
        for (const [dx, dy] of bunch.slice(0, count)) {
          const r = 1.1 + random() * 0.3;
          grapes += ellipsePath(gx + dx + (random() - 0.5) * 0.4, gy + dy, r, r);
        }
      }
      out += fill(grapes, c(GRAPE));
      // The table stands at the vine's edge, two glasses of tea on their saucers either side of the samovar.
      out += castShadow(38, 111, 20, 6, 5, ground);
      out += block(38, 111, 20, 8, 6, wood);
      const glasses = [[41.6, 102.2], [56.4, 101.2]] as const;
      out += fill(glasses.map(([x, y]) => ellipsePath(x, y, 2, 0.7)).join(''), c(VALLEY.cream));
      out += fill(glasses.map(([x, y]) => `M${f(x - 1)} ${f(y - 3)}h2l-.4 1.3l.4 1.5h-2l.4 -1.5Z`).join(''), c(TEA));
      out += fill(glasses.map(([x, y]) => box(x - 1, y - 3.7, 2, 0.8)).join(''), c(VALLEY.waterLight));
      // The samovar: a brass foot, the red body with its shade on the right, a brass band and tap, and the teapot warming on its crown;
      // half the height it was drawn at, so it stands on the table no taller than four of the glasses beside it.
      const cx = 48.5;
      let samovar = '';
      samovar += fill(`M${cx - 4.5} 101.6h9l-1.4 -2.6h-6.2Z`, c(VALLEY.gold));
      samovar += fill(`M${cx - 5} 99C${cx - 7.4} 94 ${cx - 7.4} 88 ${cx - 4.6} 84.4H${cx + 4.6}C${cx + 7.4} 88 ${cx + 7.4} 94 ${cx + 5} 99Z`, c(VALLEY.red));
      samovar += fill(
        `M${cx + 1.6} 84.4H${cx + 4.6}C${cx + 7.4} 88 ${cx + 7.4} 94 ${cx + 5} 99H${cx + 2.2}C${cx + 3.8} 94 ${cx + 3.8} 88 ${cx + 1.6} 84.4Z`,
        c(VALLEY.redDark),
      );
      samovar += fill(box(cx - 6.5, 91, 13, 1.5) + box(cx - 5, 82.8, 10, 1.8) + `M${cx - 6.6} 94h-3.2v1.5h1.3v1.5h1.9Z`, c(VALLEY.gold));
      const teapot = `M${cx - 3.6} 82.8c0 -2.8 1.6 -3.8 3.6 -3.8s3.6 1 3.6 3.8ZM${cx - 3.4} 81.4l-2.4 -1.6l.5 -.6l2.4 1Z`;
      samovar += fill(teapot + box(cx - 0.7, 77.8, 1.4, 1.4), c(VALLEY.cream));
      out += `<g transform="matrix(0.5 0 0 0.5 ${f(cx * 0.5)} ${f(101.6 * 0.5)})">${samovar}</g>`;
      out += steam(41, 66, dark, random);
      return out;
    },
  },

  /**
   * The village spring under the walnut: a stone wall with an arched niche
   * and a brass spout, water falling into a long stone trough and running
   * off from its far end, and the great walnut behind it all on its short
   * pale trunk, its limbs spreading into a crown that shades the spring.
   */
  spring: {
    loop: { kind: 'water', x: 41, y: 91, w: 30, h: 12 },
    draw(dark, random) {
      const c = (hex: string): string => dusk(hex, dark);
      const ground = c(GROUND);
      const stone = tones(STONE_TOP, VALLEY.stone, VALLEY.stoneSide, dark);
      let out = '';
      // The walnut's shade is one broad patch under the whole scene, since the spring stands in it.
      out += fill(blobPath(66, 105.6, 50, 8.6, 10, 0.12, random), ground);
      // The walnut: a short thick trunk that divides low into great limbs, each of them running up into the crown.
      const walnut: TreeShape = {
        foot: [93, 96],
        base: 13,
        fork: [91, 72],
        limbs: [
          { from: [91, 72], bend: [80, 62], to: [66, 50], width: 6.6 },
          { from: [91, 72], bend: [90, 56], to: [86, 40], width: 6.2 },
          { from: [91, 72], bend: [101, 62], to: [107, 50], width: 5.4 },
          { from: [84, 66], bend: [68, 60], to: [48, 56], width: 3.6 },
        ],
        lobes: [
          { x: 56, y: 48, rx: 23, ry: 14.4 },
          { x: 40, y: 55, rx: 15.6, ry: 10.4 },
          { x: 82, y: 33, rx: 22, ry: 16 },
          { x: 103.4, y: 46, rx: 12.6, ry: 11.6 },
          { x: 64, y: 30, rx: 14, ry: 10 },
        ],
        rough: 0.12,
        shadow: false,
      };
      out += grownTree(walnut, foliage(dark), { face: c(WALNUT_BARK.face), shade: c(WALNUT_BARK.shade) }, ground, random);
      // The spring's wall has a slab along its top, an arched niche, faint courses of stone, and the brass spout in the niche.
      out += block(36, 94, 40, 26, 8, stone);
      out += block(34, 69, 44, 3, 8, stone);
      out += stroke('M36 81.4H46M66 80.6H76M36 87.6H46.4M65.6 88.4H76', c(VALLEY.stoneSide), 0.7);
      out += fill('M47 94V78a9 9 0 0 1 18 0V94Z', c(VALLEY.stoneSide));
      out += stroke('M56 78v4', c(VALLEY.goldDark), 2.2);
      // The trough's rim is lit and its water holds one patch of sky; the water falls into it where the ripple sprite sits.
      out += block(24, 110, 62, 10, 16, stone);
      out += fill(poly([[28.5, 99], [39, 93.7], [84.5, 93.7], [74, 99]]), c(VALLEY.water));
      out += fill(poly([[34, 98], [40, 95], [52, 95], [46, 98]]), c(VALLEY.waterLight));
      out += stroke('M56 83C56 88 56 92 56 96.6', c(VALLEY.water), 2.4);
      out += stroke('M55.5 84v10', c(VALLEY.waterLight), 0.9);
      out += stroke(ellipsePath(56, 97, 8, 2.4), c(VALLEY.waterLight), 1.2);
      // What the trough cannot hold runs off from its far end in a little channel, darkening the ground it crosses.
      out += fill(blobPath(108.6, 112.2, 8.6, 2.2, 8, 0.2, random), c(VALLEY.greenShade));
      out += stroke('M101.4 107.6C104 110.2 107.6 111 113.4 112.4', c(VALLEY.water), 1.4);
      // A wet stone lies at the trough's foot.
      out += fill(ellipsePath(96.4, 111, 3.4, 2), c(VALLEY.stoneSide));
      out += fill(ellipsePath(95.8, 110.2, 2.6, 1.4), c(VALLEY.stone));
      // A copper jug waits by the trough to be filled, which also gives the scene its scale.
      out += fill(ellipsePath(18, 111, 6, 2), ground);
      out += stroke('M18.4 99.6c3.6 -.4 4.6 3.6 1.8 6', c(COPPER.side), 1.1);
      out += fill('M13.6 106.4c0 -3 1.6 -5 2.6 -5.6v-2.4h3.6v2.4c1 .6 2.6 2.6 2.6 5.6c0 2.6 -2 4.2 -4.4 4.2s-4.4 -1.6 -4.4 -4.2Z', c(COPPER.face));
      out += fill('M19.8 98.4v2.4c1 .6 2.6 2.6 2.6 5.6c0 2.6 -2 4.2 -4.4 4.2c1.2 -1 2 -2.4 2 -4.2c0 -3 -.6 -5 -1.6 -5.6v-2.4Z', c(COPPER.side));
      out += fill(ellipsePath(18, 98.4, 2.6, 0.8), c(COPPER.side));
      return out;
    },
  },

  /**
   * Market day: two stalls under striped awnings, one madder and cream, one
   * blue, their counters heaped with apples, apricots and pomegranates,
   * crates of fruit on the ground before them, and a kilim hung for sale on
   * its own frame.
   */
  bazaar: {
    loop: { kind: 'kilim', x: 95, y: 63, w: 18, h: 22 },
    draw(dark, random) {
      const c = (hex: string): string => dusk(hex, dark);
      const ground = c(GROUND);
      const wood = tones(WOOD.top, WOOD.face, WOOD.side, dark);
      let out = '';
      /**
       * A pile of round fruit on a counter or in a crate, heaped higher in the
       * middle: each fruit a little bigger or smaller than the next and not
       * quite in line, the shade on each, and a glint on some.
       */
      const heap = (x: number, y: number, w: number, colour: string, shade: string): string => {
        let face = '';
        let shaded = '';
        let glint = '';
        for (const [row, dy] of [[0, 0], [1, -2.5], [2, -4.8]] as const) {
          const count = Math.floor((w - row * 4.6) / 3.4);
          for (let k = 0; k < count; k++) {
            const r = 1.55 + random() * 0.45;
            const fx = x + 1.8 + row * 2.3 + k * 3.4 + (random() - 0.5) * 0.6;
            const fy = y + dy + (random() - 0.5) * 0.5;
            face += ellipsePath(fx, fy, r, r);
            shaded += `M${f(fx + r)} ${f(fy)}a${f(r)} ${f(r)} 0 0 1 ${f(-r)} ${f(r)}a${f(r * 1.3)} ${f(r * 1.3)} 0 0 0 ${f(r)} ${f(-r)}Z`;
            if (random() < 0.5) glint += ellipsePath(fx - r * 0.34, fy - r * 0.4, 0.5, 0.5);
          }
        }
        return fill(face, c(colour)) + fill(shaded, c(shade)) + fill(glint, c(VALLEY.cream));
      };
      /** A stall: its counter, its two front posts, and its awning, striped in two colours with the front flap a step darker. */
      const stall = (x: number, y: number, w: number, stripe: string, stripeShade: string): string => {
        let s = castShadow(x, y, w, 12, 9, ground);
        s += stroke(`M${f(x + 13)} ${f(y - 6)}V${f(y - 40)}M${f(x + w + 11)} ${f(y - 6)}V${f(y - 40)}`, c(WOOD.side), 1.8);
        s += block(x, y, w, 11, 12, wood);
        s += stroke(`M${f(x + 1)} ${f(y)}V${f(y - 33)}M${f(x + w - 1)} ${f(y)}V${f(y - 33)}`, c(WOOD.face), 1.8);
        // The awning's top slopes down to the front in stripes; both colours share a path each, to keep the elements few.
        const top = y - 33;
        const back = y - 44;
        const stripes = 6;
        let a = '';
        let b = '';
        for (let k = 0; k < stripes; k++) {
          const u0 = (k / stripes) * (w + 4) - 2;
          const u1 = ((k + 1) / stripes) * (w + 4) - 2;
          const p = poly([[x + u0, top], [x + u1, top], [x + u1 + 14, back], [x + u0 + 14, back]]);
          if (k % 2 === 0) a += p;
          else b += p;
        }
        s += fill(a, c(stripe)) + fill(b, c(VALLEY.cream));
        // The front flap is scalloped and a step darker, being the awning's face toward the viewer.
        let fa = '';
        let fb = '';
        for (let k = 0; k < stripes; k++) {
          const u0 = (k / stripes) * (w + 4) - 2;
          const u1 = ((k + 1) / stripes) * (w + 4) - 2;
          const mid = (u0 + u1) / 2;
          const p = `M${f(x + u0)} ${f(top)}h${f(u1 - u0)}v3Q${f(x + mid)} ${f(top + 6.4)} ${f(x + u0)} ${f(top + 3)}Z`;
          if (k % 2 === 0) fa += p;
          else fb += p;
        }
        s += fill(fa, c(stripeShade)) + fill(fb, c(VALLEY.woolShade));
        return s;
      };
      out += stall(6, 96, 40, VALLEY.gate, VALLEY.gateDark);
      out += heap(9, 82, 16, VALLEY.apple, VALLEY.redDark) + heap(28, 82, 14, VALLEY.fruit, VALLEY.goldDark);
      out += stall(44, 108, 40, VALLEY.red, VALLEY.redDark);
      out += heap(47, 94, 18, POMEGRANATE, VALLEY.redDark) + heap(67, 94, 14, VALLEY.leafLight, VALLEY.leaf);
      // Crates of apples and apricots stand on the ground before the first stall.
      out += castShadow(8, 112, 14, 6, 5, ground) + block(8, 112, 14, 7, 6, wood) + heap(9.5, 103.6, 13, VALLEY.apple, VALLEY.redDark);
      out += castShadow(24, 113, 12, 6, 5, ground) + block(24, 113, 12, 7, 6, wood) + heap(25, 104.6, 12, VALLEY.fruit, VALLEY.goldDark);
      // The kilim for sale hangs on its own frame, at rest where the moving sprite will lie.
      // each post's shadow a thin sliver on the ground to the lower right
      out += fill('M93.2 107.4L99.4 110.2L100 109.2L94.8 106.8Z' + 'M113.2 105.4L117.4 107.4L118 106.4L114.8 104.8Z', ground);
      out += stroke('M94 108V62M114 106V62M93 63.4H115', c(VALLEY.trunk), 1.8);
      out += kilim(95, 63, dark);
      return out;
    },
  },

  /**
   * The bus stop on the road out of the village: a little shelter with a
   * blue roof and a wooden bench, its concrete apron, the round sign hanging
   * from its post's arm, a white milestone with its red cap, and the
   * stubble of the cut wheat behind with a few bales still in it. On a page
   * of its own colour (the book's chapter opener and its stamp) the field,
   * its bales and the milestone belong to land that is not there: the
   * shelter stands alone, with its bench and its sign.
   */
  busstop: {
    loop: { kind: 'sign', x: 16, y: 50, w: 18, h: 26 },
    draw(dark, _random, page = false) {
      const c = (hex: string): string => dusk(hex, dark);
      const ground = c(GROUND);
      const stone = tones(STONE_TOP, VALLEY.stone, VALLEY.stoneSide, dark);
      const blue = tones(VALLEY.gateLight, VALLEY.gate, VALLEY.gateDark, dark);
      const wood = tones(WOOD.top, WOOD.face, WOOD.side, dark);
      const straw = tones(HAY.top, HAY.face, HAY.side, dark);
      let out = '';
      if (!page) {
        // The stubble field lies behind, as the preview's terraces do: a step of shade along its front, its face, the rows of cut stalks.
        const field = (dy: number): string => softPoly([[4, 77 + dy], [72, 77 + dy], [114, 56 + dy], [46, 56 + dy]], 5);
        out += fill(field(3), c(VALLEY.wheatShade)) + fill(field(0), c(VALLEY.wheat));
        let rows = '';
        for (const y of [60.2, 64.4, 68.6, 72.8]) {
          const x0 = 4 + (77 - y) * 2 + 5;
          const x1 = 72 + (77 - y) * 2 - 5;
          rows += smoothPath([[x0, y], [(x0 + x1) / 2, y + 0.7], [x1, y]]);
        }
        out += stroke(rows, c(VALLEY.furrowWheat), 1.2);
        // the bales lie where the baler dropped them, no two quite the same
        out += block(60, 63, 10, 5.4, 5, straw) + block(89, 61.4, 8, 4.6, 4.4, straw) + block(29, 73.4, 9.4, 5, 5.4, straw);
      }
      // The shelter's shadow falls on its concrete apron, so it is the concrete's own darker edge colour.
      out += fill(poly([[34, 108], [94, 108], [108, 101], [48, 101]]), c(VALLEY.path));
      out += fill(box(34, 108, 60, 2), c(VALLEY.pathEdge));
      out += fill(poly([[90, 104], [96, 107], [108, 101], [102, 98]]), c(VALLEY.pathEdge));
      // The back wall is in the roof's shade; the bench stands against it between the two side walls.
      out += fill(box(52, 72, 50, 26), c(VALLEY.stoneSide));
      out += block(52, 100, 38, 4, 5, wood);
      out += block(40, 104, 3, 26, 12, stone);
      out += block(87, 104, 3, 26, 12, stone);
      // The roof is the gate's blue, the village's colour, carried out to the road.
      out += block(36, 80, 60, 4, 18, blue);
      if (!page) {
        // The milestone is white with its red cap, as the road's stones are.
        out += castShadow(100, 114, 6, 4, 4, ground);
        out += block(100, 114, 6, 7, 4, stone);
        const cap = poly([[100, 107], [106, 107], [106, 104.6], [103, 103.2], [100, 104.6]]) + poly([[106, 107], [110, 105], [110, 102.6], [106, 104.6]]);
        out += fill(cap, c(VALLEY.red));
      }
      // The sign hangs from its post's arm, so the moving sprite can swing it; here it hangs still.
      out += fill('M13.2 111.4L20.4 114.2L21 113.2L14.8 110.8Z', ground);
      out += stroke('M14 112V50.5H25', c(VALLEY.basaltLight), 2);
      out += stroke('M25 51v4', c(VALLEY.basaltLight), 1.4);
      out += fill(ellipsePath(25, 64, 8, 8), c(VALLEY.gateDark));
      out += fill(ellipsePath(24.4, 63.4, 7.2, 7.2), c(VALLEY.gate));
      // A little bus seen from its side says what the sign is without any words.
      out += fill('M19.5 66.4v-5.4c0 -1 .7 -1.6 1.6 -1.6h8.2c1.2 0 2 1 2.2 2.2l.6 4.8Z', c('#ffffff'));
      const windows = box(21, 61, 2.4, 2) + box(24.4, 61, 2.4, 2) + box(27.8, 61, 2.6, 2);
      out += fill(windows + ellipsePath(22, 66.6, 1.2, 1.2) + ellipsePath(29, 66.6, 1.2, 1.2), c(VALLEY.gateDark));
      return out;
    },
  },

  /**
   * Amed: a stretch of Diyarbakır's black basalt walls, crenellated, with
   * a round tower standing forward of them, arrow slits in its face, a gate
   * in the wall with its old wooden doors, and the flag of Kurdistan flying
   * from the tower.
   */
  citywall: {
    loop: CITY_FLAG,
    draw(dark, random) {
      const c = (hex: string): string => dusk(hex, dark);
      const ground = c(GROUND);
      const basalt = tones(VALLEY.basaltLight, VALLEY.basalt, VALLEY.basaltSide, dark);
      let out = '';
      /** A row of merlons standing on a wall's front edge from x0 to x1 at height y, each a little block. */
      const merlons = (x0: number, x1: number, y: number, d: number): string => {
        let faces = '';
        let tops = '';
        let sides = '';
        for (let x = x0; x + 4 <= x1 + 0.1; x += 7) {
          faces += box(x, y - 5, 4, 5);
          tops += poly([[x, y - 5], [x + d, y - 5 - d / 2], [x + 4 + d, y - 5 - d / 2], [x + 4, y - 5]]);
          sides += poly([[x + 4, y], [x + 4 + d, y - d / 2], [x + 4 + d, y - 5 - d / 2], [x + 4, y - 5]]);
        }
        return fill(sides, basalt.side) + fill(faces, basalt.face) + fill(tops, basalt.top);
      };
      // The curtain walls stand either side of the tower, each shadow going down before its wall.
      out += castShadow(4, 108, 56, 10, 10, ground);
      out += block(4, 108, 56, 30, 10, basalt);
      out += merlons(4, 60, 78, 3);
      out += castShadow(86, 106, 18, 8, 5, ground);
      out += block(86, 106, 18, 28, 8, basalt);
      out += merlons(87, 104, 78, 3);
      // The gate in the left wall: the dark passage and its old wooden doors, the one warm thing in the basalt.
      out += fill('M18 108V96a7 7 0 0 1 14 0V108Z', c(BASALT_DARK));
      out += fill('M20 108V96.4a5 5 0 0 1 10 0V108Z', c(WOOD.side));
      out += stroke('M25 91.6V108', c(BASALT_DARK), 0.8);
      // The stone courses are faint lines only, enough to read as masonry without busying the wall.
      out += stroke('M4 88H18M32 88H60M4 98H18M32 98H60M86 90H104', c(VALLEY.basaltSide), 0.8);
      // The round tower stands forward of the walls: its shadow, its body with the shaded side, and its arrow slits.
      const cx = 70;
      const r = 16;
      const topY = 40;
      const foot = 106;
      const sideFoot = foot + (r / 2) * Math.sqrt(1 - (6 / r) ** 2);
      out += fill(ellipsePath(cx + 9, foot + 4, r + 5, 5.5), ground);
      out += fill(`M${cx - r} ${topY}V${foot}a${r} ${r / 2} 0 0 0 ${2 * r} 0V${topY}Z`, basalt.face);
      out += fill(`M${cx + 6} ${topY}V${f(sideFoot)}A${r} ${r / 2} 0 0 0 ${cx + r} ${foot}V${topY}Z`, basalt.side);
      out += stroke(`M${cx - r} 60a${r} ${r / 2} 0 0 0 ${2 * r} 0M${cx - r} 80a${r} ${r / 2} 0 0 0 ${2 * r} 0`, c(VALLEY.basaltSide), 0.8);
      out += fill(box(cx - 9, 60, 2, 7) + box(cx - 1, 74, 2, 7) + box(cx - 9, 88, 2, 7), c(BASALT_DARK));
      // On top, the parapet's lit walk rings the floor; the back merlons stand over the floor and the front ones on the rim.
      out += fill(ellipsePath(cx, topY, r, r / 2), basalt.top);
      out += fill(ellipsePath(cx, topY + 0.8, r - 3.6, r / 2 - 2.2), c(VALLEY.basaltSide));
      let back = '';
      let front = '';
      let side = '';
      for (const a of [0.22, 0.5, 0.78]) back += box(cx - (r - 1.6) * Math.cos(a * Math.PI) - 2, topY - (r / 2 - 0.8) * Math.sin(a * Math.PI) - 4.4, 4, 4.4);
      for (const a of [0.06, 0.28, 0.5, 0.72, 0.94]) {
        const x = cx - r * Math.cos(a * Math.PI);
        const y = topY + (r / 2) * Math.sin(a * Math.PI);
        const p = box(x - 2.3, y - 5, 4.6, 5);
        if (x > cx + 5) side += p;
        else front += p;
      }
      out += fill(back, basalt.face) + fill(front, basalt.face) + fill(side, basalt.side);
      // The flag of Kurdistan on its pole from the tower's floor, a gold knob at its top, the very cloth the apps make stir over it.
      out += stroke('M71 42V12', c(VALLEY.hoof), 1.4);
      out += fill(ellipsePath(71, 11, 1.4, 1.4), c(VALLEY.gold));
      out += kurdistanFlagAt(CITY_FLAG, dark);
      // Two bushes stand for the gardens below the walls and soften the foot of the basalt.
      out += bush(10, 112, 0.8, foliage(dark), ground, random);
      out += bush(106, 111, 0.6, foliage(dark), ground, random);
      return out;
    },
  },
};
