import { blob, softly, torn } from '../brush.mjs';
import { along, pt, spline } from '../kit.mjs';
import { Still } from '../still.mjs';

// (no film grain: the crayon brings its own, and grain over the whole paper would only weigh the picture down)
const PLAIN = { finish: { paint: 0, grain: 0, contrast: 0, saturation: 1, warmth: 0 } };

export const piece = {
  key: 'pisik-qurdele',
  ku: 'Pisîka Bi Qurdele',
  en: 'Kitten with a bow',
  // a fluffy kitten sitting and facing us, sketched in broken, grainy strokes of black crayon on beige paper, grey
  // rubbed into its ears and cheeks, a red crayon ribbon round its neck tied in a loose bow with long trailing ends
  still(rnd) {
    const s = new Still(rnd).place([0, 0], 1);
    const BLACK = '#140f0e';
    const RED = '#8c161a';
    const PAPER = '#f4eadb';
    // the paper inside it: the head, ears, body and the plume of its tail; and under the bow's loops and trailing end,
    // so the whole of it reads over a dark picture
    const inside = [
      spline([
        [156, 55], [176, 58], [196, 54], [210, 50], [224, 42], [246, 42], [268, 36], [292, 34], [308, 42], [318, 56], [324, 82], [338, 66], [360, 53],
        [384, 49], [401, 45], [410, 60], [412, 84], [405, 104], [396, 120], [399, 142], [401, 156], [386, 172], [376, 190], [370, 214], [368, 240], [373, 270],
        [375, 300], [367, 330], [362, 356], [362, 384], [363, 406], [353, 428], [327, 449], [297, 465], [264, 473], [232, 467], [200, 474], [170, 459],
        [150, 451], [118, 448], [94, 435], [77, 413], [63, 393], [57, 360], [51, 330], [44, 300], [45, 276], [60, 246], [70, 265], [96, 275], [122, 281],
        [137, 298], [148, 284], [160, 260], [182, 250], [196, 236], [190, 210], [178, 182], [170, 150], [164, 120], [159, 90],
      ]),
      spline([[338, 226], [372, 190], [412, 170], [452, 180], [477, 208], [468, 238], [452, 256], [453, 290], [445, 310], [404, 309], [366, 291], [336, 250]]),
      spline([[358, 328], [404, 325], [433, 337], [454, 362], [457, 400], [441, 429], [420, 426], [430, 400], [434, 372], [412, 349], [370, 347]]),
    ];
    const length = (pts) => pts.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
    // A hand's line never quite runs where it is meant to: it wanders a little to either side as it goes.
    const wander = (pts, amp) => {
      const m = Math.max(6, Math.round(length(pts) / 2));
      const line = along(pts, m);
      const [phase, wave] = [rnd() * 6.3, 8 + rnd() * 7];
      let run = 0;
      return line.map((p, i) => {
        const a = line[Math.max(0, i - 1)];
        const b = line[Math.min(m, i + 1)];
        if (i) run += Math.hypot(p[0] - line[i - 1][0], p[1] - line[i - 1][1]);
        const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const o = amp * Math.sin((run / wave) * Math.PI * 2 + phase) + (rnd() - 0.5) * amp * 0.7;
        return [p[0] - ((b[1] - a[1]) / d) * o, p[1] + ((b[0] - a[0]) / d) * o];
      });
    };
    // A crayon stroke: as wide as the hand presses, which swells and fades along it, lighter where it touches down
    // (`start`) and lifts (`end`); with `gaps` the pressure dips so low in places that only grains are left.
    const crayonStroke = (p, w, { start = 0.45, end = 0.35, gaps = 0 } = {}) => {
      const m = p.length - 1;
      const [phase, wave] = [rnd() * 6.3, 14 + rnd() * 12];
      const left = [];
      const right = [];
      let run = 0;
      p.forEach((q, i) => {
        const a = p[Math.max(0, i - 1)];
        const b = p[Math.min(m, i + 1)];
        if (i) run += Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]);
        const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const t = i / m;
        const ends = Math.min(1, start + (1 - start) * Math.min(1, t * 5), end + (1 - end) * Math.min(1, (1 - t) * 5));
        const press = 1 - gaps * (0.5 + 0.5 * Math.sin((run / wave) * Math.PI * 2 + phase)) ** 3;
        const h = (w / 2) * ends * press * (0.75 + rnd() * 0.5);
        left.push([q[0] - ((b[1] - a[1]) / d) * h, q[1] + ((b[0] - a[0]) / d) * h]);
        right.push([q[0] + ((b[1] - a[1]) / d) * h, q[1] - ((b[0] - a[0]) / d) * h]);
      });
      return `M${left.map(pt).join(' L')} L${right.reverse().map(pt).join(' L')} Z`;
    };
    // A crayon line: a dense core, and round it a soft band that the paper's tooth (below) breaks into grains, thick
    // near the core and thinning out away from it.
    const cores = { [BLACK]: [], [RED]: [] };
    const bands = { [BLACK]: [], [RED]: [] };
    const line = (colour, pts, w, o, amp) => {
      const p = wander(pts, amp);
      cores[colour].push(crayonStroke(p, w, o));
      bands[colour].push(crayonStroke(p, w + 4.5, { ...o, start: Math.max(0.5, o.start ?? 0), end: Math.max(0.5, o.end ?? 0), gaps: 0 }));
    };
    const k = (pts, w, o = {}) => line(BLACK, pts, w * 0.62, { gaps: 0.6, ...o }, 1.1);
    // (fur in tufts and ticks: short, and pressed harder)
    const tuft = (pts, w, o = {}) => line(BLACK, pts, w, { gaps: 0.2, ...o }, 0.8);
    const r = (pts, w, o = {}) => line(RED, pts, w, { gaps: 0.25, ...o }, 0.8);
    // (a line pressed so lightly that it is grains only)
    const grey = (pts, w) => bands[BLACK].push(crayonStroke(wander(pts, 1), w, { start: 0.6, end: 0.5 }));
    const dot = (c, rx, ry) => {
      cores[BLACK].push(blob(rnd, c, rx, ry, rnd() * 90, 0.1));
      bands[BLACK].push(blob(rnd, c, rx + 3, ry + 3, 0, 0.1));
    };
    // The paper's tooth: noise as fine as its grain, laid against how much crayon each spot took, so that where the
    // crayon pressed it covers the paper and toward a line's edge it only catches the tops of the grain.
    const tooth = (cv) => {
      const f = cv.id('tooth');
      cv.def(`<filter id="${f}" x="0" y="0" width="512" height="512" filterUnits="userSpaceOnUse">`
        + `<feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="2" seed="${Math.floor(rnd() * 999)}" result="g0"/>`
        + '<feColorMatrix in="g0" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 2.5 -0.75" result="g"/>'
        + '<feComposite in="SourceAlpha" in2="g" operator="arithmetic" k1="0" k2="1" k3="-1" k4="0" result="d"/>'
        + '<feColorMatrix in="d" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 8 -0.8" result="m"/>'
        + '<feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0 1" result="c"/>'
        + '<feComposite in="c" in2="m" operator="in"/></filter>');
      return `url(#${f})`;
    };
    // its left ear: the outer edge heavy, the top edge only grey, fur tufted inside
    k([[156, 57], [160, 66], [161, 83], [162, 101], [166, 115], [171, 124], [165, 132]], 8.5, { start: 0.9 });
    grey([[158, 58], [170, 60], [181, 61], [193, 57]], 5);
    tuft([[196, 57], [200, 66], [203, 76], [207, 83]], 6.5);
    tuft([[187, 70], [192, 76], [195, 85]], 4.5);
    tuft([[222, 64], [225, 79], [229, 95], [229, 111]], 7.5, { start: 0.8 });
    tuft([[226, 68], [233, 72], [237, 82]], 8, { start: 0.9, end: 0.6 });
    tuft([[183, 90], [191, 95], [193, 106], [188, 119]], 8, { start: 0.8 });
    tuft([[198, 98], [207, 101], [212, 109], [207, 114]], 7.5, { start: 0.8 });
    for (const [c, rx, ry] of [[[189, 104], 5.5, 8], [[206, 107], 5, 5], [[232, 76], 5, 6], [[329, 84], 5.5, 5], [[348, 98], 6, 5], [[366, 103], 6, 5]]) dot(c, rx, ry);
    // the top of its head, a stray tuft, and its right ear tufted the same
    k([[207, 54], [214, 48], [222, 43], [233, 42], [246, 44], [257, 40], [268, 37]], 5.5, { start: 0.8, end: 0.6 });
    tuft([[287, 35], [296, 39], [304, 44]], 7, { start: 0.9, end: 0.4 });
    dot([320, 45], 2.6, 2.4);
    tuft([[324, 88], [330, 76], [340, 66], [350, 58], [361, 54], [372, 54], [381, 55], [391, 51], [401, 48]], 8, { start: 0.95, end: 0.9 });
    tuft([[404, 50], [408, 62], [409, 74], [410, 86], [408, 96]], 7, { start: 0.9 });
    tuft([[336, 96], [346, 92], [354, 88], [362, 82], [368, 74], [373, 64], [377, 59]], 7, { start: 0.95 });
    tuft([[357, 107], [368, 99], [378, 94], [386, 90], [393, 88]], 8, { start: 0.95 });
    // its cheeks in short ticks of fur, the line of its jaw, and the cheek under each eye
    tuft([[162, 110], [166, 119], [171, 128]], 7);
    tuft([[167, 140], [173, 147], [180, 156]], 7);
    tuft([[171, 159], [178, 166], [184, 175]], 7);
    tuft([[157, 177], [168, 180], [180, 184], [190, 190]], 6.5, { start: 0.9 });
    k([[196, 187], [205, 194], [214, 200], [228, 205], [243, 210], [252, 208]], 5.5, { start: 0.6 });
    tuft([[200, 209], [206, 217], [211, 227]], 8, { start: 0.8 });
    tuft([[229, 199], [238, 206], [246, 214]], 7);
    tuft([[383, 136], [388, 124], [394, 113], [402, 103]], 7.5, { start: 0.95 });
    tuft([[374, 150], [384, 145], [394, 142], [400, 139]], 7, { start: 0.95 });
    tuft([[376, 169], [386, 162], [396, 156], [402, 151]], 7, { start: 0.95 });
    tuft([[340, 191], [350, 195], [360, 196]], 7);
    tuft([[364, 202], [369, 209], [372, 217]], 7);
    // eyes, nose and mouth
    dot([246, 177], 8.2, 8.4);
    dot([321, 174], 8.2, 8);
    k([[279, 187], [285, 189], [292, 187]], 6, { start: 0.7, end: 0.7 });
    k([[285, 191], [285, 197], [284, 203]], 3.5);
    k([[274, 212], [280, 209], [285, 206], [291, 209], [297, 213]], 5, { start: 0.7 });
    // its back, down from the cheek to the tail
    k([[198, 230], [195, 242], [180, 250], [164, 258], [155, 270], [150, 289]], 5, { start: 0.9, end: 0.5 });
    k([[155, 301], [146, 308], [136, 312]], 6);
    // the tail, a plume curling up beside it, its near side heavy where it lies against the body
    k([[61, 248], [64, 262], [76, 274], [97, 277], [116, 281], [125, 293]], 7, { start: 0.95, end: 0.5, gaps: 0.3 });
    dot([62, 253], 4.5, 6.5);
    tuft([[47, 276], [51, 294], [61, 306], [72, 307]], 5.5);
    tuft([[53, 323], [66, 318], [79, 326]], 5);
    tuft([[57, 336], [60, 352], [66, 369]], 6.5, { start: 0.8 });
    tuft([[83, 360], [86, 377]], 6);
    tuft([[62, 393], [77, 389], [90, 380]], 5.5);
    k([[106, 286], [117, 306], [129, 322], [138, 342], [134, 362], [131, 382], [135, 400], [140, 417], [145, 432]], 11, { start: 0.5, end: 0.6, gaps: 0.3 });
    for (const [c, rx, ry] of [[[126, 314], 6, 5], [[134, 334], 6.5, 8], [[139, 346], 4.5, 5], [[130, 396], 5, 7], [[120, 438], 5, 4.5]]) dot(c, rx, ry);
    k([[78, 398], [82, 416], [97, 431], [116, 442], [133, 447], [149, 446], [157, 442]], 8.5, { start: 0.6 });
    // the round of its body along the ground, its haunch and a tuft of fur on it
    k([[157, 443], [171, 454], [186, 465], [202, 469], [218, 465], [228, 463], [240, 466], [252, 469], [266, 469], [281, 465]], 8.5, { start: 0.6, end: 0.6 });
    for (const [c, rx, ry] of [[[163, 448], 5, 4], [[184, 462], 4.5, 4], [[238, 465], 5, 3.5], [[262, 469], 4, 3.5]]) dot(c, rx, ry);
    k([[284, 465], [296, 461], [310, 454], [326, 446], [340, 438], [351, 427], [358, 413], [359, 401]], 6, { end: 0.5 });
    k([[354, 381], [362, 389], [368, 397]], 6.5);
    // its right side behind the bow, and the line of its chest down to its feet
    k([[360, 236], [365, 250], [368, 262], [370, 273]], 5.5);
    dot([369, 307], 6, 7);
    dot([363, 327], 5, 5.5);
    k([[361, 346], [350, 359], [338, 374], [324, 392], [312, 410], [302, 428], [292, 444], [285, 456]], 4.5, { start: 0.7, end: 0.7 });
    // its front legs, short broken lines
    k([[217, 335], [213, 346], [216, 356]], 8.5, { start: 0.9 });
    k([[220, 362], [229, 372], [234, 384], [234, 397]], 6);
    k([[233, 402], [232, 418], [235, 437], [240, 455]], 6);
    k([[267, 329], [270, 342], [272, 356], [273, 370], [271, 386]], 6.5, { start: 0.9 });
    k([[272, 390], [273, 408], [275, 429]], 6);
    k([[276, 432], [286, 446], [300, 461]], 6.5);
    k([[294, 338], [291, 350], [283, 361], [275, 370]], 5);
    // the red ribbon round its neck, and the bow: two loops and the long end trailing
    r([[212, 224], [226, 235], [242, 242], [260, 245], [281, 242], [302, 234], [322, 227], [338, 224]], 17, { start: 0.8, end: 0.55 });
    r([[334, 226], [352, 208], [373, 193], [395, 182], [412, 176], [432, 180], [451, 190], [465, 203], [468, 215], [460, 231], [446, 243], [432, 249], [418, 240], [402, 228], [380, 222], [358, 222], [338, 229]], 8, { start: 0.7, end: 0.6 });
    r([[330, 236], [346, 255], [362, 275], [382, 291], [405, 299], [427, 302], [441, 298], [446, 284], [441, 266], [432, 252]], 8, { start: 0.8, end: 0.5 });
    r([[318, 238], [306, 257], [301, 278], [303, 298], [311, 314], [324, 326], [340, 335], [358, 339], [379, 335], [402, 334], [424, 342], [440, 359], [447, 379], [444, 399], [435, 414], [428, 421]], 11.5, { start: 0.8, end: 0.1 });
    s.paint((cv) => {
      // (grown a little past the outer lines, so that their grains lie on paper even over a dark picture)
      cv.add(`<g filter="${softly(cv, 1.2)}"><g fill="${PAPER}" stroke="${PAPER}" stroke-width="12" stroke-linejoin="round" filter="${torn(cv, rnd, 5, 0.05)}">`
        + `${inside.map((d) => `<path d="${d}"/>`).join('')}</g></g>`);
      const paths = (list) => list.map((d) => `<path d="${d}"/>`).join('');
      // the faint rosy shadow round every line, where the crayon's dust settled
      cv.add(`<g fill="#b06a5e" fill-opacity="0.36" filter="${softly(cv, 4.5)}" transform="translate(1.5 1.5)">${paths(bands[BLACK])}${paths(bands[RED])}</g>`);
      // grey rubbed into its ears, its cheeks, under its eyes and between its feet; then the lines, black and red
      const smudge = (c, rx, ry, turn, o) => `<path d="${blob(rnd, c, rx, ry, turn, 0.12)}" fill-opacity="${o}"/>`;
      const soft = softly(cv, 2.2);
      cv.add(`<g filter="${tooth(cv)}"><g fill="#2c2321" filter="${softly(cv, 5)}">`
        + smudge([182, 74], 16, 12, 10, 0.5) + smudge([170, 61], 12, 6, 0, 0.5) + smudge([392, 66], 15, 8, -10, 0.45)
        + smudge([222, 209], 22, 12, 20, 0.62) + smudge([352, 202], 16, 10, -10, 0.55) + smudge([286, 194], 58, 7, 0, 0.38)
        + smudge([283, 442], 15, 16, 0, 0.65) + '</g>'
        + `<g fill="${BLACK}" filter="${soft}">${paths(bands[BLACK])}</g><g fill="${RED}" filter="${soft}">${paths(bands[RED])}</g></g>`);
      // the crayon's solid body, its edge only a little lumpy
      cv.add(`<g fill="${BLACK}" filter="${torn(cv, rnd, 2.2, 0.3)}">${paths(cores[BLACK])}</g>`);
      cv.add(`<g fill="${RED}" filter="${torn(cv, rnd, 2, 0.3)}">${paths(cores[RED])}</g>`);
    });
    return s.done(PLAIN);
  },
};
