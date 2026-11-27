import { blob, crayon, mark, painter, strokes, within } from '../brush.mjs';
import { spline } from '../kit.mjs';
import { Still } from '../still.mjs';

export const piece = {
  key: 'mirisk',
  ku: 'Mirîşk',
  en: 'Hen',
  // A plump russet hen standing side-on to the left, with a cream breast, a wing of layered feathers and a fan of darker
  // tail feathers rising behind. She has a red comb and wattle, a yellow beak, a bright amber eye and yellow legs.
  still(rnd) {
    const s = new Still(rnd).place([-27, -20], 0.98);
    const COAT = '#b9653a';
    const SHADE = '#97492b';
    const DEEP = '#73331f';
    const LIGHT = '#d68a52';
    const GOLD = '#e8ad68';
    const CREAM = '#f1dcb7';
    const CREAM_SHADE = '#dcb98c';
    const [TAIL, TAIL_LIT, TAIL_DEEP] = ['#783722', '#a65c3a', '#4c2316'];
    const [COMB, COMB_LIT, COMB_DEEP] = ['#d8402e', '#f27b60', '#a62a20'];
    const [BEAK, BEAK_SHADE] = ['#f1b63a', '#c98723'];
    const [LEG, LEG_SHADE] = ['#ecb63e', '#c88b26'];
    const INK = '#2a1c16';
    const { lay, wash, brush, line } = painter(rnd, INK);
    // Parts whose whole edge shows are drawn round in one pencil stroke.
    const ringed = (cv, d, w, room) => {
      const filter = crayon(cv, rnd, { keep: 3.4, tear: 1.4, grain: 1.1, room });
      cv.add(`<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" filter="${filter}"/>`);
    };
    const flecks = { spread: 20, length: 12, width: 2, bend: 0.2 };

    const coat = spline([
      [158, 118], [192, 124], [214, 148], [220, 184], [236, 214], [276, 232], [334, 238], [390, 230], [428, 252], [446, 298], [440, 346], [412, 388],
      [360, 416], [290, 428], [216, 420], [156, 396], [114, 354], [96, 302], [102, 254], [120, 220], [114, 196], [110, 160], [126, 130],
    ]);
    const tail = spline([
      [366, 252], [366, 196], [376, 146], [394, 110], [412, 100], [424, 112], [440, 100], [458, 106], [464, 126], [478, 130], [488, 146], [484, 168],
      [492, 184], [486, 208], [466, 240], [446, 280], [430, 300], [400, 290],
    ]);
    // The fan is one shape parted by lines from each notch toward the rump, so it reads as feathers, not fingers.
    const parts = [[[424, 114], [412, 172], [398, 240]], [[464, 128], [440, 190], [416, 250]], [[485, 168], [458, 216], [432, 264]]];
    const WING = [
      [206, 290], [224, 258], [268, 240], [330, 240], [384, 254], [420, 280], [440, 312], [416, 316], [420, 336], [390, 334], [388, 354], [358, 348],
      [350, 364], [318, 356], [276, 356], [238, 340], [212, 318],
    ];
    const COMB_EDGE = [[130, 128], [123, 106], [134, 91], [150, 98], [156, 82], [174, 78], [182, 94], [196, 88], [208, 100], [205, 122]];
    const comb = spline([...COMB_EDGE, [190, 134], [150, 136]]);
    const wattle = spline([[116, 184], [134, 186], [142, 200], [140, 218], [132, 228], [124, 222], [118, 230], [108, 224], [106, 206]]);
    const beak = spline([[120, 150], [104, 152], [86, 160], [80, 168], [92, 174], [108, 180], [122, 180]]);
    // Each foot has three toes forward and one back, as a hen stands.
    const foot = ([x, y], k) => [
      [[x, y], [x - 18, y + 2], [x - 32 - k, y + 6]],
      [[x, y], [x - 12, y + 10], [x - 22, y + 18]],
      [[x, y], [x + 14, y + 2], [x + 22, y]],
    ];
    const legs = [
      { shank: [[312, 404], [314, 432], [316, 452]], toes: foot([316, 452], 0), fill: LEG_SHADE },
      { shank: [[256, 408], [253, 436], [250, 458]], toes: foot([250, 458], 4), fill: LEG },
    ];

    s.paint((cv) => {
      // The pencil goes under each leg and toe a little wider than its paint, so the joins show no seams.
      const stalk = { start: 0.9, end: 0.8, peak: 0.4, tremble: 0.06 };
      for (const { shank, toes, fill } of legs) {
        for (const p of [shank, ...toes]) line(cv, p, 17, stalk);
        for (const p of [shank, ...toes]) lay(cv, mark(rnd, p, 10, stalk), fill, 2.9);
        brush(cv, [[shank[0][0] + 2, shank[0][1] + 20], shank[1], [shank[2][0] + 1, shank[2][1] - 4]], 4, '#f7d47a', 0.8, 'y');
      }
      // The tail is a warm dark brown rather than near-black so it still reads over a dark picture.
      lay(cv, tail, TAIL, 2.9);
      cv.add(`<g clip-path="${within(cv, tail)}">`);
      for (const pts of [
        [[382, 250], [384, 180], [404, 116]],
        [[404, 254], [418, 180], [444, 116]],
        [[420, 266], [444, 200], [478, 148]],
        [[432, 286], [460, 236], [484, 196]],
      ]) brush(cv, pts, 16, TAIL_LIT, 0.85, 'y');
      for (const pts of parts) brush(cv, pts.map(([x, y]) => [x + 6, y + 4]), 12, TAIL_DEEP, 0.8, 'y');
      strokes(cv, rnd, tail, [366, 104, 488, 300], { ...flecks, count: 24, colours: ['#a8603d'], flow: () => -62, length: 16, opacity: [0.3, 0.6] });
      cv.add('</g>');
      ringed(cv, tail, 4.6, [300, 60, 212, 260]);
      for (const pts of parts) line(cv, pts, 3.6, { start: 0.7, end: 0.1, peak: 0.2 });
      lay(cv, comb, COMB, 2.9);
      cv.add(`<g clip-path="${within(cv, comb)}">`);
      brush(cv, [[134, 100], [160, 88], [190, 96]], 9, COMB_LIT, 0.85, 'x');
      brush(cv, [[140, 130], [170, 128], [200, 120]], 10, COMB_DEEP, 0.7, 'x');
      cv.add('</g>');

      // Head and body are one shape, so the shade can be brushed across the join without a seam.
      lay(cv, coat, COAT);
      cv.add(`<g clip-path="${within(cv, coat)}">`);
      brush(cv, [[150, 404], [240, 430], [330, 426], [420, 380]], 34, SHADE, 0.85, 'x');
      brush(cv, [[432, 260], [450, 310], [432, 370]], 26, SHADE, 0.7, 'y');
      brush(cv, [[240, 222], [320, 236], [400, 228]], 14, LIGHT, 0.6, 'x');
      lay(cv, blob(rnd, [142, 318], 62, 88, -14, 0.05), CREAM, 2.4);
      wash(cv, blob(rnd, [176, 384], 48, 24, -20, 0.04), CREAM_SHADE, 10, 0.8);
      brush(cv, [[96, 300], [104, 350], [130, 392]], 16, CREAM_SHADE, 0.6, 'y');
      // Russet feather tips overlap the cream along its edge, so the breast grows out of the coat instead of sitting on it.
      for (const [x, y] of [[176, 238], [192, 262], [204, 288], [208, 316], [206, 344], [196, 370], [178, 394], [154, 406], [130, 226]]) {
        brush(cv, [[x + 22, y - 6], [x + 4, y], [x - 12, y + 8]], 14, COAT, 0.9, 'x', 2.2);
      }
      for (const [x, y] of [[132, 268], [118, 300], [146, 296], [130, 330], [160, 322], [146, 358], [176, 350], [118, 362]]) {
        lay(cv, mark(rnd, [[x - 10, y - 3], [x, y + 4], [x + 10, y - 3]], 3.4, { start: 0.2, end: 0.2, peak: 0.5, tremble: 0.1 }), '#c99a68', 2.4);
      }
      strokes(cv, rnd, coat, [96, 230, 210, 400], { ...flecks, count: 18, colours: ['#fbecd2'], flow: () => -70, length: 10, opacity: [0.4, 0.8] });
      for (const [x, y] of [[178, 132], [194, 140], [206, 156], [164, 140], [214, 176]]) {
        brush(cv, [[x, y], [x + 13, y + 38], [x + 20, y + 76]], 9, GOLD, 0.8, 'y', 2.3);
      }
      for (const [x, y] of [[186, 150], [200, 166], [172, 160]]) brush(cv, [[x, y], [x + 10, y + 34], [x + 18, y + 62]], 6, SHADE, 0.6, 'y');
      strokes(cv, rnd, coat, [230, 220, 440, 300], { ...flecks, count: 26, colours: [GOLD], flow: () => 8, length: 14, opacity: [0.3, 0.6] });
      strokes(cv, rnd, coat, [200, 360, 420, 420], { ...flecks, count: 20, colours: [LIGHT], flow: () => -6, length: 11, opacity: [0.25, 0.5] });
      wash(cv, blob(rnd, [140, 170], 22, 18, 0, 0.05), COMB, 6, 0.45);
      cv.add('</g>');

      // The wing is brushed in rows from the long feathers at its tip forward to the small ones at the shoulder, so each
      // row overlaps the one behind it.
      const wing = spline(WING);
      lay(cv, wing, SHADE, 2.8);
      cv.add(`<g clip-path="${within(cv, wing)}">`);
      for (const [x, y] of [[300, 342], [330, 340], [360, 334], [388, 322], [414, 304]]) {
        brush(cv, [[x - 40, y - 14], [x, y], [x + 40, y + 6]], 18, DEEP, 0.85, 'x');
        brush(cv, [[x - 40, y - 20], [x - 4, y - 8], [x + 30, y - 4]], 6, LIGHT, 0.7, 'x');
      }
      for (const [x, y] of [[252, 314], [284, 316], [316, 312], [348, 306], [378, 294], [404, 280]]) {
        brush(cv, [[x - 30, y - 18], [x, y - 4], [x + 26, y]], 16, COAT, 0.95, 'x');
        brush(cv, [[x - 28, y - 22], [x - 4, y - 12], [x + 18, y - 8]], 5, GOLD, 0.7, 'x');
      }
      for (const [x, y] of [[232, 284], [258, 276], [286, 272], [314, 268], [342, 266], [370, 268]]) {
        brush(cv, [[x - 20, y - 12], [x, y], [x + 16, y]], 12, LIGHT, 0.85, 'x');
      }
      brush(cv, [[230, 252], [300, 244], [380, 256]], 16, COAT, 0.8, 'x');
      cv.add('</g>');

      lay(cv, wattle, COMB, 2.9);
      cv.add(`<g clip-path="${within(cv, wattle)}">`);
      brush(cv, [[110, 196], [114, 210], [118, 224]], 6, COMB_LIT, 0.8, 'y');
      brush(cv, [[138, 196], [136, 212], [130, 228]], 8, COMB_DEEP, 0.7, 'y');
      cv.add('</g>');
      lay(cv, beak, BEAK, 2.9);
      cv.add(`<g clip-path="${within(cv, beak)}">`);
      brush(cv, [[118, 176], [100, 176], [84, 170]], 8, BEAK_SHADE, 0.8, 'x');
      cv.add('</g>');
    });

    s.paint((cv) => {
      // The pencil line goes on last and is left open in places, as a hand-drawn line is.
      const nape = [[110, 150], [118, 132], [136, 120], [160, 117], [190, 123], [212, 146], [219, 184], [236, 214], [266, 228]];
      line(cv, nape, 5.8, { start: 0.4, end: 0.2, count: 40 });
      line(cv, [[300, 236], [340, 238], [390, 230], [424, 250], [442, 286]], 5, { start: 0.2, end: 0.5 });
      line(cv, [[446, 304], [440, 346], [412, 388], [360, 416], [300, 428]], 5.8, { start: 0.5, end: 0.3, count: 40 });
      line(cv, [[268, 427], [216, 420], [156, 396], [114, 354], [96, 302], [102, 254], [118, 222]], 6, { start: 0.3, end: 0.4, peak: 0.4, count: 40 });
      line(cv, [...WING, [214, 320]], 4.8, { start: 0.4, end: 0.3, peak: 0.5, count: 80 });
      // Thin scallops along two rows of the wing mark where one layer of feathers lies over the next.
      const scallop = { start: 0.2, end: 0.2, count: 12 };
      for (const [x, y] of [[248, 316], [280, 320], [312, 316], [344, 310], [374, 298]]) line(cv, [[x - 16, y - 8], [x, y + 2], [x + 16, y - 6]], 2.8, scallop);
      for (const [x, y] of [[232, 290], [258, 284], [286, 280], [314, 276], [342, 274]]) line(cv, [[x - 12, y - 6], [x, y + 1], [x + 12, y - 5]], 2.4, scallop);
      line(cv, [...COMB_EDGE, [192, 132]], 4.6, { start: 0.4, end: 0.3, count: 50 });
      ringed(cv, wattle, 4.2, [80, 160, 90, 90]);
      ringed(cv, beak, 4.2, [60, 130, 80, 70]);
      line(cv, [[118, 168], [102, 168], [88, 167]], 2.4, { start: 0.6, end: 0.2 });
      // An amber ring round the pupil and a speck of light make the eye bright against the russet.
      cv.add(`<path d="${blob(rnd, [150, 160], 11, 11.5, 0, 0.03)}" fill="#e8a33a"/>`);
      const pupil = blob(rnd, [149, 160], 7, 7.5, 0, 0.03);
      cv.add(`<g fill="${INK}" filter="${crayon(cv, rnd, { keep: 3.6, tear: 1.2, grain: 1.2 })}"><path d="${pupil}"/></g>`);
      ringed(cv, blob(rnd, [150, 160], 11, 11.5, 0, 0.03), 3, [120, 130, 60, 60]);
      cv.add('<circle cx="146" cy="156" r="2.8" fill="#fffaf0"/>');
    });
    return s.done({ finish: { paint: 0, grain: 0.008, contrast: 0, saturation: 1, warmth: 0 } });
  },
};
