/**
 * What the compositor paints itself, mark by mark and pixel by pixel, where a
 * shape filled flat would read as a cut-out: foliage leaf by leaf, ground
 * cover plant by plant, the gas and stars of a nebula, the weave and ridges of
 * oil paint on canvas, ink washed onto wet paper.
 *
 * Each works on frames of premultiplied RGBA floats (pixels.mjs) and takes
 * its randomness from a seed, so the same call paints the same marks on every
 * machine.
 */
import { random } from './kit.mjs';
import { blur, blurField, cells, clamp, frame, over, resize, rgb, smooth, stamp, turbulence } from './pixels.mjs';

// ──────────────────────────────────────────────────────────── foliage

/**
 * Foliage, leaf by leaf: a layer of crowns as they were drawn — flat shapes
 * lit in broad planes — repainted as leaves `size` pixels long.
 *
 * The crown is first gathered into masses of leaves, a few leaves across
 * (`masses`, in leaves), each lit on the side toward `light` ([x, y], in the
 * picture: where the light comes from) and shaded under, as a painter models
 * foliage; toward the crown's edge the masses part (`gaps`) and what is behind
 * shows through. Then leaves are laid over every mass in its tone, from the
 * deepest in the crown out to the edge, each a little lighter or darker than
 * the next (`jitter`), the ones deep inside darker (`depth`) — so the edge is
 * ragged with single leaves, never a cut line. The leaves take their colour
 * from what was drawn there, so the crown keeps its light. `contrast` is how
 * strongly the masses are modelled, `density` how thickly the leaves lie, and
 * `tip` their shape (pixels.mjs `stamp`).
 */
export function leafy(f, { size = 4, light = [-0.6, -0.8], masses = 5, contrast = 0.6, depth = 0.45, gaps = 0.5, jitter = 0.18, density = 1, tip = 0.8, seed = 1 }) {
  const { w, h } = f;
  const p = f.px;
  const N = w * h;
  const alpha = new Float32Array(N);
  let any = false;
  for (let i = 0; i < N; i++) {
    alpha[i] = p[i * 4 + 3];
    if (alpha[i] > 0) any = true;
  }
  if (!any) return f;
  const cell = size * masses;
  // how near the edge (soft) and how deep inside (deep) each pixel is; and the colour drawn round about, carried
  // a little past the edge for the leaves that stand out beyond it
  const soft = blurField(alpha, w, h, size * 0.9);
  const deep = blurField(alpha, w, h, size * 3.2);
  const spread = size * 0.7;
  const cr = blurField(channel(p, 0, N), w, h, spread);
  const cg = blurField(channel(p, 1, N), w, h, spread);
  const cb = blurField(channel(p, 2, N), w, h, spread);
  const ca = blurField(alpha, w, h, spread);
  const noise = turbulence(seed, 1, 1);
  const L = Math.hypot(light[0], light[1]) || 1;
  const lx = light[0] / L;
  const ly = light[1] / L;
  // the masses: bunches of leaves, a few leaves across, each a dome lit on the side toward the light, with
  // shadowed creases between them — and where the crown is thin, the creases open into gaps
  // (two sizes of them — great masses and the bunches within — on warped, flattened cells, so no two are alike)
  const bunch = cells(cell, seed, 1.35);
  const mass = cells(cell * 2.6, seed + 17, 1.25);
  const shadeAt = (x, y) => {
    const wx = x + noise.fbm(2, x / (cell * 1.4), y / (cell * 1.4), 2) * cell * 1.3;
    const wy = y + noise.fbm(3, x / (cell * 1.4), y / (cell * 1.4), 2) * cell * 1.3;
    const m = bunch(wx, wy);
    const big = mass(wx, wy);
    const crease = smooth(0, 0.3, m.edge) * 0.5 + smooth(0, 0.22, big.edge) * 0.5;
    const toward = (m.ux * lx + m.uy * ly) * m.r * 0.55 + (big.ux * lx + big.uy * ly) * big.r * 0.75;
    return { lit: clamp(toward - (1 - crease) * 0.55, -1, 1), crease };
  };
  const open = (x, y, i, crease) => gaps * (1 - crease) * (0.55 + 0.45 * smooth(-0.1, 0.25, noise.fbm(1, x / cell, y / cell, 2))) * (1 - 0.55 * smooth(0.6, 1, deep[i]));
  const out = frame(w, h);
  const o = out.px;
  // what is between the leaves, deep in the crown: its own colour in shadow
  for (let i = 0; i < N; i++) {
    const a = alpha[i];
    if (a <= 0) continue;
    const x = i % w;
    const y = (i - x) / w;
    const { crease } = shadeAt(x, y);
    const under = smooth(0.62, 0.92, soft[i] - open(x, y, i, crease) * 1.3) * a;
    if (under <= 0) continue;
    const k = (1 - depth) * 0.7;
    const j = i * 4;
    o[j] = p[j] * k * under;
    o[j + 1] = p[j + 1] * k * under;
    o[j + 2] = p[j + 2] * k * under;
    o[j + 3] = under;
  }
  // the leaves, on a jittered grid, deepest first
  const rnd = random(seed);
  const step = (size * 0.62) / Math.sqrt(density);
  const leaves = [];
  for (let gy = 0; gy < h; gy += step) {
    for (let gx = 0; gx < w; gx += step) {
      const x = gx + rnd() * step;
      const y = gy + rnd() * step;
      const r1 = rnd();
      const r2 = rnd();
      const r3 = rnd();
      const i = Math.min(h - 1, Math.floor(y)) * w + Math.min(w - 1, Math.floor(x));
      if (soft[i] < 0.04 || ca[i] < 0.02) continue;
      const sh = shadeAt(x, y);
      // the edge thins out into single leaves, and the creases open: the further out, the fewer
      if (soft[i] - open(x, y, i, sh.crease) < 0.12 + r1 * 0.5) continue;
      leaves.push([deep[i] + sh.lit * 0.15, x, y, i, r2, r3, sh.lit]);
    }
  }
  leaves.sort((a, b) => b[0] - a[0]);
  for (const [d, x, y, i, r2, r3, lit] of leaves) {
    const inv = 1 / ca[i];
    const shade = (1 + lit * contrast) * (1 + (r2 - 0.5) * 2 * jitter) * (1 - depth * smooth(0.7, 1, d) * 0.5);
    const len = size * (0.38 + r3 * 0.24);
    stamp(out, x, y, len, len * 0.46, r2 * Math.PI * 2 + r3 * 3.1, clamp(cr[i] * inv * shade, 0, 1), clamp(cg[i] * inv * shade, 0, 1), clamp(cb[i] * inv * shade, 0, 1), 1, tip);
  }
  p.set(o);
  return f;
}

