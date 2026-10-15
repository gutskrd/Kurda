/**
 * The arithmetic the compositor (render.mjs) and its painters (marks.mjs)
 * share: frames of premultiplied RGBA floats in [0, 1], resampling and blur,
 * laying one frame over another, colour, the noise of SVG's feTurbulence, and
 * the one mark everything painted by hand is made of.
 *
 * Plain arithmetic on typed arrays, and every random choice seeded, so the
 * same call makes the same pixels on every machine.
 */
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** 0 below `lo`, 1 above `hi`, and a smooth S between. */
export const smooth = (lo, hi, v) => {
  const t = clamp((v - lo) / (hi - lo), 0, 1);
  return t * t * (3 - 2 * t);
};

export const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** '#rrggbb' as [0..1] floats, in the same space the frames are in. */
export function rgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}

export function frame(w, h) {
  return { w, h, px: new Float32Array(w * h * 4) };
}

export function clone(f) {
  return { w: f.w, h: f.h, px: new Float32Array(f.px) };
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
export function shrink(src, f) {
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

/** One box blur of radius r along rows (or columns) of a `stride`-channel image. */
function boxPass(src, dst, w, h, r, horizontal, stride = 4) {
  const line = horizontal ? w : h;
  const lines = horizontal ? h : w;
  const step = horizontal ? stride : w * stride;
  const inv = 1 / (2 * r + 1);
  for (let k = 0; k < lines; k++) {
    const base = horizontal ? k * w * stride : k * stride;
    for (let c = 0; c < stride; c++) {
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

/** The same blur of one channel (a w × h Float32Array), returned new. */
export function blurField(field, w, h, sigma) {
  const out = new Float32Array(field);
  if (sigma < 0.4) return out;
  const tmp = new Float32Array(field.length);
  for (const r of boxRadii(sigma)) {
    if (r < 1) continue;
    boxPass(out, tmp, w, h, r, true, 1);
    boxPass(tmp, out, w, h, r, false, 1);
  }
  return out;
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

/**
 * One mark of paint, laid over the frame: an ellipse `rx` along and `ry`
 * across, turned `angle` radians, in [r, g, b] at `opacity`, its edge
 * smoothed over a pixel. `tip` sharpens its ends — 0.5 is an ellipse, 1 a
 * leaf or a blade coming to a point.
 */
export function stamp(f, x, y, rx, ry, angle, r, g, b, opacity = 1, tip = 0.5) {
  const reach = Math.max(rx, ry) + 1;
  const x0 = Math.max(0, Math.floor(x - reach));
  const x1 = Math.min(f.w - 1, Math.ceil(x + reach));
  const y0 = Math.max(0, Math.floor(y - reach));
  const y1 = Math.min(f.h - 1, Math.ceil(y + reach));
  if (x0 > x1 || y0 > y1) return;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  // a mark thinner than a pixel is drawn a pixel wide and fainter, as a brush that fine would leave it
  const fade = Math.min(1, ry * 2) * Math.min(1, rx * 2);
  const RY = Math.max(ry, 0.5);
  const RX = Math.max(rx, 0.5);
  const p = f.px;
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const dx = px + 0.5 - x;
      const dy = py + 0.5 - y;
      const u = (dx * c + dy * s) / RX;
      const au = Math.abs(u);
      if (au >= 1) continue;
      const v = Math.abs(-dx * s + dy * c) / RY;
      const half = tip === 0.5 ? Math.sqrt(1 - u * u) : (1 - au ** (1 / tip)) ** tip;
      const edge = Math.min((half - v) * RY, (1 - au) * RX) + 0.5;
      if (edge <= 0) continue;
      const a = Math.min(1, edge) * opacity * fade;
      const i = (py * f.w + px) * 4;
      const keep = 1 - a;
      p[i] = r * a + p[i] * keep;
      p[i + 1] = g * a + p[i + 1] * keep;
      p[i + 2] = b * a + p[i + 2] * keep;
      p[i + 3] = a + p[i + 3] * keep;
    }
  }
}

// ──────────────────────────────────────────────────────────── noise

const PERLIN_B = 0x100;
const PERLIN_N = 0x1000;

/**
 * The noise of SVG's feTurbulence (type fractalNoise, no stitching), from the
 * reference code in the Filter Effects specification: the same lattice, the
 * same gradients from the same seeded generator, so a seed draws the same
 * field here as it would in an SVG filter. Channel `k` of the four is
 * returned by `at(k, x, y)` in [0, 1].
 */
export function turbulence(seed, freq, octaves) {
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
    /** One octave of channel k, unquantised, at (x, y) as given: roughly -0.7 to 0.7. */
    plain(k, x, y) {
      return noise2(k, x, y);
    },
    /** Octaves of channel k at (x, y) as given (no `freq`), each half the last, normalised: roughly -0.7 to 0.7. */
    fbm(k, x, y, octaves = 4, gain = 0.5) {
      let sum = 0;
      let amp = 1;
      let norm = 0;
      for (let o = 0; o < octaves; o++) {
        sum += noise2(k, x, y) * amp;
        norm += amp;
        x *= 2.02;
        y *= 2.02;
        amp *= gain;
      }
      return sum / norm;
    },
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

/** Seeded value noise on a grid of `cell` pixels, smoothly interpolated, in [-1, 1]. */
export function valueNoise(w, h, cell, rnd) {
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
 * Cells round seeded points on a jittered grid `size` apart (Worley's), squashed `flat` times up and down: for
 * (x, y), the way from its point (ux, uy, unit), how far out toward the cell's edge it is (r, 0 to 1), how
 * near the edge (edge, in cells), and a number of the cell's own (id, 0 to 1).
 */
export function cells(size, seed, flat = 1) {
  const hash = (ix, iy, k) => {
    let v = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(seed + k, 0x9e3779b9);
    v = Math.imul(v ^ (v >>> 15), 0x85ebca6b);
    v = Math.imul(v ^ (v >>> 13), 0xc2b2ae35);
    return ((v ^ (v >>> 16)) >>> 0) / 4294967296;
  };
  return (x, y) => {
    const gx = x / size;
    const gy = (y * flat) / size;
    const cx = Math.floor(gx);
    const cy = Math.floor(gy);
    let d1 = 9;
    let d2 = 9;
    let px = 0;
    let py = 0;
    let id = 0;
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const fx = cx + i + 0.15 + hash(cx + i, cy + j, 0) * 0.7;
        const fy = cy + j + 0.15 + hash(cx + i, cy + j, 1) * 0.7;
        const d = Math.hypot(gx - fx, gy - fy);
        if (d < d1) {
          d2 = d1;
          d1 = d;
          px = fx;
          py = fy;
          id = hash(cx + i, cy + j, 2);
        } else if (d < d2) d2 = d;
      }
    }
    const len = Math.hypot(gx - px, gy - py) || 1e-6;
    return { ux: (gx - px) / len, uy: (gy - py) / len, r: clamp(d1 / ((d1 + d2) / 2 || 1), 0, 1), edge: d2 - d1, id };
  };
}
