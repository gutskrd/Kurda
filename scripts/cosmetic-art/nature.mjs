/**
 * Living things and weather, for the backgrounds: trees grown branch by
 * branch, grass and reeds blade by blade, flowers, fog and cloud made from
 * fractal noise, stars, nebulae, motes of dust, a bonfire and its embers.
 *
 * Every function returns SVG markup (or adds it to a Canvas) and takes its
 * randomness from the seeded generator it is given. Trees are grown rather
 * than drawn: a trunk splits into branches that split again, each tapering,
 * with leaves clustered at the tips — so a tree against the light is a lace of
 * gaps the light can come through, which is what the compositor's light
 * shafts are made from.
 */
import { between, linear, n, pt, radialAt } from './kit.mjs';

/** A noise frequency, written finely enough: two decimals would turn 0.004 into 0, and the noise into stripes. */
const freqOf = (v) => String(Math.round(v * 1e5) / 1e5);

// ───────────────────────────────────────────────────────────── trees

/**
 * How each kind grows. `trunk` and `width` are fractions of the tree's
 * height; each branch splits into `kids` that spread by `spread` radians and
 * are `ratio` as long and `thin` as thick; `up` pulls branches back toward
 * upright and `limit` is as far from upright as they may lean; `lead` keeps a
 * leading shoot going up the middle. Foliage is `clumps` per twig, spread
 * over `reach` of the height, each clump `size` (min, max) of the height
 * across; twigs `leafDepth` levels from the tips carry clumps along them too.
 */
const KINDS = {
  // the Zagros oak: a short stout trunk, a rounded crown
  oak: { trunk: 0.24, width: 0.06, depth: 6, kids: [2, 3], spread: [0.34, 0.6], ratio: [0.64, 0.78], thin: 0.68, clumps: 2, reach: 0.05, size: [0.03, 0.055], up: 0.45, limit: 1.2, leafDepth: 2, lead: true },
  // walnut: taller, its crown wider and more open
  walnut: { trunk: 0.3, width: 0.055, depth: 6, kids: [2, 3], spread: [0.36, 0.62], ratio: [0.64, 0.78], thin: 0.66, clumps: 2, reach: 0.055, size: [0.03, 0.055], up: 0.4, limit: 1.25, leafDepth: 2, lead: true },
  poplar: { trunk: 0.12, width: 0.03, depth: 3, kids: [2, 2], spread: [0.08, 0.22], ratio: [0.78, 0.9], thin: 0.72, clumps: 2, reach: 0.035, size: [0.03, 0.05], up: 0.9, limit: 0.5 },
  // almond and Judas tree: open, airy, the blossom on bare twigs
  blossom: { trunk: 0.22, width: 0.045, depth: 6, kids: [2, 3], spread: [0.32, 0.62], ratio: [0.64, 0.8], thin: 0.62, clumps: 3, reach: 0.045, size: [0.014, 0.028], up: 0.4, limit: 1.25, leafDepth: 2, lead: true },
  // a tall thin trunk with short boughs near the top, for misty woods
  slender: { trunk: 0.66, width: 0.02, depth: 4, kids: [2, 3], spread: [0.2, 0.42], ratio: [0.56, 0.7], thin: 0.62, clumps: 3, reach: 0.05, size: [0.02, 0.04], up: 0.6, limit: 1.0, leafDepth: 2 },
};

const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/**
 * A closed, softly irregular blob round (cx, cy), always wound the same way
 * (so many of them in one path add up, never cut holes in each other).
 */
export function blob(rnd, cx, cy, rx, ry, rough = 0.35, verts = 9) {
  const pts = [];
  const a0 = rnd() * Math.PI * 2;
  for (let i = 0; i < verts; i++) {
    const a = a0 + (i / verts) * Math.PI * 2;
    const k = 1 - rough / 2 + rnd() * rough;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  let d = `M${pt(mid(pts[verts - 1], pts[0]))}`;
  for (let i = 0; i < verts; i++) d += ` Q${pt(pts[i])} ${pt(mid(pts[i], pts[(i + 1) % verts]))}`;
  return `${d} Z`;
}

/** A tapered, slightly bent segment between two points, always wound the same way. */
function limb(x0, y0, w0, x1, y1, w1, bend) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const mx = (x0 + x1) / 2 + nx * bend;
  const my = (y0 + y1) / 2 + ny * bend;
  const wm = (w0 + w1) / 2;
  return `M${pt([x0 + (nx * w0) / 2, y0 + (ny * w0) / 2])} Q${pt([mx + (nx * wm) / 2, my + (ny * wm) / 2])} ${pt([x1 + (nx * w1) / 2, y1 + (ny * w1) / 2])} L${pt([x1 - (nx * w1) / 2, y1 - (ny * w1) / 2])} Q${pt([mx - (nx * wm) / 2, my - (ny * wm) / 2])} ${pt([x0 - (nx * w0) / 2, y0 - (ny * w0) / 2])} Z`;
}

/**
 * A tree, grown: returns { wood, leaves } markup in the colours given.
 * `leafColour` may be an array, picked from at random per clump (blossom,
 * lit and shaded leaves). Detail follows size: a tree a few pixels high is
 * not grown down to twigs it could never show. `clump` scales the clumps of
 * leaf or blossom (and as many more of them, smaller, fill the same crown).
 */
