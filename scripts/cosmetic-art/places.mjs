/**
 * Kurdish places, drawn as they stand against the sky: the citadel of Hewlêr
 * on its mound, the Delal bridge at Zaxo, Amêdî on its cliff-top, Akre lit up
 * the mountainside on Newroz night, a Hewraman village stepped up its slope —
 * and the summer camp's black tents.
 *
 * Each takes where it stands and how big it is, and colours for its shadowed
 * and its lit faces, so the same drawing serves a silhouette at sunset and a
 * sunlit morning. Lit windows, where a place has them, take `lights`.
 */
import { between, n, pt } from './kit.mjs';

const rect = (x, y, w, h, fill) => `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${fill}"/>`;

/**
 * The citadel of Hewlêr: a broad mound with steep sides, its rim walled by
 * the backs of houses, the great gate in front with the ramp running down.
 *
 * In one `fill` it is a silhouette, mound and all. Given `faces` it is in
 * daylight, and only what is built is drawn (the mound is the painter's):
 * every house's back in one of `faces.wall`, lit down its left side in
 * `faces.edge` and shadowed down its right in `faces.dark`, with its small
 * windows in `faces.window`.
 */
export function citadel(rnd, { x, y, w, fill, lights = null, faces = null }) {
  const h = w * 0.13;
  const top = y - h;
  const out = [];
  const pick = (list) => list[Math.floor(rnd() * list.length) % list.length];
  if (!faces) out.push(`<path d="M${pt([x - w * 0.58, y])} C${pt([x - w * 0.5, y - h * 0.4])} ${pt([x - w * 0.47, top + h * 0.1])} ${pt([x - w * 0.42, top])} L${pt([x + w * 0.42, top])} C${pt([x + w * 0.47, top + h * 0.1])} ${pt([x + w * 0.5, y - h * 0.4])} ${pt([x + w * 0.58, y])} Z" fill="${fill}"/>`);
  // houses along the rim, shoulder to shoulder, of different heights
  let u = x - w * 0.42;
  const windows = [];
  while (u < x + w * 0.42) {
    if (!faces) {
      const hw = w * between(rnd, 0.018, 0.04);
      const hh = w * between(rnd, 0.022, 0.05);
      out.push(rect(u, top - hh, hw + 1, hh + 2, fill));
      if (lights && rnd() < 0.35) windows.push(rect(u + hw * 0.35, top - hh * 0.65, hw * 0.2, hh * 0.25, lights));
      u += hw;
      continue;
    }
    // in daylight the backs of the houses stand tall, one wall of brick from end to end
    const hw = w * between(rnd, 0.016, 0.034);
    const hh = w * between(rnd, 0.036, 0.064);
    out.push(rect(u, top - hh, hw + 1, hh + 3, pick(faces.wall)));
    out.push(rect(u, top - hh, Math.max(0.8, hw * 0.1), hh + 3, faces.edge));
    if (rnd() < 0.5) out.push(rect(u + hw * 0.86, top - hh, hw * 0.14 + 1, hh + 3, faces.dark));
    // a parapet's shadow along the top, and the windows: small and deep, in rows
    out.push(rect(u, top - hh, hw + 1, Math.max(0.8, hh * 0.05), faces.dark));
    const rows = Math.max(1, Math.floor(hh / (w * 0.015)));
    for (let k = 0; k < rows; k++) {
      for (let c = 0; c < (hw > w * 0.026 ? 2 : 1); c++) {
        if (rnd() < 0.35) continue;
        const wy = top - hh + hh * (0.18 + (0.7 * k) / rows);
        const lit = lights && rnd() < 0.1;
        windows.push(rect(u + hw * (0.22 + c * 0.42) + between(rnd, -1, 1), wy, Math.max(1, hw * 0.13), Math.max(1.4, w * 0.006), lit ? lights : faces.window));
      }
    }
    u += hw;
  }
  const solid = faces ? faces.wall[0] : fill;
  const shade = faces ? faces.dark : fill;
  // a minaret and a dome above the roofs
  if (!faces) {
    out.push(rect(x - w * 0.18, top - w * 0.14, w * 0.012, w * 0.14, solid));
    out.push(`<path d="M${pt([x - w * 0.186, top - w * 0.14])} L${pt([x - w * 0.174, top - w * 0.165])} L${pt([x - w * 0.162, top - w * 0.14])} Z" fill="${solid}"/>`);
  } else {
    // the shaft tapering a little, its balcony on corbels, the cap over a lantern
    const mx = x - w * 0.174;
    const mh = w * 0.15;
    out.push(`<path d="M${pt([mx - w * 0.009, top])} L${pt([mx - w * 0.007, top - mh])} L${pt([mx + w * 0.007, top - mh])} L${pt([mx + w * 0.009, top])} Z" fill="${solid}"/>`);
    out.push(`<path d="M${pt([mx + w * 0.002, top])} L${pt([mx + w * 0.002, top - mh])} L${pt([mx + w * 0.007, top - mh])} L${pt([mx + w * 0.009, top])} Z" fill="${shade}"/>`);
    out.push(`<path d="M${pt([mx - w * 0.008, top - mh * 0.8])} L${pt([mx - w * 0.013, top - mh * 0.84])} L${pt([mx + w * 0.013, top - mh * 0.84])} L${pt([mx + w * 0.008, top - mh * 0.8])} Z" fill="${faces.edge}"/>`);
    out.push(rect(mx - w * 0.013, top - mh * 0.87, w * 0.026, mh * 0.03, shade));
    out.push(rect(mx - w * 0.005, top - mh * 1.06, w * 0.01, mh * 0.08, solid));
    out.push(`<path d="M${pt([mx - w * 0.008, top - mh * 1.06])} L${pt([mx, top - mh * 1.2])} L${pt([mx + w * 0.008, top - mh * 1.06])} Z" fill="${shade}"/>`);
  }
  out.push(`<path d="M${pt([x + w * 0.2, top - w * 0.05])} C${pt([x + w * 0.2, top - w * 0.1])} ${pt([x + w * 0.26, top - w * 0.1])} ${pt([x + w * 0.26, top - w * 0.05])} Z" fill="${solid}"/>`);
  if (faces) out.push(`<path d="M${pt([x + w * 0.23, top - w * 0.05])} C${pt([x + w * 0.245, top - w * 0.06])} ${pt([x + w * 0.25, top - w * 0.085])} ${pt([x + w * 0.23, top - w * 0.088])} C${pt([x + w * 0.255, top - w * 0.09])} ${pt([x + w * 0.26, top - w * 0.07])} ${pt([x + w * 0.26, top - w * 0.05])} Z" fill="${shade}"/>`);
  // the great gate, standing proud of the rim, and the ramp
  out.push(rect(x - w * 0.035, top - w * 0.085, w * 0.07, w * 0.085 + 2, solid));
  out.push(`<path d="M${pt([x - w * 0.045, top - w * 0.085])} L${pt([x - w * 0.045, top - w * 0.095])} L${pt([x + w * 0.045, top - w * 0.095])} L${pt([x + w * 0.045, top - w * 0.085])} Z" fill="${solid}"/>`);
  if (faces) out.push(rect(x + w * 0.028, top - w * 0.085, w * 0.007, w * 0.085 + 2, shade) + rect(x - w * 0.035, top - w * 0.085, w * 0.004, w * 0.085 + 2, faces.edge));
  out.push(`<path d="M${pt([x - w * 0.03, top + 2])} L${pt([x - w * 0.16, y])} L${pt([x - w * 0.02, y])} L${pt([x + w * 0.03, top + 2])} Z" fill="${faces ? pick(faces.wall) : fill}"/>`);
  const arch = `M${pt([x - w * 0.014, top])} L${pt([x - w * 0.014, top - w * 0.04])} Q${pt([x, top - w * 0.058])} ${pt([x + w * 0.014, top - w * 0.04])} L${pt([x + w * 0.014, top])} Z`;
  if (faces) out.push(`<path d="${arch}" fill="${faces.window}"/>`);
  if (lights) {
    if (!faces) out.push(`<path d="${arch}" fill="${lights}"/>`);
    out.push(...windows);
  } else if (faces) out.push(...windows);
  return out.join('');
}

