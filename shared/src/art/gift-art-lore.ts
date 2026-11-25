/**
 * The gifts from the old stories (gift-art.ts): Kawa's hammer on its anvil, from the Newroz legend of the smith who
 * rose against the tyrant, and Şahmaran, queen of the serpents, as she is painted in the folk pictures, framed to hang
 * on a wall. Painted in the general folk manner, after no one artist's picture.
 */
import { type Drawing, type Pt } from './svg.js';
import { brush, ellipse, floor, FLOOR, lerp, outline, paint, polygon, roundish, runs, scaleAbout, shift, side, streaks, touch, tremble, within, type Rnd, type Tone } from './gift-paint.js';

// ────────────────────────────────────────────────────────────────────── kawa

const IRON: Tone = { base: '#4b4e57', light: '#8b909c', shade: '#2a2b31' };
const STUMP: Tone = { base: '#8a5a36', light: '#b37d4c', shade: '#5c381f' };
const HANDLE: Tone = { base: '#b0814e', light: '#d6a96f', shade: '#7a5430' };
const FIRE = ['#c33a28', '#ec7a2c', '#f7b63a', '#ffe4a0'];

/** A tongue of flame from `base` to `tip`, bent by `lean`. */
function flame(base: Pt, tip: Pt, width: number, lean: number, rnd: Rnd): string {
  return brush([base, [(base[0] + tip[0]) / 2 + lean, (base[1] + tip[1]) / 2], [tip[0] - lean * 0.6, tip[1] + (base[1] - tip[1]) * 0.2], tip], width, rnd, { start: 0.7, end: 0.02, peak: 0.18, count: 10 });
}

