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
 * head's angle below level (radians) and how far along its jaw the throat
 * meets it, the line of the throat back down to the chest and the brisket,
 * how far the antlers and the ears turn from where the skull sets them (a
 * lowered head turns a little toward us and its rack with it, so the tines
 * still rise), and how far each pair of legs is set forward or back, near and
 * far.
 */
const POSES = {
  alert: {
    back: [[14, -104.5], [26, -106], [42, -105], [58, -102.5], [72, -100.5], [86, -100.5], [95, -102]],
    crest: [[100.5, -107.5], [105.5, -113.5], [109.5, -119.5], [113, -124.5]],
    poll: [116.5, -128.5],
    angle: 0.5,
    head: 1.18,
    jaw: 0,
    throat: [[114, -105], [116.5, -95.5], [118, -85]],
    chest: [[118.5, -75], [116, -62], [109.5, -51.5], [100, -45.5]],
    rack: [0.05, -0.12],
    ears: [-0.75, -1.05],
    fore: [0, -7],
    hind: [0, 7],
  },
  graze: {
    back: [[15.3, -108.8], [26.7, -109.5], [45.8, -108], [64.9, -105], [80.2, -101.1], [91.6, -96.6]],
    crest: [[101.1, -89.7], [110.2, -79], [118.4, -67.6], [124.2, -56.4]],
    poll: [129.4, -50.4],
    angle: 1.33,
    head: 1.15,
    jaw: 1,
    throat: [[117.6, -26.5], [110.4, -34.8], [101.1, -40.8], [91.6, -44.7]],
    chest: [[84, -46.9], [78.2, -44.7]],
    belly: [[68.7, -58.4], [57.3, -59.9], [45.8, -60.3], [34.4, -58.4], [28.6, -54.6]],
    rack: [-0.3, 0.5],
    ears: [-1.45, -1.65],
    fore: [-10, -2],
    hind: [0, 20],
    rake: [13, 0],
  },
  drink: {
    back: [[15.3, -108.8], [26.7, -109.5], [45.8, -108], [64.9, -105], [80.2, -101.1], [91.6, -96.6]],
    crest: [[101.1, -89.7], [109.9, -80.2], [117.6, -69.8], [122.9, -59.9]],
    poll: [128.2, -56.2],
    angle: 1.3,
    head: 1.15,
    jaw: 1,
    throat: [[116.4, -31.7], [109.9, -38.2], [101.1, -42], [91.6, -44.7]],
    chest: [[84, -46.9], [78.2, -44.7]],
    belly: [[68.7, -58.4], [57.3, -59.9], [45.8, -60.3], [34.4, -58.4], [28.6, -54.6]],
    rack: [-0.3, 0.55],
    ears: [-1.45, -1.65],
    fore: [-10, -2],
    hind: [0, 20],
    rake: [13, 0],
  },
};

