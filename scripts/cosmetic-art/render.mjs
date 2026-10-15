/**
 * The compositor: what turns a scene's layers into a picture with light in it.
 *
 * A background is drawn as layers — sky, far mountains, mist, trees, the
 * figure, the grass at the viewer's feet — each an SVG of the whole canvas.
 * Each layer is rasterised on its own, so it can be softened by its distance
 * (depth of field) and washed toward the haze, and then laid over the ones
 * behind it. Between layers, effects work on what has been built so far:
 * light breaking through gaps as shafts (screen-space light scattering, the
 * radial blur of everything bright toward the light), water reflecting what
 * stands above it, and a painter's pass that turns edges into brushwork. At
 * the end the frame is graded like film: glow where it is bright, colour
 * pushed toward the scene's mood, a vignette, and a fine seeded grain.
 *
 * Everything here is plain arithmetic on typed arrays — no randomness that
 * is not seeded, no library whose output could change under it but sharp's
 * SVG rasteriser, which the generator relied on already — so the same scene
 * makes the same pixels on every machine.
 *
 * Pixels are premultiplied RGBA floats in [0, 1].
 */
import sharp from 'sharp';
import { random } from './kit.mjs';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function frame(w, h) {
  return { w, h, px: new Float32Array(w * h * 4) };
}

function clone(f) {
  return { w: f.w, h: f.h, px: new Float32Array(f.px) };
}

/** An SVG (the whole canvas) as a premultiplied frame, rendered at 1/scale and brought back up. */
export async function rasterise(svg, w, h, scale = 1) {
  const { data, info } = await sharp(Buffer.from(svg), { density: 72 / scale }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const small = frame(info.width, info.height);
  const p = small.px;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255;
    p[i] = (data[i] / 255) * a;
    p[i + 1] = (data[i + 1] / 255) * a;
    p[i + 2] = (data[i + 2] / 255) * a;
    p[i + 3] = a;
  }
  return info.width === w && info.height === h ? small : resize(small, w, h);
}

/** Bilinear resampling to w × h. */
export function resize(src, w, h) {
  const out = frame(w, h);
  const sx = src.w / w;
  const sy = src.h / h;
  const s = src.px;
  const o = out.px;
  for (let y = 0; y < h; y++) {
    const fy = clamp((y + 0.5) * sy - 0.5, 0, src.h - 1);
    const y0 = Math.floor(fy);
    const y1 = Math.min(y0 + 1, src.h - 1);
    const ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = clamp((x + 0.5) * sx - 0.5, 0, src.w - 1);
      const x0 = Math.floor(fx);
      const x1 = Math.min(x0 + 1, src.w - 1);
      const tx = fx - x0;
      const a = (y0 * src.w + x0) * 4;
      const b = (y0 * src.w + x1) * 4;
      const c = (y1 * src.w + x0) * 4;
      const d = (y1 * src.w + x1) * 4;
      const k = (y * w + x) * 4;
      for (let ch = 0; ch < 4; ch++) {
        const top = s[a + ch] + (s[b + ch] - s[a + ch]) * tx;
        const bot = s[c + ch] + (s[d + ch] - s[c + ch]) * tx;
        o[k + ch] = top + (bot - top) * ty;
      }
    }
  }
  return out;
}

/** Averages f × f blocks. */
function shrink(src, f) {
  const w = Math.floor(src.w / f);
  const h = Math.floor(src.h / f);
  const out = frame(w, h);
  const inv = 1 / (f * f);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = (y * w + x) * 4;
      for (let dy = 0; dy < f; dy++) {
        for (let dx = 0; dx < f; dx++) {
          const s = ((y * f + dy) * src.w + x * f + dx) * 4;
          out.px[k] += src.px[s];
          out.px[k + 1] += src.px[s + 1];
          out.px[k + 2] += src.px[s + 2];
          out.px[k + 3] += src.px[s + 3];
        }
      }
      out.px[k] *= inv;
      out.px[k + 1] *= inv;
      out.px[k + 2] *= inv;
      out.px[k + 3] *= inv;
    }
  }
  return out;
}

