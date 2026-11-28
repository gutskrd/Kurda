import { blob, crayon, crescent, mark, painter, strokes, within } from '../brush.mjs';
import { along, spline } from '../kit.mjs';
import { Still } from '../still.mjs';

export const piece = {
  key: 'kiwi',
  ku: 'Kîwî',
  en: 'Kiwi',
  // a round kiwi standing in side view and facing left, its long pale beak reaching down and forward from low on its
  // face: a domed body painted in warm browns, lit on its crown and shaded under its belly, fine hair-like feathers
  // brushed over it hanging back and down, a small tuft at its rump, a small dark eye, and two strong little legs with
  // long clawed toes spread forward
  still(rnd) {
    const s = new Still(rnd).place([-10, -30], 1.02);
    const COAT = '#ab6f3c';
    const LIT = '#d8a066';
    const SHADE = '#7a4428';
    const DEEP = '#55311f';
    const PALE = '#e6bf8c';
    const [BEAK, BEAK_LIT, BEAK_SHADE] = ['#ead9b6', '#f7eedb', '#c4a57a'];
    const [LEG, LEG_SHADE, CLAW] = ['#d6bf9c', '#ae9270', '#5a4334'];
    const INK = '#2a1c16';
    const { lay, wash, brush, line } = painter(rnd, INK);

    const body = spline([[296, 118], [350, 120], [402, 140], [442, 174], [466, 220], [476, 272], [476, 322], [471, 350], [486, 364], [472, 368], [484, 381],
      [468, 384], [476, 396], [452, 394], [428, 398], [376, 404], [320, 404], [280, 398], [256, 388], [244, 368], [240, 340], [246, 314], [238, 294],
      [222, 280], [208, 262], [200, 240], [200, 214], [210, 184], [230, 152], [260, 128]]);
    // the beak, broad at its root on the face and straight on down and forward to a rounded tip
    const bill = [[226, 232], [186, 260], [146, 292], [110, 326], [80, 360], [57, 391]];
    const beak = mark(rnd, bill, 28, { start: 1, end: 0.5, peak: 0.02, tremble: 0.03, count: 40 });
    const root = blob(rnd, [226, 233], 14, 13.5, 0, 0.02);
    // the beak's two edges and its rounded tip, for the line
    const middle = along(bill, 30);
    const edge = (k) => middle.map((q, i) => {
      const [a, b] = [middle[Math.max(0, i - 1)], middle[Math.min(30, i + 1)]];
      const w = (k * 13.4 * (0.5 + 0.5 * Math.cos(((i / 30) * Math.PI) / 2))) / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1);
      return [q[0] - (b[1] - a[1]) * w, q[1] + (b[0] - a[0]) * w];
    });
    const tip = middle[30].map((v, j) => v + (v - middle[28][j]) * 1.3);
    // a strong little leg from under the feathers down to the ankle, and its toes: three long ones spread forward, a
    // short one back
    const leg = (top, ankle) => ({
      top,
      ankle,
      shank: mark(rnd, [top, [(top[0] + ankle[0]) / 2, (top[1] + ankle[1]) / 2], ankle], 26, { start: 1, end: 0.85, peak: 0.1, tremble: 0.05 }),
      toes: [[-52, 5], [-40, 16], [-18, 21], [15, 7]].map(([dx, dy]) => [ankle, [ankle[0] + dx * 0.5, ankle[1] + dy * 0.42], [ankle[0] + dx, ankle[1] + dy]]),
    });
    const legs = [leg([272, 390], [266, 424]), leg([398, 394], [394, 428])];

    s.paint((cv) => {
      // the legs and their toes, the far one a little in shade, creased across above the foot, each toe tipped with a
      // dark claw
      for (const [i, l] of legs.entries()) {
        const [tone, shade] = i === 0 ? [LEG, LEG_SHADE] : ['#cbb390', '#9f8364'];
        const [ax, ay] = l.ankle;
        lay(cv, l.shank, tone, 2.5);
        cv.add(`<g clip-path="${within(cv, l.shank)}">`);
        brush(cv, [[l.top[0] + 8, l.top[1]], [ax + 8, ay]], 12, shade, 0.6, 'y');
        for (const up of [14, 6]) brush(cv, [[ax - 14, ay - up], [ax + 14, ay - up + 1]], 2.6, shade, 0.6, 'x');
        cv.add('</g>');
        for (const toe of l.toes) {
          lay(cv, mark(rnd, toe, 11, { start: 1, end: 0.45, peak: 0.1, tremble: 0.08 }), tone, 2.5);
          const [b, t] = [toe[1], toe[2]];
          lay(cv, mark(rnd, [[t[0] - (t[0] - b[0]) * 0.3, t[1] - (t[1] - b[1]) * 0.3], [t[0] + (t[0] - b[0]) * 0.12, t[1] + (t[1] - b[1]) * 0.12]], 5,
            { start: 1, end: 0.2, peak: 0.1, tremble: 0.05 }), CLAW, 3);
        }
      }

      // the body: lit on the forehead and the crown, shaded down the back, under the belly and round the rump
      lay(cv, body, COAT);
      cv.add(`<g clip-path="${within(cv, body)}">`);
      crescent(cv, body, [-34, -38], { colour: SHADE, opacity: 0.85, soft: 16 });
      wash(cv, blob(rnd, [350, 280], 90, 70, 0, 0.05), '#b27a45', 20, 0.5);
      wash(cv, blob(rnd, [282, 188], 96, 72, -30, 0.05), LIT, 22, 0.85);
      wash(cv, blob(rnd, [262, 160], 44, 28, -40, 0.05), '#dcae78', 12, 0.6);
      wash(cv, blob(rnd, [360, 396], 120, 22, 0, 0.05), DEEP, 12, 0.55);
      wash(cv, blob(rnd, [250, 330], 18, 50, 0, 0.05), SHADE, 10, 0.5);
      brush(cv, [[462, 230], [472, 296], [466, 356]], 22, DEEP, 0.3, 'y');
      // the hair-like feathers: fine strokes hanging back and down over the whole body, darker in the shade and paler
      // where the light falls
      const flow = (x, y) => 72 + Math.max(-30, Math.min(16, (y - 240) * 0.12));
      const hair = { flow, spread: 18, length: 20, width: 1.8, opacity: [0.3, 0.65], bend: 0.35 };
      strokes(cv, rnd, body, [200, 118, 480, 404], { ...hair, count: 150, colour: (x, y) => (rnd() < 0.25 + (x + y - 380) / 800 ? DEEP : PALE) });
      strokes(cv, rnd, body, [210, 120, 370, 260], { ...hair, count: 40, colours: [PALE, '#f2d6ad'], length: 16, width: 1.6 });
      strokes(cv, rnd, body, [370, 150, 480, 400], { ...hair, count: 36, colours: [DEEP], length: 28, width: 2.2, opacity: [0.25, 0.5] });
      cv.add('</g>');
    });

    s.paint((cv) => {
      // the beak: pale, lit along its top and shaded beneath, a little darker toward its tip, its round root on the face
      lay(cv, beak, BEAK, 2.6);
      lay(cv, root, BEAK, 2.6);
      cv.add(`<g clip-path="${within(cv, beak)}">`);
      brush(cv, [[214, 232], [176, 260], [138, 292], [104, 326]], 8, BEAK_LIT, 0.8, 'x');
      brush(cv, [[226, 250], [188, 278], [150, 310], [114, 344], [84, 376]], 11, BEAK_SHADE, 0.7, 'x');
      brush(cv, [[82, 364], [60, 392]], 12, '#a88a62', 0.5, 'y');
      cv.add('</g>');

      // the line, open where the light falls on the crown: over the head and the back, down the rump and the tuft,
      // under the belly, down the chest; round the beak and its root, the legs and the toes
      line(cv, [[202, 226], [202, 206], [212, 180], [232, 150], [262, 126]], 5.4, { start: 0.4, end: 0.2 });
      line(cv, [[326, 118], [370, 124], [404, 141], [442, 175], [466, 220], [476, 272], [476, 322], [470, 354]], 6, { start: 0.2, end: 0.4, count: 40 });
      line(cv, [[470, 352], [486, 364], [472, 369], [484, 381], [468, 385], [476, 396], [452, 395], [428, 398]], 4.4, { start: 0.4, end: 0.4, count: 36 });
      line(cv, [[412, 400], [376, 404], [320, 404], [280, 398], [256, 388]], 5.4, { start: 0.3, end: 0.3 });
      line(cv, [[252, 384], [244, 368], [240, 340], [246, 314], [239, 296], [226, 284]], 5.6, { start: 0.3, end: 0.3 });
      line(cv, [[218, 222], [228, 219], [238, 226], [240, 238], [234, 246]], 3.6, { start: 0.4, end: 0.3, count: 16 });
      line(cv, edge(1), 3.8, { start: 0.5, end: 0.5, peak: 0.4, count: 40 });
      line(cv, [...edge(-1).slice(3), tip, edge(1)[30]], 3.6, { start: 0.3, end: 0.6, peak: 0.6, count: 44 });
      for (const l of legs) {
        line(cv, [[l.top[0] - 12, l.top[1] + 14], [l.ankle[0] - 12, l.ankle[1] - 2]], 3.6, { start: 0.4, end: 0.6 });
        line(cv, [[l.top[0] + 12, l.top[1] + 14], [l.ankle[0] + 12, l.ankle[1] - 2]], 3.6, { start: 0.4, end: 0.6 });
        for (const toe of l.toes) line(cv, toe, 2.4, { start: 0.6, end: 0.3, count: 14 });
      }

      // the face: a small dark eye
      cv.add(`<g fill="${INK}" filter="${crayon(cv, rnd, { keep: 3.6, tear: 1.2, grain: 1.2 })}"><path d="${blob(rnd, [266, 210], 7.8, 8.4, 0, 0.03)}"/></g>`);
      cv.add('<circle cx="263.4" cy="207" r="2.4" fill="#fff" fill-opacity="0.85"/>');
    });
    return s.done({ finish: { paint: 0, grain: 0.008, contrast: 0, saturation: 1, warmth: 0 } });
  },
};
