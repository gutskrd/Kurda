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
 * Some layers it paints itself rather than rasterising them: mountains and
 * hills from a relief (`terrain`, here), and from marks.mjs ground cover plant
 * by plant, a nebula, ink washed onto paper; crowns drawn flat it repaints
 * leaf by leaf, and an effect lays the whole frame on canvas in oils.
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
import { carpet, impasto, leafy, nebula, wash } from './marks.mjs';
import { blur, cells, clamp, clone, frame, luma, over, resize, rgb, screen, shrink, turbulence, valueNoise } from './pixels.mjs';

/** An SVG (the whole canvas) as a premultiplied frame, rendered at 1/scale and brought back up. */
export async function rasterise(svg, w, h, scale = 1, bleed = 0) {
  // drawn `bleed` pixels past its edges and cut back: a filter is only ever worked inside the picture, so one
  // that reaches in from beside it (a shifted copy) would find nothing there
  const pad = Math.ceil(bleed / scale) * scale;
  const src = pad ? svg.replace(/^<svg ([^>]*)width="(\d+)" height="(\d+)" viewBox="0 0 \d+ \d+"/, (m, attrs, sw, sh) => `<svg ${attrs}width="${+sw + 2 * pad}" height="${+sh + 2 * pad}" viewBox="${-pad} ${-pad} ${+sw + 2 * pad} ${+sh + 2 * pad}"`) : svg;
  const { data, info } = await sharp(Buffer.from(src), { density: 72 / scale }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const cut = pad / scale;
  const small = frame(info.width - 2 * cut, info.height - 2 * cut);
  const p = small.px;
  for (let y = 0; y < small.h; y++) {
    for (let x = 0; x < small.w; x++) {
      const i = (y * small.w + x) * 4;
      const j = ((y + cut) * info.width + x + cut) * 4;
      const a = data[j + 3] / 255;
      p[i] = (data[j] / 255) * a;
      p[i + 1] = (data[j + 1] / 255) * a;
      p[i + 2] = (data[j + 2] / 255) * a;
      p[i + 3] = a;
    }
  }
  return small.w === w && small.h === h ? small : resize(small, w, h);
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
  blur(out, 0.8);
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

// ──────────────────────────────────────────────────────────── mountains

/**
 * A mountain range painted from a relief, as a landscape painter models one,
 * rather than filled flat: under the skyline every pixel has a height in a
 * relief of a few great ridges coming down from the summits with broad faces
 * between them, and finer ribs and gullies scoring those faces (ridged noise
 * along the angle from each summit, so they run with the fall of the slope);
 * its slope there, tilted by which flank of which peak it is on, is lit from
 * `light` ([x, y, z]: right, down, toward us) — rock between `shadow` and
 * `lit`, darker down in the gullies. Snow lies above `snowline`, higher on
 * the ridges and lower down the gullies, so its edge runs down in tongues;
 * it slides off the steepest rock. Toward the foot the colour goes to `foot`.
 *
 * With `grassy` (how much the blades show) it is a hill under grass instead:
 * no ribs and no rock, only broad swells, and the colour streaked with blades
 * `blade` pixels long leaning with `wind`; given `dry`, the grass dries to it
 * in drifts across the slope (`dryness`, how far). With `rocky` it is stony
 * ground: boulders `stone` pixels across where they are nearest, and rubble
 * between them, each lit on the side toward the light.
 *
 * `ridge` is the skyline, [x, y] left to right; `peaks` are the summits as
 * [x, y, half-width]. Returns a premultiplied frame, the sky clear.
 */
export function terrain(w, h, { ridge, peaks, light = [-0.7, -0.5, 0.55], lit, shadow, foot = null, footFrom = null, snowline = null, snowLit = '#ffffff', snowShadow = '#b6c4de', relief = 1, ribs = 7, ambient = 0.24, seed = 1, grassy = 0, blade = 4, wind = 0.3, dry = null, dryness = 0.5, rocky = 0, stone = 40 }) {
  const f = frame(w, h);
  const skyline = new Float32Array(w);
  for (let x = 0, j = 0; x < w; x++) {
    while (j < ridge.length - 2 && ridge[j + 1][0] < x) j++;
    const [x0, y0] = ridge[j];
    const [x1, y1] = ridge[j + 1];
    skyline[x] = y0 + ((y1 - y0) * (x - x0)) / Math.max(1e-6, x1 - x0);
  }
  const noise = turbulence(seed, 1, 1);
  // four channels of noise; more fields than that are told apart by where in the noise they are read
  const fbm = (k, x, y, octaves) => {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    x += k * 37.1;
    y += k * 11.7;
    for (let o = 0; o < octaves; o++) {
      sum += noise.plain(k % 4, x, y) * amp;
      norm += amp;
      x *= 2.02;
      y *= 2.02;
      amp *= 0.5;
    }
    return sum / norm;
  };
  const ridged = (x, y, octaves, gain = 0.5, k = 2) => {
    let sum = 0;
    let amp = 0.5;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      const v = 1 - Math.min(1, Math.abs(noise.plain(k, x, y) * 1.7));
      sum += v ** 1.4 * amp;
      norm += amp;
      x *= 2.03;
      y *= 2.03;
      amp *= gain;
    }
    return sum / norm;
  };
  // each column belongs to the summits near it, a valley between two to both: weights that fall away with distance
  const weights = (x) => {
    const ws = peaks.map((pk) => Math.exp(-(((x - pk[0]) / pk[2]) ** 2) * 2.2));
    const total = ws.reduce((a, b) => a + b, 0) || 1;
    return ws.map((v) => v / total);
  };
  // the relief: ribs fanning from the summits, swells under them; and how far down a gully each pixel is
  const boulder = cells(1, seed + 11);
  const gravel = cells(1, seed + 29);
  const top = Math.max(0, Math.floor(Math.min(...skyline)) - 1);
  const rows = h - top;
  const H = new Float32Array(w * rows);
  const R = new Float32Array(w * rows);
  const flanks = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    const ws = weights(x);
    flanks[x] = peaks.reduce((acc, pk, k) => acc + ws[k] * clamp((x - pk[0]) / pk[2], -1, 1), 0);
    const near = peaks.map((pk, k) => [pk, ws[k]]).filter(([, wk]) => wk > 0.02);
    for (let y = Math.max(top, Math.floor(skyline[x]) - 1); y < h; y++) {
      const i = (y - top) * w + x;
      if (grassy) {
        // ground under grass: broad swells and smaller ones over them, squashed as they go back; no ribs, no rock
        const swell = fbm(1, x / 260, y / 64, 3);
        R[i] = 0.5 + swell;
        H[i] = swell * 1.6 + fbm(3, x / 80, y / 22, 2) * 0.3;
        continue;
      }
      if (rocky) {
        // stony ground, laid out flat and seen in perspective: rounded boulders `stone` pixels across where they
        // are nearest, smaller and closer-packed toward the far edge, each a dome meeting the next in a crease,
        // and rubble between them
        const span = Math.max(1, h - skyline[x]);
        const sc = 0.25 + 0.75 * clamp((y - skyline[x]) / span, 0, 1);
        const gx = (x - w / 2) / (stone * sc);
        const gz = (span / (0.75 * 0.45 * stone)) * Math.log(sc);
        const wob = fbm(2, gx * 0.7, gz * 0.7, 2) * 0.9;
        // (each stone its own height — some hardly out of the ground — its face rough, with earth between them)
        const dome = (c) => Math.sqrt(Math.max(0, 1 - (c.r * (1.2 + 0.5 * c.id)) ** 2)) * (0.15 + 0.85 * c.id ** 0.7);
        const big = dome(boulder(gx + wob, gz - wob));
        const small = dome(gravel(gx * 3.1 + wob, gz * 3.1));
        const grit = fbm(3, gx * 9, gz * 9, 2) * 0.08;
        R[i] = 0.2 + big * 0.8;
        H[i] = (big * 1.2 + small * 0.3 + grit) * sc * stone * 0.02 * rocky + fbm(1, x / 300, y / 90, 2) * 0.5;
        continue;
      }
      // the ridges wander as they come down, and branch: the angle off each summit, bent by broad noise
      const bend = fbm(1, x / 210, y / 210, 3) * 0.55;
      let main = 0;
      let rib = 0;
      let crowd = 0;
      let weight = 0;
      for (const [pk, wk] of near) {
        const dx = x - pk[0];
        const dy = Math.max(1, y - pk[1] + 14);
        const r = Math.hypot(dx, dy);
        const a = Math.atan2(dx, dy) + bend;
        // a few great ridges off the summit with broad faces between them, and the gullies scoring those faces
        main += ridged(a * ribs * 0.24 + 7.3 + pk[0] * 0.01, r / 700, 2, 0.5, 0) * wk;
        rib += ridged(a * ribs + 3.1 + pk[0] * 0.013, r / 170, 3, 0.4) * wk;
        crowd += Math.min(1, r / 110) * wk;
        weight += wk;
      }
      main /= weight;
      rib /= weight;
      crowd /= weight;
      // crags: small sharp-edged lumps over the ribs, the rock breaking up
      const crag = 1 - Math.abs(fbm(3, x / 11, y / 15, 3) * 2.2);
      const rock = crag * 0.12 + fbm(4, x / 46, y / 64, 2) * 0.12;
      // the great ridges make the faces the light falls on; near a summit the ribs would crowd together like a
      // comb, and there the crags take over
      R[i] = main * 0.6 + rib * 0.4;
      H[i] = main * 5.5 * crowd + rib * 0.7 * (0.4 + 0.6 * crowd) + rock * 0.6 * (1.5 - 0.5 * crowd);
    }
  }
  const L = (() => {
    const len = Math.hypot(...light);
    return light.map((v) => v / len);
  })();
  const [lr, lg, lb] = rgb(lit);
  const [sr, sg, sb] = rgb(shadow);
  const footRGB = foot ? rgb(foot) : null;
  const [wr, wg, wb] = rgb(snowLit);
  const [qr, qg, qb] = rgb(snowShadow);
  const dryRGB = dry ? rgb(dry) : null;
  const p = f.px;
  for (let x = 0; x < w; x++) {
    const flank = flanks[x];
    const sky = skyline[x];
    for (let y = Math.max(0, Math.floor(sky)); y < h; y++) {
      const a = clamp(y + 1 - sky, 0, 1);
      if (a <= 0) continue;
      const i = (y - top) * w + x;
      const hx = H[i + (x < w - 1 ? 1 : 0)] - H[i - (x > 0 ? 1 : 0)];
      const hy = y < h - 1 ? H[i + w] - H[i] : 0;
      // the slope's normal: the relief's, tipped toward the flank's own side and back toward the sky
      let nx = -hx * 7 * relief + flank * 1.15;
      let ny = -hy * 7 * relief - 0.4;
      let nz = 1;
      const nl = Math.hypot(nx, ny, nz);
      nx /= nl;
      ny /= nl;
      nz /= nl;
      const lambert = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
      const shade = ambient + (1 - ambient) * lambert;
      const rib = R[i];
      // down in the gullies (or the hollows) it is darker; and the rock itself (or the grass) is not all one colour
      const deep = (grassy ? 0.8 + 0.2 * clamp(rib, 0, 1) : rocky ? 0.5 + 0.5 * clamp(rib, 0, 1) : 0.66 + 0.34 * Math.min(1, rib * 1.4)) * (1 + fbm(5, x / 90, y / 70, 2) * 0.22);
      let tr = lr;
      let tg = lg;
      let tb = lb;
      if (dryRGB) {
        // where the grass has dried, in drifts across the slope
        const d = clamp(fbm(7, x / 200, y / 50, 2) * 2.6 + 0.2, 0, 1) * dryness;
        tr += (dryRGB[0] - lr) * d;
        tg += (dryRGB[1] - lg) * d;
        tb += (dryRGB[2] - lb) * d;
      }
      let r = (sr + (tr - sr) * shade) * deep;
      let g = (sg + (tg - sg) * shade) * deep;
      let b = (sb + (tb - sb) * shade) * deep;
      if (grassy) {
        // the blades: fine streaks leaning with the wind, gathered in tufts, plainest where the light is flat
        const bx = (x + y * wind) / (blade * 0.35);
        const by = y / blade;
        const streak = noise.plain(0, bx, by) + noise.plain(1, bx * 2.3, by * 2.3) * 0.5;
        const tuft = fbm(6, x / (blade * 5), y / (blade * 3), 2);
        const tex = 1 + (streak * 0.6 + tuft * 0.5) * grassy * (0.45 + 0.55 * lambert);
        r *= tex;
        g *= tex;
        b *= tex;
      }
      if (snowline !== null) {
        const steep = Math.min(1, Math.hypot(hx, hy) * 2);
        // the sun takes the snow higher up the flank it falls on; the other keeps it lower
        const line = snowline + flank * Math.sign(L[0] || 1) * -26;
        // the snowfield's edge frays: tongues down the gullies, rock showing through on the ridges
        const lie = (line - y) / 46 + (0.5 - rib) * 4 + fbm(6, x / 34, y / 26, 3) * 1.1;
        const amount = clamp(lie * 1.6, 0, 1) * (1 - steep * 0.5);
        if (amount > 0) {
          const ws = Math.min(1, shade * 1.1);
          r += (qr + (wr - qr) * ws - r) * amount;
          g += (qg + (wg - qg) * ws - g) * amount;
          b += (qb + (wb - qb) * ws - b) * amount;
        }
      }
      if (footRGB && footFrom !== null && y > footFrom) {
        const t = clamp((y - footFrom) / Math.max(1, h - footFrom), 0, 1) * 0.85;
        r += (footRGB[0] - r) * t;
        g += (footRGB[1] - g) * t;
        b += (footRGB[2] - b) * t;
      }
      const j = (y * w + x) * 4;
      p[j] = clamp(r, 0, 1) * a;
      p[j + 1] = clamp(g, 0, 1) * a;
      p[j + 2] = clamp(b, 0, 1) * a;
      p[j + 3] = a;
    }
  }
  return f;
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
 * Diffusion, as a soft-focus filter gives it: a blurred copy of the frame
 * where it is brighter than the frame, so light bleeds out over what is
 * darker around it and the whole picture softens and glows — the dreamy
 * haze of an old lens or a mist filter.
 */
export function diffuse(f, { radius = 16, strength = 0.35, soften = 0.12 }) {
  const g = clone(f);
  blur(g, radius);
  const p = f.px;
  const q = g.px;
  for (let i = 0; i < p.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const d = q[i + c] - p[i + c];
      p[i + c] += Math.max(0, d) * strength + d * soften;
    }
  }
}

