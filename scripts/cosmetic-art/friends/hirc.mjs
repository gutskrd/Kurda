import { Still } from '../still.mjs';

const PLAIN = { finish: { paint: 0, grain: 0.012, contrast: 0, saturation: 1, warmth: 0 } };

// The shapes are laid out on a 512 frame and brought into the icon by this scale and shift.
const K = 1.15;
const SHIFT = [-9.8, -8.6];
const into = ([x, y]) => [256 + SHIFT[0] + K * (x - 256), 256 + SHIFT[1] + K * (y - 256)];
// One square of the coarse grid the pen draws on, in icon units: a low-resolution digital pen, its steps left showing.
const CELL = 2.4;
// The pen's width, in squares.
const PEN = 2;

/** The point `f` of the way from p1 to p2 on a Catmull-Rom curve through p0..p3. */
const cr = (p0, p1, p2, p3, f) =>
  [0, 1].map((c) => 0.5 * (2 * p1[c] + (p2[c] - p0[c]) * f + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * f * f
    + (3 * p1[c] - p0[c] - 3 * p2[c] + p3[c]) * f * f * f));

/** Points about `step` apart along a smooth curve through `pts` (closed or open), in icon units. */
function trace(pts, step, closed) {
  const q = pts.map(into);
  const m = q.length;
  const at = (i) => (closed ? q[(i + m) % m] : q[Math.max(0, Math.min(m - 1, i))]);
  const out = [];
  for (let i = 0; i < (closed ? m : m - 1); i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const k = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let s = 0; s < k; s++) out.push(cr(p0, p1, p2, p3, s / k));
  }
  if (!closed) out.push(q[m - 1]);
  return out;
}

