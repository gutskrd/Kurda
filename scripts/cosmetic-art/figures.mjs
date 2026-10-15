/**
 * Figures for the backgrounds: the deer in its poses, and lambs. The deer is
 * drawn as a silhouette — against the light it is shape and nothing else, so
 * the shape has to be right: its back slopes from the withers, its hind legs
 * bend backwards at the hock, its antlers sweep back before they branch.
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
 * looking out), 'graze' (head down in the grass), 'drink' (head down to the
 * water, the forelegs set apart). `size` is the height at the withers.
 *
 * Drawn to a stag's proportions: the body a little longer than it is high,
 * deep in the chest and tucked up at the flank; the legs long and fine, the
 * forelegs straight to the knee, the hind legs bending back at the hock; a
 * thick neck, a long tapering head, ears laid back, and antlers that sweep
 * back from the brow and branch toward the tips.
 */
export function deer({ x, y, size, facing = 1, colour, pose = 'alert', antlers = true }) {
  const k = size / 100;
  const P = ([px, py]) => [x + facing * (px - 60) * k, y + py * k];
  const T = (pts) => taper(pts.map(([px, py, w]) => [...P([px, py]), w * k]));
  const parts = [];
  const low = pose !== 'alert';
  // head down, the neck reaches forward and down; to drink, a little further, the forelegs set apart
  const drop = pose === 'drink' ? [3, 6] : [0, 0];
  const reach = pose === 'drink' ? 9 : 0;
  // legs first, the far pair a little apart from the near pair; thigh and forearm run up into the body
  const hind = (dx) => T([[14 + dx, -72, 26], [17 + dx, -52, 14], [10 + dx, -33, 7.6], [12.5 + dx, -16, 4.5], [14 + dx, -6, 4.9], [15.5 + dx, -0.6, 5.6]]);
  const fore = (dx, r = 0) => T([[94 + dx, -68, 19], [96 + dx + r * 0.3, -46, 9.4], [97 + dx + r * 0.6, -30, 6.4], [97.5 + dx + r * 0.85, -13, 4.3], [98 + dx + r, -6, 4.7], [99.5 + dx + r, -0.6, 5.6]]);
  parts.push(hind(9), fore(-10, -reach * 0.4), hind(0), fore(0, reach));
  parts.push(T([[5, -95, 8], [0, -92, 6.5], [-3, -86, 3]]));
  // the whole outline: rump, back and withers, the neck to the poll, round the head, down the throat and chest, under the belly
  const back = [[5, -95], [15, -99], [34, -100], [56, -98], [76, -102], [86, -106]];
  const under = [[116, -70], [110, -61], [100, -56], [84, -55], [64, -57], [46, -59], [30, -63], [22, -62], [10, -62], [2, -70], [-1, -80], [1, -89]];
  const d = (pts) => pts.map(([px, py]) => [px + drop[0], py + drop[1]]);
  const neckHead = low
    ? [[98, -104], [110, -96], [122, -82], [132, -64], ...d([[139, -46], [143, -32], [149, -28], [152, -18], [153, -8], [152, -2], [149, -1], [146, -3], [142, -10], [137, -20], [134, -26], [130, -38]]), [124, -52], [119, -63]]
    : [[96, -116], [104, -129], [110, -142], [114, -153], [121, -156], [130, -150], [138, -141], [143, -133], [146, -128], [144, -124], [139, -124], [131, -128], [124, -131], [121, -123], [122, -112], [122, -100], [119, -84]];
  parts.push(smooth([...back, ...neckHead, ...under].map(P)));
  // ears, and the antlers: drawn for the head held up, and turned with it when it goes down
  const pivot = [118, -156];
  const at = low ? [147 + drop[0], -31 + drop[1]] : pivot;
  const turn = low ? 0.78 : 0;
  const R = ([px, py]) => {
    const dx = px - pivot[0];
    const dy = py - pivot[1];
    return [at[0] + dx * Math.cos(turn) - dy * Math.sin(turn), at[1] + dx * Math.sin(turn) + dy * Math.cos(turn)];
  };
  const RT = (pts) => T(pts.map(([px, py, w]) => [...R([px, py]), w]));
  parts.push(RT([[114, -151, 8], [107, -156, 11], [100, -158, 6.5], [95, -159, 1]]));
  parts.push(RT([[116, -154, 6], [112, -161, 8], [108, -167, 4.5], [106, -170, 1]]));
  if (antlers) {
    // the far antler a little behind and below the near one; the beam sweeps back, the tines rise off its front
    for (const [ox, oy, sc] of [[-13, 5, 0.92], [0, 0, 1]]) {
      const A = (pts) => RT(pts.map(([px, py, w]) => [pivot[0] + (px - pivot[0]) * sc + ox, pivot[1] + (py - pivot[1]) * sc + oy, w * sc]));
      parts.push(A([[118, -157, 7], [116, -168, 6.2], [111, -180, 5.4], [104, -191, 4.6], [98, -201, 3.8], [96, -211, 3], [99, -220, 2], [103, -226, 0.6]]));
      parts.push(A([[118, -160, 4.2], [128, -163, 3.2], [136, -167, 2], [141, -173, 0.6]]));
      parts.push(A([[117, -166, 3.6], [126, -170, 2.6], [132, -175, 0.6]]));
      parts.push(A([[106, -189, 3.2], [113, -196, 2.2], [117, -203, 0.6]]));
      parts.push(A([[97, -208, 2.8], [89, -215, 1.8], [85, -222, 0.6]]));
      parts.push(A([[99, -216, 2.2], [97, -226, 1.2], [96, -232, 0.4]]));
    }
  }
  return `<g fill="${colour}">${parts.map((p) => `<path d="${p}"/>`).join('')}</g>`;
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
