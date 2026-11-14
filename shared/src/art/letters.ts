/**
 * The pictures of letters by bird (shared/src/letters.ts): your window, the
 * pigeons that come and go from it, and a letter in its envelope.
 *
 * The window is one you look out of from inside a room, drawn for depth: the
 * wall of the room round it; the thickness of that wall, the soffit over the
 * window in shade and its two sides; the window's white frame set back in it;
 * a deep sill reaching out into the room, with a pot of flowers at one end
 * and a pigeon's place in the middle; and the two casements, as in the
 * owner's first window, swung open toward you, one each side, their glass
 * catching the light. Through it the country goes back in layers, paler the
 * further it is: the hour's sky with its sun or moon, clouds and two far
 * birds, blue mountains with snow on them, green hills with round trees, and
 * the meadow just outside with its flowers.
 *
 * Each layer is its own picture (`part`), the same square, so an app can set
 * them one over another and move them: the far ones least, so the country
 * has depth as the eye moves; the clouds drifting; the casements stirring in
 * the breeze; the light on the sill brightening and dimming. `whole` is all
 * of it, still. A pigeon (pigeon.ts) is drawn on its own (`letterBirdSvg`),
 * so it can stand on the sill in front of the room, or fly out through the
 * window and away into the country behind it; `LETTER_SILL` says where it
 * stands and how big, and `LETTER_FLIGHT` the way it flies.
 */
import { LETTER_BIRDS } from '../letters.js';
import { form, ring, rr, type Tones } from './cutout.js';
import { leaf } from './paint.js';
import { pigeon, type PigeonPose } from './pigeon.js';
import { Drawing, checkSize, linearAt, mix, n, prefixFor, radialAt, seeded, tint, type Pt } from './svg.js';
import type { TreeSky } from './tree-scene.js';

/** What changes with the hour: the country outside, and the room's own colours in its light. */
interface Hour {
  sky: readonly [top: string, horizon: string];
  /** the sun or the moon: where, how big, its colour and its glow */
  orb: readonly [x: number, y: number, r: number, colour: string, glow: string];
  cloud: string;
  mountains: readonly [far: string, near: string];
  snow: string;
  hills: readonly [back: string, front: string];
  trees: readonly [crown: string, trunk: string];
  meadow: readonly [string, string];
  grass: string;
  flowers: readonly [string, string, string];
  heart: string;
  wall: readonly [lit: string, base: string];
  soffit: string;
  jamb: readonly [lit: string, shade: string];
  frame: readonly [paint: string, shade: string];
  sill: readonly [top: string, front: string];
  glass: string;
  /** the light coming in, and how strong it is on the sill */
  light: readonly [string, number];
  night?: true;
}

