/**
 * Still lifes: the shop's icons painted as real things — a fruit, a glass of
 * tea, a wax seal, a flame — against a black cloth, and cut out of it, so
 * that each lies over a profile picture with nothing round it but its own
 * glow.
 *
 * An icon is a short list of steps, as a scene is (render.mjs), worked at
 * twice its size and brought down at the end:
 *
 *  - a surface: a shape and its colours (an SVG) given relief — raised from
 *    its own outline as a cushion is stuffed (`inflate`), drawn in white for
 *    high (`relief`), roughened (`bumps`) — its colours mottled (`mottle`),
 *    snow laid on what of it faces the sky (`snow`), and lit: a warm key
 *    light from the upper left, a cool fill from the right, a rim of light
 *    from behind, its hollows in shadow, and a shine as hard or as soft as
 *    its material's (`material`) — glass's lying on it as light alone
 *    (`clear`) — then faded out where `mask` is dark;
 *  - a shadow one part casts on another (`shadow`);
 *  - light given off, a flame's or the sun's (`glow`);
 *  - a mountain painted from a relief, as the backgrounds' are (`terrain`);
 *  - paint laid on as it is, unlit (`paint`): most of an icon is this, its
 *    light and its shadow painted in by hand (brush.mjs).
 *
 * Then, for a painted thing, the painter's pass (`finish.paint`), a grade
 * and the grain of film, and out it comes with its transparency.
 * Plain arithmetic on the rasterised SVG, every random choice seeded, so the
 * same steps paint the same pixels everywhere.
 */
import { Canvas, random } from './kit.mjs';
import { rasterise, terrain } from './render.mjs';
import { blur, blurField, clamp, frame, luma, over, rgb, smooth, turbulence } from './pixels.mjs';

/** Worked at twice the size and brought down: fine edges and fine marks. */
const SS = 2;

const norm = ([x, y, z]) => {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
};

/** The light every icon is lit by unless it says otherwise: [direction, colour, strength]. */
const LIGHT = {
  key: [[-0.55, -0.72, 0.62], [1, 0.95, 0.86], 1.1],
  fill: [[0.85, 0.2, 0.48], [0.56, 0.63, 0.8], 0.2],
  rim: [[0.75, -0.35, 0], [1, 0.9, 0.76], 0.8],
  ambient: [0.24, 0.23, 0.26],
};