/** Radii of three box blurs that together come to a Gaussian of sigma. */
function boxRadii(sigma) {
  const n = 3;
  const ideal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(ideal);
  if (wl % 2 === 0) wl -= 1;
  const wu = wl + 2;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  const out = [];
  for (let i = 0; i < n; i++) out.push(((i < m ? wl : wu) - 1) / 2);
  return out;
}

function boxPass(src, dst, w, h, r, horizontal) {
  const line = horizontal ? w : h;
  const lines = horizontal ? h : w;
  const step = horizontal ? 4 : w * 4;
  const inv = 1 / (2 * r + 1);
  for (let k = 0; k < lines; k++) {
    const base = horizontal ? k * w * 4 : k * 4;
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let j = -r; j <= r; j++) sum += src[base + clamp(j, 0, line - 1) * step + c];
      for (let i = 0; i < line; i++) {
        dst[base + i * step + c] = sum * inv;
        sum += src[base + Math.min(i + r + 1, line - 1) * step + c] - src[base + Math.max(i - r, 0) * step + c];
      }
    }
  }
}

function blurInPlace(f, sigma) {
  if (sigma < 0.4) return f;
  const tmp = new Float32Array(f.px.length);
  for (const r of boxRadii(sigma)) {
    if (r < 1) continue;
    boxPass(f.px, tmp, f.w, f.h, r, true);
    boxPass(tmp, f.px, f.w, f.h, r, false);
  }
  return f;
}

/** A Gaussian blur; wide ones are done small and brought back up, which looks the same and is far quicker. */
export function blur(f, sigma) {
  if (sigma < 0.4) return f;
  const k = sigma >= 18 ? 4 : sigma >= 7 ? 2 : 1;
  if (k === 1) return blurInPlace(f, sigma);
  const small = blurInPlace(shrink(f, k), sigma / k);
  const big = resize(small, f.w, f.h);
  f.px.set(big.px);
  return f;
}

/** Lays `src` over `dst`. */
export function over(dst, src, opacity = 1) {
  const d = dst.px;
  const s = src.px;
  for (let i = 0; i < d.length; i += 4) {
    const a = s[i + 3] * opacity;
    if (a <= 0) continue;
    const keep = 1 - a;
    d[i] = s[i] * opacity + d[i] * keep;
    d[i + 1] = s[i + 1] * opacity + d[i + 1] * keep;
    d[i + 2] = s[i + 2] * opacity + d[i + 2] * keep;
    d[i + 3] = a + d[i + 3] * keep;
  }
}

/** Adds light: `src` brightens `dst` the way light does, without darkening anything. */
export function screen(dst, src, opacity = 1) {
  const d = dst.px;
  const s = src.px;
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const a = d[i + c];
      const b = s[i + c] * opacity;
      d[i + c] = a + b - a * b;
    }
  }
}

/** Washes a layer toward a colour, by its alpha — distance, in effect. */
export function haze(f, [r, g, b], amount) {
  if (amount <= 0) return;
  const p = f.px;
  for (let i = 0; i < p.length; i += 4) {
    const a = p[i + 3];
    p[i] += (r * a - p[i]) * amount;
    p[i + 1] += (g * a - p[i + 1]) * amount;
    p[i + 2] += (b * a - p[i + 2]) * amount;
  }
}

/** '#rrggbb' as [0..1] floats, in the same space the frames are in. */
export function rgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}

const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * Light scattering: what is bright (above `threshold`) is smeared toward the
 * light at (x, y), each step a little dimmer, so anything standing in front
 * of the light throws shafts through the haze.
 */
