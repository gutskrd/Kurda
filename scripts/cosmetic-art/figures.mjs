/**
 * Figures for the backgrounds: the deer in its poses, lambs, and the dancers
 * of a govend. The deer is drawn as a silhouette — against the light it is
 * shape and nothing else, so the shape has to be right: its back slopes from
 * the withers, its hind legs bend backwards at the hock, its antlers sweep
 * back before they branch. The dancers are drawn in their clothes, the cloth
 * lit on the side the light comes from — or, against a fire or the sky, as
 * silhouettes too.
 *
 * Each takes a position on the ground (x, y) and a size.
 */
import { between, linear, n, pt, tint } from './kit.mjs';

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

/**
 * A deer, in one of its poses: 'alert' (head up, looking out), 'graze' (head
 * down in the grass), 'drink' (head down to the water, forelegs apart),
 * 'walk'. Size is the height at the withers.
 */
export function deer({ x, y, size, facing = 1, colour, pose = 'alert', antlers = true }) {
  const k = size / 84;
  const P = ([px, py]) => [x + facing * px * k, y + py * k];
  const T = (pts) => taper(pts.map(([px, py, w]) => [...P([px, py]), w * k]));
  const parts = [];
  // the body: rump to chest, deep in the chest, tucked up at the flank
  const body = [
    [8, -67], [15, -76], [36, -78], [60, -79], [80, -84], [97, -80], [108, -70], [111, -58],
    [105, -47], [87, -44], [64, -45], [45, -49], [27, -52], [14, -57],
  ].map(P);
  let d = `M${pt([(body[0][0] + body[body.length - 1][0]) / 2, (body[0][1] + body[body.length - 1][1]) / 2])}`;
  for (let i = 0; i < body.length; i++) {
    const a = body[i];
    const b = body[(i + 1) % body.length];
    d += ` Q${pt(a)} ${pt([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])}`;
  }
  parts.push(`${d} Z`);
  // the haunch and the tail
  parts.push(T([[15, -69, 24], [22, -59, 26], [28, -49, 18]]));
  parts.push(T([[9, -73, 7], [3, -71, 6], [0, -65, 3]]));
  // legs: hind ones bend backwards at the hock; fore ones run straight to the knee
  const legs = {
    alert: { fore: [100, 91], hind: [24, 12] },
    walk: { fore: [110, 88], hind: [34, 8] },
    graze: { fore: [104, 95], hind: [26, 14] },
    drink: { fore: [118, 90], hind: [24, 12] },
  }[pose];
  for (const [i, hx] of legs.hind.entries()) {
    const off = i === 0 ? 0 : -7;
    parts.push(T([[26 + off, -52, 16], [20 + off + (hx - 20) * 0.2, -34, 9], [14 + off + (hx - 18) * 0.4, -24, 5.5], [hx + 1, -10, 4], [hx + 2, 0, 4.6]]));
  }
  for (const [i, fx] of legs.fore.entries()) {
    const off = i === 0 ? 0 : -8;
    parts.push(T([[100 + off, -52, 13], [99 + off + (fx - 100 - off) * 0.35, -30, 6.2], [fx - (fx - 100 - off) * 0.12, -12, 4.4], [fx, -4, 4], [fx + 1, 0, 4.6]]));
  }
  // the neck, and where the head sits on it; `angle` is the head's tilt, 0 = muzzle level
  let head;
  let angle;
  if (pose === 'alert' || pose === 'walk') {
    parts.push(T([[90, -74, 30], [100, -96, 21], [109, -116, 16], [113, -126, 14]]));
    head = [117, -128];
    angle = pose === 'walk' ? 0.75 : 0.55;
  } else {
    const low = pose === 'drink' ? 2 : 6;
    parts.push(T([[96, -72, 30], [112, -58, 21], [124, -38, 16], [131, -low - 20, 14]]));
    head = [135, -low - 14];
    angle = 1.3;
  }
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  // the head's own frame: u along the muzzle, v down from the skull
  const H = (u, v) => [head[0] + u * ca - v * sa, head[1] + u * sa + v * ca];
  parts.push(T([[...H(-7, 0), 16], [...H(4, 0.5), 13], [...H(14, 1.5), 9], [...H(21, 2.5), 7]]));
  // ears, laid back and out
  parts.push(T([[...H(-6, -6), 4.5], [...H(-12, -11), 6.5], [...H(-19, -13), 1.5]]));
  if (antlers) {
    // the near antler and, a little behind it, the far one: the beam sweeps back and up, the tines rise off its front
    for (const [du, dv] of [[-3, 1], [0, 0]]) {
      const B = (u, v) => H(u + du, v + dv);
      parts.push(T([[...B(-5, -8), 4.4], [...B(-11, -18), 3.8], [...B(-15, -29), 3.2], [...B(-14, -40), 2.6], [...B(-9, -49), 1.6], [...B(-5, -53), 0.6]]));
      parts.push(T([[...B(-6, -10), 3], [...B(-1, -14), 2], [...B(4, -15), 0.6]]));
      parts.push(T([[...B(-11, -19), 2.8], [...B(-7, -27), 1.9], [...B(-3, -33), 0.6]]));
      parts.push(T([[...B(-15, -30), 2.4], [...B(-11, -38), 1.6], [...B(-8, -44), 0.5]]));
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

/**
 * A govend: dancers in a line, shoulder to shoulder, little fingers linked
 * and arms down, all on the same step to the right; the leader at the
 * right-hand end lifts a scarf. The women wear long dresses with a velvet
 * vest over them, a belt of coins and a light scarf over the hair; the men
 * şal û şapik — jacket and full trousers of one cloth — a wide sash, and a
 * turban wound round the head.
 *
 * Drawn into `cv`, feet along y, `size` tall; `curve` lifts the middle of the
 * line (the far side of a ring). `dress`, `vest`, `clothes`, `sash` and
 * `turban` are colours or lists of them, taken in turn. `light` is the side
 * the light comes from (-1 left, 1 right, 0 none): each piece of cloth is lit
 * toward it and shaded away. `shadow` lays each dancer's shadow on the ground,
 * away from the light. `silhouette` draws everything but the scarf in that one
 * colour, for dancers against a fire or the sky.
 */
export function govend(cv, rnd, { x, y, count, size, step = size * 0.34, curve = 0, dress, vest = dress, clothes, sash = clothes, turban = ['#ece4d4', '#2a2422'], skin, hair = '#1c1412', headscarf = '#f6eee0', shoes = '#2a1c16', klash = '#e8e0cc', shirt = '#efe8da', gold = '#e8b84a', scarf = '#e8322f', light = 0, contrast = 0.35, shadow = null, silhouette = null }) {
  // in silhouette, one colour for everything but the leader's scarf
  const solid = silhouette;
  const pick = (v, i) => solid ?? (Array.isArray(v) ? v[i % v.length] : v);
  const fills = new Map();
  // cloth lit on the side toward the light, shaded on the side away
  const fill = (colour) => {
    if (!light) return colour;
    if (!fills.has(colour)) {
      const id = cv.id('gv');
      const lit = tint(colour, contrast * 0.55);
      const dark = tint(colour, -contrast);
      cv.def(linear(id, [[0, light < 0 ? lit : dark], [0.5, colour], [1, light < 0 ? dark : lit]], 0, 0, 1, 0));
      fills.set(colour, `url(#${id})`);
    }
    return fills.get(colour);
  };
  const people = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1) - 0.5;
    people.push({
      x: x + (i - (count - 1) / 2) * step,
      y: y - curve * (1 - 4 * t * t),
      s: size * between(rnd, 0.92, 1.05),
      woman: i % 2 === 0,
      lift: between(rnd, 0.7, 1.15),
      sway: between(rnd, -0.025, 0.025),
    });
  }
  const shadows = [];
  const backs = [];
  const bodies = [];
  const fronts = [];
  for (const [i, p] of people.entries()) {
    const { s } = p;
    // (u, v): u across in heights from the dancer's middle, v up from the feet
    const at = (u, v) => pt([p.x + (u + p.sway * v) * s, p.y - v * s]);
    const path = (d, colour, extra = '') => `<path d="${d}" fill="${colour}"${extra}/>`;
    if (shadow) {
      const dir = light ? -light : 1;
      shadows.push(`<ellipse cx="${n(p.x + dir * s * shadow.reach * 0.5)}" cy="${n(p.y + s * 0.01)}" rx="${n(s * (0.16 + shadow.reach * 0.5))}" ry="${n(s * 0.035)}"/>`);
    }
    const prev = people[i - 1];
    const next = people[i + 1];
    const leader = !next;
    const sleeve = p.woman ? pick(dress, i) : pick(clothes, i);
    const arm = (side) => {
      const sx = side * (p.woman ? 0.1 : 0.112);
      if (leader && side > 0) {
        // the leader's arm up, the scarf in the hand
        return [[sx, 0.8, 0.05], [0.19, 0.86, 0.042], [0.235, 1.0, 0.034]];
      }
      const other = side < 0 ? prev : next;
      if (!other) return [[sx, 0.8, 0.05], [side * 0.125, 0.64, 0.04], [side * 0.112, 0.5, 0.032]];
      const reach = (Math.abs(other.x - p.x) / 2) / s;
      const lower = (other.y - p.y) / s / 2;
      return [[sx, 0.8, 0.05], [side * (0.13 + reach * 0.1), 0.64, 0.04], [side * reach * 0.94, 0.48 - lower, 0.032]];
    };
    const armPath = (pts) => taper(pts.map(([u, v, w]) => {
      const [px, py] = at(u, v).split(',').map(Number);
      return [px, py, w * s];
    }));
    const hands = [];
    for (const side of [-1, 1]) {
      const pts = arm(side);
      bodies.push(path(armPath(pts), fill(sleeve)));
      const [u, v] = pts[pts.length - 1];
      hands.push(`<circle cx="${at(u, v).split(',')[0]}" cy="${at(u, v).split(',')[1]}" r="${n(s * 0.022)}" fill="${pick(skin, i)}"/>`);
    }
    if (p.woman) {
      const c = pick(dress, i);
      const vc = pick(vest, i + 1);
      // the scarf's fall behind the shoulders, and the hair under it
      backs.push(path(`M${at(-0.06, 0.95)} C${at(-0.1, 0.9)} ${at(-0.13, 0.78)} ${at(-0.15, 0.66)} L${at(-0.04, 0.7)} L${at(0.06, 0.74)} C${at(0.09, 0.8)} ${at(0.08, 0.9)} ${at(0.06, 0.95)} Z`, fill(pick(headscarf, i)), ' fill-opacity="0.92"'));
      // the long dress, swinging out behind the step
      const swing = 0.07 * p.lift;
      bodies.push(path(`M${at(-0.035, 0.85)} L${at(-0.1, 0.818)} C${at(-0.112, 0.79)} ${at(-0.1, 0.74)} ${at(-0.092, 0.7)} C${at(-0.085, 0.66)} ${at(-0.066, 0.63)} ${at(-0.066, 0.6)} C${at(-0.07, 0.55)} ${at(-0.1, 0.45)} ${at(-0.13 - swing * 0.3, 0.3)} C${at(-0.16 - swing * 0.6, 0.18)} ${at(-0.2 - swing, 0.09)} ${at(-0.21 - swing, 0.03)} Q${at(-0.16 - swing * 0.6, 0)} ${at(-0.11, 0.025)} Q${at(-0.05, 0)} ${at(0.01, 0.02)} Q${at(0.08, -0.005)} ${at(0.15, 0.03)} C${at(0.135, 0.12)} ${at(0.115, 0.25)} ${at(0.1, 0.36)} C${at(0.085, 0.46)} ${at(0.068, 0.54)} ${at(0.066, 0.6)} C${at(0.066, 0.63)} ${at(0.085, 0.66)} ${at(0.092, 0.7)} C${at(0.1, 0.74)} ${at(0.112, 0.79)} ${at(0.1, 0.818)} L${at(0.035, 0.85)} Z`, fill(c)));
      // folds falling from the waist
      bodies.push(`<path d="M${at(-0.03, 0.56)} Q${at(-0.08, 0.3)} ${at(-0.11 - swing * 0.5, 0.03)} M${at(0.015, 0.56)} Q${at(0.0, 0.3)} ${at(0.01, 0.03)} M${at(0.05, 0.52)} Q${at(0.09, 0.3)} ${at(0.12, 0.04)}" fill="none" stroke="${solid ?? tint(c, -0.45)}" stroke-opacity="0.35" stroke-width="${n(s * 0.012)}" stroke-linecap="round"/>`);
      // feet under the hem, one lifted in the step
      bodies.push(`<ellipse cx="${at(-0.05, 0.012).split(',')[0]}" cy="${at(-0.05, 0.012).split(',')[1]}" rx="${n(s * 0.04)}" ry="${n(s * 0.016)}" fill="${pick(shoes, i)}"/>`);
      // the velvet vest, open down the front, edged in gold
      bodies.push(path(`M${at(-0.035, 0.85)} L${at(-0.1, 0.818)} C${at(-0.112, 0.79)} ${at(-0.1, 0.74)} ${at(-0.092, 0.7)} C${at(-0.085, 0.66)} ${at(-0.07, 0.62)} ${at(-0.07, 0.55)} L${at(-0.02, 0.54)} C${at(-0.018, 0.64)} ${at(-0.02, 0.75)} ${at(-0.035, 0.85)} Z M${at(0.035, 0.85)} L${at(0.1, 0.818)} C${at(0.112, 0.79)} ${at(0.1, 0.74)} ${at(0.092, 0.7)} C${at(0.085, 0.66)} ${at(0.07, 0.62)} ${at(0.07, 0.55)} L${at(0.02, 0.54)} C${at(0.018, 0.64)} ${at(0.02, 0.75)} ${at(0.035, 0.85)} Z`, fill(vc)));
      bodies.push(`<path d="M${at(-0.035, 0.85)} C${at(-0.02, 0.75)} ${at(-0.018, 0.64)} ${at(-0.02, 0.54)} M${at(0.035, 0.85)} C${at(0.02, 0.75)} ${at(0.018, 0.64)} ${at(0.02, 0.54)}" fill="none" stroke="${solid ?? gold}" stroke-width="${n(s * 0.008)}" stroke-opacity="0.9"/>`);
      // the belt of coins, a few hanging
      const coins = [];
      for (let k = -3; k <= 3; k++) {
        const [cx, cy] = at(k * 0.021, 0.6 - Math.abs(k) * 0.002).split(',');
        coins.push(`<circle cx="${cx}" cy="${cy}" r="${n(s * 0.0095)}"/>`);
        if (k % 2 === 0) {
          const [dx, dy] = at(k * 0.021, 0.575).split(',');
          coins.push(`<circle cx="${dx}" cy="${dy}" r="${n(s * 0.007)}"/>`);
        }
      }
      fronts.push(`<g fill="${solid ?? gold}">${coins.join('')}</g>`);
    } else {
      const c = pick(clothes, i);
      const sc = pick(sash, i + 1);
      // full trousers, gathered at the ankle: the left leg standing, the right lifted in the step
      const lift = 0.05 * p.lift;
      bodies.push(path(`M${at(-0.105, 0.56)} C${at(-0.135, 0.46)} ${at(-0.145, 0.3)} ${at(-0.12, 0.18)} C${at(-0.105, 0.11)} ${at(-0.08, 0.07)} ${at(-0.075, 0.035)} L${at(-0.028, 0.035)} C${at(-0.03, 0.08)} ${at(-0.04, 0.16)} ${at(-0.03, 0.26)} C${at(-0.022, 0.32)} ${at(-0.01, 0.37)} ${at(0.0, 0.4)} C${at(0.015, 0.36)} ${at(0.03, 0.3)} ${at(0.04, 0.24)} C${at(0.05, 0.17)} ${at(0.055, 0.11)} ${at(0.06, 0.045 + lift)} L${at(0.108, 0.045 + lift)} C${at(0.112, 0.1 + lift)} ${at(0.14, 0.15 + lift * 0.5)} ${at(0.148, 0.24)} C${at(0.155, 0.34)} ${at(0.135, 0.46)} ${at(0.105, 0.56)} Z`, fill(c)));
      // the folds of the full cloth
      bodies.push(`<path d="M${at(-0.07, 0.5)} Q${at(-0.11, 0.3)} ${at(-0.06, 0.07)} M${at(0.07, 0.5)} Q${at(0.12, 0.3)} ${at(0.085, 0.08 + lift)} M${at(-0.05, 0.16)} Q${at(-0.075, 0.12)} ${at(-0.1, 0.13)} M${at(0.08, 0.17 + lift)} Q${at(0.1, 0.13 + lift)} ${at(0.13, 0.15 + lift)}" fill="none" stroke="${solid ?? tint(c, -0.5)}" stroke-opacity="0.35" stroke-width="${n(s * 0.012)}" stroke-linecap="round"/>`);
      // klaş, the white woven shoes
      bodies.push(`<ellipse cx="${at(-0.052, 0.018).split(',')[0]}" cy="${at(-0.052, 0.018).split(',')[1]}" rx="${n(s * 0.042)}" ry="${n(s * 0.018)}" fill="${solid ?? klash}"/>`);
      bodies.push(`<ellipse cx="${at(0.086, 0.03 + lift).split(',')[0]}" cy="${at(0.086, 0.03 + lift).split(',')[1]}" rx="${n(s * 0.04)}" ry="${n(s * 0.017)}" fill="${solid ?? klash}" transform="rotate(-14 ${at(0.086, 0.03 + lift).replace(',', ' ')})"/>`);
      // the shirt at the open neck, then the jacket over it
      bodies.push(path(`M${at(-0.035, 0.85)} L${at(0.035, 0.85)} L${at(0.03, 0.58)} L${at(-0.03, 0.58)} Z`, solid ?? shirt));
      bodies.push(path(`M${at(-0.035, 0.85)} L${at(-0.115, 0.82)} C${at(-0.125, 0.76)} ${at(-0.11, 0.66)} ${at(-0.105, 0.58)} C${at(-0.11, 0.52)} ${at(-0.12, 0.46)} ${at(-0.125, 0.42)} L${at(-0.04, 0.42)} L${at(-0.025, 0.6)} C${at(-0.02, 0.7)} ${at(-0.022, 0.78)} ${at(-0.035, 0.85)} Z M${at(0.035, 0.85)} L${at(0.115, 0.82)} C${at(0.125, 0.76)} ${at(0.11, 0.66)} ${at(0.105, 0.58)} C${at(0.11, 0.52)} ${at(0.12, 0.46)} ${at(0.125, 0.42)} L${at(0.04, 0.42)} L${at(0.025, 0.6)} C${at(0.02, 0.7)} ${at(0.022, 0.78)} ${at(0.035, 0.85)} Z`, fill(c)));
      // the sash, wound wide, striped, an end hanging at the hip
      bodies.push(path(`M${at(-0.108, 0.6)} L${at(0.108, 0.6)} L${at(0.112, 0.52)} L${at(-0.112, 0.52)} Z M${at(-0.09, 0.53)} L${at(-0.06, 0.53)} L${at(-0.07, 0.4)} L${at(-0.1, 0.41)} Z`, fill(sc)));
      fronts.push(`<path d="M${at(-0.108, 0.585)} L${at(0.108, 0.585)} M${at(-0.11, 0.535)} L${at(0.11, 0.535)}" stroke="${solid ?? tint(sc, 0.45)}" stroke-width="${n(s * 0.007)}" stroke-opacity="0.8"/>`);
    }
    // the neck and the face
    fronts.push(path(`M${at(-0.022, 0.84)} L${at(0.022, 0.84)} L${at(0.02, 0.88)} L${at(-0.02, 0.88)} Z`, pick(skin, i)));
    const [fx, fy] = at(0, 0.925).split(',');
    fronts.push(`<ellipse cx="${fx}" cy="${fy}" rx="${n(s * 0.05)}" ry="${n(s * 0.062)}" fill="${fill(pick(skin, i))}"/>`);
    if (p.woman) {
      // hair at the temples, the scarf over the crown with a band of coins
      fronts.push(path(`M${at(-0.052, 0.94)} C${at(-0.06, 0.9)} ${at(-0.056, 0.86)} ${at(-0.04, 0.86)} L${at(-0.044, 0.93)} Z M${at(0.052, 0.94)} C${at(0.06, 0.9)} ${at(0.056, 0.86)} ${at(0.04, 0.86)} L${at(0.044, 0.93)} Z`, pick(hair, i)));
      fronts.push(path(`M${at(-0.062, 0.915)} C${at(-0.066, 0.99)} ${at(-0.03, 1.012)} ${at(0, 1.012)} C${at(0.03, 1.012)} ${at(0.066, 0.99)} ${at(0.062, 0.915)} C${at(0.04, 0.95)} ${at(-0.04, 0.95)} ${at(-0.062, 0.915)} Z`, fill(pick(headscarf, i))));
      const band = [];
      for (let k = -3; k <= 3; k++) {
        const [bx, by] = at(k * 0.016, 0.947 - Math.abs(k) * 0.006).split(',');
        band.push(`<circle cx="${bx}" cy="${by}" r="${n(s * 0.0065)}"/>`);
      }
      fronts.push(`<g fill="${solid ?? gold}">${band.join('')}</g>`);
    } else {
      // the turban: cloth wound round the head, its fringe falling at the side
      const tc = pick(turban, Math.floor(i / 2));
      fronts.push(path(`M${at(-0.06, 0.93)} C${at(-0.072, 0.99)} ${at(-0.04, 1.03)} ${at(0, 1.03)} C${at(0.04, 1.03)} ${at(0.072, 0.99)} ${at(0.06, 0.93)} C${at(0.035, 0.955)} ${at(-0.035, 0.955)} ${at(-0.06, 0.93)} Z`, fill(tc)));
      fronts.push(`<path d="M${at(-0.058, 0.955)} Q${at(0, 0.99)} ${at(0.058, 0.955)} M${at(-0.05, 0.985)} Q${at(0, 1.012)} ${at(0.05, 0.985)} M${at(-0.062, 0.94)} L${at(-0.075, 0.88)} M${at(-0.055, 0.94)} L${at(-0.064, 0.87)} M${at(-0.048, 0.945)} L${at(-0.052, 0.875)}" fill="none" stroke="${solid ?? tint(tc, tc === '#2a2422' ? 0.4 : -0.55)}" stroke-width="${n(s * 0.007)}" stroke-opacity="0.75" stroke-linecap="round"/>`);
      // a moustache
      fronts.push(`<path d="M${at(-0.022, 0.9)} Q${at(0, 0.91)} ${at(0.022, 0.9)}" fill="none" stroke="${pick(hair, i)}" stroke-width="${n(s * 0.009)}" stroke-linecap="round"/>`);
    }
    fronts.push(...hands);
  }
  // the leader's scarf, catching the wind
  const last = people[people.length - 1];
  const hx = last.x + (0.235 + last.sway) * last.s;
  const hy = last.y - 1.0 * last.s;
  const l = last.s;
  fronts.push(`<path d="M${pt([hx, hy])} C${pt([hx + l * 0.12, hy - l * 0.1])} ${pt([hx + l * 0.22, hy + l * 0.04])} ${pt([hx + l * 0.36, hy - l * 0.02])} C${pt([hx + l * 0.3, hy + l * 0.08])} ${pt([hx + l * 0.32, hy + l * 0.14])} ${pt([hx + l * 0.27, hy + l * 0.17])} C${pt([hx + l * 0.18, hy + l * 0.1])} ${pt([hx + l * 0.1, hy + l * 0.08])} ${pt([hx, hy])} Z" fill="${solid ? scarf : fill(scarf)}"/>`);
  if (shadows.length) cv.add(`<g fill="${shadow.colour}" fill-opacity="${n(shadow.opacity)}">${shadows.join('')}</g>`);
  cv.add(backs.join('') + bodies.join('') + fronts.join(''));
}