function channel(p, c, N) {
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) out[i] = p[i * 4 + c];
  return out;
}

// ──────────────────────────────────────────────────────────── ground cover

/**
 * Ground cover, plant by plant, in perspective: a meadow, a heath or a slope
 * in flower, from its far edge `top` (the ground's line, [x, y] points left to
 * right) down past the foot of the picture. It is painted back to front in
 * rows, each plant the size its distance makes it — `far` pixels across at
 * the line, `near` at the foot — over the ground beneath them (`ground`, the
 * dark between the plants). Far off, a plant is a fleck or two of colour;
 * near, its leaves, blades and flowers one by one.
 *
 * `plants` are the kinds that grow there, each { kind, share, colours,
 * flower?, leaves?, centre?, height?, drifts? }: kind is 'blades' (grass),
 * 'tuft' (a bush of small leaves: heather, bilberry, moss), 'spike' (a lupin's
 * tower of florets), 'daisy' (a head of white or coloured rays on a leafy
 * stem) or 'bell' (a tulip's cup); `share` how many of the plants are this
 * kind, and `drifts` how strongly they gather together in drifts of their own.
 *
 * The light comes from `light` ([x, y] in the picture), so every plant is lit
 * on that side and its top; `fog` ([colour, amount]) swallows the far rows,
 * `pool` ({ x, y, r, ambient, squash }) gathers the light into a patch, as a
 * sunbeam falling on the ground does, and `patches` (how much) leaves the field
 * in the shade of cloud here and there. The plants lean with `wind`, grow as
 * thick as `density`; `bottom` is where the ground's depth runs out, below the
 * picture, and with `focus` ({ from, blur }) the rows nearer than `from` (as a
 * depth, 0 to 1) are softened as a lens leaves what is too close.
 */
