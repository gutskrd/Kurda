/**
 * The sky's gifts (gift-art.ts): the full moon over the mountains, the galaxy, a shooting star, a rainbow over the hills,
 * the Newroz fire and the sun. Night skies are cut out as a patch of their own so they hold on a light page.
 */
import { type Drawing, type Pt } from './svg.js';
import { layer } from './gift-canvas.js';
import { KADIZ_PLANE } from './gift-loop-sky.js';
import { band, blade, brush, ellipse, lerp, outline, paint, polygon, rest, roundish, shift, side, streaks, touch, tremble, turn, within, type Rnd, type Tone } from './gift-paint.js';

// ──────────────────────────────────────────────────────────────────── heyv

const NIGHT: Tone = { base: '#1d2456', light: '#2b3473', shade: '#141a43' };
const MOON: Tone = { base: '#f3ead2', light: '#fffaec', shade: '#d8caa6' };
/** The moon's middle and size, which its halo, the drifting cloud and its loop (gift-loop-sky.ts) are drawn about. */
export const HEYV_MOON = { x: 60, y: 45, r: 22.5 };
/** The stars that twinkle, each with its sparkle's reach. */
export const HEYV_STARS: ReadonlyArray<readonly [x: number, y: number, reach: number]> = [[22, 26, 3.6], [96, 18, 3.2], [102, 50, 2.8], [17, 56, 2.6]];
/** Where the moonlight runs along the far ridge's crest, from its left to its right. */
const CREST: readonly Pt[] = [[30, 79.6], [36, 76.4], [41.6, 74.2], [46, 76.8], [52, 79.4], [58, 78.4], [65, 75.2], [72, 72.4], [77, 74.6], [84, 78]];

