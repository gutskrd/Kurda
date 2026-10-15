/**
 * Figures for the backgrounds: the deer in its poses, and lambs. The deer is
 * drawn as a silhouette — against the light it is shape and nothing else, so
 * the shape has to be right (see `deer`).
 *
 * Each takes a position on the ground (x, y) and a size.
 */
import { between, n, pt } from './kit.mjs';

/** A tapered stroke through points, each with its width, as one closed path. */
function taper(points) {
  const left = [];
  const right = [];
  for (let i = 0; i < points.length; i++) {
    const [x, y, w] = points[i];
    const [px, py] = points[Math.max(0, i - 1)];
    const [nx, ny] = points[Math.min(points.length - 1, i + 1)];
    let dx = nx - px;
    let dy = ny - py;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    left.push([x - dy * w * 0.5, y + dx * w * 0.5]);
    right.push([x + dy * w * 0.5, y - dx * w * 0.5]);
  }
  const all = [...left, ...right.reverse()];
  // smooth through the outline with quadratic midpoints
  let d = `M${pt(all[0])}`;
  for (let i = 1; i < all.length; i++) {
    const [x0, y0] = all[i - 1];
    const [x1, y1] = all[i];
    d += ` Q${pt([x0, y0])} ${pt([(x0 + x1) / 2, (y0 + y1) / 2])}`;
  }
  return `${d} L${pt(all[all.length - 1])} Z`;
}