/**
 * A deer — a stag — in one of its poses: 'alert' (head up, looking out),
 * 'graze' (head down, its muzzle in the grass), 'drink' (head down and
 * reaching forward to the water at its forefeet, which stand in the
 * shallows: its muzzle is some 17 hundredths of its height above its hooves).
 * `size` is its height at the shoulder, (x, y) the ground under the middle of
 * its body.
 *
 * Drawn the way an animal painter draws one, from its anatomy, since against
 * the light it is shape and nothing else: a heavy body, deep through the
 * chest — half its height and more — and drawn up under the flank; a high
 * round rump, from which, when the head goes down, the back runs down in one
 * curve into a thick neck, nearly as deep where it leaves the shoulders as the
 * chest is, that meets the head low on the jaw; a short, deep wedge of a head
 * with big ears up from the poll; legs strong at the top, the hind ones under
 * a heavy thigh bending back at a high, sharp hock (the near one set well back
 * when he reaches down), the fore ones straight through a small knee, all of
 * them fine below on small pointed hooves; a broad tail hanging from the top
 * of the rump; and a heavy rack that rises from the crown, curves forward over
 * the face and lifts tall tines off its beams.
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
export function deerShapes({ x, y, size, facing = 1, pose = 'alert', antlers = true }) {
  const k = size / 100;
  const W = ([px, py]) => [x + facing * (px - 50) * k, y + py * k];
  const P = POSES[pose];
  // the head's own frame: from the poll, x forward along the face to the nose, y down toward the jaw
  const ca = Math.cos(P.angle);
  const sa = Math.sin(P.angle);
  const hs = P.head ?? 1.08;
  const H = ([px, py]) => [P.poll[0] + hs * (px * ca - py * sa), P.poll[1] + hs * (px * sa + py * ca)];
  const outline = (pts) => smooth(pts.map(W));

  // the legs, the far pair first: dx sets each forward or back (`wide` thickens a leg about its middle below
  // `from`: a leg's bones are fine, but it reads a little stronger than it is against the light)
  const wide = (pts, cx, from, by) => pts.map(([px, py]) => [py > from ? cx + (px - cx) * by : px, py]);
  const hind = (dx, rake = 0) =>
    outline(wide([[27, -90], [36, -78], [39.5, -67], [37, -59], [31, -50], [24.5, -42], [21, -35], [20.4, -28], [20.4, -18], [20.8, -10], [21.5, -7.4], [23.4, -3.4], [25.4, -0.4], [24.2, 0.4], [19.8, 0.4], [18.8, -1.6], [18.2, -4.2], [17.1, -6], [16.6, -8.6], [16.2, -16], [15.6, -26], [13.6, -32], [9.4, -36], [7.6, -40], [5.4, -48], [2.6, -58], [1.2, -66], [1.4, -73], [2.2, -80], [2.6, -88], [6, -97]].map(([px, py]) => [px + dx, py]), 18.4 + dx, -40, 1.32).map(([px, py]) => [px - rake * Math.min(1, Math.max(0, (py + 62) / 62)), py]));
  const fore = (dx) =>
    outline(wide([[80, -70], [95, -58], [94, -49], [91.6, -41], [90, -34], [90.1, -30.5], [89.4, -27], [89, -18], [89.1, -10], [89.6, -7.4], [91.3, -3.4], [93.2, -0.4], [92.1, 0.4], [87.6, 0.4], [87, -1.6], [86.2, -4.2], [85.2, -6], [85, -8.6], [84.8, -16], [84.6, -24], [84.2, -27.5], [84.6, -31], [83.6, -35], [81.6, -43], [79, -50], [76, -56], [73, -64]].map(([px, py]) => [px + dx, py]), 87.2 + dx, -52, 1.32));
  // the body, the neck and the head in one outline, so nothing joins them at a seam: from the root of the tail
  // over the high rump and along the back to the withers, along the crest of the neck to the poll, along the brow
  // and the face to the nose, round the muzzle and the chin, back along the jaw to where the throat leaves it,
  // down the throat to the chest and the brisket, along the belly as it draws up to the flank, and round the
  // haunch and the buttock
  const head = [[-1, -0.5], [4.5, -2.2], [10, -2], [15.5, -0.6], [21.5, 1.4], [27, 3.4], [30.6, 5.2], [32.6, 7.2], [33, 9.4], [32, 11.4], [30, 12.6], [28.4, 13], [28.6, 14.6], [26.8, 15.8], [21.5, 16.6], [15.5, 17.8], [10, 19], [5, 19.4]];
  const jaw = head.slice(0, head.length - (P.jaw ? 4 : 0)).map(H);
  const body = outline([[6, -97], ...P.back, ...P.crest, ...jaw, ...P.throat, ...P.chest, ...(P.belly ?? [[72, -46], [62, -52], [52, -56.5], [42, -58], [33, -59.5]]), [24, -64], [14, -68.5], [7, -72], [3.4, -78], [2.4, -85], [3.2, -92]]);
  // the tail, broad, hanging from the top of the rump
  const tail = outline([[7.4, -99], [2.8, -98.4], [-1.2, -95.6], [-3.8, -90.6], [-5, -84.6], [-5, -78.6], [-3.4, -75.4], [-1.4, -76.6], [0, -81], [1.8, -87.4], [4.8, -93.4]]);
  // the ears, long and wide, out from the poll: the far one a little behind and turned away
  const ear = (dx, dy, turn) => {
    const ct = Math.cos(turn);
    const st = Math.sin(turn);
    return outline([[3, -0.5], [2.8, -6.5], [1, -12], [-2.6, -17.5], [-5, -15], [-5.6, -9], [-4, -3], [-1, 0.5]].map(([qx, qy]) => H([dx + qx * ct - qy * st, dy + qx * st + qy * ct])));
  };
  const rack = [[], []];
  if (antlers) {
    // the rack as it stands on a head held up: each beam rises from the crown just behind the eye, goes back a
    // little and up, then curves forward over the face, its tip turning in; the tines stand up off it, all of them
    // rising the same way, each curving a little forward at its tip, and low on it a short brow tine. A lowered
    // head carries its rack down and forward with it (`P.angle` against a head held up), and turns it a little
    // toward us, so its tines lean out over the water rather than down into it. The far antler sits a little
    // behind and below the near one and turns a little further, so that their tines stand apart.
    const base = H([7.5, -2.5]);
    for (const [i, turn, sc, [ox, oy]] of [[0, P.rack[1], 0.8, [-2.2, 1.3]], [1, P.rack[0], 0.87, [0, 0]]]) {
      const parts = rack[i];
      const a = P.angle - 0.62 + turn;
      const ct = Math.cos(a);
      const st = Math.sin(a);
      const A = (pts) => taper(pts.map(([qx, qy, w]) => [...W([base[0] + ox + (qx * ct - qy * st) * sc, base[1] + oy + (qx * st + qy * ct) * sc]), w * sc * k]));
      parts.push(A([[0, 0, 4.6], [-2.6, -7, 4.3], [-2.4, -14, 4], [0.6, -20, 3.7], [6.6, -24.4, 3.4], [14, -27, 3], [22, -27.6, 2.6], [29, -26.2, 2.1], [34.4, -23, 1.5], [37.6, -19, 0.5]]));
      parts.push(A([[-2.4, -7.5, 2.4], [-2, -13, 1.8], [-0.4, -17, 0.5]]));
      parts.push(A([[4.6, -22.8, 2.6], [4.6, -30, 2.1], [5.6, -37, 1.5], [8, -42, 0.5]]));
      parts.push(A([[12.4, -26.4, 2.5], [12.8, -34, 2], [14.2, -41, 1.4], [16.8, -46, 0.5]]));
      parts.push(A([[20.6, -27.6, 2.3], [21.2, -34.4, 1.8], [22.8, -39.6, 1.2], [25.4, -43, 0.4]]));
      parts.push(A([[28.4, -26.4, 2], [29.4, -31.6, 1.5], [31.4, -35.4, 0.4]]));
    }
  }
  return {
    far: { hind: hind(P.hind[1], P.rake?.[1]), fore: fore(P.fore[1]), ear: ear(-1.5, 1.5, P.ears[0]), antler: rack[0] },
    near: { hind: hind(P.hind[0], P.rake?.[0]), fore: fore(P.fore[0]), ear: ear(0, 0, P.ears[1]), antler: rack[1] },
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