export function tree(rnd, { x, y, height, kind = 'oak', wood, leafColour, lean = 0, leafiness = 1, needles = false, twig = 4, litColour = null, light = [-1, -1], volume = null, clump = 1 }) {
  const K = KINDS[kind];
  const limbs = [];
  const colours = Array.isArray(leafColour) ? [...leafColour] : [leafColour];
  if (litColour) colours.push(litColour);
  const leaves = colours.map(() => []);
  // volume: [shadow, mid, lit] — each clump is drawn three times, smaller and nearer the light each time,
  // and the clumps are laid back to front, so every one keeps its own shadow under the one before it
  const vol = volume ? { tones: volume, clumps: [] } : null;
  // the crown's middle, roughly, so a clump can tell which side of it it is on
  const crown = [x, y - height * 0.62];
  const ll = Math.hypot(light[0], light[1]) || 1;
  const tip = (tx, ty, scale = 1) => {
    const count = Math.max(1, Math.round((K.clumps * leafiness * between(rnd, 0.7, 1.3)) / (clump * clump)));
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd()) * K.reach * height * scale;
      const r = between(rnd, K.size[0], K.size[1]) * height * scale * clump;
      const cx = tx + Math.cos(a) * d * 1.2;
      const cy = ty + Math.sin(a) * d * 0.8;
      let c = Math.floor(rnd() * (litColour ? colours.length - 1 : colours.length)) % colours.length;
      if (litColour) {
        const facing = ((cx - crown[0]) * light[0] + (cy - crown[1]) * light[1]) / ll / (height * 0.3);
        if (facing + between(rnd, -0.35, 0.35) > 0.25) c = colours.length - 1;
      }
      if (needles) {
        // a pine's crown in mist: flat, ragged layers of needles
        for (let k = 0; k < 3; k++) leaves[c].push(blob(rnd, cx + between(rnd, -r, r), cy + between(rnd, -r * 0.3, r * 0.3), r * between(rnd, 1.1, 1.8), r * between(rnd, 0.32, 0.5), 0.6, 11));
      } else if (vol) {
        const lx = light[0] / ll;
        const ly = light[1] / ll;
        const shapes = [blob(rnd, cx, cy, r, r * 0.85, 0.45), blob(rnd, cx + lx * r * 0.2, cy + ly * r * 0.2, r * 0.78, r * 0.66, 0.5)];
        if (rnd() < 0.85) shapes.push(blob(rnd, cx + lx * r * 0.42, cy + ly * r * 0.42, r * 0.45, r * 0.38, 0.55));
        vol.clumps.push([cy, shapes]);
      } else {
        leaves[c].push(blob(rnd, cx, cy, r, r * 0.85, 0.45));
      }
    }
  };
  const trunkLen = height * K.trunk;
  const trunkW = height * K.width;
  const meanRatio = (K.ratio[0] + K.ratio[1]) / 2;
  // stop splitting once a twig would be shorter than `twig` pixels (more for a tree that will be blurred)
  const depthFor = Math.max(2, Math.min(K.depth, Math.floor(Math.log(twig / Math.max(twig + 0.1, trunkLen)) / Math.log(meanRatio))));
  const grow = (x0, y0, angle, len, width, depth) => {
    const x1 = x0 + Math.sin(angle) * len;
    const y1 = y0 - Math.cos(angle) * len;
    const w1 = width * K.thin;
    limbs.push(limb(x0, y0, width, x1, y1, w1, between(rnd, -0.08, 0.08) * len));
    if (depth <= 0) {
      tip(x1, y1);
      return;
    }
    // the outer branches carry leaves along them too, which is what fills a crown
    if (depth <= (K.leafDepth ?? 1)) tip((x0 + x1) / 2, (y0 + y1) / 2, 0.8);
    const kids = K.kids[0] + Math.floor(rnd() * (K.kids[1] - K.kids[0] + 1));
    for (let k = 0; k < kids; k++) {
      const side = kids === 1 ? 0 : k / (kids - 1) - 0.5;
      const spread = between(rnd, K.spread[0], K.spread[1]);
      // one shoot leads, carrying on upward, which is what rounds a crown off at the top
      const leads = k === Math.floor(kids / 2) && depth > 2 && K.lead;
      let a = leads ? angle * 0.6 + between(rnd, -0.1, 0.1) : angle + side * spread * 2 + between(rnd, -0.12, 0.12);
      // branches bend back toward the light, and never lean past `limit` from upright
      a *= 1 - K.up * 0.35;
      a = Math.max(-K.limit, Math.min(K.limit, a));
      grow(x1, y1, a, len * (leads ? between(rnd, 0.8, 0.92) : between(rnd, K.ratio[0], K.ratio[1])), w1, depth - 1);
    }
  };
  // flare at the root, wound the way the limbs are
  limbs.push(`M${pt([x + trunkW * 1.1, y + 2])} Q${pt([x + trunkW * 0.55, y - trunkW * 0.6])} ${pt([x + trunkW * 0.45, y - trunkW * 1.4])} L${pt([x - trunkW * 0.45, y - trunkW * 1.4])} Q${pt([x - trunkW * 0.55, y - trunkW * 0.6])} ${pt([x - trunkW * 1.1, y + 2])} Z`);
  if (kind === 'slender') {
    // a tall, slightly crooked trunk; short boughs in its top third, each with a tuft
    let px = x;
    let py = y;
    const steps = 12;
    let drift = lean;
    for (let i = 0; i < steps; i++) {
      const seg = height / steps;
      const w0 = trunkW * (1 - (i / steps) * 0.7);
      drift += between(rnd, -0.08, 0.08);
      const nx = px + drift * seg * 0.35;
      const ny = py - seg;
      limbs.push(limb(px, py, w0, nx, ny, w0 * 0.92, 0));
      if (i >= steps * 0.55 && rnd() < 0.8) {
        const sd = rnd() < 0.5 ? -1 : 1;
        const a = sd * between(rnd, 0.6, 1.2);
        const bl = height * between(rnd, 0.06, 0.13) * (1.25 - i / steps);
        const bx = nx + Math.sin(a) * bl;
        const by = ny - Math.cos(a) * bl;
        limbs.push(limb(nx, ny, w0 * 0.5, bx, by, w0 * 0.2, 0));
        tip(bx, by, 1.2);
        tip((nx + bx) / 2, (ny + by) / 2, 0.9);
      }
      px = nx;
      py = ny;
    }
    tip(px, py, 1.3);
  } else if (kind === 'poplar') {
    // a single leader, with short upright branches all the way up
    let px = x;
    let py = y;
    const steps = Math.max(5, Math.min(14, Math.round(height / 14)));
    for (let i = 0; i < steps; i++) {
      const seg = (height * 0.92) / steps;
      const w0 = trunkW * (1 - i / steps);
      const nx = px + lean * seg * 0.1 + between(rnd, -1, 1) * seg * 0.04;
      const ny = py - seg;
      limbs.push(limb(px, py, w0, nx, ny, w0 * 0.9, 0));
      if (i >= 1) {
        const taperK = 1 - i / (steps + 2);
        for (const sd of [-1, 1]) {
          const a = sd * between(rnd, 0.15, 0.35);
          const bl = seg * between(rnd, 1.3, 2) * taperK;
          const bx = nx + Math.sin(a) * bl;
          const by = ny + seg * 0.4 - Math.cos(a) * bl;
          limbs.push(limb(nx, ny + seg * 0.4, w0 * 0.4, bx, by, w0 * 0.15, 0));
          tip(bx, by, 1);
          tip((nx + bx) / 2, (ny + seg * 0.4 + by) / 2, 0.9);
        }
      }
      px = nx;
      py = ny;
    }
    tip(px, py - height * 0.03, 0.8);
  } else {
    grow(x, y, lean, trunkLen, trunkW, depthFor);
  }
  const vols = vol
    ? vol.clumps
        .sort((a, b) => a[0] - b[0])
        .map(([, shapes]) => shapes.map((d, i) => `<path d="${d}" fill="${vol.tones[i]}"/>`).join(''))
        .join('')
    : '';
  return {
    wood: `<path d="${limbs.join(' ')}" fill="${wood}"/>`,
    leaves: colours.map((c, i) => (leaves[i].length ? `<path d="${leaves[i].join(' ')}" fill="${c}"/>` : '')).join('') + vols,
  };
}

