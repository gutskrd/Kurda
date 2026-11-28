import { blob, crayon, mark, painter, strokes, within } from '../brush.mjs';
import { spline } from '../kit.mjs';
import { Still } from '../still.mjs';

export const piece = {
  key: 'mirisk',
  ku: 'Mirîşk',
  en: 'Hen',
  // A plump round cream hen side-on to the right, her face turned a little toward us: a small head on her round body with
  // a red comb and wattle, a yellow beak, a buff fan of tail feathers rising behind, a wing curled at her side, tiny legs.
  still(rnd) {
    const s = new Still(rnd).place([-6, -10], 0.96);
    const CREAM = '#f5e5c8';
    const LIGHT = '#fdf6e8';
    const SHADE = '#e2c49d';
    const DEEP = '#c99d6c';
    const [BUFF, BUFF_LIT, BUFF_DEEP] = ['#e6bd84', '#f4d6a6', '#c58e55'];
    const [COMB, COMB_LIT, COMB_DEEP] = ['#da4a34', '#f27e62', '#a8301f'];
    const [BEAK, BEAK_SHADE] = ['#f1b63a', '#c98723'];
    const [LEG, LEG_SHADE] = ['#ecb63e', '#c88b26'];
    const INK = '#2a1c16';
    const { lay, wash, brush, line } = painter(rnd, INK);
    // Small parts whose whole edge shows are drawn round in one pencil stroke.
    const ringed = (cv, d, w, room) => {
      const filter = crayon(cv, rnd, { keep: 3.4, tear: 1.4, grain: 1.1, room });
      cv.add(`<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" filter="${filter}"/>`);
    };
    const flecks = { spread: 20, length: 12, width: 2, bend: 0.2 };

    // Head, body and tail are one round shape, as a fluffed-up hen is; the tail's edge is scalloped into feathers.
    const COAT = [
      [212, 36], [236, 46], [256, 76], [272, 112], [282, 138], [289, 151], [297, 136], [314, 118], [340, 104], [370, 99], [398, 109], [418, 132],
      [428, 160], [438, 196], [452, 240], [464, 290], [470, 344], [464, 396], [440, 434], [392, 458], [320, 468], [240, 466], [170, 452], [116, 426],
      [80, 390], [62, 346], [56, 318], [64, 298], [80, 290], [68, 278], [60, 256], [66, 236], [80, 226], [98, 220], [88, 206], [88, 182], [100, 164],
      [114, 158], [132, 154], [126, 138], [130, 114], [144, 96], [156, 90], [172, 86], [168, 68], [180, 50], [196, 40],
    ];
    const coat = spline(COAT);
    const tailZone = spline([[180, 10], [262, 40], [300, 130], [289, 151], [262, 196], [220, 226], [170, 252], [130, 290], [100, 340], [60, 390], [20, 330]]);
    const NOTCHES = [[80, 290], [98, 220], [132, 154], [172, 86]];
    const wing = spline([[290, 236], [250, 246], [212, 266], [184, 294], [178, 322], [194, 340], [226, 350], [266, 352], [304, 340], [326, 314], [324, 278]]);
    const COMB_EDGE = [[338, 110], [334, 88], [346, 74], [360, 80], [368, 62], [384, 60], [392, 76], [404, 74], [412, 90], [408, 114]];
    const comb = spline([...COMB_EDGE, [392, 126], [352, 124]]);
    // She turns her face a little toward us: the beak sits on the face between her eyes, and the far eye peeps past its edge.
    const wattle = spline([[386, 172], [402, 170], [412, 182], [410, 198], [400, 208], [394, 200], [386, 206], [378, 194], [380, 180]]);
    const beak = spline([[384, 150], [400, 147], [416, 155], [404, 167], [388, 166]]);
    // Each foot has three toes forward and one back, as a hen stands.
    const foot = ([x, y]) => [
      [[x, y], [x + 12, y + 1], [x + 22, y + 3]],
      [[x, y], [x + 8, y + 7], [x + 14, y + 12]],
      [[x, y], [x - 9, y + 2], [x - 15, y + 2]],
    ];
    const legs = [
      { shank: [[350, 450], [351, 466], [352, 480]], toes: foot([352, 480]), fill: LEG_SHADE },
      { shank: [[216, 452], [214, 470], [212, 486]], toes: foot([212, 486]), fill: LEG },
    ];

    s.paint((cv) => {
      // The pencil goes under each leg and toe a little wider than its paint, so the joins show no seams.
      const stalk = { start: 0.9, end: 0.8, peak: 0.4, tremble: 0.06 };
      for (const { shank, toes, fill } of legs) {
        for (const p of [shank, ...toes]) line(cv, p, 14, stalk);
        for (const p of [shank, ...toes]) lay(cv, mark(rnd, p, 8, stalk), fill, 2.9);
      }
      lay(cv, comb, COMB, 2.9);
      cv.add(`<g clip-path="${within(cv, comb)}">`);
      brush(cv, [[340, 90], [366, 74], [396, 80]], 9, COMB_LIT, 0.85, 'x');
      brush(cv, [[342, 120], [376, 122], [410, 110]], 12, COMB_DEEP, 0.7, 'x');
      cv.add('</g>');
      line(cv, [...COMB_EDGE], 4.4, { start: 0.4, end: 0.3, count: 50 });

      lay(cv, coat, CREAM);
      cv.add(`<g clip-path="${within(cv, coat)}">`);
      // The tail is buff at its feather tips; the body's cream fluff overlaps its foot in short strokes.
      lay(cv, tailZone, BUFF, 2.7);
      const lobes = [[[250, 150], [234, 100], [214, 50]], [[200, 180], [170, 140], [140, 110]], [[160, 220], [126, 200], [90, 186]], [[130, 262], [70, 258]]];
      for (const pts of lobes) brush(cv, pts, 14, BUFF_LIT, 0.75, 'y');
      for (const [x, y] of NOTCHES) brush(cv, [[x, y], [x + 16, y + 6], [x + 34, y + 10]], 9, BUFF_DEEP, 0.7, 'x');
      brush(cv, [[284, 146], [266, 186], [240, 212]], 14, BUFF_DEEP, 0.45, 'y');
      for (const [x, y] of [[262, 206], [240, 222], [216, 236], [192, 250], [168, 264], [148, 282], [130, 302], [114, 324], [100, 346], [86, 370]]) {
        brush(cv, [[x + 18, y + 16], [x + 2, y + 2], [x - 12, y - 12]], 16, CREAM, 0.95, 'y', 2.4);
      }
      // Light falls from the upper left, so the breast and the round of the belly turn into a warm shade.
      brush(cv, [[444, 220], [470, 300], [466, 380], [420, 440]], 40, SHADE, 0.85, 'y');
      brush(cv, [[90, 420], [200, 462], [320, 470], [430, 432]], 36, SHADE, 0.85, 'x');
      brush(cv, [[110, 440], [220, 470], [340, 474], [440, 440]], 16, DEEP, 0.45, 'x');
      brush(cv, [[464, 300], [474, 360], [452, 412]], 14, DEEP, 0.4, 'y');
      brush(cv, [[424, 180], [434, 210], [446, 240]], 18, SHADE, 0.6, 'y');
      // The wing is no more than a fold: a warmer tone under its curled top edge and a shade beneath its feather tips.
      wash(cv, wing, '#efd5ab', 8, 0.65);
      brush(cv, [[196, 300], [236, 266], [290, 248]], 12, LIGHT, 0.5, 'x');
      brush(cv, [[200, 356], [250, 364], [300, 358], [334, 336]], 14, SHADE, 0.8, 'x');
      lay(cv, blob(rnd, [354, 176], 13, 8, 0, 0.05), '#f4b49a', 2.2);
      strokes(cv, rnd, coat, [130, 280, 420, 440], { ...flecks, count: 14, colours: [LIGHT], flow: () => -20, length: 14, opacity: [0.5, 0.9] });
      strokes(cv, rnd, coat, [400, 230, 470, 440], { ...flecks, count: 10, colours: [DEEP], flow: () => 80, length: 12, opacity: [0.2, 0.4] });
      cv.add('</g>');

      lay(cv, wattle, COMB, 2.9);
      cv.add(`<g clip-path="${within(cv, wattle)}">`);
      brush(cv, [[382, 178], [386, 192], [390, 204]], 6, COMB_LIT, 0.8, 'y');
      brush(cv, [[410, 182], [408, 196], [400, 208]], 8, COMB_DEEP, 0.7, 'y');
      cv.add('</g>');
      lay(cv, beak, BEAK, 2.9);
      cv.add(`<g clip-path="${within(cv, beak)}">`);
      brush(cv, [[388, 166], [402, 166], [414, 158]], 7, BEAK_SHADE, 0.8, 'x');
      cv.add('</g>');
    });

    s.paint((cv) => {
      // The pencil line goes on last and is left open in places, as a hand-drawn line is.
      line(cv, [...COAT.slice(26), ...COAT.slice(0, 6)], 5.6, { start: 0.3, end: 0.2, peak: 0.5, count: 100 });
      line(cv, COAT.slice(5, 12), 5.8, { start: 0.3, end: 0.2, count: 40 });
      line(cv, COAT.slice(12, 19), 6, { start: 0.3, end: 0.4, count: 50 });
      line(cv, COAT.slice(19, 26), 5.8, { start: 0.4, end: 0.2, count: 40 });
      // The back runs on from the notch behind the head and fades out, so the tail sits behind the body.
      line(cv, [[289, 151], [280, 176], [266, 198]], 4.6, { start: 0.8, end: 0.1, peak: 0.2 });
      for (const [x, y] of NOTCHES) line(cv, [[x - 2, y], [x + 8, y + 4], [x + 18, y + 6]], 3.4, { start: 0.9, end: 0.1, peak: 0.2 });
      // The wing is drawn as a curl along its top and two feather tips beneath, left open toward the shoulder.
      line(cv, [[292, 234], [250, 244], [212, 264], [184, 292], [178, 320], [192, 338], [212, 340]], 5, { start: 0.15, end: 0.3, peak: 0.6, count: 50 });
      for (const pts of [[[210, 344], [226, 352], [248, 352]], [[268, 352], [292, 346], [312, 332]]]) line(cv, pts, 4, { start: 0.3, end: 0.3, peak: 0.5 });
      ringed(cv, wattle, 4, [360, 156, 70, 70]);
      ringed(cv, beak, 4, [370, 134, 64, 50]);
      const eyes = [blob(rnd, [358, 146], 10.5, 11.5, 0, 0.03), blob(rnd, [421, 141], 8, 10, 0, 0.03)];
      cv.add(`<g fill="${INK}" filter="${crayon(cv, rnd, { keep: 3.6, tear: 1.2, grain: 1.2 })}">${eyes.map((d) => `<path d="${d}"/>`).join('')}</g>`);
      cv.add('<circle cx="354.5" cy="141.5" r="3.2" fill="#fffaf0"/>');
    });
    return s.done({ finish: { paint: 0, grain: 0.008, contrast: 0, saturation: 1, warmth: 0 } });
  },
};
