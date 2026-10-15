/**
 * Mountains and villages: the parts of the scenes drawn as flat shapes rather
 * than grown (nature.mjs) or built from plans (places.mjs).
 *
 * A range is a ridge line — a few peaks shaped like real ones (concave
 * flanks, a sharp top) with fractal roughness on top — filled, then given a
 * lit face and a shadow face per peak, so it reads as rock in sunlight rather
 * than as a cut-out. Snow is the part of a range above a ragged line, shaded
 * by the same faces. A village is stepped up a slope the way Hewraman is
 * built. Beside them, two things of the sky: far birds and the aurora.
 *
 * Every shape is built from numbers rounded by `n` and choices from the
 * piece's own seeded generator, like everything else in the generator.
 */
import { between, blur, linear, n, poly, pt, radialAt, tint } from './kit.mjs';

// ──────────────────────────────────────────────────────────────── noise

/**
 * One-dimensional value noise in [-1, 1]: seeded values on a lattice, eased
 * between. `octaves` layers of it, each twice as fine and half as strong.
 */
export function noise1d(rnd, { scale, octaves = 4 }) {
  const layers = [];
  for (let o = 0; o < octaves; o++) {
    const values = Array.from({ length: 512 }, () => rnd() * 2 - 1);
    layers.push({ values, scale: scale / 2 ** o, weight: 0.5 ** o });
  }
  const total = layers.reduce((s, l) => s + l.weight, 0);
  return (x) => {
    let v = 0;
    for (const l of layers) {
      const t = x / l.scale + 64;
      const i = Math.floor(t);
      const f = t - i;
      const e = f * f * (3 - 2 * f);
      const a = l.values[((i % 512) + 512) % 512];
      const b = l.values[(((i + 1) % 512) + 512) % 512];
      v += (a + (b - a) * e) * l.weight;
    }
    return v / total;
  };
}

// ────────────────────────────────────────────────────────────── the sky