export function carpet(w, h, { top, far = 1.4, near = 16, ground = '#101010', plants, light = [-0.5, -1], fog = null, pool = null, density = 1, wind = 0.15, bottom = h + 30, patches = 0.35, focus = null, seed = 1 }) {
  const f = frame(w, h);
  // the nearest rows, nearer than the focus, are painted apart and softened, as a lens would leave them
  const close = focus ? frame(w, h) : null;
  const line = sampleLine(top, w);
  const rnd = random(seed);
  const noise = turbulence(seed + 3, 1, 1);
  const G = rgb(ground);
  const fogC = fog ? rgb(fog[0]) : null;
  const fogK = fog ? fog[1] : 0;
  const L = Math.hypot(light[0], light[1]) || 1;
  const lx = light[0] / L;
  const kinds = plants.map((pl) => ({ ...pl, cols: pl.colours.map(rgb), flowerCols: (pl.flower ?? []).map(rgb) }));
  // the depth of a point: 0 on the far line, 1 at the foot
  const depthAt = (x, y) => clamp((y - line[clamp(Math.round(x), 0, w - 1)]) / Math.max(1, bottom - line[clamp(Math.round(x), 0, w - 1)]), 0, 1);
  const scaleAt = (t) => far + (near - far) * t;
  // the light on the ground: falling off from the pool, if there is one
  const poolAt = (x, y) => {
    if (!pool) return 1;
    const d = Math.hypot(x - pool.x, (y - pool.y) / (pool.squash ?? 0.4)) / pool.r;
    return (pool.ambient ?? 0.3) + (1 - (pool.ambient ?? 0.3)) * Math.max(0, 1 - d) ** 1.4;
  };
  // fog: the colour toward the fog colour by depth (the far rows most); clumped, as fog lies
  const fogAt = (x, y, t) => (fogC ? clamp(fogK * (1 - t) ** 1.6 * (0.8 + 0.4 * noise.fbm(2, x / 260, y / 60, 2)), 0, 1) : 0);
  const tone = (c, k, x, y, t) => {
    const fk = fogAt(x, y, t);
    return [c[0] * k + (fogC ? (fogC[0] - c[0] * k) * fk : 0), c[1] * k + (fogC ? (fogC[1] - c[1] * k) * fk : 0), c[2] * k + (fogC ? (fogC[2] - c[2] * k) * fk : 0)];
  };
  // the ground under the plants
  for (let x = 0; x < w; x++) {
    for (let y = Math.max(0, Math.floor(line[x])); y < h; y++) {
      const a = clamp(y + 1 - line[x], 0, 1);
      const t = depthAt(x, y);
      const k = poolAt(x, y) * (0.85 + 0.3 * noise.fbm(1, x / 40, y / 14, 2));
      const [r, g, b] = tone(G, k, x, y, t);
      const j = (y * w + x) * 4;
      f.px[j] = r * a;
      f.px[j + 1] = g * a;
      f.px[j + 2] = b * a;
      f.px[j + 3] = a;
    }
  }
  // the plants, back to front: rows that follow the ground's line, closer together far off
  let t = 0;
  const span = bottom - line.reduce((a, v) => a + v, 0) / w;
  while (t < 1) {
    const s = scaleAt(t);
    const into = close && t > focus.from ? close : f;
    const xs = [];
    for (let x = -20; x < w + 20; x += (s * 0.75) / density) xs.push(x + (rnd() - 0.5) * s);
    for (const x0 of xs) {
      const ix = clamp(Math.round(x0), 0, w - 1);
      const y0 = line[ix] + (bottom - line[ix]) * (t + (rnd() - 0.5) * 0.004);
      if (y0 > h + near * 2) continue;
      const sc = s * (0.75 + rnd() * 0.5);
      // which kind grows here: each in its own drifts (`drifts`, how strongly), not an even mix
      let sum = 0;
      const weights = kinds.map((k, i) => {
        const v = k.share * Math.exp((k.drifts ?? 1) * noise.fbm(3, x0 / 110 + i * 19.3, y0 / 36 + i * 7.1, 2) * 3);
        sum += v;
        return v;
      });
      let pick = rnd() * sum;
      let kind = kinds[kinds.length - 1];
      for (let i = 0; i < kinds.length; i++) {
        pick -= weights[i];
        if (pick <= 0) {
          kind = kinds[i];
          break;
        }
      }
      // the light on it: the pool's, patchy across the field as the cloud and the lie of the ground make it, and
      // each plant a little in the shade of the next or out of it
      const patch = 1 + patches * noise.fbm(0, x0 / 170 + 31.7, y0 / 55 + 17.3, 3) * 2;
      plant(into, kind, x0, y0, sc, depthAt(x0, y0), { rnd, lx, wind, tone, light: poolAt(x0, y0) * patch * (0.72 + rnd() * 0.42) });
    }
    t += Math.max(0.7, s * 0.32) / span / density;
  }
  if (close) {
    blur(close, focus.blur ?? 1.6);
    over(f, close);
  }
  return f;
}

