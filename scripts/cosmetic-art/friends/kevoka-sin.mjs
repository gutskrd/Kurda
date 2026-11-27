import { blob, crayon, mark, painter, strokes, within } from '../brush.mjs';
import { spline } from '../kit.mjs';
import { Still } from '../still.mjs';

export const piece = {
  key: 'kevoka-sin',
  ku: 'Kevoka Şîn',
  en: 'Blue dove',
  // a plump blue dove sitting three-quarters on to us and facing right, its chest puffed out: painted in soft blues and
  // blue-greys with a pale belly and a green and violet sheen on its neck, its wing folded in rows of feathers whose
  // edges are brushed in pale, the far wingtip showing behind and the tail dark at its tip; a dark eye in a pale ring,
  // a pink beak and pink toes
  still(rnd) {
    const s = new Still(rnd).place([-8, -16], 1.04);
    const BLUE = '#8ea6c6';
    const LIGHT = '#a9bcd6';
    const SHADE = '#6c86ab';
    const DEEP = '#4f678e';
    const HEAD = '#788eb3';
    const BELLY = '#d3deeb';
    const WING = '#9cb1cd';
    const EDGE = '#dfe8f2';
    const TAIL = '#7891b5';
    const BAND = '#3f5378';
    const [GREEN, VIOLET] = ['#4fa88e', '#9a72c0'];
    const [PINK, PINK_DEEP, CERE] = ['#e597a2', '#c4646f', '#f2e2df'];
    const INK = '#2b2230';
    const { lay, wash, brush, line } = painter(rnd, INK);

    const body = spline([[365, 81], [398, 90], [420, 110], [429, 130], [427, 150], [420, 172], [416, 196], [426, 224], [440, 258], [448, 298], [442, 340],
      [424, 378], [396, 410], [354, 434], [302, 446], [250, 444], [206, 432], [172, 414], [152, 396], [144, 370], [146, 340], [160, 302], [186, 266],
      [222, 236], [262, 212], [296, 194], [316, 168], [321, 143], [332, 108], [348, 88]]);
    const tail = spline([[178, 300], [146, 318], [110, 340], [78, 362], [58, 380], [54, 396], [64, 408], [90, 413], [120, 412], [154, 404], [182, 392]]);
    // the far wing's tip, seen past the back between the near wing and the tail, in the shade of the body
    const far = spline([[196, 284], [152, 310], [112, 336], [82, 358], [76, 364], [106, 358], [146, 342], [188, 314]]);
    const wing = spline([[334, 192], [352, 218], [362, 252], [360, 288], [346, 318], [318, 340], [276, 356], [226, 368], [178, 376], [136, 380], [106, 382],
      [88, 380], [84, 372], [100, 356], [130, 326], [170, 290], [208, 258], [250, 232], [290, 212], [314, 198]]);
    // a feather seen folded: a long oval whose round tip lies at `tip`, its root running back along `dir` under the row before it
    const feather = (tip, dir, len, wid) => {
      const a = Math.atan2(dir[1], dir[0]);
      return blob(rnd, [tip[0] - Math.cos(a) * len * 0.5, tip[1] - Math.sin(a) * len * 0.5], len / 2, wid / 2, (a * 180) / Math.PI, 0.03);
    };
    // the wing's rows, laid from the long flight feathers at the back to the small ones at the shoulder, each row over the roots of the last
    const rows = [
      { tips: [[88, 377], [110, 378], [132, 376], [154, 373]], dir: [-0.88, 0.47], len: 170, wid: 32, tint: ['#8ba2c2', '#94aac8'], inked: false },
      { tips: [[186, 372], [224, 366], [262, 356], [300, 342]], dir: [-0.8, 0.6], len: 110, wid: 44, tint: ['#98aecb', '#a1b5d0'], inked: true },
      { tips: [[190, 318], [222, 326], [256, 326], [290, 320], [322, 308]], dir: [-0.8, 0.6], len: 70, wid: 38, tint: ['#a3b7d2', '#9bb0cc'], inked: true },
      { tips: [[246, 288], [276, 292], [308, 288], [338, 276]], dir: [-0.78, 0.62], len: 50, wid: 32, tint: ['#aabdd6', '#a2b6d0'], inked: true },
    ];
    const toes = [
      [[[268, 436], [263, 450], [256, 458]], [[272, 438], [275, 452], [279, 460]], [[276, 436], [288, 448], [297, 453]]],
      [[[330, 432], [328, 450], [322, 464]], [[336, 434], [344, 452], [352, 464]], [[340, 432], [358, 446], [372, 452]]],
    ];

    s.paint((cv) => {
      // the toes under the belly, the far foot's in shade; the tail behind the body, dark across its tip; the far
      // wingtip over it
      for (const [i, foot] of toes.entries()) {
        for (const toe of foot) lay(cv, mark(rnd, toe, i ? 13 : 12, { start: 0.9, end: 0.55, peak: 0.3, tremble: 0.1 }), i ? PINK : '#d98390', 2.4);
        cv.add(`<g clip-path="${within(cv, 'M240 430 L390 430 L390 448 L240 448 Z')}">`);
        for (const toe of foot) brush(cv, toe, 12, PINK_DEEP, 0.5, 'y');
        cv.add('</g>');
      }
      lay(cv, tail, TAIL);
      cv.add(`<g clip-path="${within(cv, tail)}">`);
      brush(cv, [[180, 318], [126, 348], [74, 380]], 26, SHADE, 0.5, 'x');
      brush(cv, [[108, 376], [82, 394], [56, 398]], 34, BAND, 0.92, 'y');
      brush(cv, [[120, 404], [156, 398], [180, 386]], 18, DEEP, 0.4, 'x');
      cv.add('</g>');
      lay(cv, far, SHADE);
      cv.add(`<g clip-path="${within(cv, far)}">`);
      brush(cv, [[190, 292], [136, 324], [82, 360]], 12, DEEP, 0.6, 'x');
      cv.add('</g>');

      // the body from crown to rump; its head a darker blue; light brushed down the breast and shade along the back,
      // under the chin and the belly; the pale belly; and the sheen on the neck
      lay(cv, body, BLUE);
      cv.add(`<g clip-path="${within(cv, body)}">`);
      wash(cv, blob(rnd, [374, 128], 55, 53, 0, 0.04), HEAD, 6, 0.85);
      for (const [pts, w, o] of [
        [[[348, 96], [384, 90], [412, 112]], 16, 0.45],
        [[[400, 200], [420, 240], [430, 290], [424, 340]], 26, 0.6],
        [[[380, 230], [398, 270], [406, 320]], 22, 0.45],
      ]) brush(cv, pts, w, LIGHT, o, 'y');
      brush(cv, [[328, 116], [318, 166], [296, 198], [250, 228], [196, 262], [156, 316]], 34, SHADE, 0.55, 'x');
      brush(cv, [[324, 142], [308, 190], [266, 222]], 18, DEEP, 0.3, 'x');
      brush(cv, [[408, 160], [420, 178]], 14, SHADE, 0.4, 'y');
      lay(cv, blob(rnd, [410, 410], 100, 92, -30, 0.05), BELLY, 2.3);
      for (const [pts, w, o] of [
        [[[318, 384], [346, 352], [380, 322], [414, 300]], 18, 0.6],
        [[[300, 420], [330, 396], [362, 370]], 14, 0.45],
      ]) brush(cv, pts, w, BLUE, o, 'x');
      for (const [pts, w, o] of [
        [[[372, 340], [380, 380], [384, 424]], 26, 0.5],
        [[[404, 322], [410, 362], [404, 400]], 22, 0.6],
      ]) brush(cv, pts, w, '#e8eef5', o, 'y');
      wash(cv, blob(rnd, [404, 188], 26, 34, 20, 0.05), GREEN, 8, 0.7);
      wash(cv, blob(rnd, [422, 234], 24, 24, 30, 0.05), VIOLET, 8, 0.6);
      brush(cv, [[400, 168], [416, 196], [428, 226]], 14, GREEN, 0.55, 'y');
      brush(cv, [[414, 214], [432, 244], [442, 276]], 12, VIOLET, 0.5, 'y');
      brush(cv, [[444, 290], [442, 330], [424, 374], [392, 408]], 18, SHADE, 0.35, 'y');
      brush(cv, [[190, 432], [260, 446], [330, 440], [394, 410]], 22, SHADE, 0.55, 'x');
      // (scratches of paler paint down the breast and over the back, and a few darker ones along it)
      const scratch = { spread: 30, length: 10, width: 2, opacity: [0.3, 0.6], bend: 0.3 };
      strokes(cv, rnd, body, [330, 240, 446, 440], { ...scratch, count: 46, colours: ['#ffffff'], flow: () => 100 });
      strokes(cv, rnd, body, [150, 90, 420, 330], { ...scratch, count: 40, colours: [LIGHT], flow: () => 120, length: 12, width: 2.2 });
      strokes(cv, rnd, body, [150, 120, 340, 330], { ...scratch, count: 26, colours: [DEEP], flow: () => 140, spread: 20, length: 12, opacity: [0.2, 0.4] });
      cv.add('</g>');

      // the folded wing, row on row, each feather shaded at its root and edged pale at its tip
      lay(cv, wing, WING);
      cv.add(`<g clip-path="${within(cv, wing)}">`);
      brush(cv, [[350, 218], [300, 230], [240, 256], [180, 292], [120, 340]], 26, SHADE, 0.4, 'x');
      for (const row of rows) {
        const back = (k, tip) => [tip[0] - row.dir[0] * row.len * k, tip[1] - row.dir[1] * row.len * k];
        for (const [i, tip] of row.tips.entries()) {
          const d = feather(tip, row.dir, row.len, row.wid);
          lay(cv, d, row.tint[i % 2], 2.6);
          cv.add(`<g clip-path="${within(cv, d)}">`);
          brush(cv, [back(0.95, tip), back(0.45, tip)], row.wid * 0.7, SHADE, 0.5, 'x');
          const edged = crayon(cv, rnd, { keep: 2.2, tear: 1.5, grain: 1 });
          cv.add(`<path d="${d}" fill="none" stroke="${EDGE}" stroke-width="${row.inked ? 6 : 5}" stroke-opacity="0.8" filter="${edged}"/>`);
          cv.add('</g>');
        }
      }
      strokes(cv, rnd, wing, [80, 200, 360, 380], { count: 30, colours: [EDGE], flow: () => 150, spread: 16, length: 12, width: 1.8, opacity: [0.25, 0.5] });
      cv.add('</g>');
    });

    s.paint((cv) => {
      // the line, open where the light falls on the back and the belly: over the crown, down the nape and the back,
      // round the tail, down the throat and the puffed chest, under the belly; round the wing and the tips of its
      // feathers; and the toes
      line(cv, [[334, 106], [348, 88], [365, 81], [398, 90], [418, 108]], 5.2, { start: 0.4, end: 0.5 });
      line(cv, [[326, 126], [318, 164], [298, 192], [262, 212]], 5.4, { start: 0.3, end: 0.3 });
      line(cv, [[232, 228], [196, 256], [176, 280]], 4.6, { start: 0.2, end: 0.5 });
      line(cv, [[178, 300], [140, 322], [104, 344], [76, 364]], 4.8, { start: 0.3, end: 0.5 });
      line(cv, [[62, 376], [54, 394], [64, 408], [92, 413], [120, 412]], 5.2, { start: 0.4, end: 0.3 });
      line(cv, [[136, 410], [158, 403], [178, 392]], 4.2, { start: 0.3, end: 0.4 });
      line(cv, [[426, 154], [420, 174], [418, 198], [428, 226], [440, 258], [448, 296], [442, 336], [428, 370]], 6, { start: 0.3, end: 0.4, peak: 0.6 });
      line(cv, [[406, 398], [372, 424], [322, 442], [268, 446]], 5.6, { start: 0.3, end: 0.3 });
      line(cv, [[238, 442], [202, 430], [172, 412]], 4.4, { start: 0.3, end: 0.5 });
      line(cv, [[314, 198], [338, 194], [354, 218], [362, 252], [360, 288], [346, 318], [318, 340], [276, 356], [226, 368], [178, 376]], 5.2,
        { start: 0.3, end: 0.5, count: 40 });
      line(cv, [[152, 380], [118, 382], [96, 382], [84, 374]], 4.2, { start: 0.4, end: 0.3 });
      line(cv, [[270, 222], [250, 232], [208, 258], [170, 290], [130, 326], [104, 350]], 3.6, { start: 0.2, end: 0.2 });
      for (const row of rows.filter((r) => r.inked)) {
        for (const tip of row.tips) {
          // (an arc round the feather's tip, from one side of it to the other: `k` back along it, `j` across it)
          const at = (k, j) => [tip[0] - row.dir[0] * k - row.dir[1] * j, tip[1] - row.dir[1] * k + row.dir[0] * j];
          const w = row.wid * 0.44;
          line(cv, [at(8, w), at(0, w * 0.45), tip, at(0, -w * 0.5), at(10, -w)], 2.4, { start: 0.2, end: 0.2, peak: 0.5, count: 16 });
        }
      }
      for (const foot of toes) for (const toe of foot) line(cv, toe, 2.4, { start: 0.6, end: 0.2, count: 12 });

      // the face: the beak, its pale cere, the eye dark in a pale ring
      const beak = spline([[419, 120], [437, 126], [455, 134], [462, 140], [453, 145], [435, 145], [421, 144]]);
      lay(cv, beak, PINK, 2.6);
      cv.add(`<g clip-path="${within(cv, beak)}">`);
      brush(cv, [[423, 143], [441, 145], [459, 141]], 7, PINK_DEEP, 0.6, 'x');
      cv.add('</g>');
      lay(cv, blob(rnd, [425, 122], 9, 6, 20, 0.05), CERE, 2.4);
      line(cv, [[419, 119], [437, 125], [455, 133], [463, 140], [453, 145], [435, 145], [423, 145]], 3.4, { start: 0.4, end: 0.4 });
      line(cv, [[429, 138], [447, 139], [459, 140]], 1.8, { start: 0.5, end: 0.3 });
      lay(cv, blob(rnd, [389, 118], 14.5, 14, 0, 0.03), '#f2e9dc', 2.6);
      cv.add(`<g fill="${INK}" filter="${crayon(cv, rnd, { keep: 3.6, tear: 1.2, grain: 1.2 })}"><path d="${blob(rnd, [390, 118], 9, 9.4, 0, 0.03)}"/></g>`);
      cv.add('<circle cx="387.2" cy="114.8" r="2.6" fill="#fff" fill-opacity="0.9"/>');
    });
    return s.done({ finish: { paint: 0, grain: 0.008, contrast: 0, saturation: 1, warmth: 0 } });
  },
};