export function heyv(dr: Drawing, rnd: Rnd): void {
  const M = HEYV_MOON;
  // the night, cut out as its own patch and brushed in long strokes, lighter where the moon fills the sky
  const sky = roundish(60, 60, 54, 53, rnd, { wobble: 0.035, tremor: 0.7, count: 44 });
  paint(dr, outline(sky), NIGHT.base);
  within(dr, outline(sky), () => {
    paint(dr, streaks(rnd, [6, 6, 114, 100], 30, -8, 18, 1.8), NIGHT.light, 0.35);
    // the halo: veils of moonlight, each smaller and paler, every edge laid twice a little apart so it reads soft
    for (const [r, colour, alpha] of [[46, '#252d6b', 0.7], [38.5, '#2f3a7d', 0.7], [32, '#424f93', 0.65], [27.4, '#6c77b4', 0.6]] as const) {
      for (const d of [1.4, -0.4]) paint(dr, outline(roundish(M.x, M.y, r + d, (r + d) * 0.98, rnd, { wobble: 0.03, tremor: r * 0.035, count: 40 })), colour, alpha / 2 + 0.1);
    }
    let haze = '';
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + rnd() * 0.25;
      const r = 29 + rnd() * 13;
      haze += touch(M.x + Math.cos(a) * r, M.y + Math.sin(a) * r, 7 + rnd() * 7, 0.9 + rnd() * 0.6, (a * 180) / Math.PI + 90);
    }
    paint(dr, haze, '#8890c6', 0.14);
    // far stars, many and small, then the few that will twinkle
    let far = '';
    for (let i = 0; i < 26; i++) {
      const [x, y] = [8 + rnd() * 104, 6 + rnd() * 66];
      if (Math.hypot(x - M.x, y - M.y) < 40) continue;
      const r = 0.25 + rnd() * rnd() * 0.5;
      far += ellipse(x, y, r, r);
    }
    paint(dr, far, '#cdd0f0', 0.75);
    let near = '';
    for (const [x, y, reach] of HEYV_STARS) near += outline(roundish(x, y, reach * 0.26, reach * 0.26, rnd, { count: 8, tremor: 0.1 }));
    paint(dr, near, '#fbf1d2');

    // the mountains, range behind range: the far one pale with distance and lit along its crest, the near ones darker
    const far1 = tremble([[0, 88], [10, 85], [20, 82.6], [30, 79.6], [36, 76.4], [41.6, 74.2], [46, 76.8], [52, 79.4], [58, 78.4], [65, 75.2], [72, 72.4],
      [77, 74.6], [84, 78], [92, 80.8], [100, 79.2], [110, 82.6], [120, 85], [120, 120], [0, 120]], rnd, 0.35);
    paint(dr, outline(far1), '#3a4482');
    within(dr, outline(far1), () => {
      paint(dr, streaks(rnd, [0, 74, 120, 96], 16, 24, 9, 0.9), '#323b74', 0.6);
      // the faces turned to the moon catch its light, and snow lies in streaks down the gullies under the peaks
      paint(dr, polygon(tremble([[36, 76.4], [41.6, 74.2], [40.4, 80], [37, 82]], rnd, 0.3)) + polygon(tremble([[65, 75.2], [72, 72.4], [70.6, 78.6], [66.4, 80.6]], rnd, 0.3)), '#4a5596', 0.8);
      let snow = '';
      for (const [px, py] of [[41.6, 74.2], [72, 72.4]] as const) {
        snow += outline(tremble([[px, py - 0.3], [px + 2.8, py + 1.6], [px + 1.8, py + 2.4], [px + 0.9, py + 4.4], [px - 0.2, py + 2.8], [px - 1.4, py + 5],
          [px - 2.2, py + 2.6], [px - 3.6, py + 2.4]], rnd, 0.2));
      }
      paint(dr, snow, '#c9cdea', 0.9);
    });
    paint(dr, brush(CREST.slice(), 1, rnd, { start: 0.1, end: 0.1, peak: 0.5, count: 30 }), '#a4acda', 0.75);
    const mid = tremble([[0, 94], [8, 92.6], [18, 89], [27, 90.4], [36, 93.6], [46, 91], [56, 87.6], [64, 89.8], [74, 93], [86, 89.6], [96, 86.6], [106, 89],
      [114, 92.4], [120, 93], [120, 120], [0, 120]], rnd, 0.35);
    paint(dr, outline(mid), '#262e63');
    within(dr, outline(mid), () => paint(dr, brush([[16, 89.6], [27, 90.8], [36, 94]], 0.6, rnd) + brush([[86, 90.2], [96, 87.2], [106, 89.6]], 0.6, rnd), '#4a5596', 0.7));
    const near1 = tremble([[0, 102], [14, 99], [28, 100.6], [42, 98.4], [56, 101], [70, 98.8], [84, 100.6], [98, 97.6], [110, 99.6], [120, 101], [120, 120], [0, 120]], rnd, 0.35);
    paint(dr, outline(near1), NIGHT.shade);
    // a village asleep in the fold, two of its windows still lit
    let houses = '';
    for (const [x, y] of [[46, 99.4], [51, 100.2], [55.4, 99.6]] as const) houses += polygon(tremble([[x - 2, y + 1], [x + 2, y + 1], [x + 2, y - 1.8], [x - 2, y - 1.8]], rnd, 0.1));
    paint(dr, houses, '#10143a');
    paint(dr, ellipse(47, 99.4, 0.6, 0.55) + ellipse(55.8, 99.6, 0.6, 0.55), '#f4bf55');
  });
  side(dr, sky, 1.3, 1.3, NIGHT.light);

  // the moon: cream, its seas laid where the real ones lie, soft-edged craters, lit at its upper left and turning
  // gently away into shade at its lower right
  const moon = roundish(M.x, M.y, M.r, M.r, rnd, { wobble: 0.01, tremor: 0.22, count: 44 });
  const on = (u: number, v: number): Pt => [M.x + u * M.r, M.y + v * M.r];
  paint(dr, outline(moon), MOON.base);
  within(dr, outline(moon), () => {
    paint(dr, streaks(rnd, [M.x - M.r, M.y - M.r, M.x + M.r, M.y + M.r], 30, -20, 7, 1), MOON.light, 0.5);
    let seas = '';
    for (const [u, v, ru, rv, rot] of [[-0.48, 0.06, 0.26, 0.48, 12], [-0.24, -0.36, 0.27, 0.21, -14], [0.18, -0.33, 0.15, 0.14, 0], [0.34, -0.04, 0.19, 0.16, 20],
      [0.67, -0.2, 0.1, 0.08, 0], [0.5, 0.24, 0.11, 0.14, -10], [-0.14, 0.4, 0.17, 0.12, 8], [-0.46, 0.42, 0.09, 0.08, 0]] as const) {
      const [x, y] = on(u, v);
      seas += outline(roundish(x, y, ru * M.r, rv * M.r, rnd, { wobble: 0.1, rot, count: 16, tremor: 0.25 }));
    }
    paint(dr, seas, '#d6caa8', 0.72);
    let deep = '';
    for (const [u, v, ru, rv] of [[-0.5, 0.02, 0.15, 0.3], [-0.24, -0.38, 0.15, 0.11], [0.32, -0.06, 0.1, 0.08]] as const) {
      const [x, y] = on(u, v);
      deep += outline(roundish(x, y, ru * M.r, rv * M.r, rnd, { wobble: 0.2, count: 12, tremor: 0.25 }));
    }
    paint(dr, deep, '#c8bb97', 0.4);
    // a few craters, each a soft blot with its far rim catching the light, and Tycho's rays spread over the south
    for (const [u, v, r] of [[-0.1, 0.72, 1.4], [-0.3, -0.05, 1.1], [0.62, 0.52, 1], [0.16, 0.14, 0.8], [0.4, -0.6, 0.9]] as const) {
      const [x, y] = on(u, v);
      const crater = roundish(x, y, r, r * 0.9, rnd, { count: 10, tremor: 0.1 });
      paint(dr, outline(crater), '#cdbf9b', 0.75);
      side(dr, crater, -0.45, -0.45, MOON.light);
    }
    let tycho = '';
    const [tx, ty] = on(-0.1, 0.72);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rnd() * 0.3;
      const l = 3 + rnd() * 4;
      tycho += touch(tx + Math.cos(a) * (l / 2 + 1.6), ty + Math.sin(a) * (l / 2 + 1.6), l, 0.3, (a * 180) / Math.PI);
    }
    paint(dr, tycho, MOON.light, 0.4);
    side(dr, moon, 1.5, 1.5, MOON.light, { grow: 0.995 });
    side(dr, moon, -2.4, -2.4, MOON.shade, { grow: 0.99 });
  });

  // what moves (gift-loop-sky.ts), each unseen as the round begins, so the still is the base: the halo breathing out,
  // a thin cloud crossing the moon's face, the moonlight running along the crest, and the near stars twinkling
  // rings of light round the moon, never over it, brightening from its rim outward
  const ring = (r: number, inner: number, colour: string, alpha: number): void => {
    const hole = roundish(M.x, M.y, inner, inner, rnd, { wobble: 0, tremor: 0, count: 44 });
    dr.add(`<path d="${outline(roundish(M.x, M.y, r, r * 0.97, rnd, { wobble: 0.02, tremor: 0.6, count: 40 }))}${outline(hole)}" fill="${colour}" fill-opacity="${alpha}" fill-rule="evenodd"/>`);
  };
  layer(dr, 'bloom', () => ring(M.r + 5, M.r + 0.3, '#c9cde9', 0.34));
  layer(dr, 'glow', () => ring(M.r + 10, M.r + 4.6, '#a7aedb', 0.26));
  layer(dr, 'cloud', () => {
    const wisp: Pt[] = [[M.x - 24, M.y + 7], [M.x - 10, M.y + 3.4], [M.x + 6, M.y + 4.2], [M.x + 22, M.y + 1.2]];
    paint(dr, brush(wisp, 4.2, rnd, { start: 0.2, end: 0.15, peak: 0.45, count: 20 }), '#9096c6', 0.85);
    paint(dr, brush(shift(wisp, 0.5, -1.1), 1.6, rnd, { start: 0.2, end: 0.1, peak: 0.5, count: 18 }), '#dfe0f2', 0.9);
    const tail: Pt[] = [[M.x - 14, M.y + 10.6], [M.x - 2, M.y + 9], [M.x + 10, M.y + 9.8]];
    paint(dr, brush(tail, 2.2, rnd, { start: 0.2, end: 0.15, peak: 0.5, count: 14 }), '#7d83b8', 0.75);
  });
  for (let i = 0; i < 4; i++) {
    layer(dr, `shine${i + 1}`, () => {
      const p = lerp(CREST[1 + i * 2]!, CREST[2 + i * 2]!, 0.5);
      paint(dr, brush([[p[0] - 4, p[1] + 0.6], [p[0], p[1] - 0.2], [p[0] + 4, p[1] + 0.8]], 1.2, rnd, { start: 0.2, end: 0.2, peak: 0.5, count: 8 }), '#e4e7fa', 0.9);
      paint(dr, touch(p[0], p[1] - 0.3, 3.2, 0.5, 0) + touch(p[0], p[1] - 0.3, 2, 0.4, 90), '#ffffff');
    });
  }
  HEYV_STARS.forEach(([x, y, reach], i) => {
    layer(dr, `star${i + 1}`, () => {
      paint(dr, touch(x, y, reach * 2, reach * 0.22, 0) + touch(x, y, reach * 2, reach * 0.22, 90), '#fff6dc');
      paint(dr, touch(x, y, reach * 1.1, reach * 0.16, 45) + touch(x, y, reach * 1.1, reach * 0.16, -45), '#fff6dc', 0.6);
      paint(dr, ellipse(x, y, reach * 0.3, reach * 0.3), '#ffffff');
    });
  });
}