/**
 * Light streaks, as a lens draws them from anything bright: what is above
 * `threshold` smeared along `angle` (radians; 0 is level) for `length`
 * pixels either way, fading as it goes, and laid over the frame as light in
 * `tint`. Computed at a third of the size, as streaks are soft anyway.
 */
export function streaks(f, { threshold = 0.82, strength = 0.5, length = 240, angle = 0, tint = '#ffe2b0', samples = 40 }) {
  const s = 3;
  const sw = Math.ceil(f.w / s);
  const sh = Math.ceil(f.h / s);
  const src = new Float32Array(sw * sh * 3);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const i = (Math.min(f.h - 1, y * s + 1) * f.w + Math.min(f.w - 1, x * s + 1)) * 4;
      const l = luma(f.px[i], f.px[i + 1], f.px[i + 2]);
      const k = Math.max(0, (l - threshold) / (1 - threshold));
      const j = (y * sw + x) * 3;
      src[j] = f.px[i] * k;
      src[j + 1] = f.px[i + 1] * k;
      src[j + 2] = f.px[i + 2] * k;
    }
  }
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const reach = length / s;
  const acc = frame(sw, sh);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let k = -samples; k <= samples; k++) {
        const t = k / samples;
        const sx = Math.round(x + dx * t * reach);
        const sy = Math.round(y + dy * t * reach);
        if (sx < 0 || sy < 0 || sx >= sw || sy >= sh) continue;
        const wgt = (1 - Math.abs(t)) ** 2;
        const j = (sy * sw + sx) * 3;
        r += src[j] * wgt;
        g += src[j + 1] * wgt;
        b += src[j + 2] * wgt;
      }
      const o = (y * sw + x) * 4;
      acc.px[o] = r / samples;
      acc.px[o + 1] = g / samples;
      acc.px[o + 2] = b / samples;
      acc.px[o + 3] = 1;
    }
  }
  const big = resize(acc, f.w, f.h);
  const [tr, tg, tb] = rgb(tint);
  for (let i = 0; i < big.px.length; i += 4) {
    const l = (big.px[i] + big.px[i + 1] + big.px[i + 2]) / 3;
    big.px[i] = l * tr;
    big.px[i + 1] = l * tg;
    big.px[i + 2] = l * tb;
  }
  screen(f, big, strength);
}