const HOURS: Record<TreeSky, Hour> = {
  day: {
    sky: ['#8fcbf0', '#e2f3fb'],
    orb: [82, 30, 5.2, '#fff8d8', '#fff2b4'],
    cloud: '#ffffff',
    mountains: ['#b9cfe4', '#9db9d8'],
    snow: '#f4f8fc',
    hills: ['#b5d67a', '#9cc862'],
    trees: ['#5f9f48', '#7b5a3c'],
    meadow: ['#8cc653', '#a3d468'],
    grass: '#5f9a3e',
    flowers: ['#f9df4b', '#f2708f', '#a6d8f4'],
    heart: '#f06d8c',
    wall: ['#f8efe2', '#efe0cb'],
    soffit: '#d9c4a8',
    jamb: ['#efdfc8', '#e2ccae'],
    frame: ['#fcf9f3', '#e6ddcd'],
    sill: ['#fbf6ee', '#e3d6c2'],
    glass: '#d6ecf6',
    light: ['#fffbe9', 0.55],
  },
  dawn: {
    sky: ['#f2b9a4', '#fde7d2'],
    orb: [36, 50, 5.6, '#fff1cf', '#ffd59a'],
    cloud: '#fff4ec',
    mountains: ['#d6c3d6', '#bfa9c8'],
    snow: '#fff6f0',
    hills: ['#c4cf7e', '#a9c464'],
    trees: ['#6d9a4c', '#7b5a3c'],
    meadow: ['#94c058', '#accd6c'],
    grass: '#678f42',
    flowers: ['#f9df4b', '#f2708f', '#a6d8f4'],
    heart: '#f06d8c',
    wall: ['#f8e6da', '#eed4c4'],
    soffit: '#d9bba8',
    jamb: ['#f0d9ca', '#e2c4b0'],
    frame: ['#fdf6f1', '#e9d8cd'],
    sill: ['#fcf3ed', '#e6d0c2'],
    glass: '#f1dcd4',
    light: ['#ffe9d2', 0.5],
  },
  dusk: {
    sky: ['#b06a98', '#f7bf9c'],
    orb: [86, 52, 6, '#ffd9a0', '#ff9f70'],
    cloud: '#fcd8c8',
    mountains: ['#a882a8', '#8b6996'],
    snow: '#fbe6e2',
    hills: ['#a6b86a', '#8eaa58'],
    trees: ['#5a8644', '#6e4f36'],
    meadow: ['#7fae4e', '#94bf5c'],
    grass: '#58833c',
    flowers: ['#f6d25a', '#ee6f8e', '#b5c8f0'],
    heart: '#e9627f',
    wall: ['#f1d9cf', '#e3c3b6'],
    soffit: '#c9a395',
    jamb: ['#e6c8bb', '#d4ad9e'],
    frame: ['#fbf1ec', '#e3cfc6'],
    sill: ['#f8ece6', '#ddc5ba'],
    glass: '#e9c6c0',
    light: ['#ffdcc0', 0.45],
  },
  night: {
    sky: ['#121a44', '#2d3b7a'],
    orb: [80, 28, 4.6, '#f6f1d6', '#a9b8ff'],
    cloud: '#36427c',
    mountains: ['#27346a', '#202b5a'],
    snow: '#8e9ccc',
    hills: ['#2b4a44', '#25413a'],
    trees: ['#1f3a33', '#2a2a3a'],
    meadow: ['#264236', '#2c4c3c'],
    grass: '#1c3329',
    flowers: ['#d9c35a', '#c9667f', '#8fb0d6'],
    heart: '#c25a74',
    wall: ['#343c66', '#262d52'],
    soffit: '#1c2244',
    jamb: ['#2e3660', '#222a4e'],
    frame: ['#d8dbec', '#aeb3cc'],
    sill: ['#d2d6e8', '#a7acc6'],
    glass: '#3c4a86',
    light: ['#c4d2ff', 0.22],
    night: true,
  },
};

/** The window in the room, on its 120-unit square: the edge of the wall's thickness, the frame set back in it, the opening, and the sill. */
const REVEAL = { x0: 16, y0: 12, x1: 104, y1: 92 } as const;
const FRAME = { x0: 22, y0: 18, x1: 98, y1: 88 } as const;
const OPENING = { x0: 25.4, y0: 21.4, x1: 94.6, y1: 85.4 } as const;
/** Where the country is seen through the window, on its 120-unit square: a pigeon flying out is wholly inside it once it has gone behind the room. */
export const LETTER_OPENING = OPENING;
const SILL_FRONT = { x0: 10, x1: 110, y: 96, depth: 4.8 } as const;

/** The layers of the window, back to front. A pigeon on the sill stands over all of them, the light on the sill included: it lies under its feet. */
export const LETTER_WINDOW_PARTS = ['sky', 'clouds', 'far', 'near', 'room', 'left', 'right', 'light'] as const;
export type LetterWindowPart = (typeof LETTER_WINDOW_PARTS)[number];

/**
 * How far each layer moves as the eye moves, as a share of the window's
 * width at the eye's furthest: the country the more the nearer it is, the
 * room and its casements not at all, so the frame holds still and what is
 * outside turns behind it.
 */
export const LETTER_WINDOW_DEPTH: Readonly<Record<LetterWindowPart, number>> = { sky: 0.006, clouds: 0.012, far: 0.02, near: 0.04, room: 0, left: 0, right: 0, light: 0 };

