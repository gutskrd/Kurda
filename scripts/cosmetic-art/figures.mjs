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
 * The deer's poses, in its own frame (x from the back of the rump toward the
 * chest, y up from the ground, negative, in hundredths of its height at the
 * withers): the line of its rump and of its back on to the withers, which
 * drop when the head goes down; the neck's crest from there to the back of the
 * skull (the poll), and where that is and how far the face is turned down
 * from level, in radians, and how far the antlers are turned back from the
 * face (a lowered head turns a little toward us, and its rack with it, so the
 * tines still rise); the throat from under the jaw back to the chest,
 * and the chest down to the brisket; and how far each pair of legs is set
 * forward or back, near and far.
 */
const POSES = {
  alert: {
    rump: [[16, -100.5], [28, -101], [42, -99.2]],
    back: [[56, -97.5], [68, -98], [76, -99.6], [82, -100.6]],
    crest: [[84.4, -110], [88.4, -120], [94.2, -128.2], [100.6, -133.4]],
    poll: [107, -136],
    angle: 0.62,
    rack: 0,
    throat: [[99.6, -104], [100, -94], [100.8, -84]],
    chest: [[100.8, -76], [99, -67], [94, -60.4]],
    fore: [0, -6],
    hind: [0, 7],
  },
  graze: {
    rump: [[16, -99.2], [28, -99.6], [42, -98]],
    back: [[56, -96.2], [68, -94], [78, -91.2], [85, -88.6]],
    crest: [[97, -84], [107.5, -77], [115.5, -67.5], [120.5, -56]],
    poll: [123, -45],
    angle: 1.5,
    rack: -0.85,
    throat: [[97.6, -42], [95.6, -50], [94, -56.5]],
    chest: [[92.4, -59.5], [88.4, -57.6]],
    fore: [4, -7],
    hind: [0, 7],
  },
  drink: {
    rump: [[16, -99.2], [28, -99.6], [42, -98]],
    back: [[56, -96.2], [68, -93.8], [78, -90.6], [85, -87.6]],
    crest: [[97, -83], [108.5, -77.5], [119, -71.5], [127.5, -65.5]],
    poll: [132, -60],
    angle: 1.43,
    rack: -0.8,
    throat: [[103, -50], [100, -50.6], [97.4, -50.4]],
    chest: [[95.2, -49.6], [91, -56]],
    fore: [5, -8],
    hind: [0, 7],
  },
};

/**
 * A deer — a stag — in one of its poses: 'alert' (head up, looking out),
 * 'graze' (head down, its muzzle in the grass), 'drink' (head down and
 * reaching forward to the water at its forefeet, which stand in the
 * shallows: its muzzle is some 14 hundredths of its height above its hooves).
 * `size` is its height at the withers, (x, y) the ground under the middle of
 * its body.
 *
 * Drawn the way an animal painter draws one, from its anatomy, since against
 * the light it is shape and nothing else: a deep round barrel of a body, the
 * back arching from a high rump that rounds down under a broad hanging tail;
 * long fine legs — the hind ones bending back at a high, sharp hock under a
 * heavy thigh, the fore ones straight through a small knee — on small
 * pointed hooves; a neck nearly as deep as the body where it leaves the
 * shoulders and not much less behind the jaw, flowing out of the back in one
 * curve; a long, deep wedge of a head with big ears out from the poll; and a
 * heavy rack that rises from the crown, sweeps forward over the face and
 * lifts tall tines off its beams.
 */