/** The hand's slow drift off the intended line: each point pushed sideways by a couple of long, uneven waves. */
function drift(rnd, line, amount) {
  const waves = [0, 1, 2].map((i) => [60 + rnd() * 90 / (i + 1), rnd() * 6, amount / (i + 1)]);
  let s = 0;
  return line.map((p, i) => {
    const a = line[Math.max(0, i - 1)];
    const b = line[Math.min(line.length - 1, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    if (i) s += Math.hypot(p[0] - a[0], p[1] - a[1]);
    const off = waves.reduce((sum, [len, ph, amp]) => sum + amp * Math.sin((s / len) * Math.PI * 2 + ph), 0);
    return [p[0] - ((b[1] - a[1]) / l) * off, p[1] + ((b[0] - a[0]) / l) * off];
  });
}

/** The squares the pen covers along `line`. */
function inked(line, cells = new Set()) {
  for (const [x, y] of line) {
    const i0 = Math.round(x / CELL - PEN / 2);
    const j0 = Math.round(y / CELL - PEN / 2);
    for (let i = i0; i < i0 + PEN; i++) for (let j = j0; j < j0 + PEN; j++) cells.add(`${i},${j}`);
  }
  return cells;
}

/** The squares whose middles lie inside the closed outline `poly`. */
function filled(poly) {
  const cells = new Set();
  const ys = poly.map((p) => p[1]);
  for (let j = Math.floor(Math.min(...ys) / CELL); j <= Math.ceil(Math.max(...ys) / CELL); j++) {
    const y = (j + 0.5) * CELL;
    const xs = [];
    poly.forEach((a, k) => {
      const b = poly[(k + 1) % poly.length];
      if ((a[1] <= y) !== (b[1] <= y)) xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    });
    xs.sort((u, v) => u - v);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let i = Math.ceil(xs[k] / CELL - 0.5); i + 0.5 <= xs[k + 1] / CELL; i++) cells.add(`${i},${j}`);
  }
  return cells;
}

/** A set of squares as one path, each row's neighbours joined into runs. */
function squares(cells) {
  const rows = new Map();
  for (const c of cells) {
    const [i, j] = c.split(',').map(Number);
    if (!rows.has(j)) rows.set(j, []);
    rows.get(j).push(i);
  }
  let d = '';
  for (const [j, list] of rows) {
    list.sort((u, v) => u - v);
    for (let k = 0; k < list.length; ) {
      let e = k;
      while (e + 1 < list.length && list[e + 1] === list[e] + 1) e++;
      d += `M${+(list[k] * CELL).toFixed(2)} ${+(j * CELL).toFixed(2)}h${+((e - k + 1) * CELL).toFixed(2)}v${CELL}h${-((e - k + 1) * CELL).toFixed(2)}Z`;
      k = e + 1;
    }
  }
  return d;
}

export const piece = {
  key: 'hirc',
  ku: 'Hirç',
  en: 'Bear',
  // a big brown bear sitting square and looking at us with nothing at all to say, drawn with a coarse digital pen:
  // one huge pear of flat brown in a thin stepped black line, two little ears, a tan muzzle with a dash for its nose
  // and one for its mouth, sleepy dashes for eyes, its arms only a line each, the left one's claws ticked in
  still(rnd) {
    const s = new Still(rnd);
    const FUR = '#3e342b';
    const MUZZLE = '#be9d7d';
    const LINE = '#060505';
    const body = [
      [170, 100], [165, 93], [164, 85], [167, 77.5], [174, 73.5], [182, 74.5], [188, 79], [191, 86],
      [196, 83], [204, 78], [212, 74], [222, 70.5], [234, 68], [248, 67], [262, 67.5], [276, 69], [288, 71.5], [298, 74.5], [305, 78.5], [309, 83],
      [313, 77], [319, 71], [326, 68.5], [333, 71], [336, 78], [336, 88], [335, 95],
      [340, 102], [345, 111], [350, 122], [354, 134], [357, 149], [359, 164], [361, 175], [367, 181], [374, 192], [381, 205], [388, 219], [394, 234],
      [398, 249], [401, 262], [403, 270], [409, 285], [416, 298], [421, 312], [425, 327], [429, 342], [432, 362], [433, 380], [433, 397], [429, 407],
      [427, 416], [428, 424], [434, 431], [437, 439], [438, 448], [434, 455], [424, 459], [410, 460], [400, 457], [393, 451], [389, 445],
      [378, 443], [360, 443], [335, 444], [300, 444.5], [260, 445.5], [221, 447], [190, 447.5], [165, 447.5], [146, 446], [138, 445],
      [130, 449], [118, 453.5], [106, 454.5], [97, 451], [92, 444], [92, 436], [95, 428], [99, 421], [104, 414],
      [101, 404], [96, 388], [93, 368], [91.5, 347], [92, 325], [92.5, 305], [94, 282], [97.5, 262], [102, 246], [108, 230], [114, 214], [120, 198],
      [125, 186], [131, 172], [139, 156], [147, 141], [155, 128], [163, 114],
    ];
    const muzzle = [[254, 90.5], [250, 94], [247, 100], [244.5, 105], [241.7, 110], [239.6, 115], [237.4, 120], [235, 126], [234.5, 133], [234.5, 140],
      [235.8, 146], [236.3, 151], [238.5, 154.5], [243, 157.5], [250, 160.5], [257, 161.8], [264, 160.5], [270, 157.5], [274.5, 154.5], [278, 151], [281, 147],
      [283, 140], [284.6, 130], [283.5, 122], [281, 116], [277, 110.5], [272, 105.5], [266, 100.5], [261, 96], [257.5, 92.5]];
    const nose = [[248, 114.5], [252, 112.4], [262, 112.2], [270, 112.6], [271.5, 114], [268, 116.6], [259, 118.6], [251, 117.6]];
    // what the pen drew inside, each a line through its points
    const lines = [
      // the base of the right ear, the eyes, the mouth in two goes that do not quite meet
      [[321, 98], [336, 97.5]],
      [[220.3, 99.6], [236.2, 99.6]],
      [[274.3, 99.6], [289.8, 99.6]],
      [[242, 150.6], [255.5, 150.6]],
      [[255.5, 147.6], [273.5, 147.6]],
      // the left arm, its paw curled up, and the claws ticked across its edge
      [[139.5, 284.8], [144, 295], [148, 304], [152, 314], [157, 321], [163, 327.5], [169.5, 328], [176, 325.5], [182, 322], [188, 316], [191, 309],
        [192.4, 297], [189, 290], [185, 284], [180, 277], [175, 271.5]],
      [[163, 328], [164, 335]],
      [[170, 323.5], [174.5, 335]],
      [[180.5, 319.5], [187, 329]],
      [[186, 298.5], [198.5, 303.5]],
      [[192.4, 312.5], [196.7, 320]],
      // the right arm, out of the side and hooked back
      [[402.3, 268], [405, 282], [403.3, 293], [401.5, 305.5], [398, 315], [390.8, 321.6], [382.6, 325], [376.5, 323.4], [369.3, 316], [362, 303.7]],
      // the shoulder, a few broken strokes inside the edge
      [[157, 128], [154, 135], [152, 143], [150.5, 151], [150.5, 155.5], [153.5, 154.5]],
      [[159.5, 157], [157.6, 164], [156.6, 171.5]],
      [[163.8, 172], [163.8, 184]],
    ];
    const edge = drift(rnd, trace(body, 0.8, true), 0.9);
    const ink = inked(edge);
    for (const pts of lines) inked(drift(rnd, trace(pts, 0.6, false), 0.35), ink);
    for (const c of filled(trace(nose, 0.6, true))) ink.add(c);
    s.paint((cv) => {
      cv.add(`<g shape-rendering="crispEdges">`);
      cv.add(`<path d="${squares(filled(edge))}" fill="${FUR}"/>`);
      cv.add(`<path d="${squares(filled(trace(muzzle, 0.8, true)))}" fill="${MUZZLE}"/>`);
      cv.add(`<path d="${squares(ink)}" fill="${LINE}"/>`);
      cv.add('</g>');
    });
    // flat colour, as a screen lays it, so no grain
    return s.done({ finish: { ...PLAIN.finish, grain: 0 } });
  },
};
