/**
 * The sky's gifts (gift-art.ts): the full moon over the mountains, the galaxy, a shooting star, a rainbow over the hills,
 * the Newroz fire and the sun. Night skies are cut out as a patch of their own so they hold on a light page.
 */
import { type Drawing, type Pt } from './svg.js';
import { band, blade, brush, ellipse, lerp, outline, paint, polygon, roundish, shift, side, streaks, touch, tremble, turn, within, type Rnd, type Tone } from './gift-paint.js';

// ──────────────────────────────────────────────────────────────────── heyv

const NIGHT: Tone = { base: '#283365', light: '#34427c', shade: '#1a2250' };
const MOON: Tone = { base: '#f2e5c1', light: '#fdf7e4', shade: '#d6c497' };
const CLOUD: Tone = { base: '#8c91c3', light: '#b8bce0', shade: '#6e73a8' };

export function heyv(dr: Drawing, rnd: Rnd): void {
  const sky = roundish(60, 60, 54, 53, rnd, { wobble: 0.035, tremor: 0.7, count: 44 });
  paint(dr, outline(sky), NIGHT.base);
  within(dr, outline(sky), () => {
    paint(dr, streaks(rnd, [6, 6, 114, 96], 34, -8, 16, 1.6), NIGHT.light, 0.4);
    paint(dr, outline(roundish(60, 50, 38, 37, rnd, { wobble: 0.04, tremor: 0.6 })), NIGHT.light);
    let stars = '';
    for (const [x, y, r] of [[22, 34, 1.1], [92, 22, 0.9], [100, 46, 1.2], [30, 18, 0.7], [16, 56, 0.8], [84, 12, 0.6], [104, 64, 0.7]] as const) stars += outline(roundish(x, y, r, r, rnd, { count: 7, tremor: 0.15 }));
    paint(dr, stars, '#f5e7bd');
    // the mountains, one ridge with snow on its peaks, and a village's lamps along its foot
    const ridge = outline(tremble([[0, 96], [12, 90], [24, 84.6], [33, 80], [40, 82.6], [50, 87.6], [60, 86], [72, 80.4], [82, 75.6], [90, 79], [100, 84], [112, 88], [120, 90], [120, 120], [0, 120]], rnd, 0.5));
    paint(dr, ridge, NIGHT.shade);
    within(dr, ridge, () => {
      paint(dr, outline(tremble([[26, 84.6], [33, 78.6], [40.4, 82], [37.6, 84.2], [35, 82.8], [32.4, 85.6], [29.6, 84]], rnd, 0.3)), '#7f88bb');
      paint(dr, outline(tremble([[74.6, 80.6], [82, 74.2], [91, 79.2], [88, 80.6], [85.4, 79.4], [82.6, 82], [79.6, 80.2], [77, 81.8]], rnd, 0.3)), '#7f88bb');
    });
    let lamps = '';
    for (const [x, y] of [[46, 96], [50, 97.4], [72, 94.6], [27, 100]] as const) lamps += ellipse(x, y, 0.75, 0.7);
    paint(dr, lamps, '#f4bf55');
  });
  side(dr, sky, 1.3, 1.3, NIGHT.light);
  // the moon: cream, a turn of shade at its lower edge and a paler one at its upper, its seas and craters soft blots
  const moon = roundish(60, 49, 27.5, 27.5, rnd, { wobble: 0.015, tremor: 0.3, count: 40 });
  paint(dr, outline(moon), MOON.base);
  within(dr, outline(moon), () => {
    side(dr, moon, 2.6, 2.6, MOON.light, { grow: 0.99 });
    let seas = '';
    for (const [x, y, rx, ry, rot] of [[51, 40, 8, 5.6, 20], [64, 37.6, 5.6, 4, -10], [63, 53.6, 9.6, 6, -18], [46, 54, 4.4, 3.4, 30], [72, 45, 4, 6, 10]] as const) seas += outline(roundish(x, y, rx, ry, rnd, { wobble: 0.1, rot, count: 14 }));
    paint(dr, seas, MOON.shade, 0.75);
    let stipple = '';
    for (let i = 0; i < 40; i++) stipple += touch(34 + rnd() * 52, 23 + rnd() * 52, 1.2 + rnd() * 1.4, 0.4 + rnd() * 0.3, rnd() * 180);
    paint(dr, stipple, MOON.shade, 0.45);
    for (const [x, y, r] of [[56.6, 64, 2.2], [42.4, 44.4, 1.6], [70, 61, 1.5], [60, 30, 1.3], [76, 52.6, 1.1]] as const) {
      const crater = roundish(x, y, r, r * 0.9, rnd, { count: 10, tremor: 0.15 });
      paint(dr, outline(crater), MOON.shade);
      side(dr, crater, -0.6, -0.6, MOON.light);
    }
    side(dr, moon, -3.2, -2.6, MOON.shade, { grow: 0.99 });
  });
  // clouds drifting across its foot in long strokes, lit along their tops
  const wisps: Array<[Pt[], number]> = [
    [[[15, 66.4], [32, 63.6], [52, 64.4], [73, 66.8]], 5.4],
    [[[25, 71], [44, 69.4], [65, 70.6]], 3.6],
    [[[57, 78.6], [74, 75.8], [92, 75.4], [107, 77.6]], 4.8],
    [[[66, 82], [82, 80.6], [99, 81.4]], 3],
  ];
  for (const [pts, w] of wisps) paint(dr, brush(pts, w, rnd, { start: 0.25, end: 0.15, peak: 0.45, count: 22 }), CLOUD.base);
  for (const [pts, w] of wisps) paint(dr, brush(shift(pts, 0.6, -w * 0.26), w * 0.36, rnd, { start: 0.2, end: 0.1, peak: 0.4, count: 18 }), CLOUD.light);
  for (const [pts, w] of wisps.slice(0, 1)) paint(dr, brush(shift(pts, -0.4, w * 0.3), w * 0.3, rnd, { start: 0.2, end: 0.1, peak: 0.55, count: 18 }), CLOUD.shade);
}