/**
 * A conifer as it stands in fog: a narrow spire, its edge ragged with
 * drooping tiers of boughs.
 */
export function pine(rnd, { x, y, height, colour, width = 0.34 }) {
  const left = [];
  const right = [];
  const tiers = Math.round(between(rnd, 12, 17));
  const base = y - height * 0.06;
  for (let i = 0; i <= tiers; i++) {
    const t = i / tiers;
    const ty = base - height * 0.94 * t;
    const reach = height * width * 0.5 * (1 - t) ** 1.05;
    const tierH = (height * 0.94) / tiers;
    for (const [side, list] of [[-1, left], [1, right]]) {
      const r = reach * between(rnd, 0.75, 1.15);
      list.push([x + side * r, ty + tierH * between(rnd, 0.25, 0.5)]);
      list.push([x + side * r * between(rnd, 0.82, 0.95), ty + tierH * 0.05]);
      list.push([x + side * r * between(rnd, 0.35, 0.55), ty - tierH * 0.35]);
    }
  }
  const outline = [[x - height * 0.015, y], ...left, [x, y - height * 1.02], ...right.reverse(), [x + height * 0.015, y]];
  let d = `M${pt(outline[0])}`;
  for (let i = 1; i < outline.length; i++) d += ` L${pt(outline[i])}`;
  return `<path d="${d} Z" fill="${colour}"/>`;
}

/** A tree's markup in one colour (a silhouette). */
export function silhouette(rnd, opts) {
  const t = tree(rnd, { ...opts, wood: opts.colour, leafColour: opts.colour });
  return t.wood + t.leaves;
}

// ───────────────────────────────────────────────────────── grass and reeds

/** Blades of grass along y, `height` tall, leaning with the wind. */
export function grass(rnd, { x0 = -20, x1 = 1300, y, count, height, colours, wind = 0.15, width = 3 }) {
  const byColour = new Map();
  for (let i = 0; i < count; i++) {
    const x = between(rnd, x0, x1);
    const base = y + between(rnd, -height * 0.15, height * 0.25);
    const h = height * between(rnd, 0.45, 1.1);
    const lean = (wind + between(rnd, -0.25, 0.25)) * h;
    const w = width * between(rnd, 0.6, 1.3);
    const c = colours[Math.floor(rnd() * colours.length) % colours.length];
    const d = `M${pt([x - w, base])} Q${pt([x + lean * 0.25, base - h * 0.55])} ${pt([x + lean, base - h])} Q${pt([x + lean * 0.3 + w * 0.4, base - h * 0.5])} ${pt([x + w, base])} Z`;
    byColour.set(c, (byColour.get(c) ?? '') + d);
  }
  return [...byColour].map(([c, d]) => `<path d="${d}" fill="${c}"/>`).join('');
}

/**
 * Tall grass in the wind, for the near ground where every stalk shows: long
 * blades bowing the one way, more at their tips, and here and there (`share`
 * of them) a stalk carrying a seed head in `heads`. Nearer (lower) is taller;
 * `top(x)` is the line of the ground where it is a slope.
 */
export function tallGrass(rnd, { x0 = -20, x1 = 1300, y0, y1, top = null, count, height, colours, heads = null, share = 0.06, wind = 0.35, width = 2.6 }) {
  const byColour = new Map();
  const stalks = [];
  const items = [];
  for (let i = 0; i < count; i++) {
    const t = rnd() ** 1.2;
    const x = between(rnd, x0, x1);
    // on a slope, the grass starts where the ground does
    const from = top ? top(x) : y0;
    items.push([x, from + (y1 - from) * t, t]);
  }
  items.sort((a, b) => a[1] - b[1]);
  for (const [x, y, t] of items) {
    const h = height * (0.35 + 0.65 * t) * between(rnd, 0.55, 1.2);
    const lean = (wind + between(rnd, -0.12, 0.12)) * h;
    const w = width * (0.5 + 0.5 * t) * between(rnd, 0.7, 1.3);
    const c = colours[Math.floor(rnd() * colours.length) % colours.length];
    const d = `M${pt([x - w, y])} Q${pt([x + lean * 0.2, y - h * 0.6])} ${pt([x + lean, y - h])} Q${pt([x + lean * 0.25 + w * 0.4, y - h * 0.55])} ${pt([x + w, y])} Z`;
    byColour.set(c, (byColour.get(c) ?? '') + d);
    if (heads && rnd() < share) {
      // a stalk with its seed head nodding at the top
      const hx = x + lean * 1.05;
      const hy = y - h * 1.08;
      stalks.push(`M${pt([x, y])} Q${pt([x + lean * 0.3, y - h * 0.65])} ${pt([hx, hy])}`);
      const grains = [];
      for (let k = 0; k < 6; k++) {
        const a = -Math.PI / 2 + wind * 1.4 + between(rnd, -0.5, 0.5);
        const r = h * 0.032 * (1 - k / 8);
        grains.push(`<ellipse cx="${n(hx + Math.cos(a) * r * k * 0.6)}" cy="${n(hy - Math.sin(-a) * r * k * 0.6)}" rx="${n(Math.max(0.8, r * 0.5))}" ry="${n(Math.max(1.4, r))}" transform="rotate(${n((a * 180) / Math.PI + 90)} ${n(hx + Math.cos(a) * r * k * 0.6)} ${n(hy - Math.sin(-a) * r * k * 0.6)})"/>`);
      }
      stalks.push(grains);
    }
  }
  const blades = [...byColour].map(([c, d]) => `<path d="${d}" fill="${c}"/>`).join('');
  const lines = stalks.filter((v) => typeof v === 'string');
  const grains = stalks.filter((v) => Array.isArray(v)).flat();
  // the stalks are the grass's own green; only the heads take the light
  return blades + (lines.length ? `<path d="${lines.join(' ')}" fill="none" stroke="${colours[0]}" stroke-width="${n(width * 0.3)}"/><g fill="${heads}">${grains.join('')}</g>` : '');
}