/**
 * Where a pigeon stands on the sill, on the window's 120-unit square: under
 * its feet, and how wide its own square (`letterBirdSvg`) is drawn there, as a
 * share of the window's width, so it stands on the sill at a pigeon's size.
 */
export const LETTER_SILL = { x: 50, y: 93.4, birdShare: 0.46 } as const;

/** Where a pigeon's feet are on its own square, and how much bigger than its own drawing it is drawn there. */
export const LETTER_BIRD_FEET = { x: 60, y: 100, scale: 1.5 } as const;

/**
 * The way a pigeon flies off with a letter, out through the window and away
 * over the country: at each moment of the flight (`at`, 0 to 1), how far its
 * square has gone from its place on the sill (as shares of the window), how
 * big it is, and how much of it is seen. From `behindAt` on it is outside,
 * so the apps draw it behind the room: it has gone through the window by then,
 * small enough to be wholly inside it. A pigeon coming in flies the same way
 * backwards, from the far end to its place.
 */
export const LETTER_FLIGHT = {
  keys: [
    { at: 0, x: 0, y: 0, scale: 1, seen: 1 },
    { at: 0.12, x: 0, y: 0.012, scale: 1, seen: 1 },
    { at: 0.26, x: 0.03, y: -0.1, scale: 0.92, seen: 1 },
    { at: 0.42, x: 0.08, y: -0.2, scale: 0.62, seen: 1 },
    { at: 0.7, x: 0.2, y: -0.27, scale: 0.32, seen: 1 },
    { at: 0.86, x: 0.26, y: -0.29, scale: 0.18, seen: 1 },
    { at: 1, x: 0.3, y: -0.3, scale: 0.1, seen: 0 },
  ],
  behindAt: 0.42,
  /** how long it takes, and how long one beat of its wings is (wings up, then down) */
  ms: 2600,
  beatMs: 240,
} as const;

/**
 * A puffy cloud of a few round lobes on a flat foot. Each puff is its own
 * round, so where two overlap there is no seam.
 */
function cloud(dr: Drawing, x: number, y: number, s: number, hex: string): void {
  const lobes: ReadonlyArray<readonly [number, number, number]> = [
    [-9, 1, 5.2],
    [-3, -3, 6.6],
    [4, -4.6, 7.4],
    [10.4, 0, 5.4],
  ];
  for (const [cx, cy, r] of lobes) dr.add(`<circle cx="${n(x + cx * s)}" cy="${n(y + cy * s)}" r="${n(r * s)}" fill="${hex}"/>`);
  dr.add(`<path d="${rr(x - 13 * s, y - 1 * s, 28.4 * s, 6.6 * s, 3.3 * s)}" fill="${hex}"/>`);
}

/** A flower in the grass: five round petals and a heart. */
function flower(dr: Drawing, x: number, y: number, r: number, petal: string, heart: string): void {
  for (let k = 0; k < 5; k++) {
    const a = (k * 2 * Math.PI) / 5 - Math.PI / 2;
    dr.add(`<circle cx="${n(x + Math.cos(a) * r)}" cy="${n(y + Math.sin(a) * r)}" r="${n(r * 0.78)}" fill="${petal}"/>`);
  }
  dr.add(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r * 0.55)}" fill="${heart}"/>`);
}