/** An icon under construction: its steps, in order. */
export class Still {
  constructor(rnd, size = 512) {
    this.rnd = rnd;
    this.size = size;
    this.steps = [];
    this.transform = '';
  }
  seed() {
    return Math.floor(this.rnd() * 2147483646) + 1;
  }
  /** Everything drawn from here on scaled by `scale` about the middle and moved by (dx, dy): to fit a thing in its frame. */
  place([dx, dy], scale = 1) {
    const c = this.size / 2;
    this.transform = `translate(${c + dx} ${c + dy}) scale(${scale}) translate(${-c} ${-c})`;
    return this;
  }
  /** What `draw(cv)` draws, as an SVG the icon's size. */
  svg(draw) {
    const cv = new Canvas(this.size, this.size);
    if (this.transform) cv.add(`<g transform="${this.transform}">`);
    draw(cv);
    if (this.transform) cv.add('</g>');
    return cv.svg();
  }
  /**
   * A surface: `draw` gives its shape and colours. `inflate` ({ radius,
   * profile, height, soften }) raises it from its outline, `radius` pixels in
   * to its full height; `relief` ({ draw, height, blur }, or a list of them)
   * adds what its own drawing gives, white for high; `bumps` ({ scale, amount, stretch, angle })
   * roughens it (`ridged`, as weathered rock is); `mottle` ({ scale, amount,
   * stretch, angle }) varies its colour; `snow` ({ colour, line, soft, up,
   * steep, crests, wander, scale }) whitens it above `line`, more where it
   * faces up and in its hollows, less where it is steep or a crest; `material` says how it takes the light; `mask`
   * draws, white for kept, black for gone, how much of it is seen.
   */
  surface(draw, { inflate = null, relief = null, bumps = null, mottle = null, snow = null, material = {}, opacity = 1, mask = null } = {}) {
    const step = { svg: this.svg(draw), inflate, bumps, mottle, snow, material, opacity, seed: this.seed() };
    if (relief) step.relief = [relief].flat().map((r) => ({ height: r.height ?? 1, blur: r.blur ?? 1, svg: this.svg(r.draw) }));
    if (mask) step.mask = this.svg(mask);
    this.steps.push({ surface: step });
    return this;
  }
  /** A shadow cast on what is already there: `draw` in black, softened by `blur`. */
  shadow(draw, { blur: soft = 6, opacity = 0.6 } = {}) {
    this.steps.push({ shadow: { svg: this.svg(draw), blur: soft, opacity } });
    return this;
  }
  /** Light given off: `draw` in the light's colours, spread by `blur` (and three times that, fainter). */
  glow(draw, { blur: soft = 16, strength = 1, halo = 0.5 } = {}) {
    this.steps.push({ glow: { svg: this.svg(draw), blur: soft, strength, halo } });
    return this;
  }
  /**
   * A mountain painted from a relief, as the backgrounds' are (render.mjs
   * `terrain`): `paint` gives its skyline (`ridge`), its summits (`peaks`,
   * [x, y, half-width]), its colours, and the `scale` of its rock and snow
   * (1: as a background's, at this size); faded where `mask` is dark.
   */
  terrain(paint, { mask = null } = {}) {
    this.steps.push({ terrain: { ...paint, seed: this.seed() }, mask: mask && this.svg(mask) });
    return this;
  }
  /** Paint laid on as it is, unlit (and faded where `mask` is dark). */
  paint(draw, { blur: soft = 0, opacity = 1, mask = null } = {}) {
    this.steps.push({ paint: { svg: this.svg(draw), blur: soft, opacity, mask: mask && this.svg(mask) } });
    return this;
  }
  done({ light = {}, finish = {} } = {}) {
    return { size: this.size, steps: this.steps, light, finish };
  }
}

// ──────────────────────────────────────────────────────────────── relief

/** The 1-D squared distance transform (Felzenszwalb and Huttenlocher), in place over `f`, into `d`. */
function distance1(f, n, d, v, z) {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/** How far each pixel inside a shape (`alpha` over a half) lies from its edge, in pixels. */
function depthIn(alpha, w, h) {
  const big = 1e20;
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const g = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = alpha[i] > 0.5 ? big : 0;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = g[y * w + x];
    distance1(f, h, d, v, z);
    for (let y = 0; y < h; y++) g[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = g[y * w + x];
    distance1(f, w, d, v, z);
    for (let x = 0; x < w; x++) g[y * w + x] = d[x];
  }
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = Math.sqrt(g[i]);
  return out;
}

/** How a stuffed shape rises from its edge (t = 0) to its full height (t = 1). */
const PROFILES = {
  round: (t) => Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t))),
  soft: (t) => 1 - (1 - t) * (1 - t),
  cushion: (t) => t * t * (3 - 2 * t),
  bevel: (t) => t,
};

/**
 * Noise for bumps and mottling: `scale` pixels across, drawn out `stretch`
 * times along `angle` (degrees); `ridged`, each octave folded about its
 * middle, so that it rises in sharp crests between rounded hollows, as
 * weathered rock does.
 */
function grainAt(noise, ch, { scale = 20, stretch = 1, angle = 0, octaves = 4, ridged = false }) {
  const a = (angle * Math.PI) / 180;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const s = scale * SS;
  return (x, y) => {
    let u = (x * ca + y * sa) / (s * stretch);
    let v = (-x * sa + y * ca) / s;
    if (!ridged) return noise.fbm(ch, u, v, octaves);
    let sum = 0;
    let amp = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      const r = Math.max(0, 1 - Math.abs(noise.plain(ch, u, v)) * 2);
      sum += r * r * amp;
      norm += amp;
      u *= 2.02;
      v *= 2.02;
      amp *= 0.5;
    }
    return sum / norm - 0.4;
  };
}

