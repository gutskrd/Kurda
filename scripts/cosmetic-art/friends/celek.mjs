import { crayon, softly, strokes, within } from '../brush.mjs';
import { along, n, pt, spline } from '../kit.mjs';
import { Still } from '../still.mjs';

const PLAIN = { finish: { paint: 0, grain: 0.012, contrast: 0, saturation: 1, warmth: 0 } };

/**
 * A crayon line along `points`, `w` at its fullest: its width swells and thins a little as the hand presses
 * (`press`), and it sets down and lifts with round ends. One outline for each of `scales`, all along the same stroke.
 */
function drawn(rnd, points, w, { press = 0.16, start = 0.75, end = 0.65, scales = [1] } = {}) {
  const hand = points.map(([x, y]) => [x + (rnd() - 0.5) * 1.6, y + (rnd() - 0.5) * 1.6]);
  let length = 0;
  for (let i = 1; i < hand.length; i++) length += Math.hypot(hand[i][0] - hand[i - 1][0], hand[i][1] - hand[i - 1][1]);
  const count = Math.max(8, Math.round(length / 3));
  const line = along(hand, count);
  const [p1, p2, f1, f2] = [rnd() * 6.3, rnd() * 6.3, 1 + rnd() * 1.5, 3 + rnd() * 3];
  const half = [];
  const normal = [];
  line.forEach((p, i) => {
    const t = i / count;
    const a = line[Math.max(0, i - 1)];
    const b = line[Math.min(count, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const [nx, ny] = [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
    const swell = 1 + press * (0.65 * Math.sin(t * f1 * Math.PI + p1) + 0.35 * Math.sin(t * f2 * Math.PI + p2));
    const ends = Math.min(start + (1 - start) * Math.min(1, (t * length) / 10), end + (1 - end) * Math.min(1, ((1 - t) * length) / 10));
    half.push((w / 2) * swell * ends);
    normal.push([nx, ny]);
  });
  const cap = (p, h) => `M${n(p[0] - h)},${n(p[1])} a${n(h)},${n(h)} 0 1,0 ${n(h * 2)},0 a${n(h)},${n(h)} 0 1,0 ${n(-h * 2)},0 Z`;
  return scales.map((k) => {
    const left = line.map((p, i) => [p[0] + normal[i][0] * half[i] * k, p[1] + normal[i][1] * half[i] * k]);
    const right = line.map((p, i) => [p[0] - normal[i][0] * half[i] * k, p[1] - normal[i][1] * half[i] * k]).reverse();
    return `M${left.map(pt).join(' L')} L${right.map(pt).join(' L')} Z ${cap(line[0], half[0] * k)} ${cap(line[count], half[count] * k)}`;
  });
}

export const piece = {
  key: 'celek',
  ku: 'Çêlek',
  en: 'Cow',
  // a cow as round as a ball, white with big soft dark-maroon patches, in crayon with a thin dark line: her small
  // head low and to the right, facing us, with white ears out to the sides, two orange horns, dot eyes and a pink
  // muzzle; a blue collar behind it with a little yellow bell, four short legs with dark hooves, a thin tufted tail
  still(rnd) {
    const s = new Still(rnd).place([0, 0], 1);
    const LINE = '#2a2727';
    const WHITE = '#fefdfb';
    const PATCH = '#301a1d';
    const ORANGE = '#f3a152';
    const RUST = '#e0742a';
    const PINK = '#d6686d';
    const SKY = '#93c7f0';
    const BLUE = '#2d679d';
    const GOLD = '#ebc94e';
    // crayon laid in: its edge dragged a little and the paper's tooth just showing
    const filled = (cv, d, colour, keep = 2.7) => {
      cv.add(`<path d="${d}" fill="${colour}" filter="${crayon(cv, rnd, { keep, tear: 1.6, grain: 0.7 })}"/>`);
    };
    // a crayon line: solid where the crayon pressed, grainy along its edges where it dragged on the paper
    const lines = (cv, list, colour = LINE, keep = 2.8) => {
      const marks = list.map(([p, w, o]) => drawn(rnd, p, w, { ...o, scales: [0.74, 1.14] }));
      const fringe = crayon(cv, rnd, { keep: 1.85, tear: 2.2, grain: 0.85 });
      const core = crayon(cv, rnd, { keep, tear: 1.3, grain: 0.8 });
      cv.add(`<g fill="${colour}" opacity="0.7" filter="${fringe}">${marks.map(([, d]) => `<path d="${d}"/>`).join('')}</g>`);
      cv.add(`<g fill="${colour}" filter="${core}">${marks.map(([d]) => `<path d="${d}"/>`).join('')}</g>`);
    };
    // an oval as a hand draws one, `turn` degrees round: its points, to fill and to draw round
    const oval = ([cx, cy], rx, ry, turn) => {
      const [c, si] = [Math.cos((turn * Math.PI) / 180), Math.sin((turn * Math.PI) / 180)];
      return Array.from({ length: 12 }, (_, i) => {
        const t = (i / 12) * Math.PI * 2;
        const k = 1 + (rnd() - 0.5) * 0.06;
        const [x, y] = [Math.cos(t) * rx * k, Math.sin(t) * ry * k];
        return [cx + x * c - y * si, cy + x * si + y * c];
      });
    };
    // a patch: pressed hard, so the crayon covers, its edge feathered where the stroke ran out
    const patch = (cv, d) => {
      const laid = crayon(cv, rnd, { keep: 2.9, tear: 3.2, grain: 0.45 });
      cv.add(`<g filter="${softly(cv, 1.1)}"><path d="${d}" fill="${PATCH}" filter="${laid}"/></g>`);
    };
    const ball = spline([
      [113, 380], [105, 374], [86, 353], [70, 329], [55, 304], [48, 275], [45, 246], [44, 217], [47, 188], [55, 160], [67, 134], [84, 110],
      [104, 89], [127, 72], [151, 58], [177, 45], [203, 37], [231, 35], [259, 36], [286, 38], [314, 42], [340, 52], [365, 65], [387, 82],
      [409, 100], [429, 121], [447, 145], [462, 172], [466, 202], [467, 232], [467, 262], [462, 292], [452, 321], [436, 347], [416, 369],
      [396, 388], [360, 414], [320, 428], [290, 431], [260, 433], [238, 433], [216, 430], [198, 425], [180, 419], [166, 413], [152, 407],
      [139, 401], [127, 392],
    ]);
    const head = spline([
      [298, 261], [320, 258], [340, 256], [360, 256], [369, 260], [376, 267], [382, 277], [386, 287], [389, 297], [391, 306], [392, 316],
      [393, 326], [396, 336], [397, 346], [399, 356], [402, 366], [405, 377], [407, 389], [406, 399], [398, 408], [381, 416], [358, 423],
      [336, 430], [322, 431], [310, 426], [302, 417], [297, 405], [294, 394], [291, 383], [288, 371], [284, 358], [280, 345], [276, 334],
      [277, 322], [280, 311], [283, 298], [288, 272],
    ]);
    const muzzle = spline([[311, 419], [318, 405], [332, 392], [349, 382], [368, 376], [390, 375], [400, 381], [401, 392], [396, 401], [385, 409],
      [370, 415], [355, 420], [335, 423], [316, 423]]);
    const earL = [[283, 304], [271, 302], [260, 305], [249, 311], [239, 318], [231, 326], [227, 331], [234, 335], [244, 337], [254, 337], [263, 335], [271, 331],
      [278, 326]];
    const earR = [[388, 285], [400, 283], [411, 285], [419, 289], [424, 294], [417, 298], [405, 300], [391, 302]];
    const legs = [
      { side: [[130, 400], [130, 432], [130, 452], [134, 464], [144, 473], [154, 476], [164, 472], [171, 460], [172, 445], [173, 416]], hoof: 446 },
      { side: [[219, 428], [218, 448], [222, 460], [234, 467], [247, 464], [254, 453], [255, 430]], hoof: 443 },
      { side: [[295, 430], [294, 452], [300, 464], [312, 469], [322, 465], [322, 440]], hoof: 446 },
      { side: [[321, 432], [321, 455], [328, 470], [342, 479], [355, 476], [364, 465], [367, 448], [369, 425]], hoof: 449 },
    ];
    s.paint((cv) => {
      // four short legs under her, dark at the hoof
      for (const { side, hoof } of legs) {
        const [x0, x1] = [side[0][0], side[side.length - 1][0]];
        const leg = spline([...side, [x1, side[0][1] - 20], [x0, side[0][1] - 20]]);
        cv.add(`<path d="${leg}" fill="${WHITE}"/>`);
        cv.add(`<g clip-path="${within(cv, leg)}">`);
        patch(cv, `M${x0 - 10},${hoof} Q${n((x0 + x1) / 2)},${hoof + 2} ${x1 + 10},${hoof} L${x1 + 10},490 L${x0 - 10},490 Z`);
        cv.add('</g>');
        lines(cv, [[side, 7]]);
      }
      // a thin tail, orange, with a dark tuft at its end
      lines(cv, [[[[99, 372], [103, 386], [109, 399], [114, 410]], 6.4]], RUST, 2.6);
      lines(cv, [[[[99, 372], [103, 386], [109, 399], [113, 408]], 3.6]], ORANGE, 2.8);
      lines(cv, [
        [[[114, 406], [112, 416], [111, 426]], 4.8], [[[115, 407], [116, 420], [119, 433]], 4.4], [[[116, 407], [121, 419], [126, 430]], 4.2],
        [[[115, 406], [113, 413], [109, 418]], 4],
      ], PATCH, 2.6);
      // the ball of her body and its patches
      cv.add(`<path d="${ball}" fill="${WHITE}"/>`);
      cv.add(`<g clip-path="${within(cv, ball)}">`);
      const patches = [
        spline([[28, 150], [60, 160], [90, 168], [130, 172], [160, 169], [183, 161], [198, 151], [216, 136], [232, 119], [245, 99], [253, 78], [257, 56],
          [258, 26], [200, 8], [100, 26], [32, 90]]),
        spline([[372, 77], [393, 83], [404, 99], [406, 120], [401, 140], [390, 154], [375, 159], [359, 153], [347, 138], [342, 118], [346, 98], [354, 85]]),
        spline([[452, 146], [434, 162], [419, 179], [408, 200], [401, 222], [398, 246], [397, 276], [399, 310], [404, 340], [410, 362], [420, 378], [496, 380],
          [500, 150]]),
        spline([[34, 246], [62, 252], [79, 257], [93, 266], [101, 279], [106, 293], [111, 309], [115, 325], [115, 340], [111, 353], [104, 364], [96, 374],
          [34, 384]]),
      ];
      for (const d of patches) patch(cv, d);
      // a few crayon strokes over the patches, where the colour went on thicker or thinner
      strokes(cv, rnd, patches.join(' '), [40, 30, 470, 440], {
        count: 160, colours: ['#4b2d30', '#1f1012'], flow: () => -38, length: 16, width: 2.6, opacity: [0.15, 0.35], spread: 18,
      });
      cv.add('</g>');
      lines(cv, [
        [[[300, 431], [270, 433], [238, 433], [216, 430], [198, 425], [180, 419], [166, 413], [152, 407], [139, 401], [127, 392], [113, 380], [100, 368],
          [86, 353], [70, 329], [55, 304], [48, 275], [45, 246], [44, 217]], 7.3],
        [[[45, 226], [47, 188], [55, 160], [67, 134], [84, 110], [104, 89], [127, 72], [151, 58], [177, 45], [203, 37], [231, 35], [259, 36], [286, 38]], 7],
        [[[272, 37], [286, 38], [314, 42], [340, 52], [365, 65], [387, 82], [409, 100], [429, 121], [447, 145], [462, 172], [466, 202], [467, 232],
          [467, 262], [462, 292], [452, 321], [436, 347], [416, 369], [404, 377]], 7.3],
      ]);
      // the blue collar behind her head, and its bell
      const collar = [[325, 252], [315, 248], [303, 249], [292, 254], [280, 263], [269, 273], [262, 285], [259, 297], [260, 311], [263, 325], [266, 338],
        [269, 348], [273, 356], [278, 363], [283, 368]];
      lines(cv, [[collar, 10, { press: 0.12, start: 0.9, end: 0.4 }]], SKY, 3);
      lines(cv, [
        [[[331, 248], [318, 243], [303, 244], [290, 249], [278, 257]], 3.2],
        [[[259, 279], [256, 289], [254, 299], [255, 307]], 3.2],
        [[[259, 330], [261, 340], [264, 350], [270, 359], [277, 366], [283, 369]], 3.2],
      ], BLUE, 2.6);
      const bell = 'M293,386 C299,386 301,396 300,404 C299,412 297,417 292,417 C287,417 285,411 286,403 C287,394 288,386 293,386 Z';
      filled(cv, bell, GOLD);
      lines(cv, [[[[293, 386], [299, 389], [301, 401], [298, 413], [292, 417], [286, 412], [285, 400], [288, 389], [293, 386]], 2.4]], '#c99a2e', 2.6);
      // the far horn, behind her head
      const hornR = oval([388, 251], 21, 12.5, 80);
      filled(cv, spline(hornR), ORANGE);
      lines(cv, [[[...hornR, hornR[0], hornR[1]], 5.2]], RUST, 2.6);
      // white ears out to the sides
      filled(cv, spline(earL), WHITE, 3);
      filled(cv, spline(earR), WHITE, 3);
      // her head, its pink muzzle and its line
      cv.add(`<path d="${head}" fill="${WHITE}"/>`);
      filled(cv, muzzle, PINK, 2.9);
      strokes(cv, rnd, muzzle, [306, 370, 406, 428], {
        count: 40, colours: ['#c5585f', '#e07a7e'], flow: () => -20, length: 14, width: 2.4, opacity: [0.2, 0.45], spread: 20,
      });
      lines(cv, [
        [earL, 6.6], [earR, 6.2],
        [[[296, 261], [320, 258], [340, 256], [360, 256], [369, 260], [376, 267], [382, 277], [386, 287], [389, 297], [391, 306], [392, 316], [393, 326],
          [396, 336], [397, 346], [399, 356], [402, 366], [405, 377], [407, 389], [406, 399], [398, 408], [381, 416], [358, 423], [336, 430], [322, 431],
          [311, 426]], 7.9],
        [[[285, 290], [282, 303], [279, 314], [276, 325], [277, 336], [281, 347], [285, 360], [288, 372], [291, 385], [294, 398], [298, 410], [304, 421],
          [314, 429]], 7.9],
        // the mouth, a short mark up from the chin
        [[[370, 420], [369, 413], [368, 406]], 6.2, { start: 1, end: 0.6 }],
      ]);
      // the near horn, over the corner of her head
      const hornL = oval([282, 270], 26.5, 15.2, 59);
      filled(cv, spline(hornL), ORANGE);
      lines(cv, [[[...hornL, hornL[0], hornL[1]], 5.8]], RUST, 2.6);
      // eyes and nostrils
      cv.add(`<g fill="${LINE}" filter="${crayon(cv, rnd, { keep: 2.8, tear: 1.2, grain: 0.8 })}">`
        + '<ellipse cx="317" cy="325" rx="7.4" ry="8.4"/><ellipse cx="386" cy="316" rx="6.4" ry="7.4"/>'
        + '<ellipse cx="339" cy="404" rx="4.4" ry="6.8" transform="rotate(8 339 404)"/>'
        + '<ellipse cx="390" cy="400" rx="4" ry="6.2" transform="rotate(12 390 400)"/></g>');
    });
    return s.done(PLAIN);
  },
};
