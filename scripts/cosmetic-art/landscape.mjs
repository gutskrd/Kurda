/**
 * The landscape kit: what the shop's backgrounds are painted with.
 *
 * Mountains are a ridge line — a few peaks shaped like real ones (concave
 * flanks, a sharp top) with fractal roughness on top — filled, then given a
 * lit face and a shadow face per peak, so a range reads as rock in sunlight
 * rather than as a cut-out. Snow is the part of a range above a ragged line,
 * shaded by the same faces. Distance is colour: each range further back is
 * mixed toward the sky's haze, and mist lies in the valleys between them.
 *
 * On top of that, the things that make a valley Kurdish: Zagros oaks, poplars
 * along the water, Judas trees and almonds in blossom, flat-roofed villages
 * stepped up a slope the way Hewraman is built, black goat-hair tents on the
 * summer pastures, Newroz fires on the hills and a govend dancing round one.
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

/** The sky: a gradient over the whole canvas, top to bottom. */
export function sky(cv, stops) {
  const id = cv.id('sky');
  cv.def(linear(id, stops));
  cv.add(`<rect width="${cv.w}" height="${cv.h}" fill="url(#${id})"/>`);
}

/** Soft light: a radial glow fading to nothing. */
export function glow(cv, cx, cy, r, colour, opacity = 1) {
  const id = cv.id('glow');
  cv.def(radialAt(id, [[0, colour, opacity], [0.35, colour, opacity * 0.45], [1, colour, 0]], cx, cy, r));
  cv.add(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="url(#${id})"/>`);
}

/** A sun or full moon: a disc with a soft lit side, and its glow. */
export function orb(cv, cx, cy, r, { core, rim, halo, haloR = r * 6, haloOpacity = 0.55 }) {
  glow(cv, cx, cy, haloR, halo, haloOpacity);
  glow(cv, cx, cy, r * 2.2, halo, 0.6);
  const id = cv.id('orb');
  cv.def(radialAt(id, [[0, core], [0.7, core], [1, rim]], cx - r * 0.25, cy - r * 0.25, r * 1.3));
  cv.add(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="url(#${id})"/>`);
}

/** A full moon with its seas faintly drawn. */
export function fullMoon(cv, cx, cy, r, { core = '#f6f1e0', rim = '#d9d3c0', halo = '#cfd9ff', haloOpacity = 0.45 } = {}) {
  orb(cv, cx, cy, r, { core, rim, halo, haloOpacity });
  const seas = [
    [-0.3, -0.2, 0.28], [0.15, -0.35, 0.18], [0.25, 0.1, 0.24], [-0.1, 0.3, 0.16], [-0.42, 0.18, 0.1],
  ];
  cv.add(
    `<g fill="${rim}" fill-opacity="0.45">` +
      seas.map(([x, y, s]) => `<circle cx="${n(cx + x * r)}" cy="${n(cy + y * r)}" r="${n(s * r)}"/>`).join('') +
      '</g>',
  );
}

