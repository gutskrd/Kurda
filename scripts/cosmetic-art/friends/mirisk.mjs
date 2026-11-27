import { softly, torn } from '../brush.mjs';
import { along, n, pt, spline } from '../kit.mjs';
import { Still } from '../still.mjs';

const PLAIN = { finish: { paint: 0, grain: 0.012, contrast: 0, saturation: 1, warmth: 0 } };

/**
 * A brush-pen line along `points`, `w` at its fullest: its width swells and thins smoothly as the hand presses
 * (`press`), gets heavier toward its end as the pen is pushed harder (`grow`), and it sets down and lifts with blunt
 * round ends rather than points.
 */
function inked(rnd, points, w, { press = 0.28, grow = 0, start = 0.8, end = 0.7 } = {}) {
  const hand = points.map(([x, y]) => [x + (rnd() - 0.5) * 2.4, y + (rnd() - 0.5) * 2.4]);
  let length = 0;
  for (let i = 1; i < hand.length; i++) length += Math.hypot(hand[i][0] - hand[i - 1][0], hand[i][1] - hand[i - 1][1]);
  const count = Math.max(8, Math.round(length / 3));
  const line = along(hand, count);
  const [p1, p2, f1, f2] = [rnd() * 6.3, rnd() * 6.3, 1 + rnd() * 1.5, 3 + rnd() * 3];
  const left = [];
  const right = [];
  const r = [];
  line.forEach((p, i) => {
    const t = i / count;
    const a = line[Math.max(0, i - 1)];
    const b = line[Math.min(count, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const [nx, ny] = [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
    const swell = (1 + press * (0.65 * Math.sin(t * f1 * Math.PI + p1) + 0.35 * Math.sin(t * f2 * Math.PI + p2))) * (1 + grow * (2 * t - 1));
    const ends = Math.min(start + (1 - start) * Math.min(1, (t * length) / 14), end + (1 - end) * Math.min(1, ((1 - t) * length) / 14));
    const half = (w / 2) * swell * ends;
    r.push(half);
    left.push([p[0] + nx * half, p[1] + ny * half]);
    right.push([p[0] - nx * half, p[1] - ny * half]);
  });
  const cap = (p, h) => `M${n(p[0] - h)},${n(p[1])} a${n(h)},${n(h)} 0 1,0 ${n(h * 2)},0 a${n(h)},${n(h)} 0 1,0 ${n(-h * 2)},0 Z`;
  return `M${left.map(pt).join(' L')} L${right.reverse().map(pt).join(' L')} Z ${cap(line[0], r[0])} ${cap(line[count], r[count])}`;
}

export const piece = {
  key: 'mirisk',
  ku: 'Mirîşk',
  en: 'Hen',
  // a round, fluffy hen turned three-quarters to our right, in a thick wobbly black brush pen over flat cream: her
  // scalloped back rising to a tall tail, her head just the top of her, a red comb of three bumps and a red wattle,
  // dot eyes either side of a small beak, her wing in three short strokes, thin legs and three-toed feet
  still(rnd) {
    const s = new Still(rnd).place([0, 0], 1);
    const LINE = '#111010';
    const CREAM = '#f2dfc6';
    const RED = '#da5e46';
    const DRAG = '#5c4b36';
    // her whole outline, as one soft shape for the fill: the tail lobe, the head and comb foot, her round front, the
    // ruffled underside and the scallops of her back
    const body = spline([
      [200, 34], [219, 42], [235, 62], [245, 86], [253, 108], [262, 114], [274, 103], [287, 95], [300, 88], [320, 86], [340, 91], [358, 98],
      [366, 102], [373, 113], [378, 124], [383, 136], [388, 148], [395, 160], [404, 172], [410, 184], [416, 196], [422, 208], [426, 220],
      [430, 232], [433, 244], [437, 256], [442, 268], [446, 280], [448, 296], [448, 316], [447, 332], [442, 352], [437, 364], [431, 377],
      [423, 389], [413, 401], [404, 411], [392, 421], [380, 431], [368, 437], [356, 437], [344, 434], [332, 435], [320, 439], [308, 443],
      [296, 441], [284, 437], [272, 434], [260, 430], [244, 428], [222, 426], [200, 426], [186, 425], [174, 423], [162, 422], [150, 421],
      [140, 417], [128, 414], [114, 411], [102, 406], [88, 399], [76, 387], [68, 371], [64, 352], [64, 334], [68, 316], [72, 302], [72, 288],
      [75, 272], [84, 265], [96, 261], [104, 257], [97, 249], [93, 238], [92, 225], [96, 212], [106, 203], [120, 197], [112, 186], [109, 174],
      [109, 160], [112, 146], [118, 134], [128, 123], [140, 116], [151, 109], [157, 98], [158, 84], [165, 75], [178, 74], [189, 74], [188, 54],
      [192, 40],
    ]);
    const comb = spline([[301, 90], [304, 80], [308, 62], [313, 49], [320, 43], [327, 46], [332, 57], [339, 57], [346, 56], [352, 62], [354, 74],
      [357, 81], [362, 84], [364, 92], [363, 101], [346, 97], [330, 90], [315, 88]]);
    const wattle = spline([[336, 148], [358, 147], [360, 160], [357, 171], [349, 170], [343, 177], [333, 177], [329, 165]]);
    s.paint((cv) => {
      // the comb first, so the cream of her head lies over its foot
      cv.add(`<path d="${comb}" fill="${RED}"/>`);
      cv.add(`<path d="${body}" fill="${CREAM}"/>`);
      cv.add(`<path d="${wattle}" fill="${RED}"/>`);
      // where the pen dragged dry along the inside of the line, a faint brown smear
      const smear = [
        [[[96, 378], [104, 388], [114, 394]], 5], [[[70, 326], [78, 334]], 4], [[[436, 352], [430, 366], [424, 374]], 5],
        [[[214, 293], [226, 300]], 4], [[[268, 116], [262, 130]], 4], [[[160, 418], [176, 414]], 4], [[[100, 196], [92, 206]], 4],
      ];
      const smeared = smear.map(([p, w]) => `<path d="${inked(rnd, p, w, { start: 0.4, end: 0.3 })}"/>`).join('');
      cv.add(`<g fill="${DRAG}" fill-opacity="0.42" filter="${softly(cv, 1.3)}">${smeared}</g>`);
      const ink = (lines) => {
        cv.add(`<g fill="${LINE}" filter="${torn(cv, rnd, 2.6, 0.11)}">${lines.map(([p, w, o]) => `<path d="${inked(rnd, p, w, o)}"/>`).join('')}</g>`);
      };
      ink([
        // the tall tail lobe, set down with a little hook at its foot
        [[[193, 83], [188, 75], [188, 58], [190, 45], [195, 36], [204, 33], [219, 42], [235, 62], [245, 86], [252, 106], [258, 115], [263, 122]], 9.5],
        // the back of her head, run on past the tail into her body
        [[[231, 160], [237, 146], [247, 130], [259, 116], [273, 104], [287, 95], [300, 89]], 9],
        // the scallops of her back, one breath each
        [[[193, 83], [186, 76], [176, 74], [165, 75], [159, 83], [157, 97], [151, 108], [139, 115], [127, 123], [117, 135], [111, 150], [109, 165],
          [110, 179], [115, 190], [121, 196], [123, 203]], 9.5],
        [[[122, 197], [110, 200], [100, 207], [94, 219], [92, 231], [95, 243], [100, 252], [106, 257]], 9],
        [[[107, 257], [94, 260], [83, 264], [75, 270], [71, 280], [71, 292], [72, 303], [68, 316], [64, 336], [65, 356], [69, 373], [77, 388], [89, 399],
          [103, 406], [116, 411], [130, 414], [141, 417]], 9.5],
        [[[73, 299], [80, 296], [84, 288], [81, 279], [76, 274]], 5.5],
        // her ruffled underside
        [[[139, 416], [150, 421], [163, 422], [176, 423], [190, 426], [206, 426], [224, 426], [244, 428], [260, 430], [273, 435], [285, 438], [297, 442],
          [308, 443], [320, 438], [333, 435], [345, 434], [357, 437], [369, 436], [381, 430], [393, 421], [404, 411], [410, 403]], 9],
        // her round front, down from the comb
        [[[362, 100], [371, 110], [378, 124], [383, 136], [388, 148], [395, 160], [404, 172], [410, 184], [416, 196], [422, 208], [426, 220], [430, 233]], 8.2,
          { grow: 0.1 }],
        [[[428, 230], [433, 245], [438, 257], [443, 269], [446, 281], [448, 297], [448, 316], [447, 333], [442, 352], [436, 366], [429, 379], [420, 391],
          [409, 401], [403, 405]], 10, { grow: 0.18, end: 0.8 }],
        // the comb's three bumps
        [[[300, 89], [304, 79], [308, 61], [313, 49], [320, 42], [328, 45], [332, 54], [334, 60]], 8],
        [[[333, 58], [339, 54], [346, 54], [352, 60], [355, 70], [356, 80]], 7.5],
        [[[355, 79], [361, 81], [365, 88], [366, 96], [362, 101]], 8],
        // her wing, three short strokes
        [[[196, 200], [180, 208], [163, 218], [151, 228], [146, 241], [148, 252], [156, 258], [168, 259]], 9.5, { start: 0.95, end: 0.8 }],
        [[[138, 268], [141, 278], [150, 285], [167, 287]], 8.5],
        [[[187, 296], [192, 305], [205, 309], [221, 309], [232, 301], [240, 294]], 8.5],
        // the wattle, round its two lobes
        [[[337, 150], [332, 161], [331, 172], [336, 178], [344, 176], [348, 169]], 7],
        [[[348, 169], [353, 174], [359, 168], [360, 158], [358, 149]], 7],
        // her legs and three-toed feet
        [[[199, 427], [201, 438], [204, 447]], 6.5],
        [[[180, 452], [192, 449], [204, 447], [216, 446], [228, 446]], 6.5],
        [[[204, 447], [206, 452], [208, 458]], 6],
        [[[329, 437], [333, 447], [338, 458], [343, 468], [349, 478]], 6.5],
        [[[316, 469], [328, 466], [338, 460]], 6.5],
        [[[340, 458], [352, 455], [366, 458]], 6.5],
      ]);
      // eyes either side of the beak, the far one sitting on her outline
      const beak = spline([[338, 131], [344, 124], [355, 123], [362, 130], [357, 138], [347, 141], [342, 145]]);
      cv.add(`<g fill="${LINE}" filter="${torn(cv, rnd, 1.6, 0.14)}">`
        + '<ellipse cx="322" cy="127" rx="8.6" ry="9.6" transform="rotate(-8 322 127)"/><ellipse cx="370" cy="122" rx="9.2" ry="9.4"/>'
        + `<path d="${beak}"/></g>`);
      // the glint on her beak
      cv.add('<ellipse cx="348.5" cy="132.5" rx="3.8" ry="2.6" transform="rotate(-20 348.5 132.5)" fill="#f6ebdc"/>');
    });
    return s.done(PLAIN);
  },
};
