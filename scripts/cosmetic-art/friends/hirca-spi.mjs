import { blob, crayon, painter, strokes, within } from '../brush.mjs';
import { spline } from '../kit.mjs';
import { Still } from '../still.mjs';

export const piece = {
  key: 'hirca-spi',
  ku: 'Hirça Spî',
  en: 'White bear',
  // a white bear walking off to our right on all fours, seen from its side and a little from the front: its rump high,
  // its head held low on a long neck and its nose pushed forward, small round ears, one black eye and a black nose;
  // painted white, warm cream along its back where the light falls, cool blue-grey brushed under its belly, down its
  // legs and under its neck, the far legs deeper in shade, and a soft pencil line over it
  still(rnd) {
    const s = new Still(rnd).place([-20, -24]);
    const WHITE = '#f4f3ee';
    const LIGHT = '#fcf3df';
    const CREAM = '#f2dcb0';
    const COOL = '#bfcbd8';
    const SHADE = '#a2b2c4';
    const DEEP = '#8494a9';
    const BLACK = '#1b1615';
    const INK = '#2a1f1c';
    const { lay, wash, brush, line } = painter(rnd, INK);
    // the head is drawn a little larger than life and set a little back on the neck, so that its face still reads when small
    const H = (pts) => pts.map(([x, y]) => [336 + (x - 350) * 1.16, 262 + (y - 262) * 1.16]);

    const torsoPts = [[72, 284], [58, 248], [58, 206], [74, 168], [104, 142], [146, 122], [196, 114], [248, 118], [290, 136], [322, 160], [346, 192],
      [366, 226], [376, 262], [370, 300], [352, 326], [326, 342], [290, 350], [244, 354], [198, 350], [158, 340], [120, 322], [90, 304]];
    const torso = spline(torsoPts);
    const headPts = [[344, 232], [352, 212], [372, 202], [400, 203], [426, 214], [450, 230], [470, 243], [484, 255], [488, 268], [482, 280], [466, 288],
      [444, 294], [420, 302], [392, 308], [364, 304], [348, 288], [340, 260]];
    const head = spline(H(headPts));
    // the legs, each from inside the body down to a broad flat foot with its toes to the front, in step: the near
    // front foot reaching forward as the near hind one pushes off behind, the far pair the other way about
    const nearFront = [[362, 296], [370, 346], [378, 394], [388, 410], [404, 418], [406, 430], [376, 435], [342, 434], [334, 422], [330, 400], [322, 360],
      [310, 320], [300, 290]];
    const farFront = [[316, 306], [302, 350], [298, 394], [306, 410], [312, 420], [306, 430], [278, 432], [254, 430], [252, 416], [258, 392], [264, 352],
      [272, 310]];
    const nearHind = [[164, 296], [152, 344], [138, 386], [134, 406], [142, 418], [144, 430], [116, 434], [80, 434], [62, 428], [62, 412], [70, 384],
      [74, 340], [78, 292]];
    const farHind = [[208, 316], [212, 350], [218, 384], [226, 404], [240, 414], [242, 428], [216, 432], [188, 430], [182, 416], [180, 384], [170, 350],
      [160, 320]];

    s.paint((cv) => {
      // the far legs first, behind the body and deeper in its shade
      for (const leg of [farHind, farFront]) {
        const d = spline(leg);
        const xs = leg.map((p) => p[0]);
        const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
        lay(cv, d, COOL);
        cv.add(`<g clip-path="${within(cv, d)}">`);
        brush(cv, [[x1 - 10, 310], [x1 - 14, 370], [x1 - 8, 420]], 26, SHADE, 0.85, 'y');
        brush(cv, [[x0 - 10, 340], [(x0 + x1) / 2, 354], [x1 + 10, 340]], 30, DEEP, 0.6, 'x');
        brush(cv, [[x0 - 10, 428], [(x0 + x1) / 2, 434], [x1 + 10, 428]], 14, DEEP, 0.7, 'x');
        cv.add('</g>');
      }
      // the body and the near legs laid in as one white piece, so the legs run on out of it, and shaded as one: cream
      // light along the back, the form turning cool along the flank, blue-grey under the belly, down the fronts of the
      // legs, round the rump and under the neck
      const near = [nearHind, nearFront].map((leg) => spline(leg));
      lay(cv, torso, WHITE);
      for (const d of near) lay(cv, d, WHITE);
      const whole = [torso, ...near].join(' ');
      cv.add(`<g clip-path="${within(cv, whole)}">`);
      wash(cv, blob(rnd, [196, 150], 150, 44, 4, 0.05), CREAM, 16, 0.7);
      brush(cv, [[66, 200], [100, 152], [180, 122], [262, 126], [334, 174]], 40, CREAM, 0.8, 'x');
      brush(cv, [[96, 166], [160, 136], [236, 130], [294, 150]], 18, LIGHT, 0.9, 'x');
      wash(cv, blob(rnd, [230, 296], 150, 34, 0, 0.05), COOL, 18, 0.7);
      brush(cv, [[146, 334], [210, 352], [270, 356], [326, 340]], 36, COOL, 0.9, 'x');
      brush(cv, [[170, 348], [230, 358], [292, 352]], 14, SHADE, 0.75, 'x');
      brush(cv, [[74, 214], [62, 262], [68, 330], [68, 420]], 20, COOL, 0.6, 'y');
      brush(cv, [[166, 300], [152, 350], [140, 404]], 30, COOL, 0.95, 'y');
      brush(cv, [[168, 310], [156, 356], [146, 404]], 12, SHADE, 0.7, 'y');
      brush(cv, [[368, 300], [376, 350], [388, 404]], 28, COOL, 0.95, 'y');
      brush(cv, [[372, 306], [380, 354], [392, 404]], 12, SHADE, 0.7, 'y');
      for (const [x0, x1] of [[60, 146], [330, 408]]) brush(cv, [[x0, 430], [(x0 + x1) / 2, 437], [x1, 430]], 12, SHADE, 0.8, 'x');
      wash(cv, blob(rnd, [158, 318], 22, 30, 0, 0.05), COOL, 10, 0.6);
      // the round of the haunch and of the shoulder, each a little shade brushed down beside its line
      brush(cv, [[180, 236], [186, 272], [180, 306]], 18, COOL, 0.55, 'y');
      brush(cv, [[290, 232], [284, 264], [292, 296]], 18, COOL, 0.55, 'y');
      brush(cv, [[364, 236], [372, 280], [362, 316]], 30, COOL, 0.85, 'y');
      // flecks of the fur: warm along the back, cool and white down the legs, a few faint ones over the flank
      strokes(cv, rnd, torso, [62, 118, 340, 200], { count: 36, colours: [LIGHT, '#e8cb94'], flow: () => -12, spread: 22, length: 14, width: 2.2,
        opacity: [0.4, 0.8], bend: 0.2 });
      strokes(cv, rnd, whole, [70, 270, 400, 420], { count: 36, colours: [SHADE, WHITE], flow: () => 80, spread: 24, length: 12, width: 2,
        opacity: [0.3, 0.6], bend: 0.2 });
      strokes(cv, rnd, torso, [70, 200, 360, 290], { count: 24, colours: [COOL], flow: () => 0, spread: 30, length: 10, width: 1.8,
        opacity: [0.2, 0.4], bend: 0.2 });
      cv.add('</g>');
      // the ears behind the head, the far one in shade; then the head: cream over the top, blue-grey under the jaw
      for (const [c, r, fill] of [[[386, 199], 15, COOL], [[362, 205], 19, WHITE]]) {
        const [at] = H([c]);
        lay(cv, blob(rnd, at, r * 1.1, r, 0, 0.05), fill);
        wash(cv, blob(rnd, [at[0] + 1, at[1] + 2], r * 0.55, r * 0.5, 0, 0.05), COOL, 3, 0.8);
      }
      lay(cv, head, WHITE);
      cv.add(`<g clip-path="${within(cv, head)}">`);
      brush(cv, H([[346, 222], [384, 206], [428, 216], [474, 248]]), 28, CREAM, 0.85, 'x');
      brush(cv, H([[354, 300], [406, 306], [452, 292], [484, 276]]), 28, COOL, 0.9, 'x');
      wash(cv, blob(rnd, H([[470, 274]])[0], 15, 9, 20, 0.05), SHADE, 4, 0.5);
      strokes(cv, rnd, head, [336, 196, 490, 246], { count: 12, colours: [LIGHT], flow: () => 22, spread: 20, length: 12, width: 2,
        opacity: [0.4, 0.8], bend: 0.2 });
      cv.add('</g>');
    });
    s.paint((cv) => {
      // the pencil line, open in places: up the rump and over the back, the belly between the legs, round each leg
      line(cv, [[72, 290], [58, 250], [58, 206], [74, 168], [104, 142], [146, 123], [194, 115]], 5.8, { start: 0.4, end: 0.5 });
      line(cv, [[180, 116], [248, 119], [290, 137], [318, 158], [334, 176]], 5.4, { start: 0.5, end: 0.4 });
      line(cv, [[154, 336], [198, 350], [244, 354], [276, 352]], 4.6, { start: 0.3, end: 0.3 });
      // the haunch over the near hind leg and the shoulder over the near foreleg, a few thin strokes inside the white
      line(cv, [[168, 300], [170, 268], [156, 236], [130, 220]], 3.4, { start: 0.2, end: 0.15, peak: 0.6 });
      line(cv, [[302, 292], [292, 262], [296, 232]], 3.2, { start: 0.25, end: 0.15, peak: 0.5 });
      for (const leg of [nearHind, nearFront]) line(cv, leg, 5.4, { start: 0.3, end: 0.3, count: 60 });
      for (const leg of [farHind, farFront]) line(cv, leg.slice(1, -1), 4.4, { start: 0.3, end: 0.3, count: 50 });
      // toes at the front of each foot
      for (const [x, y] of [[396, 424], [388, 426], [234, 422], [227, 424], [138, 424], [131, 426], [306, 424], [299, 426]]) {
        line(cv, [[x, y], [x - 2, y + 9]], 2.4, { start: 0.6, end: 0.4 });
      }
      // the head: the ears, the brow down to the nose, under the jaw and up the throat
      line(cv, H([[346, 214], [343, 201], [350, 189], [363, 186], [375, 192]]), 4.6, { start: 0.3, end: 0.3 });
      line(cv, H([[377, 193], [378, 185], [387, 181], [397, 185], [400, 195]]), 4, { start: 0.3, end: 0.3 });
      line(cv, H([[372, 202], [400, 203], [426, 214], [450, 230], [470, 243], [484, 255], [488, 268]]), 5.4, { start: 0.4, end: 0.3 });
      line(cv, H([[482, 280], [466, 288], [444, 294], [420, 302], [392, 308], [364, 304], [352, 294]]), 5.2, { start: 0.3, end: 0.4 });
      // the face: the black nose at the tip, the eye, a short mouth
      const [nose, eye] = H([[476, 262], [424, 230]]);
      cv.add(`<g fill="${BLACK}" filter="${crayon(cv, rnd, { keep: 3.6, tear: 1.2, grain: 1.2 })}">`
        + `<path d="${blob(rnd, nose, 13, 10.5, 20, 0.04)}"/><path d="${blob(rnd, eye, 6.6, 7.6, 10, 0.04)}"/></g>`);
      line(cv, H([[472, 279], [462, 283], [454, 284]]), 3, { start: 0.6, end: 0.3 });
    });
    return s.done({ finish: { paint: 0, grain: 0.008, contrast: 0, saturation: 1, warmth: 0 } });
  },
};