// ─────────────────────────────────────────────────────────────── rêya kadizê

const GALAXY_NIGHT: Tone = { base: '#201a45', light: '#2e2763', shade: '#17132f' };

export function kadiz(dr: Drawing, rnd: Rnd): void {
  const sky = roundish(60, 60, 55, 54, rnd, { wobble: 0.035, tremor: 0.7, count: 44 });
  paint(dr, outline(sky), GALAXY_NIGHT.base);
  within(dr, outline(sky), () => paint(dr, streaks(rnd, [6, 6, 114, 114], 36, -24, 16, 1.6), GALAXY_NIGHT.light, 0.45));
  side(dr, sky, 1.3, 1.3, GALAXY_NIGHT.light);
  const TILT = -24;
  const SQUASH = 0.56;
  const place = (x: number, y: number): Pt => {
    const a = (TILT * Math.PI) / 180;
    const yy = y * SQUASH;
    return [60 + x * Math.cos(a) - yy * Math.sin(a), 60 + x * Math.sin(a) + yy * Math.cos(a)];
  };
  // the colours out from the heart: cream, gold, peach, rose, lilac, blue
  const COLOURS = ['#fff2d4', '#f5cd6e', '#f1a985', '#d98aa8', '#a89be2', '#86aee8'];
  const laid: string[] = COLOURS.map(() => '');
  const lay = (band: number, d: string): void => {
    const i = Math.max(0, Math.min(COLOURS.length - 1, band));
    laid[i] += d;
  };
  within(dr, outline(sky), () => {
    paint(dr, outline(turn(roundish(60, 60, 49, 27, rnd, { wobble: 0.08, tremor: 0.8 }), 60, 60, TILT)), GALAXY_NIGHT.light);
    // the dust between the arms, dim
    let dust = '';
    for (let i = 0; i < 80; i++) {
      const r = 6 + Math.sqrt(rnd()) * 42;
      const a = rnd() * Math.PI * 2;
      const [x, y] = place(r * Math.cos(a), r * Math.sin(a));
      dust += touch(x, y, 1.8 + rnd() * 1.6, 0.6 + rnd() * 0.4, rnd() * 180);
    }
    paint(dr, dust, '#5a4f9e', 0.8);
    // stars far off
    let far = '';
    for (let i = 0; i < 34; i++) {
      const x = 8 + rnd() * 104;
      const y = 8 + rnd() * 104;
      const r = 0.3 + rnd() * rnd() * 0.9;
      far += ellipse(x, y, r, r);
    }
    paint(dr, far, '#efe6d0');
  });
  // the heart: gold touches laid thick over a small gold blot
  let glow = outline(turn(roundish(60, 60, 6.4, 4.2, rnd, { wobble: 0.14, count: 14, tremor: 0.6 }), 60, 60, TILT));
  for (let i = 0; i < 34; i++) {
    const r = Math.sqrt(rnd()) * 8;
    const a = rnd() * Math.PI * 2;
    const [x, y] = place(r * Math.cos(a), r * Math.sin(a));
    glow += touch(x, y, 2.6 + rnd() * 1.6, 1.1 + rnd() * 0.4, TILT + (rnd() - 0.5) * 70);
  }
  paint(dr, glow, COLOURS[1]!);
  // two arms wound once and a half round the heart, laid on in touches of the brush along the way they turn
  for (let arm = 0; arm < 2; arm++) {
    const COUNT = 190;
    for (let s = 0; s < COUNT; s++) {
      const f = (s + rnd()) / COUNT;
      const theta = f * Math.PI * 1.55;
      const r = 6 + 40 * Math.pow(f, 0.9);
      const phi = theta + arm * Math.PI + 0.4;
      const rr = r + (rnd() - 0.5) * (3 + 9 * f);
      const swing = (rnd() - 0.5) * 0.14;
      const [x, y] = place(rr * Math.cos(phi + swing), rr * Math.sin(phi + swing));
      const [x2, y2] = place((rr + 1.4) * Math.cos(phi + swing + 0.12), (rr + 1.4) * Math.sin(phi + swing + 0.12));
      const deg = (Math.atan2(y2 - y, x2 - x) * 180) / Math.PI;
      const len = 3.8 - 1.6 * f + rnd() * 0.9;
      lay(1 + Math.floor((f + (rnd() - 0.5) * 0.2) * (COLOURS.length - 1)), touch(x, y, len, len * 0.42, deg));
    }
  }
  for (let i = COLOURS.length - 1; i >= 1; i--) paint(dr, laid[i]!, COLOURS[i]!);
  let heart = '';
  for (let i = 0; i < 20; i++) {
    const r = Math.sqrt(rnd()) * 4.6;
    const a = rnd() * Math.PI * 2;
    const [x, y] = place(r * Math.cos(a), r * Math.sin(a));
    heart += touch(x, y, 2.2 + rnd() * 1.4, 1, TILT + (rnd() - 0.5) * 60);
  }
  paint(dr, outline(turn(roundish(60, 60, 3.4, 2.2, rnd, { wobble: 0.14, count: 10, tremor: 0.4 }), 60, 60, TILT)) + heart, COLOURS[0]!);
  // a few near stars, brighter
  let near = '';
  for (const [x, y, r] of [[24, 30, 1.2], [94, 86, 1.1], [98, 30, 0.9], [22, 88, 0.8]] as const) near += outline(roundish(x, y, r, r, rnd, { count: 7, tremor: 0.15 }));
  paint(dr, near, '#fff4da');
}

