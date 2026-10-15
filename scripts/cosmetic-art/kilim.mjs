/**
 * Kilims, woven rather than drawn.
 *
 * A kilim is a grid: every weft pass lays one colour per warp, so every
 * outline steps and every diagonal is a staircase. These are laid out on such
 * a grid — 160 × 90 cells of 8 pixels — and only then turned into rectangles,
 * so the hooked lozenges, eight-point stars, combs and zigzag borders come out
 * with the stepped edges a weave gives them.
 *
 * Three layouts, as Kurdish kilims are often built: a row of hooked guls down
 * the middle (`guls`), a field of lozenges in a lattice (`lattice`), and
 * stacked bands of different motifs (`bands`). The dyes drift row by row the
 * way hand-dyed wool does (abrash), and a fine weft texture lies over it all.
 */
import { between, n, pick, shuffle, tint } from './kit.mjs';

const CELL = 8;

class Loom {
  constructor(w, h) {
    this.cols = Math.ceil(w / CELL);
    this.rows = Math.ceil(h / CELL);
    this.grid = Array.from({ length: this.rows }, () => new Array(this.cols).fill(null));
  }
  set(c, r, colour) {
    if (r >= 0 && r < this.rows && c >= 0 && c < this.cols) this.grid[r][c] = colour;
  }
  fill(colour) {
    for (const row of this.grid) row.fill(colour);
  }
  band(r0, h, colour) {
    for (let r = r0; r < r0 + h; r++) for (let c = 0; c < this.cols; c++) this.set(c, r, colour);
  }
}

/** Every cell of a lozenge with "radius" R (|dx| + |dy| <= R) around (cx, cy), with the colour for its depth. */
function lozenge(loom, cx, cy, R, colourAt) {
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      const d = Math.abs(dx) + Math.abs(dy);
      if (d > R) continue;
      const colour = colourAt(R - d, dx, dy);
      if (colour) loom.set(cx + dx, cy + dy, colour);
    }
  }
}

/** An eight-point star of size s: a square and a lozenge laid over each other. */
function star(loom, cx, cy, s, outer, inner, centre) {
  const a = Math.round(s * 0.62);
  for (let dy = -s; dy <= s; dy++) {
    for (let dx = -s; dx <= s; dx++) {
      const inSquare = Math.abs(dx) <= a && Math.abs(dy) <= a;
      const inLozenge = Math.abs(dx) + Math.abs(dy) <= s;
      if (!inSquare && !inLozenge) continue;
      const edge =
        (Math.abs(dx) <= a - 1 && Math.abs(dy) <= a - 1) || Math.abs(dx) + Math.abs(dy) <= s - 2 ? false : true;
      let colour = edge ? outer : inner;
      if (Math.abs(dx) + Math.abs(dy) <= Math.max(1, Math.round(s * 0.3))) colour = centre;
      loom.set(cx + dx, cy + dy, colour);
    }
  }
}

/** Ram's-horn hooks round a lozenge's edge: out from the step, then a turn along it. */
function latchHooks(loom, cx, cy, R, colour, every = 4) {
  for (let k = every; k < R - 1; k += every) {
    for (const [sx, sy] of [[1, -1], [1, 1], [-1, 1], [-1, -1]]) {
      // the edge cell k steps from the top or bottom point
      const ex = cx + sx * k;
      const ey = cy + sy * (R - k);
      // out along the outward diagonal, then turn back toward the point
      loom.set(ex + sx, ey + sy, colour);
      loom.set(ex + sx * 2, ey + sy * 2, colour);
      loom.set(ex + sx * 2, ey + sy * 3, colour);
      loom.set(ex + sx * 1, ey + sy * 3, colour);
    }
  }
}

/** A small motif scattered in the ground: a cross, a little lozenge, a comb or an S. */
function filler(loom, rnd, c, r, colour, ink, kind = Math.floor(rnd() * 4)) {
  if (kind === 0) {
    for (let i = -2; i <= 2; i++) {
      loom.set(c + i, r, colour);
      loom.set(c, r + i, colour);
    }
    loom.set(c, r, ink);
  } else if (kind === 1) {
    lozenge(loom, c, r, 3, (depth) => (depth === 0 ? ink : depth === 3 ? ink : colour));
  } else if (kind === 2) {
    // a comb: a bar with teeth
    for (let i = -3; i <= 3; i++) loom.set(c + i, r, colour);
    for (let i = -3; i <= 3; i += 2) {
      loom.set(c + i, r - 1, colour);
      loom.set(c + i, r - 2, colour);
    }
  } else {
    // an S, for running water
    for (const [dx, dy] of [[-2, -2], [-1, -2], [0, -2], [-2, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2]]) loom.set(c + dx, r + dy, colour);
  }
}