/** The slope of a height field at pixel i, as its surface's normal. */
function normalAt(h, S, x, y) {
  const gx = (h[y * S + Math.min(S - 1, x + 1)] - h[y * S + Math.max(0, x - 1)]) / 2;
  const gy = (h[Math.min(S - 1, y + 1) * S + x] - h[Math.max(0, y - 1) * S + x]) / 2;
  return norm([-gx, -gy, 1]);
}

// ──────────────────────────────────────────────────────────────── surfaces

async function surface(s, S, L) {
  const f = await rasterise(s.svg, S, S, 1 / SS);
  const N = S * S;
  const p = f.px;
  const alpha = new Float32Array(N);
  for (let i = 0; i < N; i++) alpha[i] = p[i * 4 + 3];
  const noise = turbulence(s.seed, 1, 1);
  // the relief, in pixels of the worked size
  let h = new Float32Array(N);
  if (s.inflate) {
    const { radius, profile = 'round', height = 1, soften = 1 } = s.inflate;
    const R = radius * SS;
    const depth = depthIn(alpha, S, S);
    const shape = PROFILES[profile];
    for (let i = 0; i < N; i++) h[i] = depth[i] > 0 ? R * height * shape(Math.min(1, depth[i] / R)) : 0;
    if (soften) h = blurField(h, S, S, soften * SS);
  }
  for (const relief of s.relief ?? []) {
    const r = await rasterise(relief.svg, S, S, 1 / SS);
    let rh = new Float32Array(N);
    for (let i = 0; i < N; i++) rh[i] = luma(r.px[i * 4], r.px[i * 4 + 1], r.px[i * 4 + 2]);
    if (relief.blur) rh = blurField(rh, S, S, relief.blur * SS);
    for (let i = 0; i < N; i++) h[i] += rh[i] * relief.height * SS;
  }
  if (s.bumps) {
    const at = grainAt(noise, 0, s.bumps);
    const amount = (s.bumps.amount ?? 1) * SS;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (alpha[y * S + x] > 0) h[y * S + x] += at(x, y) * amount;
  }
  if (s.mottle) {
    const at = grainAt(noise, 1, s.mottle);
    const amount = s.mottle.amount ?? 0.15;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = y * S + x;
        if (alpha[i] <= 0) continue;
        const m = 1 + at(x, y) * amount * 2;
        p[i * 4] = Math.min(alpha[i], p[i * 4] * m);
        p[i * 4 + 1] = Math.min(alpha[i], p[i * 4 + 1] * m);
        p[i * 4 + 2] = Math.min(alpha[i], p[i * 4 + 2] * m);
      }
    }
  }
  if (s.snow) {
    // snow lies high up, where the ground faces the sky, and in the gullies; it slides off what is steep and the
    // wind takes it off the crests
    const { colour = '#eef2f8', line = 256, soft = 80, up = 0.8, steep = 1.2, crests = 0, wander = 0.35, scale = 14 } = s.snow;
    const white = rgb(colour);
    const at = grainAt(noise, 2, { scale, octaves: 5 });
    const reach = 5 * SS;
    const round = crests ? blurField(h, S, S, reach) : null;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = y * S + x;
        if (alpha[i] <= 0) continue;
        const [, ny, nz] = normalAt(h, S, x, y);
        const crest = crests ? clamp((h[i] - round[i]) / reach, -1, 1) * crests : 0;
        const k = smooth(0.35, 0.65, (line * SS - y) / (soft * SS) + Math.max(0, -ny) * up - (1 - nz) * steep - crest + at(x, y) * wander * 2);
        for (let c = 0; c < 3; c++) p[i * 4 + c] += (white[c] * alpha[i] - p[i * 4 + c]) * k;
      }
    }
  }
  shade(f, h, alpha, s.material, L, S);
  if (s.opacity < 1) for (let i = 0; i < p.length; i++) p[i] *= s.opacity;
  if (s.mask) await masked(f, s.mask, S);
  return f;
}