/** The sky, its light toward the horizon, and the sun or the moon with the stars. */
function skyPart(dr: Drawing, h: Hour): void {
  const air = dr.id('a');
  dr.def(linearAt(air, [[0, h.sky[0]], [1, h.sky[1]]], 0, 6, 0, 66));
  dr.add(`<rect x="0" y="0" width="120" height="120" fill="url(#${air})"/>`);
  const [ox, oy, or, colour, glow] = h.orb;
  const halo = dr.id('h');
  dr.def(radialAt(halo, [[0, glow, 0.7], [0.45, glow, 0.25], [1, glow, 0]], ox, oy, or * 4));
  dr.add(`<circle cx="${n(ox)}" cy="${n(oy)}" r="${n(or * 4)}" fill="url(#${halo})"/>`);
  if (!h.night) dr.add(`<circle cx="${n(ox)}" cy="${n(oy)}" r="${n(or)}" fill="${colour}"/>`);
  if (h.night) {
    // a young moon's horn: the round of it on one side and a shallower round back, which is its shadow's edge
    dr.add(`<path d="M${n(ox)} ${n(oy - or)}A${n(or)} ${n(or)} 0 1 0 ${n(ox)} ${n(oy + or)}A${n(or * 1.35)} ${n(or * 1.35)} 0 0 1 ${n(ox)} ${n(oy - or)}Z" fill="${colour}" transform="rotate(-24 ${n(ox)} ${n(oy)})"/>`);
    const rand = seeded('letter-stars');
    let stars = '';
    for (let i = 0; i < 26; i++) stars += `<circle cx="${n(14 + rand() * 92)}" cy="${n(12 + rand() * 40)}" r="${n(0.3 + rand() * 0.4)}" fill="#ffffff" opacity="${i % 3 === 0 ? '0.95' : '0.6'}"/>`;
    dr.add(stars);
  }
}

/** The clouds, and two birds far off between them. */
function cloudsPart(dr: Drawing, h: Hour): void {
  cloud(dr, 40, 30, 0.6, h.cloud);
  cloud(dr, 76, 40, 0.86, h.cloud);
  cloud(dr, 104, 26, 0.5, h.cloud);
  const far = h.night ? mix(h.cloud, '#ffffff', 0.3) : mix(h.mountains[1], '#2a3050', 0.5);
  dr.add(`<path d="M55 24.4Q56.4 23 57.6 24.2Q58.8 23 60.2 24.4M61.6 21.2Q62.7 20.2 63.6 21.1Q64.5 20.2 65.6 21.2" fill="none" stroke="${far}" stroke-width="0.7" stroke-linecap="round" stroke-linejoin="round"/>`);
}

/** The far country: mountains, blue with the distance and snow on their tops, and the green hills before them with their round trees. */
function farPart(dr: Drawing, h: Hour): void {
  dr.add(`<path d="M-6 62L4 52L14 55L26 44L36 51L44 47L56 38L68 49L78 45L90 52L100 42L112 50L126 46V64H-6Z" fill="${h.mountains[0]}"/>`);
  // the snow on the two highest
  dr.add(`<path d="M51.2 42.4L56 38L60.6 42.6L58.2 41.6L56.2 43.2L54 41.4ZM96.4 45.2L100 42L103.6 44.6L101.6 44.2L100 45.6L98.2 44.4Z" fill="${h.snow}"/>`);
  dr.add(`<path d="M-6 64L8 56L20 59L30 53L44 58L58 52L70 57L84 51L98 57L112 53L126 57V68H-6Z" fill="${h.mountains[1]}"/>`);
  dr.add(`<path d="M-6 66C10 60 26 59 42 62C58 65 72 60 88 58C102 56.6 114 59 126 62V80H-6Z" fill="${h.hills[0]}"/>`);
  dr.add(`<path d="M-6 72C12 67 30 66 50 68.6C70 71 90 66 106 65C114 64.6 120 65.6 126 67V84H-6Z" fill="${h.hills[1]}"/>`);
  // round trees along the hills, small with the distance
  const trees: ReadonlyArray<readonly [number, number, number]> = [[18, 61.4, 1.9], [23, 61.8, 1.5], [62, 63.8, 1.7], [84, 59.6, 2.1], [89, 59.4, 1.6], [104, 66.4, 2.2]];
  for (const [x, y, r] of trees) {
    dr.add(`<path d="M${n(x - 0.3)} ${n(y)}h0.6v${n(r * 1.2)}h-0.6Z" fill="${h.trees[1]}"/>`);
    dr.add(`<circle cx="${n(x)}" cy="${n(y - r * 0.2)}" r="${n(r)}" fill="${h.trees[0]}"/>`);
  }
}