/** A crescent, its lit edge on the left-hand side unless `tilt` turns it. */
export function crescent(cv, cx, cy, r, { colour = '#fbf3d5', halo = '#cfd9ff', tilt = -0.5, bite = 0.68 } = {}) {
  glow(cv, cx, cy, r * 5, halo, 0.35);
  const ox = Math.cos(tilt) * r * (1 - bite + 0.42);
  const oy = Math.sin(tilt) * r * (1 - bite + 0.42);
  const id = cv.id('bite');
  cv.def(`<mask id="${id}"><rect x="${n(cx - r * 2)}" y="${n(cy - r * 2)}" width="${n(r * 4)}" height="${n(r * 4)}" fill="#fff"/><circle cx="${n(cx + ox)}" cy="${n(cy + oy)}" r="${n(r * 0.92)}" fill="#000"/></mask>`);
  cv.add(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${colour}" mask="url(#${id})"/>`);
}

/** A four-point twinkle, as a path. */
export const twinkle = (x, y, r) =>
  `M${pt([x, y - r])} Q${pt([x, y])} ${pt([x + r, y])} Q${pt([x, y])} ${pt([x, y + r])} Q${pt([x, y])} ${pt([x - r, y])} Q${pt([x, y])} ${pt([x, y - r])} Z`;

/**
 * Stars: many faint dots, fewer bright ones, and a handful that twinkle. Denser
 * toward the top; none below `bottom`.
 */
export function stars(cv, rnd, { count, top = 0, bottom, colour = '#ffffff', bright = 8, warm = '#ffe7c2' }) {
  const dots = [];
  for (let i = 0; i < count; i++) {
    const x = rnd() * cv.w;
    const y = top + (bottom - top) * rnd() ** 1.35;
    const big = rnd() < 0.08;
    const r = big ? between(rnd, 1.3, 2.1) : between(rnd, 0.45, 1.15);
    const a = big ? between(rnd, 0.75, 1) : between(rnd, 0.25, 0.8);
    dots.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${rnd() < 0.25 ? warm : colour}" fill-opacity="${n(a)}"/>`);
  }
  for (let i = 0; i < bright; i++) {
    const x = between(rnd, 40, cv.w - 40);
    const y = top + (bottom - top) * rnd() ** 1.6;
    const r = between(rnd, 5, 10);
    glow(cv, x, y, r * 3.2, colour, 0.35);
    dots.push(`<path d="${twinkle(x, y, r)}" fill="${colour}"/>`);
  }
  cv.add(dots.join(''));
}

/** The Milky Way: a band of soft light, dust lanes through it, and a crowd of stars along it. */
export function milkyWay(cv, rnd, { from, to, width, colours, dust }) {
  const [x0, y0] = from;
  const [x1, y1] = to;
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2 - 60;
  const path = `M${pt(from)} Q${pt([mx, my])} ${pt(to)}`;
  const soft = cv.id('blur');
  cv.def(blur(soft, width * 0.35));
  const fine = cv.id('blur');
  cv.def(blur(fine, width * 0.1));
  cv.add(
    `<g filter="url(#${soft})"><path d="${path}" stroke="${colours[0]}" stroke-width="${n(width)}" stroke-opacity="0.55" fill="none"/>` +
      `<path d="${path}" stroke="${colours[1]}" stroke-width="${n(width * 0.45)}" stroke-opacity="0.55" fill="none"/></g>`,
  );
  cv.add(`<g filter="url(#${fine})"><path d="${path}" stroke="${colours[2]}" stroke-width="${n(width * 0.16)}" stroke-opacity="0.5" fill="none"/></g>`);
  // dust lanes: dark wisps that wander along the band
  const lanes = [];
  for (let i = 0; i < 5; i++) {
    const t0 = between(rnd, 0.05, 0.75);
    const t1 = t0 + between(rnd, 0.12, 0.25);
    const at = (t) => {
      const u = 1 - t;
      return [u * u * x0 + 2 * u * t * mx + t * t * x1, u * u * y0 + 2 * u * t * my + t * t * y1];
    };
    const a = at(t0);
    const b = at(t1);
    const c = at((t0 + t1) / 2);
    const off = between(rnd, -width * 0.12, width * 0.12);
    lanes.push(`<path d="M${pt(a)} Q${pt([c[0], c[1] + off])} ${pt(b)}" stroke="${dust}" stroke-width="${n(between(rnd, width * 0.04, width * 0.1))}" stroke-opacity="${n(between(rnd, 0.35, 0.6))}" stroke-linecap="round" fill="none"/>`);
  }
  cv.add(`<g filter="url(#${fine})">${lanes.join('')}</g>`);
  // a crowd of small stars hugging the band
  const crowd = [];
  for (let i = 0; i < 520; i++) {
    const t = rnd();
    const u = 1 - t;
    const x = u * u * x0 + 2 * u * t * mx + t * t * x1;
    const y = u * u * y0 + 2 * u * t * my + t * t * y1;
    const spread = (rnd() + rnd() + rnd() - 1.5) * width * 0.55;
    crowd.push(`<circle cx="${n(x + spread * 0.35)}" cy="${n(y + spread)}" r="${n(between(rnd, 0.4, 1.2))}" fill="#ffffff" fill-opacity="${n(between(rnd, 0.3, 0.9))}"/>`);
  }
  cv.add(crowd.join(''));
}

/** Puffy clouds: overlapping lobes with a flat base, lit from above, shaded below. */
export function cloud(cv, rnd, { x, y, w, h = w * 0.32, lit, shade, opacity = 1, softness = 2 }) {
  const lobes = [];
  const count = Math.max(4, Math.round(w / 55));
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const r = h * (0.45 + 0.55 * Math.sin(Math.PI * t)) * between(rnd, 0.75, 1.05);
    lobes.push([x - w / 2 + w * t + between(rnd, -10, 10), y - r * 0.55, r]);
  }
  const clip = cv.id('cl');
  cv.def(`<clipPath id="${clip}"><rect x="${n(x - w)}" y="${n(y - h * 3)}" width="${n(w * 2)}" height="${n(h * 3)}"/></clipPath>`);
  const soft = cv.id('blur');
  cv.def(blur(soft, softness));
  const shapes = lobes.map(([cx, cy, r]) => `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"/>`).join('');
  const grad = cv.id('cg');
  cv.def(linear(grad, [[0, lit], [0.55, lit], [1, shade]]));
  cv.add(
    `<g opacity="${n(opacity)}" filter="url(#${soft})"><g clip-path="url(#${clip})" fill="url(#${grad})">${shapes}<rect x="${n(x - w / 2)}" y="${n(y - h * 0.5)}" width="${n(w)}" height="${n(h * 0.5)}" rx="${n(h * 0.25)}"/></g></g>`,
  );
}

/** God rays from a point: long thin wedges of light, very faint. */
export function rays(cv, { x, y, colour, count = 9, spread = 1.1, opacity = 0.1, length = 1500, angle = Math.PI / 2 }) {
  const id = cv.id('blur');
  cv.def(blur(id, 14));
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = angle - spread / 2 + (spread * (i + 0.5)) / count;
    const hw = 0.02 + (i % 3) * 0.012;
    out.push(`<path d="M${pt([x, y])} L${pt([x + Math.cos(a - hw) * length, y + Math.sin(a - hw) * length])} L${pt([x + Math.cos(a + hw) * length, y + Math.sin(a + hw) * length])} Z"/>`);
  }
  cv.add(`<g fill="${colour}" fill-opacity="${n(opacity)}" filter="url(#${id})">${out.join('')}</g>`);
}

/** Mist: a horizontal band of colour, strongest at `y`, gone above and below. */
export function mist(cv, y, h, colour, opacity) {
  const id = cv.id('mist');
  cv.def(linear(id, [[0, colour, 0], [0.5, colour, opacity], [1, colour, 0]]));
  cv.add(`<rect x="0" y="${n(y - h / 2)}" width="${cv.w}" height="${n(h)}" fill="url(#${id})"/>`);
}