// ─────────────────────────────────────────────────────────────── rêya kadizê

export const KADIZ_STARS: ReadonlyArray<readonly [x: number, y: number, size: number]> = [[26, 22, 1.2], [98, 34, 1], [20, 84, 0.9], [88, 100, 0.8]];

export function kadiz(dr: Drawing, rnd: Rnd): void {
  // the night it hangs in: near black at the rim, a blue-violet haze of far light behind it, brushed on in layers
  const sky = roundish(60, 60, 55, 54, rnd, { wobble: 0.035, tremor: 0.7, count: 44 });
  paint(dr, outline(sky), '#0c0a20');
  const { tilt: TILT, squash: SQUASH } = KADIZ_PLANE;
  const tilt = (TILT * Math.PI) / 180;
  // a point of the galaxy's own disc, seen tipped away from us and turned; a little smaller than the patch, so that as
  // the disc turns in its plane (gift-loop-sky.ts) no arm reaches the patch's edge
  const G = 0.88;
  const place = (x: number, y: number): Pt => {
    const yy = y * SQUASH * G;
    return [60 + x * G * Math.cos(tilt) - yy * Math.sin(tilt), 60 + x * G * Math.sin(tilt) + yy * Math.cos(tilt)];
  };
  const disc = (r: number, w = 1): string => outline(turn(roundish(60, 60, r * w * G, r * SQUASH * G, rnd, { wobble: 0.1, count: 18, tremor: r * 0.05 }), 60, 60, TILT));
  within(dr, outline(sky), () => {
    let haze = '';
    for (let i = 0; i < 7; i++) haze += outline(roundish(60 + (rnd() - 0.5) * 50, 60 + (rnd() - 0.5) * 50, 18 + rnd() * 22, 12 + rnd() * 16, rnd,
      { wobble: 0.2, count: 12, tremor: 2 }));
    paint(dr, haze, '#221c58', 0.3);
    paint(dr, outline(roundish(60, 60, 44, 40, rnd, { wobble: 0.08, count: 20, tremor: 2 })), '#1a1648', 0.7);
    paint(dr, streaks(rnd, [6, 6, 114, 114], 40, TILT, 14, 1.4), '#2c2670', 0.4);
    // stars of every size, the far ones many and faint
    let faint = '';
    let clear = '';
    for (let i = 0; i < 120; i++) {
      const r = 0.18 + rnd() * rnd() * 0.7;
      const star = ellipse(6 + rnd() * 108, 6 + rnd() * 108, r, r);
      if (rnd() < 0.6) faint += star;
      else clear += star;
    }
    paint(dr, faint, '#c9c4ec', 0.6);
    paint(dr, clear, '#fbf4e4');
    // two far galaxies, small smudges tipped their own ways
    for (const [x, y, r, deg] of [[22, 30, 4.2, 30], [96, 92, 3.2, -50]] as const) {
      paint(dr, outline(turn(roundish(x, y, r, r * 0.4, rnd, { count: 10, tremor: 0.2 }), x, y, deg)), '#b8a6e0', 0.35);
      paint(dr, outline(turn(roundish(x, y, r * 0.45, r * 0.2, rnd, { count: 8, tremor: 0.1 }), x, y, deg)), '#f2e2c4', 0.7);
    }
  });
  side(dr, sky, 1.3, 1.3, '#2e2763');
  // the galaxy itself, which turns in its own plane: its outer light built up from many thin veils, wider and fainter
  // outward, the arms, and the heart
  layer(dr, 'disc', () => {
    for (const [r, w, colour, alpha] of [[53, 1.04, '#342c86', 0.26], [44, 1.02, '#433a9a', 0.18], [34, 1, '#5e50b0', 0.16], [24, 1, '#8a74c8', 0.18],
      [16, 1, '#c49cbc', 0.24],
      [11, 1, '#e8b8a0', 0.3]] as const) paint(dr, disc(r, w), colour, alpha);
    // the arms: two great ones and two fainter between, each a log spiral laid on in touches along the way it turns
    const lanes: string[] = ['', ''];
    const veils = ['', '', ''];
    let spines = '';
    const knots = ['', ''];
    const young = ['', ''];
    let armStars = '';
    const arm = (phase: number, turns: number, count: number, strength: number): void => {
      for (let s = 0; s < count; s++) {
        const f = (s + rnd()) / count;
        const theta = f * Math.PI * 2 * turns;
        const r = 5 + 46 * (Math.exp(1.15 * f) - 1) / (Math.exp(1.15) - 1);
        const phi = theta + phase;
        const jitter = (rnd() - 0.5) * (2 + 6 * f);
        const at = (dr0: number, dphi = 0): Pt => place((r + dr0) * Math.cos(phi + dphi), (r + dr0) * Math.sin(phi + dphi));
        const [x, y] = at(jitter);
        const [x2, y2] = at(jitter + 0.8, 0.08);
        const deg = (Math.atan2(y2 - y, x2 - x) * 180) / Math.PI;
        const len = (4.6 + rnd() * 3) * (1 - 0.35 * f);
        veils[Math.min(2, Math.floor(f * 3))] += touch(x, y, len * 2.2, len * (0.7 + strength * 0.4), deg);
        if (strength < 1) continue;
        if (rnd() < 0.6) spines += touch(...at(jitter * 0.3), len * 1.4, len * 0.32, deg);
        // the dust lane runs along the inside of each arm, dark and ragged
        if (rnd() < 0.7) {
          const [lx, ly] = at(-3.6 - f * 2.4 + (rnd() - 0.5) * 1.6);
          lanes[rnd() < 0.5 ? 0 : 1] += touch(lx, ly, len * (1 + rnd()), 1.1 + rnd() * 1.4, deg + (rnd() - 0.5) * 16);
        }
        // rose knots where stars are being born, and blue-white young clusters along the outer edge
        if (f > 0.2 && rnd() < 0.14) {
          const [kx, ky] = at(jitter * 0.5);
          for (let k = 0; k < 1 + Math.floor(rnd() * 3); k++) {
            const size = 0.4 + rnd() * rnd() * 1.3;
            knots[rnd() < 0.6 ? 0 : 1] += outline(roundish(kx + (rnd() - 0.5) * 2.4, ky + (rnd() - 0.5) * 1.6, size, size * 0.8, rnd, { count: 7, tremor: 0.15 }));
          }
        }
        if (f > 0.3 && rnd() < 0.22) {
          const [bx, by] = at(2.4 + rnd() * 2);
          young[rnd() < 0.5 ? 0 : 1] += ellipse(bx, by, 0.35 + rnd() * 0.45, 0.35 + rnd() * 0.45);
        }
        if (rnd() < 0.5) armStars += ellipse(x + (rnd() - 0.5) * 2, y + (rnd() - 0.5) * 2, 0.2 + rnd() * 0.3, 0.2 + rnd() * 0.3);
      }
    };
    arm(0.3, 1.4, 130, 1);
    arm(0.3 + Math.PI, 1.4, 130, 1);
    arm(0.3 + Math.PI / 2, 0.9, 50, 0.5);
    arm(0.3 + Math.PI * 1.5, 0.9, 50, 0.5);
    paint(dr, veils[2]!, '#8a96ec', 0.28);
    paint(dr, veils[1]!, '#c0b0f2', 0.3);
    paint(dr, veils[0]!, '#f4d6c2', 0.32);
    paint(dr, spines, '#ece6ff', 0.32);
    paint(dr, lanes[0]!, '#120c26', 0.7);
    paint(dr, lanes[1]!, '#28163a', 0.6);
    paint(dr, armStars, '#f4f0ff', 0.85);
    paint(dr, young[0]!, '#bcd8ff');
    paint(dr, young[1]!, '#eef6ff');
    paint(dr, knots[0]!, '#ef7fa8', 0.85);
    paint(dr, knots[1]!, '#ffb0c8', 0.9);
    // the heart: a bulge of old gold light, laid on thick and warm, brightest at its very middle, its warmth spilling out
    paint(dr, disc(22, 1.05), '#e0a878', 0.12);
    paint(dr, disc(16, 1.05), '#f0c48a', 0.16);
    for (const [r, colour, alpha] of [[11, '#e6a85c', 0.35], [8.2, '#f4c272', 0.5], [6, '#fbd890', 0.7], [4, '#ffe9bc', 0.85], [2.4, '#fff8e6', 1]] as const) {
      paint(dr, outline(turn(roundish(60, 60, r, r * 0.62, rnd, { wobble: 0.1, count: 14, tremor: r * 0.06 }), 60, 60, TILT)), colour, alpha);
    }
  });
  // and the dust lane crossing in front of the heart on its near side, which is what shows the disc for a disc: it
  // stays on the near side as the disc turns
  layer(dr, 'lane', () => {
    const front: Pt[] = [place(-14, 3.4), place(-6, 5.6), place(0, 6.4), place(7, 5.6), place(15, 3.2)];
    paint(dr, brush(front, 2.4, rnd, { start: 0.1, end: 0.1, peak: 0.5, count: 14 }), '#2a1830', 0.55);
    paint(dr, brush(front.map(([x, y]): Pt => [x + 0.3, y + 1.3]), 1.2, rnd, { start: 0.1, end: 0.1, peak: 0.5, count: 12 }), '#140e2a', 0.45);
  });
  // the brightest near stars, each with a small four-pointed glint, each twinkling in its own time
  KADIZ_STARS.forEach(([x, y, s], i) => {
    layer(dr, `star${i + 1}`, () => {
      paint(dr, touch(x, y, 6 * s, 0.7 * s, 0) + touch(x, y, 6 * s, 0.7 * s, 90) + touch(x, y, 3 * s, 0.5 * s, 45) + touch(x, y, 3 * s, 0.5 * s, -45), '#e8e6ff', 0.85);
      paint(dr, ellipse(x, y, 0.8 * s, 0.8 * s), '#ffffff');
    });
  });
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

/** Where the shooting star's head is in the still, and the way it travels (gift-loop-sky.ts moves it along this). */
export const STERK_HEAD: Pt = [42, 66];
export const STERK_WAY: Pt = [-0.788, 0.616];
export const STERK_TWINKLES: readonly Pt[] = [[26, 30], [90, 58], [70, 16]];

export function sterk(dr: Drawing, rnd: Rnd): void {
  const sky = nightPatch(dr, rnd, DUSK_SKY, 22);
  within(dr, outline(sky), () => {
    // the hills under it, a poplar and one window still lit
    paint(dr, outline(tremble([[0, 92], [22, 82], [44, 86], [70, 78], [96, 84], [120, 80], [120, 120], [0, 120]], rnd, 0.5)), '#1d2350');
    paint(dr, outline(tremble([[0, 102], [30, 92], [58, 97], [86, 90], [120, 96], [120, 120], [0, 120]], rnd, 0.5)), DUSK_SKY.shade);
    paint(dr, outline(tremble(blade([84, 91], [84, 76], 4, { at: 0.4, point: 0.6, count: 6 }), rnd, 0.15)), '#121638');
    paint(dr, polygon(tremble([[66, 96], [74, 95.4], [74, 90], [66, 90.6]], rnd, 0.15)), '#121638');
    paint(dr, polygon([[68.4, 93.6], [70.4, 93.4], [70.4, 91.6], [68.4, 91.8]]), '#f4bf55');
  });
  const head = STERK_HEAD;
  const back = (len: number, spread = 0): Pt => [head[0] - STERK_WAY[0] * len - STERK_WAY[1] * spread, head[1] - STERK_WAY[1] * len + STERK_WAY[0] * spread];
  // the star with its tail, laid on in long strokes that thin away from it, gold nearest, then peach, then lilac, kept
  // well inside the night so it can travel across it
  layer(dr, 'star', () => {
    const tails: Array<[Pt, number, string, number]> = [
      [back(50, 3), 6.4, '#a99be0', 0.7],
      [back(46, -3), 4.6, '#a99be0', 0.6],
      [back(44, 1.6), 3.8, '#f1a985', 0.8],
      [back(40, -1.4), 5.8, '#f1a985', 0.9],
      [back(34, 0.6), 4.2, '#f5cd6e', 1],
      [back(26, -1), 2.8, '#f5cd6e', 0.9],
    ];
    for (const [end, w, colour, opacity] of tails) {
      const mid = lerp(head, end, 0.5);
      paint(dr, brush([head, [mid[0] + (rnd() - 0.5) * 2, mid[1] + (rnd() - 0.5) * 2], end], w, rnd, { start: 1, end: 0.02, peak: 0.03, count: 14 }), colour, opacity);
    }
    let dust = '';
    for (let i = 0; i < 14; i++) {
      const t = 0.15 + rnd() * 0.75;
      const p = back(46 * t, (rnd() - 0.5) * 8 * t);
      dust += touch(p[0], p[1], 1.4 + rnd(), 0.55, -38);
    }
    paint(dr, dust, '#fff1cc', 0.9);
    paint(dr, outline(roundish(head[0], head[1], 6.6, 6.2, rnd, { count: 12, wobble: 0.1 })), '#f5cd6e', 0.9);
    paint(dr, outline(roundish(head[0], head[1], 3.6, 3.4, rnd, { count: 10, wobble: 0.08 })), '#fff8e6');
  });
  // its head's cross of light, which flares as it passes
  layer(dr, 'glint', () => {
    paint(dr, brush([[head[0] - 10, head[1] + 0.6], head, [head[0] + 10, head[1] - 0.6]], 1.2, rnd, { start: 0.1, end: 0.1, peak: 0.5 }) +
      brush([[head[0] + 0.4, head[1] - 9], head, [head[0] - 0.4, head[1] + 9]], 1.2, rnd, { start: 0.1, end: 0.1, peak: 0.5 }), '#fff6dc');
    paint(dr, touch(head[0], head[1], 7, 0.5, 45) + touch(head[0], head[1], 7, 0.5, -45), '#fff6dc', 0.7);
  });
  STERK_TWINKLES.forEach(([x, y], i) => {
    layer(dr, `star${i + 1}`, () => {
      paint(dr, touch(x, y, 5, 0.5, 0) + touch(x, y, 5, 0.5, 90), '#f3ecff');
      paint(dr, ellipse(x, y, 0.7, 0.7), '#ffffff');
    });
  });
}

// ──────────────────────────────────────────────────────────────────── keskesor

const RAINBOW = ['#d9564a', '#e98d47', '#f0c64e', '#8cbf6a', '#5b9bd0', '#8a6cc0'];

export function keskesor(dr: Drawing, rnd: Rnd): void {
  // the sky after rain, cut out as its own patch, the last of the rain still falling from the cloud at its left
  rest(dr, rnd, 60, 113, 46, 3.6);
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
  // where the broad brush ran thin, the sky shows through along the bands
  let thin = '';
  for (let i = 0; i < 14; i++) {
    const a = Math.PI * (1.08 + rnd() * 0.84);
    const r = 56 - Math.floor(rnd() * 6) * 4.2 - 2.1;
    thin += touch(60 + Math.cos(a) * r, 86 + Math.sin(a) * r * 0.98, 4 + rnd() * 5, 0.5, (a * 180) / Math.PI + 90);
  }
  paint(dr, thin, '#eef3f2', 0.45);
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
    // the far mountains, blue with distance and still snowed on their tops
    const range: Pt[] = [[0, 82], [12, 72], [22, 75], [36, 63], [48, 71], [62, 66], [76, 72], [92, 62], [106, 70], [120, 67], [120, 92], [0, 92]];
    paint(dr, polygon(tremble(range, rnd, 0.4)), '#a9b6c9');
    paint(dr, polygon(tremble([[32, 66.6], [36, 63], [40.4, 66.4], [37.6, 66], [35, 67.6]], rnd, 0.2)) +
      polygon(tremble([[88.6, 65.4], [92, 62], [96, 65.2], [93.4, 64.8], [90.6, 66.4]], rnd, 0.2)), '#eef1f5');
    paint(dr, polygon([[36, 63], [48, 71], [44, 78], [38, 70]]) + polygon([[92, 62], [106, 70], [100, 78], [94, 68]]), '#8f9db3', 0.7);
    for (const [pts, colour] of hills) paint(dr, outline(tremble(pts, rnd, 0.5)), colour);
    // the sun come out after the rain, catching the crest of each fold
    let crests = '';
    for (const [pts] of hills.slice(1)) crests += brush(pts.slice(0, 6).map(([x, y]): Pt => [x, y + 0.8]), 1.6, rnd, { start: 0.2, end: 0.2, peak: 0.5, count: 20 });
    paint(dr, crests, '#c9da9e', 0.6);
    let poplars = '';
    for (const [x, y, h] of [[34, 90, 12], [38, 91, 9], [86, 86, 11], [90, 87.4, 8]] as const) poplars += outline(tremble(blade([x, y], [x, y - h], 3.4, { at: 0.4, point: 0.6, count: 6 }), rnd, 0.15));
    paint(dr, poplars, '#4f7a3e');
    for (const [x, y] of [[56, 94], [64, 95.4]] as const) {
      paint(dr, polygon(tremble([[x - 3, y], [x + 3, y], [x + 3, y - 4], [x - 3, y - 4]], rnd, 0.12)), '#efdcb4');
      paint(dr, polygon([[x + 3, y], [x + 4.6, y - 0.8], [x + 4.6, y - 4.6], [x + 3, y - 4]]), '#c9ad80');
    }
    paint(dr, streaks(rnd, [6, 80, 114, 116], 22, -8, 8, 0.8), '#a9c48a', 0.45);
  });
  // light passing over the bow from west to east, drawn as frames shown in turn (gift-loop-sky.ts), each cut to the
  // part of the bow that shows above the far mountains
  const above = polygon([[0, 0], [120, 0], [120, 67], [106, 70], [92, 62], [76, 72], [62, 66], [48, 71], [36, 63], [22, 75], [12, 72], [0, 82]]);
  KESKESOR_SWEEP.forEach((deg, i) => {
    layer(dr, `light${i + 1}`, () => {
      within(dr, outline(sky), () => {
        within(dr, above, () => {
          for (const [half, alpha] of [[17, 0.08], [13, 0.09], [9.5, 0.1], [6.5, 0.12], [3.5, 0.13]] as const) {
            const arc = (r: number, from: number, to: number): Pt[] =>
              Array.from({ length: 9 }, (_, k): Pt => {
                const a = ((-90 + from + ((to - from) * k) / 8) * Math.PI) / 180;
                return [60 + Math.cos(a) * r, 86 + Math.sin(a) * r * 0.98];
              });
            paint(dr, polygon([...arc(57.4, deg - half, deg + half), ...arc(31.6, deg + half, deg - half)]), '#fffdf4', alpha);
          }
        });
      });
    });
  });
}