/**
 * Reeds: tall stems bowing with the wind, each topped with a feathery plume.
 * The plumes get their own colour, so against the light they can glow.
 */
export function reeds(rnd, { x0 = -20, x1 = 1300, y, count, height, stem, plume, wind = 0.25, plumeSize = 1 }) {
  const stems = [];
  const plumes = [];
  for (let i = 0; i < count; i++) {
    const x = between(rnd, x0, x1);
    const h = height * between(rnd, 0.55, 1.1);
    const bow = (wind + between(rnd, -0.12, 0.12)) * h;
    const tipX = x + bow;
    const tipY = y - h;
    stems.push(`M${pt([x, y + 10])} Q${pt([x + bow * 0.2, y - h * 0.6])} ${pt([tipX, tipY])}`);
    // a leaf or two off the stem
    for (let k = 0; k < 2; k++) {
      const t = between(rnd, 0.25, 0.6);
      const lx = x + bow * t * t;
      const ly = y - h * t;
      const s = rnd() < 0.5 ? -1 : 1;
      const len = h * between(rnd, 0.18, 0.3);
      stems.push(`M${pt([lx, ly])} Q${pt([lx + s * len * 0.6, ly - len * 0.3])} ${pt([lx + s * len, ly + len * 0.2])}`);
    }
    // the plume: a nodding panicle, its spine curving over and down, hung both sides with fine soft strands
    const ps = h * 0.2 * plumeSize * between(rnd, 0.8, 1.2);
    const dir = Math.sign(bow) || 1;
    const strands = [];
    for (let k = 0; k < 34; k++) {
      const t = k / 34;
      const sx = tipX + dir * ps * 0.5 * t;
      const sy = tipY - ps * 0.1 + ps * 0.85 * t * t;
      for (const side of [-1, 1]) {
        const l = ps * (0.18 + 0.3 * Math.sin(Math.PI * (0.12 + 0.88 * t))) * between(rnd, 0.7, 1.15);
        const ex = sx + side * l * 0.45 + dir * l * 0.35;
        const ey = sy + l * between(rnd, 0.6, 0.95);
        strands.push(`M${pt([sx, sy])} Q${pt([sx + side * l * 0.55, sy + l * 0.1])} ${pt([ex, ey])}`);
      }
    }
    plumes.push(strands.join(' '));
  }
  const width = Math.max(1.6, height * 0.006);
  return {
    stems: `<path d="${stems.join(' ')}" fill="none" stroke="${stem}" stroke-width="${n(width)}" stroke-linecap="round"/>`,
    plumes: `<path d="${plumes.join(' ')}" fill="none" stroke="${plume}" stroke-width="${n(width * 0.55)}" stroke-linecap="round" stroke-opacity="0.75"/>`,
  };
}

// ─────────────────────────────────────────────────────────────── flowers

