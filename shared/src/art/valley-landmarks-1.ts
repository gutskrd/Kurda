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
 * Deterministic: every colour goes through `dusk` (or `warm` for what is
 * lit), and any scatter comes from the generator the caller passes in.
 */
import { n, type Pt } from './svg.js';
import { VALLEY, blobPath, bush, dusk, earthHouse, ellipsePath, fill, foliage, poplar, poplarLeaves, roundTree, smoothPath, stroke, warm, type ValleyLandmark } from './valley.js';

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
/** The dark of an opening in a basalt wall: the gate's passage and the arrow slits. */
const BASALT_DARK = '#34333b';

/** Where every shadow falls: the meadow the road runs through. */
const GROUND = VALLEY.meadowShade;

// ───────────────────────────────────────────────────────────── brushes

const f = (v: number): string => n(v);

/** A closed polygon through the points. */
const poly = (pts: readonly Pt[]): string => `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z`;

/** A rectangle as a path, so several can share one element. */
const box = (x: number, y: number, w: number, h: number): string => `M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${f(-w)}Z`;

/** One form's three tones: its lit top, the face toward the viewer, and its side in shade. */
interface Tones {
  top: string;
  face: string;
  side: string;
}

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
  const eye = (ex: number, ey: number, rx: number, ry: number): string => `M${f(ex)} ${f(ey - ry)}L${f(ex + rx)} ${f(ey)}L${f(ex)} ${f(ey + ry)}L${f(ex - rx)} ${f(ey)}Z`;
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

/** Steam at rest over a samovar, in its 16 × 24 box: three soft puffs going up from the box's foot. */
function steam(x: number, y: number, dark: boolean, random: () => number): string {
  const puffs = blobPath(x + 8, y + 19.5, 3.6, 3, 7, 0.2, random) + blobPath(x + 6.4, y + 12, 4.4, 3.6, 7, 0.2, random) + blobPath(x + 9, y + 4.6, 3.6, 3, 7, 0.2, random);
  return fill(puffs, dusk('#ffffff', dark, 0.3));
}

// ───────────────────────────────────────────────────────────── the landmarks

