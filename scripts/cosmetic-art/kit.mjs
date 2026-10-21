/**
 * What every piece of the shop's art is drawn with: the seeded randomness, the
 * number format, colour, the SVG document and its gradients, and the woven
 * motifs (eight-point star, stepped lozenge, ram's-horn hooks) the icons are
 * drawn with.
 *
 * See scripts/generate-cosmetic-art.mjs for why every number is rounded and
 * every choice seeded: the same script must write the same SVG on every machine.
 */
// ───────────────────────────────────────────────────────────── determinism

/** FNV-1a: a piece's name becomes its seed, so renaming a piece redraws it. */
export function seedOf(text) {
  let h = 0x811c9dc5;
  for (const ch of text) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** mulberry32 — small, fast, and the same sequence in every JavaScript engine. */
export function random(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A number as it is written into SVG: two decimals, and never "-0".
 *
 * Rounding is what keeps the text identical across machines: Math.sin may
 * differ in its last bit between platforms, and two decimals of a pixel is far
 * coarser than that.
 */
export function n(v) {
  const x = Math.round(v * 100) / 100;
  return String(Object.is(x, -0) ? 0 : x);
}
export const pt = ([x, y]) => `${n(x)},${n(y)}`;
export const poly = (points) => points.map(pt).join(' ');
export const between = (rnd, lo, hi) => lo + (hi - lo) * rnd();
export const pick = (rnd, list) => list[Math.floor(rnd() * list.length) % list.length];
/**
 * Fisher–Yates with the seeded generator. Not `sort(() => rnd() - 0.5)`: what a
 * sort makes of a comparator that contradicts itself is up to the engine's sort
 * algorithm, so the same seed could deal the colours differently on another
 * Node.
 */
export function shuffle(rnd, list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1)) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ────────────────────────────────────────────────────────────────── colour

export function rgbOf(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
export function hexOf(rgb) {
  return '#' + rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');
}
/** Straight sRGB blend; t = 0 is `a`, 1 is `b`. */
export function mix(a, b, t) {
  const x = rgbOf(a);
  const y = rgbOf(b);
  return hexOf(x.map((c, i) => c + (y[i] - c) * t));
}
/** Toward white for t > 0, toward black for t < 0. */
export const tint = (hex, t) => (t >= 0 ? mix(hex, '#ffffff', t) : mix(hex, '#000000', -t));

/** Hevalo's colours: the brand purples, Newroz's gold, red and green, night, dawn, pasture. */
export const C = {
  plum: '#2b1740',
  ink: '#1a0e29',
  violet: '#6b3fa0',
  lilac: '#b874f0',
  lavender: '#d9b8ff',
  gold: '#f2b632',
  amber: '#e8892b',
  red: '#d7263d',
  crimson: '#9e1b32',
  green: '#2a9d4b',
  pine: '#1f5c45',
  moss: '#6a9f6b',
  night: '#0b1a3a',
  navy: '#14295a',
  blue: '#2f5fa8',
  teal: '#1f8a8a',
  ice: '#cfe8f5',
  pink: '#f7a8b8',
  peach: '#ffd4a3',
  cream: '#fff4e0',
  white: '#ffffff',
  brown: '#8a5a3b',
};

/** The Kurdistan flag's own colours. */
export const FLAG = { red: '#ed2024', white: '#ffffff', green: '#278e43', sun: '#febd11' };

// ───────────────────────────────────────────────────────────── svg helpers

export const doc = (w, h, defs, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs}</defs>${body}</svg>`;

/** stops: [offset, colour, opacity?][] */
export const stopsOf = (stops) =>
  stops
    .map(([o, c, a = 1]) => `<stop offset="${n(o)}" stop-color="${c}"${a === 1 ? '' : ` stop-opacity="${n(a)}"`}/>`)
    .join('');
export const linear = (id, stops, x1 = 0, y1 = 0, x2 = 0, y2 = 1) =>
  `<linearGradient id="${id}" x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}">${stopsOf(stops)}</linearGradient>`;
export const radial = (id, stops, cx = 0.5, cy = 0.5, r = 0.5) =>
  `<radialGradient id="${id}" cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}">${stopsOf(stops)}</radialGradient>`;
/** A radial gradient in canvas pixels rather than in the shape's box. */
export const radialAt = (id, stops, cx, cy, r) =>
  `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}">${stopsOf(stops)}</radialGradient>`;
export const blur = (id, sd) =>
  `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${n(sd)}"/></filter>`;

/**
 * A canvas-sized drawing in progress: a list of `defs`, a list of shapes, and
 * a counter so every gradient gets an id of its own.
 */
export class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.defs = [];
    this.body = [];
    this.ids = 0;
  }
  id(prefix) {
    this.ids += 1;
    return `${prefix}${this.ids}`;
  }
  def(markup) {
    this.defs.push(markup);
  }
  add(markup) {
    this.body.push(markup);
  }
  svg() {
    return doc(this.w, this.h, this.defs.join(''), this.body.join(''));
  }
}