/**
 * The Delal bridge: long ramps of stone climbing from both banks to a crown
 * over one tall arch. `span` is the arch's width; the bridge is about three
 * and a half times that. Returns the masonry and the arch's opening, so the
 * opening can be cut out of it (and show whatever is behind).
 */
export function delal({ x, y, span, fill, lit = null, courses = null }) {
  const archH = span * 0.82;
  const apex = archH + span * 0.22;
  const out = [];
  const body = `M${pt([x - span * 1.95, y + 4])} L${pt([x - span * 1.75, y - span * 0.13])} C${pt([x - span * 1.0, y - span * 0.3])} ${pt([x - span * 0.32, y - apex])} ${pt([x, y - apex - span * 0.025])} C${pt([x + span * 0.32, y - apex])} ${pt([x + span * 1.0, y - span * 0.3])} ${pt([x + span * 1.75, y - span * 0.13])} L${pt([x + span * 1.95, y + 4])} Z`;
  out.push(`<path d="${body}" fill="${fill}"/>`);
  // the parapet: a low wall along the top, a shade lighter where the light catches it
  const top = `M${pt([x - span * 1.75, y - span * 0.13])} C${pt([x - span * 1.0, y - span * 0.3])} ${pt([x - span * 0.32, y - apex])} ${pt([x, y - apex - span * 0.025])} C${pt([x + span * 0.32, y - apex])} ${pt([x + span * 1.0, y - span * 0.3])} ${pt([x + span * 1.75, y - span * 0.13])}`;
  out.push(`<path d="${top}" fill="none" stroke="${fill}" stroke-width="${n(span * 0.05)}" stroke-linejoin="round"/>`);
  if (lit) out.push(`<path d="${top}" fill="none" stroke="${lit}" stroke-width="${n(span * 0.012)}" stroke-opacity="0.7" transform="translate(0 ${n(-span * 0.02)})"/>`);
  if (courses) {
    // the courses of stone, faint
    const lines = [];
    for (let v = 0.06; v < 0.9; v += 0.06) lines.push(`M${pt([x - span * 1.9, y - apex * v])} L${pt([x + span * 1.9, y - apex * v])}`);
    out.push(`<path d="${lines.join(' ')}" stroke="${courses}" stroke-width="1" stroke-opacity="0.25"/>`);
  }
  const arch = `M${pt([x - span * 0.5, y + 6])} L${pt([x - span * 0.5, y - archH * 0.42])} C${pt([x - span * 0.5, y - archH * 0.86])} ${pt([x - span * 0.16, y - archH])} ${pt([x, y - archH * 1.03])} C${pt([x + span * 0.16, y - archH])} ${pt([x + span * 0.5, y - archH * 0.86])} ${pt([x + span * 0.5, y - archH * 0.42])} L${pt([x + span * 0.5, y + 6])} Z`;
  return { body: out.join(''), arch };
}