export function rays(f, { x, y, threshold = 0.55, strength = 0.8, decay = 0.965, density = 0.9, samples = 48, colour = '#ffffff', reach = 1, detail = 3 }) {
  const k = detail;
  const small = shrink(f, k);
  const w = small.w;
  const h = small.h;
  const lx = x / k;
  const ly = y / k;
  const src = new Float32Array(w * h * 3);
  const maxD = Math.hypot(w, h) * reach;
  for (let i = 0, j = 0; i < small.px.length; i += 4, j += 3) {
    const r = small.px[i];
    const g = small.px[i + 1];
    const b = small.px[i + 2];
    const l = luma(r, g, b);
    const px = (j / 3) % w;
    const py = Math.floor(j / 3 / w);
    const fall = Math.max(0, 1 - Math.hypot(px - lx, py - ly) / maxD);
    const t = Math.max(0, (l - threshold) / (1 - threshold)) * fall;
    src[j] = r * t;
    src[j + 1] = g * t;
    src[j + 2] = b * t;
  }
  const out = frame(w, h);
  const tint = rgb(colour);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const dx = ((lx - px) * density) / samples;
      const dy = ((ly - py) * density) / samples;
      let sx = px;
      let sy = py;
      let weight = 1;
      let ar = 0;
      let ag = 0;
      let ab = 0;
      for (let s = 0; s < samples; s++) {
        sx += dx;
        sy += dy;
        const ix = clamp(Math.round(sx), 0, w - 1);
        const iy = clamp(Math.round(sy), 0, h - 1);
        const q = (iy * w + ix) * 3;
        ar += src[q] * weight;
        ag += src[q + 1] * weight;
        ab += src[q + 2] * weight;
        weight *= decay;
      }
      const o = (py * w + px) * 4;
      out.px[o] = (ar / samples) * strength * tint[0];
      out.px[o + 1] = (ag / samples) * strength * tint[1];
      out.px[o + 2] = (ab / samples) * strength * tint[2];
      out.px[o + 3] = 1;
    }
  }
  blurInPlace(out, 0.8);
  screen(f, resize(out, f.w, f.h));
}

/**
 * Light from one place, as a fire or a lamp gives it: each pixel of the layer
 * darkened by its distance from (x, y), so what stands near the light is lit
 * and what stands off in the dark keeps only `ambient` of its colour. `squash`
 * shortens the reach up and down (a light on the ground lights a ring).
 */
export function falloff(f, { x, y, r, ambient = 0.25, squash = 1, power = 1.6 }) {
  const { w, h } = f;
  const p = f.px;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = (py * w + px) * 4;
      if (p[i + 3] <= 0) continue;
      const t = Math.min(1, Math.hypot(px - x, (py - y) / squash) / r);
      const k = ambient + (1 - ambient) * (1 - t) ** power;
      p[i] *= k;
      p[i + 1] *= k;
      p[i + 2] *= k;
    }
  }
}

/**
 * Rim light: the edges of a layer's shapes that face the light (at x, y) catch
 * it — where a pixel is inside a shape and the pixel `width` toward the light
 * is not, it glows `colour`. What makes a silhouette against the sun look
 * backlit rather than cut out.
 */
export function rimLight(layer, { x, y, colour, width = 3, strength = 1, soften = 1, reach = 0 }) {
  const { w, h } = layer;
  const c = rgb(colour);
  const rim = frame(w, h);
  const p = layer.px;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = (py * w + px) * 4;
      const a = p[i + 3];
      if (a < 0.05) continue;
      const dx = x - px;
      const dy = y - py;
      const d = Math.hypot(dx, dy) || 1;
      const sx = Math.round(px + (dx / d) * width);
      const sy = Math.round(py + (dy / d) * width);
      const outside = sx < 0 || sy < 0 || sx >= w || sy >= h ? 1 : 1 - p[(sy * w + sx) * 4 + 3];
      // nearer the light, the brighter the rim; `reach` (pixels) is where it fades out
      const fall = reach ? Math.max(0, 1 - d / reach) : 1;
      const k = a * outside * strength * fall * fall;
      rim.px[i] = c[0] * k;
      rim.px[i + 1] = c[1] * k;
      rim.px[i + 2] = c[2] * k;
      rim.px[i + 3] = 0;
    }
  }
  if (soften) blur(rim, soften);
  for (let i = 0; i < p.length; i += 4) {
    const a = p[i + 3];
    if (a <= 0) continue;
    for (let ch = 0; ch < 3; ch++) {
      const v = Math.min(rim.px[i + ch], a);
      p[i + ch] = p[i + ch] + v - (p[i + ch] * v) / Math.max(a, 1e-6);
    }
  }
}

// ──────────────────────────────────────────────────────────── rough edges

const PERLIN_B = 0x100;
const PERLIN_N = 0x1000;

