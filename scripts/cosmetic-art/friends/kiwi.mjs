import { along, pt } from '../kit.mjs';
import { Still } from '../still.mjs';

const PLAIN = { finish: { paint: 0, grain: 0.012, contrast: 0, saturation: 1, warmth: 0 } };

export const piece = {
  key: 'kiwi',
  ku: 'Kîwî',
  en: 'Kiwi',
  // a kiwi drawn with a mouse, in a rough black line of square pixels on white: a round egg of a body with a break at
  // the top of its head, a long thin beak pointing down to the left, a dot for its eye, its throat running down to two
  // feet of three long pointed toes each, and two little ticks of feathers behind
  still(rnd) {
    const s = new Still(rnd);
    const INK = '#111111';
    const WHITE = '#fffefa';
    // drawn on a grid of its own and brought up to fill the frame
    const K = 1.24;
    const at = ([x, y]) => [252 + (x - 245) * K, 256 + (y - 282) * K];
    // each line a list of runs, joined at sharp corners, each run smooth through its points
    const lines = {
      crown: [[[257, 150], [245, 150], [233, 150], [222, 153], [212, 160], [203, 169], [195, 182], [189, 195], [185, 207], [183, 216],
        [182, 225]]],
      back: [[[268, 149], [281, 148], [297, 150], [313, 154], [327, 161], [340, 169], [353, 178], [367, 189], [380, 203], [390, 217], [399, 235],
        [406, 253], [410, 271], [413, 290], [414, 309], [413, 326]]],
      tick: [[[411, 327], [417, 336], [424, 344]]],
      // the feathers behind: a few square steps down to the bottom line
      tail: [[[397, 341], [415, 342]], [[415, 342], [403, 343]], [[403, 343], [403, 354]], [[403, 354], [409, 356]], [[409, 356], [395, 356]],
        [[395, 356], [396, 371]], [[396, 371], [380, 371], [365, 372], [350, 370], [336, 367], [322, 362], [306, 361], [292, 364]]],
      beak: [
        [[183, 222], [166, 232], [143, 246], [124, 262], [104, 284], [88, 304], [75, 320], [67, 331], [69, 337], [76, 338], [83, 333]],
        [[83, 333], [96, 320], [113, 307], [130, 295], [149, 280], [166, 266], [182, 256], [196, 247], [207, 239], [215, 230], [217, 221], [211, 214],
          [202, 212], [192, 215], [184, 221]],
      ],
      throat: [[[190, 251], [196, 262], [203, 272], [214, 279]], [[214, 279], [227, 284]]],
      leg: [[[221, 287], [219, 300], [217, 314], [214, 328], [215, 339], [222, 348], [234, 357], [247, 364]]],
      // the near foot: a long toe out to the left, one down to the left, and the leg itself coming to a point on the
      // right; and two crumbs of line where the mouse skipped
      near: [[[219, 349], [205, 351], [191, 354], [177, 359], [164, 366]], [[164, 366], [180, 372], [200, 372], [220, 369], [236, 366],
        [247, 364]]],
      toe: [[[221, 370], [211, 380], [201, 392]], [[201, 392], [217, 382], [234, 368]]],
      dash: [[[252, 366], [258, 367.5]]],
      dot: [[[264.5, 365.5], [265.5, 370.5]]],
      // the far foot: a long toe down to the left, one steeper, one straight down
      far: [
        [[292, 364], [276, 372], [260, 384], [245, 396]],
        [[245, 396], [262, 392], [280, 386], [297, 384]],
        [[297, 384], [289, 401], [281, 416]],
        [[281, 416], [294, 400], [307, 386]],
        [[307, 386], [316, 384], [321, 400], [326, 416]],
        [[326, 416], [333, 416]],
        [[333, 416], [334, 397], [334, 381], [335, 367]],
      ],
    };
    // the paper inside the line: the body, the beak and each toe
    const inside = [
      [...lines.back[0], ...lines.tick[0].slice(1), ...lines.tail.flat().slice(1), ...lines.leg[0].slice().reverse(), ...lines.throat[0].slice().reverse(),
        ...lines.crown[0].slice().reverse()],
      lines.beak.flat(),
      [...lines.near.flat(), [234, 357], [222, 348]],
      lines.toe.flat(),
      [...lines.far[0], ...lines.far[1]],
      [[297, 384], [281, 416], [307, 386]],
      [[316, 384], [326, 416], [333, 416], [335, 367]],
      [[292, 364], [297, 384], [307, 386], [316, 384], [335, 367], [322, 362], [306, 361]],
    ];
    // the line as a coarse screen shows it: square pixels, CELL units each, set wherever the pen's round tip passed,
    // pressed a little harder or lighter as the mouse went
    const CELL = 2;
    const SIDE = 512 / CELL;
    const set = new Uint8Array(SIDE * SIDE);
    const pen = (runs, width) => {
      const path = [];
      for (const run of runs) {
        const p = run.map(at);
        const length = p.slice(1).reduce((sum, q, i) => sum + Math.hypot(q[0] - p[i][0], q[1] - p[i][1]), 0);
        const dense = p.length > 2 ? along(p, Math.max(2, Math.ceil(length / 3))) : p;
        path.push(...(path.length ? dense.slice(1) : dense));
      }
      // the mouse never quite holds its line: it drifts a little to either side and the tip swells and thins
      const [p1, p2, p3] = [rnd() * 6, rnd() * 6, rnd() * 6];
      const jog = path.map(() => (rnd() - 0.5) * 0.9);
      const drift = (i) => 0.6 * Math.sin(i * 0.17 + p1) + 0.4 * Math.sin(i * 0.41 + p2) + jog[i];
      path.forEach((q, i) => {
        const [a, b] = [path[Math.max(0, i - 1)], path[Math.min(path.length - 1, i + 1)]];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        path[i] = [q[0] - ((b[1] - a[1]) / l) * drift(i), q[1] + ((b[0] - a[0]) / l) * drift(i)];
      });
      const wide = path.map((q, i) => width * (1 + 0.1 * Math.sin(i * 0.23 + p3) + 0.06 * Math.sin(i * 0.57 + p1) + (rnd() - 0.5) * 0.08));
      for (let i = 1; i < path.length; i++) {
        const [a, b] = [path[i - 1], path[i]];
        const reach = Math.max(wide[i - 1], wide[i]) / 2 + CELL;
        const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
        const ll = dx * dx + dy * dy || 1;
        const [x0, x1] = [Math.floor((Math.min(a[0], b[0]) - reach) / CELL), Math.ceil((Math.max(a[0], b[0]) + reach) / CELL)];
        const [y0, y1] = [Math.floor((Math.min(a[1], b[1]) - reach) / CELL), Math.ceil((Math.max(a[1], b[1]) + reach) / CELL)];
        for (let gy = Math.max(0, y0); gy <= Math.min(SIDE - 1, y1); gy++) {
          for (let gx = Math.max(0, x0); gx <= Math.min(SIDE - 1, x1); gx++) {
            const [cx, cy] = [(gx + 0.5) * CELL, (gy + 0.5) * CELL];
            const t = Math.max(0, Math.min(1, ((cx - a[0]) * dx + (cy - a[1]) * dy) / ll));
            const d = Math.hypot(cx - a[0] - dx * t, cy - a[1] - dy * t);
            if (d <= (wide[i - 1] + (wide[i] - wide[i - 1]) * t) / 2) set[gy * SIDE + gx] = 1;
          }
        }
      }
    };
    const weight = { tail: 10.5, tick: 10.5, dash: 8, dot: 8 };
    for (const [k, runs] of Object.entries(lines)) pen(runs, weight[k] ?? 9.4);
    // the eye: a blot of pixels, a little wider than tall
    const [ex, ey] = at([244, 212.5]);
    for (let gy = Math.floor((ey - 9) / CELL); gy <= (ey + 9) / CELL; gy++) {
      for (let gx = Math.floor((ex - 10) / CELL); gx <= (ex + 10) / CELL; gx++) {
        const [dx, dy] = [((gx + 0.5) * CELL - ex) / 7.6, ((gy + 0.5) * CELL - ey) / 6.4];
        if (dx * dx + dy * dy <= 1 + (rnd() - 0.5) * 0.3) set[gy * SIDE + gx] = 1;
      }
    }
    const pixels = () => {
      let d = '';
      for (let gy = 0; gy < SIDE; gy++) {
        for (let gx = 0; gx < SIDE; gx++) {
          if (!set[gy * SIDE + gx]) continue;
          const from = gx;
          while (gx < SIDE && set[gy * SIDE + gx]) gx++;
          d += `M${from * CELL} ${gy * CELL}h${(gx - from) * CELL}v${CELL}h${(from - gx) * CELL}z`;
        }
      }
      return d;
    };
    s.paint((cv) => {
      const paper = inside.map((p) => `<path d="M${p.map((q) => pt(at(q))).join(' L')} Z"/>`).join('');
      cv.add(`<g fill="${WHITE}" stroke="${WHITE}" stroke-width="2" stroke-linejoin="round">${paper}</g>`);
      cv.add(`<path d="${pixels()}" fill="${INK}"/>`);
    });
    return s.done(PLAIN);
  },
};