/** Borders, top and bottom, mirrored: stripes, a zigzag, and a chain of small lozenges. */
function borders(loom, { ink, light, A, B, D }) {
  const rows = loom.rows;
  for (const flip of [false, true]) {
    const R = (r) => (flip ? rows - 1 - r : r);
    const line = (r, colour) => {
      for (let c = 0; c < loom.cols; c++) loom.set(c, R(r), colour);
    };
    line(0, ink);
    line(1, ink);
    line(2, light);
    line(3, ink);
    // a zigzag: triangles of A pointing in, B between
    for (let r = 4; r <= 8; r++) {
      for (let c = 0; c < loom.cols; c++) {
        const p = c % 10;
        const depth = r - 4;
        const inA = Math.abs(p - 4.5) <= 4.5 - depth;
        loom.set(c, R(r), inA ? A : B);
      }
    }
    line(9, ink);
    line(10, light);
    // a chain of small lozenges on light
    for (let c = 2; c < loom.cols + 6; c += 6) lozenge(loom, c, R(13), 2, (depth) => (depth === 2 ? ink : flip ? D : A));
    line(16, light);
    line(17, ink);
  }
}

const layouts = {
  /** A row of big hooked guls through the middle, stars between them, small motifs in the ground. */
  guls(loom, rnd, { ink, light, A, B, D, E }) {
    const cy = Math.floor(loom.rows / 2);
    const R = 22;
    const gap = 50;
    const centres = [];
    for (let cx = Math.floor(loom.cols / 2) - gap * 2; cx <= loom.cols + gap; cx += gap) centres.push(cx);
    for (const [i, cx] of centres.entries()) {
      const [o, m, inner] = i % 2 === 0 ? [A, B, D] : [B, A, E];
      latchHooks(loom, cx, cy, R, o, 4);
      lozenge(loom, cx, cy, R, (depth) => {
        if (depth <= 1) return ink;
        if (depth <= 5) return o;
        if (depth === 6) return ink;
        if (depth <= 9) return light;
        if (depth === 10) return ink;
        if (depth <= 14) return m;
        return null;
      });
      star(loom, cx, cy, 7, ink, inner, light);
    }
    for (let i = 0; i < centres.length - 1; i++) {
      const cx = (centres[i] + centres[i + 1]) / 2;
      star(loom, Math.round(cx), cy, 6, ink, pick(rnd, [A, B, D, E]), light);
      for (const dy of [-1, 1]) lozenge(loom, Math.round(cx), cy + dy * 16, 4, (depth) => (depth === 0 ? ink : depth >= 3 ? ink : pick(rnd, [A, D])));
    }
    // small motifs set in the ground in a steady rhythm, mirrored above and below
    for (let i = 0; i < centres.length - 1; i++) {
      const mid = Math.round((centres[i] + centres[i + 1]) / 2);
      const colour = pick(rnd, [A, B, D, E]);
      for (const dx of [-13, 13]) for (const dy of [-12, 12]) filler(loom, rnd, mid + dx, cy + dy, colour, ink, i % 2 ? 0 : 1);
    }
    for (const cx of centres) for (const dy of [-25, 25]) for (const dx of [-14, 0, 14]) filler(loom, rnd, cx + dx, cy + dy, dx === 0 ? E : D, ink, 0);
  },

  /** Lozenges in a lattice across the whole field, each holding a small star. */
  lattice(loom, rnd, { ink, light, A, B, D, E }) {
    const step = 18;
    const top = 20;
    const bottom = loom.rows - 20;
    for (let row = 0, cy = top + step / 2; cy < bottom + step / 2; cy += step / 2, row++) {
      for (let cx = row % 2 === 0 ? 0 : step / 2; cx < loom.cols + step; cx += step) {
        const fillC = row % 2 === 0 ? A : B;
        lozenge(loom, Math.round(cx), Math.round(cy), step / 2 - 1, (depth) => {
          if (Math.round(cy) - (step / 2 - 1) < top - 1 || Math.round(cy) + (step / 2 - 1) > bottom) return null;
          if (depth === 0) return ink;
          if (depth <= 2) return fillC;
          if (depth === 3) return light;
          return null;
        });
        if (Math.round(cy) - 5 >= top && Math.round(cy) + 5 <= bottom) star(loom, Math.round(cx), Math.round(cy), 4, ink, pick(rnd, [D, E, A]), light);
      }
    }
  },

  /** Stacked bands: hooked lozenges, stars, zigzags — each band its own. */
  bands(loom, rnd, { ink, light, A, B, D, E }) {
    const mid = Math.floor(loom.rows / 2);
    // the central band: a chain of hooked lozenges touching point to point
    const R = 11;
    for (let cx = 0, i = 0; cx < loom.cols + R; cx += R * 2, i++) {
      latchHooks(loom, cx, mid, R, i % 2 ? A : B, 3);
      lozenge(loom, cx, mid, R, (depth) => (depth === 0 ? ink : depth <= 3 ? (i % 2 ? B : A) : depth === 4 ? ink : depth <= 6 ? light : i % 2 ? D : E));
    }
    // bands of stars above and below
    for (const dy of [-1, 1]) {
      const r0 = mid + dy * 17;
      for (let c = 0; c < loom.cols; c++) {
        loom.set(c, r0 - 5, ink);
        loom.set(c, r0 + 5, ink);
      }
      for (let cx = 4, i = 0; cx < loom.cols + 6; cx += 10, i++) star(loom, cx, r0, 3, ink, i % 2 ? D : E, light);
      // a zigzag band beyond the stars
      const z0 = mid + dy * 25;
      for (let k = 0; k < 4; k++) {
        for (let c = 0; c < loom.cols; c++) {
          const p = c % 8;
          if (Math.abs(p - 3.5) <= 0.5 + k) loom.set(c, z0 + dy * k, k % 2 ? A : B);
        }
      }
    }
    for (const dy of [-1, 1]) for (let c = 5, i = 0; c < loom.cols; c += 10, i++) filler(loom, rnd, c, mid + dy * 34, i % 2 ? A : D, ink, 2);
  },
};