/** Where along the bow each frame of passing light lies, in degrees from its top, west to east. */
export const KESKESOR_SWEEP = [-72, -54, -36, -18, 0, 18, 36, 54, 72];

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
  // each colour brushed through with the next one's, so the flame flickers rather than lies flat; its tongues are cut
  // into the groups that flicker apart (gift-loop-sky.ts)
  const groups: ReadonlyArray<readonly [name: string, colour: number, tongues: readonly number[]]> = [
    ['redLeft', 0, [0, 1]], ['redRight', 0, [2, 3, 4]], ['orangeLeft', 1, [0, 1]], ['orangeRight', 1, [2, 3]], ['gold', 2, [0, 1, 2]], ['heart', 3, [0, 1]],
  ];
  for (const [name, i, picked] of groups) {
    const [colour, tongues] = layers[i]!;
    layer(dr, name, () => {
      let d = '';
      for (const k of picked) {
        const [base, tip, w, lean] = tongues[k]!;
        d += tongue(base, tip, w, lean, rnd);
      }
      paint(dr, d, colour);
      const next = layers[i + 1]?.[0] ?? '#fff4d0';
      within(dr, d, () => paint(dr, streaks(rnd, [30, 14 + i * 14, 92, 96], 9 - i, -86, 9 - i, 1.1), next, 0.5));
    });
  }
  // the ring of stones in front of it, lit on top
  layer(dr, 'stones', () => {
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * 0.08 + (i / 8) * Math.PI * 0.84;
      const [x, y] = [60 - Math.cos(a) * 38, 100 + Math.sin(a) * 7];
      const stone = roundish(x, y, 4.6, 3.2, rnd, { count: 10, wobble: 0.08 });
      paint(dr, outline(stone), '#8b8378');
      side(dr, stone, 0, 1.2, '#e0a66a');
    }
  });
  // embers going up into the night, each its own layer so it can rise, drift and go out
  PET_EMBERS.forEach(([x, y, len], i) => {
    layer(dr, `ember${i + 1}`, () => {
      paint(dr, touch(x, y, len * 1.7, 1.15, -84), '#f7b63a');
      paint(dr, touch(x, y + 0.2, len * 0.8, 0.6, -84), '#fff1c4');
    });
  });
}