export function kawa(dr: Drawing, rnd: Rnd): void {
  floor(dr, rnd, 64, 109, 44, 5.4);
  // a small Newroz fire on its stones behind the anvil's horn
  let stones = '';
  for (const [x, y] of [[12, 103], [20, 105], [28, 103.4]] as const) stones += outline(roundish(x, y, 3.4, 2.2, rnd, { count: 8 }));
  paint(dr, stones, '#7e776c');
  const tongues: Array<[Pt, Pt, number, number]> = [[[10, 102], [7, 72], 9, -2], [[15, 102], [14, 54], 11, 3], [[20, 102], [22, 64], 10, 2], [[25, 102], [29, 78], 8, 2]];
  for (let i = 0; i < 4; i++) {
    let d = '';
    for (const [b, t, w, lean] of tongues.slice(i > 1 ? 1 : 0, i > 2 ? 3 : 4)) d += flame([b[0] + i * 0.4, b[1]], [t[0] + i * 0.4, t[1] + i * 9], w * (1 - i * 0.2), lean, rnd);
    paint(dr, d, FIRE[i]!);
  }
  // the stump the anvil is set on, its rings on top and its bark down the sides
  const stump = tremble([[27, 92], [27.6, 100], [26, 108], [42, 110.6], [61, 111.4], [80, 110.6], [96, 108], [94.4, 100], [95, 92]], rnd, 0.3);
  paint(dr, outline(stump), STUMP.base);
  within(dr, outline(stump), () => {
    paint(dr, streaks(rnd, [26, 92, 96, 112], 22, 92, 9, 0.9), STUMP.shade, 0.6);
    paint(dr, polygon([[78, 90], [98, 90], [98, 112], [82, 112]]), STUMP.shade, 0.5);
  });
  const ringTop = roundish(61, 92, 34, 6, rnd, { count: 24, tremor: 0.25 });
  paint(dr, outline(ringTop), STUMP.light);
  let rings = '';
  for (const k of [0.75, 0.5, 0.25]) rings += outline(roundish(61, 92, 34 * k, 6 * k, rnd, { count: 14, tremor: 0.2 }));
  dr.add(`<path d="${rings}" fill="none" stroke="${STUMP.base}" stroke-width="0.5" stroke-opacity="0.7"/>`);
  // the anvil: a horn reaching toward the fire, a flat face worn bright, a waist and broad feet; the fire's light on it
  const anvil = tremble([[22.6, 64.6], [30, 60.4], [40, 58], [66, 57.6], [94, 58], [96, 59], [96, 64], [90, 66], [81, 70], [79, 78], [90, 84], [92, 90], [92, 92.4], [30, 92.4], [30, 90], [32, 84], [44, 78], [43, 70], [38, 66.4], [30, 66.4]], rnd, 0.2);
  paint(dr, outline(anvil), IRON.base);
  within(dr, outline(anvil), () => {
    paint(dr, streaks(rnd, [22, 58, 96, 92], 20, 6, 8, 0.7), IRON.light, 0.25);
    paint(dr, polygon(tremble([[40, 57.6], [94, 57.8], [94, 60.2], [40, 60]], rnd, 0.15)), IRON.light);
    paint(dr, polygon([[86, 59], [89, 59], [89, 61.6], [86, 61.6]]), IRON.shade);
    paint(dr, brush([[23, 64.6], [28, 61.6], [34, 60]], 2.6, rnd, { start: 0.4, end: 0.2 }) + brush([[31, 89], [32, 84.6], [40, 79.6]], 2, rnd), '#e98b4e', 0.6);
  });
  side(dr, anvil, -2, -2.4, IRON.shade, { grow: 0.99 });
  // sparks thrown up where the hammer last came down, and embers fallen on the stump
  let sparks = '';
  let gold = '';
  for (let i = 0; i < 18; i++) {
    const a = ((-168 + rnd() * 150) * Math.PI) / 180;
    const r = 9 + rnd() * 22;
    const [x, y] = [58 + Math.cos(a) * r, 54 + Math.sin(a) * r * 0.9];
    const mark = touch(x, y, 1.6 + rnd() * 1.6, 0.6, (a * 180) / Math.PI);
    if (i % 3) gold += mark;
    else sparks += mark;
  }
  paint(dr, sparks, FIRE[1]!);
  paint(dr, gold, FIRE[2]!);
  let embers = '';
  for (const [x, y, r] of [[36, 93.4, 1.3], [86, 93.6, 1.1], [32, 104.6, 1.2], [90, 105.6, 1]] as const) embers += outline(roundish(x, y, r * 1.3, r, rnd, { count: 7, tremor: 0.1 }));
  paint(dr, embers, FIRE[0]!);
  paint(dr, ellipse(36.2, 93.2, 0.6, 0.5) + ellipse(86.2, 93.4, 0.5, 0.4), FIRE[2]!);
  // the hammer resting on the anvil's face: its handle worn smooth and bound in leather at the grip
  const grip: Pt[] = [[52, 50], [80, 38.2], [107, 26]];
  paint(dr, brush(shift(grip, 0.6, 1.2), 4.8, rnd, { start: 1, end: 0.9, peak: 0.5, count: 12 }), HANDLE.shade);
  const handle = brush(grip, 4.6, rnd, { start: 1, end: 0.86, peak: 0.5, count: 12 });
  paint(dr, handle, HANDLE.base);
  within(dr, handle, () => {
    paint(dr, brush(shift(grip, -0.4, -1.1), 1.3, rnd, { start: 0.6, end: 0.6, peak: 0.5, count: 10 }), HANDLE.light);
    paint(dr, streaks(rnd, [54, 26, 106, 50], 10, -24, 9, 0.4), HANDLE.shade, 0.5);
  });
  let wraps = '';
  for (let t = 0.66; t < 0.97; t += 0.045) {
    const p = lerp(grip[1]!, grip[2]!, (t - 0.5) * 2);
    wraps += brush([[p[0] - 1.2, p[1] - 2.8], [p[0] + 0.5, p[1] + 0.2], [p[0] + 1.6, p[1] + 2.6]], 1.6, rnd, { start: 0.8, end: 0.8, peak: 0.5, count: 4 });
  }
  paint(dr, wraps, '#5a3420');
  paint(dr, brush([[89, 33.4], [92, 37], [91, 41]], 0.7, rnd, { start: 1, end: 0.3, count: 5 }), '#5a3420');
  // the head: heavy forged iron, a flat striking face and a rounded peen, the hammer's blows on it
  const head = tremble(runs([[37.6, 46.2], [41, 45], [58, 43.2], [62, 44.4], [63.4, 49], [62.4, 53.6], [58.6, 55.6], [41.6, 57.4], [38, 56.6]], 2), rnd, 0.2);
  paint(dr, outline(head), IRON.base);
  within(dr, outline(head), () => {
    paint(dr, polygon(tremble([[37, 45], [62, 42.4], [62.6, 45.2], [37.6, 47.6]], rnd, 0.15)), IRON.light);
    paint(dr, polygon([[37, 45], [40.6, 45], [40.6, 58], [37, 58]]), IRON.light, 0.6);
    paint(dr, streaks(rnd, [40, 47, 60, 55], 7, -6, 4, 0.5), IRON.shade, 0.6);
  });
  side(dr, head, -1.4, -1.8, IRON.shade);
  paint(dr, ellipse(52.6, 43.4, 2.2, 0.9), HANDLE.light);
}