export function deer({ x, y, size, facing = 1, colour, pose = 'alert', antlers = true }) {
  const k = size / 100;
  const W = ([px, py]) => [x + facing * (px - 50) * k, y + py * k];
  const P = POSES[pose];
  const parts = [];
  // the head's own frame: from the poll, x forward along the face to the nose, y down toward the jaw (drawn to a
  // head 36 long, and grown to one 45 long: a deer's head is long)
  const ca = Math.cos(P.angle);
  const sa = Math.sin(P.angle);
  const H = ([px, py]) => [P.poll[0] + 1.24 * (px * ca - py * sa), P.poll[1] + 1.24 * (px * sa + py * ca)];
  const outline = (pts) => smooth(pts.map(W));
  const stroke = (pts) => taper(pts.map(([px, py, w]) => [...W(H([px, py])), w * k * 1.24]));

  // the legs, the far pair first: dx sets each forward or back
  const hind = (dx) =>
    outline([[27, -88], [35, -77], [38.5, -68], [36, -61], [30, -52], [24, -43.5], [20.6, -35.5], [20.2, -28], [20.4, -18], [20.8, -10], [21.5, -7.4], [23.4, -3.4], [25.4, -0.4], [24.2, 0.4], [19.8, 0.4], [18.8, -1.6], [18.2, -4.2], [17.1, -6], [16.6, -8.6], [16.2, -16], [15.6, -27], [13.8, -33], [10, -37], [8.6, -40.5], [6.8, -48], [4.2, -58], [1.4, -68], [-0.8, -77], [-1.4, -85], [6, -94]].map(([px, py]) => [px + dx, py]));
  const fore = (dx) =>
    outline([[80, -72], [91.6, -62], [90.4, -53], [88.8, -44], [87.8, -35], [88.1, -31], [87.5, -27], [87.2, -18], [87.3, -10], [87.8, -7.4], [89.5, -3.4], [91.4, -0.4], [90.3, 0.4], [85.8, 0.4], [85.2, -1.6], [84.4, -4.2], [83.4, -6], [83.2, -8.6], [83, -16], [82.8, -24], [82.4, -28], [82.8, -31.5], [82, -35.5], [80.4, -44], [78.2, -51], [75.6, -56], [73, -66]].map(([px, py]) => [px + dx, py]));
  parts.push(hind(P.hind[1]), fore(P.fore[1]), hind(P.hind[0]), fore(P.fore[0]));
  // the body, the neck and the head in one outline, so nothing joins them at a seam: from the root of the tail
  // over the high rump and along the back to the withers, along the crest of the neck to the poll, along the brow
  // and the long face to the nose, round the muzzle and the chin, under the jaw to its angle, back along the
  // throat to the chest and the brisket, along the belly to the flank, and round the haunch and the buttock
  const head = [[-1, -0.5], [4.5, -2.4], [10, -2.2], [16, -0.5], [23, 1.8], [29.5, 4.2], [33.6, 6.4], [35.6, 8.6], [35.8, 10.6], [34.6, 12.4], [32.4, 13.4], [31, 13.6], [31.4, 15], [29.6, 16], [24, 16.2], [17, 17.2], [11, 18.6], [6, 19.4]].map(H);
  parts.push(outline([[6, -94], ...P.rump, ...P.back, ...P.crest, ...head, ...P.throat, ...P.chest, [84, -57.4], [74, -56.8], [62, -57.4], [50, -59.4], [40, -63], [32, -67.4], [20, -72], [8, -75], [1.5, -79], [-1.5, -85], [0.5, -91]]));
  // the tail, broad, hanging from the top of the rump
  parts.push(outline([[7, -93], [3, -92.6], [-0.8, -90], [-3, -86], [-3.8, -81], [-3.2, -77], [-1.6, -76.4], [-0.6, -80], [1, -85.6], [4.4, -89.6]]));
  // the ears, long and wide, out from the poll: the far one a little behind and turned away
  const ear = (dx, dy, turn) => {
    const ct = Math.cos(turn);
    const st = Math.sin(turn);
    return outline([[3, -0.5], [2.6, -5.5], [0.8, -10.5], [-2.4, -15.5], [-4.4, -13], [-5, -8], [-3.6, -3], [-1, 0.5]].map(([qx, qy]) => H([dx + qx * ct - qy * st, dy + qx * st + qy * ct])));
  };
  parts.push(ear(-1.5, 1.5, -0.6), ear(0, 0, -0.85));
  if (antlers) {
    // the far antler a little behind and below the near one, so their tines stand apart; each beam rises from
    // the crown, sweeps forward over the face and turns down at its tip, its tines rising off its top and leaning
    // back, a short brow tine low on it
    // (the far one turned up and back a little from the near, as a rack seen from the side)
    for (const [turn, sc] of [[P.rack - 0.3, 0.9], [P.rack, 1]]) {
      const ct = Math.cos(turn);
      const st = Math.sin(turn);
      const A = (pts) =>
        stroke(
          pts.map(([qx, qy, w]) => {
            const ax = (qx - 7) * sc;
            const ay = (qy + 1.5) * sc;
            return [7 + ax * ct - ay * st, -1.5 + ax * st + ay * ct, w * sc];
          }),
        );
      parts.push(A([[7, -1.5, 5.4], [6, -8, 5.1], [7, -14, 4.8], [11.4, -18.6, 4.3], [17.4, -23, 3.8], [23.6, -26.6, 3.3], [30, -28.6, 2.8], [34.8, -29.4, 2.2], [38.8, -29, 1.5], [41.8, -27.4, 0.5]]));
      // the tines stand off the top of the beam all leaning the same way — straight up when the head is up — each
      // curving a little forward toward its tip, a short brow tine low on the beam
      parts.push(A([[6.2, -10.5, 3], [5.6, -16.5, 2.3], [5.8, -21.5, 0.6]]));
      parts.push(A([[12.4, -19.4, 3.2], [8.4, -25.4, 2.6], [5.4, -31.4, 1.9], [4.4, -36.6, 0.5]]));
      parts.push(A([[19, -24, 3], [15.4, -30.6, 2.4], [12.8, -37, 1.6], [12.4, -42, 0.5]]));
      parts.push(A([[26, -27.4, 2.6], [23, -33.6, 2], [21.4, -38.8, 1.2], [21.6, -42.4, 0.4]]));
      parts.push(A([[33, -28.8, 2], [31, -33.6, 1.4], [30.6, -37.4, 0.4]]));
    }
  }
  return `<g fill="${colour}">${parts.map((d) => `<path d="${d}"/>`).join('')}</g>`;
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