/**
 * The noise of SVG's feTurbulence (type fractalNoise, no stitching), from the
 * reference code in the Filter Effects specification: the same lattice, the
 * same gradients from the same seeded generator, so a seed draws the same
 * field here as it would in an SVG filter. Channel `k` of the four is
 * returned by `at(k, x, y)` in [0, 1].
 */
function turbulence(seed, freq, octaves) {
  const M = 2147483647;
  const next = (s) => {
    const r = 16807 * (s % 127773) - 2836 * Math.floor(s / 127773);
    return r <= 0 ? r + M : r;
  };
  let s = Math.trunc(seed);
  if (s <= 0) s = -(s % (M - 1)) + 1;
  if (s > M - 1) s = M - 1;
  const LEN = PERLIN_B + PERLIN_B + 2;
  const lattice = new Int32Array(LEN);
  const grad = new Float64Array(4 * LEN * 2);
  for (let k = 0; k < 4; k++) {
    for (let i = 0; i < PERLIN_B; i++) {
      lattice[i] = i;
      const g = (k * LEN + i) * 2;
      for (let j = 0; j < 2; j++) {
        s = next(s);
        grad[g + j] = ((s % (PERLIN_B + PERLIN_B)) - PERLIN_B) / PERLIN_B;
      }
      const len = Math.sqrt(grad[g] * grad[g] + grad[g + 1] * grad[g + 1]);
      grad[g] /= len;
      grad[g + 1] /= len;
    }
  }
  for (let i = PERLIN_B - 1; i > 0; i--) {
    const k = lattice[i];
    s = next(s);
    const j = s % PERLIN_B;
    lattice[i] = lattice[j];
    lattice[j] = k;
  }
  for (let i = 0; i < PERLIN_B + 2; i++) {
    lattice[PERLIN_B + i] = lattice[i];
    for (let k = 0; k < 4; k++) {
      grad[(k * LEN + PERLIN_B + i) * 2] = grad[(k * LEN + i) * 2];
      grad[(k * LEN + PERLIN_B + i) * 2 + 1] = grad[(k * LEN + i) * 2 + 1];
    }
  }
  const curve = (t) => t * t * (3 - 2 * t);
  const noise2 = (k, vx, vy) => {
    const tx = vx + PERLIN_N;
    const ty = vy + PERLIN_N;
    const ix = Math.trunc(tx);
    const iy = Math.trunc(ty);
    const rx0 = tx - ix;
    const ry0 = ty - iy;
    const rx1 = rx0 - 1;
    const ry1 = ry0 - 1;
    const bx0 = ix & 0xff;
    const bx1 = (ix + 1) & 0xff;
    const by0 = iy & 0xff;
    const by1 = (iy + 1) & 0xff;
    const i = lattice[bx0];
    const j = lattice[bx1];
    const base = k * LEN;
    const q00 = (base + lattice[i + by0]) * 2;
    const q10 = (base + lattice[j + by0]) * 2;
    const q01 = (base + lattice[i + by1]) * 2;
    const q11 = (base + lattice[j + by1]) * 2;
    const sx = curve(rx0);
    const sy = curve(ry0);
    const u0 = rx0 * grad[q00] + ry0 * grad[q00 + 1];
    const v0 = rx1 * grad[q10] + ry0 * grad[q10 + 1];
    const a = u0 + sx * (v0 - u0);
    const u1 = rx0 * grad[q01] + ry1 * grad[q01 + 1];
    const v1 = rx1 * grad[q11] + ry1 * grad[q11 + 1];
    const b = u1 + sx * (v1 - u1);
    return a + sy * (b - a);
  };
  const [fx, fy] = Array.isArray(freq) ? freq : [freq, freq];
  return {
    at(k, x, y) {
      let sum = 0;
      let vx = x * fx;
      let vy = y * fy;
      let ratio = 1;
      for (let o = 0; o < octaves; o++) {
        sum += noise2(k, vx, vy) / ratio;
        vx *= 2;
        vy *= 2;
        ratio *= 2;
      }
      // as the filter stores it: a byte, then read back as a fraction
      return Math.trunc(clamp((sum * 255 + 255) / 2, 0, 255) + 0.5) / 255;
    },
  };
}

