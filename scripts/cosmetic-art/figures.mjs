/**
 * Figures for the backgrounds: the deer in its poses, and lambs. The deer is
 * drawn as a silhouette — against the light it is shape and nothing else, so
 * the shape has to be right: a deep body and a thick neck, a head with a
 * deer's deep jaw and blunt muzzle, hind legs bending backwards at the hock,
 * antlers that sweep back before they branch.
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
 * A deer — a stag of the Zagros — in one of its poses: 'alert' (head up,
 * looking out), 'graze' (head down, its muzzle in the grass), 'drink' (head
 * down to the water, the forelegs set apart). `size` is the height at the
 * withers.
 *
 * Built the way an animal painter blocks one in, from its masses, so that
 * whatever the pose it keeps a deer's weight: a deep barrel of a body, round
 * haunches, a neck as thick at the shoulder as the chest is deep and still
 * half that where it meets the head, a long wedge of a head with a deep jaw
 * and a blunt muzzle, big ears, legs fine below the knee and the hock, and
 * antlers that sweep back from the brow and branch toward the tips. The head
 * is drawn in its own frame and turned to the pose; the neck is laid between
 * the shoulders and wherever the head is.
 */
export function deer({ x, y, size, facing = 1, colour, pose = 'alert', antlers = true }) {
  const k = size / 100;
  const W = ([px, py]) => [x + facing * (px - 55) * k, y + py * k];
  const parts = [];
  const drink = pose === 'drink';
  const low = pose !== 'alert';
  // where the head is, and how far it is turned down: its frame's origin is the back of the skull, between the
  // poll and the throat, and its x runs forward along the face to the muzzle
  const [hx, hy, angle] = pose === 'alert' ? [121, -133, 0.45] : drink ? [124, -33, 1.05] : [122, -35, 1.15];
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const H = ([px, py]) => [hx + px * ca - py * sa, hy + px * sa + py * ca];
  const HT = (pts) => taper(pts.map(([px, py, w]) => [...W(H([px, py])), w * k]));
  const T = (pts) => taper(pts.map(([px, py, w]) => [...W([px, py]), w * k]));

  // the legs, far pair first: thigh and forearm heavy, fine below the knee and the hock; drinking, the forelegs
  // splay to let the head down
  const fore = (dx, splay) => [[90 + dx, -64, 14], [91 + dx + splay * 0.25, -50, 9.6], [92 + dx + splay * 0.5, -34, 7.2], [92.4 + dx + splay * 0.56, -30, 6.8], [92.8 + dx + splay * 0.78, -16, 5], [93.2 + dx + splay * 0.94, -7, 5.4], [94.6 + dx + splay, -2.5, 5.6], [95.6 + dx + splay, 0, 6.2]];
  const hind = (dx) => [[21 + dx, -74, 29], [28 + dx, -54, 18], [24 + dx, -43, 11.5], [17 + dx, -32, 7.6], [18 + dx, -18, 5.2], [19 + dx, -7, 5.4], [20.5 + dx, -2.5, 5.6], [21.5 + dx, 0, 6.2]];
  parts.push(T(hind(9)), T(fore(-8, drink ? -5 : 0)), T(hind(0)), T(fore(0, drink ? 9 : 0)));
  // the tail, short, held down
  parts.push(T([[5, -93, 7.5], [1, -86, 5.5], [-1, -79, 2.6]]));
  // the body: rump, the long back to the withers, the shoulder and the point of the chest, the deep brisket,
  // the belly rising to the flank, the round of the haunch
  const body = [[1, -80], [3, -88], [9, -94], [20, -97], [36, -96], [52, -95], [66, -97], [78, -102], [89, -102], [99, -95], [105, -86], [108, -76], [106, -64], [99, -54], [86, -50], [70, -47.5], [54, -48], [40, -51], [30, -56], [24, -58], [16, -60], [8, -65], [3, -72]];
  parts.push(smooth(body.map(W)));
  // the neck and the head in one outline, so nothing joins them at a seam: up the arched crest from the withers
  // to the poll, along the brow and the long nose to the blunt muzzle and its nose, under the chin, round the
  // deep jaw, and down the throat to the point of the chest
  const top = low ? [78, -103] : [70, -100];
  const chest = [107, -78];
  // head up, the throat runs down from under the jaw; head down, from behind it
  const jaw = low ? [[17, 10.6], [9, 12.6], [3, 12.8], [-3, 11.6]] : [[17, 10.6], [10, 12.6], [6, 12.8]];
  const poll = H([-1, -10]);
  const latch = H(jaw[jaw.length - 1]);
  const vx = poll[0] - top[0];
  const vy = poll[1] - top[1];
  const len = Math.hypot(vx, vy);
  let [px, py] = [vy / len, -vx / len];
  if ((latch[0] - top[0]) * px + (latch[1] - top[1]) * py > 0) [px, py] = [-px, -py];
  const bow = (t, amount) => [top[0] + vx * t + px * amount * len, top[1] + vy * t + py * amount * len];
  // the throat: running down from the round of the jaw, filling out toward the chest
  const tx = chest[0] - latch[0];
  const ty = chest[1] - latch[1];
  const along = (t, out) => [latch[0] + tx * t - px * out, latch[1] + ty * t - py * out];
  const outline = [
    top,
    bow(0.3, low ? 0.09 : 0.04),
    bow(0.62, low ? 0.08 : 0.06),
    bow(0.86, low ? 0.04 : 0.035),
    poll,
    ...[[5, -12], [12, -11.6], [22, -8.4], [31, -5.8], [37.5, -3.7], [39.6, -0.4], [38.6, 2.9], [35, 5.2], [26, 7.2], ...jaw].map(H),
    along(0.3, 0),
    along(0.68, low ? 1 : 2.5),
    chest,
    [90, -70],
    // in under the back, so the crest rises out of it without a seam
    [top[0] - 6, top[1] + 8],
  ];
  parts.push(smooth(outline.map(W)));
  // the ears, long and wide, laid back from the poll, the far one standing up behind
  parts.push(smooth([[0, -8], [-5, -11.5], [-11, -15.5], [-18, -18.5], [-14, -13], [-7, -8], [3, -6]].map((q) => W(H(q)))));
  parts.push(smooth([[3, -10], [-1, -15], [-6, -21], [-11, -25.5], [-8, -19], [-2, -12.5], [7, -10.5]].map((q) => W(H(q)))));
  if (antlers) {
    // the far antler a little behind the near one; the beam sweeps back and up from the brow, the tines rise
    // off its front, a crown of three at its top
    // (the far one turned a little back from the near, so the two diverge as a stag's do seen from the side)
    for (const [turn, sc] of [[-0.32, 0.94], [0, 1]]) {
      const ct = Math.cos(turn);
      const st = Math.sin(turn);
      const A = (pts) =>
        HT(
          pts.map(([qx, qy, w]) => {
            const ax = (qx - 6) * sc * 0.86;
            const ay = (qy + 10) * sc * 0.86;
            return [6 + ax * ct - ay * st, -10 + ax * st + ay * ct, w * sc];
          }),
        );
      parts.push(A([[6, -10, 5.4], [3, -17, 4.8], [-2, -26, 4.3], [-8, -35, 3.8], [-12, -45, 3.3], [-12.5, -55, 2.8], [-10, -63, 2.2], [-6, -69, 1.3]]));
      parts.push(A([[5, -12.5, 3.6], [11, -15.5, 2.8], [17, -19.5, 1.9], [21, -24.5, 0.7]]));
      parts.push(A([[2, -18.5, 3.2], [9, -21.5, 2.3], [14, -26.5, 1.5], [16, -30.5, 0.5]]));
      parts.push(A([[-9, -37, 2.8], [-2, -42, 2], [2, -47, 1.2], [3, -51.5, 0.4]]));
      parts.push(A([[-12.5, -54, 2.4], [-19, -58.5, 1.6], [-23, -62.5, 0.5]]));
      parts.push(A([[-12, -50, 2.2], [-6, -54, 1.4], [-3, -58.5, 0.4]]));
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