/**
 * The colour fringe of a real lens: red pushed out a little and blue pulled
 * in, growing toward the corners, `amount` pixels at the edge of the frame.
 */
export function aberration(f, { amount = 1.5 }) {
  const { w, h } = f;
  const src = clone(f);
  const cx = w / 2;
  const cy = h / 2;
  const rmax = Math.hypot(cx, cy);
  const sample = (x, y, c) => {
    const x0 = clamp(Math.floor(x), 0, w - 1);
    const y0 = clamp(Math.floor(y), 0, h - 1);
    const x1 = Math.min(w - 1, x0 + 1);
    const y1 = Math.min(h - 1, y0 + 1);
    const tx = clamp(x - x0, 0, 1);
    const ty = clamp(y - y0, 0, 1);
    const a = src.px[(y0 * w + x0) * 4 + c] * (1 - tx) + src.px[(y0 * w + x1) * 4 + c] * tx;
    const b = src.px[(y1 * w + x0) * 4 + c] * (1 - tx) + src.px[(y1 * w + x1) * 4 + c] * tx;
    return a * (1 - ty) + b * ty;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.hypot(dx, dy) / rmax;
      const k = (amount * r * r) / Math.max(1, Math.hypot(dx, dy));
      const i = (y * w + x) * 4;
      f.px[i] = sample(x + dx * k, y + dy * k, 0);
      f.px[i + 2] = sample(x - dx * k, y - dy * k, 2);
    }
  }
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
  // (the water's first row carried up over the shore a little way, so softening it draws nothing dark in from there)
  const pad = Math.min(y0, Math.ceil(soften * 3) + 1);
  for (let yy = y0 - pad; yy < y0; yy++) water.px.copyWithin(yy * w * 4, y0 * w * 4, (y0 + 1) * w * 4);
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