// ────────────────────────────────────────────────────────────────── şahmaran

const GILT: Tone = { base: '#d0a443', light: '#efcf7c', shade: '#9a7226' };
const SERPENT: Tone = { base: '#2f7d55', light: '#5ea87c', shade: '#1b5034' };
const LAPIS = '#1f3a7a';
const OUTLINE = '#1a120e';
const SKIN = '#f1d4b2';

export function sahmaran(dr: Drawing, rnd: Rnd): void {
  // the cord it hangs by from its nail, and its shadow on the wall
  paint(dr, brush([[29, 18], [44, 10.6], [60, 5.4]], 0.9, rnd, { start: 1, end: 1, peak: 0.5, count: 6 }) + brush([[91, 18], [76, 10.6], [60, 5.4]], 0.9, rnd, { start: 1, end: 1, peak: 0.5, count: 6 }), '#a8302c');
  paint(dr, ellipse(60, 5.4, 1.5, 1.5), '#3a2a22');
  paint(dr, ellipse(59.6, 5, 0.5, 0.5), '#b9b2a8');
  paint(dr, polygon([[24, 20], [100, 20], [100, 116], [24, 116]]), FLOOR, 0.18);
  // the frame: painted gold, red flowers and green leaves painted round it, a rosette at each corner
  const frame = tremble(runs([[22, 17], [98, 17], [98, 113], [22, 113]], 6), rnd, 0.2);
  paint(dr, outline(frame), GILT.base);
  within(dr, outline(frame), () => {
    paint(dr, polygon([[20, 15], [100, 15], [100, 18.4], [23.4, 18.4], [23.4, 115], [20, 115]]), GILT.light);
    paint(dr, polygon([[96.6, 18], [100, 18], [100, 115], [20, 115], [20, 111.6], [96.6, 111.6]]), GILT.shade);
  });
  let reds = '';
  let leaves = '';
  const ring = (t: number): Pt => {
    const L = 2 * (72 + 88);
    let d = t * L;
    if (d < 72) return [26 + d, 21];
    d -= 72;
    if (d < 88) return [94, 21 + d];
    d -= 88;
    if (d < 72) return [94 - d, 109];
    return [26, 109 - (d - 72)];
  };
  for (let i = 0; i < 40; i++) {
    const [x, y] = ring((i + 0.5) / 40);
    if (Math.abs(x - 26) < 2 && Math.abs(y - 21) < 6) continue;
    if (i % 2) reds += outline(roundish(x, y, 1.2, 1.2, rnd, { count: 6, tremor: 0.1 }));
    else leaves += touch(x, y, 2.6, 1.1, x === 26 || x === 94 ? 90 : 0);
  }
  for (const [x, y] of [[26, 21], [94, 21], [94, 109], [26, 109]] as const) reds += outline(roundish(x, y, 2.6, 2.6, rnd, { count: 8, tremor: 0.15 }));
  paint(dr, leaves, '#2f6e44');
  paint(dr, reds, '#b8302e');
  paint(dr, ellipse(26, 21, 0.9, 0.9) + ellipse(94, 21, 0.9, 0.9) + ellipse(94, 109, 0.9, 0.9) + ellipse(26, 109, 0.9, 0.9), GILT.light);
  // the picture: a ground of deep blue brushed in, small gold flowers scattered over it, a red line round it
  const picture = tremble(runs([[30, 25], [90, 25], [90, 105], [30, 105]], 6), rnd, 0.15);
  paint(dr, outline(picture), '#8a1f22');
  const ground = scaleAbout(picture, 60, 65, 0.965, 0.975);
  paint(dr, outline(ground), LAPIS);
  within(dr, outline(ground), () => {
    paint(dr, streaks(rnd, [30, 25, 90, 105], 24, 80, 14, 1.4), '#2b4e96', 0.6);
    let flowers = '';
    for (const [x, y] of [[36, 31], [84, 31], [38, 46], [82, 44], [35, 100], [85, 100], [46, 30], [74, 30]] as const) {
      for (let k = 0; k < 4; k++) flowers += touch(x + Math.cos((k * Math.PI) / 2) * 1.1, y + Math.sin((k * Math.PI) / 2) * 1.1, 2.2, 1.2, k * 90);
    }
    paint(dr, flowers, GILT.light);
  });
  // her serpent body coiled below her, green scaled with gold, its two tails rising to end in small snake heads that
  // turn toward her; each painted over a dark line, as the folk pictures are
  const coil: Pt[] = [[60, 69], [58, 78], [48, 86], [40, 94], [48, 101], [62, 101], [76, 97], [82, 89]];
  const left: Pt[] = [[44, 99], [35, 90], [33.4, 76], [36.4, 62]];
  const right: Pt[] = [[81.6, 90], [86, 80], [86.4, 68], [83.6, 60]];
  const body = (pts: Pt[], w: number, end: number): void => {
    paint(dr, brush(pts, w + 1.4, rnd, { start: 1, end: (end * w + 1.4) / (w + 1.4), peak: 0.05, count: 16 }), OUTLINE);
    const d = brush(pts, w, rnd, { start: 1, end, peak: 0.05, count: 16 });
    paint(dr, d, SERPENT.base);
    within(dr, d, () => {
      paint(dr, brush(shift(pts, 0, w * 0.32), w * 0.36, rnd, { start: 1, end: 0.6, peak: 0.05, count: 12 }), '#e0b84a');
      let scales = '';
      const line = pts;
      for (let i = 1; i < line.length; i++) {
        for (const t of [0.25, 0.75]) {
          const p = lerp(line[i - 1]!, line[i]!, t);
          scales += touch(p[0], p[1] - w * 0.12, w * 0.32, w * 0.2, (Math.atan2(line[i]![1] - line[i - 1]![1], line[i]![0] - line[i - 1]![0]) * 180) / Math.PI + 90);
        }
      }
      paint(dr, scales, SERPENT.light);
    });
  };
  body(left, 5.2, 0.5);
  body(right, 5.2, 0.5);
  body(coil, 9.6, 0.62);
  const snake = (x: number, y: number, facing: number): void => {
    paint(dr, outline(roundish(x, y, 3.6, 2.5, rnd, { count: 10, tremor: 0.1, rot: facing < 0 ? -20 : 20 })), OUTLINE);
    paint(dr, outline(roundish(x, y, 3, 2, rnd, { count: 10, tremor: 0.1, rot: facing < 0 ? -20 : 20 })), SERPENT.light);
    paint(dr, ellipse(x + facing * 0.9, y - 0.5, 0.55, 0.55), OUTLINE);
    paint(dr, brush([[x + facing * 3.2, y + 0.4], [x + facing * 5, y + 0.2], [x + facing * 5.8, y - 0.6]], 0.5, rnd, { start: 1, end: 0.6, count: 4 }) + brush([[x + facing * 5, y + 0.2], [x + facing * 5.8, y + 1]], 0.5, rnd, { count: 4 }), '#d8352e');
    paint(dr, ellipse(x - facing * 0.6, y - 2.4, 0.8, 0.8), GILT.light);
  };
  snake(37.4, 59.6, 1);
  snake(82.6, 57.6, -1);
  // the queen: her long dark hair behind her, a red bodice with a gold necklace, her arms and folded hands
  const hair = tremble([[52, 38], [48.6, 48], [47, 58], [44.6, 69], [51, 70.6], [52.6, 61], [67.4, 61], [69, 70.6], [75.4, 69], [73, 58], [71.4, 48], [68, 38], [60, 33.6]], rnd, 0.25);
  paint(dr, outline(scaleAbout(hair, 60, 52, 1.04)), OUTLINE);
  paint(dr, outline(hair), '#2a1a14');
  within(dr, outline(hair), () => paint(dr, streaks(rnd, [44, 36, 76, 72], 12, 84, 9, 0.5), '#4a3226', 0.8));
  const bodice = tremble([[50.4, 60.6], [54, 58.4], [66, 58.4], [69.6, 60.6], [71, 70], [60, 72.4], [49, 70]], rnd, 0.2);
  paint(dr, outline(scaleAbout(bodice, 60, 65, 1.06)), OUTLINE);
  paint(dr, outline(bodice), '#b8302e');
  within(dr, outline(bodice), () => {
    paint(dr, brush([[51, 61], [55, 66], [57.6, 69.4]], 3, rnd, { start: 0.9, end: 0.8 }) + brush([[69, 61], [65, 66], [62.4, 69.4]], 3, rnd, { start: 0.9, end: 0.8 }), '#962220');
    paint(dr, brush([[50, 70.4], [60, 72], [70, 70.4]], 1.2, rnd, { start: 1, end: 1, peak: 0.5 }), GILT.base);
  });
  paint(dr, outline(roundish(57.4, 69.6, 1.7, 1.3, rnd, { count: 8, tremor: 0.1 })) + outline(roundish(62.6, 69.6, 1.7, 1.3, rnd, { count: 8, tremor: 0.1 })), SKIN);
  paint(dr, polygon(tremble([[57.8, 51.6], [62.2, 51.6], [62.6, 58.6], [57.4, 58.6]], rnd, 0.1)), SKIN);
  paint(dr, brush([[54.6, 58.6], [60, 61.6], [65.4, 58.6]], 1, rnd, { start: 1, end: 1, peak: 0.5 }), GILT.light);
  paint(dr, ellipse(60, 62.6, 1.1, 1.3), '#2f8a5a');
  // her face, gentle and still, painted plainly in the old way: almond eyes, fine brows, a small red mouth
  const face = roundish(60, 46, 6.4, 7.8, rnd, { count: 16, wobble: 0.01, tremor: 0.1 });
  paint(dr, outline(scaleAbout(face, 60, 46, 1.08)), OUTLINE);
  paint(dr, outline(face), SKIN);
  paint(dr, polygon(tremble([[53.4, 43], [55, 38.6], [60, 37.4], [65, 38.6], [66.6, 43], [63, 40.8], [57, 40.8]], rnd, 0.1)), '#2a1a14');
  paint(dr, touch(56.6, 49, 2.6, 1.4, 0) + touch(63.4, 49, 2.6, 1.4, 0), '#e8998a', 0.55);
  paint(dr, touch(57.4, 45.6, 3, 1.7, -4) + touch(62.6, 45.6, 3, 1.7, 4), '#20140f');
  paint(dr, ellipse(57.7, 45.3, 0.35, 0.35) + ellipse(62.9, 45.3, 0.35, 0.35), '#fbf3e4');
  paint(dr, brush([[55.6, 43.4], [57.4, 42.6], [59, 43.2]], 0.45, rnd, { count: 4 }) + brush([[61, 43.2], [62.6, 42.6], [64.4, 43.4]], 0.45, rnd, { count: 4 }) + brush([[60.2, 45.8], [60.6, 48.4], [59.8, 48.8]], 0.35, rnd, { count: 4 }), '#5a3426');
  paint(dr, touch(60, 51.2, 2.4, 1.1, 0), '#c23a36');
  // her crown: three points of gold set with red and green
  const crown = tremble([[52.8, 39.4], [52.6, 33.4], [55.6, 36.2], [60, 30.4], [64.4, 36.2], [67.4, 33.4], [67.2, 39.4]], rnd, 0.1);
  paint(dr, polygon(scaleAbout(crown, 60, 35, 1.08)), OUTLINE);
  paint(dr, polygon(crown), GILT.base);
  paint(dr, polygon([[52.8, 38], [67.2, 38], [67.2, 39.4], [52.8, 39.4]]), GILT.light);
  paint(dr, ellipse(60, 36, 1.1, 1.1), '#c23a36');
  paint(dr, ellipse(55.4, 37.6, 0.7, 0.7) + ellipse(64.6, 37.6, 0.7, 0.7), '#2f8a5a');
}
