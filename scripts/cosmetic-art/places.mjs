/**
 * Kurdish places, drawn as they stand against the sky: the palace of Ishak
 * Pasha under Agirî, the citadel of Hewlêr on its mound, the Delal bridge at
 * Zaxo, Amêdî on its cliff-top, Akre lit up the mountainside on Newroz night,
 * a Hewraman village stepped up its slope — and the summer camp's black tents.
 *
 * Each takes where it stands and how big it is, and colours for its shadowed
 * and its lit faces, so the same drawing serves a silhouette at sunset and a
 * sunlit morning. Lit windows, where a place has them, take `lights`.
 */
import { between, n, pt } from './kit.mjs';

const rect = (x, y, w, h, fill) => `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${fill}"/>`;

/** Crenellations along the top of a wall from x0 to x1 at y. */
function crenels(x0, x1, y, size, fill) {
  const out = [];
  for (let x = x0; x < x1 - size * 0.5; x += size * 2) out.push(rect(x, y - size, size, size + 1, fill));
  return out.join('');
}

/** A dome on a drum: centre x, the drum's foot at y, radius r. */
function dome(x, y, r, fill, lit) {
  return (
    rect(x - r * 0.92, y - r * 0.55, r * 1.84, r * 0.56, fill) +
    `<path d="M${pt([x - r, y - r * 0.5])} C${pt([x - r, y - r * 1.55])} ${pt([x + r, y - r * 1.55])} ${pt([x + r, y - r * 0.5])} Z" fill="${fill}"/>` +
    (lit ? `<path d="M${pt([x - r * 0.98, y - r * 0.55])} C${pt([x - r * 0.95, y - r * 1.35])} ${pt([x - r * 0.2, y - r * 1.4])} ${pt([x, y - r * 1.3])} C${pt([x - r * 0.45, y - r * 1.2])} ${pt([x - r * 0.7, y - r * 0.9])} ${pt([x - r * 0.6, y - r * 0.55])} Z" fill="${lit}"/>` : '') +
    `<path d="M${pt([x, y - r * 1.3])} L${pt([x, y - r * 1.62])}" stroke="${fill}" stroke-width="${n(r * 0.08)}"/>`
  );
}

/**
 * The palace of Ishak Pasha, below Agirî: a rocky spur, walls, the great
 * gate, the domed mosque with its striped minaret, the harem's halls.
 * `w` is its width; it stands on (x, y).
 */
export function ishakPasha({ x, y, w, fill, lit = null, rock = fill, snow = null }) {
  const k = w / 400;
  const X = (u) => x + (u - 200) * k;
  const Y = (v) => y - v * k;
  const out = [];
  // the spur of rock it is built on
  out.push(`<path d="M${pt([X(-40), Y(0)])} C${pt([X(10), Y(24)])} ${pt([X(60), Y(34)])} ${pt([X(120), Y(38)])} L${pt([X(330), Y(40)])} C${pt([X(380), Y(30)])} ${pt([X(420), Y(14)])} ${pt([X(450), Y(0)])} Z" fill="${rock}"/>`);
  // the long outer wall, battlemented
  out.push(rect(X(0), Y(70), 400 * k, 34 * k, fill) + crenels(X(0), X(400), Y(70), 6 * k, fill));
  // the great gate: a tall block with its pointed arch
  out.push(rect(X(18), Y(128), 46 * k, 92 * k, fill));
  out.push(crenels(X(18), X(64), Y(128), 5 * k, fill));
  if (lit) out.push(`<path d="M${pt([X(30), Y(40)])} L${pt([X(30), Y(92)])} Q${pt([X(41), Y(110)])} ${pt([X(52), Y(92)])} L${pt([X(52), Y(40)])} Z" fill="${lit}" fill-opacity="0.45"/>`);
  // the main halls
  out.push(rect(X(64), Y(108), 120 * k, 72 * k, fill) + crenels(X(64), X(184), Y(108), 5 * k, fill));
  // the mosque's dome
  out.push(dome(X(230), Y(110), 34 * k, fill, lit));
  out.push(rect(X(184), Y(112), 92 * k, 76 * k, fill));
  // the minaret, slender and banded
  out.push(rect(X(282), Y(212), 12 * k, 180 * k, fill));
  out.push(rect(X(278), Y(176), 20 * k, 6 * k, fill));
  out.push(`<path d="M${pt([X(282), Y(212)])} L${pt([X(288), Y(236)])} L${pt([X(294), Y(212)])} Z" fill="${fill}"/>`);
  if (lit) for (let v = 40; v < 200; v += 22) out.push(rect(X(282), Y(v + 6), 4 * k, 8 * k, lit));
  // the harem's block and the little ribbed dome of the tomb
  out.push(rect(X(298), Y(96), 90 * k, 62 * k, fill) + crenels(X(298), X(388), Y(96), 5 * k, fill));
  out.push(`<path d="M${pt([X(330), Y(96)])} L${pt([X(343), Y(124)])} L${pt([X(356), Y(96)])} Z" fill="${fill}"/>`);
  // the arched windows of the halls, in rows
  if (lit) {
    for (let u = 76; u < 180; u += 16) out.push(rect(X(u), Y(84), 5 * k, 12 * k, lit));
    for (let u = 306; u < 380; u += 14) out.push(rect(X(u), Y(76), 4 * k, 10 * k, lit));
  }
  if (snow) out.push(rect(X(0), Y(72), 400 * k, 2.2 * k, snow) + rect(X(64), Y(110), 120 * k, 2.4 * k, snow) + rect(X(298), Y(98), 90 * k, 2.4 * k, snow));
  return out.join('');
}