/** A line given as [x, y] points, as a y for every column. */
function sampleLine(pts, w) {
  const out = new Float32Array(w);
  for (let x = 0, j = 0; x < w; x++) {
    while (j < pts.length - 2 && pts[j + 1][0] < x) j++;
    const [x0, y0] = pts[j];
    const [x1, y1] = pts[j + 1];
    out[x] = y0 + ((y1 - y0) * (x - x0)) / Math.max(1e-6, x1 - x0);
  }
  return out;
}

/** One plant of `kind` standing at (x, y), `s` pixels to the scale of its distance. */
function plant(f, kind, x, y, s, t, { rnd, lx, wind, tone, light }) {
  const cols = kind.cols;
  const pickCol = () => cols[Math.floor(rnd() * cols.length)];
  const lean = (rnd() - 0.5) * 0.5 + wind;
  const height = (kind.height ?? 1) * s;
  const mark = (mx, my, rx, ry, angle, c, k, tip = 0.8) => {
    const [r, g, b] = tone(c, k * light, mx, my, t);
    stamp(f, mx, my, rx, ry, angle, clamp(r, 0, 1), clamp(g, 0, 1), clamp(b, 0, 1), 1, tip);
  };
  if (s < 2.2) {
    // too far to see its parts: a fleck of its colour, its flower if it has one
    const c = kind.flowerCols.length && rnd() < 0.7 ? kind.flowerCols[Math.floor(rnd() * kind.flowerCols.length)] : pickCol();
    mark(x, y - height * 0.6, Math.max(0.6, s * 0.55), Math.max(0.5, s * 0.4), 0, c, 0.9 + rnd() * 0.25, 0.5);
    return;
  }
  if (kind.kind === 'blades') {
    const n = 3 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const len = height * (1.6 + rnd() * 1.6);
      const a = lean + (rnd() - 0.5) * 0.7;
      const bx = x + (rnd() - 0.5) * s * 0.6;
      // lit along the side toward the light, the tip lightest
      const k = 0.7 + rnd() * 0.45 + Math.sin(a) * lx * 0.2;
      mark(bx + Math.sin(a) * len * 0.5, y - Math.cos(a) * len * 0.5, len * 0.5, Math.max(0.35, s * 0.09), a + Math.PI / 2, pickCol(), k, 1);
    }
    return;
  }
  if (kind.kind === 'tuft') {
    // a bush of small leaves: dark inside and under, the top and the lit side catching the light
    const n = 10 + Math.floor(rnd() * 9);
    const bw = s * (0.8 + rnd() * 0.6);
    const tall = height * (1.2 + rnd() * 0.7);
    for (let i = 0; i < n; i++) {
      const u = rnd() * 2 - 1;
      const v = Math.sqrt(rnd());
      const mx = x + u * bw * (1 - v * 0.45) + lean * v * tall;
      const my = y - v * tall;
      const k = 0.3 + v * v * 0.85 + u * lx * 0.22 + (rnd() - 0.5) * 0.24;
      mark(mx, my, s * (0.17 + rnd() * 0.14), s * (0.1 + rnd() * 0.07), rnd() * Math.PI, pickCol(), k, 0.8);
    }
    return;
  }
  if (kind.kind === 'spike') {
    // a lupin: palm-leaves at its foot, then the tower of florets, widest at the bottom, fading to buds at the top
    const leaves = kind.leaves ? rgb(kind.leaves) : cols[0];
    for (let i = 0; i < 4; i++) mark(x + (rnd() - 0.5) * s * 1.2, y - rnd() * s * 0.6, s * 0.4, s * 0.16, rnd() * Math.PI, leaves, 0.5 + rnd() * 0.4, 1);
    const tall = height * (2.4 + rnd() * 1.4);
    const fc = kind.flowerCols.length ? kind.flowerCols[Math.floor(rnd() * kind.flowerCols.length)] : pickCol();
    const bend = lean * 0.4;
    const florets = Math.max(5, Math.round(tall / Math.max(0.8, s * 0.22)));
    for (let i = 0; i < florets; i++) {
      const v = i / florets;
      const cy = y - s * 0.4 - v * tall;
      const cx = x + bend * v * tall;
      const r = s * 0.3 * (1 - v * 0.7);
      for (const side of [-1, 1]) {
        const k = 0.55 + v * 0.55 + side * lx * 0.18 + (rnd() - 0.5) * 0.2;
        mark(cx + side * r * 0.55, cy, r * 0.75, r * 0.5, 0, fc, k, 0.5);
      }
    }
    return;
  }
  if (kind.kind === 'daisy') {
    // a leafy stem, and its head: rays round a centre, tilted toward us
    const leaves = kind.leaves ? rgb(kind.leaves) : cols[0];
    for (let i = 0; i < 5; i++) mark(x + (rnd() - 0.5) * s, y - rnd() * height, s * 0.32, s * 0.12, rnd() * Math.PI, leaves, 0.45 + rnd() * 0.4, 1);
    const hy = y - height * (1 + rnd() * 0.9);
    const hx = x + lean * height;
    const fc = kind.flowerCols.length ? kind.flowerCols[Math.floor(rnd() * kind.flowerCols.length)] : pickCol();
    const r = s * (0.36 + rnd() * 0.16);
    if (r < 1.4) {
      mark(hx, hy, r, r * 0.7, 0, fc, 0.95 + rnd() * 0.15, 0.5);
      return;
    }
    const rays = 12;
    const tilt = 0.55 + rnd() * 0.3;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2 + rnd() * 0.2;
      const px = hx + Math.cos(a) * r * 0.55;
      const py = hy + Math.sin(a) * r * 0.55 * tilt;
      mark(px, py, r * 0.5, r * 0.16, Math.atan2(Math.sin(a) * tilt, Math.cos(a)), fc, 0.9 + Math.sin(a) * -0.1 + rnd() * 0.12, 1);
    }
    const centre = kind.centre ? rgb(kind.centre) : [0.85, 0.7, 0.25];
    mark(hx, hy, r * 0.24, r * 0.2, 0, centre, 0.9, 0.5);
    return;
  }
  if (kind.kind === 'bell') {
    const leaves = kind.leaves ? rgb(kind.leaves) : cols[0];
    for (let i = 0; i < 2; i++) mark(x + (i - 0.5) * s * 0.3, y - height * 0.4, height * 0.45, s * 0.14, -Math.PI / 2 + (i - 0.5) * 0.5, leaves, 0.6 + rnd() * 0.3, 1);
    const hy = y - height * (1.2 + rnd() * 0.5);
    const hx = x + lean * height * 0.5;
    const fc = kind.flowerCols.length ? kind.flowerCols[Math.floor(rnd() * kind.flowerCols.length)] : pickCol();
    const r = s * 0.32;
    mark(hx - r * 0.35, hy, r * 0.42, r * 0.75, 0.1, fc, 0.8, 0.6);
    mark(hx + r * 0.35, hy, r * 0.42, r * 0.75, -0.1, fc, 0.95, 0.6);
    mark(hx, hy - r * 0.1, r * 0.4, r * 0.8, 0, fc, 1.1, 0.6);
  }
}