/** Faded where a mask, drawn white for kept, is dark. */
async function masked(f, svg, S) {
  const m = await rasterise(svg, S, S, 1 / SS);
  for (let i = 0; i < f.px.length; i += 4) {
    const k = luma(m.px[i], m.px[i + 1], m.px[i + 2]);
    f.px[i] *= k;
    f.px[i + 1] *= k;
    f.px[i + 2] *= k;
    f.px[i + 3] *= k;
  }
}

/**
 * Lights a surface: its colour, by its relief. Lambert's law for the key and
 * the fill (wrapped round, for what light passes into — wax, a petal, skin),
 * Blinn's for the shine, a rim where the surface turns away toward the light
 * behind, the ambient light kept out of its hollows.
 */
function shade(f, h, alpha, m, L, S) {
  const { ambient = 1, diffuse = 1, wrap = 0, gloss = 0.35, shine = 30, sheen = 0.3, metal = 0, hollows = 0.7, fill = 1, seen = 0, clear = false } = m;
  const p = f.px;
  const [kd, kc, ks] = L.key;
  const [fd, fc, fs] = L.fill;
  const [rd, rc, rs] = L.rim;
  const half = norm([kd[0], kd[1], kd[2] + 1]);
  const rl = Math.hypot(rd[0], rd[1]) || 1;
  // the hollows: how far each point lies below the ground round about it
  const reach = 6 * SS;
  const round = blurField(h, S, S, reach);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const a = alpha[i];
      if (a <= 0) continue;
      const [nx, ny, nz] = normalAt(h, S, x, y);
      const ndk = nx * kd[0] + ny * kd[1] + nz * kd[2];
      const lam = Math.max(0, (ndk + wrap) / (1 + wrap));
      const lamF = Math.max(0, nx * fd[0] + ny * fd[1] + nz * fd[2]);
      const spec = gloss * Math.pow(Math.max(0, nx * half[0] + ny * half[1] + nz * half[2]), shine);
      const edge = Math.pow(1 - nz, 3);
      const rimT = sheen * rs * edge * Math.max(0, (nx * rd[0] + ny * rd[1]) / rl + 0.25);
      const occl = 1 - hollows * clamp((round[i] - h[i]) / reach, 0, 1);
      // (`seen`: a thing seen only by the light on it, the moon, fades where the light leaves it)
      const keep = seen ? clamp((lam * 1.6 + spec) / seen, 0, 1) : 1;
      let top = 0;
      for (let c = 0; c < 3; c++) {
        const albedo = p[i * 4 + c] / a;
        const body = albedo * (L.ambient[c] * ambient * occl + diffuse * lam * kc[c] * ks * (0.35 + 0.65 * occl) + fill * lamF * fc[c] * fs);
        const gleam = spec * kc[c] * ks * (metal ? albedo * metal + (1 - metal) : 1) * occl + rimT * rc[c];
        // (glass: what it reflects is seen however little of the glass there is to see)
        if (clear) {
          p[i * 4 + c] = clamp(body, 0, 1) * a + clamp(gleam, 0, 1) * (1 - a);
          top = Math.max(top, clamp(gleam, 0, 1));
        } else p[i * 4 + c] = clamp(body + gleam, 0, 1) * a * keep;
      }
      p[i * 4 + 3] = clear ? a + top * (1 - a) : a * keep;
    }
  }
}

// ──────────────────────────────────────────────────────────── shadow, light

async function castShadow(out, s, S) {
  const layer = await rasterise(s.svg, S, S, 1 / SS);
  if (s.blur) blur(layer, s.blur * SS);
  const o = out.px;
  const l = layer.px;
  for (let i = 0; i < o.length; i += 4) {
    const k = 1 - s.opacity * l[i + 3];
    o[i] *= k;
    o[i + 1] *= k;
    o[i + 2] *= k;
  }
}