/** The meadow just outside, its grass and its flowers. */
function nearPart(dr: Drawing, h: Hour): void {
  dr.add(`<path d="M-6 76C16 72 36 71.4 56 73.4C76 75.4 96 71 126 70.6V126H-6Z" fill="${h.meadow[0]}"/>`);
  dr.add(`<path d="M-6 80C20 77 44 77.6 66 79.4C88 81 106 78 126 77V126H-6Z" fill="${h.meadow[1]}"/>`);
  const tufts: ReadonlyArray<readonly [number, number]> = [[28, 76], [36, 81], [47, 77], [58, 80.6], [70, 76.6], [82, 80], [90, 77], [33, 87], [64, 86], [86, 88]];
  const grass = tufts.map(([gx, gy]) => `M${gx} ${gy}L${n(gx - 0.5)} ${n(gy - 2.2)}M${n(gx + 1.6)} ${gy}L${n(gx + 1.3)} ${n(gy - 1.8)}`).join('');
  dr.add(`<path d="${grass}" fill="none" stroke="${h.grass}" stroke-width="1" stroke-linecap="round"/>`);
  const [yellow, pink, blue] = h.flowers;
  flower(dr, 40, 79, 1.5, yellow, h.heart);
  flower(dr, 76, 82, 1.9, yellow, h.heart);
  flower(dr, 62, 77.4, 1.2, pink, tint(pink, 0.3));
  flower(dr, 30, 83, 1.1, blue, tint(blue, 0.35));
  flower(dr, 88, 78.4, 1.1, pink, tint(pink, 0.3));
  flower(dr, 52, 84.6, 1.3, blue, tint(blue, 0.35));
}

/** A clay pot of flowers on the sill: its body, its rim, the shade it stands in, and what grows in it. */
function pot(dr: Drawing, h: Hour, x: number, y: number): void {
  const clay: Tones = { light: '#eea17a', base: '#d9825b', shade: '#b8663f' };
  dr.add(`<ellipse cx="${n(x)}" cy="${n(y + 0.4)}" rx="7.4" ry="1.4" fill="#1d1838" opacity="0.16"/>`);
  const stem = h.night ? '#2f5a3f' : '#4f8f3e';
  const leafy = h.night ? '#3c6b4a' : '#6fb04f';
  dr.add(`<path d="M${n(x)} ${n(y - 8)}Q${n(x - 0.6)} ${n(y - 13)} ${n(x + 0.4)} ${n(y - 17)}" fill="none" stroke="${stem}" stroke-width="0.8" stroke-linecap="round"/>`);
  const leaves: ReadonlyArray<readonly [Pt, Pt, number]> = [
    [[x, y - 9], [-0.86, -0.5], 5.2],
    [[x, y - 9.4], [0.86, -0.5], 5],
    [[x - 0.2, y - 12.6], [-0.8, -0.6], 4.2],
    [[x + 0.2, y - 13], [0.8, -0.6], 4],
  ];
  for (const [base, u, len] of leaves) dr.add(`<path d="${leaf(base, u, len, len * 0.42)}" fill="${leafy}"/>`);
  flower(dr, x + 0.4, y - 17.6, 1.5, h.flowers[1], h.flowers[0]);
  flower(dr, x - 3.6, y - 14.6, 1, h.flowers[0], h.heart);
  form(dr, `M${n(x - 5.6)} ${n(y - 7)}L${n(x + 5.6)} ${n(y - 7)}L${n(x + 4.2)} ${n(y)}L${n(x - 4.2)} ${n(y)}Z`, clay, 0.8, 0.6);
  dr.add(`<path d="${rr(x - 6.6, y - 8.6, 13.2, 2.6, 1)}" fill="${clay.light}"/>`);
}