// ──────────────────────────────────────────────────────────── the night sky

/**
 * A nebula filling the sky: glowing gas in billows folded into each other
 * (fractal noise read through itself, twice over), coloured along `colours`
 * ([stop, '#hex'] from no gas to the brightest), torn by dark lanes of dust
 * (`dust`), brighter toward its `heart` ({ x, y, r, k }) if it has one; and
 * stars over it, `stars` of them, most faint, a few bright with a glow round
 * them, in `starColours`. `scale` is the size of the largest billows in
 * pixels, `warp` how far the noise folds them and `gain` how thick the gas
 * is. Coloured all black, it is the stars alone.
 */
export function nebula(w, h, { colours, dust = 0.6, scale = 420, warp = 3.2, gain = 1, heart = null, stars = 2400, starColours = ['#ffffff', '#fff4dc', '#ffe0b0', '#dcecff'], seed = 1 }) {
  const k = 2;
  const sw = Math.ceil(w / k);
  const sh = Math.ceil(h / k);
  const noise = turbulence(seed, 1, 1);
  const ramp = colours.map(([t, c]) => [t, rgb(c)]);
  const colourAt = (v) => {
    let j = 0;
    while (j < ramp.length - 2 && ramp[j + 1][0] < v) j++;
    const [t0, c0] = ramp[j];
    const [t1, c1] = ramp[j + 1];
    const u = clamp((v - t0) / Math.max(1e-6, t1 - t0), 0, 1);
    return [c0[0] + (c1[0] - c0[0]) * u, c0[1] + (c1[1] - c0[1]) * u, c0[2] + (c1[2] - c0[2]) * u];
  };
  const small = frame(sw, sh);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const px = (x * k) / scale;
      const py = (y * k) / scale;
      const qx = noise.fbm(0, px, py, 4);
      const qy = noise.fbm(1, px + 5.2, py + 1.3, 4);
      const rx = noise.fbm(2, px + warp * qx + 1.7, py + warp * qy + 9.2, 4);
      const ry = noise.fbm(3, px + warp * qx + 8.3, py + warp * qy + 2.8, 4);
      const v = noise.fbm(0, px + warp * rx + 3.1, py + warp * ry + 7.7, 6);
      // the gas, brightest where the folds pile up (and toward its heart, if it is given one: { x, y, r, k })
      const toward = heart ? heart.k * Math.exp(-((x * k - heart.x) ** 2 + (y * k - heart.y) ** 2) / (heart.r * heart.r)) : 0;
      let gas = clamp((v * 1.25 + 0.42) * gain + Math.hypot(rx, ry) * 0.3 - 0.08 + toward, 0, 1);
      // the dust: dark clouds in front of it, ragged, with threads running off them along the folds
      const cloud = smooth(0.02, 0.3, noise.fbm(3, px * 1.3 + qx * 0.8 + 4.4, py * 1.3 + qy * 0.8 + 1.9, 6));
      const lane = 1 - smooth(0, 0.1, Math.abs(noise.fbm(2, px * 1.6 + qx * 1.5, py * 1.6 + qy * 1.5, 5)));
      gas *= 1 - dust * Math.max(cloud * 0.85, lane * 0.22);
      const [r, g, b] = colourAt(gas);
      const i = (y * sw + x) * 4;
      small.px[i] = r;
      small.px[i + 1] = g;
      small.px[i + 2] = b;
      small.px[i + 3] = 1;
    }
  }
  const f = resize(small, w, h);
  // the stars: most faint, a few bright, as the sky's are; a bright one glows
  const rnd = random(seed + 1);
  const cols = starColours.map(rgb);
  for (let s = 0; s < stars; s++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const m = rnd() ** 10;
    const c = cols[Math.floor(rnd() * cols.length)];
    glint(f, x, y, 0.4 + m * 0.7, c, Math.min(1.5, 0.12 + m * 1.7 + rnd() ** 3 * 0.6));
    if (m > 0.45) glint(f, x, y, 2 + m * 4, c, 0.05 + m * 0.15);
  }
  return f;
}