/**
 * The finished frame as 8-bit RGB, with a seeded grain that is strongest in
 * the middle tones, as film's is; `clumps` adds a coarser grain over it, the
 * silver gathered in specks a few pixels across.
 */
export function toRGB8(f, { grain = 0.012, clumps = 0, seed = 1 }) {
  const rnd = random(seed);
  const coarse = clumps ? valueNoise(f.w, f.h, 2.5, random(seed + 7)) : null;
  const out = Buffer.alloc(f.w * f.h * 3);
  for (let i = 0, j = 0, p = 0; i < f.px.length; i += 4, j += 3, p++) {
    const l = luma(f.px[i], f.px[i + 1], f.px[i + 2]);
    const mid = 0.35 + 2.6 * l * (1 - l);
    const n = ((rnd() + rnd() - 1) * grain + (coarse ? coarse[p] * clumps : 0)) * mid;
    out[j] = clamp(Math.round((f.px[i] + n) * 255), 0, 255);
    out[j + 1] = clamp(Math.round((f.px[i + 1] + n) * 255), 0, 255);
    out[j + 2] = clamp(Math.round((f.px[i + 2] + n) * 255), 0, 255);
  }
  return out;
}

/**
 * A layer drawn in parts ({ svg, rough?, leafy? }), laid one over the next: the rough ones roughened, the leafy
 * ones (crowns) repainted leaf by leaf (marks.mjs `leafy`).
 */