/** The room round the window: its wall, the wall's thickness, the frame set back in it, the sill and its pot. */
function roomPart(dr: Drawing, h: Hour): void {
  const { x0, y0, x1, y1 } = REVEAL;
  // the wall, lighter by the window where the light from it falls; a hole where the window is
  const wall = dr.id('w');
  dr.def(radialAt(wall, [[0, h.wall[0]], [1, h.wall[1]]], 60, 50, 80));
  dr.add(`<path d="M0 0H120V120H0ZM${x0} ${y0}V${y1}H${x1}V${y0}Z" fill="url(#${wall})" fill-rule="evenodd"/>`);
  // the wall's thickness: the soffit over the window in shade, its two sides, one lit and one not
  dr.add(`<path d="M${x0} ${y0}H${x1}L${FRAME.x1} ${FRAME.y0}H${FRAME.x0}Z" fill="${h.soffit}"/>`);
  dr.add(`<path d="M${x0} ${y0}L${FRAME.x0} ${FRAME.y0}V${FRAME.y1}L${x0} ${y1}Z" fill="${h.jamb[0]}"/>`);
  dr.add(`<path d="M${x1} ${y0}L${FRAME.x1} ${FRAME.y0}V${FRAME.y1}L${x1} ${y1}Z" fill="${h.jamb[1]}"/>`);
  // the frame, white, with the inside of its own thickness at the top and the left
  const o = OPENING;
  dr.add(`<path d="M${FRAME.x0} ${FRAME.y0}H${FRAME.x1}V${FRAME.y1}H${FRAME.x0}ZM${o.x0} ${o.y0}V${o.y1}H${o.x1}V${o.y0}Z" fill="${h.frame[0]}" fill-rule="evenodd"/>`);
  dr.add(`<path d="M${o.x0} ${o.y0}H${o.x1}L${n(o.x1 - 1.4)} ${n(o.y0 + 1.6)}H${n(o.x0 + 1.4)}V${o.y1}H${o.x0}Z" fill="${h.frame[1]}"/>`);
  // the sill reaching out into the room: its top, lit, then the front of it, and the shade it throws on the wall below
  const s = SILL_FRONT;
  dr.add(`<path d="M${FRAME.x0} ${FRAME.y1}H${FRAME.x1}L${s.x1} ${s.y}H${s.x0}Z" fill="${h.sill[0]}"/>`);
  const under = dr.id('u');
  dr.def(linearAt(under, [[0, '#1d1838', 0.16], [1, '#1d1838', 0]], 0, s.y + s.depth, 0, s.y + s.depth + 7));
  dr.add(`<path d="M${s.x0 + 1} ${n(s.y + s.depth)}H${s.x1 - 1}C${s.x1 - 4} ${n(s.y + s.depth + 4)} ${s.x1 - 8} ${n(s.y + s.depth + 7)} ${s.x1 - 14} ${n(s.y + s.depth + 7)}H${s.x0 + 14}C${s.x0 + 8} ${n(s.y + s.depth + 7)} ${s.x0 + 4} ${n(s.y + s.depth + 4)} ${s.x0 + 1} ${n(s.y + s.depth)}Z" fill="url(#${under})"/>`);
  dr.add(`<path d="${rr(s.x0, s.y, s.x1 - s.x0, s.depth, 1.6)}" fill="${h.sill[1]}"/>`);
  pot(dr, h, 90, 94.6);
}

/**
 * One casement swung open into the room, on its hinge at the frame: the
 * nearer edge taller than the hinge, as it is nearer; its frame, its four
 * panes catching the light, and the thickness of its free edge.
 */
