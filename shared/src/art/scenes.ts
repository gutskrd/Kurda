/**
 * The little landscapes inside the emblems: the climb of the game ranks (a
 * plain at sunrise, green hills, a high pasture with a black tent, a
 * snow-capped mountain, the summit above the clouds, and the sun of
 * twenty-one rays rising over it) and the journey of the learning leagues
 * (a dewdrop on a leaf, a spring among stones, a river through its valley, a
 * mountain lake, the sea at sunrise, and the open ocean with a whale's tail).
 *
 * Each is drawn once, round 0,0 in a circle of radius 50, and runs well past
 * that circle on every side: an emblem clips it to whatever holds it — a
 * round medallion, a drop, a shield — and scales it to fit. Colours are fills
 * and gradients over each shape's own box, so a scene draws the same inside
 * a scaled group on the phone as in the browser.
 *
 * `detail` is how small the scene is shown: 0 in full, 1 small (the fine
 * things go: furrows, flowers, ripples, the smallest leaves), 2 tiny, where
 * only the shapes that say the place are left, made bolder.
 */
import { circ, drop } from './icons.js';
import { leaf } from './paint.js';
import { roundPath } from './geometry.js';
import type { LeagueTier, RankTier } from './keys.js';
import type { Drawing, Pt, Stop } from './svg.js';
import { linearBox, n, n2, radialBox } from './svg.js';

export type Detail = 0 | 1 | 2;
export type SceneKey = RankTier | 'placing' | LeagueTier;

/** A gradient from the top of a shape to its bottom; returns the fill. */
function down(dr: Drawing, stops: readonly Stop[]): string {
  const id = dr.id('s');
  dr.def(linearBox(id, stops));
  return `url(#${id})`;
}

/** A glow from a shape's middle out; returns the fill. */
function glow(dr: Drawing, stops: readonly Stop[], cx = 0.5, cy = 0.5, r = 0.5): string {
  const id = dr.id('s');
  dr.def(radialBox(id, stops, cx, cy, r));
  return `url(#${id})`;
}