/**
 * Rough edges: every pixel of the layer is taken from a little way off, in a
 * direction the noise picks, so straight edges break up into leaf and twig.
 * It is what an SVG feDisplacementMap over feTurbulence does (and the same
 * noise), with the sample read between pixels as a renderer would — but done
 * here only around what the layer holds, which is far quicker than the filter.
 * `scale` is the most a pixel moves, across both ways, in pixels.
 */
export function roughen(f, { scale = 8, freq = 0.08, seed = 1, octaves = 2 }) {
  const { w, h } = f;
  const p = f.px;
  // only where something is, or is within reach of being moved to
  let x0 = w;
  let x1 = -1;
  let y0 = h;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (p[(y * w + x) * 4 + 3] <= 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  const out = frame(w, h);
  if (x1 < 0) return out;
  const pad = Math.ceil(Math.abs(scale) / 2) + 1;
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w - 1, x1 + pad);
  y1 = Math.min(h - 1, y1 + pad);
  const noise = turbulence(seed, freq, octaves);
  const o = out.px;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const sx = x + scale * (noise.at(0, x, y) - 0.5);
      const sy = y + scale * (noise.at(1, x, y) - 0.5);
      const ix = Math.floor(sx);
      const iy = Math.floor(sy);
      const tx = sx - ix;
      const ty = sy - iy;
      const i = (y * w + x) * 4;
      for (let dy = 0; dy < 2; dy++) {
        const yy = iy + dy;
        if (yy < 0 || yy >= h) continue;
        const wy = dy ? ty : 1 - ty;
        for (let dx = 0; dx < 2; dx++) {
          const xx = ix + dx;
          if (xx < 0 || xx >= w) continue;
          const k = wy * (dx ? tx : 1 - tx);
          if (k === 0) continue;
          const j = (yy * w + xx) * 4;
          o[i] += p[j] * k;
          o[i + 1] += p[j + 1] * k;
          o[i + 2] += p[j + 2] * k;
          o[i + 3] += p[j + 3] * k;
        }
      }
    }
  }
  return out;
}

/** Seeded value noise on a grid of `cell` pixels, smoothly interpolated, in [-1, 1]. */
function valueNoise(w, h, cell, rnd) {
  const gw = Math.ceil(w / cell) + 2;
  const gh = Math.ceil(h / cell) + 2;
  const grid = new Float32Array(gw * gh);
  for (let i = 0; i < grid.length; i++) grid[i] = rnd() * 2 - 1;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = y / cell;
    const y0 = Math.floor(fy);
    let ty = fy - y0;
    ty = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < w; x++) {
      const fx = x / cell;
      const x0 = Math.floor(fx);
      let tx = fx - x0;
      tx = tx * tx * (3 - 2 * tx);
      const a = grid[y0 * gw + x0];
      const b = grid[y0 * gw + x0 + 1];
      const c = grid[(y0 + 1) * gw + x0];
      const d = grid[(y0 + 1) * gw + x0 + 1];
      const top = a + (b - a) * tx;
      out[y * w + x] = top + (c + (d - c) * tx - top) * ty;
    }
  }
  return out;
}

/**
 * Texture: the colour wanders a little, in blotches of several sizes — the
 * unevenness of paint on canvas, which the painter's pass then turns into
 * strokes. `amount` is how far, `cells` the blotch sizes in pixels.
 */
export function texture(f, { amount = 0.05, cells = [48, 14, 5], seed = 1, warm = 0 }) {
  const rnd = random(seed);
  const layers = cells.map((c) => valueNoise(f.w, f.h, c, rnd));
  const p = f.px;
  for (let i = 0, j = 0; i < p.length; i += 4, j++) {
    let v = 0;
    for (let k = 0; k < layers.length; k++) v += layers[k][j] / (k + 1);
    v *= amount;
    p[i] = Math.max(0, p[i] * (1 + v) + v * warm * 0.2);
    p[i + 1] = Math.max(0, p[i + 1] * (1 + v));
    p[i + 2] = Math.max(0, p[i + 2] * (1 + v) - v * warm * 0.2);
  }
}