/** The first six chapters' landmarks, by name. */
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
      // the houses behind the wall, the far one first
      out += earthHouse(66, 86, 30, 30, 12, { dark, ground, roofLine: VALLEY.fruit });
      out += earthHouse(20, 90, 30, 22, 12, { dark, ground });
      out += roundTree(104, 92, 0.82, foliage(dark, VALLEY.fruit), ground, random);
      // the wall, its walk lit along the top, and its shadow on the meadow
      out += castShadow(6, 110, 94, 8, 9, ground);
      out += block(6, 110, 94, 20, 8, earth);
      // the gate's pier, standing a step forward of the wall
      out += castShadow(42, 112, 32, 8, 9, ground);
      out += block(42, 112, 32, 34, 8, earth);
      out += stroke(`M42 78h32l8 -4`, c(VALLEY.parapet), 2);
      // the arch and its two blue leaves, each with its knob of brass
      out += fill('M48 112V96A10 10 0 0 1 68 96V112Z', c(VALLEY.gateDark));
      out += fill('M50 112V97A8 8 0 0 1 58 89V112Z', c(VALLEY.gate));
      out += fill('M66 112V97A8 8 0 0 0 58 89V112Z', c(VALLEY.gateLight));
      out += fill(ellipsePath(56.2, 102, 0.9, 0.9) + ellipsePath(59.8, 102, 0.9, 0.9), c(VALLEY.gold));
      // the kilim on its post by the gate
      out += stroke('M15 112l7 3', ground, 2.4);
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
    loop: { kind: 'steam', x: 41, y: 54, w: 16, h: 24 },
    draw(dark, random) {
      const c = (hex: string): string => dusk(hex, dark);
      const ground = c(GROUND);
      const earth = tones(VALLEY.roof, VALLEY.wall, VALLEY.wallSide, dark);
      const wood = tones(WOOD.top, WOOD.face, WOOD.side, dark);
      const leaf = foliage(dark);
      let out = '';
      // the house behind, its door and its window to the right of the vine
      out += castShadow(28, 96, 70, 12, 6, ground);
      out += block(28, 96, 70, 26, 12, earth);
      out += stroke('M28 70h70l12 -6', c(VALLEY.parapet), 2);
      out += fill('M80 96v-13a4.5 4.5 0 0 1 9 0v13Z', c(VALLEY.gate));
      out += fill(box(91.5, 78, 4, 6.4), dark ? warm('#f2c35c', true) : VALLEY.window);
      // the shade under the vine, the back posts, and the bench in that shade with its kilim cushion
      out += fill(poly([[6, 111], [60, 111], [80, 101], [22, 101]]), ground);
      out += stroke('M22 102V77M76 102V77', c(WOOD.side), 1.8);
      out += block(26, 103, 30, 5, 5, wood);
      out += fill(poly([[27.5, 98], [52, 98], [54.5, 96.7], [30, 96.7]]) + box(27.5, 97.4, 24.5, 1.8), c(VALLEY.red));
      out += fill(box(31, 97.8, 2, 1.4) + box(38.5, 97.8, 2, 1.4) + box(46, 97.8, 2, 1.4), c(VALLEY.gold));
      // the front posts, the vine's old stem twisting up the left one, and the trellis's laths
      out += stroke('M6 111V85M58 111V85', c(WOOD.face), 2);
      out += stroke('M7 111C4 104 9 98 6 92C4 88 7 86 8 84', c(VALLEY.trunk), 1.6);
      out += stroke('M5 85H60M21 77H77M6 85L22 77M24 85L40 77M42 85L58 77M60 85L76 77', c(WOOD.top), 1.4);
      // the vine over the trellis: clusters of leaves, in shade at their foot, lit on top, gaps between
      const clusters = [[12, 81, 9], [27, 80, 9], [42, 80, 9], [56, 79, 8], [68, 76, 7], [34, 74, 9], [52, 73, 8]] as const;
      let shade = '';
      let face = '';
      for (const [x, y, r] of clusters) {
        shade += blobPath(x + 1, y + 2, r, r * 0.55, 8, 0.3, random);
        face += blobPath(x - 0.6, y, r * 0.86, r * 0.46, 8, 0.3, random);
      }
      out += fill(shade + blobPath(20, 87.5, 3, 2.4, 6, 0.3, random) + blobPath(48, 87, 3, 2.4, 6, 0.3, random), leaf.shade);
      out += fill(face, leaf.face);
      out += fill(blobPath(28, 72, 7, 2.6, 7, 0.3, random) + blobPath(48, 71.4, 6, 2.2, 7, 0.3, random) + blobPath(13, 79, 4.4, 2, 6, 0.3, random), leaf.light);
      let grapes = '';
      for (const [gx, gy] of [[14, 87.5], [33, 87], [62, 85]] as const) {
        for (const [dx, dy] of [[-1.3, 0], [1.3, 0], [0, 2.1], [-2.4, -1.9], [0, -1.9], [2.4, -1.9]] as const) grapes += ellipsePath(gx + dx, gy + dy, 1.25, 1.25);
      }
      out += fill(grapes, c(GRAPE));
      // the table at the vine's edge, two glasses of tea on it
      out += castShadow(38, 111, 20, 6, 5, ground);
      out += block(38, 111, 20, 8, 6, wood);
      out += fill(box(40.6, 99.6, 1.7, 2.8) + box(55.4, 98.4, 1.7, 2.8), c(TEA));
      // the samovar: brass foot, red body with its shade on the right, brass band and tap, the teapot warming on its crown
      const cx = 48.5;
      out += fill(`M${cx - 4.5} 101.6h9l-1.4 -2.6h-6.2Z`, c(VALLEY.gold));
      out += fill(`M${cx - 5} 99C${cx - 7.4} 94 ${cx - 7.4} 88 ${cx - 4.6} 84.4H${cx + 4.6}C${cx + 7.4} 88 ${cx + 7.4} 94 ${cx + 5} 99Z`, c(VALLEY.red));
      out += fill(`M${cx + 1.6} 84.4H${cx + 4.6}C${cx + 7.4} 88 ${cx + 7.4} 94 ${cx + 5} 99H${cx + 2.2}C${cx + 3.8} 94 ${cx + 3.8} 88 ${cx + 1.6} 84.4Z`, c(VALLEY.redDark));
      out += fill(box(cx - 6.5, 91, 13, 1.5) + box(cx - 5, 82.8, 10, 1.8) + `M${cx - 6.6} 94h-3.2v1.5h1.3v1.5h1.9Z`, c(VALLEY.gold));
      out += fill(`M${cx - 3.6} 82.8c0 -2.8 1.6 -3.8 3.6 -3.8s3.6 1 3.6 3.8ZM${cx - 3.4} 81.4l-2.4 -1.6l.5 -.6l2.4 1Z` + box(cx - 0.7, 77.8, 1.4, 1.4), c(VALLEY.cream));
      out += steam(41, 54, dark, random);
      return out;
    },
  },

  /**
   * The village spring under the walnut: a stone wall with an arched niche
   * and a brass spout, water falling into a long stone trough, and the great
   * walnut spreading over it all, its shade a cool patch round the trough.
   */
  spring: {
    loop: { kind: 'water', x: 41, y: 91, w: 30, h: 12 },
    draw(dark, random) {
      const c = (hex: string): string => dusk(hex, dark);
      const ground = c(GROUND);
      const stone = tones(STONE_TOP, VALLEY.stone, VALLEY.stoneSide, dark);
      const leaf = foliage(dark);
      let out = '';
      // the walnut's shade on the meadow and its trunk
      out += fill(blobPath(72, 104, 46, 11, 10, 0.12, random), ground);
      out += fill('M86 96l2 -26c-4 -6 -10 -8 -14 -10l2 -2c5 2 9 4 13 8c2 -6 6 -10 10 -12l2 2c-4 3 -7 7 -8 12l1 28Z', c(VALLEY.trunk));
      // the crown: its shade, its face, the light on its upper left
      out += fill(blobPath(64, 36, 52, 27, 12, 0.14, random), leaf.shade);
      out += fill(blobPath(60, 33, 47, 23, 12, 0.14, random), leaf.face);
      out += fill(blobPath(44, 24, 22, 11, 9, 0.2, random) + blobPath(76, 20, 12, 6, 7, 0.25, random), leaf.light);
      // the fountain's wall with its arched niche and the spout
      out += block(36, 94, 40, 26, 8, stone);
      out += fill('M47 94V78a9 9 0 0 1 18 0V94Z', c(VALLEY.stoneSide));
      out += stroke('M56 78v4', c(VALLEY.goldDark), 2.2);
      // the trough, its rim lit, the water in it, and the falling water
      out += block(24, 110, 62, 10, 16, stone);
      out += fill(poly([[28.5, 99], [39, 93.7], [84.5, 93.7], [74, 99]]), c(VALLEY.water));
      out += fill(poly([[34, 98], [40, 95], [52, 95], [46, 98]]), c(VALLEY.waterLight));
      out += stroke('M56 83C56 88 56 92 56 96.6', c(VALLEY.water), 2.4);
      out += stroke('M55.5 84v10', c(VALLEY.waterLight), 0.9);
      out += stroke(ellipsePath(56, 97, 8, 2.4), c(VALLEY.waterLight), 1.2);
      // a few wet stones and flowers at the trough's foot
      out += fill(ellipsePath(16, 108, 4, 2.4) + ellipsePath(100, 110, 3.4, 2), c(VALLEY.stoneSide));
      out += fill(ellipsePath(15, 107, 3, 1.6) + ellipsePath(99.4, 109.2, 2.6, 1.4), c(VALLEY.stone));
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
      /** A pile of round fruit on a counter or in a crate: the fruit, the shade on each, and one glint. */
      const heap = (x: number, y: number, w: number, colour: string, shade: string): string => {
        let face = '';
        let dark2 = '';
        let glint = '';
        const rows = [[0, 0], [1, -2.6]] as const;
        for (const [row, dy] of rows) {
          const count = Math.floor((w - row * 3) / 3.4);
          for (let k = 0; k < count; k++) {
            const fx = x + 1.8 + row * 1.7 + k * 3.4 + (random() - 0.5) * 0.4;
            const fy = y + dy;
            face += ellipsePath(fx, fy, 1.8, 1.8);
            dark2 += `M${f(fx + 1.8)} ${f(fy)}a1.8 1.8 0 0 1 -1.8 1.8a2.4 2.4 0 0 0 1.8 -1.8Z`;
            if (row === 1 || k % 2 === 0) glint += ellipsePath(fx - 0.6, fy - 0.7, 0.5, 0.5);
          }
        }
        return fill(face, c(colour)) + fill(dark2, c(shade)) + fill(glint, c(VALLEY.cream));
      };
      /** A stall: its counter, its two front posts, and its awning, striped in two colours with the front flap a step darker. */
      const stall = (x: number, y: number, w: number, stripe: string, stripeShade: string): string => {
        let s = castShadow(x, y, w, 12, 9, ground);
        s += stroke(`M${f(x + 13)} ${f(y - 6)}V${f(y - 40)}M${f(x + w + 11)} ${f(y - 6)}V${f(y - 40)}`, c(WOOD.side), 1.8);
        s += block(x, y, w, 11, 12, wood);
        s += stroke(`M${f(x + 1)} ${f(y)}V${f(y - 33)}M${f(x + w - 1)} ${f(y)}V${f(y - 33)}`, c(WOOD.face), 1.8);
        // the awning's top, sloping down to the front, in stripes
        const top = y - 33;
        const back = y - 44;
        const n2 = 6;
        let a = '';
        let b = '';
        for (let k = 0; k < n2; k++) {
          const u0 = (k / n2) * (w + 4) - 2;
          const u1 = ((k + 1) / n2) * (w + 4) - 2;
          const p = poly([[x + u0, top], [x + u1, top], [x + u1 + 14, back], [x + u0 + 14, back]]);
          if (k % 2 === 0) a += p;
          else b += p;
        }
        s += fill(a, c(stripe)) + fill(b, c(VALLEY.cream));
        // the front flap, scalloped
        let fa = '';
        let fb = '';
        for (let k = 0; k < n2; k++) {
          const u0 = (k / n2) * (w + 4) - 2;
          const u1 = ((k + 1) / n2) * (w + 4) - 2;
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
      out += heap(47, 94, 18, POMEGRANATE, VALLEY.redDark) + heap(67, 94, 14, VALLEY.green, VALLEY.greenShade);
      // crates on the ground before the first stall
      out += castShadow(8, 112, 14, 6, 5, ground) + block(8, 112, 14, 7, 6, wood) + heap(9.5, 103.6, 13, VALLEY.apple, VALLEY.redDark);
      out += castShadow(24, 113, 12, 6, 5, ground) + block(24, 113, 12, 7, 6, wood) + heap(25, 104.6, 12, VALLEY.fruit, VALLEY.goldDark);
      // the kilim for sale on its frame
      out += stroke('M94 108l6 3M114 106l5 2.5', ground, 2.4);
      out += stroke('M94 108V62M114 106V62M93 63.4H115', c(VALLEY.trunk), 1.8);
      out += kilim(95, 63, dark);
      return out;
    },
  },

  /**
   * The bus stop on the road out of the village: a little shelter with a
   * blue roof and a wooden bench, its concrete apron, the round sign hanging
   * from its post's arm, a white milestone with its red cap, and the
   * stubble of the cut wheat behind with a few bales still in it.
   */
  busstop: {
    loop: { kind: 'sign', x: 16, y: 50, w: 18, h: 26 },
    draw(dark, random) {
      const c = (hex: string): string => dusk(hex, dark);
      const ground = c(GROUND);
      const stone = tones(STONE_TOP, VALLEY.stone, VALLEY.stoneSide, dark);
      const blue = tones(VALLEY.gateLight, VALLEY.gate, VALLEY.gateDark, dark);
      const wood = tones(WOOD.top, WOOD.face, WOOD.side, dark);
      const straw = tones(VALLEY.goldLight, VALLEY.wheat, VALLEY.wheatShade, dark);
      let out = '';
      // the stubble field behind, its step of shade at the foot, the rows of cut stalks
      out += fill(smoothPath([[4, 70], [40, 58], [92, 52], [116, 56], [116, 84], [70, 86], [4, 92]], true), c(VALLEY.wheatShade));
      out += fill(smoothPath([[4, 67], [40, 55], [92, 49], [116, 53], [116, 80], [70, 82], [4, 88]], true), c(VALLEY.wheat));
      let rows = '';
      for (let r = 0; r < 4; r++) rows += smoothPath([[10, 72 + r * 4.4 - 4], [50, 63 + r * 4.6], [108, 58 + r * 5]]);
      out += `<path d="${rows}" fill="none" stroke="${c(VALLEY.furrowWheat)}" stroke-width="1.4" stroke-dasharray="1.4 2.6" stroke-linecap="round"/>`;
      out += block(84, 62, 8, 5, 5, straw) + block(98, 66, 8, 5, 5, straw);
      // the apron and the shelter's shadow
      out += fill(poly([[34, 110], [96, 110], [110, 103], [48, 103]]) + poly([[48, 103], [110, 103], [114, 96], [52, 96]]), ground);
      out += fill(poly([[34, 108], [92, 108], [106, 101], [48, 101]]), c(VALLEY.path));
      out += fill(poly([[34, 108], [92, 108], [92, 110], [34, 110]]), c(VALLEY.pathEdge));
      // the back wall in the roof's shade, the side wall, the bench
      out += fill(box(52, 76, 50, 26), c(VALLEY.stoneSide));
      out += block(40, 104, 4, 26, 12, stone);
      out += block(86, 104, 4, 26, 12, stone);
      out += block(52, 100, 36, 4, 6, wood);
      // the blue roof over it all
      out += block(36, 80, 58, 3, 18, blue);
      // the milestone, white with its red cap
      out += castShadow(100, 114, 6, 4, 4, ground);
      out += block(100, 114, 6, 7, 4, stone);
      out += fill(poly([[100, 107], [106, 107], [106, 104.6], [103, 103.2], [100, 104.6]]) + poly([[106, 107], [110, 105], [110, 102.6], [106, 104.6]]), c(VALLEY.red));
      // the sign's post with its arm, and the sign hanging still
      out += stroke('M14 112l7 3', ground, 2.4);
      out += stroke('M14 112V50.5H25', c(VALLEY.basaltLight), 2);
      out += stroke('M25 51v4', c(VALLEY.basaltLight), 1.4);
      out += fill(ellipsePath(25, 64, 8, 8), c(VALLEY.gateDark));
      out += fill(ellipsePath(24.4, 63.4, 7.2, 7.2), c(VALLEY.gate));
      // a little bus on the sign, seen from its side
      out += fill('M19.5 66.4v-5.4c0 -1 .7 -1.6 1.6 -1.6h8.2c1.2 0 2 1 2.2 2.2l.6 4.8Z', c('#ffffff'));
      out += fill(box(21, 61, 2.4, 2) + box(24.4, 61, 2.4, 2) + box(27.8, 61, 2.6, 2) + ellipsePath(22, 66.6, 1.2, 1.2) + ellipsePath(29, 66.6, 1.2, 1.2), c(VALLEY.gateDark));
      return out;
    },
  },

  /**
   * Amed: a stretch of Diyarbakır's black basalt walls, crenellated, with
   * a round tower standing forward of them, arrow slits in its face, a gate
   * in the wall with its old wooden doors, and a flag on the tower.
   */
  citywall: {
    loop: { kind: 'flag', x: 71, y: 12, w: 20, h: 16 },
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
      // the curtain walls either side, their shadows first
      out += castShadow(4, 108, 56, 10, 10, ground);
      out += block(4, 108, 56, 30, 10, basalt);
      out += merlons(4, 60, 78, 3);
      out += castShadow(84, 106, 22, 10, 9, ground);
      out += block(84, 106, 22, 28, 10, basalt);
      out += merlons(85, 106, 78, 3);
      // the gate in the left wall: the dark passage and its doors
      out += fill('M18 108V96a7 7 0 0 1 14 0V108Z', c(BASALT_DARK));
      out += fill('M20 108V96.4a5 5 0 0 1 10 0V108Z', c(WOOD.side));
      out += stroke('M25 91.6V108', c(BASALT_DARK), 0.8);
      // the courses of the wall's stones, faint
      out += stroke('M4 88H18M32 88H60M4 98H18M32 98H60M84 90H106', c(VALLEY.basaltSide), 0.8);
      // the round tower: its shadow, its body with the shaded side, its lit platform and its crown of merlons
      const cx = 70;
      const r = 16;
      const topY = 40;
      out += fill(ellipsePath(cx + 10, 113, r + 4, 5), ground);
      out += fill(`M${cx - r} ${topY}V112a${r} ${r / 2} 0 0 0 ${2 * r} 0V${topY}Z`, basalt.face);
      out += fill(`M${cx + 6} ${topY}V${f(112 + (r / 2) * Math.sqrt(1 - (6 / r) ** 2))}a${r} ${r / 2} 0 0 0 ${r - 6} ${f(-(r / 2) * Math.sqrt(1 - (6 / r) ** 2))}V${topY}Z`, basalt.side);
      out += stroke(`M${cx - r} 62a${r} ${r / 2} 0 0 0 ${2 * r} 0M${cx - r} 82a${r} ${r / 2} 0 0 0 ${2 * r} 0`, c(VALLEY.basaltSide), 0.8);
      out += fill(box(cx - 9, 60, 2, 7) + box(cx - 1, 76, 2, 7) + box(cx - 9, 92, 2, 7), c(BASALT_DARK));
      out += fill(ellipsePath(cx, topY, r, r / 2), basalt.top);
      out += fill(ellipsePath(cx, topY + 0.6, r - 3.4, r / 2 - 2), c(VALLEY.basaltSide));
      let front = '';
      let side = '';
      for (const a of [0.12, 0.38, 0.62, 0.88]) {
        const x = cx - r * Math.cos(a * Math.PI);
        const y = topY + (r / 2) * Math.sin(a * Math.PI);
        const p = box(x - 2, y - 5, 4, 5);
        if (x > cx + 5) side += p;
        else front += p;
      }
      out += fill(front, basalt.face) + fill(side, basalt.side);
      // the flag on its pole
      out += stroke(`M71 46V12`, c(VALLEY.hoof), 1.4);
      out += fill('M72 13h18v12h-18Z', c(VALLEY.red));
      out += fill(box(72, 17, 18, 2.4), c(VALLEY.cream));
      out += fill('M81 19.6l2.4 2.4l-2.4 2.4l-2.4 -2.4Z', c(VALLEY.gold));
      // the gardens below the walls
      out += bush(10, 112, 0.8, foliage(dark), ground, random);
      out += poplar(112, 112, 0.7, poplarLeaves(dark), ground);
      return out;
    },
  },
};