const sky = (top: number, bottom: number, fill: string): string => `<rect x="-62" y="${n(top)}" width="124" height="${n(bottom - top)}" fill="${fill}"/>`;
const path = (d: string, fill: string, extra = ''): string => `<path d="${d}" fill="${fill}"${extra}/>`;
const line = (d: string, colour: string, w: number, extra = ''): string =>
  `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${n2(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const half = (cx: number, y: number, r: number): string => `M${n(cx - r)},${n(y)}A${n(r)},${n(r)} 0 0 1 ${n(cx + r)},${n(y)}Z`;

/** Where a straight slope from a peak to its foot is at height y. */
function slopeAt(peak: Pt, foot: Pt, y: number): Pt {
  const t = (y - peak[1]) / (foot[1] - peak[1]);
  return [peak[0] + (foot[0] - peak[0]) * t, y];
}

/** A snow cap on a peak: its top down to `depth`, with a soft scalloped hem. */
function snowCap(peak: Pt, left: Pt, right: Pt, depth: number, round: number): string {
  const y = peak[1] + depth;
  const a = slopeAt(peak, left, y);
  const b = slopeAt(peak, right, y);
  const w = b[0] - a[0];
  const hem: Pt[] = [
    [a[0] + w * 0.78, y - depth * 0.22],
    [a[0] + w * 0.56, y + depth * 0.12],
    [a[0] + w * 0.36, y - depth * 0.24],
    [a[0] + w * 0.18, y + depth * 0.1],
  ];
  return roundPath([a, peak, b, ...hem], [0, round, 0, depth * 0.2, depth * 0.2, depth * 0.2, depth * 0.2]);
}

/** A cloud bank: puffs along its top, flat beneath, reaching down past the scene. */
function cloudBank(puffs: readonly (readonly [number, number, number])[], base: number): string {
  return puffs.map(([x, y, r]) => circ(x, y, r)).join('') + `M-62,${n(base)}H62V62H-62Z`;
}

/** A small fair-weather cloud sitting on y, `s` = 1 for one 24 units wide: three puffs on a rounded base. */
function cloud(x: number, y: number, s: number): string {
  const r = 3.4 * s;
  return `${circ(x - 6.5 * s, y - 3.2 * s, 5 * s)}${circ(x + 0.5 * s, y - 6 * s, 7.2 * s)}${circ(x + 7 * s, y - 2.8 * s, 4.6 * s)}M${n(x - 12 * s + r)},${n(y - r)}H${n(x + 12 * s - r)}A${n(r)},${n(r)} 0 0 1 ${n(x + 12 * s - r)},${n(y + r)}H${n(x - 12 * s + r)}A${n(r)},${n(r)} 0 0 1 ${n(x - 12 * s + r)},${n(y - r)}Z`;
}

/** An ear of wheat leaning by `lean` degrees from upright, its top at x,y. */
function wheatEar(x: number, y: number, lean: number, grains: number, size: number): { ear: string; stalk: string } {
  const a = ((lean - 90) * Math.PI) / 180;
  const up: Pt = [Math.cos(a), Math.sin(a)];
  const out: string[] = [];
  for (let i = 0; i < grains; i++) {
    const base: Pt = [x - up[0] * (i + 1) * size * 1.05, y - up[1] * (i + 1) * size * 1.05];
    const tilt = (deg: number): Pt => {
      const b = (deg * Math.PI) / 180;
      return [up[0] * Math.cos(b) - up[1] * Math.sin(b), up[0] * Math.sin(b) + up[1] * Math.cos(b)];
    };
    out.push(leaf(base, tilt(-28), size * 1.7, size * 0.62), leaf(base, tilt(28), size * 1.7, size * 0.62));
  }
  out.push(leaf([x - up[0] * size * 0.6, y - up[1] * size * 0.6], up, size * 1.7, size * 0.6));
  const foot: Pt = [x - up[0] * size * 22, y - up[1] * size * 22];
  return { ear: out.join(''), stalk: `M${n(x - up[0] * grains * size)},${n(y - up[1] * grains * size)}Q${n(foot[0] + up[0] * 8)},${n(foot[1] - 6)} ${n(foot[0])},${n(foot[1] + 30)}` };
}

/** A fern frond along a quadratic curve from `a` through `c` to `b`, leaflets either side, smaller toward the tip. */
function fern(a: Pt, c: Pt, b: Pt, pairs: number, len: number): { stem: string; leaves: string } {
  const out: string[] = [];
  for (let i = 1; i <= pairs; i++) {
    const t = i / (pairs + 1);
    const u = 1 - t;
    const p: Pt = [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]];
    const d: Pt = [2 * u * (c[0] - a[0]) + 2 * t * (b[0] - c[0]), 2 * u * (c[1] - a[1]) + 2 * t * (b[1] - c[1])];
    const l = Math.hypot(d[0], d[1]) || 1;
    const g: Pt = [d[0] / l, d[1] / l];
    const size = len * (1 - t * 0.6);
    for (const side of [1, -1]) {
      const deg = (side * 62 * Math.PI) / 180;
      out.push(leaf(p, [g[0] * Math.cos(deg) - g[1] * Math.sin(deg), g[0] * Math.sin(deg) + g[1] * Math.cos(deg)], size, size * 0.36));
    }
  }
  out.push(leaf(b, [(b[0] - c[0]) / Math.hypot(b[0] - c[0], b[1] - c[1]), (b[1] - c[1]) / Math.hypot(b[0] - c[0], b[1] - c[1])], len * 0.45, len * 0.18));
  return { stem: `M${n(a[0])},${n(a[1])}Q${n(c[0])},${n(c[1])} ${n(b[0])},${n(b[1])}`, leaves: out.join('') };
}

/** Rows of soft wave crests across the water at height y, one every `len`. */
function crests(y: number, len: number, amp: number, phase: number): string {
  let d = `M${n(-62 + phase)},${n(y)}`;
  for (let x = -62 + phase; x < 62; x += len) d += `q${n(len / 4)},${n(-amp)} ${n(len / 2)},0`;
  return d;
}

/** Twenty-one rays round cx,cy from r0 to r1: the sun of the Kurdish flag, its rays rounded like a child's drawing of the sun. */
function sunRays(cx: number, cy: number, r0: number, r1: number, count = 21): string {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const a = ((i * 360) / count - 90) * (Math.PI / 180);
    out.push(`M${n(cx + Math.cos(a) * r0)},${n(cy + Math.sin(a) * r0)}L${n(cx + Math.cos(a) * r1)},${n(cy + Math.sin(a) * r1)}`);
  }
  return out.join('');
}

type Painter = (dr: Drawing, detail: Detail, lit?: number) => string;

const SCENES: Record<SceneKey, Painter> = {
  // Deşt, the plain: the sun rising over a wheat field, its furrows running to the horizon
  dest: (dr, detail) => {
    const out = [
      sky(-90, 12, down(dr, [[0, '#f59a66'], [0.5, '#ffc98c'], [1, '#fff3d2']])),
      path(half(0, 8, 25), '#fff6d8', ' fill-opacity="0.7"'),
      path(half(0, 8, 17), down(dr, [[0, '#ffe680'], [1, '#ff9a2c']])),
      path('M-62,8H62V62H-62Z', down(dr, [[0, '#f3bc50'], [0.4, '#df8f3e'], [1, '#a9492a']])),
    ];
    if (detail < 2) {
      const furrows: string[] = [];
      for (let k = -3; k <= 3; k++) furrows.push(`M${n(k * 3.2)},9.5L${n(k * 30)},62`);
      out.push(line(furrows.join(''), '#a14a24', detail === 0 ? 2.2 : 3, ' stroke-opacity="0.42"'));
    }
    if (detail === 0) {
      const ears = [wheatEar(-34, 24, -14, 4, 2.1), wheatEar(-25, 30, -4, 4, 2.1), wheatEar(31, 22, 12, 4, 2.1), wheatEar(23, 30, 4, 4, 2.1)];
      out.push(line(ears.map((e) => e.stalk).join(''), '#c47a30', 1.3));
      out.push(path(ears.map((e) => e.ear).join(''), '#ffd977', ' stroke="#c47a30" stroke-width="0.6"'));
    }
    return out.join('');
  },

  // Gir, the hill: rolling green hills one behind another, a round tree on the middle one
  gir: (dr, detail) => {
    const out = [sky(-90, 24, down(dr, [[0, '#8fd0f2'], [0.75, '#d6f2f4'], [1, '#effbe9']]))];
    if (detail < 2) out.push(path(cloud(-18, -21, 1), '#ffffff', ' fill-opacity="0.94"'));
    if (detail === 0) out.push(path(cloud(26, -32, 0.62), '#ffffff', ' fill-opacity="0.8"'));
    out.push(path('M-62,2C-40,-12 -22,-12 -4,-2C10,-12 34,-14 62,0V62H-62Z', '#b3e397'));
    out.push(path('M-62,18C-40,4 -18,-2 6,6C22,12 40,8 62,14V62H-62Z', '#6dc561'));
    if (detail === 0) out.push(path('M8,10.5C12,8.5 22,9 26,11C21,13 12,13 8,10.5Z', '#3f9e4b', ' fill-opacity="0.5"'));
    const tx = 16;
    out.push(path(`M${tx - 1.8},10L${tx - 1},-3H${tx + 1}L${tx + 1.8},10Z`, '#7a4e2c'));
    out.push(path(`${circ(tx, -9, detail === 2 ? 11 : 9)}${circ(tx - 6, -4, 6)}${circ(tx + 6, -4, 6)}`, '#2f9446'));
    if (detail < 2) out.push(path(circ(tx - 3, -12, 4.2), '#5cc05c'));
    out.push(path('M-62,34C-34,22 -6,24 18,32C34,38 48,36 62,32V62H-62Z', '#3f9f4b'));
    if (detail === 0) out.push(line('M-50,29.5C-30,23 -8,24 14,30.5', '#86d677', 1.6, ' stroke-opacity="0.7"'));
    return out.join('');
  },

  // Zozan, the high pasture: a summer meadow in flower, a black tent of goat hair on it, far snowy peaks
  zozan: (dr, detail) => {
    const peaks: Pt[] = [
      [-62, 14],
      [-62, -2],
      [-40, -20],
      [-28, -9],
      [-10, -30],
      [8, -12],
      [22, -22],
      [42, -2],
      [62, -10],
      [62, 14],
    ];
    const out = [
      sky(-90, 14, down(dr, [[0, '#7fd8d6'], [1, '#e4fbf5']])),
      path(roundPath(peaks, [0, 0, 3, 2, 3.5, 2, 3, 2, 0, 0]), '#79b5c6'),
    ];
    if (detail < 2) {
      out.push(
        path(
          snowCap([-40, -20], [-62, -2], [-28, -9], 6, 3) + snowCap([-10, -30], [-28, -9], [8, -12], 8, 3.5) + snowCap([22, -22], [8, -12], [42, -2], 6, 3),
          '#ffffff',
        ),
      );
    }
    out.push(path('M-62,8C-24,0 24,0 62,8V62H-62Z', down(dr, [[0, '#76dcbd'], [1, '#26a185']])));
    if (detail < 2) {
      const flowers: [number, number, string][] = [
        [-36, 30, '#ff6b6b'],
        [-26, 40, '#ffd84d'],
        [-14, 33, '#ffffff'],
        [-40, 44, '#ffffff'],
        [-6, 44, '#ff6b6b'],
        [10, 36, '#ffd84d'],
        [22, 44, '#ff9ecf'],
        [32, 32, '#ffffff'],
        [40, 42, '#ff6b6b'],
        [-22, 24, '#ff9ecf'],
        [28, 24, '#ffd84d'],
        [2, 50, '#ffffff'],
      ];
      const shown = detail === 0 ? flowers : flowers.filter((_, i) => i % 2 === 0);
      const r = detail === 0 ? 1.9 : 3;
      for (const colour of ['#ff6b6b', '#ffd84d', '#ffffff', '#ff9ecf']) {
        const ds = shown.filter((f) => f[2] === colour).map(([x, y]) => circ(x, y, r));
        if (ds.length) out.push(path(ds.join(''), colour));
      }
    }
    // the black tent: long and low, its roof lifted by three poles and sagging between them
    const tent: Pt[] = [
      [-19, 21],
      [-16.5, 10],
      [-8, 4.5],
      [-1.5, 7.5],
      [5, 2],
      [11.5, 7.5],
      [18, 4.5],
      [26.5, 10],
      [29, 21],
    ];
    out.push(path('M-21,21.5C-8,24.5 18,24.5 31,21.5C18,26.5 -8,26.5 -21,21.5Z', '#17644f', ' fill-opacity="0.45"'));
    out.push(path(roundPath(tent, [0.5, 1.8, 1.4, 1.8, 1.4, 1.8, 1.4, 1.8, 0.5]), '#29262f'));
    if (detail === 0) out.push(path('M-16.5,10L-8,4.5L-1.5,7.5L5,2L11.5,7.5L18,4.5L26.5,10L25.4,11.6L18,6.8L11.5,9.8L5,4.4L-1.5,9.8L-8,6.8L-15.4,11.6Z', '#4a4552'));
    out.push(path('M1.6,21.4L2.4,11.4Q5,9.2 7.6,11.4L8.4,21.4Z', '#ffc96b'));
    if (detail === 0) out.push(line('M-16.5,10.5L-24,21M26.5,10.5L34,21', '#29262f', 0.8));
    return out.join('');
  },

  // Çiya, the mountain: one great snow-capped peak against a deep sapphire sky
  ciya: (dr, detail) => {
    const peak: Pt = [-2, -36];
    const left: Pt = [-50, 46];
    const right: Pt = [48, 46];
    const out = [
      sky(-90, 34, down(dr, [[0, '#2f5fd6'], [0.55, '#8fb2fa'], [1, '#e2ecff']])),
      path(roundPath([[-62, 32], [-36, -2], [-12, 32]], [0, 3, 0]), '#9ab4f2'),
      path(roundPath([[4, 34], [32, -6], [62, 30]], [0, 3, 0]), '#86a3ec'),
      path(roundPath([left, peak, right], [0, 4.5, 0]), '#4a72de'),
      path(`M${n(peak[0] + 1.2)},${n(peak[1] + 2.6)}L${n(right[0])},${n(right[1])}H4L10,22L-1,4L5,-12Z`, '#2343a6'),
      path(snowCap(peak, left, right, 19, 4.5), '#ffffff'),
    ];
    if (detail < 2) out.push(path(`M${n(peak[0] + 1.2)},${n(peak[1] + 2.6)}L${n(slopeAt(peak, right, -17)[0])},-17L8,-16L5,-12Z`, '#c7d9ff'));
    if (detail === 0) out.push(`<ellipse cx="0" cy="33" rx="60" ry="5" fill="#ffffff" fill-opacity="0.2"/>`);
    out.push(path('M-62,36C-36,28 -16,34 4,40C24,34 44,30 62,36V62H-62Z', '#183489'));
    return out.join('');
  },

  // Lûtke, the summit: a peak standing above a sea of cloud at dusk, a small pennant at its top
  lutke: (dr, detail) => {
    const peak: Pt = [0, -28];
    const left: Pt = [-32, 28];
    const right: Pt = [32, 28];
    const out = [
      sky(-90, 30, down(dr, [[0, '#5233ae'], [0.55, '#a37fe6'], [1, '#f6c4de']])),
      path(roundPath([left, peak, right], [0, 3.5, 0]), '#8263cf'),
      path(`M1,-25.6L${n(right[0])},${n(right[1])}H5L9,8L1,-6L4,-16Z`, '#4f3196'),
      path(snowCap(peak, left, right, 14, 3.5), '#ffffff'),
    ];
    if (detail < 2) out.push(path(`M1,-25.6L${n(slopeAt(peak, right, -14)[0])},-14L5,-13.4L4,-16Z`, '#ddd0ff'));
    // the pennant: a small triangle of warm colour, its corners rounded
    const flagW = detail === 0 ? 1.5 : 2.4;
    out.push(line('M0,-27.5V-43', '#2e1a5e', flagW));
    out.push(path(roundPath([[0.6, -43.5], [detail === 0 ? 12 : 14, -39.5], [0.6, -35.5]], [0.6, 1.4, 0.6]), '#ff7b7b'));
    out.push(path(cloudBank([[-48, 16, 10], [-34, 11, 11], [-20, 15, 9], [16, 14, 10], [30, 9, 11], [46, 14, 10]], 16), '#e3d4ff'));
    out.push(path(cloudBank([[-52, 27, 11], [-36, 22, 12], [-18, 26, 11], [0, 22, 12], [18, 26, 11], [36, 21, 12], [54, 26, 10]], 26), '#ffffff'));
    return out.join('');
  },

  // Stêrk, the star: the sun of twenty-one rays rising behind the summit at dawn
  sterk: (dr, detail) => {
    const sun: Pt = [0, -6];
    const out = [
      sky(-90, 34, down(dr, [[0, '#33268a'], [0.5, '#a9529a'], [1, '#ffb25c']])),
      `<circle cx="${sun[0]}" cy="${sun[1]}" r="36" fill="${glow(dr, [[0, '#fff2b0', 0.7], [0.5, '#ffd36b', 0.3], [1, '#ffd36b', 0]])}"/>`,
      line(sunRays(sun[0], sun[1], 19, detail === 2 ? 29 : 28), '#ffd54a', detail === 0 ? 3.6 : detail === 1 ? 4.4 : 5.6),
      `<circle cx="${sun[0]}" cy="${sun[1]}" r="14.5" fill="${glow(dr, [[0, '#fffef2'], [0.6, '#ffe682'], [1, '#ffc93a']], 0.42, 0.38, 0.62)}"/>`,
    ];
    const range: Pt[] = [
      [-64, 62],
      [-64, 34],
      [-40, 20],
      [-26, 27],
      [0, 6],
      [24, 24],
      [38, 18],
      [64, 36],
      [64, 62],
    ];
    out.push(path(roundPath(range, [0, 0, 3, 2, 3.5, 2, 3, 0, 0]), '#46256c'));
    out.push(path('M-0.8,7.6L-24,26.4L-12,32L-4,20Z', '#6a3d90'));
    if (detail === 0) out.push(line('M-1.2,7.8L-23.2,26', '#ffbf86', 1.1, ' stroke-opacity="0.7"'));
    out.push(path('M-62,42C-30,34 -10,40 8,46C30,38 46,36 62,42V62H-62Z', '#2a1446'));
    return out.join('');
  },

  // before a first tier: five stepping stones winding up toward peaks in the mist, one for each placement game, lit as it is played
  placing: (dr, detail, lit = 0) => {
    const out = [
      sky(-90, 20, down(dr, [[0, '#eeecf7'], [1, '#d3cfe6']])),
      path(roundPath([[-62, 16], [-30, -10], [-16, 0], [6, -26], [30, 4], [44, -6], [62, 8], [62, 18], [-62, 18]], [0, 3, 2, 3.5, 2, 3, 0, 0, 0]), '#b9b4d4'),
      path(snowCap([6, -26], [-16, 0], [30, 4], 8, 3.5), '#ffffff'),
      `<ellipse cx="0" cy="8" rx="64" ry="7" fill="#ffffff" fill-opacity="0.6"/>`,
      path('M-62,12C-20,6 20,6 62,12V62H-62Z', down(dr, [[0, '#c3bedb'], [1, '#9790b8']])),
    ];
    const big = detail === 2 ? 1.3 : 1;
    const stones: [number, number, number][] = [
      [-7, 45, 10.5 * big],
      [7, 34.5, 8.6 * big],
      [-5, 25.5, 7 * big],
      [5, 18.5, 5.6 * big],
      [-1, 13, 4.4 * big],
    ];
    const oval = ([x, y, w]: [number, number, number], dy: number): string =>
      `M${n(x - w)},${n(y + dy)}a${n(w)},${n(w * 0.42)} 0 1 0 ${n(w * 2)},0a${n(w)},${n(w * 0.42)} 0 1 0 ${n(-w * 2)},0Z`;
    const done = stones.slice(0, lit);
    const todo = stones.slice(lit);
    if (todo.length) out.push(path(todo.map((st) => oval(st, 1.8 * big)).join(''), '#7a7398'), path(todo.map((st) => oval(st, 0)).join(''), '#f8f7fc'));
    if (done.length) out.push(path(done.map((st) => oval(st, 1.8 * big)).join(''), '#5a2f96'), path(done.map((st) => oval(st, 0)).join(''), down(dr, [[0, '#e6c9ff'], [1, '#a866ea']])));
    return out.join('');
  },

  // Dilop, the drop: one bright dewdrop resting on a leaf in the morning
  dilop: (dr, detail) => {
    const out = [sky(-92, 62, down(dr, [[0, '#e4f5ff'], [1, '#a6d6f4']]))];
    if (detail === 0) out.push(path(`${circ(-28, -30, 5)}${circ(26, -40, 3.6)}${circ(32, -20, 4.2)}`, '#ffffff', ' fill-opacity="0.45"'));
    out.push(path('M-56,54C-46,14 -6,-8 42,-10C32,22 -6,46 -56,54Z', down(dr, [[0, '#a6e88a'], [1, '#3f9f4d']])));
    if (detail < 2) out.push(path('M-56,54C-26,30 4,8 42,-10C32,22 -6,46 -56,54Z', '#2c8a3e', ' fill-opacity="0.32"'));
    out.push(line('M-52,50C-26,28 4,6 40,-9', '#dcf8c6', detail === 0 ? 1.6 : 2.4, ' stroke-opacity="0.9"'));
    if (detail === 0) out.push(line('M-30,32L-36,22M-14,20L-20,9M4,9L-1,-1M-24,27L-16,36M-6,16L2,24M12,4L20,10', '#dcf8c6', 1, ' stroke-opacity="0.55"'));
    out.push(`<ellipse cx="-2" cy="23.5" rx="11" ry="3.2" fill="#256f33" fill-opacity="0.45"/>`);
    const d = drop(-4, 7, 1.62);
    out.push(path(d, glow(dr, [[0, '#ffffff'], [0.5, '#d4efff'], [1, '#6dbcf0']], 0.42, 0.62, 0.62), ` stroke="#3a8ad0" stroke-width="${detail === 0 ? 1.2 : 1.8}"`));
    if (detail < 2) out.push(`<ellipse cx="-8.4" cy="4.4" rx="2.2" ry="3.8" fill="#ffffff" transform="rotate(20 -8.4 4.4)"/>`);
    if (detail === 0) out.push(line('M-10,15C-8,19 0,19.6 3.4,15.6', '#ffffff', 1.2, ' stroke-opacity="0.75"'));
    return out.join('');
  },

  // Kanî, the spring: clear water welling up between mossy stones, bubbles rising, ferns either side
  kani: (dr, detail) => {
    const out = [sky(-92, 62, down(dr, [[0, '#e8f9ef'], [1, '#b2e5cc']]))];
    out.push(path(`${circ(-46, 10, 16)}${circ(-24, 4, 14)}${circ(26, 6, 15)}${circ(48, 12, 14)}M-62,10H62V62H-62Z`, '#97d9b0'));
    if (detail < 2) {
      const pairs = detail === 0 ? 7 : 4;
      const l = fern([-42, 46], [-44, 14], [-24, -10], pairs, detail === 0 ? 10 : 13);
      const r = fern([42, 46], [44, 14], [24, -10], pairs, detail === 0 ? 10 : 13);
      out.push(line(l.stem + r.stem, '#2b8f55', detail === 0 ? 1.4 : 2));
      out.push(path(l.leaves + r.leaves, '#38a865'));
    }
    out.push(`<ellipse cx="0" cy="44" rx="38" ry="10" fill="#45b6e0"/>`);
    if (detail === 0) out.push(`<ellipse cx="0" cy="44" rx="24" ry="5.6" fill="none" stroke="#d2f4ff" stroke-width="1.1"/><ellipse cx="0" cy="44" rx="31" ry="7.6" fill="none" stroke="#d2f4ff" stroke-width="0.8" stroke-opacity="0.6"/>`);
    // the spring itself: clear water swelling up out of the ground, catching the light
    out.push(path('M-14,43C-14,27 -7,19 0,19C7,19 14,27 14,43Z', down(dr, [[0, '#e4fbff'], [0.5, '#9ee3f8'], [1, '#3eb2e0']])));
    if (detail < 2) out.push(line('M-8.5,36C-8.5,29 -5.6,24.4 -1.8,23', '#ffffff', detail === 0 ? 1.8 : 2.6, ' stroke-opacity="0.85"'));
    out.push(`<ellipse cx="-25" cy="40" rx="15" ry="11" fill="#97a59e"/><ellipse cx="25" cy="42" rx="14" ry="10" fill="#8a9891"/>`);
    out.push(`<ellipse cx="-27" cy="35" rx="10" ry="4.8" fill="#c4d0c9"/><ellipse cx="23" cy="37.4" rx="9" ry="4.4" fill="#b7c4bd"/>`);
    if (detail === 0) out.push(`<ellipse cx="-33" cy="31" rx="6" ry="2.6" fill="#6cc58a"/><ellipse cx="30" cy="33.5" rx="5" ry="2.2" fill="#6cc58a"/>`);
    const bubbles: [number, number, number][] =
      detail === 0
        ? [
            [0, 11, 3.8],
            [-7, 3, 2.8],
            [6, -2, 3.1],
            [-1.5, -11, 2.2],
            [7.5, -17, 1.7],
          ]
        : detail === 1
          ? [
              [0, 10, 4.4],
              [-6.5, 0, 3.4],
              [5, -7, 2.8],
            ]
          : [
              [0, 9, 5.4],
              [-4, -4, 4],
            ];
    out.push(path(bubbles.map(([x, y, r]) => circ(x, y, r)).join(''), '#d4f5ff', ` stroke="#ffffff" stroke-width="${detail === 0 ? 1.1 : 1.7}"`));
    return out.join('');
  },

  // Çem, the river: winding toward us through a green valley, trees along its banks
  cem: (dr, detail) => {
    const out = [
      sky(-92, 8, down(dr, [[0, '#b3e0ff'], [1, '#effaff']])),
      path('M-62,6C-40,-6 -24,-6 -8,2C8,-8 30,-8 62,4V62H-62Z', '#acdca2'),
      path('M-62,10C-38,6 -20,14 -10,24C-2,34 -6,48 -10,62H-62Z', '#6ac468'),
      path('M62,8C38,6 22,14 14,26C8,36 14,48 20,62H62Z', '#56b35f'),
      path('M-1,3.6C-4,8 5,13 1,19C-4,26 -15,32 -11,42C-8,50 -15,56 -20,62H22C15,55 9,48 12,41C15,33 6,27 8,21C10,15 3,9 2,3.6Z', down(dr, [[0, '#9adbfc'], [1, '#2a92e2']])),
    ];
    out.push(line('M-1,3.6C-4,8 5,13 1,19C-4,26 -15,32 -11,42C-8,50 -15,56 -20,62', '#dff5ff', detail === 0 ? 1.2 : 1.8, ' stroke-opacity="0.8"'));
    if (detail < 2) out.push(line(detail === 0 ? 'M-3,29C0,27 3,27 6,29M-5,45C-1,43 5,43 9,45M1,14C2.6,13 4,13 5,14' : 'M-4,30C0,27.6 4,27.6 8,30M-5,46C0,43.6 5,43.6 10,46', '#e2f6ff', detail === 0 ? 1.2 : 2, ' stroke-opacity="0.85"'));
    if (detail < 2) {
      out.push(path(`${circ(-40, 12, detail === 0 ? 5 : 6.5)}${circ(-30, 17, detail === 0 ? 4 : 5)}${circ(40, 14, detail === 0 ? 5 : 6.5)}${detail === 0 ? circ(31, 19, 3.6) : ''}`, '#2f8f45'));
      out.push(line('M-40,17V21M-30,21V24.5M40,19V23', '#7a4e2c', 1.4));
    }
    return out.join('');
  },

  // Gol, the lake: a mountain at dusk and, upside down in the still water, its reflection
  gol: (dr, detail) => {
    const peak: Pt = [-8, -30];
    const left: Pt = [-42, 8];
    const right: Pt = [26, 8];
    const out = [
      sky(-92, 10, down(dr, [[0, '#7166df'], [1, '#ddd6ff']])),
      path(roundPath([[4, 8], [30, -12], [60, 8]], [0, 3, 0]), '#4a40b2'),
      path(roundPath([left, peak, right], [0, 3.5, 0]), '#6d62d8'),
      path(`M-7,-27.4L${n(right[0])},${n(right[1])}H-2L-6,-8Z`, '#3d339f'),
      path(snowCap(peak, left, right, 11, 3.5), '#ffffff'),
      path('M-62,8H62V62H-62Z', down(dr, [[0, '#6c63da'], [1, '#2f2888']])),
      path(roundPath([left, [peak[0], 46], right], [0, 3.5, 0]), '#8f86ec', ' fill-opacity="0.5"'),
      path(snowCap([peak[0], 46], left, right, -11, 3.5), '#ffffff', ' fill-opacity="0.32"'),
      path('M-62,6.5C-40,5 40,5 62,6.5V9.5H-62Z', '#2a2672'),
    ];
    if (detail < 2) out.push(line(detail === 0 ? 'M-34,22H-18M2,28H20M-24,36H-8M14,44H28' : 'M-30,24H-14M4,32H22', '#ffffff', detail === 0 ? 1.3 : 2, ' stroke-opacity="0.5"'));
    return out.join('');
  },

  // Derya, the sea: gentle waves rolling in, the sun on the horizon and its path of light on the water
  derya: (dr, detail) => {
    const out = [
      sky(-92, 6, down(dr, [[0, '#ffc2a2'], [0.6, '#ffdfc0'], [1, '#fff3dc']])),
      path(half(0, 4, 22), '#ffd59c', ' fill-opacity="0.45"'),
      path(half(0, 4, 15), down(dr, [[0, '#fff0b8'], [1, '#ff9a5c']])),
      path('M-62,4H62V62H-62Z', down(dr, [[0, '#26b7c2'], [1, '#09577f']])),
    ];
    out.push(
      line(detail === 2 ? 'M-9,9H9' : 'M-11,8.6H11M-7,13.4H7M-4,18H4', '#ffd8a8', detail === 2 ? 3.4 : 2.2, ' stroke-opacity="0.9"'),
    );
    const rows: [number, number][] = detail === 2 ? [[28, 0], [44, 8]] : [[26, 0], [37, 7.5], [49, 2]];
    out.push(line(rows.map(([y, p]) => crests(y, detail === 2 ? 20 : 15, detail === 2 ? 6 : 4.6, p)).join(''), '#c6f7f1', detail === 0 ? 2.2 : detail === 1 ? 3 : 4, ' stroke-opacity="0.92"'));
    return out.join('');
  },

  // Okyanûs, the ocean: a deep swell at nightfall and a whale's tail rising from it, water streaming off
  okyanus: (dr, detail) => {
    const out = [sky(-92, 2, down(dr, [[0, '#121c5e'], [0.7, '#22509c'], [1, '#3aa8c6']]))];
    if (detail === 0) out.push(path(`${circ(-30, -30, 0.9)}${circ(-16, -44, 0.7)}${circ(22, -36, 1)}${circ(34, -18, 0.7)}${circ(-40, -12, 0.7)}${circ(8, -52, 0.8)}`, '#bffcf0'));
    out.push(path('M-62,-2H62V62H-62Z', down(dr, [[0, '#1660ad'], [1, '#06215a']])));
    out.push(path('M-62,16C-36,0 -14,-2 6,10C24,20 42,18 62,10V62H-62Z', down(dr, [[0, '#1b7cc4'], [1, '#08296c']])));
    out.push(line('M-62,16C-36,0 -14,-2 6,10C24,20 42,18 62,10', '#7af2e2', detail === 0 ? 1.6 : 2.4, ' stroke-opacity="0.8"'));
    // the tail: its stock rising from the water and the two flukes spread above it
    out.push(path('M-5,10C-4.5,2 -2.5,-4 -1,-8H3C4.5,-4 6.5,2 7,10Z', '#24356a'));
    out.push(path('M1,-5C-3,-9 -12,-11 -22,-19.5C-12,-24 -2,-20 1,-12C4,-20 14,-24 24,-19.5C14,-11 5,-9 1,-5Z', down(dr, [[0, '#5d7fc4'], [1, '#22336a']])));
    if (detail < 2) out.push(path(`${drop(-21, -12, 0.26)}${drop(23, -11.5, 0.24)}${detail === 0 ? drop(-16, -3, 0.18) + drop(18, -2, 0.16) : ''}`, '#a8f4ff'));
    out.push(`<ellipse cx="1" cy="10.4" rx="${detail === 2 ? 14 : 12}" ry="${detail === 2 ? 3.6 : 2.6}" fill="#e4fbff" fill-opacity="0.85"/>`);
    return out.join('');
  },
};

/**
 * A scene's markup, round 0,0 in a circle of radius 50; the caller clips and
 * places it. `lit` is how many of the placement path's stones are lit.
 */
export function scene(dr: Drawing, key: SceneKey, detail: Detail, lit = 0): string {
  return SCENES[key](dr, detail, lit);
}

/** A scene placed with its centre at cx,cy and its circle of radius 50 drawn at radius `r`. */
export function sceneAt(dr: Drawing, key: SceneKey, cx: number, cy: number, r: number, detail: Detail, lit = 0): string {
  return `<g transform="translate(${n(cx)} ${n(cy)}) scale(${n2(r / 50)})">${scene(dr, key, detail, lit)}</g>`;
}