/** Soft light: a radial glow fading to nothing. */
export function glow(cv, cx, cy, r, colour, opacity = 1) {
  const id = cv.id('glow');
  cv.def(radialAt(id, [[0, colour, opacity], [0.35, colour, opacity * 0.45], [1, colour, 0]], cx, cy, r));
  cv.add(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="url(#${id})"/>`);
}

/** Birds far off: a few soft V's. */
export function birds(cv, rnd, { x, y, count, size, colour, spread = 120 }) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const bx = x + between(rnd, -spread, spread);
    const by = y + between(rnd, -spread * 0.35, spread * 0.35);
    const s = size * between(rnd, 0.6, 1.1);
    out.push(`M${pt([bx - s, by - s * 0.3])} Q${pt([bx - s * 0.45, by - s * 0.65])} ${pt([bx, by])} Q${pt([bx + s * 0.45, by - s * 0.65])} ${pt([bx + s, by - s * 0.3])}`);
  }
  cv.add(`<path d="${out.join(' ')}" stroke="${colour}" stroke-width="${n(size * 0.22)}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`);
}

/** Curtains of aurora: soft vertical light hanging from a wavering line. */
export function aurora(cv, rnd, { y, amp, height, colours, opacity = 0.7 }) {
  const wave = noise1d(rnd, { scale: 260, octaves: 3 });
  const id = cv.id('blur');
  cv.def(blur(id, 7));
  for (const [i, colour] of colours.entries()) {
    const g = cv.id('aur');
    cv.def(linear(g, [[0, colour, 0], [0.7, colour, 0.55], [1, colour, 0]]));
    const strips = [];
    const offset = i * 90;
    for (let x = -20; x < cv.w + 20; x += 7) {
      const base = y + wave(x + offset) * amp + i * 34;
      const h = height * (0.55 + 0.45 * Math.abs(wave(x * 2.3 + offset)));
      strips.push(`<rect x="${n(x)}" y="${n(base - h)}" width="9" height="${n(h)}"/>`);
    }
    cv.add(`<g fill="url(#${g})" opacity="${n(opacity * (1 - i * 0.25))}" filter="url(#${id})">${strips.join('')}</g>`);
  }
}

// ──────────────────────────────────────────────────────────── mountains

/**
 * A ridge line across the canvas: the peaks given (x, height, half-width) with
 * concave flanks, roughened by fractal noise, as points every `step` pixels.
 */
export function ridge(rnd, { w, base, peaks, rough = 0.22, scale = 90, step = 6 }) {
  const wobble = noise1d(rnd, { scale, octaves: 5 });
  const sharp = noise1d(rnd, { scale: scale / 6, octaves: 2 });
  const tallest = Math.max(...peaks.map((p) => p.h));
  const points = [];
  for (let x = -60; x <= w + 60; x += step) {
    let lift = 0;
    for (const p of peaks) {
      const half = x < p.x ? p.l ?? p.s : p.r ?? p.s;
      const t = Math.abs(x - p.x) / half;
      if (t < 1.6) lift = Math.max(lift, p.h * Math.max(0, 1 - t) ** (p.k ?? 1.35) + p.h * 0.06 * Math.max(0, 1.6 - t));
    }
    const roughness = tallest * rough * (0.35 + 0.65 * Math.min(1, lift / tallest + 0.25));
    const y = base - lift - wobble(x) * roughness - sharp(x) * roughness * 0.18;
    points.push([x, y]);
  }
  return points;
}

/** The index of the highest point of `pts` within `range` pixels of x. */
function summitNear(pts, x, range) {
  let best = -1;
  for (let i = 0; i < pts.length; i++) {
    if (Math.abs(pts[i][0] - x) > range) continue;
    if (best < 0 || pts[i][1] < pts[best][1]) best = i;
  }
  return best;
}

/**
 * A mountain range, painted: a fill that fades into the haze toward its foot,
 * snow above `snow` (a y), and per peak a shadow face on the side away from
 * the light — the face from the summit down its far flank, bounded by a
 * ragged spine that runs from the summit to the foot.
 *
 * `light` is -1 for light from the left, 1 from the right.
 */
export function range(cv, rnd, opts) {
  const { peaks, base, fill, foot = fill, shade, shadeOpacity = 0.42, snow = null, snowLit = '#ffffff', snowShade = '#cdd8ee', light = -1, rim = null, gullies = 0.6, bottom = cv.h, step } = opts;
  const pts = ridge(rnd, { w: cv.w, base, peaks, rough: opts.rough ?? 0.22, scale: opts.scale ?? 90, step });
  const outline = `M${pt([pts[0][0], bottom + 2])} L${poly(pts)} L${pt([pts[pts.length - 1][0], bottom + 2])} Z`;
  const top = Math.min(...pts.map((p) => p[1]));
  const grad = cv.id('rg');
  cv.def(`<linearGradient id="${grad}" gradientUnits="userSpaceOnUse" x1="0" y1="${n(top)}" x2="0" y2="${n(bottom)}"><stop offset="0" stop-color="${fill}"/><stop offset="1" stop-color="${foot}"/></linearGradient>`);
  const clip = cv.id('rc');
  cv.def(`<clipPath id="${clip}"><path d="${outline}"/></clipPath>`);
  const parts = [`<path d="${outline}" fill="url(#${grad})"/>`];

  if (snow !== null) {
    // a snowline that wanders, and runs further down where the gullies hold it
    const wander = noise1d(rnd, { scale: 60, octaves: 3 });
    const edge = [];
    for (let x = -60; x <= cv.w + 60; x += 4) edge.push([x, snow + wander(x) * (opts.snowWander ?? 18)]);
    // tongues of snow down the gullies, fanning out from each summit above the snowline
    const tongues = [];
    for (const p of peaks) {
      const si = summitNear(pts, p.x, 60);
      if (si < 0 || pts[si][1] > snow - 12) continue;
      const [sx, sy] = pts[si];
      const count = Math.round(between(rnd, 5, 9) * Math.min(1.4, (snow - sy) / 90));
      for (let k = 0; k < count; k++) {
        // a point on the snow edge under this summit, on one flank or the other
        const side = k % 2 === 0 ? -1 : 1;
        const reach = (p.s ?? (side < 0 ? p.l : p.r)) * ((snow - sy) / p.h) * between(rnd, 0.15, 1);
        const tx = sx + side * reach;
        const ty = snow + wander(tx) * (opts.snowWander ?? 18) - 2;
        if (heightAt(pts, tx) > ty) continue;
        const len = between(rnd, 22, 70) * (opts.snowTongue ?? 1);
        const lean = side * (0.25 + 0.6 * (reach / Math.max(1, p.s ?? p.r ?? 100)));
        const wide = between(rnd, 4, 9);
        const end = [tx + lean * len, ty + len];
        tongues.push(`M${pt([tx - wide, ty])} C${pt([tx - wide * 0.6 + lean * len * 0.4, ty + len * 0.45])} ${pt([end[0] - 1.5, end[1] - len * 0.2])} ${pt(end)} C${pt([end[0] + 1.5, end[1] - len * 0.25])} ${pt([tx + wide * 0.6 + lean * len * 0.4, ty + len * 0.45])} ${pt([tx + wide, ty])} Z`);
      }
    }
    const sg = cv.id('sg');
    cv.def(`<linearGradient id="${sg}" gradientUnits="userSpaceOnUse" x1="0" y1="${n(top)}" x2="0" y2="${n(snow + 70)}"><stop offset="0" stop-color="${snowLit}"/><stop offset="1" stop-color="${snowShade}"/></linearGradient>`);
    parts.push(`<path d="M-60,-10 L${poly(edge)} L${n(cv.w + 60)},-10 Z ${tongues.join(' ')}" fill="url(#${sg})"/>`);
  }

  const faces = [];
  const wedges = [];
  const spurs = [];
  const sorted = [...peaks].sort((a, b) => a.x - b.x);
  const dir = light < 0 ? 1 : -1;
  const spineTo = (sx, sy, footX, half, wiggle) => {
    const out = [];
    const steps = 10;
    for (let k = steps - 1; k >= 1; k--) {
      const t = k / steps;
      const yy = sy + (bottom - sy) * t;
      const bend = Math.sin(t * Math.PI) * half * 0.08 * dir;
      out.push([sx + (footX - sx) * t ** 0.85 + bend + between(rnd, -1, 1) * half * wiggle * t, yy]);
    }
    return out;
  };
  for (const p of sorted) {
    const half = light < 0 ? p.r ?? p.s : p.l ?? p.s;
    const litHalf = light < 0 ? p.l ?? p.s : p.r ?? p.s;
    const si = summitNear(pts, p.x, Math.max(30, half * 0.35));
    if (si < 0) continue;
    const [sx, sy] = pts[si];
    // the far flank, from the summit down to the next valley
    let vi = si;
    let low = sy;
    for (let j = si + dir; j >= 0 && j < pts.length; j += dir) {
      if (Math.abs(pts[j][0] - sx) > half * 1.3) break;
      if (pts[j][1] > low) {
        low = pts[j][1];
        vi = j;
      } else if (pts[j][1] < low - 30) break;
    }
    const flank = dir > 0 ? pts.slice(si, vi + 1) : pts.slice(vi, si + 1).reverse();
    const valley = flank[flank.length - 1];
    // the shadow face: bounded by a spine that runs down and away from the light
    const footX = sx + (valley[0] - sx) * between(rnd, 0.28, 0.55);
    const spine = spineTo(sx, sy, footX, half, 0.06);
    faces.push(`M${poly(flank)} L${pt([valley[0] + dir * half * 0.35, valley[1] + (bottom - valley[1]) * 0.6])} L${pt([valley[0] + dir * half * 0.5, bottom + 2])} L${pt([footX, bottom + 2])} L${poly(spine)} Z`);
    // a lit spur breaking up the shadow face: a narrow wedge of light down from
    // the far flank (drawn only where asked: on a big near face it reads as a scratch)
    if (flank.length > 6 && rnd() < 0.8) {
      const [fx, fy] = flank[Math.floor(flank.length * between(rnd, 0.3, 0.6))];
      const len = (bottom - fy) * between(rnd, 0.35, 0.6);
      const wide = len * between(rnd, 0.12, 0.2);
      if (opts.spurs !== false) spurs.push(`M${pt([fx, fy + 2])} C${pt([fx + dir * len * 0.12, fy + len * 0.35])} ${pt([fx + dir * len * 0.3, fy + len * 0.7])} ${pt([fx + dir * len * 0.4, fy + len])} C${pt([fx + dir * (len * 0.3 - wide), fy + len * 0.65])} ${pt([fx + dir * (len * 0.1 - wide * 0.6), fy + len * 0.3])} ${pt([fx, fy + 2])} Z`);
    }
    // gullies on the lit flank: thin wedges of shade running down the slope
    const count = Math.round(between(rnd, 1, 3) * gullies * 2);
    for (let g = 0; g < count; g++) {
      const gx = sx - dir * litHalf * between(rnd, 0.1, 0.7);
      const gi = summitNear(pts, gx, 6);
      if (gi < 0) continue;
      const [x0, y0] = pts[gi];
      if (y0 > bottom - 30) continue;
      const len = (bottom - y0) * between(rnd, 0.2, 0.45);
      const wide = len * between(rnd, 0.14, 0.24);
      const lean = -dir * len * between(rnd, 0.2, 0.45);
      wedges.push(`M${pt([x0, y0 + 1])} C${pt([x0 + lean * 0.3 + dir * wide * 0.5, y0 + len * 0.3])} ${pt([x0 + lean * 0.7 + dir * wide * 0.6, y0 + len * 0.7])} ${pt([x0 + lean, y0 + len])} C${pt([x0 + lean * 0.75, y0 + len * 0.6])} ${pt([x0 + lean * 0.35, y0 + len * 0.3])} ${pt([x0, y0 + 1])} Z`);
    }
  }
  parts.push(`<path d="${wedges.join(' ')}" fill="${shade}" fill-opacity="${n(shadeOpacity * 0.55)}"/>`);
  parts.push(`<path d="${faces.join(' ')}" fill="${shade}" fill-opacity="${n(shadeOpacity)}"/>`);
  parts.push(`<path d="${spurs.join(' ')}" fill="${opts.spur ?? tint(fill, 0.25)}" fill-opacity="0.35"/>`);
  // light across the whole range from the lit side, for volume
  const side = cv.id('side');
  cv.def(`<linearGradient id="${side}" x1="${light < 0 ? 0 : 1}" y1="0" x2="${light < 0 ? 1 : 0}" y2="0"><stop offset="0" stop-color="#ffffff" stop-opacity="${n(opts.sheen ?? 0.12)}"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>`);
  parts.push(`<rect x="-60" y="${n(top)}" width="${n(cv.w + 120)}" height="${n(bottom - top)}" fill="url(#${side})"/>`);
  if (rim) parts.push(`<path d="M${poly(pts)}" fill="none" stroke="${rim}" stroke-width="2.5" stroke-opacity="0.55" stroke-linejoin="round"/>`);
  // the foot of the range sinks into the haze
  if (opts.haze) {
    const hz = cv.id('hz');
    cv.def(`<linearGradient id="${hz}" gradientUnits="userSpaceOnUse" x1="0" y1="${n(base - 60)}" x2="0" y2="${n(base + 20)}"><stop offset="0" stop-color="${opts.haze}" stop-opacity="0"/><stop offset="1" stop-color="${opts.haze}" stop-opacity="${n(opts.hazeOpacity ?? 0.7)}"/></linearGradient>`);
    parts.push(`<rect x="-60" y="${n(base - 60)}" width="${n(cv.w + 120)}" height="${n(bottom - base + 62)}" fill="url(#${hz})"/>`);
  }
  cv.add(`<g clip-path="url(#${clip})">${parts.join('')}</g>`);
  return pts;
}

/** The ground height of a ridge or hill line at x. */
export function heightAt(pts, x) {
  for (let i = 1; i < pts.length; i++) {
    if (pts[i][0] >= x) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      return y0 + ((y1 - y0) * (x - x0)) / Math.max(1e-6, x1 - x0);
    }
  }
  return pts[pts.length - 1][1];
}