/**
 * Amêdî on its cliff-top: a flat-topped crag with sheer sides, the town
 * along its rim, the old minaret standing up from the middle.
 */
export function amedi(rnd, { x, y, w, fill, lights = null }) {
  const h = w * 0.3;
  const top = y - h;
  const out = [];
  // the crag, sheer, a scree at its foot
  const left = [];
  const right = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    // sheer near the top, spreading into scree toward the foot
    left.push([x - w * 0.46 - w * 0.04 * Math.sin(t * 3) + between(rnd, -4, 4) - t * t * w * 0.3, top + h * t]);
    right.push([x + w * 0.46 + w * 0.03 * Math.sin(t * 2.6) + between(rnd, -4, 4) + t * t * w * 0.28, top + h * t]);
  }
  out.push(`<path d="M${pt([x - w * 0.9, y + 2])} L${left.reverse().map(pt).join(' L')} L${right.map(pt).join(' L')} L${pt([x + w * 0.9, y + 2])} Z" fill="${fill}"/>`);
  // houses on the rim
  let u = x - w * 0.46;
  const windows = [];
  while (u < x + w * 0.45) {
    const hw = w * between(rnd, 0.025, 0.05);
    const hh = w * between(rnd, 0.02, 0.045);
    out.push(rect(u, top - hh, hw + 1, hh + 2, fill));
    if (lights && rnd() < 0.55) windows.push(rect(u + hw * 0.3, top - hh * 0.62, Math.max(1.6, hw * 0.18), Math.max(2, hh * 0.28), lights));
    u += hw;
  }
  // the minaret, tall, with its balcony
  out.push(rect(x - w * 0.012, top - w * 0.26, w * 0.024, w * 0.26 + 2, fill));
  out.push(rect(x - w * 0.022, top - w * 0.2, w * 0.044, w * 0.012, fill));
  out.push(`<path d="M${pt([x - w * 0.014, top - w * 0.26])} L${pt([x, top - w * 0.3])} L${pt([x + w * 0.014, top - w * 0.26])} Z" fill="${fill}"/>`);
  if (lights) out.push(...windows, rect(x - w * 0.006, top - w * 0.215, w * 0.012, w * 0.006, lights));
  return out.join('');
}

