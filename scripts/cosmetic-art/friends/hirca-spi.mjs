import { blob, torn } from '../brush.mjs';
import { along, pt, spline } from '../kit.mjs';
import { Still } from '../still.mjs';

const PLAIN = { finish: { paint: 0, grain: 0.012, contrast: 0, saturation: 1, warmth: 0 } };

/**
 * A felt-tip line through `pts`, about `width` wide: round at both ends, as a marker's tip is, swelling and thinning a
 * little as the hand's pressure and speed change, going from `from` to `to` times its width end to end, and never
 * quite straight, the hand shaking it off its course by up to `shake`.
 */
function pen(rnd, pts, width, { swell = 0.16, ends = 0.8, from = 1, to = 1, shake = 0.22 } = {}) {
  let length = 0;
  for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const count = Math.max(6, Math.ceil(length / 1.2));
  const line = along(pts, count);
  const waves = [0, 1].map((i) => [30 + rnd() * 50 / (i + 1), rnd() * 6, swell / (i + 1)]);
  const shakes = [0, 1].map((i) => [18 + rnd() * 24 / (i + 1), rnd() * 6, shake / (i + 1)]);
  const left = [];
  const right = [];
  const half = [];
  let s = 0;
  line.forEach((p, i) => {
    const a = line[Math.max(0, i - 1)];
    const b = line[Math.min(count, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const [nx, ny] = [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
    if (i) s += Math.hypot(p[0] - line[i - 1][0], p[1] - line[i - 1][1]);
    const t = Math.min(s, length - s) / Math.min(8, length / 2);
    const wave = (list) => list.reduce((sum, [len, ph, amp]) => sum + amp * Math.sin((s / len) * Math.PI * 2 + ph), 0);
    const w = (width / 2) * (from + (to - from) * (s / length)) * (1 + wave(waves)) * (ends + (1 - ends) * Math.min(1, t));
    const off = wave(shakes);
    half.push(w);
    left.push([p[0] + nx * (off + w), p[1] + ny * (off + w)]);
    right.push([p[0] + nx * (off - w), p[1] + ny * (off - w)]);
  });
  // a round tip at each end: half a circle from one side of the line to the other
  const cap = (p, q, r) => {
    const l = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1;
    const [ux, uy] = [(p[0] - q[0]) / l, (p[1] - q[1]) / l];
    const [nx, ny] = [-uy, ux];
    return [1, 2, 3, 4, 5].map((k) => {
      const th = (k / 6) * Math.PI;
      return [p[0] + r * (nx * Math.cos(th) + ux * Math.sin(th)), p[1] + r * (ny * Math.cos(th) + uy * Math.sin(th))];
    });
  };
  // (the caps sit on the shaken line, halfway between its two sides)
  const mid = (i) => [(left[i][0] + right[i][0]) / 2, (left[i][1] + right[i][1]) / 2];
  const tip = cap(mid(count), mid(count - 1), half[count]);
  const back = cap(mid(0), mid(1), half[0]);
  return `M${[...left, ...tip, ...right.reverse(), ...back].map(pt).join(' L')} Z`;
}

export const piece = {
  key: 'hirca-spi',
  ku: 'Hirça Spî',
  en: 'White bear',
  // a big round white bear walking off to our left, drawn in one black felt-tip line: its head and body one huge
  // mass, a small round ear, a raised brow, two dot eyes, a snout with the nose at its tip, two straight front legs
  // with a few toes, and a hind leg as a block with a ragged furry foot
  still(rnd) {
    const s = new Still(rnd).place([5.8, 22.1], 1.45);
    const INK = '#121110';
    const PAPER = '#fdfcf8';
    const top = [[127, 152], [133, 146], [140, 142.5], [150, 137.5], [160, 132], [170, 127], [180, 123.5], [190, 119], [200, 114], [210, 110], [220, 106.5],
      [230, 104.5], [240, 102.5], [250, 100], [260, 98.5], [270, 97], [280, 96], [290, 95], [300, 94.2], [310, 95], [320, 98], [330, 104.5], [340, 110.5],
      [350, 116.5], [360, 123], [370, 132.5], [380, 145], [386, 154], [391, 163], [395, 170.5]];
    const back = [[391, 162], [396, 171], [400, 180], [402.5, 190], [403.8, 200], [404.5, 210], [404, 220], [402.5, 230], [401, 240], [400, 250], [398.5, 260],
      [395.5, 270], [392.5, 280], [389, 290], [384, 300], [378, 310], [373.5, 320], [369, 329], [362, 339], [356, 345], [350, 350], [345, 354],
      [340, 358.5], [335, 362], [330, 365.5], [326.5, 368.5]];
    const face = [[150, 137.5], [140, 142.5], [132, 148], [127.5, 155], [124.5, 161], [120, 168.5], [112.5, 180], [107.5, 190], [104.5, 200], [104.5, 210],
      [105.5, 220], [107, 230], [108.5, 240], [114.5, 250], [123, 259], [131.5, 270], [138.5, 280], [142, 290], [144.5, 300], [147.5, 310], [151.5, 320],
      [155.5, 330], [159.5, 340], [163.5, 350], [168, 360], [171.5, 368], [170.5, 373], [167, 377.5], [164, 381], [162, 384.5]];
    const ear = [[124, 153.5], [118.5, 150.5], [111, 149.5], [104, 151.5], [100.5, 156.5], [100.2, 164], [103.5, 170], [108.5, 174], [114, 175.5],
      [118, 174.5]];
    const feet = [[161, 384.5], [170, 386], [180, 387], [190, 386.5], [200, 385], [206, 384]];
    const inner = [[213, 315], [213, 322], [213, 330], [212.5, 340], [213, 350], [213.5, 360], [213, 368], [211, 373], [208.5, 376.5], [206, 380.5],
      [205.5, 384.5], [211, 386], [220, 386], [230, 385], [240, 383.5], [245.5, 382.8]];
    const belly = [[249.5, 379.5], [250.8, 376], [252, 370], [254.5, 365], [257.5, 360], [260, 355], [262.5, 350], [266.5, 340], [270.5, 330], [274.5, 320],
      [277, 311]];
    const hip = [[276, 310.5], [282, 309.5], [290, 307.5], [300, 303], [305.5, 299.5], [309, 310], [313, 320], [315.5, 330], [318, 340], [316, 345.5],
      [313, 350], [310.5, 354.5], [307.5, 357.5]];
    const thigh = [[282, 310], [284, 316], [286, 321], [288.5, 327], [289.5, 333], [289, 340], [287, 346], [285, 351]];
    const fur = [[285, 351.5], [287.5, 349.5], [289.5, 353.5], [292, 350], [294.5, 354.5], [297.5, 351], [300, 355.5], [303, 352.5], [305.5, 357],
      [309.5, 355.5]];
    const heel = [[306, 357.5], [308.5, 361.5], [311, 358], [313.5, 363], [316.5, 359.5], [319, 364.5], [321.5, 362], [323.5, 367], [327, 368.5]];
    const snout = [[147, 204.5], [153, 209], [159.5, 215.5], [163, 221], [165.5, 230], [163.5, 238], [159.5, 243.5], [153.5, 247.5], [144, 249.5],
      [134, 249.5], [127, 246.5], [125.5, 240], [129, 231], [134.5, 221], [140, 213], [144, 207.5], [147.5, 204.5]];
    const brow = [[175, 177.5], [176.5, 172], [180.5, 166.5], [186, 162.5], [193, 161.2], [199, 162.5], [202.5, 167], [202.5, 174.5], [199.5, 182.5]];
    // the paper inside: the outer lines taken in turn round the bear, from the ear over the back, along the feet and up the jaw
    const outline = [...ear.slice().reverse(), ...top.slice(1), ...back.slice(3), ...heel.slice().reverse().slice(1), ...fur.slice().reverse(),
      ...thigh.slice().reverse().slice(1), ...belly.slice().reverse(), ...inner.slice(11).reverse(), ...feet.slice().reverse(), ...face.slice(6).reverse()];
    s.paint((cv) => {
      cv.add(`<path d="${spline(outline)}" fill="${PAPER}"/>`);
      // each line's width, and how it runs from one end to the other: thin over the top, heavy down the back and the jaw
      const lines = [
        [top, 6, { from: 0.85, to: 1.1 }], [back, 7.2, { from: 1.05, to: 0.95 }], [face, 7.2, { from: 1.05, to: 0.9 }], [ear, 5.6], [feet, 4.6], [inner, 4.5],
        [belly, 4.8], [hip, 4.4], [thigh, 4.4], [fur, 3.4, { swell: 0.1 }], [heel, 3.6, { swell: 0.1 }], [snout, 5, { from: 0.75, to: 1.2 }], [brow, 5.2],
      ];
      const ink = lines.map(([pts, w, o]) => pen(rnd, pts, w, o));
      // the toes, a few short dabs under each front foot
      for (const [x, y] of [[166, 387], [172, 388], [178, 388], [184, 387.5], [210.5, 387.5], [215.5, 388], [220.5, 388], [225.5, 387.5]]) {
        ink.push(pen(rnd, [[x, y], [x + 0.2, y + 1.6], [x + 0.4, y + 3.2]], 3.4, { swell: 0.05 }));
      }
      // the nose filling the snout's tip, and the two eyes
      ink.push(blob(rnd, [133.6, 241.6], 9.4, 6.4, -5, 0.05), blob(rnd, [112.5, 203.5], 2.2, 3, 10, 0.06), blob(rnd, [186.8, 206.3], 2.9, 2.5, -20, 0.06));
      // each mark its own shape, so that where two cross neither cuts a hole in the other
      cv.add(`<g fill="${INK}" filter="${torn(cv, rnd, 1.7, 0.12)}">${ink.map((d) => `<path d="${d}"/>`).join('')}</g>`);
    });
    return s.done(PLAIN);
  },
};