/** One flower head of a kind, at (x, y), `s` across. */
export function flower(kind, x, y, s, { petal, centre = '#ffd36a', dark = null, stem = '#2f5a2a' }, rnd) {
  const out = [];
  if (kind === 'tulip') {
    const lean = between(rnd, -0.12, 0.12) * s;
    const cx = x + lean;
    // two long leaves from the foot, one each side
    for (const side of [-1, 1]) {
      const reach = s * between(rnd, 0.6, 0.95);
      const top = y + s * between(rnd, 0.4, 1.1);
      out.push(`<path d="M${pt([x, y + s * 2.6])} C${pt([x + side * reach * 0.9, y + s * 2])} ${pt([x + side * reach, top + s * 0.4])} ${pt([x + side * reach * 0.7, top])} C${pt([x + side * reach * 0.5, top + s * 0.7])} ${pt([x + side * s * 0.12, y + s * 1.9])} ${pt([x, y + s * 2.6])} Z" fill="${stem}"/>`);
    }
    out.push(`<path d="M${pt([x, y + s * 2.6])} Q${pt([x + lean * 0.4, y + s * 1.3])} ${pt([cx, y + s * 0.3])}" stroke="${stem}" stroke-width="${n(Math.max(1, s * 0.11))}" fill="none"/>`);
    // the cup: the back petal, then the two side petals over it
    out.push(`<path d="M${pt([cx - s * 0.34, y - s * 0.2])} C${pt([cx - s * 0.36, y - s * 0.62])} ${pt([cx - s * 0.1, y - s * 0.78])} ${pt([cx, y - s * 0.9])} C${pt([cx + s * 0.1, y - s * 0.78])} ${pt([cx + s * 0.36, y - s * 0.62])} ${pt([cx + s * 0.34, y - s * 0.2])} Z" fill="${dark ?? petal}"/>`);
    out.push(`<path d="M${pt([cx - s * 0.44, y - s * 0.62])} C${pt([cx - s * 0.52, y - s * 0.05])} ${pt([cx - s * 0.3, y + s * 0.38])} ${pt([cx, y + s * 0.4])} C${pt([cx + s * 0.3, y + s * 0.38])} ${pt([cx + s * 0.52, y - s * 0.05])} ${pt([cx + s * 0.44, y - s * 0.62])} C${pt([cx + s * 0.3, y - s * 0.4])} ${pt([cx + s * 0.12, y - s * 0.38])} ${pt([cx, y - s * 0.22])} C${pt([cx - s * 0.12, y - s * 0.38])} ${pt([cx - s * 0.3, y - s * 0.4])} ${pt([cx - s * 0.44, y - s * 0.62])} Z" fill="${petal}"/>`);
    // the light along one petal
    out.push(`<path d="M${pt([cx - s * 0.36, y - s * 0.42])} C${pt([cx - s * 0.4, y - s * 0.05])} ${pt([cx - s * 0.26, y + s * 0.22])} ${pt([cx - s * 0.1, y + s * 0.3])}" stroke="#ffffff" stroke-opacity="0.35" stroke-width="${n(Math.max(0.8, s * 0.08))}" stroke-linecap="round" fill="none"/>`);
  } else if (kind === 'narcissus') {
    // nêrgiz, Newroz's own flower: six white petals round a small gold cup with an orange rim,
    // the head turned a little toward us on a stem with long thin leaves
    const lean = between(rnd, -0.15, 0.15) * s;
    const cx = x + lean;
    for (const side of [-1, 1]) {
      const reach = s * between(rnd, 0.25, 0.5);
      out.push(`<path d="M${pt([x, y + s * 2.8])} Q${pt([x + side * reach, y + s * 1.6])} ${pt([x + side * reach * 1.3, y + s * between(rnd, 0.6, 1.2)])}" stroke="${stem}" stroke-width="${n(Math.max(1, s * 0.12))}" stroke-linecap="round" fill="none"/>`);
    }
    out.push(`<path d="M${pt([x, y + s * 2.8])} Q${pt([x + lean * 0.5, y + s * 1.2])} ${pt([cx, y + s * 0.15])}" stroke="${stem}" stroke-width="${n(Math.max(1, s * 0.09))}" fill="none"/>`);
    const tilt = between(rnd, 0.6, 0.9);
    const turn = between(rnd, 0, Math.PI / 3);
    const petals = [];
    for (let k = 0; k < 6; k++) {
      const a = turn + (k / 6) * Math.PI * 2;
      const px = cx + Math.cos(a) * s * 0.36;
      const py = y + Math.sin(a) * s * 0.36 * tilt;
      petals.push(`<ellipse cx="${n(px)}" cy="${n(py)}" rx="${n(s * 0.36)}" ry="${n(s * 0.17 * (0.7 + tilt * 0.3))}" transform="rotate(${n((Math.atan2(Math.sin(a) * tilt, Math.cos(a)) * 180) / Math.PI)} ${n(px)} ${n(py)})"/>`);
    }
    out.push(`<g fill="${petal}">${petals.join('')}</g>`);
    out.push(`<ellipse cx="${n(cx)}" cy="${n(y)}" rx="${n(s * 0.19)}" ry="${n(s * 0.17 * tilt)}" fill="${centre}" stroke="${dark ?? '#e8801a'}" stroke-width="${n(Math.max(0.6, s * 0.05))}"/>`);
  } else if (kind === 'daisy' || kind === 'cosmos') {
    const count = kind === 'daisy' ? 12 : 8;
    const tilt = between(rnd, 0.45, 0.9);
    out.push(`<path d="M${pt([x, y])} Q${pt([x + between(rnd, -4, 4), y + s * 1.5])} ${pt([x + between(rnd, -6, 6), y + s * 3.2])}" stroke="${stem}" stroke-width="${n(Math.max(1, s * 0.07))}" fill="none"/>`);
    const petals = [];
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + rnd() * 0.2;
      const px = x + Math.cos(a) * s * 0.5;
      const py = y + Math.sin(a) * s * 0.5 * tilt;
      const rx = kind === 'daisy' ? s * 0.32 : s * 0.36;
      const ry = kind === 'daisy' ? s * 0.09 : s * 0.2;
      petals.push(`<ellipse cx="${n(px)}" cy="${n(py)}" rx="${n(rx)}" ry="${n(ry * (0.6 + tilt * 0.4))}" transform="rotate(${n((Math.atan2(Math.sin(a) * tilt, Math.cos(a)) * 180) / Math.PI)} ${n(px)} ${n(py)})"/>`);
    }
    out.push(`<g fill="${petal}">${petals.join('')}</g><ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(s * 0.16)}" ry="${n(s * 0.16 * tilt)}" fill="${centre}"/>`);
  } else if (kind === 'spike') {
    // a spike of small florets: lupin, hyacinth, wild larkspur — the stem bowing a little,
    // the florets uneven, the top still in bud
    const h = s * between(rnd, 2.6, 3.6);
    const bend = s * between(rnd, -0.5, 0.5);
    const at = (t) => [x + bend * t * t, y - h * t];
    out.push(`<path d="M${pt([x, y + s * 1.6])} Q${pt([x + bend * 0.2, y - h * 0.5])} ${pt(at(1))}" fill="none" stroke="${stem}" stroke-width="${n(Math.max(1, s * 0.08))}"/>`);
    const fl = [];
    const florets = Math.max(6, Math.round(s * 1.4));
    for (let k = 0; k < florets; k++) {
      const t = k / florets;
      const [fx, fy] = at(t);
      const r = s * 0.2 * (1 - t * 0.75) * between(rnd, 0.7, 1.15);
      const side = k % 2 ? 1 : -1;
      fl.push(`<circle cx="${n(fx + side * r * between(rnd, 0.5, 1.1))}" cy="${n(fy + between(rnd, -r * 0.4, r * 0.4))}" r="${n(r)}"/>`);
    }
    out.push(`<g fill="${petal}">${fl.join('')}</g>`);
    out.push(`<circle cx="${n(at(1)[0])}" cy="${n(at(1)[1])}" r="${n(s * 0.07)}" fill="${stem}"/>`);
  } else {
    // a five-petalled wild flower seen from above
    const petals = [];
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      petals.push(`<circle cx="${n(x + Math.cos(a) * s * 0.3)}" cy="${n(y + Math.sin(a) * s * 0.22)}" r="${n(s * 0.27)}"/>`);
    }
    out.push(`<g fill="${petal}">${petals.join('')}</g><circle cx="${n(x)}" cy="${n(y)}" r="${n(s * 0.12)}" fill="${centre}"/>`);
  }
  return out.join('');
}

/** A field of flowers between y0 and y1, bigger toward the viewer. */
export function flowerField(rnd, { kind, x0 = -20, x1 = 1300, y0, y1, count, size, colours, centre, dark, stem }) {
  const items = [];
  for (let i = 0; i < count; i++) {
    const t = rnd() ** 1.5;
    items.push([between(rnd, x0, x1), y0 + (y1 - y0) * t, size * (0.25 + 0.75 * t) * between(rnd, 0.8, 1.2)]);
  }
  items.sort((a, b) => a[1] - b[1]);
  return items.map(([x, y, s]) => flower(kind, x, y, s, { petal: colours[Math.floor(rnd() * colours.length) % colours.length], centre, dark, stem }, rnd)).join('');
}