/**
 * Akre on Newroz night: the mountain behind the town, and up it, lines of
 * torches carried by the climbers, zig-zagging to the fire at the top — bunched
 * where the path is steep, strung out where it is easy, each flame a little
 * different. Returns the torches, and a glow for each, to be laid in as light.
 */
export function akreTorches(rnd, { x, y, top, width, paths = 3, colour = '#ffb347' }) {
  const torches = [];
  for (let p = 0; p < paths; p++) {
    let px = x + (p - (paths - 1) / 2) * width * 0.35;
    let py = y;
    const legs = Math.round(between(rnd, 6, 9));
    const legH = (y - top) / legs;
    for (let l = 0; l < legs; l++) {
      const dir = l % 2 === 0 ? 1 : -1;
      const len = width * between(rnd, 0.12, 0.22) * (1 - l / (legs + 2));
      const bow = between(rnd, -0.25, 0.25) * legH;
      let t = 0;
      while (t < 1) {
        const bx = px + dir * len * t;
        const by = py - legH * t + Math.sin(t * Math.PI) * bow;
        torches.push([bx + between(rnd, -1.2, 1.2), by + between(rnd, -1.2, 1.2), between(rnd, 0.8, 2)]);
        // climbers bunch and string out: the gaps between torches vary
        t += between(rnd, 3, 13) / len;
      }
      px += dir * len;
      py -= legH;
    }
  }
  const hot = ['#fff2c8', colour, colour, '#ff8a3a'];
  const dots = torches.map(([tx, ty, r]) => `<circle cx="${n(tx)}" cy="${n(ty)}" r="${n(r)}" fill="${hot[Math.floor(rnd() * hot.length) % hot.length]}"/>`).join('');
  const glow = torches.map(([tx, ty, r]) => `<circle cx="${n(tx)}" cy="${n(ty)}" r="${n(r * 3.2)}"/>`).join('');
  return { dots, glow: `<g fill="${colour}" fill-opacity="0.35">${glow}</g>`, summit: [x + between(rnd, -10, 10), top] };
}

/**
 * A Hewraman village stepped up a mountainside: flat-roofed stone houses in
 * tiers, each tier's roofs the yards of the one above, the whole a ragged
 * cluster climbing the slope rather than a block — houses of every width, an
 * alley here and there, a walnut between them, and at night windows lit.
 *
 * The village lies along the line from (x0, y0) up to (x1, y1), bowed up by
 * `bow` in the middle, `thick` deep there and thinning to its ends; nothing
 * is built above `ground(x)`, the line of the slope. `light` is the side the
 * light comes from (-1 left, 1 right). Returns the houses, and the glow of the
 * lit windows, to lay in as light.
 */