/** Glow: the brightest parts spill softly over what is around them. */
export function bloom(f, { threshold = 0.7, strength = 0.45, radius = 24, tint = null }) {
  const b = frame(f.w, f.h);
  const t = tint ? rgb(tint) : [1, 1, 1];
  for (let i = 0; i < f.px.length; i += 4) {
    const l = luma(f.px[i], f.px[i + 1], f.px[i + 2]);
    const k = Math.max(0, (l - threshold) / (1 - threshold));
    b.px[i] = f.px[i] * k * t[0];
    b.px[i + 1] = f.px[i + 1] * k * t[1];
    b.px[i + 2] = f.px[i + 2] * k * t[2];
    b.px[i + 3] = 1;
  }
  const wide = clone(b);
  blur(b, radius * 0.35);
  blur(wide, radius);
  screen(f, b, strength * 0.6);
  screen(f, wide, strength);
}

/**
 * Water from `y` down: what stands above is mirrored into it, broken by
 * ripples that widen toward the viewer, softened, darkened toward `deep`, and
 * more mirror than water far off (the Fresnel effect).
 */
export function reflect(f, { y, deep, near = 0.55, far = 0.9, ripple = 3, wave = 0.09, soften = 2, seed = 1 }) {
  const { w, h } = f;
  const water = frame(w, h);
  const rnd = random(seed);
  const phase = rnd() * 6.283;
  const d = rgb(deep);
  const y0 = Math.round(y);
  for (let yy = y0; yy < h; yy++) {
    const t = (yy - y0) / Math.max(1, h - y0);
    const sy = clamp(Math.round(y0 - (yy - y0) - 1), 0, h - 1);
    const amp = ripple * (0.3 + 1.7 * t);
    const shift = Math.sin(yy * wave * (1 + t * 0.4) + phase) * amp + Math.sin(yy * wave * 2.7 + phase * 1.7) * amp * 0.4;
    const mirror = far + (near - far) * t;
    for (let x = 0; x < w; x++) {
      const sx = clamp(Math.round(x + shift), 0, w - 1);
      const s = (sy * w + sx) * 4;
      const o = (yy * w + x) * 4;
      water.px[o] = f.px[s] * mirror + d[0] * (1 - mirror);
      water.px[o + 1] = f.px[s + 1] * mirror + d[1] * (1 - mirror);
      water.px[o + 2] = f.px[s + 2] * mirror + d[2] * (1 - mirror);
      water.px[o + 3] = 1;
    }
  }
  blur(water, soften);
  for (let yy = y0; yy < h; yy++) {
    for (let x = 0; x < w; x++) {
      const o = (yy * w + x) * 4;
      f.px[o] = water.px[o];
      f.px[o + 1] = water.px[o + 1];
      f.px[o + 2] = water.px[o + 2];
      f.px[o + 3] = 1;
    }
  }
}

/**
 * The painter's pass (a Kuwahara filter): every pixel takes the colour of
 * the calmest of the four squares around it, so flat areas keep their
 * shape, edges stay crisp, and texture turns into strokes of paint.
 */
export function paint(f, radius = 4) {
  const { w, h } = f;
  const W = w + 1;
  const sums = [0, 1, 2].map(() => new Float64Array(W * (h + 1)));
  const lum = new Float64Array(W * (h + 1));
  const lum2 = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let r = 0;
    let g = 0;
    let b = 0;
    let l = 0;
    let l2 = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      r += f.px[i];
      g += f.px[i + 1];
      b += f.px[i + 2];
      const v = luma(f.px[i], f.px[i + 1], f.px[i + 2]);
      l += v;
      l2 += v * v;
      const k = (y + 1) * W + x + 1;
      sums[0][k] = sums[0][k - W] + r;
      sums[1][k] = sums[1][k - W] + g;
      sums[2][k] = sums[2][k - W] + b;
      lum[k] = lum[k - W] + l;
      lum2[k] = lum2[k - W] + l2;
    }
  }
  const area = (t, x0, y0, x1, y1) => t[y1 * W + x1] - t[y0 * W + x1] - t[y1 * W + x0] + t[y0 * W + x0];
  const out = new Float32Array(f.px.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let best = Infinity;
      let br = 0;
      let bg = 0;
      let bb = 0;
      for (let q = 0; q < 4; q++) {
        const x0 = clamp(q & 1 ? x : x - radius, 0, w);
        const x1 = clamp(q & 1 ? x + radius + 1 : x + 1, 0, w);
        const y0 = clamp(q & 2 ? y : y - radius, 0, h);
        const y1 = clamp(q & 2 ? y + radius + 1 : y + 1, 0, h);
        const n = (x1 - x0) * (y1 - y0);
        if (n <= 0) continue;
        const m = area(lum, x0, y0, x1, y1) / n;
        const v = area(lum2, x0, y0, x1, y1) / n - m * m;
        if (v < best) {
          best = v;
          br = area(sums[0], x0, y0, x1, y1) / n;
          bg = area(sums[1], x0, y0, x1, y1) / n;
          bb = area(sums[2], x0, y0, x1, y1) / n;
        }
      }
      const i = (y * w + x) * 4;
      out[i] = br;
      out[i + 1] = bg;
      out[i + 2] = bb;
      out[i + 3] = 1;
    }
  }
  f.px.set(out);
}