async function addGlow(out, s, S) {
  const near = await rasterise(s.svg, S, S, 1 / SS);
  const far = { w: near.w, h: near.h, px: new Float32Array(near.px) };
  blur(near, s.blur * SS);
  blur(far, s.blur * 3 * SS);
  const o = out.px;
  for (let i = 0; i < o.length; i += 4) {
    const r = (near.px[i] + far.px[i] * s.halo) * s.strength;
    const g = (near.px[i + 1] + far.px[i + 1] * s.halo) * s.strength;
    const b = (near.px[i + 2] + far.px[i + 2] * s.halo) * s.strength;
    // light added where there was nothing is light seen against the dark: as bright as it is, that opaque
    o[i] += r;
    o[i + 1] += g;
    o[i + 2] += b;
    o[i + 3] = Math.min(1, Math.max(o[i + 3], o[i + 3] + Math.max(r, g, b) * (1 - o[i + 3])));
    const top = Math.max(o[i], o[i + 1], o[i + 2], o[i + 3]);
    if (top > 1) {
      o[i] /= top;
      o[i + 1] /= top;
      o[i + 2] /= top;
      o[i + 3] = Math.min(1, o[i + 3]);
    }
  }
}

// ──────────────────────────────────────────────────────────────── finish

/** The grade (on the colours as seen, not as stored) and the film's grain, by the alpha. */
function finishStill(f, { contrast = 0.12, saturation = 1.05, warmth = 0.03, grain = 0.018 }, seed) {
  const rnd = random(seed);
  const p = f.px;
  for (let i = 0; i < p.length; i += 4) {
    const a = p[i + 3];
    if (a <= 0) continue;
    let r = p[i] / a;
    let g = p[i + 1] / a;
    let b = p[i + 2] / a;
    const l = luma(r, g, b);
    r = l + (r - l) * saturation + warmth;
    g = l + (g - l) * saturation + warmth * 0.3;
    b = l + (b - l) * saturation - warmth;
    const s = (v) => {
      const c = clamp(v, 0, 1);
      return c + (c * c * (3 - 2 * c) - c) * contrast;
    };
    const n = (rnd() + rnd() - 1) * grain;
    p[i] = clamp(s(r) + n, 0, 1) * a;
    p[i + 1] = clamp(s(g) + n, 0, 1) * a;
    p[i + 2] = clamp(s(b) + n, 0, 1) * a;
  }
}

/**
 * The painter's pass (a Kuwahara filter), on a picture with its
 * transparency: every pixel takes the colour of the calmest of the four
 * squares round it, `radius` across, so that what is smooth stays smooth,
 * edges and the cut-out's own edge stay where they are, and texture turns
 * into strokes of paint.
 */
function paintover(f, radius) {
  const { w, h } = f;
  const W = w + 1;
  const sums = [0, 1, 2, 3].map(() => new Float64Array(W * (h + 1)));
  const lum = new Float64Array(W * (h + 1));
  const lum2 = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    const run = [0, 0, 0, 0];
    let l = 0;
    let l2 = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) run[c] += f.px[i + c];
      // (the alpha counts too, so that the edge of the cut-out is an edge)
      const v = luma(f.px[i], f.px[i + 1], f.px[i + 2]) + f.px[i + 3] * 0.5;
      l += v;
      l2 += v * v;
      const k = (y + 1) * W + x + 1;
      for (let c = 0; c < 4; c++) sums[c][k] = sums[c][k - W] + run[c];
      lum[k] = lum[k - W] + l;
      lum2[k] = lum2[k - W] + l2;
    }
  }
  const area = (t, x0, y0, x1, y1) => t[y1 * W + x1] - t[y0 * W + x1] - t[y1 * W + x0] + t[y0 * W + x0];
  const out = new Float32Array(f.px.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let best = Infinity;
      let pick = null;
      for (let q = 0; q < 4; q++) {
        const x0 = clamp(q & 1 ? x : x - radius, 0, w);
        const x1 = clamp(q & 1 ? x + radius + 1 : x + 1, 0, w);
        const y0 = clamp(q & 2 ? y : y - radius, 0, h);
        const y1 = clamp(q & 2 ? y + radius + 1 : y + 1, 0, h);
        const m = (x1 - x0) * (y1 - y0);
        if (m <= 0) continue;
        const mean = area(lum, x0, y0, x1, y1) / m;
        const v = area(lum2, x0, y0, x1, y1) / m - mean * mean;
        if (v < best) {
          best = v;
          pick = [x0, y0, x1, y1, m];
        }
      }
      const i = (y * w + x) * 4;
      const [x0, y0, x1, y1, m] = pick;
      for (let c = 0; c < 4; c++) out[i + c] = area(sums[c], x0, y0, x1, y1) / m;
    }
  }
  f.px.set(out);
}