/** A night sky cut out as its own patch: brushed in, its cut edge catching the light, stars far off in it. */
function nightPatch(dr: Drawing, rnd: Rnd, tone: Tone, stars: number): Pt[] {
  const sky = roundish(60, 60, 54, 53, rnd, { wobble: 0.035, tremor: 0.7, count: 44 });
  paint(dr, outline(sky), tone.base);
  within(dr, outline(sky), () => {
    paint(dr, streaks(rnd, [6, 6, 114, 110], 30, -12, 16, 1.6), tone.light, 0.4);
    let far = '';
    for (let i = 0; i < stars; i++) {
      const r = 0.3 + rnd() * rnd() * 0.9;
      far += ellipse(8 + rnd() * 104, 8 + rnd() * 80, r, r);
    }
    paint(dr, far, '#efe6d0');
  });
  side(dr, sky, 1.3, 1.3, tone.light);
  return sky;
}

/** A tongue of flame from `base` to `tip`, bent by `lean`: full at its root, licking to a point. */
function tongue(base: Pt, tip: Pt, width: number, lean: number, rnd: Rnd): string {
  const mid: Pt = [(base[0] + tip[0]) / 2 + lean, (base[1] + tip[1]) / 2];
  const turn: Pt = [tip[0] - lean * 0.6, tip[1] + (base[1] - tip[1]) * 0.2];
  return brush([base, mid, turn, tip], width, rnd, { start: 0.7, end: 0.02, peak: 0.18, count: 12 });
}