/** Mist lying in a valley: long soft drifts rather than a band. */
export function drifts(cv, rnd, { y, count, colour, opacity, h = 40, spread = 30 }) {
  const id = cv.id('blur');
  cv.def(blur(id, h * 0.45));
  const out = [];
  for (let i = 0; i < count; i++) {
    const x = between(rnd, -100, cv.w + 100);
    const w = between(rnd, 260, 620);
    out.push(`<ellipse cx="${n(x)}" cy="${n(y + between(rnd, -spread, spread))}" rx="${n(w / 2)}" ry="${n(h * between(rnd, 0.5, 1))}" fill-opacity="${n(opacity * between(rnd, 0.5, 1))}"/>`);
  }
  cv.add(`<g fill="${colour}" filter="url(#${id})">${out.join('')}</g>`);
}

/** A wash from `y` to the bottom of the canvas that thickens downward. */
export function fog(cv, y, colour, opacity) {
  const id = cv.id('fog');
  cv.def(linear(id, [[0, colour, 0], [1, colour, opacity]]));
  cv.add(`<rect x="0" y="${n(y)}" width="${cv.w}" height="${n(cv.h - y)}" fill="url(#${id})"/>`);
}

/** Darkened corners, to hold the eye in the middle. */
export function vignette(cv, strength = 0.35, colour = '#000000') {
  const id = cv.id('vig');
  cv.def(radialAt(id, [[0, colour, 0], [0.62, colour, 0], [1, colour, strength]], cv.w / 2, cv.h / 2, cv.w * 0.62));
  cv.add(`<rect width="${cv.w}" height="${cv.h}" fill="url(#${id})"/>`);
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

/** Peaks spread across the width: `count` of them, heights `lo`–`hi`, at random but never bunched. */
export function spreadPeaks(rnd, { w, count, lo, hi, width = [0.6, 1.2], k }) {
  const out = [];
  const span = (w + 200) / count;
  for (let i = 0; i < count; i++) {
    const x = -100 + span * (i + 0.5) + between(rnd, -span * 0.3, span * 0.3);
    const h = between(rnd, lo, hi);
    out.push({ x, h, l: span * between(rnd, width[0], width[1]), r: span * between(rnd, width[0], width[1]), k });
  }
  return out;
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
    // lit spurs across the shadow face: ridges catching a little light
    // a lit spur breaking up the shadow face: a narrow wedge of light down from the far flank
    if (flank.length > 6 && rnd() < 0.8) {
      const [fx, fy] = flank[Math.floor(flank.length * between(rnd, 0.3, 0.6))];
      const len = (bottom - fy) * between(rnd, 0.35, 0.6);
      const wide = len * between(rnd, 0.12, 0.2);
      spurs.push(`M${pt([fx, fy + 2])} C${pt([fx + dir * len * 0.12, fy + len * 0.35])} ${pt([fx + dir * len * 0.3, fy + len * 0.7])} ${pt([fx + dir * len * 0.4, fy + len])} C${pt([fx + dir * (len * 0.3 - wide), fy + len * 0.65])} ${pt([fx + dir * (len * 0.1 - wide * 0.6), fy + len * 0.3])} ${pt([fx, fy + 2])} Z`);
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

/** Rolling hills: a soft ridge, lit along its top. */
export function hills(cv, rnd, { base, amp, count = 4, fill, foot = fill, crest = null, bottom = cv.h, scale = 260 }) {
  const wobble = noise1d(rnd, { scale, octaves: 3 });
  const pts = [];
  for (let x = -40; x <= cv.w + 40; x += 10) pts.push([x, base - amp * (0.5 + 0.5 * Math.sin((x / cv.w) * Math.PI * count + rnd() * 0.02)) * 0.4 - amp * wobble(x)]);
  const outline = `M${pt([-40, bottom + 2])} L${poly(pts)} L${pt([cv.w + 40, bottom + 2])} Z`;
  const top = Math.min(...pts.map((p) => p[1]));
  const grad = cv.id('hg');
  cv.def(`<linearGradient id="${grad}" gradientUnits="userSpaceOnUse" x1="0" y1="${n(top)}" x2="0" y2="${n(bottom)}"><stop offset="0" stop-color="${fill}"/><stop offset="1" stop-color="${foot}"/></linearGradient>`);
  cv.add(`<path d="${outline}" fill="url(#${grad})"/>`);
  if (crest) cv.add(`<path d="M${poly(pts)}" fill="none" stroke="${crest}" stroke-width="3" stroke-opacity="0.55" stroke-linejoin="round"/>`);
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

// ────────────────────────────────────────────────────────────── water

/**
 * Still water from `y` down: the sky's colours mirrored and deepened, the
 * ranges given mirrored above it, and a few lines of shimmer.
 */
export function lake(cv, rnd, { y, colours, reflect = [], shimmer = null, shimmerX = cv.w / 2, shimmerWidth = 160 }) {
  const id = cv.id('lake');
  cv.def(linear(id, colours));
  cv.add(`<rect x="0" y="${n(y)}" width="${cv.w}" height="${n(cv.h - y)}" fill="url(#${id})"/>`);
  for (const { pts, fill, opacity = 0.5 } of reflect) {
    const mirrored = pts.map(([x, yy]) => [x, y + (y - yy) * 0.85]);
    cv.add(`<path d="M${pt([mirrored[0][0], y])} L${poly(mirrored)} L${pt([mirrored[mirrored.length - 1][0], y])} Z" fill="${fill}" fill-opacity="${n(opacity)}"/>`);
  }
  if (shimmer) {
    const lines = [];
    for (let i = 0; i < 26; i++) {
      const yy = y + 8 + (cv.h - y) * (i / 26) ** 1.4;
      const w = shimmerWidth * (0.3 + 0.7 * (i / 26)) * between(rnd, 0.4, 1);
      const x = shimmerX + between(rnd, -shimmerWidth * 0.25, shimmerWidth * 0.25);
      lines.push(`<rect x="${n(x - w / 2)}" y="${n(yy)}" width="${n(w)}" height="${n(1.5 + i * 0.12)}" rx="1" fill="${shimmer}" fill-opacity="${n(between(rnd, 0.25, 0.65))}"/>`);
    }
    cv.add(lines.join(''));
  }
  cv.add(`<rect x="0" y="${n(y)}" width="${cv.w}" height="1.5" fill="#ffffff" fill-opacity="0.25"/>`);
}

// ─────────────────────────────────────────────────────────────── trees

/**
 * A Zagros oak: a short trunk under a broad, lumpy crown, lit on the light's
 * side. `blossom` scatters dabs of colour over the crown (a Judas tree, an
 * almond).
 */
export function oak(cv, rnd, { x, y, size, leaf, leafLit, leafDark, trunk = '#3b2a22', light = -1, blossom = null, blossomLit = null }) {
  const out = [];
  const trunkW = size * 0.09;
  out.push(`<path d="M${pt([x - trunkW, y])} C${pt([x - trunkW * 0.6, y - size * 0.25])} ${pt([x - trunkW * 0.4, y - size * 0.35])} ${pt([x - trunkW * 1.6, y - size * 0.55])} L${pt([x + trunkW * 1.4, y - size * 0.55])} C${pt([x + trunkW * 0.4, y - size * 0.35])} ${pt([x + trunkW * 0.7, y - size * 0.22])} ${pt([x + trunkW, y])} Z" fill="${trunk}"/>`);
  const cy = y - size * 0.68;
  const lobes = [];
  const count = 9;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const rx = size * 0.42;
    const ry = size * 0.27;
    lobes.push([x + Math.cos(a) * rx * between(rnd, 0.6, 1), cy + Math.sin(a) * ry * between(rnd, 0.6, 1), size * between(rnd, 0.17, 0.24)]);
  }
  lobes.push([x, cy, size * 0.3]);
  const circles = (list, dx = 0, dy = 0, k = 1) => list.map(([cx, cyy, r]) => `<circle cx="${n(cx + dx)}" cy="${n(cyy + dy)}" r="${n(r * k)}"/>`).join('');
  out.push(`<g fill="${leafDark}">${circles(lobes)}</g>`);
  out.push(`<g fill="${leaf}">${circles(lobes, light * size * 0.035, -size * 0.04, 0.9)}</g>`);
  out.push(`<g fill="${leafLit}">${circles(lobes.filter(([cx, cyy]) => (cx - x) * light > -size * 0.05 && cyy < cy + size * 0.05), light * size * 0.07, -size * 0.08, 0.62)}</g>`);
  if (blossom) {
    const dabs = [];
    for (let i = 0; i < 46; i++) {
      const [lx, ly, r] = lobes[Math.floor(rnd() * lobes.length) % lobes.length];
      const a = rnd() * Math.PI * 2;
      const d = r * Math.sqrt(rnd()) * 0.95;
      const lit = (Math.cos(a) * light > 0 || Math.sin(a) < -0.3) && blossomLit;
      dabs.push(`<circle cx="${n(lx + Math.cos(a) * d)}" cy="${n(ly + Math.sin(a) * d)}" r="${n(size * between(rnd, 0.025, 0.05))}" fill="${lit ? blossomLit : blossom}"/>`);
    }
    out.push(dabs.join(''));
  }
  cv.add(out.join(''));
}

/** A poplar: tall and narrow, a flame of leaves on a thin trunk, lit down one side. */
export function poplar(cv, rnd, { x, y, h, w = h * 0.16, leaf, leafLit, trunk = '#3b2a22', light = -1 }) {
  const top = y - h;
  const body = `M${pt([x, top])} C${pt([x + w * 0.55, top + h * 0.2])} ${pt([x + w * 0.62, top + h * 0.62])} ${pt([x + w * 0.2, y - h * 0.1])} L${pt([x - w * 0.2, y - h * 0.1])} C${pt([x - w * 0.62, top + h * 0.62])} ${pt([x - w * 0.55, top + h * 0.2])} ${pt([x, top])} Z`;
  const side = light < 0
    ? `M${pt([x, top])} C${pt([x - w * 0.55, top + h * 0.2])} ${pt([x - w * 0.62, top + h * 0.62])} ${pt([x - w * 0.2, y - h * 0.1])} L${pt([x - w * 0.02, y - h * 0.12])} C${pt([x - w * 0.2, top + h * 0.6])} ${pt([x - w * 0.12, top + h * 0.25])} ${pt([x, top])} Z`
    : `M${pt([x, top])} C${pt([x + w * 0.55, top + h * 0.2])} ${pt([x + w * 0.62, top + h * 0.62])} ${pt([x + w * 0.2, y - h * 0.1])} L${pt([x + w * 0.02, y - h * 0.12])} C${pt([x + w * 0.2, top + h * 0.6])} ${pt([x + w * 0.12, top + h * 0.25])} ${pt([x, top])} Z`;
  cv.add(`<rect x="${n(x - w * 0.05)}" y="${n(y - h * 0.14)}" width="${n(w * 0.1)}" height="${n(h * 0.14)}" fill="${trunk}"/><path d="${body}" fill="${leaf}"/><path d="${side}" fill="${leafLit}"/>`);
}

/** A row of poplars along a line, the way they stand along every stream. */
export function poplarRow(cv, rnd, { x0, x1, y, h, count, leaf, leafLit, light = -1 }) {
  for (let i = 0; i < count; i++) {
    const x = x0 + ((x1 - x0) * (i + between(rnd, 0.2, 0.8))) / count;
    poplar(cv, rnd, { x, y: y + between(rnd, -3, 3), h: h * between(rnd, 0.75, 1.1), leaf, leafLit, light });
  }
}

// ───────────────────────────────────────────────────────── people's places

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

/** A black goat-hair tent (reşmal): low and long, pitched on poles, its front open. */
export function tent(cv, { x, y, w, h = w * 0.36, cloth = '#211a1d', clothLit = '#3a3036', inside = '#4a2d1d', lamp = null }) {
  const poles = 3;
  const top = [];
  for (let i = 0; i <= poles * 2; i++) {
    const t = i / (poles * 2);
    const peak = i % 2 === 1;
    top.push([x - w / 2 + w * t, y - h * (peak ? 1 : 0.78) - (i === 0 || i === poles * 2 ? -h * 0.55 : 0)]);
  }
  const outline = `M${pt([x - w / 2 - w * 0.06, y])} L${poly(top)} L${pt([x + w / 2 + w * 0.06, y])} Z`;
  cv.add(`<path d="${outline}" fill="${cloth}"/>`);
  cv.add(`<path d="M${poly(top.slice(0, 3))} L${pt([top[2][0], y])} L${pt([x - w / 2 - w * 0.06, y])} Z" fill="${clothLit}" fill-opacity="0.6"/>`);
  // stripes woven in, as goat-hair tents have
  cv.add(`<path d="M${pt([x - w / 2, y - h * 0.42])} L${pt([x + w / 2, y - h * 0.42])}" stroke="${clothLit}" stroke-width="${n(h * 0.06)}" stroke-opacity="0.7"/>`);
  const ox = x + w * 0.08;
  cv.add(`<path d="M${pt([ox - w * 0.12, y])} L${pt([ox - w * 0.08, y - h * 0.62])} L${pt([ox + w * 0.08, y - h * 0.62])} L${pt([ox + w * 0.12, y])} Z" fill="${lamp ?? inside}"/>`);
  if (lamp) glow(cv, ox, y - h * 0.25, w * 0.55, lamp, 0.45);
  // guy ropes
  cv.add(`<path d="M${pt([top[1][0], top[1][1]])} L${pt([top[1][0] - w * 0.2, y + 2])} M${pt([top[5][0], top[5][1]])} L${pt([top[5][0] + w * 0.2, y + 2])}" stroke="${cloth}" stroke-width="1.5" stroke-opacity="0.8"/>`);
}

/** A flock grazing: woolly ovals with dark heads. */
export function flock(cv, rnd, { x, y, w, count, size, wool = '#f3eee4', woolShade = '#c9c0b0', head = '#2a2220', ground }) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const sx = x + between(rnd, -w / 2, w / 2);
    const sy = y + between(rnd, -size * 1.5, size * 1.5);
    const s = size * between(rnd, 0.8, 1.15);
    const facing = rnd() < 0.5 ? -1 : 1;
    if (ground) out.push(`<ellipse cx="${n(sx)}" cy="${n(sy + s * 0.55)}" rx="${n(s * 1.1)}" ry="${n(s * 0.18)}" fill="${ground}" fill-opacity="0.35"/>`);
    out.push(`<rect x="${n(sx - s * 0.6)}" y="${n(sy)}" width="${n(s * 0.14)}" height="${n(s * 0.5)}" fill="${head}"/><rect x="${n(sx + s * 0.45)}" y="${n(sy)}" width="${n(s * 0.14)}" height="${n(s * 0.5)}" fill="${head}"/>`);
    out.push(`<ellipse cx="${n(sx)}" cy="${n(sy)}" rx="${n(s * 0.9)}" ry="${n(s * 0.55)}" fill="${woolShade}"/>`);
    out.push(`<ellipse cx="${n(sx - s * 0.08)}" cy="${n(sy - s * 0.08)}" rx="${n(s * 0.78)}" ry="${n(s * 0.44)}" fill="${wool}"/>`);
    out.push(`<ellipse cx="${n(sx + facing * s * 0.95)}" cy="${n(sy - s * 0.12)}" rx="${n(s * 0.28)}" ry="${n(s * 0.22)}" fill="${head}"/>`);
  }
  cv.add(out.join(''));
}

/** A Newroz bonfire: logs, a tall flame in three tongues of colour, sparks, and its light on everything near. */
export function bonfire(cv, rnd, { x, y, size, sparks = 24, light = true }) {
  if (light) {
    glow(cv, x, y - size * 0.6, size * 9, '#ff7a2a', 0.42);
    glow(cv, x, y - size * 0.5, size * 3.2, '#ffb347', 0.55);
  }
  const s = size;
  cv.add(`<path d="M${pt([x - s * 0.9, y + s * 0.05])} L${pt([x + s * 0.7, y - s * 0.22])} M${pt([x + s * 0.9, y + s * 0.05])} L${pt([x - s * 0.7, y - s * 0.22])}" stroke="#2b1a14" stroke-width="${n(s * 0.18)}" stroke-linecap="round"/>`);
  const tongue = (k, colour) =>
    `<path d="M${pt([x, y - s * 0.1])} C${pt([x - s * 0.75 * k, y - s * 0.1])} ${pt([x - s * 0.7 * k, y - s * 0.75 * k])} ${pt([x - s * 0.18 * k, y - s * 1.05 * k])} C${pt([x - s * 0.15 * k, y - s * 0.75 * k])} ${pt([x + s * 0.05, y - s * 0.95 * k])} ${pt([x + s * 0.1 * k, y - s * 1.75 * k])} C${pt([x + s * 0.45 * k, y - s * 1.25 * k])} ${pt([x + s * 0.8 * k, y - s * 0.7 * k])} ${pt([x + s * 0.6 * k, y - s * 0.25 * k])} C${pt([x + s * 0.5 * k, y - s * 0.12])} ${pt([x + s * 0.25, y - s * 0.1])} ${pt([x, y - s * 0.1])} Z" fill="${colour}"/>`;
  cv.add(tongue(1, '#e8452c') + tongue(0.72, '#ff8a2a') + tongue(0.42, '#ffd36a'));
  const dots = [];
  for (let i = 0; i < sparks; i++) {
    const sx = x + between(rnd, -s * 1.2, s * 1.2);
    const sy = y - s * 1.5 - between(rnd, 0, s * 4) * rnd();
    dots.push(`<circle cx="${n(sx)}" cy="${n(sy)}" r="${n(between(rnd, 0.8, 2.4))}" fill="${rnd() < 0.5 ? '#ffd36a' : '#ff9a3a'}" fill-opacity="${n(between(rnd, 0.5, 1))}"/>`);
  }
  cv.add(dots.join(''));
}

/** Far-off fires on a hillside: a warm dot with a halo each. */
export function hillFires(cv, rnd, { pts, count, x0 = 0, x1 = cv.w, size = 4, below = [4, 40] }) {
  for (let i = 0; i < count; i++) {
    const x = between(rnd, x0, x1);
    const y = heightAt(pts, x) + between(rnd, below[0], below[1]);
    glow(cv, x, y, size * 7, '#ff8a3a', 0.45);
    cv.add(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(size * 0.55)}" fill="#ffd9a0"/>`);
  }
}

/**
 * A govend: dancers in a line, little fingers linked, arms low; the leader at
 * the end lifting a scarf. Silhouettes, alternating dresses and the wide
 * trousers of şal û şapik. `step` is the gap between dancers.
 */
export function govend(cv, rnd, { x, y, count, size, colour, scarf = '#d7263d', step = size * 0.72, curve = 0 }) {
  const out = [];
  const people = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1) - 0.5;
    const px = x + (i - (count - 1) / 2) * step;
    const py = y + curve * (1 - 4 * t * t) * -1;
    const s = size * between(rnd, 0.92, 1.06);
    people.push([px, py, s, i % 2 === 0]);
  }
  for (const [px, py, s, dress] of people) {
    const head = py - s * 0.95;
    out.push(`<circle cx="${n(px)}" cy="${n(head)}" r="${n(s * 0.1)}"/>`);
    if (dress) {
      // a long dress flaring as she steps
      out.push(`<path d="M${pt([px - s * 0.09, head + s * 0.12])} L${pt([px + s * 0.09, head + s * 0.12])} L${pt([px + s * 0.27, py])} L${pt([px - s * 0.25, py])} Z"/>`);
    } else {
      // a man in şal û şapik: a sash at the waist, wide trousers
      out.push(`<path d="M${pt([px - s * 0.1, head + s * 0.12])} L${pt([px + s * 0.1, head + s * 0.12])} L${pt([px + s * 0.12, head + s * 0.48])} L${pt([px + s * 0.17, py - s * 0.08])} L${pt([px + s * 0.08, py])} L${pt([px + s * 0.01, py - s * 0.22])} L${pt([px - s * 0.07, py])} L${pt([px - s * 0.17, py - s * 0.08])} L${pt([px - s * 0.12, head + s * 0.48])} Z"/>`);
    }
  }
  // arms: from each shoulder down to the hand linked with the next dancer's
  const arms = [];
  for (let i = 0; i < people.length - 1; i++) {
    const [ax, ay, as] = people[i];
    const [bx, by, bs] = people[i + 1];
    const hand = [(ax + bx) / 2, (ay + by) / 2 - (as + bs) * 0.27];
    arms.push(`M${pt([ax + as * 0.07, ay - as * 0.8])} Q${pt([hand[0] - as * 0.12, hand[1] + as * 0.02])} ${pt(hand)} Q${pt([hand[0] + bs * 0.12, hand[1] + bs * 0.02])} ${pt([bx - bs * 0.07, by - bs * 0.8])}`);
  }
  const [lx, ly, ls] = people[people.length - 1];
  arms.push(`M${pt([lx + ls * 0.07, ly - ls * 0.8])} L${pt([lx + ls * 0.26, ly - ls * 1.12])}`);
  out.push(`<path d="${arms.join(' ')}" fill="none" stroke="${colour}" stroke-width="${n(size * 0.055)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  cv.add(`<g fill="${colour}">${out.join('')}</g>`);
  // the leader's scarf, the only colour in the line
  cv.add(`<path d="M${pt([lx + ls * 0.26, ly - ls * 1.12])} C${pt([lx + ls * 0.42, ly - ls * 1.22])} ${pt([lx + ls * 0.45, ly - ls * 1.02])} ${pt([lx + ls * 0.6, ly - ls * 1.08])} L${pt([lx + ls * 0.5, ly - ls * 0.92])} C${pt([lx + ls * 0.42, ly - ls * 0.95])} ${pt([lx + ls * 0.36, ly - ls * 1.05])} ${pt([lx + ls * 0.26, ly - ls * 1.12])} Z" fill="${scarf}"/>`);
}

/** A deer standing on a rise, side on, head up — Hevalo keeping watch. */
export function deer(cv, { x, y, size, colour, facing = 1 }) {
  const s = size / 100;
  const f = facing;
  const P = (px, py) => pt([x + f * px * s, y + py * s]);
  const body =
    `M${P(-38, -52)} C${P(-44, -60)} ${P(-30, -66)} ${P(-10, -64)} C${P(10, -63)} ${P(22, -64)} ${P(28, -70)} ` +
    `L${P(34, -96)} C${P(35, -102)} ${P(40, -106)} ${P(46, -104)} L${P(54, -98)} C${P(58, -95)} ${P(57, -91)} ${P(52, -90)} L${P(44, -88)} ` +
    `C${P(40, -78)} ${P(38, -66)} ${P(34, -56)} C${P(32, -48)} ${P(30, -44)} ${P(28, -38)} ` +
    `L${P(30, -2)} L${P(25, 0)} L${P(22, -34)} L${P(16, -36)} L${P(15, 0)} L${P(10, 0)} L${P(9, -36)} ` +
    `C${P(-6, -36)} ${P(-18, -36)} ${P(-26, -38)} L${P(-24, 0)} L${P(-29, 0)} L${P(-33, -36)} L${P(-36, -36)} L${P(-36, 0)} L${P(-41, 0)} L${P(-42, -44)} ` +
    `C${P(-44, -48)} ${P(-48, -50)} ${P(-46, -54)} Z`;
  const antlers =
    `M${P(42, -104)} C${P(40, -116)} ${P(34, -124)} ${P(26, -132)} M${P(36, -118)} L${P(44, -128)} M${P(30, -127)} L${P(30, -138)} ` +
    `M${P(46, -104)} C${P(50, -116)} ${P(52, -124)} ${P(58, -132)} M${P(51, -118)} L${P(60, -122)} M${P(55, -127)} L${P(54, -138)}`;
  const ear = `M${P(38, -100)} L${P(28, -104)} L${P(36, -96)} Z`;
  cv.add(`<path d="${body} ${ear}" fill="${colour}"/><path d="${antlers}" fill="none" stroke="${colour}" stroke-width="${n(3.2 * s)}" stroke-linecap="round"/>`);
}

// ───────────────────────────────────────────────────────────── flowers

/** A field of tulips toward the viewer: far ones as dabs, near ones with cups and leaves. */
export function tulips(cv, rnd, { top, bottom, count, colours, stem = '#2f6b3a', leaf = '#3f8a48', x0 = 0, x1 = cv.w }) {
  const items = [];
  for (let i = 0; i < count; i++) {
    const t = rnd() ** 1.6;
    const y = top + (bottom - top) * t;
    items.push([between(rnd, x0, x1), y, 3 + t * 22, colours[Math.floor(rnd() * colours.length) % colours.length]]);
  }
  items.sort((a, b) => a[1] - b[1]);
  const out = [];
  for (const [x, y, s, [dark, mid, lit]] of items) {
    if (s < 7) {
      out.push(`<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(s * 0.45)}" ry="${n(s * 0.55)}" fill="${mid}"/>`);
      continue;
    }
    const lean = between(rnd, -0.25, 0.25) * s;
    out.push(`<path d="M${pt([x, y + s * 1.7])} Q${pt([x + lean * 0.3, y + s])} ${pt([x + lean, y])}" stroke="${stem}" stroke-width="${n(s * 0.12)}" fill="none"/>`);
    out.push(`<path d="M${pt([x, y + s * 1.7])} C${pt([x - s * 0.5, y + s * 1.2])} ${pt([x - s * 0.55, y + s * 0.7])} ${pt([x - s * 0.35, y + s * 0.45])} C${pt([x - s * 0.2, y + s * 0.9])} ${pt([x - s * 0.05, y + s * 1.3])} ${pt([x, y + s * 1.7])} Z" fill="${leaf}"/>`);
    const cx = x + lean;
    out.push(`<path d="M${pt([cx - s * 0.42, y - s * 0.55])} C${pt([cx - s * 0.48, y + s * 0.05])} ${pt([cx - s * 0.25, y + s * 0.35])} ${pt([cx, y + s * 0.35])} C${pt([cx + s * 0.25, y + s * 0.35])} ${pt([cx + s * 0.48, y + s * 0.05])} ${pt([cx + s * 0.42, y - s * 0.55])} L${pt([cx + s * 0.2, y - s * 0.3])} L${pt([cx, y - s * 0.62])} L${pt([cx - s * 0.2, y - s * 0.3])} Z" fill="${mid}"/>`);
    out.push(`<path d="M${pt([cx - s * 0.2, y - s * 0.3])} L${pt([cx, y - s * 0.62])} L${pt([cx + s * 0.2, y - s * 0.3])} C${pt([cx + s * 0.22, y + s * 0.1])} ${pt([cx + s * 0.1, y + s * 0.3])} ${pt([cx, y + s * 0.34])} C${pt([cx - s * 0.1, y + s * 0.3])} ${pt([cx - s * 0.22, y + s * 0.1])} ${pt([cx - s * 0.2, y - s * 0.3])} Z" fill="${dark}"/>`);
    out.push(`<path d="M${pt([cx - s * 0.32, y - s * 0.35])} C${pt([cx - s * 0.36, y - s * 0.05])} ${pt([cx - s * 0.28, y + s * 0.12])} ${pt([cx - s * 0.18, y + s * 0.18])}" stroke="${lit}" stroke-width="${n(s * 0.09)}" stroke-linecap="round" fill="none"/>`);
  }
  cv.add(out.join(''));
}

