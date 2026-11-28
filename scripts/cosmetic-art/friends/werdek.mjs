import { blob, crayon, crescent, painter, strokes, within } from '../brush.mjs';
import { spline } from '../kit.mjs';
import { Still } from '../still.mjs';

export const piece = {
  key: 'werdek',
  ku: 'Werdek',
  en: 'Duck',
  // a cream duck sitting on the water in side view, facing right: its round head high on a long upright neck, a flat
  // orange-yellow bill and a dark eye, its wing folded along its side with rounded feather tips at the back, its tail
  // tipped up; shaded in soft blue-grey with warm light on its crown and back, and a small blue ripple round it
  still(rnd) {
    const s = new Still(rnd).place([-30, 10], 1.06);
    const CREAM = '#f5ead5';
    const LIGHT = '#fffaf0';
    const WARM = '#e2ccad';
    const SHADE = '#a8b0c9';
    const DEEP = '#7f8daa';
    const WING = '#efe3cd';
    const [BILL, BILL_LIT, BILL_SHADE] = ['#f2a93b', '#f8cb6a', '#d7822f'];
    const [WATER, WATER_LIT, WATER_DEEP] = ['#a6c0d2', '#d9e7ee', '#7a98b3'];
    const INK = '#2a1c16';
    const { lay, wash, brush, line } = painter(rnd, INK);

    const body = spline([[350, 77], [383, 75], [412, 88], [429, 108], [436, 132], [430, 161], [425, 175], [413, 189], [400, 204], [393, 224], [394, 248],
      [404, 272], [420, 298], [430, 326], [428, 356], [414, 382], [380, 400], [320, 406], [260, 404], [204, 394], [160, 376], [122, 350], [96, 320], [82, 296],
      [74, 270], [96, 278], [128, 284], [168, 278], [212, 268], [254, 256], [290, 242], [312, 226], [322, 204], [322, 183], [316, 161], [313, 135], [319, 108],
      [332, 91]]);
    // the folded wing, its back end parted into three rounded feather tips
    const wing = spline([[360, 306], [352, 284], [330, 272], [296, 270], [254, 276], [208, 286], [164, 296], [130, 302], [106, 306], [120, 316], [140, 320],
      [150, 312], [166, 326], [184, 332], [196, 322], [212, 338], [236, 344], [282, 346], [326, 338], [350, 324]]);
    // the ripple the duck sits in, with two little wavelets ahead of its breast
    const water = spline([[136, 382], [170, 374], [216, 378], [268, 372], [320, 378], [372, 372], [420, 378], [436, 372], [448, 366], [460, 372], [472, 368],
      [482, 372], [488, 382], [482, 394], [456, 404], [400, 410], [320, 414], [240, 412], [180, 404], [142, 394]]);
    // the flat bill, tall at its root and widening a little again at its rounded tip
    const bill = spline([[429, 132], [451, 141], [473, 149], [488, 153], [496, 162], [489, 172], [467, 174], [446, 175], [431, 174], [426, 157]]);

    s.paint((cv) => {
      // the body in one piece from the crown to the tail: a warm tone down its side, soft blue-grey shade under the
      // chin, down the far side of the breast, under the tail, beneath the wing and low where it meets the water; light
      // brushed over the crown, the nape and along the back
      lay(cv, body, CREAM);
      cv.add(`<g clip-path="${within(cv, body)}">`);
      wash(cv, blob(rnd, [250, 336], 170, 40, -4, 0.05), WARM, 16, 0.9);
      brush(cv, [[140, 330], [220, 338], [300, 342], [370, 336]], 34, WARM, 0.45, 'x');
      crescent(cv, body, [-18, -22], { colour: SHADE, opacity: 0.85, soft: 9 });
      wash(cv, blob(rnd, [420, 179], 20, 30, 20, 0.05), SHADE, 8, 0.9);
      wash(cv, blob(rnd, [362, 195], 48, 13, 0, 0.05), SHADE, 8, 0.7);
      wash(cv, blob(rnd, [240, 360], 120, 12, 3, 0.05), SHADE, 7, 0.8);
      brush(cv, [[150, 380], [240, 394], [340, 396], [420, 382]], 30, SHADE, 0.8, 'x');
      for (const [pts, w, o, way] of [
        [[[170, 386], [260, 400], [360, 400], [418, 388]], 16, 0.5, 'x'],
        [[[424, 292], [434, 326], [428, 362]], 14, 0.45, 'y'],
        [[[403, 197], [397, 222], [398, 248]], 10, 0.45, 'y'],
        [[[70, 286], [96, 320], [130, 350]], 12, 0.4, 'x'],
      ]) brush(cv, pts, w, DEEP, o, way);
      wash(cv, blob(rnd, [354, 104], 32, 18, -20, 0.05), LIGHT, 7, 1);
      brush(cv, [[92, 280], [150, 284], [210, 272], [262, 256], [300, 234]], 20, LIGHT, 0.9, 'x');
      brush(cv, [[328, 108], [329, 161], [326, 204]], 16, LIGHT, 0.75, 'y');
      brush(cv, [[400, 236], [408, 266], [416, 294]], 12, LIGHT, 0.55, 'y');
      // (scratches of paler paint over the back and the breast, and a few blue-grey ones low on the body)
      const scratch = { spread: 24, length: 11, width: 2, opacity: [0.35, 0.65], bend: 0.3 };
      strokes(cv, rnd, body, [90, 244, 310, 296], { ...scratch, count: 24, colours: [LIGHT], flow: () => -14 });
      strokes(cv, rnd, body, [326, 86, 384, 138], { ...scratch, count: 10, colours: [LIGHT], flow: () => -30, length: 8 });
      strokes(cv, rnd, body, [396, 236, 430, 340], { ...scratch, count: 12, colours: [LIGHT], flow: () => 75 });
      strokes(cv, rnd, body, [150, 356, 420, 396], { ...scratch, count: 22, colours: [DEEP], flow: () => 0, opacity: [0.2, 0.4] });
      cv.add('</g>');

      // the wing: lit along its top and shaded below, a darker fold under its shoulder, each feather tip edged pale
      lay(cv, wing, WING);
      cv.add(`<g clip-path="${within(cv, wing)}">`);
      crescent(cv, wing, [-10, -16], { colour: SHADE, opacity: 0.8, soft: 6 });
      brush(cv, [[130, 318], [200, 334], [280, 344], [346, 328]], 12, SHADE, 0.5, 'x');
      brush(cv, [[124, 306], [190, 294], [260, 282], [330, 278]], 14, LIGHT, 0.85, 'x');
      for (const [x, y] of [[132, 314], [176, 326], [222, 338]]) wash(cv, blob(rnd, [x, y], 16, 6, 10, 0.05), LIGHT, 3, 0.75);
      strokes(cv, rnd, wing, [110, 276, 356, 344], { count: 18, colours: [LIGHT], flow: () => -8, spread: 16, length: 14, width: 1.8, opacity: [0.3, 0.6] });
      cv.add('</g>');

      // the water: a soft blue ripple the body sits in, darker just under the duck, a few pale glints across it
      lay(cv, water, WATER, 2.4);
      cv.add(`<g clip-path="${within(cv, water)}">`);
      wash(cv, blob(rnd, [290, 386], 150, 9, 0, 0.05), WATER_DEEP, 5, 0.7);
      brush(cv, [[180, 406], [300, 412], [420, 404]], 10, WATER_DEEP, 0.35, 'x');
      for (const [pts, w] of [
        [[[150, 394], [184, 398], [214, 400]], 6],
        [[[296, 402], [346, 402]], 5],
        [[[436, 390], [470, 384]], 6],
        [[[444, 374], [454, 370]], 4],
      ]) brush(cv, pts, w, WATER_LIT, 0.85, 'x');
      cv.add('</g>');
    });

    s.paint((cv) => {
      // the line, open where the light falls on the crown and the back: round the head, down the chin, the neck and
      // the breast, down the back of the neck, along the back to the tail and under it; the wing's scalloped edge and
      // its fold; the waterline and the wavelets
      line(cv, [[314, 139], [319, 110], [334, 91], [354, 77]], 5, { start: 0.3, end: 0.3 });
      line(cv, [[392, 77], [414, 90], [430, 110], [436, 132]], 5.4, { start: 0.3, end: 0.5 });
      line(cv, [[428, 169], [413, 189], [400, 205], [393, 226], [394, 250], [404, 274], [420, 300], [430, 328], [428, 354], [420, 372]], 5.8,
        { start: 0.4, end: 0.4, count: 40 });
      line(cv, [[315, 154], [322, 183], [322, 204], [312, 226], [290, 242]], 5.2, { start: 0.3, end: 0.3 });
      line(cv, [[256, 255], [212, 268], [170, 278]], 4.6, { start: 0.2, end: 0.4 });
      line(cv, [[146, 282], [122, 284], [96, 278], [74, 269], [78, 286], [86, 302], [100, 324], [124, 350], [156, 372]], 5.2, { start: 0.3, end: 0.4 });
      line(cv, [[106, 306], [120, 316], [140, 320], [150, 312], [166, 326], [184, 332], [196, 322], [212, 338], [236, 344], [282, 346], [326, 338],
        [350, 324], [360, 306], [352, 286]], 4.4, { start: 0.3, end: 0.3, count: 48 });
      line(cv, [[334, 273], [296, 270], [258, 276]], 3.4, { start: 0.3, end: 0.3 });
      line(cv, [[208, 286], [164, 296], [130, 302], [106, 306]], 3.2, { start: 0.3, end: 0.5 });
      line(cv, [[151, 314], [178, 306], [208, 302]], 2.4, { start: 0.6, end: 0.2 });
      line(cv, [[197, 324], [230, 318], [262, 316]], 2.4, { start: 0.6, end: 0.2 });
      line(cv, [[140, 384], [170, 375], [216, 379], [268, 373], [320, 379], [372, 373], [420, 379], [434, 374]], 3.6, { start: 0.3, end: 0.3, count: 40 });
      line(cv, [[434, 375], [448, 366], [461, 372]], 2.8, { start: 0.4, end: 0.4, count: 14 });
      line(cv, [[464, 370], [474, 367], [484, 373], [488, 383]], 2.8, { start: 0.4, end: 0.3, count: 14 });
      line(cv, [[462, 400], [430, 408], [384, 412]], 2.8, { start: 0.3, end: 0.2 });
      line(cv, [[330, 414], [270, 413], [220, 410]], 2.6, { start: 0.2, end: 0.2 });
      line(cv, [[180, 404], [158, 399], [142, 393]], 2.4, { start: 0.2, end: 0.3 });

      // the face: the bill, lit along its top and shaded beneath, its mouth turned up a little and a nostril; a warm
      // cheek; the eye
      lay(cv, bill, BILL, 2.6);
      cv.add(`<g clip-path="${within(cv, bill)}">`);
      brush(cv, [[434, 141], [462, 148], [488, 157]], 9, BILL_LIT, 0.85, 'x');
      brush(cv, [[430, 171], [461, 173], [490, 169]], 8, BILL_SHADE, 0.65, 'x');
      cv.add('</g>');
      line(cv, [[428, 131], [451, 140], [473, 148], [488, 152], [496, 162], [489, 172], [467, 174], [446, 175], [429, 173]], 3.6, { start: 0.4, end: 0.4 });
      line(cv, [[431, 158], [440, 163], [456, 165], [482, 163]], 2.2, { start: 0.7, end: 0.3 });
      lay(cv, blob(rnd, [453, 150], 3, 1.7, 12, 0.05), BILL_SHADE, 3);
      wash(cv, blob(rnd, [403, 157], 12, 7, 0, 0.05), '#f2a796', 4, 0.7);
      cv.add(`<g fill="${INK}" filter="${crayon(cv, rnd, { keep: 3.6, tear: 1.2, grain: 1.2 })}"><path d="${blob(rnd, [388, 126], 8.8, 9.6, 0, 0.03)}"/></g>`);
      cv.add('<circle cx="385.4" cy="122.6" r="2.8" fill="#fff" fill-opacity="0.9"/>');
    });
    return s.done({ finish: { paint: 0, grain: 0.008, contrast: 0, saturation: 1, warmth: 0 } });
  },
};
