import { blob, crayon, painter, strokes, within } from '../brush.mjs';
import { spline } from '../kit.mjs';
import { Still } from '../still.mjs';

export const piece = {
  key: 'kerosk',
  ku: 'Kêroşka Bihêz',
  en: 'Strong rabbit',
  // a chubby white rabbit standing square on with its feet planted apart, both arms raised and bent to show off their
  // muscles, the fists up beside its cheeks; long ears standing up, pink inside, and a small proud face turned a little
  // to its right with pink cheeks and a pleased little smile; a puff of a tail at its hip; the white fur shaded in warm
  // lilac-grey and lit in cream, under a soft dark pencil line
  still(rnd) {
    const s = new Still(rnd).place([0, -1], 1.03);
    const FUR = '#f6f0ec';
    const CREAM = '#fff3df';
    const SHADE = '#cbb9c3';
    const DEEP = '#a28e9e';
    const PINK = '#f2a59e';
    const ROSE = '#e48683';
    const INK = '#2a1c16';
    const mirror = (pts) => pts.map(([x, y]) => [516 - x, y]);
    const { lay, wash, brush, line } = painter(rnd, INK);

    const earL = spline([[206, 176], [202, 130], [204, 88], [212, 54], [226, 34], [242, 38], [252, 64], [254, 104], [252, 146], [246, 176]]);
    const earLin = spline([[213, 150], [212, 108], [217, 72], [227, 52], [240, 60], [244, 92], [243, 130], [238, 156]]);
    const earR = spline([[268, 172], [272, 128], [284, 88], [300, 56], [318, 38], [334, 40], [338, 62], [332, 100], [320, 140], [310, 176]]);
    const earRin = spline([[282, 150], [290, 110], [304, 76], [318, 56], [326, 62], [322, 96], [310, 132], [300, 156]]);
    const head = spline([[258, 144], [294, 148], [320, 164], [334, 190], [337, 218], [330, 246], [312, 268], [286, 280], [258, 283], [230, 280], [204, 268],
      [186, 246], [179, 218], [182, 190], [196, 164], [222, 148]]);
    // The body and both legs in one piece, a little waisted under its chest, the legs short and planted apart.
    const body = spline([[214, 262], [302, 262], [328, 284], [340, 314], [336, 344], [330, 366], [336, 394], [334, 420], [324, 440], [318, 462], [296, 470],
      [278, 460], [272, 446], [258, 438], [244, 446], [238, 460], [220, 470], [198, 462], [192, 440], [182, 420], [180, 394], [186, 366], [180, 344],
      [176, 314], [188, 284]]);
    // One arm, bent up at the elbow with its biceps bunched on top and its fist curled in toward the head; the other is its
    // mirror.
    const ARM = [[206, 334], [170, 328], [134, 322], [106, 314], [90, 298], [86, 274], [92, 248], [104, 228], [124, 218], [142, 226], [142, 246], [138, 268],
      [146, 252], [160, 242], [176, 244], [188, 256], [194, 268], [206, 274], [226, 290], [226, 320]];
    const armL = spline(ARM);
    const armR = spline(mirror(ARM));
    // A point given across and down an oval turned by `turn` degrees, and points round its rim from `a0` to `a1` degrees:
    // for the lines drawn on and round a tilted fist.
    const at = ([cx, cy], turn, u, v) => {
      const [c, si] = [Math.cos((turn * Math.PI) / 180), Math.sin((turn * Math.PI) / 180)];
      return [cx + u * c - v * si, cy + u * si + v * c];
    };
    const round = (c, rx, ry, turn, a0, a1, count = 12) =>
      Array.from({ length: count }, (_, i) => {
        const t = ((a0 + ((a1 - a0) * i) / (count - 1)) * Math.PI) / 180;
        return at(c, turn, Math.cos(t) * rx, Math.sin(t) * ry);
      });
    const FIST = [[126, 204], 26, 21, -24];
    const footL = blob(rnd, [212, 470], 26, 11, 5, 0.04);
    const footR = blob(rnd, [304, 470], 26, 11, -5, 0.04);
    const tail = blob(rnd, [338, 412], 18, 16, 0, 0.08);
    const fistL = blob(rnd, ...FIST, 0.04);
    const fistR = blob(rnd, mirror([FIST[0]])[0], FIST[1], FIST[2], -FIST[3], 0.04);

    s.paint((cv) => {
      // the ears behind the head, pink inside, each shaded down its right side and lit down its left
      for (const [ear, inner, x] of [[earL, earLin, 229], [earR, earRin, 304]]) {
        lay(cv, ear, FUR);
        cv.add(`<g clip-path="${within(cv, ear)}">`);
        brush(cv, [[x + 16, 50], [x + 18, 110], [x + 14, 176]], 16, SHADE, 0.7, 'y');
        brush(cv, [[x - 16, 60], [x - 20, 120], [x - 18, 170]], 10, CREAM, 0.9, 'y');
        cv.add('</g>');
        lay(cv, inner, PINK, 2.4);
        cv.add(`<g clip-path="${within(cv, inner)}">`);
        brush(cv, [[x + 6, 66], [x + 6, 116], [x + 6, 160]], 10, ROSE, 0.55, 'y');
        cv.add('</g>');
      }
      line(cv, [[202, 166], [201, 126], [204, 86], [213, 52], [226, 35], [241, 38], [252, 64], [254, 104], [252, 144]], 5.8, { start: 0.3, end: 0.4, count: 44 });
      line(cv, [[270, 162], [274, 124], [286, 86], [302, 54], [319, 38], [334, 41], [338, 63], [332, 100], [320, 140]], 5.8, { start: 0.3, end: 0.4, count: 44 });
      // the tail behind the hip, a puff in shade; then the body and legs over it, and the feet turned out a little
      lay(cv, tail, FUR);
      wash(cv, blob(rnd, [346, 420], 12, 10, 0, 0.1), SHADE, 5, 0.8);
      line(cv, [[334, 396], [348, 396], [356, 406], [356, 420], [346, 428], [334, 428]], 4.4, { start: 0.3, end: 0.3, tremble: 0.3 });
      lay(cv, body, FUR);
      cv.add(`<g clip-path="${within(cv, body)}">`);
      // the shadow the head throws on the chest, the far side, under the belly and down the inside of each leg in lilac;
      // the near pectoral and the belly turned to the light, and a soft hollow under each pectoral
      wash(cv, spline([[190, 270], [258, 298], [326, 272], [340, 300], [300, 314], [258, 318], [214, 314], [180, 300]]), SHADE, 9, 0.75);
      wash(cv, blob(rnd, [190, 350], 14, 26, 0, 0.05), SHADE, 8, 0.6);
      wash(cv, spline([[318, 300], [346, 300], [346, 470], [306, 470], [316, 420], [312, 380], [318, 340]]), SHADE, 9, 0.85);
      brush(cv, [[334, 330], [332, 380], [330, 430]], 12, DEEP, 0.3, 'y');
      wash(cv, spline([[176, 360], [190, 360], [194, 420], [204, 470], [176, 470]]), SHADE, 8, 0.4);
      wash(cv, spline([[206, 424], [258, 430], [310, 424], [300, 452], [282, 476], [234, 476], [216, 452]]), SHADE, 10, 0.6);
      wash(cv, blob(rnd, [226, 318], 22, 14, -10, 0.05), CREAM, 7, 0.95);
      wash(cv, blob(rnd, [238, 382], 32, 36, -8, 0.05), CREAM, 10, 0.95);
      wash(cv, blob(rnd, [226, 350], 20, 6, 8, 0.05), SHADE, 4, 0.6);
      wash(cv, blob(rnd, [290, 350], 22, 6, -8, 0.05), SHADE, 4, 0.8);
      wash(cv, blob(rnd, [300, 364], 22, 12, -10, 0.05), ROSE, 8, 0.3);
      wash(cv, blob(rnd, [212, 362], 16, 9, 10, 0.05), ROSE, 7, 0.2);
      strokes(cv, rnd, body, [176, 280, 340, 472],
        { count: 26, colours: [DEEP], flow: () => 80, spread: 40, length: 9, width: 1.8, opacity: [0.15, 0.35], bend: 0.2 });
      strokes(cv, rnd, body, [186, 300, 296, 440],
        { count: 18, colours: ['#ffffff'], flow: () => 80, spread: 30, length: 10, width: 2.2, opacity: [0.5, 0.8], bend: 0.2 });
      cv.add('</g>');
      line(cv, [[182, 330], [180, 346], [186, 366], [180, 394], [183, 420], [192, 440], [198, 456]], 6.0, { start: 0.3, end: 0.4 });
      line(cv, [[334, 330], [336, 346], [330, 366], [336, 394], [333, 420], [324, 440], [318, 456]], 6.0, { start: 0.3, end: 0.4 });
      line(cv, [[238, 460], [244, 446], [258, 438], [272, 446], [278, 460]], 4.6, { start: 0.3, end: 0.3, peak: 0.5 });
      for (const [foot, side] of [[footL, -1], [footR, 1]]) {
        lay(cv, foot, FUR);
        cv.add(`<g clip-path="${within(cv, foot)}">`);
        brush(cv, [[258 + side * 24, 480], [258 + side * 48, 482], [258 + side * 76, 478]], 10, SHADE, 0.7, 'x');
        cv.add('</g>');
        const sole = [[200, 462], [188, 466], [190, 477], [214, 481], [236, 477], [238, 468]];
        line(cv, side < 0 ? sole : mirror(sole), 5.2, { start: 0.3, end: 0.4 });
      }
      // the chest: a soft line under each pectoral, the cleft between them, and a little navel
      line(cv, [[204, 332], [226, 342], [248, 338]], 3.8, { start: 0.2, end: 0.5, peak: 0.6 });
      line(cv, [[268, 338], [290, 342], [312, 332]], 3.8, { start: 0.5, end: 0.2, peak: 0.4 });
      line(cv, [[258, 300], [258, 318]], 3, { start: 0.5, end: 0.3 });
      line(cv, [[256, 390], [258, 398], [260, 390]], 3, { start: 0.5, end: 0.5 });
      // the arms, raised and bent: each biceps lit along its top and lilac beneath, the far arm a little deeper in shade
      for (const [arm, fist, side] of [[armL, fistL, -1], [armR, fistR, 1]]) {
        const X = (pts) => (side < 0 ? pts : mirror(pts));
        lay(cv, arm, FUR);
        cv.add(`<g clip-path="${within(cv, arm)}">`);
        brush(cv, X([[206, 330], [160, 324], [116, 316], [92, 300]]), 22, SHADE, side < 0 ? 0.65 : 0.8, 'x');
        brush(cv, X([[148, 262], [164, 250], [184, 254], [198, 272]]), 16, CREAM, side < 0 ? 0.95 : 0.7, 'x');
        brush(cv, X([[142, 280], [164, 290], [192, 288]]), 12, SHADE, side < 0 ? 0.45 : 0.65, 'x');
        brush(cv, X([[134, 232], [134, 262], [146, 296]]), 12, SHADE, 0.4, 'y');
        brush(cv, X([[102, 236], [94, 270], [100, 300]]), 14, side < 0 ? CREAM : SHADE, side < 0 ? 0.8 : 0.7, 'y');
        if (side > 0) wash(cv, spline([[300, 300], [430, 290], [430, 340], [300, 340]]), SHADE, 10, 0.35);
        strokes(cv, rnd, arm, side < 0 ? [86, 220, 200, 334] : [316, 220, 430, 334],
          { count: 12, colours: [DEEP], flow: () => side * 10, spread: 30, length: 8, width: 1.6, opacity: [0.15, 0.35], bend: 0.2 });
        cv.add('</g>');
        line(cv, X([[198, 333], [170, 329], [134, 323], [106, 315], [90, 298], [86, 274], [92, 248], [102, 230]]), 6.0, { start: 0.3, end: 0.4 });
        line(cv, X([[143, 232], [142, 248], [138, 268], [146, 252], [160, 242], [176, 244], [188, 256], [194, 268], [204, 274]]), 5.6, { start: 0.4, end: 0.3 });
        line(cv, X([[144, 284], [162, 292], [182, 290]]), 3.2, { start: 0.3, end: 0.4 });
        lay(cv, fist, FUR);
        cv.add(`<g clip-path="${within(cv, fist)}">`);
        brush(cv, X([[102, 218], [124, 224], [146, 212]]), 12, SHADE, side < 0 ? 0.6 : 0.8, 'x');
        cv.add('</g>');
        line(cv, X(round(FIST[0], 26.5, 21.5, FIST[3], 140, 405)), 5.8, { start: 0.4, end: 0.4 });
        // the curled fingers, three short creases where the fist turns in toward the head
        for (const a of [-56, -26, 4]) {
          const t = (a * Math.PI) / 180;
          line(cv, X([at(FIST[0], FIST[3], Math.cos(t) * 26, Math.sin(t) * 21),
            at(FIST[0], FIST[3], Math.cos(t) * 15, Math.sin(t) * 12)]), 2.8, { start: 0.7, end: 0.3 });
        }
      }
      // the head: cream where the light falls on its crown and near cheek, lilac down its far side and under its chin
      lay(cv, head, FUR);
      cv.add(`<g clip-path="${within(cv, head)}">`);
      brush(cv, [[328, 182], [340, 222], [326, 258], [298, 282]], 26, SHADE, 0.6, 'y');
      brush(cv, [[206, 276], [258, 288], [312, 276]], 18, SHADE, 0.5, 'x');
      brush(cv, [[196, 178], [228, 154], [276, 150], [310, 164]], 28, CREAM, 0.9, 'x');
      strokes(cv, rnd, head, [178, 144, 338, 283],
        { count: 26, colours: [DEEP], flow: () => 20, spread: 50, length: 8, width: 1.6, opacity: [0.12, 0.3], bend: 0.2 });
      strokes(cv, rnd, head, [180, 146, 320, 230],
        { count: 16, colours: ['#ffffff'], flow: () => -20, spread: 40, length: 10, width: 2.2, opacity: [0.5, 0.85], bend: 0.2 });
      cv.add('</g>');
      wash(cv, blob(rnd, [298, 244], 16, 12, -6, 0.05), PINK, 6, 0.95);
      wash(cv, blob(rnd, [206, 244], 11, 9, 0, 0.05), PINK, 5, 0.8);
      line(cv, [[226, 149], [198, 162], [184, 186], [179, 216], [184, 244], [202, 267], [230, 280], [258, 284], [288, 280]],
        6.2, { start: 0.3, end: 0.3, count: 44 });
      line(cv, [[290, 148], [318, 162], [333, 188], [337, 218], [331, 246], [314, 267]], 6.0, { start: 0.3, end: 0.4 });
      // the face, turned a touch to its right: dark eyes with a catch of light, a pink nose and a pleased little smile
      cv.add(`<g fill="${INK}" filter="${crayon(cv, rnd, { keep: 3.6, tear: 1.2, grain: 1.2 })}"><path d="${blob(rnd, [219, 214], 9, 11, 0, 0.03)}"/>`
        + `<path d="${blob(rnd, [281, 212], 10, 12, 0, 0.03)}"/></g>`);
      cv.add('<g fill="#fffaf2"><circle cx="215.5" cy="209" r="3"/><circle cx="277" cy="207" r="3.4"/></g>');
      lay(cv, spline([[239, 232], [253, 230], [247, 240]]), ROSE, 3);
      line(cv, [[239, 231], [253, 229.5], [246, 240], [239, 231]], 2.6, { start: 0.6, end: 0.6 });
      line(cv, [[246, 240], [246, 246]], 2.6);
      line(cv, [[234, 245], [239, 251], [246, 246], [253, 251], [260, 243]], 3, { start: 0.4, end: 0.4, peak: 0.5 });
    });
    return s.done({ finish: { paint: 0, grain: 0.008, contrast: 0, saturation: 1, warmth: 0 } });
  },
};