/** A point of light laid over a frame as light is (added, never darkening): a soft round `r` across, of `amount`. */
export function glint(f, x, y, r, [cr, cg, cb], amount) {
  const reach = Math.ceil(r * 2.5);
  const x0 = Math.max(0, Math.floor(x - reach));
  const x1 = Math.min(f.w - 1, Math.ceil(x + reach));
  const y0 = Math.max(0, Math.floor(y - reach));
  const y1 = Math.min(f.h - 1, Math.ceil(y + reach));
  const inv = 1 / (2 * r * r);
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const d2 = (px + 0.5 - x) ** 2 + (py + 0.5 - y) ** 2;
      const a = Math.exp(-d2 * inv) * amount;
      if (a < 0.002) continue;
      const i = (py * f.w + px) * 4;
      f.px[i] = 1 - (1 - f.px[i]) * (1 - Math.min(1, cr * a));
      f.px[i + 1] = 1 - (1 - f.px[i + 1]) * (1 - Math.min(1, cg * a));
      f.px[i + 2] = 1 - (1 - f.px[i + 2]) * (1 - Math.min(1, cb * a));
    }
  }
}

// ──────────────────────────────────────────────────────────── oil on canvas

/**
 * Oil paint on canvas: the frame given the relief of a painting, lit from
 * `light` ([x, y], where it comes from) — the canvas's weave, `weave` pixels
 * a thread, showing through where the paint is thin, and over it the paint's
 * own ridges: short strokes running with the hand's sweep round about them,
 * scumbled, and thickest where the picture is light, as a painter loads the
 * brush for the lights (`strokes`, how many; `length` and `width` in pixels).
 * With `paintover` the strokes carry the picture's own colour too, so it is
 * painted, not only embossed. `relief` is how strongly it all catches the
 * light.
 */