/** Wild flowers: five-petalled dabs scattered over a meadow, bigger toward the viewer. */
export function meadow(cv, rnd, { top, bottom, count, colours, centre = '#ffd36a', x0 = 0, x1 = cv.w }) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = rnd() ** 1.8;
    const y = top + (bottom - top) * t;
    const x = between(rnd, x0, x1);
    const r = 1.2 + t * 7;
    const c = colours[Math.floor(rnd() * colours.length) % colours.length];
    if (r < 3) {
      out.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${c}"/>`);
      continue;
    }
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      out.push(`<circle cx="${n(x + Math.cos(a) * r * 0.62)}" cy="${n(y + Math.sin(a) * r * 0.5)}" r="${n(r * 0.48)}" fill="${c}"/>`);
    }
    out.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r * 0.32)}" fill="${centre}"/>`);
  }
  cv.add(out.join(''));
}

/** Grass blades along the bottom edge, in two shades. */
export function grass(cv, rnd, { y, count, h, dark, lit }) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const x = rnd() * cv.w;
    const hh = h * between(rnd, 0.5, 1.2);
    const lean = between(rnd, -0.4, 0.4) * hh;
    const w = between(rnd, 2, 4.5);
    out.push(`<path d="M${pt([x - w, y + 4])} Q${pt([x + lean * 0.3, y - hh * 0.5])} ${pt([x + lean, y - hh])} Q${pt([x + lean * 0.2 + w * 0.3, y - hh * 0.45])} ${pt([x + w, y + 4])} Z" fill="${rnd() < 0.4 ? lit : dark}"/>`);
  }
  cv.add(out.join(''));
}