export function hewraman(rnd, { x0, y0, x1, y1, thick, bow = 0, ground = () => -Infinity, house, wall, wallLit, wallDark, roof, door, lights = null, lit = 0.45, light = -1, tree = null }) {
  const tierH = house * 0.6;
  // its line up the slope, bowed by `bow` pixels at the middle
  const spine = (u) => {
    const t = (u - x0) / (x1 - x0);
    return y0 + (y1 - y0) * t - bow * Math.sin(Math.PI * Math.max(0, Math.min(1, t)));
  };
  // the edge of the village wanders: a smooth seeded wobble along its length
  const knots = Array.from({ length: 11 }, () => between(rnd, 0.45, 1.2));
  const wobble = (u) => {
    const t = Math.max(0, Math.min(0.9999, (u - x0) / (x1 - x0))) * (knots.length - 1);
    const i = Math.floor(t);
    const f = t - i;
    return knots[i] + (knots[i + 1] - knots[i]) * f * f * (3 - 2 * f);
  };
  const halfAt = (u) => {
    const t = (u - x0) / (x1 - x0);
    return t <= 0 || t >= 1 ? 0 : thick * 0.5 * Math.sin(Math.PI * t) ** 0.55 * wobble(u);
  };
  const out = [];
  const glows = [];
  const top = Math.min(y0, y1) - thick;
  const bottom = Math.max(y0, y1) + thick;
  for (let ty = top; ty <= bottom; ty += tierH) {
    let u = x0 + between(rnd, -house, 0);
    while (u < x1) {
      const hw = house * between(rnd, 0.75, 1.7);
      const mid = u + hw / 2;
      const inside = Math.abs(ty - spine(mid)) < halfAt(mid) && ty > ground(mid) + house * 0.9;
      if (inside && tree && rnd() < 0.07) {
        // a walnut in a yard: a dark round crown over the roofs below it
        const r = house * between(rnd, 0.55, 0.85);
        out.push(`<path d="M${pt([mid, ty])} L${pt([mid, ty - r])}" stroke="${tree}" stroke-width="${n(house * 0.12)}"/>`);
        out.push(`<circle cx="${n(mid - r * 0.35)}" cy="${n(ty - r * 1.2)}" r="${n(r * 0.75)}" fill="${tree}"/><circle cx="${n(mid + r * 0.3)}" cy="${n(ty - r * 1.35)}" r="${n(r * 0.8)}" fill="${tree}"/><circle cx="${n(mid)}" cy="${n(ty - r * 1.75)}" r="${n(r * 0.65)}" fill="${tree}"/>`);
      } else if (inside && rnd() > 0.05) {
        const storeys = rnd() < 0.18 ? 1.5 : 1;
        const hh = house * between(rnd, 0.55, 0.8) * storeys;
        const y = ty - hh;
        const deep = hh + tierH * 1.3;
        out.push(rect(u, y, hw, deep, rnd() < 0.55 ? wall : wallLit));
        const side = hw * 0.18;
        out.push(rect(light < 0 ? u + hw - side : u, y, side, deep, wallDark));
        // the flat roof of earth on its beams, the beam ends showing under it
        out.push(rect(u - 1.2, y - 2.6, hw + 2.4, 3.2, roof));
        const ends = [];
        for (let b = 4; b < hw - 2; b += 6.5) ends.push(rect(u + b, y + 1, 1.3, 1.3, door));
        out.push(ends.join(''));
        const openings = Math.max(1, Math.round((hw - side) / (house * 0.5)));
        for (let k = 0; k < openings; k++) {
          const ox = u + (light < 0 ? 0 : side) + ((hw - side) * (k + 0.5)) / openings - house * 0.06;
          const isDoor = k === 0 && rnd() < 0.35;
          const oh = isDoor ? hh * 0.5 : house * 0.17;
          const oy = isDoor ? ty - oh : y + hh * 0.3;
          const on = lights && !isDoor && rnd() < lit;
          out.push(rect(ox, oy, house * 0.12, oh, on ? lights : door));
          if (on) glows.push(`<circle cx="${n(ox + house * 0.06)}" cy="${n(oy + oh / 2)}" r="${n(house * 0.5)}"/>`);
        }
      }
      u += hw + (rnd() < 0.1 ? between(rnd, house * 0.3, house * 0.9) : between(rnd, -1, house * 0.06));
    }
  }
  return { houses: out.join(''), glow: lights ? `<g fill="${lights}" fill-opacity="0.25">${glows.join('')}</g>` : '' };
}