export function impasto(f, { weave = 2.6, canvas = 0.5, strokes = 1, length = 16, width = 3, light = [-0.6, -0.8], relief = 1, paintover = 0, seed = 1 }) {
  const { w, h } = f;
  const N = w * h;
  const H = new Float32Array(N);
  const noise = turbulence(seed, 1, 1);
  // the weave: threads one way and the other, over and under
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tx = Math.abs(Math.sin((Math.PI * x) / weave));
      const ty = Math.abs(Math.sin((Math.PI * y) / weave));
      const over = (Math.floor(x / weave) + Math.floor(y / weave)) % 2 ? 1 : 0.55;
      H[y * w + x] = (tx * over + ty * (1.55 - over)) * 0.5 * canvas + noise.plain(0, x / 3.1, y / 3.1) * 0.12 * canvas;
    }
  }
  // the paint: strokes laid over it, each along a short bent path — its colour the picture's there, a little
  // off, if it is painted over (`paintover`, how fully), and its bristles raising ridges in the paint
  const src = paintover ? new Float32Array(f.px) : f.px;
  const rnd = random(seed + 5);
  const count = Math.round((N / (length * width * 1.6)) * strokes);
  const at = (x, y) => (clamp(Math.round(y), 0, h - 1) * w + clamp(Math.round(x), 0, w - 1)) * 4;
  const lightAt = (x, y) => {
    const i = at(x, y);
    return 0.2126 * src[i] + 0.7152 * src[i + 1] + 0.0722 * src[i + 2];
  };
  for (let s = 0; s < count; s++) {
    let x = rnd() * w;
    let y = rnd() * h;
    const load = 0.1 + lightAt(x, y) * 1.3;
    const thick = rnd() < load;
    if (!thick && !paintover) continue;
    // laid the way the painter's hand was going round about there, give or take
    let a = noise.fbm(1, x / 260, y / 260, 2) * 3 + (rnd() - 0.5) * 0.9;
    const turn = (rnd() - 0.5) * 0.2;
    const len = length * (0.5 + rnd());
    const wid = width * (0.6 + rnd() * 0.8);
    const bristles = 3 + Math.floor(rnd() * 3);
    const lift = (0.5 + rnd() * 0.7) * (thick ? 1 : 0.25);
    const ci = at(x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.5);
    const jit = 1 + (rnd() - 0.5) * 0.12;
    const cr = clamp(src[ci] * jit, 0, 1);
    const cg = clamp(src[ci + 1] * jit, 0, 1);
    const cb = clamp(src[ci + 2] * jit, 0, 1);
    for (let d = 0; d < len; d += 0.8) {
      const nx = -Math.sin(a);
      const ny = Math.cos(a);
      const fadeIn = Math.min(1, d / 3, (len - d) / 4);
      if (paintover) {
        // a stroke stops where the picture under it turns another colour, so the shapes keep their edges
        const k = at(x, y);
        if (Math.abs(src[k] - cr) + Math.abs(src[k + 1] - cg) + Math.abs(src[k + 2] - cb) > 0.2) break;
        if (d % 1.6 < 0.8) stamp(f, x, y, 1.4, wid / 2, a, cr, cg, cb, paintover * Math.min(1, fadeIn + 0.3), 0.5);
      }
      for (let b = 0; b < bristles; b++) {
        const off = (b / (bristles - 1 || 1) - 0.5) * wid;
        const bx = Math.round(x + nx * off);
        const by = Math.round(y + ny * off);
        if (bx < 0 || by < 0 || bx >= w || by >= h) continue;
        H[by * w + bx] += 0.22 * lift * fadeIn * (0.7 + 0.6 * ((b * 7 + s) % 3) / 2);
      }
      x += Math.cos(a) * 0.8;
      y += Math.sin(a) * 0.8;
      a += turn;
    }
  }
  const Hs = blurField(H, w, h, 0.7);
  // lit: each pixel's slope against the light, brighter facing it and darker turned from it
  const L = Math.hypot(light[0], light[1], 1.2);
  const lx = light[0] / L;
  const ly = light[1] / L;
  const lz = 1.2 / L;
  const flat = lz;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const hx = (Hs[i + (x < w - 1 ? 1 : 0)] - Hs[i - (x > 0 ? 1 : 0)]) * 0.5;
      const hy = (Hs[i + (y < h - 1 ? w : 0)] - Hs[i - (y > 0 ? w : 0)]) * 0.5;
      const nx = -hx * 3 * relief;
      const ny = -hy * 3 * relief;
      const nl = Math.hypot(nx, ny, 1);
      const shade = (nx * lx + ny * ly + lz) / nl - flat;
      const j = i * 4;
      const lum = 0.2126 * f.px[j] + 0.7152 * f.px[j + 1] + 0.0722 * f.px[j + 2];
      const k = 1 + shade * 1.3;
      // the ridges facing the light catch a glint of it, most on the light paint
      const spec = Math.max(0, shade) ** 2 * 1.2 * (0.3 + lum);
      for (let c = 0; c < 3; c++) f.px[j + c] = clamp(f.px[j + c] * k + spec, 0, 1);
    }
  }
}

