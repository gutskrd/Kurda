import { blob, crayon, crescent, painter, strokes, within } from '../brush.mjs';
import { spline } from '../kit.mjs';
import { Still } from '../still.mjs';

export const piece = {
  key: 'werdek',
  ku: 'Werdek',
  en: 'Duck',
  // A cream duck sitting on the ground in side view, facing right: a round head on a long upright neck, a flat orange
  // bill and a dark eye, its wing folded, its tail tipped up and its two webbed feet poking out from under its breast,
  // shaded in soft blue-grey with warm light on its crown and back.
  still(rnd) {
    const s = new Still(rnd).place([-33, -4], 1.06);
    const CREAM = '#f5ead5';
    const LIGHT = '#fffaf0';
    const WARM = '#e2ccad';
    const SHADE = '#a8b0c9';
    const DEEP = '#7f8daa';
    const WING = '#efe3cd';
    const [BILL, BILL_LIT, BILL_SHADE] = ['#f2a93b', '#f8cb6a', '#d7822f'];
    const [FOOT, FOOT_LIT, FOOT_SHADE] = ['#ec9a3e', '#f6c06a', '#c9712c'];
    const INK = '#2a1c16';
    const { lay, wash, brush, line } = painter(rnd, INK);
    const clip = (cv, d, draw) => {
      cv.add(`<g clip-path="${within(cv, d)}">`);
      draw();
      cv.add('</g>');
    };

    // The body runs from the crown round to the tail in one piece and rests flat on the ground.
    const body = spline([[350, 77], [383, 75], [412, 88], [429, 108], [436, 132], [430, 161], [425, 175], [413, 189], [400, 204], [393, 224], [394, 248],
      [404, 272], [420, 298], [430, 326], [430, 356], [422, 380], [402, 396], [366, 404], [320, 407], [262, 406], [206, 400], [160, 384], [122, 356], [96, 322],
      [82, 296], [74, 270], [96, 278], [128, 284], [168, 278], [212, 268], [254, 256], [290, 242], [312, 226], [322, 204], [322, 183], [316, 161], [313, 135],
      [319, 108], [332, 91]]);
    // The folded wing parts at its back end into three rounded feather tips.
    const wing = spline([[360, 306], [352, 284], [330, 272], [296, 270], [254, 276], [208, 286], [164, 296], [130, 302], [106, 306], [120, 316], [140, 320],
      [150, 312], [166, 326], [184, 332], [196, 322], [212, 338], [236, 344], [282, 346], [326, 338], [350, 324]]);
    // The flat bill is tall at its root and widens a little again at its rounded tip.
    const bill = spline([[429, 132], [451, 141], [473, 149], [488, 153], [496, 162], [489, 172], [467, 174], [446, 175], [431, 174], [426, 157]]);
    // A webbed foot runs from its ankle under the breast to three rounded toes, seen a little from above so the web shows.
    const foot = ([x, y], turn, k) => {
      const [c, si] = [Math.cos((turn * Math.PI) / 180) * k, Math.sin((turn * Math.PI) / 180) * k];
      const P = (pts) => pts.map(([u, v]) => [x + u * c - v * si, y + u * si + v * c]);
      return {
        d: spline(P([[-14, -5], [10, -8], [28, -12], [40, -13], [37, -6], [46, 0], [38, 6], [41, 13], [26, 13], [8, 8], [-14, 5]])),
        edge: P([[10, -8], [28, -12], [40, -13], [37, -6], [46, 0], [38, 6], [41, 13], [26, 13], [8, 8], [-8, 5.6], [-16, 5]]),
        toes: [P([[8, 0], [24, -6], [37, -10]]), P([[8, 0], [26, 0], [42, 0]]), P([[8, 0], [24, 6], [37, 10]])],
        lit: P([[6, -4], [22, -8], [36, -10]]),
      };
    };
    const feet = [foot([414, 376], -8, 1.25), foot([383, 398], 10, 1.35)];

    s.paint((cv) => {
      // A faint warm shadow on the ground keeps the duck sitting rather than floating.
      wash(cv, blob(rnd, [292, 410], 168, 11, 0, 0.04), '#8c7c70', 9, 0.22);
      // The feet go first so the breast covers their ankles.
      for (const f of feet) {
        lay(cv, f.d, FOOT, 2.6);
        clip(cv, f.d, () => {
          brush(cv, f.lit, 6, FOOT_LIT, 0.85, 'x');
          for (const t of f.toes) brush(cv, t, 2.6, FOOT_SHADE, 0.8, 'x');
        });
        line(cv, f.edge, 3.4, { start: 0.3, end: 0.7, peak: 0.4, count: 44 });
      }
      // The body: warm down its side, blue-grey under the chin, the breast, the tail and low where it rests, and lit on
      // the crown, the nape and the back.
      lay(cv, body, CREAM);
      clip(cv, body, () => {
        wash(cv, blob(rnd, [250, 336], 170, 40, -4, 0.05), WARM, 16, 0.9);
        brush(cv, [[60, 300], [140, 330], [220, 338], [300, 342], [370, 336], [440, 320]], 34, WARM, 0.45, 'x');
        crescent(cv, body, [-18, -22], { colour: SHADE, opacity: 0.85, soft: 9 });
        wash(cv, blob(rnd, [420, 179], 20, 30, 20, 0.05), SHADE, 8, 0.9);
        wash(cv, blob(rnd, [362, 195], 48, 13, 0, 0.05), SHADE, 8, 0.7);
        wash(cv, blob(rnd, [240, 362], 120, 12, 3, 0.05), SHADE, 7, 0.8);
        brush(cv, [[150, 384], [240, 400], [340, 402], [418, 386]], 30, SHADE, 0.8, 'x');
        for (const [pts, w, o, way] of [
          [[[170, 392], [260, 406], [360, 406], [414, 394]], 16, 0.5, 'x'],
          [[[424, 292], [434, 326], [430, 366]], 14, 0.45, 'y'],
          [[[403, 197], [397, 222], [398, 248]], 10, 0.45, 'y'],
          [[[70, 286], [96, 320], [130, 350]], 12, 0.4, 'x'],
        ]) brush(cv, pts, w, DEEP, o, way);
        wash(cv, blob(rnd, [354, 104], 32, 18, -20, 0.05), LIGHT, 7, 1);
        brush(cv, [[92, 280], [150, 284], [210, 272], [262, 256], [300, 234]], 20, LIGHT, 0.9, 'x');
        wash(cv, blob(rnd, [336, 150], 14, 44, 4, 0.05), LIGHT, 8, 0.7);
        brush(cv, [[400, 236], [408, 266], [416, 294]], 12, LIGHT, 0.55, 'y');
        // Scratches of paler paint over the back and the breast, and a few blue-grey ones low down, give it a painted skin.
        const scratch = { spread: 24, length: 11, width: 2, opacity: [0.35, 0.65], bend: 0.3 };
        strokes(cv, rnd, body, [90, 244, 310, 296], { ...scratch, count: 24, colours: [LIGHT], flow: () => -14 });
        strokes(cv, rnd, body, [326, 86, 384, 138], { ...scratch, count: 10, colours: [LIGHT], flow: () => -30, length: 8 });
        strokes(cv, rnd, body, [396, 236, 430, 340], { ...scratch, count: 12, colours: [LIGHT], flow: () => 75 });
        strokes(cv, rnd, body, [150, 360, 420, 404], { ...scratch, count: 22, colours: [DEEP], flow: () => 0, opacity: [0.2, 0.4] });
      });

      // The wing is lit along its top and shaded below, and each feather tip is edged pale.
      lay(cv, wing, WING);
      clip(cv, wing, () => {
        crescent(cv, wing, [-10, -16], { colour: SHADE, opacity: 0.8, soft: 6 });
        brush(cv, [[130, 318], [200, 334], [280, 344], [346, 328]], 12, SHADE, 0.5, 'x');
        brush(cv, [[124, 306], [190, 294], [260, 282], [330, 278]], 14, LIGHT, 0.85, 'x');
        for (const [x, y] of [[132, 314], [176, 326], [222, 338]]) wash(cv, blob(rnd, [x, y], 16, 6, 10, 0.05), LIGHT, 3, 0.75);
        strokes(cv, rnd, wing, [110, 276, 356, 344], { count: 18, colours: [LIGHT], flow: () => -8, spread: 16, length: 14, width: 1.8, opacity: [0.3, 0.6] });
      });
    });

    s.paint((cv) => {
      // The line breaks open where the light falls on the crown and the back.
      line(cv, [[314, 139], [319, 110], [334, 91], [354, 77]], 4.8, { start: 0.3, end: 0.3 });
      line(cv, [[392, 77], [414, 90], [430, 110], [436, 132]], 5, { start: 0.3, end: 0.5 });
      line(cv, [[428, 169], [413, 189], [400, 205], [393, 226], [394, 250], [404, 274], [420, 300], [430, 328], [430, 356], [423, 378], [410, 391]], 5.2,
        { start: 0.4, end: 0.5, count: 40 });
      line(cv, [[315, 154], [322, 183], [322, 204], [312, 226], [290, 242]], 5, { start: 0.3, end: 0.3 });
      line(cv, [[256, 255], [212, 268], [170, 278]], 4.4, { start: 0.2, end: 0.4 });
      line(cv, [[146, 282], [122, 284], [96, 278], [74, 269], [78, 286], [86, 302], [100, 324], [124, 352], [160, 384], [206, 400], [262, 406]], 5,
        { start: 0.3, end: 0.5, count: 40 });
      line(cv, [[290, 407], [330, 407], [366, 404], [384, 400]], 4.6, { start: 0.4, end: 0.4 });
      line(cv, [[106, 306], [120, 316], [140, 320], [150, 312], [166, 326], [184, 332], [196, 322], [212, 338], [236, 344], [282, 346], [326, 338],
        [350, 324], [360, 306], [352, 286]], 4.2, { start: 0.3, end: 0.3, count: 48 });
      line(cv, [[334, 273], [296, 270], [258, 276]], 3.2, { start: 0.3, end: 0.3 });
      line(cv, [[208, 286], [164, 296], [130, 302], [106, 306]], 3, { start: 0.3, end: 0.5 });
      line(cv, [[151, 314], [178, 306], [208, 302]], 2.4, { start: 0.6, end: 0.2 });
      line(cv, [[197, 324], [230, 318], [262, 316]], 2.4, { start: 0.6, end: 0.2 });

      // The face: the bill lit along its top with its mouth turned up a little, a warm cheek and the eye.
      lay(cv, bill, BILL, 2.6);
      clip(cv, bill, () => {
        brush(cv, [[434, 141], [462, 148], [488, 157]], 9, BILL_LIT, 0.85, 'x');
        brush(cv, [[430, 171], [461, 173], [490, 169]], 8, BILL_SHADE, 0.65, 'x');
      });
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