// ───────────────────────────────────────────────────────── air and light

/**
 * A rectangle of fractal noise, coloured, its density mapped through
 * `contrast` and `bias` (alpha = contrast × noise + bias), optionally faded
 * top and bottom. Fog, cloud, nebula, smoke — anything soft and uneven.
 */
export function noise(cv, { x = 0, y = 0, w = cv.w, h = cv.h, freq, octaves = 4, seed = 1, colour, contrast = 3, bias = -1.2, opacity = 1, fade = null, type = 'fractalNoise', rotate = 0 }) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16) / 255);
  // noise stretched more than about 2.5 : 1 turns into ruled lines, not wisps
  const fy = freq[1] ?? freq[0];
  const fx = Math.max(freq[0], fy / 2.5);
  const f = cv.id('nz');
  cv.def(
    `<filter id="${f}" x="0" y="0" width="1" height="1" filterUnits="objectBoundingBox" color-interpolation-filters="sRGB">` +
      `<feTurbulence type="${type}" baseFrequency="${freqOf(fx)} ${freqOf(fy)}" numOctaves="${octaves}" seed="${seed}"/>` +
      `<feColorMatrix type="matrix" values="0 0 0 0 ${n(r)} 0 0 0 0 ${n(g)} 0 0 0 0 ${n(b)} ${n(contrast)} 0 0 0 ${n(bias)}"/></filter>`,
  );
  let mask = '';
  if (fade) {
    const m = cv.id('nm');
    const gid = cv.id('ng');
    cv.def(linear(gid, fade.map(([o, a]) => [o, '#ffffff', a])));
    cv.def(`<mask id="${m}" maskUnits="userSpaceOnUse" x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="url(#${gid})"/></mask>`);
    mask = ` mask="url(#${m})"`;
  }
  const turn = rotate ? ` transform="rotate(${n(rotate)} ${n(x + w / 2)} ${n(y + h / 2)})"` : '';
  cv.add(`<g opacity="${n(opacity)}"${turn}><g${mask}><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" filter="url(#${f})"/></g></g>`);
}

/**
 * Clouds from fractal noise, lit: the body in `colour`, its edges toward the
 * light (dx, dy: where the light comes from, in pixels) bright in `light`,
 * its far side darkening to `shade`.
 */
export function clouds(cv, { x = 0, y = 0, w = cv.w, h = cv.h, freq, octaves = 5, seed = 1, colour, light, shade, dx = -6, dy = -8, density = 3.4, cover = -1.5, opacity = 1, fade = null, rotate = 0 }) {
  const rgbOf = (c) => [1, 3, 5].map((i) => n(parseInt(c.slice(i, i + 2), 16) / 255));
  const [r, g, b] = rgbOf(colour);
  const [lr, lg, lb] = rgbOf(light);
  const [sr, sg, sb] = rgbOf(shade);
  const fy = freq[1] ?? freq[0];
  const fx = Math.max(freq[0], fy / 2.5);
  const f = cv.id('cloud');
  // the edges are the cloud set against itself shifted: the noise runs on past the box as far as it is shifted,
  // so nothing empty is shifted in (which would light a band along a side), and the box clips it after; the
  // canvas is drawn that far past its own edges too (`bleed`, which the compositor cuts back)
  const m = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 2.2) + 2;
  cv.bleed = Math.max(cv.bleed ?? 0, m);
  cv.def(
    `<filter id="${f}" x="${n(x - m)}" y="${n(y - m)}" width="${n(w + 2 * m)}" height="${n(h + 2 * m)}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">` +
      `<feTurbulence type="fractalNoise" baseFrequency="${freqOf(fx)} ${freqOf(fy)}" numOctaves="${octaves}" seed="${seed}" result="t"/>` +
      `<feColorMatrix in="t" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${n(density)} 0 0 0 ${n(cover)}" result="d"/>` +
      `<feOffset in="d" dx="${n(-dx)}" dy="${n(-dy)}" result="far"/>` +
      `<feFlood flood-color="rgb(${Math.round(sr * 255)},${Math.round(sg * 255)},${Math.round(sb * 255)})" result="sc"/><feComposite in="sc" in2="d" operator="in" result="body"/>` +
      `<feFlood flood-color="rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})" result="mc"/><feComposite in="mc" in2="far" operator="in" result="mid"/><feComposite in="mid" in2="d" operator="in" result="mid2"/>` +
      `<feOffset in="d" dx="${n(-dx * 2.2)}" dy="${n(-dy * 2.2)}" result="farther"/>` +
      `<feFlood flood-color="rgb(${Math.round(lr * 255)},${Math.round(lg * 255)},${Math.round(lb * 255)})" result="lc"/><feComposite in="lc" in2="d" operator="in" result="lit0"/><feComposite in="lit0" in2="farther" operator="out" result="lit"/>` +
      `<feMerge><feMergeNode in="body"/><feMergeNode in="mid2"/><feMergeNode in="lit"/></feMerge></filter>`,
  );
  let mask = '';
  if (fade) {
    const m = cv.id('cm');
    const gid = cv.id('cg');
    cv.def(linear(gid, fade.map(([o, a]) => [o, '#ffffff', a])));
    cv.def(`<mask id="${m}" maskUnits="userSpaceOnUse" x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="url(#${gid})"/></mask>`);
    mask = ` mask="url(#${m})"`;
  }
  const clip = cv.id('cc');
  cv.def(`<clipPath id="${clip}"><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"/></clipPath>`);
  const turn = rotate ? ` transform="rotate(${n(rotate)} ${n(x + w / 2)} ${n(y + h / 2)})"` : '';
  cv.add(`<g opacity="${n(opacity)}"${turn}><g${mask} clip-path="url(#${clip})"><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" filter="url(#${f})"/></g></g>`);
}

/** Small points of light — dust in a sunbeam, pollen, embers far off. */
export function motes(rnd, { x0 = 0, x1 = 1280, y0 = 0, y1 = 720, count, size = 2, colours, opacity = [0.4, 1] }) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const r = size * between(rnd, 0.4, 1.3);
    out.push(`<circle cx="${n(between(rnd, x0, x1))}" cy="${n(between(rnd, y0, y1))}" r="${n(r)}" fill="${colours[Math.floor(rnd() * colours.length) % colours.length]}" fill-opacity="${n(between(rnd, opacity[0], opacity[1]))}"/>`);
  }
  return out.join('');
}