/**
 * The black tent of the summer camp (reşmal): a long low roof of woven goat
 * hair, peaked over its poles and sagging between them, guyed out to pegs; and
 * along its front the reed screen (çît), its reeds wrapped in coloured wool to
 * make zig-zags. `lamp` lights the doorway from inside; `screen` colours the
 * çît (null leaves it out, for a tent in silhouette).
 */
export function tent({ x, y, w, fill, lamp = null, screen = ['#d8c8a0', '#c8302a', '#f0b42a', '#f6f0e2'] }) {
  const h = w * 0.34;
  const eave = y - h * 0.5;
  const poles = Math.max(2, Math.round(w / 34));
  // the roof: peaked over each pole, sagging between, down to the eaves at each end
  const ridge = [];
  for (let i = 0; i < poles; i++) {
    const px = x - w * 0.38 + (w * 0.76 * i) / (poles - 1);
    ridge.push(px);
  }
  let d = `M${pt([x - w / 2, eave])} L${pt([ridge[0], y - h])}`;
  for (let i = 1; i < ridge.length; i++) {
    const mid = (ridge[i - 1] + ridge[i]) / 2;
    d += ` Q${pt([mid, y - h * 0.72])} ${pt([ridge[i], y - h])}`;
  }
  d += ` L${pt([x + w / 2, eave])} L${pt([x + w * 0.53, y])} L${pt([x - w * 0.53, y])} Z`;
  const out = [`<path d="${d}" fill="${fill}"/>`];
  // guy ropes from the eaves and the poles out to their pegs
  out.push(`<path d="M${pt([x - w / 2, eave])} L${pt([x - w * 0.7, y + 1])} M${pt([x + w / 2, eave])} L${pt([x + w * 0.7, y + 1])} M${pt([ridge[0], y - h])} L${pt([x - w * 0.64, y + 1])} M${pt([ridge[ridge.length - 1], y - h])} L${pt([x + w * 0.64, y + 1])}" stroke="${fill}" stroke-width="${n(Math.max(0.8, w * 0.012))}" stroke-opacity="0.8"/>`);
  const door = [x - w * 0.07, x + w * 0.07];
  if (screen) {
    // the çît: a band of reed under the eaves, patterned in rows of zig-zags, a gap for the door
    const top = eave + h * 0.06;
    const bandH = y - top;
    const [reed, ...wool] = screen;
    const parts = [];
    for (const [a, b] of [[x - w * 0.47, door[0]], [door[1], x + w * 0.47]]) {
      parts.push(`<rect x="${n(a)}" y="${n(top)}" width="${n(b - a)}" height="${n(bandH)}" fill="${reed}"/>`);
      const rows = 2;
      for (let r = 0; r < rows; r++) {
        const ry = top + bandH * (0.22 + r * 0.42);
        const amp = bandH * 0.13;
        const step = Math.max(3, bandH * 0.3);
        let zig = `M${pt([a, ry])}`;
        for (let zx = a, k = 0; zx < b; zx += step, k++) zig += ` L${pt([Math.min(b, zx + step), ry + (k % 2 ? -amp : amp)])}`;
        parts.push(`<path d="${zig}" fill="none" stroke="${wool[r % wool.length]}" stroke-width="${n(Math.max(0.9, bandH * 0.12))}"/>`);
      }
      // the reeds themselves, upright
      const reeds = [];
      for (let rx = a + 2; rx < b; rx += 3.2) reeds.push(`M${pt([rx, top])} L${pt([rx, y])}`);
      parts.push(`<path d="${reeds.join(' ')}" stroke="#000" stroke-opacity="0.12" stroke-width="0.7"/>`);
    }
    out.push(parts.join(''));
  }
  out.push(`<rect x="${n(door[0])}" y="${n(eave + h * 0.04)}" width="${n(door[1] - door[0])}" height="${n(y - eave - h * 0.04)}" fill="${lamp ?? '#000'}" fill-opacity="${lamp ? 1 : 0.55}"/>`);
  return out.join('');
}