function casementPart(dr: Drawing, h: Hour, side: 'left' | 'right'): void {
  const hinge = side === 'left' ? FRAME.x0 + 2 : FRAME.x1 - 2;
  const free = side === 'left' ? 9.6 : 110.4;
  const [ht, hb, ft, fb] = [FRAME.y0 + 1, FRAME.y1 - 0.4, 12, 94.6];
  // a point on the casement: `u` across from the hinge to the free edge, `v` down from its top
  const at = (u: number, v: number): Pt => {
    const top = ht + (ft - ht) * u;
    const bottom = hb + (fb - hb) * u;
    return [hinge + (free - hinge) * u, top + (bottom - top) * v];
  };
  const quad = (u0: number, v0: number, u1: number, v1: number): string => {
    const [a, b, c, d] = [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)];
    return `M${n(a[0])} ${n(a[1])}L${n(b[0])} ${n(b[1])}L${n(c[0])} ${n(c[1])}L${n(d[0])} ${n(d[1])}Z`;
  };
  // the edge of the open casement, seen as it stands out toward us
  const edge = side === 'left' ? -1 : 1;
  dr.add(`<path d="M${n(free)} ${ft}L${n(free + edge * 1.2)} ${n(ft + 0.6)}L${n(free + edge * 1.2)} ${n(fb - 0.6)}L${n(free)} ${fb}Z" fill="${h.frame[1]}"/>`);
  dr.add(`<path d="${quad(0, 0, 1, 1)}" fill="${h.frame[0]}"/>`);
  const glass = mix(h.glass, h.wall[1], 0.25);
  const panes = [quad(0.12, 0.04, 0.48, 0.48), quad(0.56, 0.04, 0.9, 0.48), quad(0.12, 0.52, 0.48, 0.96), quad(0.56, 0.52, 0.9, 0.96)];
  for (const pane of panes) dr.add(`<path d="${pane}" fill="${glass}"/>`);
  // the light caught in the glass: a pale band across each pane, kept to the panes
  dr.add(`<g clip-path="url(#${dr.clip(panes.join(''))})">`);
  const [g0, g1] = [at(0.1, 0.18), at(1, 0.02)];
  const [g2, g3] = [at(1, 0.16), at(0.1, 0.32)];
  dr.add(`<path d="M${n(g0[0])} ${n(g0[1])}L${n(g1[0])} ${n(g1[1])}L${n(g2[0])} ${n(g2[1])}L${n(g3[0])} ${n(g3[1])}Z" fill="#ffffff" opacity="${h.night ? '0.16' : '0.5'}"/>`);
  const [g4, g5] = [at(0.1, 0.62), at(1, 0.46)];
  const [g6, g7] = [at(1, 0.52), at(0.1, 0.68)];
  dr.add(`<path d="M${n(g4[0])} ${n(g4[1])}L${n(g5[0])} ${n(g5[1])}L${n(g6[0])} ${n(g6[1])}L${n(g7[0])} ${n(g7[1])}Z" fill="#ffffff" opacity="${h.night ? '0.1' : '0.3'}"/>`);
  dr.add('</g>');
}

/** The light from the window lying on the sill, and its glow in the room. */
function lightPart(dr: Drawing, h: Hour): void {
  const [colour, strength] = h.light;
  const glow = dr.id('g');
  dr.def(linearAt(glow, [[0, colour, strength], [1, colour, strength * 0.25]], 0, FRAME.y1, 0, SILL_FRONT.y));
  dr.add(`<path d="M36 ${FRAME.y1}H80L86 ${SILL_FRONT.y}H30Z" fill="url(#${glow})"/>`);
  const air = dr.id('r');
  dr.def(radialAt(air, [[0, colour, strength * 0.35], [1, colour, 0]], 60, 50, 46));
  dr.add(`<rect x="10" y="8" width="100" height="92" fill="url(#${air})"/>`);
}

export interface LetterWindowOptions {
  /** the hour's sky through the window; the day's by default */
  sky?: TreeSky;
  /** one layer of it, or the whole window still */
  part?: LetterWindowPart | 'whole';
  size?: number;
  /** its text label; the apps usually say what is happening beside it and hide the picture from screen readers */
  title?: string;
  idPrefix?: string;
}