// ──────────────────────────────────────────────────────────────── stêrka xişok

const DUSK_SKY: Tone = { base: '#252b5c', light: '#333b74', shade: '#171c44' };

export function sterk(dr: Drawing, rnd: Rnd): void {
  const sky = nightPatch(dr, rnd, DUSK_SKY, 22);
  within(dr, outline(sky), () => {
    // the hills under it, a poplar and one window still lit
    paint(dr, outline(tremble([[0, 92], [22, 82], [44, 86], [70, 78], [96, 84], [120, 80], [120, 120], [0, 120]], rnd, 0.5)), '#1d2350');
    paint(dr, outline(tremble([[0, 102], [30, 92], [58, 97], [86, 90], [120, 96], [120, 120], [0, 120]], rnd, 0.5)), DUSK_SKY.shade);
    paint(dr, outline(tremble(blade([84, 91], [84, 76], 4, { at: 0.4, point: 0.6, count: 6 }), rnd, 0.15)), '#121638');
    paint(dr, polygon(tremble([[66, 96], [74, 95.4], [74, 90], [66, 90.6]], rnd, 0.15)), '#121638');
    paint(dr, polygon([[68.4, 93.6], [70.4, 93.4], [70.4, 91.6], [68.4, 91.8]]), '#f4bf55');
    // the star's tail, laid on in long strokes that thin away from it: gold nearest, then peach, then lilac
    const head: Pt = [40, 68];
    const tails: Array<[Pt, number, string, number]> = [
      [[104, 18], 7, '#a99be0', 0.7],
      [[108, 26], 5, '#a99be0', 0.6],
      [[98, 16], 4, '#f1a985', 0.8],
      [[102, 24], 6.4, '#f1a985', 0.9],
      [[96, 22], 4.4, '#f5cd6e', 1],
      [[92, 30], 3, '#f5cd6e', 0.9],
    ];
    for (const [end, w, colour, opacity] of tails) {
      const mid = lerp(head, end, 0.5);
      paint(dr, brush([head, [mid[0] + (rnd() - 0.5) * 3, mid[1] + (rnd() - 0.5) * 3], end], w, rnd, { start: 1, end: 0.02, peak: 0.03, count: 14 }), colour, opacity);
    }
    let dust = '';
    for (let i = 0; i < 16; i++) {
      const t = 0.15 + rnd() * 0.8;
      const p = lerp(head, [102, 22], t);
      dust += touch(p[0] + (rnd() - 0.5) * 10 * t, p[1] + (rnd() - 0.5) * 10 * t, 1.6 + rnd(), 0.6, -38);
    }
    paint(dr, dust, '#fff1cc', 0.9);
  });
  // its head: a white-gold blot with a short cross of light through it
  paint(dr, outline(roundish(40, 68, 7.4, 7, rnd, { count: 12, wobble: 0.1 })), '#f5cd6e', 0.9);
  paint(dr, brush([[30, 68.6], [40, 68], [50, 67.4]], 1.2, rnd, { start: 0.1, end: 0.1, peak: 0.5 }) + brush([[40.4, 59], [40, 68], [39.6, 77]], 1.2, rnd, { start: 0.1, end: 0.1, peak: 0.5 }), '#fff6dc');
  paint(dr, outline(roundish(40, 68, 4, 3.8, rnd, { count: 10, wobble: 0.08 })), '#fff8e6');
}