/**
 * The citadel of Hewlêr: a broad mound with steep sides, its rim walled by
 * the backs of houses, the great gate in front with the ramp running down.
 */
export function citadel(rnd, { x, y, w, fill, lights = null }) {
  const h = w * 0.13;
  const top = y - h;
  const out = [];
  out.push(`<path d="M${pt([x - w * 0.58, y])} C${pt([x - w * 0.5, y - h * 0.4])} ${pt([x - w * 0.47, top + h * 0.1])} ${pt([x - w * 0.42, top])} L${pt([x + w * 0.42, top])} C${pt([x + w * 0.47, top + h * 0.1])} ${pt([x + w * 0.5, y - h * 0.4])} ${pt([x + w * 0.58, y])} Z" fill="${fill}"/>`);
  // houses along the rim, shoulder to shoulder, of different heights
  let u = x - w * 0.42;
  const windows = [];
  while (u < x + w * 0.42) {
    const hw = w * between(rnd, 0.018, 0.04);
    const hh = w * between(rnd, 0.022, 0.05);
    out.push(rect(u, top - hh, hw + 1, hh + 2, fill));
    if (lights && rnd() < 0.35) windows.push(rect(u + hw * 0.35, top - hh * 0.65, hw * 0.2, hh * 0.25, lights));
    u += hw;
  }
  // a minaret and a dome above the roofs
  out.push(rect(x - w * 0.18, top - w * 0.14, w * 0.012, w * 0.14, fill));
  out.push(`<path d="M${pt([x - w * 0.186, top - w * 0.14])} L${pt([x - w * 0.174, top - w * 0.165])} L${pt([x - w * 0.162, top - w * 0.14])} Z" fill="${fill}"/>`);
  out.push(`<path d="M${pt([x + w * 0.2, top - w * 0.05])} C${pt([x + w * 0.2, top - w * 0.1])} ${pt([x + w * 0.26, top - w * 0.1])} ${pt([x + w * 0.26, top - w * 0.05])} Z" fill="${fill}"/>`);
  // the great gate, standing proud of the rim, and the ramp
  out.push(rect(x - w * 0.035, top - w * 0.085, w * 0.07, w * 0.085 + 2, fill));
  out.push(`<path d="M${pt([x - w * 0.045, top - w * 0.085])} L${pt([x - w * 0.045, top - w * 0.095])} L${pt([x + w * 0.045, top - w * 0.095])} L${pt([x + w * 0.045, top - w * 0.085])} Z" fill="${fill}"/>`);
  out.push(`<path d="M${pt([x - w * 0.03, top + 2])} L${pt([x - w * 0.16, y])} L${pt([x - w * 0.02, y])} L${pt([x + w * 0.03, top + 2])} Z" fill="${fill}"/>`);
  if (lights) {
    out.push(`<path d="M${pt([x - w * 0.014, top])} L${pt([x - w * 0.014, top - w * 0.04])} Q${pt([x, top - w * 0.058])} ${pt([x + w * 0.014, top - w * 0.04])} L${pt([x + w * 0.014, top])} Z" fill="${lights}"/>`);
    out.push(...windows);
  }
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