/**
 * A bonfire: tongues of flame from a bed of embers, each drawn four times over
 * — deep red at the edge, orange, gold, a white heart — bunched to the middle
 * and leaning with `wind`. Returns the flames, and the logs and the glowing
 * bed under them, to be laid in apart: the flames as light.
 */
export function fire(rnd, { x, y, w, h, wind = 0.1, tongues = 11 }) {
  const list = [];
  for (let i = 0; i < tongues; i++) {
    const u = ((rnd() + rnd() + rnd()) / 3) * 2 - 1;
    const tall = h * (1 - u * u * 0.7) * between(rnd, 0.5, 1.05);
    list.push({ bx: x + u * w * 0.5, tall, wide: w * between(rnd, 0.18, 0.3) * (1 - Math.abs(u) * 0.35), lean: (wind + between(rnd, -0.14, 0.14)) * tall, curl: between(rnd, -0.3, 0.3) });
  }
  list.sort((a, b) => b.tall - a.tall);
  const tongue = ({ bx, tall, wide, lean, curl }, k) => {
    const H = tall * k;
    const W = wide * (0.4 + 0.6 * k);
    const tip = [bx + lean * k, y - H];
    return `M${pt([bx - W / 2, y])} C${pt([bx - W * 0.6, y - H * 0.32])} ${pt([bx - W * 0.15 + lean * k * 0.35 + curl * W, y - H * 0.62])} ${pt(tip)} C${pt([bx + W * 0.3 + lean * k * 0.5 + curl * W, y - H * 0.55])} ${pt([bx + W * 0.62, y - H * 0.26])} ${pt([bx + W / 2, y])} Z`;
  };
  const passes = [[1, '#c82a16', 0.8], [0.82, '#ff6a1a', 0.9], [0.6, '#ffaa2e', 0.95], [0.38, '#ffe6a0', 1]];
  const flames = passes.map(([k, colour, a]) => `<path d="${list.map((t) => tongue(t, k)).join(' ')}" fill="${colour}" fill-opacity="${n(a)}"/>`).join('');
  // logs leant together over the bed, their undersides catching the glow
  const logs = [];
  const lit = [];
  for (let i = 0; i < 7; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const foot = [x + side * w * between(rnd, 0.3, 0.62), y + between(rnd, 2, 9)];
    const top = [x + side * w * between(rnd, -0.05, 0.12), y - h * between(rnd, 0.16, 0.3)];
    const thick = w * between(rnd, 0.06, 0.09);
    logs.push(`<path d="M${pt(foot)} L${pt(top)}" stroke-width="${n(thick)}"/>`);
    lit.push(`<path d="M${pt([foot[0], foot[1] - thick * 0.3])} L${pt([top[0], top[1] + thick * 0.2])}" stroke-width="${n(thick * 0.3)}"/>`);
  }
  const bed = `<ellipse cx="${n(x)}" cy="${n(y + 4)}" rx="${n(w * 0.62)}" ry="${n(h * 0.05)}" fill="#ff7a22"/><ellipse cx="${n(x)}" cy="${n(y + 3)}" rx="${n(w * 0.36)}" ry="${n(h * 0.03)}" fill="#ffd27a"/>`;
  return {
    flames,
    logs: `${bed}<g stroke="#1c0c06" stroke-linecap="round">${logs.join('')}</g><g stroke="#ff8a3a" stroke-opacity="0.7" stroke-linecap="round">${lit.join('')}</g>`,
  };
}

/**
 * Embers going up from a fire: thick just above it, fewer and wider apart as
 * they climb, carried off by `wind` — dots, and short streaks where one moved
 * while the eye was on it.
 */
export function embers(rnd, { x, y, rise, spread, count, wind = 0.2, colours }) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = rnd() ** 1.7;
    const up = rise * t;
    const ex = x + (rnd() + rnd() - 1) * spread * (0.35 + t * 1.8) + wind * up;
    const ey = y - up;
    const c = colours[Math.floor(rnd() * colours.length) % colours.length];
    const a = (1 - t * 0.65) * between(rnd, 0.45, 1);
    const r = between(rnd, 0.7, 1.9) * (1 - t * 0.45);
    if (rnd() < 0.4) {
      const len = between(rnd, 3, 10);
      const ang = -Math.PI / 2 + wind + between(rnd, -0.5, 0.5);
      out.push(`<path d="M${pt([ex, ey])} l${n(Math.cos(ang) * len)},${n(Math.sin(ang) * len)}" stroke="${c}" stroke-width="${n(r * 1.1)}" stroke-linecap="round" stroke-opacity="${n(a)}"/>`);
    } else {
      out.push(`<circle cx="${n(ex)}" cy="${n(ey)}" r="${n(r)}" fill="${c}" fill-opacity="${n(a)}"/>`);
    }
  }
  return out.join('');
}

/** Stars: a field of points, a few bright ones with a soft halo and four rays. */
export function starfield(rnd, { x0 = 0, x1 = 1280, y0 = 0, y1, count, bright = 0, colours = ['#ffffff', '#fff1d8', '#d8e6ff'] }) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const x = between(rnd, x0, x1);
    const y = y0 + (y1 - y0) * rnd() ** 1.25;
    const r = rnd() < 0.06 ? between(rnd, 1.1, 1.8) : between(rnd, 0.35, 0.95);
    out.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${colours[Math.floor(rnd() * colours.length) % colours.length]}" fill-opacity="${n(between(rnd, 0.35, 1))}"/>`);
  }
  for (let i = 0; i < bright; i++) {
    const x = between(rnd, x0 + 30, x1 - 30);
    const y = y0 + (y1 - y0) * rnd() ** 1.6;
    const r = between(rnd, 6, 14);
    out.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r * 0.7)}" fill="#ffffff" fill-opacity="0.12"/><circle cx="${n(x)}" cy="${n(y)}" r="1.8" fill="#ffffff"/><path d="M${n(x - r)},${n(y)} L${n(x + r)},${n(y)} M${n(x)},${n(y - r)} L${n(x)},${n(y + r)}" stroke="#ffffff" stroke-width="0.8" stroke-opacity="0.75"/>`);
  }
  return out.join('');
}