/**
 * The grade. `lift`, `gamma` and `gain` per channel set the shadows, the
 * middle and the highlights; `shadows` and `highlights` tint them toward a
 * colour (split toning); `mono` pulls everything toward one colour by its
 * brightness (a duotone); `saturation` and `contrast` last.
 */
export function grade(f, { lift = [0, 0, 0], gamma = [1, 1, 1], gain = [1, 1, 1], saturation = 1, contrast = 0, shadows = null, highlights = null, mono = null, exposure = 1 }) {
  const sh = shadows ? { c: rgb(shadows[0]), k: shadows[1] } : null;
  const hi = highlights ? { c: rgb(highlights[0]), k: highlights[1] } : null;
  const mo = mono ? { dark: rgb(mono[0]), light: rgb(mono[1]), k: mono[2] } : null;
  const ig = gamma.map((g) => 1 / g);
  const p = f.px;
  for (let i = 0; i < p.length; i += 4) {
    let r = p[i] * exposure;
    let g = p[i + 1] * exposure;
    let b = p[i + 2] * exposure;
    r = Math.pow(clamp(lift[0] + r * (gain[0] - lift[0]), 0, 1), ig[0]);
    g = Math.pow(clamp(lift[1] + g * (gain[1] - lift[1]), 0, 1), ig[1]);
    b = Math.pow(clamp(lift[2] + b * (gain[2] - lift[2]), 0, 1), ig[2]);
    let l = luma(r, g, b);
    if (sh) {
      const k = sh.k * (1 - l) * (1 - l);
      r += (sh.c[0] * l * 2 - r) * k * 0.5;
      g += (sh.c[1] * l * 2 - g) * k * 0.5;
      b += (sh.c[2] * l * 2 - b) * k * 0.5;
    }
    if (hi) {
      const k = hi.k * l * l;
      r += (hi.c[0] - r) * k * 0.5;
      g += (hi.c[1] - g) * k * 0.5;
      b += (hi.c[2] - b) * k * 0.5;
    }
    if (mo) {
      l = luma(r, g, b);
      const tr = mo.dark[0] + (mo.light[0] - mo.dark[0]) * l;
      const tg = mo.dark[1] + (mo.light[1] - mo.dark[1]) * l;
      const tb = mo.dark[2] + (mo.light[2] - mo.dark[2]) * l;
      r += (tr - r) * mo.k;
      g += (tg - g) * mo.k;
      b += (tb - b) * mo.k;
    }
    l = luma(r, g, b);
    r = l + (r - l) * saturation;
    g = l + (g - l) * saturation;
    b = l + (b - l) * saturation;
    if (contrast) {
      const s = (v) => {
        const c = clamp(v, 0, 1);
        const curve = c * c * (3 - 2 * c);
        return c + (curve - c) * contrast;
      };
      r = s(r);
      g = s(g);
      b = s(b);
    }
    p[i] = clamp(r, 0, 1);
    p[i + 1] = clamp(g, 0, 1);
    p[i + 2] = clamp(b, 0, 1);
  }
}

