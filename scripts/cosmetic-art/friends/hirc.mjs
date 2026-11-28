import { blob, crayon, painter, softly, strokes, within } from '../brush.mjs';
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
  // a big round dark bear standing square on to us, its body a heavy pear with a small head on top and no neck between,
  // small round ears, eyes half shut in a sleepy calm, a dark nose on a pale muzzle; short arms hanging at its sides and
  // stubby feet at the bottom corners, painted in deep warm browns lit from the upper left, warmer over the belly and
  // the brow, and a soft pencil line over it
  still(rnd) {
    const s = new Still(rnd).place([0, -10], 1.04);
    const COAT = '#41291e';
    const SHADE = '#332018';
    const DEEP = '#261710';
    const WARM = '#664330';
    const LIT = '#875c40';
    const MUZZLE = '#c4946c';
    const PALE = '#dcb48b';
    const EAR = '#8a5a40';
    const INK = '#24160f';
    const { lay, brush, line } = painter(rnd, INK);

    // the whole bear in one outline: the crown, the sides swelling out from the cheeks to the hips, a foot at each
    // bottom corner, and its seat a little raised between them
    const P = [[256, 70], [296, 72], [328, 84], [348, 106], [360, 138], [370, 172], [388, 210], [410, 252], [426, 296], [438, 342], [444, 388],
      [442, 422], [450, 444], [452, 466], [438, 479], [404, 481], [376, 471], [316, 466], [256, 465], [196, 466], [136, 471], [108, 481], [74, 479],
      [60, 466], [62, 444], [70, 422], [68, 388], [74, 342], [86, 296], [102, 252], [122, 210], [142, 172], [152, 138], [164, 106], [184, 84], [216, 72]];
    const body = spline(P);
    const mirror = (pts) => pts.map(([x, y]) => [512 - x, y]);
    const ears = [[[176, 88], 25, 23, -12], [[336, 88], 25, 23, 12]];
    // the arms hang down the sides from the shoulders, their outer edge the body's own, each ending in a paw turned in
    const armL = [[120, 252], [144, 256], [154, 282], [166, 310], [180, 334], [180, 350], [162, 360], [138, 357], [116, 344], [104, 320], [102, 290],
      [108, 266]];
    // the right arm hangs a little lower and further out than the left, as a bear at ease is not quite even
    const onRight = (pts) => pts.map(([x, y]) => [518 - x, y + 4]);
    const muzzle = spline([[256, 118], [270, 126], [282, 148], [290, 172], [286, 192], [270, 202], [256, 204], [242, 202], [226, 192], [222, 172],
      [230, 148], [242, 126]]);

    s.paint((cv) => {
      // the ears, behind the crown, warmer inside
      for (const [c, rx, ry, turn] of ears) {
        const ear = blob(rnd, c, rx, ry, turn, 0.04);
        lay(cv, ear, COAT, 3.2);
        cv.add(`<g clip-path="${within(cv, ear)}">`);
        brush(cv, [[c[0] - 24, c[1] - 4], [c[0] - 6, c[1] - 22], [c[0] + 16, c[1] - 20]], 14, LIT, 0.55, 'x');
        cv.add('</g>');
        lay(cv, blob(rnd, [c[0], c[1] + 3], rx * 0.52, ry * 0.5, turn, 0.06), EAR, 2.4);
      }
      // the coat, then its light and shade: a warm glow over the brow and a larger one over the belly, laid on as thin
      // glazes one inside another and a little off centre, their edges softened together; warm light down the left
      // shoulder, the right side and the seat deep in shade, and the shadow the head throws on the chest
      lay(cv, body, COAT, 3.2);
      cv.add(`<g clip-path="${within(cv, body)}">`);
      const glaze = (c, rx, ry, turn, colour, steps, soft) => {
        cv.add(`<g filter="${softly(cv, soft)}">`);
        for (const [k, opacity] of steps) {
          const at = [c[0] - (1 - k) * rx * 0.2, c[1] - (1 - k) * ry * 0.25];
          cv.add(`<path d="${blob(rnd, at, rx * k, ry * k, turn, 0.07)}" fill="${colour}" fill-opacity="${opacity}"/>`);
        }
        cv.add('</g>');
      };
      glaze([236, 112], 84, 36, -6, WARM, [[1, 0.4], [0.75, 0.45], [0.5, 0.4]], 6);
      glaze([252, 364], 96, 82, 0, WARM, [[1, 0.35], [0.78, 0.4], [0.55, 0.4]], 8);
      brush(cv, [[178, 96], [222, 80], [270, 80]], 22, LIT, 0.7, 'x');
      brush(cv, [[158, 130], [148, 176], [130, 218], [108, 264]], 22, WARM, 0.75, 'y');
      for (const [pts, w, colour, opacity] of [
        [[[364, 150], [388, 214], [418, 290], [436, 370], [440, 440]], 44, SHADE, 0.9],
        [[[376, 200], [406, 266], [430, 344], [440, 420]], 22, DEEP, 0.6],
        [[[90, 320], [78, 380], [76, 440]], 26, SHADE, 0.6],
        [[[120, 462], [200, 458], [256, 456], [312, 458], [392, 462]], 26, SHADE, 0.75],
      ]) brush(cv, pts, w, colour, opacity, 'y');
      brush(cv, [[186, 214], [220, 234], [256, 240], [292, 234], [326, 214]], 16, SHADE, 0.4, 'x');
      // the arms, laid in the coat's own colour so they grow out of the shoulders, lit down toward the paw on the left
      // and in shade on the right, each with a shadow beside it and under its paw
      for (const side of [-1, 1]) {
        const X = side < 0 ? (pts) => pts : onRight;
        const d = spline(X(armL));
        brush(cv, X([[160, 284], [172, 310], [188, 336], [186, 360]]), 12, DEEP, 0.4, 'y');
        brush(cv, X([[126, 362], [156, 368], [184, 358]]), 12, DEEP, 0.45, 'x');
        lay(cv, d, COAT, 3.2);
        cv.add(`<g clip-path="${within(cv, d)}">`);
        brush(cv, X([[126, 276], [132, 306], [146, 334]]), 22, WARM, side < 0 ? 0.8 : 0.45, 'y');
        brush(cv, X([[136, 300], [144, 326], [158, 344]]), 12, LIT, side < 0 ? 0.45 : 0.2, 'y');
        brush(cv, X([[134, 340], [154, 346], [174, 342]]), 12, WARM, side < 0 ? 0.7 : 0.4, 'x');
        brush(cv, X([[104, 296], [106, 330], [124, 352]]), 12, SHADE, 0.6, 'y');
        cv.add('</g>');
      }
      // the feet, each a little lighter on its round top
      for (const side of [-1, 1]) {
        const x = (v) => (side < 0 ? v : 512 - v);
        brush(cv, [[x(70), 456], [x(92), 450], [x(126), 456]], 14, side < 0 ? WARM : COAT, 0.7, 'x');
      }
      // flecks of fur, lying down the body and fanning out toward its sides: pale and warm over the brow and the belly,
      // fewer and darker over the rest
      const fall = (x) => 90 - (x - 256) * 0.2;
      strokes(cv, rnd, body, [176, 80, 330, 140], { count: 22, colours: [LIT, '#a37452'], flow: () => -96, spread: 24, length: 11, width: 2,
        opacity: [0.35, 0.7], bend: 0.2 });
      strokes(cv, rnd, body, [170, 280, 340, 440], { count: 36, colours: [LIT, '#a37452'], flow: fall, spread: 22, length: 12, width: 2,
        opacity: [0.25, 0.55], bend: 0.2 });
      strokes(cv, rnd, body, [80, 150, 440, 460], { count: 40, colours: [WARM, DEEP], flow: fall, spread: 20, length: 12, width: 2,
        opacity: [0.35, 0.65], bend: 0.2 });
      cv.add('</g>');
      // the pale muzzle, lit on its bridge and warmer toward the chin
      lay(cv, muzzle, MUZZLE, 2.4);
      cv.add(`<g clip-path="${within(cv, muzzle)}">`);
      brush(cv, [[248, 128], [244, 156], [238, 186]], 16, PALE, 0.75, 'y');
      brush(cv, [[232, 196], [256, 204], [282, 194]], 12, '#a8774f', 0.6, 'x');
      cv.add('</g>');
    });
    s.paint((cv) => {
      // the pencil line, open in places: round the ears, the crown, down each side to the feet, the seat
      const [[c, rx, ry, turn]] = ears;
      const earLine = arc(c, rx, ry, 145, 375, { count: 14, turn });
      line(cv, earLine, 4.8, { start: 0.4, end: 0.3 });
      line(cv, mirror(earLine).reverse(), 4.8, { start: 0.3, end: 0.4 });
      line(cv, [[198, 77], [226, 71], [256, 70], [288, 71], [314, 77]], 4.8, { start: 0.3, end: 0.4 });
      line(cv, P.slice(25, 34).reverse(), 5.4, { start: 0.3, end: 0.4 });
      line(cv, P.slice(3, 12), 5.4, { start: 0.4, end: 0.3 });
      line(cv, [...P.slice(20, 26).reverse(), [176, 467]], 5, { start: 0.3, end: 0.3 });
      line(cv, [[336, 467], ...P.slice(11, 17).reverse()], 5, { start: 0.3, end: 0.3 });
      line(cv, [[206, 466], P[18], [300, 466]], 4.4, { start: 0.3, end: 0.3 });
      // the foot's top, and its toes
      for (const side of [-1, 1]) {
        const X = side < 0 ? (pts) => pts : mirror;
        line(cv, X([[74, 444], [94, 438], [120, 444], [136, 458]]), 3.6, { start: 0.2, end: 0.3, peak: 0.5 });
        for (const [x, y] of [[84, 474], [98, 476], [112, 474]]) line(cv, X([[x, y - 9], [x + 1, y]]), 2.4, { start: 0.3, end: 0.7 });
      }
      // the arms: the inner edge of each down to the paw, round the paw, and its claws
      for (const side of [-1, 1]) {
        const X = side < 0 ? (pts) => pts : onRight;
        line(cv, X([[148, 268], [158, 292], [170, 316], [182, 334], [181, 350], [164, 360], [140, 358], [118, 347]]), 4.6, { start: 0.1, end: 0.3, peak: 0.6 });
        for (const [x, y] of [[144, 359], [156, 360], [168, 356]]) line(cv, X([[x - 2, y - 6], [x, y + 3]]), 2.4, { start: 0.3, end: 0.8 });
      }
      // the face: eyes half shut under heavy lids, the nose, a small calm mouth
      const eye = ([x, y], side) => spline([[x - 13, y], [x - 6, y + 6], [x + 6, y + 6], [x + 13, y], [x + 6, y + 1 + side], [x - 6, y + 1 - side]]);
      cv.add(`<g fill="${INK}" filter="${crayon(cv, rnd, { keep: 3.6, tear: 1.2, grain: 1.2 })}">`
        + `<path d="${eye([212, 136], -1)}"/><path d="${eye([300, 136], 1)}"/>`
        + `<path d="${spline([[236, 140], [256, 134], [276, 140], [272, 152], [256, 159], [240, 152]])}"/></g>`);
      line(cv, [[196, 134], [212, 130], [229, 135]], 4.2, { start: 0.5, end: 0.6 });
      line(cv, [[283, 135], [300, 130], [316, 134]], 4.2, { start: 0.6, end: 0.5 });
      line(cv, [[256, 157], [256, 176]], 3, { start: 0.8, end: 0.6 });
      line(cv, [[240, 180], [248, 184], [256, 178], [264, 184], [272, 180]], 3.2, { start: 0.4, end: 0.4, peak: 0.5 });
    });
    return s.done({ finish: { paint: 0, grain: 0.008, contrast: 0, saturation: 1, warmth: 0 } });
  },
};