// ──────────────────────────────────────────────────────────────────── keskesor

const RAINBOW = ['#d9564a', '#e98d47', '#f0c64e', '#8cbf6a', '#5b9bd0', '#8a6cc0'];

export function keskesor(dr: Drawing, rnd: Rnd): void {
  // the sky after rain, cut out as its own patch, the last of the rain still falling from the cloud at its left
  const sky = roundish(60, 58, 54, 50, rnd, { wobble: 0.035, tremor: 0.7, count: 40 });
  paint(dr, outline(sky), '#d9e5ea');
  within(dr, outline(sky), () => {
    paint(dr, streaks(rnd, [6, 8, 114, 90], 24, -10, 16, 1.6), '#eef3f2', 0.6);
    let rain = '';
    for (let i = 0; i < 12; i++) {
      const x = 8 + rnd() * 22;
      const y = 40 + rnd() * 30;
      rain += touch(x, y, 5 + rnd() * 3, 0.4, 104);
    }
    paint(dr, rain, '#9fb4c4', 0.8);
  });
  side(dr, sky, 1.3, 1.3, '#eef3f2');
  // the bow laid on band by band with a broad brush, each band a little uneven
  for (let i = 0; i < RAINBOW.length; i++) {
    const r = 55 - i * 4.2;
    const pts: Pt[] = [];
    for (let k = 0; k <= 12; k++) {
      const a = Math.PI + (k / 12) * Math.PI;
      pts.push([60 + Math.cos(a) * r + (rnd() - 0.5) * 0.6, 86 + Math.sin(a) * r * 0.98 + (rnd() - 0.5) * 0.6]);
    }
    paint(dr, brush(pts, 4.6, rnd, { start: 0.9, end: 0.9, peak: 0.5, count: 28 }), RAINBOW[i]!);
  }
  // the clouds it stands in
  const cloud = (cx: number, cy: number, s: number): void => {
    let puffs = '';
    for (const [dx, dy, r] of [[-9, 2, 6], [-2, -3, 7.4], [7, 0, 6.4], [13, 3, 4.6], [-15, 4, 4.4], [2, 4, 6]] as const) puffs += outline(roundish(cx + dx * s, cy + dy * s, r * s, r * s * 0.86, rnd, { count: 10, wobble: 0.05 }));
    paint(dr, puffs, '#c9c7e0');
    paint(dr, outline(roundish(cx - 1 * s, cy - 1 * s, 14 * s, 6.4 * s, rnd, { count: 14 })), '#fbf9f4');
    paint(dr, outline(roundish(cx - 3 * s, cy - 4 * s, 6 * s, 4.4 * s, rnd, { count: 10 })), '#ffffff');
  };
  // the hills, layer on layer, poplars and two houses in the fold of them
  const hills: Array<[Pt[], string]> = [
    [[[0, 84], [20, 74], [44, 78], [70, 70], [96, 74], [120, 70], [120, 120], [0, 120]], '#b5c896'],
    [[[0, 92], [26, 82], [52, 88], [80, 80], [106, 86], [120, 84], [120, 120], [0, 120]], '#92ae72'],
    [[[0, 102], [30, 92], [60, 98], [90, 90], [120, 96], [120, 120], [0, 120]], '#76965a'],
  ];
  const land = roundish(60, 92, 56, 24, rnd, { wobble: 0.04, tremor: 0.6, count: 30 });
  within(dr, polygon([[0, 60], [120, 60], [120, 120], [0, 120]]), () => {
    cloud(20, 80, 1);
    cloud(100, 78, 0.95);
  });
  within(dr, outline(land), () => {
    for (const [pts, colour] of hills) paint(dr, outline(tremble(pts, rnd, 0.5)), colour);
    let poplars = '';
    for (const [x, y, h] of [[34, 90, 12], [38, 91, 9], [86, 86, 11], [90, 87.4, 8]] as const) poplars += outline(tremble(blade([x, y], [x, y - h], 3.4, { at: 0.4, point: 0.6, count: 6 }), rnd, 0.15));
    paint(dr, poplars, '#4f7a3e');
    for (const [x, y] of [[56, 94], [64, 95.4]] as const) {
      paint(dr, polygon(tremble([[x - 3, y], [x + 3, y], [x + 3, y - 4], [x - 3, y - 4]], rnd, 0.12)), '#efdcb4');
      paint(dr, polygon([[x + 3, y], [x + 4.6, y - 0.8], [x + 4.6, y - 4.6], [x + 3, y - 4]]), '#c9ad80');
    }
    paint(dr, streaks(rnd, [6, 80, 114, 116], 22, -8, 8, 0.8), '#a9c48a', 0.45);
  });
}