// ──────────────────────────────────────────────────────────────── villages

/**
 * A village stepped up a slope, Hewraman's way: rows of flat-roofed stone
 * houses, each row set back and up from the one below so its roofs are the
 * yards of the row above. `climb` is the way the rows rise: 1 up to the
 * right, -1 up to the left. Lit faces, shadowed sides, the beam-ends under
 * each roof, dark doors — and at night, windows lit warm.
 */
export function village(cv, rnd, { x, y, w, rows = 5, house = 34, wall, wallLit, wallDark, roof, door = '#2a1d18', lights = null, light = -1, climb = 1, rise = 0.62, shrink = 0.1 }) {
  const out = [];
  const glowAt = [];
  for (let r = rows - 1; r >= 0; r--) {
    const rowY = y - r * house * rise;
    const rowW = w * Math.max(0.2, 1 - r * shrink);
    const rowX = x + climb * r * house * 0.7 + (climb < 0 ? w - rowW : 0) + between(rnd, -house, house) * 0.25;
    let cx = rowX;
    while (cx < rowX + rowW) {
      const hw = house * between(rnd, 0.8, 1.6);
      const hh = house * between(rnd, 0.55, 0.8);
      const top = rowY - hh;
      const sideW = hw * 0.2;
      const deep = house * 0.5;
      out.push(`<rect x="${n(cx)}" y="${n(top)}" width="${n(hw)}" height="${n(hh + deep)}" fill="${rnd() < 0.55 ? wall : wallLit}"/>`);
      const sx = light < 0 ? cx + hw - sideW : cx;
      out.push(`<rect x="${n(sx)}" y="${n(top)}" width="${n(sideW)}" height="${n(hh + deep)}" fill="${wallDark}"/>`);
      // the flat roof, a lip of earth and timber, and the beam-ends under it
      out.push(`<rect x="${n(cx - 1.5)}" y="${n(top - 3.5)}" width="${n(hw + 3)}" height="4.5" fill="${roof}"/>`);
      const beams = Math.floor(hw / 7);
      const ends = [];
      for (let b = 1; b < beams; b++) ends.push(`M${pt([cx + b * 7, top + 1.5])} h1.6`);
      if (ends.length) out.push(`<path d="${ends.join(' ')}" stroke="${door}" stroke-width="2" stroke-opacity="0.55"/>`);
      const openings = Math.max(1, Math.round((hw - sideW) / (house * 0.5)));
      for (let k = 0; k < openings; k++) {
        const ox = cx + (light < 0 ? 0 : sideW) + ((hw - sideW) * (k + 0.5)) / openings - house * 0.06;
        const isDoor = k === 0 && rnd() < 0.45;
        const oh = isDoor ? hh * 0.52 : hh * 0.26;
        const oy = isDoor ? rowY - oh : top + hh * 0.28;
        const lit = lights && rnd() < 0.5;
        out.push(`<rect x="${n(ox)}" y="${n(oy)}" width="${n(house * 0.13)}" height="${n(oh)}" fill="${lit ? lights : door}"/>`);
        if (lit) glowAt.push([ox + house * 0.065, oy + oh / 2]);
      }
      cx += hw + between(rnd, -1, house * 0.12);
    }
  }
  cv.add(out.join(''));
  for (const [gx, gy] of glowAt) glow(cv, gx, gy, house * 0.6, lights, 0.32);
}