/** Where each ember is drawn as the round begins, and how long a mark it makes. */
export const PET_EMBERS: ReadonlyArray<readonly [x: number, y: number, len: number]> = [[36, 34, 2.2], [84, 40, 2], [50, 20, 1.8], [74, 24, 2], [28, 48, 1.8], [91, 52, 2.2]];

// ──────────────────────────────────────────────────────────────────────── roj

const SUN: Tone = { base: '#f3bd45', light: '#fbdc86', shade: '#d98f2a' };

export function roj(dr: Drawing, rnd: Rnd): void {
  // twenty-one rays, as the sun of Kurdistan has: long gold ones with shorter red-orange ones between, each brushed
  // on with a wavering hand, and kept short enough that they can breathe out without touching the edge
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
    back += ray(deg + 360 / 42, 26, 45 + (i % 2) * 3, 7.4);
    long += ray(deg, 26, 51.6 + (i % 3) * 1.4, 8.6);
    lit += ray(deg - 2.2, 30, 46, 2);
  }
  layer(dr, 'back', () => paint(dr, back, '#d65a2e'));
  layer(dr, 'long', () => {
    paint(dr, long, '#e98b2e');
    paint(dr, lit, '#f6c55a', 0.85);
  });
  // a ring of warm dabs round the disc, then the disc itself, brushed round and round
  const disc = roundish(60, 60, 29, 29, rnd, { wobble: 0.012, tremor: 0.3, count: 36 });
  layer(dr, 'disc', () => {
    let halo = '';
    for (let i = 0; i < 42; i++) {
      const a = (i / 42) * Math.PI * 2;
      halo += touch(60 + Math.cos(a) * 31.6, 60 + Math.sin(a) * 31.6, 5, 2.2, (a * 180) / Math.PI + 90);
    }
    paint(dr, halo, '#f8cf6a');
    paint(dr, outline(disc), SUN.base);
  });
  // the brushwork on its face is cut to a round inside the disc, so it can churn slowly about the middle
  layer(dr, 'swirl', () => {
    within(dr, ellipse(60, 60, 27, 27), () => {
      let swirl = '';
      for (let i = 0; i < 26; i++) {
        const r = 6 + rnd() * 20;
        const a = rnd() * Math.PI * 2;
        const pts: Pt[] = [0, 0.5, 1].map((t): Pt => [60 + Math.cos(a + t * 0.7) * r, 60 + Math.sin(a + t * 0.7) * r]);
        swirl += brush(pts, 1.4 + rnd(), rnd, { start: 0.3, end: 0.1, peak: 0.5, count: 6 });
      }
      paint(dr, swirl, SUN.light, 0.5);
    });
  });
  layer(dr, 'face', () => {
    within(dr, outline(disc), () => {
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
  });
}
