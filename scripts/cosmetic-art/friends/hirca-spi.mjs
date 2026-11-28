import { blob, crayon, painter, softly, strokes, within } from '../brush.mjs';
import { spline } from '../kit.mjs';
import { Still } from '../still.mjs';

export const piece = {
  key: 'hirca-spi',
  ku: 'Hirça Spî',
  en: 'White bear',
  // a round, chunky white bear plodding off to our left, seen from its side with its face turned a little toward us:
  // its body one big soft ball, the small head at the front of it with a little ear over the brow and another on the
  // crown, two dot eyes, a cream muzzle with a dark nose and a small smile, and short sturdy legs; painted creamy white,
  // warm where the light falls on its back, soft blue-grey under its belly and round its rump, and a soft pencil line
  still(rnd) {
    const s = new Still(rnd).place([-6, 0], 1.05);
    const WHITE = '#f8f3e9';
    const LIGHT = '#fffbf2';
    const CREAM = '#f0dcb6';
    const WARM = '#dccab0';
    const COOL = '#ccd3dd';
    const SHADE = '#a9b5c4';
    const MUZZLE = '#f3e5cc';
    const EAR = '#d6d3d4';
    const BLACK = '#22170f';
    const INK = '#2a1c16';
    const { lay, brush, line } = painter(rnd, INK);

    // the whole bear in one outline: over the crown and the round of the back, down the rump to the hind foot, under
    // the belly, down the back of the forelegs and along their feet, up the chest to the snout and over the brow
    const P = [[98, 150], [134, 114], [188, 82], [252, 60], [306, 56], [362, 64], [410, 88], [446, 128], [466, 182], [468, 240], [456, 296], [434, 342],
      [408, 378], [390, 410], [386, 432], [390, 446], [360, 451], [330, 450], [320, 442], [324, 420], [328, 390], [330, 366], [298, 362], [264, 364],
      [240, 374], [238, 404], [240, 432], [244, 446], [214, 451], [186, 450], [179, 443], [172, 450], [146, 451], [120, 450], [112, 442], [116, 420],
      [112, 390], [102, 356], [86, 318], [72, 288], [62, 258], [56, 226], [60, 192], [74, 166]];
    const bear = spline(P);
    const ear = blob(rnd, [88, 148], 17, 16, -20, 0.05);
    const muzzle = spline([[96, 212], [122, 218], [134, 236], [128, 256], [106, 266], [82, 266], [68, 256], [72, 236], [84, 220]]);
    // the far foreleg, set back in shade behind the near one
    const farFore = spline([[176, 340], [242, 344], [238, 404], [240, 432], [244, 446], [214, 451], [186, 450], [179, 443], [178, 400]]);

    s.paint((cv) => {
      // the little ear over the brow, shaded inside
      lay(cv, ear, WHITE, 3.2);
      lay(cv, blob(rnd, [89, 150], 8.5, 8, -20, 0.06), EAR, 2.6);
      lay(cv, bear, WHITE, 3.2);
      cv.add(`<g clip-path="${within(cv, bear)}">`);
      // the light and shade laid on as glazes, their edges softened: warm cream over the brow and the back where the
      // light falls, blue-grey under the belly, down the legs and round the far side of the rump
      const glaze = (pts, colour, opacity, soft) =>
        cv.add(`<path d="${spline(pts)}" fill="${colour}" fill-opacity="${opacity}" filter="${softly(cv, soft)}"/>`);
      glaze([[70, 172], [120, 110], [200, 70], [300, 54], [390, 74], [330, 112], [230, 132], [150, 164], [96, 206]], CREAM, 0.75, 12);
      glaze([[96, 330], [200, 330], [300, 316], [400, 284], [460, 200], [500, 480], [80, 480]], COOL, 0.7, 14);
      glaze([[180, 372], [300, 364], [380, 350], [440, 300], [500, 300], [500, 480], [170, 480]], SHADE, 0.35, 10);
      cv.add(`<g clip-path="${within(cv, farFore)}">`);
      glaze([[160, 360], [250, 366], [250, 460], [160, 460]], SHADE, 0.6, 6);
      cv.add('</g>');
      // the brushwork over it: light along the back, the round of the rump turning away, the belly and the soles in shade
      brush(cv, [[84, 180], [136, 122], [216, 82], [300, 70], [372, 84]], 22, LIGHT, 0.9, 'x');
      brush(cv, [[170, 120], [250, 100], [330, 100], [400, 122]], 26, CREAM, 0.5, 'x');
      brush(cv, [[436, 150], [460, 214], [452, 288], [420, 348], [392, 392]], 34, COOL, 0.65, 'y');
      brush(cv, [[458, 210], [458, 262], [440, 318]], 14, SHADE, 0.55, 'y');
      brush(cv, [[244, 372], [290, 366], [330, 372]], 16, SHADE, 0.6, 'x');
      for (const [x0, x1] of [[112, 178], [180, 244], [320, 392]]) brush(cv, [[x0, 444], [(x0 + x1) / 2, 450], [x1, 444]], 12, SHADE, 0.7, 'x');
      brush(cv, [[332, 370], [336, 404], [330, 436]], 16, COOL, 0.7, 'y');
      brush(cv, [[118, 380], [124, 412], [120, 440]], 16, LIGHT, 0.7, 'y');
      // a warm shade under the chin, where the head turns in to the chest
      glaze([[70, 276], [110, 280], [150, 306], [150, 344], [110, 336]], WARM, 0.35, 10);
      // strokes round the ball of the body, following its curve: a warm one over the shoulder, cool ones under the belly
      brush(cv, [[150, 196], [210, 150], [290, 134], [370, 150]], 18, CREAM, 0.45, 'x');
      brush(cv, [[140, 330], [220, 346], [310, 338], [390, 300], [432, 240]], 22, COOL, 0.55, 'x');
      // flecks of fur lying round the ball as well: warm along the back, cool and white over the flank and down the legs
      const round = (x, y) => (Math.atan2(y - 236, x - 290) * 180) / Math.PI + 90;
      strokes(cv, rnd, bear, [100, 64, 440, 170], { count: 40, colours: [LIGHT, '#e6cfa2'], flow: round, spread: 22, length: 14, width: 2.2,
        opacity: [0.4, 0.8], bend: 0.2 });
      strokes(cv, rnd, bear, [120, 170, 470, 360], { count: 36, colours: [COOL, LIGHT], flow: round, spread: 22, length: 13, width: 2,
        opacity: [0.3, 0.6], bend: 0.2 });
      strokes(cv, rnd, bear, [110, 360, 400, 446], { count: 24, colours: [SHADE, LIGHT], flow: () => 88, spread: 16, length: 11, width: 2,
        opacity: [0.3, 0.6], bend: 0.2 });
      // the ear on the crown, a little cup of shade; the cream muzzle, lit along its top
      lay(cv, blob(rnd, [158, 166], 13, 9, 0, 0.06), EAR, 2.6);
      lay(cv, muzzle, MUZZLE, 2.6);
      cv.add(`<g clip-path="${within(cv, muzzle)}">`);
      brush(cv, [[80, 226], [104, 216], [130, 226]], 12, LIGHT, 0.9, 'x');
      brush(cv, [[76, 262], [104, 270], [134, 250]], 12, WARM, 0.7, 'x');
      cv.add('</g>');
      cv.add('</g>');
    });
    s.paint((cv) => {
      // the pencil line, open in places: round the ear, over the crown and the back, down the rump to the hind foot, the
      // belly, the forelegs and their feet, and up the chest to the snout
      line(cv, [[80, 162], [72, 150], [74, 136], [88, 130], [102, 136]], 4.4, { start: 0.3, end: 0.3 });
      line(cv, P.slice(0, 7), 5.2, { start: 0.3, end: 0.5 });
      line(cv, [[392, 78], ...P.slice(6, 16)], 5.4, { start: 0.4, end: 0.3 });
      line(cv, P.slice(15, 22), 4.8, { start: 0.3, end: 0.3 });
      line(cv, P.slice(21, 25), 4.2, { start: 0.3, end: 0.3 });
      line(cv, P.slice(24, 31), 4.8, { start: 0.3, end: 0.3 });
      line(cv, P.slice(30, 41), 5.2, { start: 0.3, end: 0.4 });
      line(cv, P.slice(40, 44), 4.8, { start: 0.4, end: 0.2 });
      // the near foreleg against the far one, and the haunch over the hind leg
      line(cv, [[174, 362], [177, 396], [178, 426], [179, 443]], 4.4, { start: 0.15, end: 0.5 });
      line(cv, [[396, 312], [376, 334], [358, 358], [348, 382]], 3, { start: 0.1, end: 0.15, peak: 0.5 });
      // toes at the front of each foot
      for (const [x, y] of [[124, 448], [134, 449], [194, 448], [204, 449], [332, 448], [342, 449]]) {
        line(cv, [[x, y - 9], [x + 1, y]], 2.4, { start: 0.3, end: 0.7 });
      }
      // the ear on the crown, and the muzzle
      line(cv, [[144, 172], [146, 158], [158, 152], [170, 156], [174, 170]], 4.2, { start: 0.3, end: 0.3 });
      line(cv, [[84, 220], [96, 211], [122, 217], [134, 236], [128, 256], [108, 266]], 4, { start: 0.3, end: 0.3, peak: 0.4 });
      // the face: the nose at the tip of the muzzle, two dot eyes, a small smile
      cv.add(`<g fill="${BLACK}" filter="${crayon(cv, rnd, { keep: 3.6, tear: 1.2, grain: 1.2 })}">`
        + `<path d="${blob(rnd, [82, 252], 13, 10, -20, 0.04)}"/><path d="${blob(rnd, [74, 202], 7.5, 8.5, 0, 0.04)}"/>`
        + `<path d="${blob(rnd, [148, 204], 7.5, 8.5, 0, 0.04)}"/></g>`);
      line(cv, [[96, 262], [106, 266], [116, 260]], 3, { start: 0.4, end: 0.6 });
    });
    return s.done({ finish: { paint: 0, grain: 0.008, contrast: 0, saturation: 1, warmth: 0 } });
  },
};