// ─────────────────────────────────────────────────────────────── pêta newrozê

export function pet(dr: Drawing, rnd: Rnd): void {
  // the ground it is lit on, ringed with stones
  const ground = roundish(60, 102, 42, 8, rnd, { wobble: 0.05, tremor: 0.5 });
  paint(dr, outline(ground), '#6e5a44');
  side(dr, ground, 0, 1.4, '#8e765a');
  // the logs piled crossways, their cut ends pale
  for (const [a, b] of [[[34, 100], [84, 88]], [[86, 100], [36, 88]], [[44, 102], [78, 98]]] as Array<[Pt, Pt]>) {
    paint(dr, brush([a, lerp(a, b, 0.5), b], 5.4, rnd, { start: 1, end: 0.9, peak: 0.5, count: 8 }), '#6a4428');
    paint(dr, brush([[a[0], a[1] - 1.2], lerp([a[0], a[1] - 1.2], [b[0], b[1] - 1.2], 0.5), [b[0], b[1] - 1.2]], 1.4, rnd, { count: 6 }), '#8e623c');
    paint(dr, ellipse(a[0], a[1], 2.4, 2.6), '#d9b07a');
  }
  // the fire: tongues of red outermost, orange in them, gold in those, and a pale heart, all licking up and curling
  const layers: Array<[string, Array<[Pt, Pt, number, number]>]> = [
    ['#c33a28', [[[44, 96], [30, 52], 14, -4], [[54, 96], [46, 22], 16, 5], [[64, 96], [66, 12], 17, -6], [[74, 96], [86, 34], 15, 6], [[82, 96], [94, 58], 11, 4]]],
    ['#ec7a2c', [[[48, 96], [40, 56], 12, -3], [[58, 96], [54, 30], 13, 4], [[66, 96], [70, 24], 13, -4], [[74, 96], [82, 48], 11, 4]]],
    ['#f7b63a', [[[54, 96], [50, 56], 10, -2], [[62, 96], [62, 40], 11, 3], [[70, 96], [74, 58], 8, 3]]],
    ['#ffe4a0', [[[58, 96], [57, 70], 7, 2], [[64, 96], [66, 74], 5, -1]]],
  ];
  // each layer brushed through with the next one's colour, so the flame flickers rather than lies flat
  for (let i = 0; i < layers.length; i++) {
    const [colour, tongues] = layers[i]!;
    let d = '';
    for (const [base, tip, w, lean] of tongues) d += tongue(base, tip, w, lean, rnd);
    paint(dr, d, colour);
    const next = layers[i + 1]?.[0] ?? '#fff4d0';
    within(dr, d, () => paint(dr, streaks(rnd, [30, 14 + i * 14, 92, 96], 16 - i * 3, -86, 9 - i, 1.1), next, 0.5));
  }
  // the ring of stones in front of it, lit on top
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * 0.08 + (i / 8) * Math.PI * 0.84;
    const [x, y] = [60 - Math.cos(a) * 38, 100 + Math.sin(a) * 7];
    const stone = roundish(x, y, 4.6, 3.2, rnd, { count: 10, wobble: 0.08 });
    paint(dr, outline(stone), '#8b8378');
    side(dr, stone, 0, 1.2, '#e0a66a');
  }
  // sparks going up into the night
  let sparks = '';
  for (let i = 0; i < 14; i++) {
    const x = 34 + rnd() * 56;
    const y = 8 + rnd() * 40;
    sparks += touch(x, y, 1.4 + rnd() * 1.2, 0.6 + rnd() * 0.3, -80 + rnd() * 40);
  }
  paint(dr, sparks, '#f7b63a');
}