async function assemble(parts, w, h, scale, bleed) {
  const layer = frame(w, h);
  for (const part of parts) {
    let drawn = await rasterise(part.svg, w, h, scale, bleed);
    if (part.rough) drawn = roughen(drawn, part.rough);
    if (part.leafy) leafy(drawn, part.leafy);
    over(layer, drawn);
  }
  return layer;
}

/**
 * Renders a scene: `steps` is a list of layers ({ svg or parts, or one the
 * compositor paints itself — terrain, carpet, nebula, wash — and blur, haze,
 * falloff, rim, opacity, blend, scale, bleed }) and effects ({ effect: 'rays' |
 * 'reflect' | 'paint' | 'texture' | 'bloom' | 'diffuse' | 'streaks' | 'grade' |
 * 'impasto', ...options }) applied in order, then `finish` (bloom, diffuse,
 * streaks, grade, aberration, vignette, grain).
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
      else if (step.effect === 'diffuse') diffuse(f, step);
      else if (step.effect === 'streaks') streaks(f, step);
      else if (step.effect === 'grade') grade(f, step);
      else if (step.effect === 'impasto') impasto(f, step);
      else throw new Error(`unknown effect ${step.effect}`);
      if (log) log(`${step.effect}: ${Date.now() - t0}ms`);
      continue;
    }
    const painted = step.terrain ? terrain(w, h, step.terrain) : step.carpet ? carpet(w, h, step.carpet) : step.nebula ? nebula(w, h, step.nebula) : step.wash ? wash(w, h, step.wash) : null;
    const layer = painted ?? (step.parts ? await assemble(step.parts, w, h, step.scale ?? 1, step.bleed ?? 0) : await rasterise(step.svg, w, h, step.scale ?? 1, step.bleed ?? 0));
    const t1 = log ? Date.now() : 0;
    if (step.blur) blur(layer, step.blur);
    if (step.haze) haze(layer, rgb(step.haze[0]), step.haze[1]);
    if (step.falloff) falloff(layer, step.falloff);
    if (step.rim) rimLight(layer, step.rim);
    if (step.blend === 'screen') screen(f, layer, step.opacity ?? 1);
    else over(f, layer, step.opacity ?? 1);
    if (log) log(painted ? `${Object.keys(step).find((k) => ['terrain', 'carpet', 'nebula', 'wash'].includes(k))}: ${t1 - t0}ms, rest ${Date.now() - t1}ms` : `layer ${((step.svg ?? step.parts.map((part) => part.svg).join('')).length / 1024).toFixed(0)}KB svg${step.parts ? ` in ${step.parts.length} parts` : ''}: raster ${t1 - t0}ms, rest ${Date.now() - t1}ms`);
  }
  const t2 = log ? Date.now() : 0;
  if (finish.bloom) bloom(f, finish.bloom);
  if (finish.diffuse) diffuse(f, finish.diffuse);
  if (finish.streaks) streaks(f, finish.streaks);
  if (finish.grade) grade(f, finish.grade);
  if (finish.aberration) aberration(f, finish.aberration);
  if (finish.vignette) vignette(f, finish.vignette);
  const out = toRGB8(f, { grain: finish.grain ?? 0.012, clumps: finish.clumps ?? 0, seed });
  if (log) log(`finish: ${Date.now() - t2}ms`);
  return out;
}