/** A smooth closed outline through points (a Catmull-Rom spline, as cubic Béziers). */
function smooth(points) {
  const count = points.length;
  let d = `M${pt(points[0])}`;
  for (let i = 0; i < count; i++) {
    const p0 = points[(i - 1 + count) % count];
    const p1 = points[i];
    const p2 = points[(i + 1) % count];
    const p3 = points[(i + 2) % count];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${pt(c1)} ${pt(c2)} ${pt(p2)}`;
  }
  return `${d} Z`;
}

/**
 * The deer's poses, in its own frame: x from the back of the rump toward the
 * chest, y up from the ground (negative), both in hundredths of its height at
 * the shoulder. Each gives the line of its back from the rump to the withers,
 * the crest of its neck from there to the back of the skull (the poll), the
 * head's angle below level (radians), its size, and how far along its jaw the
 * throat meets it, the line of the throat back down to the chest and the
 * brisket, the belly from the forelegs back to the flank, how far the ears
 * turn from where the skull sets them, how far each pair of legs is set
 * forward or back, near and far, and how far the far hind leg reaches forward
 * below the hock.
 */
const POSES = {
  // reaching down to the water: the rump the highest of him, the back falling from it to the withers and on down
  // the neck, the head hanging nearly straight down from the poll, the muzzle a fifth of his height above his hooves
  drink: {
    back: [[8, -101.3], [16, -103.7], [24, -105], [32, -104.3], [40, -103], [48, -101.7], [56, -100], [64, -97.7], [72, -95]],
    crest: [[78, -92.4], [83, -89], [88, -83.6], [93, -75.8], [98, -67.6], [102, -61.6], [106.6, -58.6]],
    poll: [111, -56.8],
    angle: 1.25,
    head: 1,
    jaw: 1,
    throat: [[100.6, -38.6], [97, -42], [93.2, -44.2], [89.2, -45.8], [85.2, -48.2], [81.4, -51.6]],
    chest: [[77.4, -53.6], [73.4, -52.4]],
    belly: [[66, -54], [58, -55.8], [53, -58.4], [47, -59.8], [40, -59.8], [33, -61], [29, -62]],
    ears: [-0.95, -1.16],
    fore: [0, -10],
    hind: [0, 1.5],
    reach: 6,
  },
  // grazing: the same, the neck run further down and the head hanging lower, the muzzle in the grass
  graze: {
    back: [[8, -101.3], [16, -103.7], [24, -105], [32, -104.3], [40, -103], [48, -101.7], [56, -100], [64, -97.7], [72, -95]],
    crest: [[78, -92.2], [83, -88.4], [88, -82], [93, -72.6], [97.6, -62], [101.6, -53.6], [105.6, -48.4]],
    poll: [110.2, -45.2],
    angle: 1.32,
    head: 1,
    jaw: 1,
    throat: [[101.4, -25.4], [98.2, -30.6], [94.6, -35.6], [90.6, -40.6], [86.2, -45.6], [81.6, -50.6]],
    chest: [[77.4, -53.4], [73.4, -52.4]],
    belly: [[66, -54], [58, -55.8], [53, -58.4], [47, -59.8], [40, -59.8], [33, -61], [29, -62]],
    ears: [-0.98, -1.2],
    fore: [0, -10],
    hind: [0, 1.5],
    reach: 6,
  },
};

/**
 * A deer — a stag — in one of its poses: 'drink' (head down and reaching
 * forward to the water, his forefeet in the shallows: his muzzle is some
 * twenty-two hundredths of his height above his hooves) or 'graze' (his
 * muzzle down in the grass). `size` is his height at the shoulder, (x, y) the
 * ground under the middle of his body.
 *
 * Drawn the way an animal painter draws one, from his anatomy, since against
 * the light he is shape and nothing else: a short body, high off the ground —
 * the chest some four tenths of his height deep, so that more than half of
 * him is leg — and drawn up under the flank; a high round rump, from which,
 * when the head goes down, the back falls in one long line to the withers and
 * on down the neck; a long, narrow head hanging from the poll, the ears up
 * off it; the hind legs under the haunch, a lean thigh tapering to a high,
 * sharp hock, the fore ones straight and slender from the elbow through a
 * small knee, all of them fine below on small pointed hooves; a broad tail
 * hanging from the top of the rump; and a heavy rack carried forward off the
 * crown, its tines standing up off its beams.
 */
export function deer({ colour, ...at }) {
  const d = deerShapes(at);
  const parts = [d.far.hind, d.far.fore, d.near.hind, d.near.fore, d.body, d.tail, d.far.ear, d.near.ear, ...d.far.antler, ...d.near.antler];
  return `<g fill="${colour}">${parts.map((p) => `<path d="${p}"/>`).join('')}</g>`;
}

/**
 * The deer's parts as outlines (SVG paths), placed as `deer` places them, for
 * whoever paints them one by one: its far and near legs, ears and antlers,
 * its body (with the neck and the head), its tail; and `frame` and `head`,
 * which carry a point in the deer's own frame, or in its head's (from the
 * poll, along the face and down toward the jaw), to where it lies.
 */
export function deerShapes({ x, y, size, facing = 1, pose = 'drink', antlers = true }) {
  const k = size / 100;
  const W = ([px, py]) => [x + facing * (px - 50) * k, y + py * k];
  const P = POSES[pose];
  // the head's own frame: from the poll, x forward along the face to the nose, y down toward the jaw
  const ca = Math.cos(P.angle);
  const sa = Math.sin(P.angle);
  const hs = P.head;
  const H = ([px, py]) => [P.poll[0] + hs * (px * ca - py * sa), P.poll[1] + hs * (px * sa + py * ca)];
  const outline = (pts) => smooth(pts.map(W));

  // the legs, the far pair first, dx setting each forward or back: the hind one from under the haunch, the thigh
  // lean and drawn in to a high hock, then the long cannon straight down to the hoof; the fore one from the elbow,
  // straight, a little thicker through the forearm than below the knee
  // (`reach` sets the leg below the hock forward of the thigh, so that the far one shows beside the near)
  const hind = (dx, reach = 0) =>
    outline([[28, -62.4], [24, -59], [21, -56.4], [18.2, -53.4], [16.4, -50], [15.2, -46], [13.6, -40.6], [11.8, -35], [10.4, -29.6], [9.6, -25.6], [9.8, -20], [10.2, -14], [10.6, -9.6], [11.2, -6.6], [12.6, -3.4], [14.3, -0.5], [13.2, 0.4], [8.8, 0.4], [8, -1.6], [7.6, -4.2], [6.8, -6.6], [6.4, -9.6], [6, -15], [5.2, -20], [3.8, -24.6], [2.2, -27.8], [1.8, -30.6], [2.8, -35.6], [3.8, -41], [4.4, -48], [4.6, -55], [5.6, -60], [7, -64], [7.9, -69], [7.6, -74], [6.6, -80], [8, -90], [16, -96], [24, -90]].map(([px, py]) => [px + dx + reach * Math.min(1, Math.max(0, (-36 - py) / -12)), py]));
  const fore = (dx) =>
    outline([[71, -66], [76.6, -58], [76.2, -50], [75.8, -44], [75.5, -38], [75.2, -32], [74.9, -28.5], [74.5, -24], [74.2, -16], [74.3, -10], [74.7, -7.2], [76, -3.6], [77.8, -0.6], [76.8, 0.4], [72.2, 0.4], [71.6, -1.6], [71, -4.4], [70.4, -6.6], [70.3, -9.6], [70.4, -16], [70.4, -24], [70.2, -27.5], [70.3, -31], [69.7, -36], [69.1, -42], [68.6, -48], [67.6, -54], [66, -60]].map(([px, py]) => [px + dx, py]));
  // the body, the neck and the head in one outline, so nothing joins them at a seam: from the root of the tail
  // over the high rump and along the back to the withers, along the crest of the neck to the poll, along the brow
  // and the face to the nose, round the muzzle and the chin, back along the jaw to where the throat leaves it,
  // down the throat to the chest and the brisket, along the belly as it draws up to the flank, and round the
  // haunch and the buttock
  const head = [[-1, -0.5], [4, -2], [9.5, -2.2], [15, -1.4], [20.5, 0], [25.5, 1.6], [29, 3], [31.4, 4.8], [32.2, 7], [31.4, 9], [29.6, 10], [29.4, 11.4], [27.6, 12.2], [22.5, 12.6], [17, 13.4], [11.5, 14.4], [6.5, 15.2], [2, 14.6]];
  const jaw = head.slice(0, head.length - (P.jaw ? 4 : 0)).map(H);
  const body = outline([[3, -96], ...P.back, ...P.crest, ...jaw, ...P.throat, ...P.chest, ...P.belly, [25, -64], [16, -69], [10, -72.5], [6.8, -76.5], [5.2, -82], [4.4, -90]]);
  // the tail, broad, hanging from the top of the rump
  const tail = outline([[6, -99.5], [1.5, -98], [-1.8, -94], [-3.4, -89], [-3.9, -84], [-3.5, -79.5], [-1.8, -75.6], [0.2, -76.4], [1.6, -80.5], [3.2, -87], [5, -94]]);
  // the ears, up off the poll: the far one a little behind and turned away
  const ear = (dx, dy, turn) => {
    const ct = Math.cos(turn);
    const st = Math.sin(turn);
    return outline([[1.8, -0.3], [1.8, -3.8], [0.6, -7.1], [-1.4, -10.2], [-2.9, -8.8], [-3.3, -5.4], [-2.4, -1.8], [-0.6, 0.3]].map(([qx, qy]) => H([dx + qx * ct - qy * st, dy + qx * st + qy * ct])));
  };
  const rack = [[], []];
  if (antlers) {
    // the rack as it stands on a bowed head: each beam leaves the crown just behind the eye and runs forward, out
    // over the water; the near one nearly level, its tip turning up, its tines standing straight up off it, tallest
    // nearest the head; the far one, behind it, sweeping forward and down, its tines reaching forward off it
    const burr = H([6.5, -3]);
    const near = [
      [[0, 0, 4.2], [3, -2, 3.9], [8, -3.4, 3.6], [14, -4.4, 3.3], [20, -5, 3], [25, -5.4, 2.6], [29, -6.4, 2.1], [31.4, -9, 1.5], [32.2, -12.4, 0.5]],
      [[2.4, -2, 2.2], [2.2, -6.6, 1.6], [3.2, -10, 0.5]],
      [[7, -3.4, 2.6], [7.2, -10, 2.2], [8.6, -16, 1.6], [11, -20.6, 0.5]],
      [[13.4, -4.4, 2.4], [13.8, -10.4, 2], [15, -16, 1.4], [16.8, -19.4, 0.5]],
      [[19.4, -5, 2.2], [19.8, -10, 1.7], [21, -14.4, 1.1], [22.4, -16.4, 0.4]],
      [[25, -5.6, 2], [25.4, -9, 1.5], [26.6, -12, 0.4]],
    ];
    const far = [
      [[0, 0, 3.6], [5, 0.6, 3.4], [12, 0.8, 3.1], [19, 1.6, 2.8], [25, 3.4, 2.4], [30, 6.4, 2], [33.4, 10.4, 1.6], [35.4, 14.4, 1], [35.8, 17, 0.4]],
      [[10, 0.8, 2], [16, -1.6, 1.5], [22, -2.8, 1], [27, -2.6, 0.4]],
      [[20, 1.8, 1.8], [26, 0.6, 1.4], [31, 0.4, 0.9], [35, 1.4, 0.4]],
      [[28, 5.2, 1.6], [34, 4.8, 1.2], [38.4, 5.4, 0.4]],
      [[32.6, 9.8, 1.4], [37.6, 10.2, 1], [41, 11.4, 0.4]],
    ];
    for (const [i, shape, sc, [ox, oy]] of [[0, far, 1.1, [1.5, 3]], [1, near, 0.88, [0, 0]]]) {
      for (const pts of shape) rack[i].push(taper(pts.map(([qx, qy, w]) => [...W([burr[0] + ox + qx * sc, burr[1] + oy + qy * sc]), w * sc * k])));
    }
  }
  return {
    far: { hind: hind(P.hind[1], P.reach), fore: fore(P.fore[1]), ear: ear(0.9, 5, P.ears[0]), antler: rack[0] },
    near: { hind: hind(P.hind[0]), fore: fore(P.fore[0]), ear: ear(2.4, 3.6, P.ears[1]), antler: rack[1] },
    body,
    tail,
    frame: W,
    head: (p) => W(H(p)),
  };
}

/**
 * A lamb, soft and woolly: a body of overlapping curls, a small head with
 * drooping ears, thin legs. `pose`: 'stand', 'leap', 'lie'.
 */
export function lamb(rnd, { x, y, size, facing = 1, wool, shade, face = '#e9d6cc', dark = '#3a2a26', pose = 'stand' }) {
  const k = size / 40;
  const P = (px, py) => [x + facing * px * k, y + py * k];
  const out = [];
  const lift = pose === 'leap' ? -14 : pose === 'lie' ? 14 : 0;
  // legs
  if (pose !== 'lie') {
    const legs = pose === 'leap' ? [[-14, 6, -20], [-8, 4, -14], [14, 10, 6], [20, 6, 10]] : [[-14, 0, -14], [-8, 0, -8], [12, 0, 12], [18, 0, 18]];
    for (const [hx, , fx] of legs) {
      const top = P(hx, -14 + lift);
      const foot = P(fx, pose === 'leap' ? -6 + lift + 14 : 0);
      out.push(`<path d="M${pt(top)} L${pt(foot)}" stroke="${face}" stroke-width="${n(3.2 * k)}" stroke-linecap="round"/>`);
      out.push(`<circle cx="${n(foot[0])}" cy="${n(foot[1])}" r="${n(1.8 * k)}" fill="${dark}"/>`);
    }
  }
  // the fleece: a cloud of curls, shaded underneath
  const curls = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    curls.push([Math.cos(a) * 15 * between(rnd, 0.85, 1.05), Math.sin(a) * 9 * between(rnd, 0.85, 1.05) - 22 + lift, 6.5 * between(rnd, 0.85, 1.15)]);
  }
  curls.push([0, -22 + lift, 12]);
  out.push(`<g fill="${shade}">${curls.map(([cx, cy, r]) => `<circle cx="${n(P(cx, cy)[0])}" cy="${n(P(cx, cy)[1] + 1.6 * k)}" r="${n(r * k)}"/>`).join('')}</g>`);
  out.push(`<g fill="${wool}">${curls.map(([cx, cy, r]) => `<circle cx="${n(P(cx, cy)[0] - facing * 0.6 * k)}" cy="${n(P(cx, cy)[1] - 0.8 * k)}" r="${n(r * k * 0.92)}"/>`).join('')}</g>`);
  // the head, a little raised, ears drooping
  const hx = 19;
  const hy = -30 + lift + (pose === 'lie' ? 4 : 0);
  const [cx, cy] = P(hx, hy);
  out.push(`<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(6.5 * k)}" ry="${n(5.6 * k)}" fill="${wool}"/>`);
  out.push(`<ellipse cx="${n(P(hx + 3.5, hy + 2)[0])}" cy="${n(P(hx + 3.5, hy + 2)[1])}" rx="${n(4 * k)}" ry="${n(3.4 * k)}" fill="${face}"/>`);
  for (const s of [-1, 1]) {
    const [ex, ey] = P(hx - 2 + s * 4.5, hy - 2);
    out.push(`<ellipse cx="${n(ex)}" cy="${n(ey)}" rx="${n(4.5 * k)}" ry="${n(1.8 * k)}" transform="rotate(${n(s * facing * 28)} ${n(ex)} ${n(ey)})" fill="${face}"/>`);
  }
  const [eyx, eyy] = P(hx + 2.5, hy - 0.5);
  out.push(`<circle cx="${n(eyx)}" cy="${n(eyy)}" r="${n(1.1 * k)}" fill="${dark}"/>`);
  return out.join('');
}