/** Darkened edges, round the middle of the frame. */
export function vignette(f, { strength = 0.35, colour = '#000000', inner = 0.45 }) {
  const c = rgb(colour);
  const { w, h } = f;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x / w - 0.5) * 2;
      const dy = (y / h - 0.5) * 2 * 0.8;
      const d = Math.sqrt(dx * dx + dy * dy) / Math.SQRT2;
      const t = clamp((d - inner) / (1 - inner), 0, 1);
      const k = t * t * strength;
      const i = (y * w + x) * 4;
      f.px[i] += (c[0] - f.px[i]) * k;
      f.px[i + 1] += (c[1] - f.px[i + 1]) * k;
      f.px[i + 2] += (c[2] - f.px[i + 2]) * k;
    }
  }
}

/** The finished frame as 8-bit RGB, with a seeded grain that is strongest in the middle tones, as film's is. */
export function toRGB8(f, { grain = 0.012, seed = 1 }) {
  const rnd = random(seed);
  const out = Buffer.alloc(f.w * f.h * 3);
  for (let i = 0, j = 0; i < f.px.length; i += 4, j += 3) {
    const l = luma(f.px[i], f.px[i + 1], f.px[i + 2]);
    const n = (rnd() + rnd() - 1) * grain * (0.35 + 2.6 * l * (1 - l));
    out[j] = clamp(Math.round((f.px[i] + n) * 255), 0, 255);
    out[j + 1] = clamp(Math.round((f.px[i + 1] + n) * 255), 0, 255);
    out[j + 2] = clamp(Math.round((f.px[i + 2] + n) * 255), 0, 255);
  }
  return out;
}

/** A layer drawn in parts ({ svg, rough? }), the rough ones roughened, laid one over the next. */
async function assemble(parts, w, h, scale) {
  const layer = frame(w, h);
  for (const part of parts) {
    const drawn = await rasterise(part.svg, w, h, scale);
    over(layer, part.rough ? roughen(drawn, part.rough) : drawn);
  }
  return layer;
}

/**
 * Renders a scene: `steps` is a list of layers ({ svg or parts, blur, haze,
 * falloff, rim, opacity, blend, scale }) and effects ({ effect: 'rays' | 'reflect' |
 * 'paint' | 'texture' | 'bloom' | 'grade', ...options }) applied in order,
 * then `finish` (bloom, grade, vignette, grain).
 */
export async function renderScene({ w, h, steps, finish = {}, seed = 1, log = null }) {
  const f = frame(w, h);
  for (const step of steps) {
    const t0 = log ? Date.now() : 0;
    if (step.effect) {
      if (step.effect === 'rays') rays(f, step);
      else if (step.effect === 'reflect') reflect(f, step);
      else if (step.effect === 'paint') paint(f, step.radius);
      else if (step.effect === 'texture') texture(f, step);
      else if (step.effect === 'bloom') bloom(f, step);
      else if (step.effect === 'grade') grade(f, step);
      else throw new Error(`unknown effect ${step.effect}`);
      if (log) log(`${step.effect}: ${Date.now() - t0}ms`);
      continue;
    }
    const layer = step.parts ? await assemble(step.parts, w, h, step.scale ?? 1) : await rasterise(step.svg, w, h, step.scale ?? 1);
    const t1 = log ? Date.now() : 0;
    if (step.blur) blur(layer, step.blur);
    if (step.haze) haze(layer, rgb(step.haze[0]), step.haze[1]);
    if (step.falloff) falloff(layer, step.falloff);
    if (step.rim) rimLight(layer, step.rim);
    if (step.blend === 'screen') screen(f, layer, step.opacity ?? 1);
    else over(f, layer, step.opacity ?? 1);
    if (log) log(`layer ${((step.svg ?? step.parts.map((part) => part.svg).join('')).length / 1024).toFixed(0)}KB svg${step.parts ? ` in ${step.parts.length} parts` : ''}: raster ${t1 - t0}ms, rest ${Date.now() - t1}ms`);
  }
  const t2 = log ? Date.now() : 0;
  if (finish.bloom) bloom(f, finish.bloom);
  if (finish.grade) grade(f, finish.grade);
  if (finish.vignette) vignette(f, finish.vignette);
  const out = toRGB8(f, { grain: finish.grain ?? 0.012, seed });
  if (log) log(`finish: ${Date.now() - t2}ms`);
  return out;
}