/** Your window at the hour, or one of its layers (`part`), each on the same square. */
export function letterWindowSvg(opts: LetterWindowOptions = {}): string {
  const size = checkSize(opts.size, 120);
  const skyName = opts.sky ?? 'day';
  const h = HOURS[skyName];
  if (!h) throw new RangeError(`art: no sky called ${String(skyName)}`);
  const part = opts.part ?? 'whole';
  if (part !== 'whole' && !LETTER_WINDOW_PARTS.includes(part)) throw new RangeError(`art: no window part called ${String(part)}`);
  const dr = new Drawing(prefixFor(opts.idPrefix, 'letter-window', skyName, part));
  const draw: Record<LetterWindowPart, () => void> = {
    sky: () => skyPart(dr, h),
    clouds: () => cloudsPart(dr, h),
    far: () => farPart(dr, h),
    near: () => nearPart(dr, h),
    room: () => roomPart(dr, h),
    left: () => casementPart(dr, h, 'left'),
    right: () => casementPart(dr, h, 'right'),
    light: () => lightPart(dr, h),
  };
  if (part === 'whole') for (const p of LETTER_WINDOW_PARTS) draw[p]();
  else draw[part]();
  return dr.svg(size, opts.title ?? 'A window');
}

export interface LetterBirdOptions {
  /** the pigeon's number (`letterBirdOf`): its colour */
  bird: number;
  pose?: PigeonPose;
  /** a letter in its beak */
  letter?: boolean;
  /** facing left rather than right */
  facingLeft?: boolean;
  /** framed as a picture of the pigeon itself, its head and body filling the square, rather than standing where the sill is */
  portrait?: boolean;
  size?: number;
  title?: string;
  idPrefix?: string;
}

/** How a pigeon is framed for its portrait: where its feet go on the square, and how big it is drawn. */
const PORTRAIT = { x: 52, y: 86, scale: 2.2 } as const;

/** A member's pigeon, on its own transparent square: standing, blinking, waving, asleep, or flying with its wings up or down. */
export function letterBirdSvg(opts: LetterBirdOptions): string {
  const size = checkSize(opts.size, 120);
  const hex = LETTER_BIRDS[opts.bird];
  if (!hex) throw new RangeError(`art: no bird ${String(opts.bird)}`);
  const pose = opts.pose ?? 'perched';
  const flip = opts.facingLeft ? -1 : 1;
  const dr = new Drawing(prefixFor(opts.idPrefix, 'letter-bird', opts.bird, pose, opts.letter ? 'letter' : '', flip, opts.portrait ? 'portrait' : ''));
  const { x, y, scale } = opts.portrait ? PORTRAIT : LETTER_BIRD_FEET;
  // a pigeon facing left stands on the same feet, mirrored about them: its square fits it either way round
  dr.add(`<g transform="translate(${n(x)} ${n(y)}) scale(${n(scale * flip)} ${n(scale)})">`);
  pigeon(dr, hex, pose, opts.letter === true);
  dr.add('</g>');
  return dr.svg(size, opts.title ?? 'A pigeon');
}

export interface LetterEnvelopeOptions {
  size?: number;
  title?: string;
  idPrefix?: string;
}

const PAPER: Tones = { light: '#fffaf1', base: '#f6ead6', shade: '#cdb898' };
const SEAL = '#d8493b';

/** A letter in its envelope, sealed with red wax: what is written, or arrives. */
export function letterEnvelopeSvg(opts: LetterEnvelopeOptions = {}): string {
  const size = checkSize(opts.size, 120);
  const dr = new Drawing(prefixFor(opts.idPrefix, 'letter-envelope'));
  form(dr, rr(14, 30, 92, 62, 8), PAPER, 4, 2);
  // the flaps: the bottom two meeting under the top one
  dr.add(`<path d="M16 88L52 60M104 88L68 60" fill="none" stroke="${PAPER.shade}" stroke-width="1.6" stroke-linecap="round"/>`);
  form(dr, 'M16 34C16 31.8 17.6 30.6 19.6 31.6L60 63L100.4 31.6C102.4 30.6 104 31.8 104 34L66 66C62.6 68.8 57.4 68.8 54 66Z', PAPER, 1.6, 1);
  form(dr, ring(60, 64, 9), { light: tint(SEAL, 0.32), base: SEAL, shade: tint(SEAL, -0.32) }, 2, 1.4);
  dr.add(`<circle cx="60" cy="64" r="4.6" fill="none" stroke="${tint(SEAL, -0.2)}" stroke-width="1.2"/>`);
  return dr.svg(size, opts.title ?? 'A letter');
}