/** Falling petals, each a small tilted oval. */
export function petals(cv, rnd, { count, top = 0, bottom = cv.h, colours, size = 6 }) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const x = rnd() * cv.w;
    const y = between(rnd, top, bottom);
    const s = size * between(rnd, 0.5, 1.2);
    out.push(`<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(s)}" ry="${n(s * 0.55)}" transform="rotate(${n(between(rnd, -60, 60))} ${n(x)} ${n(y)})" fill="${colours[Math.floor(rnd() * colours.length) % colours.length]}" fill-opacity="${n(between(rnd, 0.6, 1))}"/>`);
  }
  cv.add(out.join(''));
}

/** Fireflies: warm points, each in a small halo. */
export function fireflies(cv, rnd, { count, top, bottom, colour }) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const x = rnd() * cv.w;
    const y = between(rnd, top, bottom);
    const r = between(rnd, 1.2, 2.6);
    glow(cv, x, y, r * 6, colour, 0.4);
    out.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${tint(colour, 0.5)}"/>`);
  }
  cv.add(out.join(''));
}

/** A river winding from far to near, widening as it comes. */
export function river(cv, { x0, y0, x1, y1, w0, w1, colour, edge }) {
  const mx = (x0 + x1) / 2;
  const path = `M${pt([x0 - w0 / 2, y0])} C${pt([mx - w0, y0 + (y1 - y0) * 0.35])} ${pt([x1 + w1 * 0.8, y0 + (y1 - y0) * 0.55])} ${pt([x1 - w1 / 2, y1])} L${pt([x1 + w1 / 2, y1])} C${pt([x1 + w1 * 1.6, y0 + (y1 - y0) * 0.55])} ${pt([mx, y0 + (y1 - y0) * 0.35])} ${pt([x0 + w0 / 2, y0])} Z`;
  const id = cv.id('river');
  cv.def(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${n(y0)}" x2="0" y2="${n(y1)}"><stop offset="0" stop-color="${tint(colour, 0.35)}"/><stop offset="1" stop-color="${colour}"/></linearGradient>`);
  cv.add(`<path d="${path}" fill="url(#${id})" stroke="${edge}" stroke-width="2" stroke-opacity="0.5"/>`);
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

/** The Kurdish sun: a disc and twenty-one rays. */
export function kurdishSun(cv, { x, y, r, colour, halo = colour, haloOpacity = 0.5 }) {
  glow(cv, x, y, r * 5, halo, haloOpacity);
  const rays21 = [];
  for (let i = 0; i < 21; i++) {
    const a = (i / 21) * Math.PI * 2 - Math.PI / 2;
    const hw = Math.PI / 21 * 0.55;
    rays21.push(`M${pt([x + Math.cos(a - hw) * r * 1.02, y + Math.sin(a - hw) * r * 1.02])} L${pt([x + Math.cos(a) * r * 1.75, y + Math.sin(a) * r * 1.75])} L${pt([x + Math.cos(a + hw) * r * 1.02, y + Math.sin(a + hw) * r * 1.02])} Z`);
  }
  cv.add(`<path d="${rays21.join(' ')}" fill="${colour}"/><circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${colour}"/>`);
}

/** A wood of oaks along a line: many crowns, back ones darker and smaller. */
export function grove(cv, rnd, { pts, x0 = -40, x1 = cv.w + 40, count, size, leaf, leafLit, leafDark, trunk, light = -1, sink = 0.15 }) {
  const trees = [];
  for (let i = 0; i < count; i++) {
    const x = between(rnd, x0, x1);
    trees.push([x, heightAt(pts, x) + size * between(rnd, sink * 0.3, sink), size * between(rnd, 0.7, 1.2)]);
  }
  trees.sort((a, b) => a[1] - b[1]);
  for (const [x, y, s] of trees) oak(cv, rnd, { x, y, size: s, leaf, leafLit, leafDark, trunk, light });
}
