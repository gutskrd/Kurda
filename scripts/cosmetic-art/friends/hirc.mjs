import { blob, crayon, painter, strokes, within } from '../brush.mjs';
import { spline } from '../kit.mjs';
import { Still } from '../still.mjs';

/** Points along an oval round `c`, from `a0` to `a1` degrees (0 to the right, 90 straight down), the oval turned by `turn` degrees. */
function arc([cx, cy], rx, ry, a0, a1, { count = 10, turn = 0 } = {}) {
  const [c, s] = [Math.cos((turn * Math.PI) / 180), Math.sin((turn * Math.PI) / 180)];
  const out = [];
  for (let i = 0; i <= count; i++) {
    const t = ((a0 + ((a1 - a0) * i) / count) * Math.PI) / 180;
    const [x, y] = [Math.cos(t) * rx, Math.sin(t) * ry];
    out.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  return out;
}

export const piece = {
  key: 'hirc',
  ku: 'Hirç',
  en: 'Bear',
  // a chubby brown bear sitting on its bottom with its legs out in front, the pale pads of both feet turned to us, its
  // paws resting on its round pale belly; eyes half shut and a small contented smile under a dark nose, a pale muzzle
  // and round ears, painted in rich browns with the shade brushed down its sides and a soft pencil line over it
  still(rnd) {
    const s = new Still(rnd).place([0, -16], 1.04);
    const COAT = '#93603c';
    const SHADE = '#74452a';
    const DEEP = '#5a321e';
    const LIT = '#b27c50';
    const CREAM = '#dcad7c';
    const PALE = '#eccb9c';
    const PAD = '#e4bb8e';
    const INK = '#2a1c16';
    const mirror = (pts) => pts.map(([x, y]) => [512 - x, y]);
    const { lay, wash, brush, line } = painter(rnd, INK);

    const headPts = [[256, 80], [310, 86], [350, 106], [374, 140], [382, 182], [374, 222], [350, 254], [306, 274], [256, 280], [206, 274], [162, 254],
      [138, 222], [130, 182], [138, 140], [162, 106], [202, 86]];
    const head = spline(headPts);
    const bodyPts = [[256, 236], [334, 246], [380, 282], [404, 330], [414, 384], [404, 428], [364, 452], [256, 462], [148, 452], [108, 428], [98, 384],
      [108, 330], [132, 282], [178, 246]];
    const body = spline(bodyPts);
    // the arm on our left, from under the cheek down the side and bent in, its paw on the belly; the other is its mirror
    const armL = [[164, 244], [138, 270], [122, 304], [124, 336], [144, 358], [176, 368], [210, 366], [236, 350], [242, 330], [230, 316], [206, 314],
      [184, 306], [172, 288], [176, 262]];
    const belly = blob(rnd, [256, 374], 96, 76, 0, 0.03);
    // each foot an oval turned out a little, its sole to us: a big pad and four toes in an arc above it
    const feet = [-1, 1].map((side) => {
      const c = [256 + side * 126, 426];
      const turn = side * 24;
      const [co, si] = [Math.cos((turn * Math.PI) / 180), Math.sin((turn * Math.PI) / 180)];
      const at = ([u, v]) => [c[0] + u * co - v * si, c[1] + u * si + v * co];
      return { c, turn, at, d: blob(rnd, c, 50, 58, turn, 0.025) };
    });

    s.paint((cv) => {
      // the ears behind the head, pale inside
      for (const side of [-1, 1]) {
        const X = (pts) => (side < 0 ? pts : mirror(pts));
        const ear = blob(rnd, X([[166, 100]])[0], 38, 36, 0, 0.04);
        lay(cv, ear, COAT);
        cv.add(`<g clip-path="${within(cv, ear)}">`);
        brush(cv, X([[136, 92], [150, 72], [176, 66]]), 16, LIT, 0.6, 'x');
        cv.add('</g>');
        lay(cv, blob(rnd, X([[162, 96]])[0], 21, 19, 0, 0.05), '#c98e60', 2.4);
        wash(cv, blob(rnd, X([[166, 104]])[0], 12, 10, 0, 0.05), SHADE, 5, 0.5);
      }
      // the body, its shade brushed down both sides, the head's shadow under the chin, the round pale belly
      lay(cv, body, COAT);
      cv.add(`<g clip-path="${within(cv, body)}">`);
      for (const side of [-1, 1]) {
        const X = (pts) => (side < 0 ? pts : mirror(pts));
        brush(cv, X([[118, 300], [104, 350], [104, 400], [120, 440]]), 34, SHADE, side < 0 ? 0.55 : 0.8, 'y');
        brush(cv, X([[108, 330], [100, 380], [110, 430]]), 16, DEEP, side < 0 ? 0.35 : 0.55, 'y');
      }
      brush(cv, [[140, 264], [200, 282], [256, 288], [312, 282], [372, 264]], 26, SHADE, 0.6, 'x');
      lay(cv, belly, CREAM, 2.4);
      cv.add(`<g clip-path="${within(cv, belly)}">`);
      brush(cv, [[190, 332], [236, 310], [288, 312]], 26, PALE, 0.8, 'x');
      brush(cv, [[180, 420], [256, 448], [334, 420]], 22, '#c4925f', 0.6, 'x');
      strokes(cv, rnd, belly, [160, 300, 352, 450], { count: 26, colours: [PALE], flow: () => -80, spread: 26, length: 11, width: 2,
        opacity: [0.3, 0.6], bend: 0.2 });
      cv.add('</g>');
      strokes(cv, rnd, body, [100, 240, 412, 460], { count: 36, colours: [LIT], flow: () => -95, spread: 20, length: 12, width: 2,
        opacity: [0.25, 0.5], bend: 0.2 });
      cv.add('</g>');
      // the feet out in front, darker round their rims, and the pale pads
      for (const foot of feet) {
        lay(cv, foot.d, COAT);
        cv.add(`<g clip-path="${within(cv, foot.d)}">`);
        brush(cv, arc(foot.c, 46, 54, 20, 160, { count: 8, turn: foot.turn }), 22, SHADE, 0.7, 'x');
        lay(cv, blob(rnd, foot.at([0, 14]), 28, 24, foot.turn, 0.06), PAD, 2.4);
        for (const [u, v] of [[-30, -22], [-11, -36], [11, -36], [30, -22]]) lay(cv, blob(rnd, foot.at([u, v]), 9.5, 11, foot.turn, 0.06), PAD, 2.4);
        brush(cv, [foot.at([-18, 4]), foot.at([0, 0]), foot.at([16, 6])], 10, '#f4d8b0', 0.7, 'x');
        cv.add('</g>');
      }
      // the arms, shaded along their outer edge and lit over the top of each paw
      for (const side of [-1, 1]) {
        const X = (pts) => (side < 0 ? pts : mirror(pts));
        const arm = spline(X(armL));
        lay(cv, arm, COAT);
        cv.add(`<g clip-path="${within(cv, arm)}">`);
        brush(cv, X([[150, 260], [128, 300], [130, 340], [160, 364]]), 26, SHADE, side < 0 ? 0.55 : 0.8, 'y');
        brush(cv, X([[186, 322], [210, 318], [234, 328]]), 14, LIT, 0.8, 'x');
        brush(cv, X([[150, 362], [190, 370], [226, 356]]), 14, DEEP, 0.5, 'x');
        cv.add('</g>');
      }
      // the head: lit over its brow, shaded down its cheeks, the pale muzzle and a warm flush under each eye
      lay(cv, head, COAT);
      cv.add(`<g clip-path="${within(cv, head)}">`);
      wash(cv, blob(rnd, [236, 118], 82, 36, -8, 0.05), LIT, 14, 0.7);
      brush(cv, [[204, 92], [214, 124], [222, 150]], 22, LIT, 0.55, 'y');
      brush(cv, [[256, 86], [254, 120], [252, 146]], 24, LIT, 0.55, 'y');
      brush(cv, [[306, 94], [294, 124], [286, 148]], 20, LIT, 0.55, 'y');
      for (const side of [-1, 1]) {
        const X = (pts) => (side < 0 ? pts : mirror(pts));
        brush(cv, X([[144, 160], [136, 204], [152, 244], [190, 270]]), 30, SHADE, side < 0 ? 0.5 : 0.8, 'y');
        wash(cv, blob(rnd, X([[188, 212]])[0], 17, 10, 0, 0.05), '#b8603e', 6, 0.45);
      }
      brush(cv, [[190, 268], [256, 280], [322, 268]], 18, SHADE, 0.6, 'x');
      lay(cv, blob(rnd, [256, 216], 56, 42, 0, 0.03), CREAM, 2.4);
      brush(cv, [[222, 196], [250, 186], [280, 192]], 14, PALE, 0.75, 'x');
      brush(cv, [[220, 246], [256, 256], [292, 246]], 12, '#c4925f', 0.6, 'x');
      strokes(cv, rnd, head, [140, 84, 372, 170], { count: 26, colours: [PALE], flow: () => -100, spread: 26, length: 11, width: 2,
        opacity: [0.25, 0.55], bend: 0.2 });
      cv.add('</g>');
    });
    s.paint((cv) => {
      // the pencil line, open in places: round the ears, the head, the arms and paws, down the sides, round the feet
      for (const side of [-1, 1]) {
        const X = (pts) => (side < 0 ? pts : mirror(pts));
        line(cv, X(arc([166, 100], 38, 36, 100, 330, { count: 14 })), 5.4, { start: 0.4, end: 0.3 });
        line(cv, X([[140, 134], [131, 176], [136, 216], [156, 248], [190, 270], [228, 279]]), 5.8, { start: 0.4, end: 0.2 });
        line(cv, X([[206, 314], [230, 316], [244, 332], [238, 352], [214, 366], [180, 369], [150, 361]]), 4.8, { start: 0.3, end: 0.2, peak: 0.5 });
        line(cv, X([[174, 284], [180, 300], [192, 310]]), 3.8, { start: 0.2, end: 0.3 });
        line(cv, X([[242, 332], [230, 334]]), 2.6, { start: 0.8, end: 0.2 });
        line(cv, X([[238, 348], [227, 346]]), 2.6, { start: 0.8, end: 0.2 });
        line(cv, X([[136, 274], [122, 304], [122, 336], [140, 356]]), 4.6, { start: 0.2, end: 0.4 });
        line(cv, X([[150, 262], [124, 290], [106, 336], [99, 380], [104, 404]]), 5.8, { start: 0.3, end: 0.3 });
      }
      line(cv, [[200, 88], [256, 79], [312, 88]], 5, { start: 0.3, end: 0.3 });
      line(cv, [[178, 454], [256, 463], [334, 454]], 5.2, { start: 0.3, end: 0.3 });
      for (const foot of feet) {
        const side = foot.turn < 0 ? -1 : 1;
        line(cv, arc(foot.c, 50, 58, side < 0 ? 120 : -120, side < 0 ? 400 : 60, { count: 22, turn: foot.turn }), 5.4, { start: 0.3, end: 0.4, count: 50 });
      }
      // the face: the eyes half shut under heavy lids, the nose, and the smile
      // (each eye's top runs along its lid, which droops toward the outer corner)
      const eye = (c, side) => spline([...arc(c, 12.5, 9, 0, 180, { count: 6 }), [c[0] - 6, c[1] - 1 - side * 1.5], [c[0] + 6, c[1] - 1 + side * 1.5]]);
      cv.add(`<g fill="${INK}" filter="${crayon(cv, rnd, { keep: 3.6, tear: 1.2, grain: 1.2 })}">`
        + `<path d="${eye([198, 173], -1)}"/><path d="${eye([314, 173], 1)}"/>`
        + `<path d="${spline([[236, 194], [256, 189], [276, 194], [272, 204], [256, 212], [240, 204]])}"/></g>`);
      line(cv, [[181, 176], [196, 168], [216, 169]], 4.4, { start: 0.5, end: 0.6 });
      line(cv, [[296, 169], [316, 168], [331, 176]], 4.4, { start: 0.6, end: 0.5 });
      line(cv, [[256, 210], [256, 222]], 3.2, { start: 0.8, end: 0.6 });
      line(cv, [[238, 222], [247, 230], [256, 222]], 3.4, { start: 0.4, end: 0.8, peak: 0.6 });
      line(cv, [[256, 222], [265, 230], [274, 222]], 3.4, { start: 0.8, end: 0.4, peak: 0.4 });
    });
    return s.done({ finish: { paint: 0, grain: 0.008, contrast: 0, saturation: 1, warmth: 0 } });
  },
};