// ─────────────────────────────────────────────────────────────── the sun

/**
 * The rays of a sun, as the sun of the Kurdistan flag has them (21): `rays`
 * straight triangles round (cx, cy), each from a base `inner` out, `halfWidth`
 * radians either side of its middle, to a point `outer` out, the first
 * pointing straight up; as one path, to go under a disc.
 */
export function sunRays(cx, cy, inner, outer, rays, halfWidth) {
  const out = [];
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2 - Math.PI / 2;
    out.push(`M${pt([cx + Math.cos(a - halfWidth) * inner, cy + Math.sin(a - halfWidth) * inner])} L${pt([cx + Math.cos(a) * outer, cy + Math.sin(a) * outer])} L${pt([cx + Math.cos(a + halfWidth) * inner, cy + Math.sin(a + halfWidth) * inner])} Z`);
  }
  return out.join(' ');
}

// ─────────────────────────────────────────────────────────────── the kilim

export const diamond = (cx, cy, w, h) => `M${pt([cx, cy - h / 2])} L${pt([cx + w / 2, cy])} L${pt([cx, cy + h / 2])} L${pt([cx - w / 2, cy])} Z`;

/**
 * A diamond whose outline steps the way a weft-faced weave does: each edge is a
 * staircase of `steps` treads, which is what makes a lozenge read as woven
 * rather than drawn.
 */
export function steppedDiamond(cx, cy, w, h, steps) {
  const hw = w / 2;
  const hh = h / 2;
  const sx = hw / steps;
  const sy = hh / steps;
  const p = [[cx, cy - hh]];
  for (let i = 0; i < steps; i++) p.push([cx + sx * i, cy - hh + sy * (i + 1)], [cx + sx * (i + 1), cy - hh + sy * (i + 1)]);
  for (let i = 0; i < steps; i++) p.push([cx + hw - sx * i, cy + sy * (i + 1)], [cx + hw - sx * (i + 1), cy + sy * (i + 1)]);
  for (let i = 0; i < steps; i++) p.push([cx - sx * i, cy + hh - sy * (i + 1)], [cx - sx * (i + 1), cy + hh - sy * (i + 1)]);
  for (let i = 0; i < steps; i++) p.push([cx - hw + sx * i, cy - sy * (i + 1)], [cx - hw + sx * (i + 1), cy - sy * (i + 1)]);
  return `M${poly(p)} Z`;
}

/**
 * Hooks along a lozenge's four edges: a short stem out from the edge, then a
 * turn along it — the "ram's horn" hook kilims are full of.
 */
export function hooks(cx, cy, w, h, per, len, colour, width) {
  const corners = [[cx, cy - h / 2], [cx + w / 2, cy], [cx, cy + h / 2], [cx - w / 2, cy]];
  const out = [];
  for (let e = 0; e < 4; e++) {
    const a = corners[e];
    const b = corners[(e + 1) % 4];
    const tx = (b[0] - a[0]) / Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ty = (b[1] - a[1]) / Math.hypot(b[0] - a[0], b[1] - a[1]);
    // outward normal for a clockwise outline
    const nx = ty;
    const ny = -tx;
    for (let k = 1; k <= per; k++) {
      const t = k / (per + 1);
      const p0 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const p1 = [p0[0] + nx * len, p0[1] + ny * len];
      const p2 = [p1[0] + tx * len * 0.7, p1[1] + ty * len * 0.7];
      out.push(`M${pt(p0)} L${pt(p1)} L${pt(p2)}`);
    }
  }
  return `<path d="${out.join(' ')}" fill="none" stroke="${colour}" stroke-width="${n(width)}" stroke-linejoin="miter"/>`;
}