/** The sun or moon as a disc of light with a corona. */
export function orb(cv, { x, y, r, core, edge, halo, haloR = r * 8, haloOpacity = 0.6 }) {
  const g = cv.id('halo');
  cv.def(radialAt(g, [[0, halo, haloOpacity], [0.12, halo, haloOpacity * 0.55], [0.4, halo, haloOpacity * 0.12], [1, halo, 0]], x, y, haloR));
  cv.add(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(haloR)}" fill="url(#${g})"/>`);
  const d = cv.id('disc');
  cv.def(radialAt(d, [[0, core], [0.75, core], [1, edge]], x, y, r));
  cv.add(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="url(#${d})"/>`);
}

/** A moon with its seas mottled in, by noise clipped to the disc. */
export function moon(cv, { x, y, r, core = '#f4f1e6', edge = '#d6d2c4', sea = '#a9a596', halo = '#cfdcff', haloR = r * 7, haloOpacity = 0.45, seed = 7 }) {
  orb(cv, { x, y, r, core, edge, halo, haloR, haloOpacity });
  const c = cv.id('mc');
  cv.def(`<clipPath id="${c}"><circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}"/></clipPath>`);
  const inner = new SubCanvas(cv);
  noise(inner, { x: x - r, y: y - r, w: r * 2, h: r * 2, freq: [3.2 / r], octaves: 3, seed, colour: sea, contrast: 3.2, bias: -1.45, opacity: 0.8 });
  cv.add(`<g clip-path="url(#${c})">${inner.out.join('')}</g>`);
}

/** Draws into a list, its defs into the parent canvas, so a group can be clipped or moved as one. */
export class SubCanvas {
  constructor(cv) {
    this.cv = cv;
    this.out = [];
    this.w = cv.w;
    this.h = cv.h;
  }
  id(p) {
    return this.cv.id(p);
  }
  def(m) {
    this.cv.def(m);
  }
  add(m) {
    this.out.push(m);
  }
}

/** A soft glow: a radial gradient fading to nothing. */
export function glow(cv, { x, y, r, colour, opacity = 1 }) {
  const id = cv.id('gw');
  cv.def(radialAt(id, [[0, colour, opacity], [0.3, colour, opacity * 0.5], [1, colour, 0]], x, y, r));
  cv.add(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="url(#${id})"/>`);
}

/** A sky gradient over the whole canvas. */
export function sky(cv, stops) {
  const id = cv.id('sky');
  cv.def(linear(id, stops));
  cv.add(`<rect width="${cv.w}" height="${cv.h}" fill="url(#${id})"/>`);
}

/**
 * A flowering branch reaching in from the edge of the frame: a tapering
 * bough at `angle` (radians from straight up) that forks into twigs, the
 * blossom set close along the twigs in little clusters, with buds among it.
 */
export function branch(rnd, { x, y, angle, length, width, wood, blossom, centre, bud = null }) {
  const limbs = [];
  const flowers = [];
  const bloom = (fx, fy, r) => {
    const c = blossom[Math.floor(rnd() * blossom.length) % blossom.length];
    const a0 = rnd() * 6.28;
    const petalsOut = [];
    for (let p = 0; p < 5; p++) {
      const pa = a0 + (p / 5) * Math.PI * 2;
      const px = fx + Math.cos(pa) * r * 0.55;
      const py = fy + Math.sin(pa) * r * 0.55;
      petalsOut.push(`<ellipse cx="${n(px)}" cy="${n(py)}" rx="${n(r * 0.52)}" ry="${n(r * 0.4)}" transform="rotate(${n((pa * 180) / Math.PI)} ${n(px)} ${n(py)})"/>`);
    }
    flowers.push(`<g fill="${c}">${petalsOut.join('')}</g><circle cx="${n(fx)}" cy="${n(fy)}" r="${n(r * 0.2)}" fill="${centre}"/>`);
  };
  const twig = (x0, y0, a, len, w, depth) => {
    const segs = 6;
    let px = x0;
    let py = y0;
    let pa = a;
    for (let i = 0; i < segs; i++) {
      pa += between(rnd, -0.16, 0.16);
      const nx = px + Math.sin(pa) * (len / segs);
      const ny = py - Math.cos(pa) * (len / segs);
      const w0 = w * (1 - i / segs) + 0.8;
      const w1 = w * (1 - (i + 1) / segs) + 0.8;
      limbs.push(limb(px, py, w0, nx, ny, w1, between(rnd, -1.5, 1.5)));
      if (depth > 0 && i >= 1 && i < segs - 1 && rnd() < 0.6) twig(nx, ny, pa + (rnd() < 0.5 ? -1 : 1) * between(rnd, 0.45, 0.9), len * between(rnd, 0.35, 0.55), w1 * 0.75, depth - 1);
      // blossom hugs the outer part of each twig
      if (depth <= 1 && i >= 2) {
        const count = Math.round(between(rnd, 1, 3));
        for (let k = 0; k < count; k++) {
          const t = rnd();
          const bx = px + (nx - px) * t + between(rnd, -3, 3);
          const by = py + (ny - py) * t + between(rnd, -3, 3);
          if (bud && rnd() < 0.25) flowers.push(`<circle cx="${n(bx)}" cy="${n(by)}" r="${n(between(rnd, 1.6, 2.6) * (width / 14))}" fill="${bud}"/>`);
          else bloom(bx, by, between(rnd, 3.2, 5.6) * (width / 14));
        }
      }
      px = nx;
      py = ny;
    }
  };
  twig(x, y, angle, length, width, 3);
  return `<path d="${limbs.join(' ')}" fill="${wood}"/>${flowers.join('')}`;
}

/** Petals in the air, each a small turning oval. */
export function petals(rnd, { count, colours, size = 6, x0 = 0, x1 = 1280, y0 = 0, y1 = 720 }) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const x = between(rnd, x0, x1);
    const y = between(rnd, y0, y1);
    const s = size * between(rnd, 0.5, 1.3);
    out.push(`<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(s)}" ry="${n(s * 0.55)}" transform="rotate(${n(between(rnd, -80, 80))} ${n(x)} ${n(y)})" fill="${colours[Math.floor(rnd() * colours.length) % colours.length]}" fill-opacity="${n(between(rnd, 0.6, 1))}"/>`);
  }
  return out.join('');
}