// ──────────────────────────────────────────────────────────── ink on paper

/**
 * Ink washed onto wet paper: a sheet of `paper` with `ink` laid over it in a
 * wash — heavier toward the top (`stops`, [y fraction, strength] from top to
 * bottom), pooling in blooms with dark edges where the wet ink dried
 * (`blooms`), dragged across in streaks by a broad brush (`streaks`) — and
 * the paper's own fibre in it.
 */
export function wash(w, h, { paper, ink, stops = [[0, 0.7], [1, 0.4]], blooms = 0.5, streaks = 0.5, fibre = 0.5, seed = 1 }) {
  const f = frame(w, h);
  const P = rgb(paper);
  const I = rgb(ink);
  const noise = turbulence(seed, 1, 1);
  const base = (y) => {
    const v = y / h;
    let j = 0;
    while (j < stops.length - 2 && stops[j + 1][0] < v) j++;
    const [t0, a] = stops[j];
    const [t1, b] = stops[j + 1];
    return a + (b - a) * clamp((v - t0) / Math.max(1e-6, t1 - t0), 0, 1);
  };
  const D = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // the blooms: where the wash ran, in soft-edged pools
      const warpX = noise.fbm(1, x / 300, y / 300, 2) * 1.4;
      const bloom = smooth(-0.04, 0.1, noise.fbm(0, x / 260 + warpX, y / 190, 4));
      const drag = noise.fbm(2, x / 700, y / 26, 3) * 0.6 + noise.fbm(3, x / 260, y / 10, 2) * 0.2;
      D[y * w + x] = clamp(base(y) * (0.55 + 0.6 * bloom * blooms + (1 - blooms) * 0.3) + drag * streaks * 0.35, 0, 1);
    }
  }
  // where a bloom dried its edge went dark: the ink's slope, picked out
  const soft = blurField(D, w, h, 2.2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const gx = soft[i + (x < w - 1 ? 1 : 0)] - soft[i - (x > 0 ? 1 : 0)];
      const gy = soft[i + (y < h - 1 ? w : 0)] - soft[i - (y > 0 ? w : 0)];
      const edge = clamp(Math.hypot(gx, gy) * 5 * blooms, 0, 0.2);
      const grain = 1 + (noise.plain(1, x / 1.3, y / 9) * 0.6 + noise.plain(2, x / 0.9, y / 0.9) * 0.4) * 0.12 * fibre;
      const d = clamp((D[i] + edge) * grain, 0, 1);
      const j = i * 4;
      // ink is laid on as a stain, darkening the paper toward the ink's own colour
      f.px[j] = P[0] * (1 - d) + I[0] * d;
      f.px[j + 1] = P[1] * (1 - d) + I[1] * d;
      f.px[j + 2] = P[2] * (1 - d) + I[2] * d;
      f.px[j + 3] = 1;
    }
  }
  return f;
}
