import { blob, mark, softly, torn } from '../brush.mjs';
import { along, n, spline } from '../kit.mjs';
import { Still } from '../still.mjs';

const PLAIN = { finish: { paint: 0, grain: 0.012, contrast: 0, saturation: 1, warmth: 0 } };

export const piece = {
  key: 'kerosk',
  ku: 'Kêroşka Bihêz',
  en: 'Strong rabbit',
  // a white rabbit standing square, both fists up beside its head to show its muscles, its head turned a little; a
  // brush line in ink that runs thick and thin and goes dry where the brush lifts, pale washes where it rounds away
  still(rnd) {
    const s = new Still(rnd).place([0, 0], 1);
    const INK = '#121a1f';
    const PAPER = '#fff7f1';
    const PINK = '#eba792';
    const N = 60;
    // A brush line: its body, and where the brush ran dry (`dry`: the share of the line at its start and its end) the
    // hairs parting into streaks.
    const brush = (pts, w, { start = 0.35, end = 0.35, peak = 0.4, dry = [0, 0], hairs = 6 } = {}) => {
      const line = along(pts, N);
      const a = Math.round(dry[0] * N);
      const b = N - Math.round(dry[1] * N);
      const body = line.slice(Math.max(0, a - (a ? 2 : 0)), Math.min(N + 1, b + (b < N ? 3 : 1)));
      const out = [mark(rnd, body, w, { start: a ? 0.7 : start, end: b < N ? 0.75 : end, peak, tremble: 0.22, count: 36 })];
      const normal = (i) => {
        const p = line[Math.max(0, i - 1)];
        const q = line[Math.min(N, i + 1)];
        const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
        return [-(q[1] - p[1]) / l, (q[0] - p[0]) / l];
      };
      // (each hair runs from the body of the line out to its own end, thinning as it goes)
      const strand = (from, to, o) => {
        const p = [];
        for (let i = from; i !== to + Math.sign(to - from); i += Math.sign(to - from)) {
          const [nx, ny] = normal(i);
          p.push([line[i][0] + nx * o, line[i][1] + ny * o]);
        }
        if (p.length > 2) out.push(mark(rnd, p, w * (0.2 + rnd() * 0.18), { start: 0.9, end: 0.2, peak: 0.15, tremble: 0.45, count: 10 }));
      };
      for (let j = 0; j < hairs; j++) {
        const o = ((j + 0.5) / hairs - 0.5) * w * 0.8 + (rnd() - 0.5) * w * 0.12;
        if (b < N) strand(b - 3, Math.min(N, b + Math.max(2, Math.round((N - b) * (0.35 + rnd() * 0.65)))), o);
        if (a) strand(a + 3, Math.max(0, a - Math.max(2, Math.round(a * (0.35 + rnd() * 0.65)))), o);
      }
      return out;
    };
    // the parts, as filled shapes, before any line
    const parts = [
      spline([[236, 132], [231, 108], [235, 84], [243, 61], [256, 43], [271, 35], [280, 42], [283, 62], [282, 92], [278, 124], [275, 146], [250, 150]]),
      spline([[276, 128], [284, 102], [294, 80], [308, 61], [324, 50], [338, 47], [344, 57], [343, 84], [338, 110], [329, 136], [316, 160], [300, 160]]),
      spline([[228, 146], [212, 149], [199, 158], [190, 171], [184, 190], [177, 205], [175, 222], [179, 238], [190, 254], [226, 266], [262, 266], [300, 258], [326, 246], [335, 230], [335, 212], [329, 194], [319, 174], [300, 152], [260, 140]]),
      spline([[150, 238], [146, 226], [149, 217], [157, 211], [157, 203], [147, 200], [134, 202], [121, 213], [111, 234], [105, 256], [107, 272], [118, 282], [132, 295], [147, 306], [160, 307], [172, 298], [186, 290], [188, 262], [180, 244], [166, 237]]),
      spline([[372, 224], [366, 219], [359, 219], [358, 207], [372, 202], [388, 207], [399, 223], [406, 242], [408, 260], [404, 275], [394, 284], [378, 291], [358, 301], [340, 300], [326, 280], [324, 256], [340, 241], [356, 238], [369, 244]]),
      spline([[180, 280], [200, 262], [256, 262], [316, 262], [340, 282], [354, 298], [351, 318], [346, 340], [333, 362], [320, 376], [318, 410], [318, 445], [316, 462], [307, 467], [296, 461], [280, 445], [266, 430], [257, 422], [250, 429], [238, 444], [230, 457], [224, 467], [206, 469], [206, 458], [196, 444], [188, 428], [187, 400], [190, 372], [193, 358], [180, 336], [168, 312]]),
      blob(rnd, [335, 400], 14, 23, 0, 0.03),
    ];
    s.paint((cv) => {
      // its shadow on the ground: a wash laid in two passes, darker under its feet
      cv.add(`<g filter="${torn(cv, rnd, 5, 0.05)}"><path d="${mark(rnd, [[126, 468], [180, 464], [250, 465], [320, 463], [366, 462]], 22, { start: 0.15, end: 0.2, peak: 0.55 })}" fill="#c9b2a6" fill-opacity="0.75"/>`
        + `<path d="${mark(rnd, [[176, 468], [250, 467], [330, 465]], 13, { start: 0.3, end: 0.3, peak: 0.5 })}" fill="#a98f84" fill-opacity="0.35"/></g>`);
      for (const d of parts) cv.add(`<path d="${d}" fill="${PAPER}"/>`);
      // washes: the pink inside its ears and on its cheek, warm grey where it rounds away, pink inside its right arm
      // (a watercolour stroke dries darker at its rim, where the pigment ran to)
      const wash = (pts, w, colour, o, soft = 1.6) => {
        const d = mark(rnd, pts, w, { start: 0.45, end: 0.25, peak: 0.45, tremble: 0.3 });
        cv.add(`<g filter="${softly(cv, soft * 0.6)}"><path d="${d}" fill="${colour}" fill-opacity="${o}" stroke="${colour}" stroke-opacity="${n(o * 0.6)}" stroke-width="1.6"/></g>`);
      };
      cv.add(`<g fill="${PINK}" fill-opacity="0.9" filter="${softly(cv, 1.8)}"><path d="${spline([[246, 54], [256, 68], [263, 98], [263, 126], [256, 142], [245, 138], [240, 110], [240, 78]])}"/>`
        + `<path d="${spline([[331, 56], [337, 72], [333, 100], [319, 130], [300, 156], [292, 148], [295, 120], [306, 90], [319, 66]])}"/></g>`);
      cv.add(`<ellipse cx="277" cy="221" rx="19" ry="16.5" fill="#efbfaa" fill-opacity="0.85" filter="${softly(cv, 3)}"/>`);
      wash([[192, 248], [220, 261], [252, 266], [284, 262]], 13, '#dcc8bc', 0.8, 2.5);
      wash([[148, 260], [160, 280], [172, 300]], 17, '#c2afa5', 0.8);
      wash([[122, 258], [134, 272], [146, 284]], 10, '#ddcdc2', 0.6, 2);
      wash([[174, 298], [188, 320], [204, 346], [220, 372]], 20, '#d0bcae', 0.75, 2);
      wash([[376, 268], [344, 280], [308, 300]], 14, '#d9c6b9', 0.75, 2);
      wash([[362, 262], [346, 268], [330, 276]], 8, '#ddcdc2', 0.6, 2);
      wash([[348, 292], [336, 316], [322, 340], [306, 362]], 26, '#e49a80', 0.75);
      wash([[318, 320], [304, 344], [288, 370]], 14, '#eab4a2', 0.6, 2);
      wash([[304, 366], [292, 374], [282, 382]], 10, '#dcc8bc', 0.6, 2);
      wash([[226, 418], [242, 416], [258, 424]], 16, '#d6c3b7', 0.85, 2);
      wash([[262, 424], [280, 430], [298, 438]], 9, '#e3d3c8', 0.6, 2);
      wash([[198, 352], [208, 360], [218, 368]], 8, '#e3d3c8', 0.6, 2);
      // the line, in one ink
      const d = [];
      // ears
      d.push(...brush([[235, 130], [231, 110], [233, 86], [241, 62], [254, 44], [268, 35], [276, 38], [282, 56], [283, 84], [279, 116], [275, 148]], 9, { peak: 0.2, dry: [0.24, 0.14], hairs: 7 }));
      d.push(...brush([[277, 122], [285, 98], [296, 76], [310, 58], [326, 49], [338, 48], [343, 58], [343, 82], [339, 108], [330, 135], [318, 158], [311, 171]], 8, { peak: 0.6, dry: [0, 0.16], start: 0.25 }));
      // the head, open at its brow, a little fuller at the cheek turned toward us
      d.push(...brush([[228, 145], [212, 149], [199, 158], [190, 171], [184, 192]], 9.5, { peak: 0.75, dry: [0.25, 0] }));
      d.push(...brush([[186, 190], [177, 204], [175, 220], [178, 236], [186, 250], [193, 256]], 9.5, { start: 0.6, end: 0.3, peak: 0.4 }));
      d.push(...brush([[316, 170], [324, 183], [331, 198], [335, 214], [335, 232]], 9.5, { start: 0.4, end: 0.2, peak: 0.45 }));
      // its left fist, curled, and the arm round the elbow and under the muscle to the armpit
      d.push(...brush([[149, 239], [145, 227], [148, 218], [156, 213], [158, 206], [151, 200], [139, 201]], 9, { start: 0.6, end: 0.5, peak: 0.3 }));
      d.push(...brush([[141, 201], [128, 207], [117, 222], [109, 241], [105, 259], [107, 271], [113, 278], [125, 285], [135, 297], [147, 305], [158, 307], [167, 302]], 10.5, { start: 0.5, end: 0.3, peak: 0.35 }));
      d.push(...brush([[137, 254], [145, 244], [156, 238], [167, 238], [175, 241], [181, 247]], 7.5, { start: 0.75, peak: 0.25, dry: [0, 0.25] }));
      d.push(...brush([[146, 273], [156, 280], [167, 286], [176, 288]], 7, { start: 0.55, end: 0.4, peak: 0.6 }));
      // its right fist, the bicep's top and the arm round to the armpit
      d.push(...brush([[375, 217], [368, 220], [360, 220], [357, 212], [363, 204], [373, 202], [385, 205], [395, 217], [403, 231], [407, 247], [408, 264], [404, 276], [395, 283], [381, 290], [365, 297], [353, 302]], 8, { start: 0.5, end: 0.3, peak: 0.45 }));
      d.push(...brush([[372, 226], [370, 233], [369, 242], [371, 250], [376, 258]], 6, { start: 0.3, end: 0.9, peak: 0.7 }));
      d.push(...brush([[321, 254], [331, 245], [343, 240], [354, 238], [366, 241]], 8, { peak: 0.7, dry: [0.25, 0], end: 0.6 }));
      d.push(...brush([[335, 285], [346, 287], [358, 284]], 8, { start: 0.7, end: 0.3, peak: 0.3 }));
      // the chest: the two lines under it from the armpits, the line down its middle, the cross of its belly
      d.push(...brush([[173, 284], [179, 296], [188, 309], [200, 319], [214, 325], [231, 327]], 10, { start: 0.6, end: 0.15, peak: 0.35 }));
      d.push(...brush([[337, 281], [331, 293], [321, 307], [310, 317], [297, 322], [280, 325], [259, 327]], 10, { start: 0.6, end: 0.15, peak: 0.3 }));
      d.push(...brush([[241, 285], [236, 302], [242, 322]], 6.5, { start: 0.2, end: 0.15, peak: 0.5 }));
      d.push(blob(rnd, [200, 313], 4.2, 5, 30, 0.05), blob(rnd, [298, 311], 4.6, 5.2, 20, 0.05), blob(rnd, [245, 374], 4.6, 5, 0, 0.05));
      d.push(...brush([[230, 352], [243, 352], [256, 353]], 6, { start: 0.6, end: 0.4, peak: 0.4 }));
      d.push(...brush([[242, 337], [243, 350], [243, 364]], 5.5, { start: 0.3, end: 0.6, peak: 0.6 }));
      // its sides down to its feet, apart, and its tail
      d.push(...brush([[164, 302], [169, 317], [179, 334], [189, 347], [195, 357], [193, 368], [189, 384], [188, 410], [190, 432], [200, 446], [208, 458], [206, 468]], 9, { start: 0.4, end: 0.7, peak: 0.6 }));
      d.push(...brush([[204, 469], [215, 469], [225, 465], [233, 452], [241, 439], [249, 429], [257, 420]], 8.5, { start: 0.8, end: 0.35, peak: 0.3 }));
      d.push(...brush([[257, 420], [266, 428], [278, 440], [290, 451], [301, 462], [310, 467], [320, 464]], 8.5, { start: 0.4, end: 0.6, peak: 0.6 }));
      d.push(...brush([[244, 434], [252, 435], [259, 434]], 4.5, { start: 0.6, end: 0.3, peak: 0.4 }));
      d.push(...brush([[354, 297], [351, 312], [348, 332], [343, 347], [332, 362], [323, 370], [318, 378], [318, 396], [319, 423], [318, 444], [316, 461], [311, 467]], 9, { start: 0.45, end: 0.6, peak: 0.55 }));
      d.push(...brush([[320, 375], [332, 376], [343, 383], [349, 398], [349, 409], [343, 418], [335, 421], [327, 424]], 8.5, { start: 0.5, end: 0.3, peak: 0.45 }));
      // its face: one eye, the nose and the little mouth under it
      d.push(blob(rnd, [258, 198], 10.3, 10.8, 0, 0.03));
      d.push(...brush([[203, 212], [209, 211], [215, 213]], 5.5, { start: 0.95, end: 0.7, peak: 0.2 }));
      d.push(...brush([[208, 212], [207, 220], [204, 228]], 5.2, { start: 0.6, end: 0.95, peak: 0.7 }));
      d.push(...brush([[207, 220], [212, 225], [218, 229]], 5, { start: 0.6, end: 0.9, peak: 0.7 }));
      // (a faint blurred copy under it is the ink creeping into the paper's fibres)
      const lines = d.map((x) => `<path d="${x}"/>`).join('');
      cv.add(`<g fill="${INK}" fill-opacity="0.18" filter="${softly(cv, 1.4)}">${lines}</g>`);
      cv.add(`<g fill="${INK}" filter="${torn(cv, rnd, 2, 0.11)}">${lines}</g>`);
    });
    return s.done(PLAIN);
  },
};