// ──────────────────────────────────────────────────────────────────────── roj

const SUN: Tone = { base: '#f3bd45', light: '#fbdc86', shade: '#d98f2a' };

export function roj(dr: Drawing, rnd: Rnd): void {
  // twenty-one rays, as the sun of Kurdistan has: long gold ones with shorter red-orange ones between, each brushed
  // on with a wavering hand
  const ray = (deg: number, from: number, to: number, w: number): string => {
    const a = (deg * Math.PI) / 180;
    const pts: Pt[] = [];
    for (let k = 0; k <= 3; k++) {
      const r = from + ((to - from) * k) / 3;
      const wave = Math.sin(k * 1.7 + deg) * 1.2 * (k / 3);
      pts.push([60 + Math.cos(a) * r - Math.sin(a) * wave, 60 + Math.sin(a) * r + Math.cos(a) * wave]);
    }
    return brush(pts, w, rnd, { start: 1, end: 0.06, peak: 0.12, count: 10 });
  };
  let back = '';
  let long = '';
  let lit = '';
  for (let i = 0; i < 21; i++) {
    const deg = -90 + (i / 21) * 360;
    back += ray(deg + 360 / 42, 26, 46 + (i % 2) * 3, 7.4);
    long += ray(deg, 26, 55 + (i % 3) * 1.4, 8.6);
    lit += ray(deg - 2.2, 30, 48, 2);
  }
  paint(dr, back, '#d65a2e');
  paint(dr, long, '#e98b2e');
  paint(dr, lit, '#f6c55a', 0.85);
  // a ring of warm dabs round the disc, then the disc itself, brushed round and round
  let halo = '';
  for (let i = 0; i < 42; i++) {
    const a = (i / 42) * Math.PI * 2;
    halo += touch(60 + Math.cos(a) * 31.6, 60 + Math.sin(a) * 31.6, 5, 2.2, (a * 180) / Math.PI + 90);
  }
  paint(dr, halo, '#f8cf6a');
  const disc = roundish(60, 60, 29, 29, rnd, { wobble: 0.012, tremor: 0.3, count: 36 });
  paint(dr, outline(disc), SUN.base);
  within(dr, outline(disc), () => {
    let swirl = '';
    for (let i = 0; i < 26; i++) {
      const r = 6 + rnd() * 20;
      const a = rnd() * Math.PI * 2;
      const pts: Pt[] = [0, 0.5, 1].map((t): Pt => [60 + Math.cos(a + t * 0.7) * r, 60 + Math.sin(a + t * 0.7) * r]);
      swirl += brush(pts, 1.4 + rnd(), rnd, { start: 0.3, end: 0.1, peak: 0.5, count: 6 });
    }
    paint(dr, swirl, SUN.light, 0.5);
    let dots = '';
    for (let i = 0; i < 21; i++) {
      const a = (i / 21) * Math.PI * 2 - Math.PI / 2;
      dots += ellipse(60 + Math.cos(a) * 23.4, 60 + Math.sin(a) * 23.4, 1.3, 1.3);
    }
    paint(dr, dots, '#e98b2e');
    band(dr, roundish(60, 60, 20, 20, rnd, { count: 24, tremor: 0.2 }), roundish(60, 60, 18.4, 18.4, rnd, { count: 24, tremor: 0.2 }), '#fbe1a0');
  });
  side(dr, disc, -2.8, -2.8, SUN.shade, { grow: 0.99 });
  side(dr, disc, 2.4, 2.4, SUN.light, { grow: 0.98 });
}