/**
 * Weaves a kilim onto the canvas. `field` is the ground, `ink` the dark
 * outlining wool, `light` the undyed one, `dyes` the colours of the motifs.
 */
export function kilim(cv, rnd, { field, ink, light, dyes, layout }) {
  const loom = new Loom(cv.w, cv.h);
  loom.fill(field);
  const [A, B, D, E] = shuffle(rnd, dyes.length >= 4 ? dyes : [...dyes, ...dyes]);
  layouts[layout](loom, rnd, { ink, light, A, B, D, E });
  borders(loom, { ink, light, A, B, D });

  // abrash: each batch of wool a shade off the last, in bands a few rows deep
  const drift = [];
  for (let r = 0; r < loom.rows; ) {
    const h = Math.floor(between(rnd, 2, 7));
    const t = between(rnd, -0.07, 0.05);
    for (let k = 0; k < h; k++) drift.push(t);
    r += h;
  }
  // a hand-woven row never lies quite straight: each is nudged a pixel or two
  const wobble = [];
  let drift2 = 0;
  for (let r = 0; r < loom.rows; r++) {
    drift2 = Math.max(-2, Math.min(2, drift2 + Math.round(between(rnd, -1.2, 1.2))));
    wobble.push(drift2);
  }
  const rects = [];
  for (let r = 0; r < loom.rows; r++) {
    const row = loom.grid[r];
    let c = 0;
    while (c < loom.cols) {
      const colour = row[c];
      let end = c + 1;
      while (end < loom.cols && row[end] === colour) end++;
      const x0 = c === 0 ? -4 : c * CELL + wobble[r];
      const x1 = end === loom.cols ? cv.w + 4 : end * CELL + wobble[r];
      rects.push(`<rect x="${x0}" y="${r * CELL}" width="${x1 - x0}" height="${CELL}" fill="${tint(colour, drift[r])}"/>`);
      c = end;
    }
  }
  cv.add(`<g shape-rendering="crispEdges">${rects.join('')}</g>`);
  // the weave itself: each weft pass a ridge, lit on top and shadowed under, the warps showing between
  const weft = cv.id('weft');
  cv.def(
    `<pattern id="${weft}" width="4" height="4" patternUnits="userSpaceOnUse">` +
      `<rect width="4" height="1" fill="#ffffff" fill-opacity="0.09"/><rect y="3" width="4" height="1" fill="#000000" fill-opacity="0.2"/>` +
      `<rect x="3" width="1" height="4" fill="#000000" fill-opacity="0.07"/></pattern>`,
  );
  cv.add(`<rect width="${cv.w}" height="${cv.h}" fill="url(#${weft})"/>`);
  // light falling across the rug, so it lies in a room rather than on a screen
  const sheen = cv.id('sheen');
  cv.def(`<radialGradient id="${sheen}" gradientUnits="userSpaceOnUse" cx="${n(cv.w * 0.3)}" cy="${n(cv.h * 0.2)}" r="${n(cv.w * 0.9)}"><stop offset="0" stop-color="#ffffff" stop-opacity="0.1"/><stop offset="1" stop-color="#000000" stop-opacity="0.22"/></radialGradient>`);
  cv.add(`<rect width="${cv.w}" height="${cv.h}" fill="url(#${sheen})"/>`);
}