/** Brought down to its size: each pixel the average of the four it was worked as. */
function halve(f) {
  const w = f.w / 2;
  const h = f.h / 2;
  const out = frame(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const a = (2 * y * f.w + 2 * x) * 4;
      const b = a + 4;
      const c = a + f.w * 4;
      const d = c + 4;
      for (let ch = 0; ch < 4; ch++) out.px[o + ch] = (f.px[a + ch] + f.px[b + ch] + f.px[c + ch] + f.px[d + ch]) / 4;
    }
  }
  return out;
}

/**
 * Paints an icon from its steps (a `Still`'s `done()`): its pixels, 8-bit
 * RGBA, straight (not premultiplied) alpha, `size` × `size`.
 */
export async function renderStill({ size, steps, light = {}, finish = {} }, seed = 1) {
  const S = size * SS;
  const L = {
    key: light.key ? [norm(light.key[0]), light.key[1], light.key[2]] : [norm(LIGHT.key[0]), LIGHT.key[1], LIGHT.key[2]],
    fill: light.fill ? [norm(light.fill[0]), light.fill[1], light.fill[2]] : [norm(LIGHT.fill[0]), LIGHT.fill[1], LIGHT.fill[2]],
    rim: light.rim ?? LIGHT.rim,
    ambient: light.ambient ?? LIGHT.ambient,
  };
  const out = frame(S, S);
  for (const step of steps) {
    if (step.surface) over(out, await surface(step.surface, S, L));
    else if (step.shadow) await castShadow(out, step.shadow, S);
    else if (step.glow) await addGlow(out, step.glow, S);
    else if (step.terrain) {
      // (drawn at the worked size: its skyline, summits and heights in its pixels)
      const t = step.terrain;
      const at = (v) => (v == null ? v : v * SS);
      const layer = terrain(S, S, { ...t, ridge: t.ridge.map(([x, y]) => [x * SS, y * SS]), peaks: t.peaks.map(([x, y, r]) => [x * SS, y * SS, r * SS]), snowline: at(t.snowline), footFrom: at(t.footFrom), scale: (t.scale ?? 1) * SS });
      if (step.mask) await masked(layer, step.mask, S);
      over(out, layer);
    } else if (step.paint) {
      const layer = await rasterise(step.paint.svg, S, S, 1 / SS);
      if (step.paint.blur) blur(layer, step.paint.blur * SS);
      if (step.paint.mask) await masked(layer, step.paint.mask, S);
      over(out, layer, step.paint.opacity);
    }
  }
  if (finish.paint) paintover(out, Math.round(finish.paint * SS));
  finishStill(out, finish, seed);
  const small = halve(out);
  const px = Buffer.alloc(size * size * 4);
  for (let i = 0; i < small.px.length; i += 4) {
    const a = small.px[i + 3];
    px[i + 3] = clamp(Math.round(a * 255), 0, 255);
    if (a <= 0) continue;
    px[i] = clamp(Math.round((small.px[i] / a) * 255), 0, 255);
    px[i + 1] = clamp(Math.round((small.px[i + 1] / a) * 255), 0, 255);
    px[i + 2] = clamp(Math.round((small.px[i + 2] / a) * 255), 0, 255);
  }
  return px;
}
