/**
 * The houses and boats among the gifts (gift-art.ts): a rowing boat with its lantern, a village house, a kelek raft on
 * the river, the nomads' black tent, a sailing ship, a stone mansion with arches and a castle on its hill. The dearer the
 * gift, the more there is in it to find.
 */
import { type Drawing, type Pt } from './svg.js';
import { along, blade, brush, ellipse, form, lerp, outline, paint, polygon, roundish, runs, shift, side, streaks, touch, tremble, within, type Rnd, type Tone } from './gift-paint.js';

// ─────────────────────────────────────────────────────────────────── belem

const WATER: Tone = { base: '#3f7c93', light: '#80b4c3', shade: '#2a5b70' };
const HULL: Tone = { base: '#a8452f', light: '#c96b4c', shade: '#76291f' };
const WOOD: Tone = { base: '#c99a62', light: '#e2bb84', shade: '#7c4f30' };
const LANTERN = '#ffd46b';

/**
 * A strip of water from x0 to x1 about row y, `h` deep, as a torn strip of paper: both edges ruffled in small uneven
 * waves, its ends drawn out to points.
 */
function waterStrip(rnd: Rnd, x0: number, x1: number, y: number, h: number, wave = 0.7): string {
  const top: Pt[] = [];
  const bottom: Pt[] = [];
  const [p1, p2, p3] = [rnd() * 6.3, rnd() * 6.3, rnd() * 6.3];
  const steps = Math.round((x1 - x0) / 1.5);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const half = (h / 2) * Math.pow(Math.sin(Math.PI * t), 0.3);
    const ruffle = (ph: number, len: number): number => (Math.sin(x / len + ph) + 0.35 * Math.sin(x / (len * 0.47) + ph * 2)) * wave * Math.min(1, half);
    top.push([x, y - half + ruffle(p1, 2.6)]);
    bottom.push([x, y + half + ruffle(p2, 3.4) * 0.6 + Math.sin(x / 9 + p3) * 0.3]);
  }
  return outline(tremble([...top, ...bottom.reverse()], rnd, 0.2));
}

export function belem(dr: Drawing, rnd: Rnd): void {
  // drawn a fifth larger about its middle, so the boat holds its own at the size of a chat line
  dr.add('<g transform="translate(60 72) scale(1.2) translate(-60 -72)">');
  // the water in torn strips: the far one pale with the sky in it, the near one lapping over the boat's foot
  paint(dr, waterStrip(rnd, 12, 108, 74.6, 8.6, 0.5), WATER.light);

  // the hull: gunwale, keel and a raked transom, the bow lifting; inside it the far gunwale, the boards and two thwarts
  const gunwale: Pt[] = [[16, 66], [32, 70.4], [52, 72.4], [72, 71], [90, 66.4], [104.6, 56.6]];
  const keel: Pt[] = [[104.6, 56.6], [97, 69.6], [83, 79.4], [62, 84], [40, 83.6], [24, 80.6], [18.6, 77.6]];
  const farGunwale: Pt[] = [[17.4, 62.6], [34, 65], [54, 66], [74, 64.6], [92, 60.6], [104.6, 56.6]];
  const hull = tremble([...along(gunwale, 18), ...along(keel, 18).slice(1), [17, 72]], rnd, 0.25);
  const inside = tremble([...along(farGunwale, 16), ...along(gunwale, 16).reverse().slice(1)], rnd, 0.2);
  paint(dr, outline(inside), WOOD.shade);
  within(dr, outline(inside), () => {
    paint(dr, outline(tremble(runs([[46.6, 74], [47.4, 63], [53.4, 63.4], [52.6, 74]], 1.6), rnd, 0.2)), WOOD.base);
    paint(dr, outline(tremble(runs([[20.6, 72], [21.6, 60], [26.4, 60.6], [25.6, 72]], 1.6), rnd, 0.2)), WOOD.base);
    paint(dr, brush([[19, 63.4], [56, 66.8], [100, 58.4]], 0.6, rnd), WOOD.light, 0.6);
  });
  // a coil of rope on the stern thwart
  for (const [rx, ry] of [[3.2, 1.3], [2, 0.8]] as const) {
    const coil: Pt[] = [];
    for (let i = 0; i <= 16; i++) coil.push([23.6 + rx * Math.cos((i / 16) * Math.PI * 2), 63.4 + ry * Math.sin((i / 16) * Math.PI * 2)]);
    paint(dr, brush(coil, 0.9, rnd, { start: 0.9, end: 0.9, peak: 0.5, count: 20 }), '#d8b06a');
  }
  paint(dr, outline(hull), HULL.base);
  within(dr, outline(hull), () => {
    paint(dr, brush(shift(gunwale, 0, 3.2), 5, rnd, { start: 0.9, end: 0.5, peak: 0.5, count: 24 }), HULL.light);
    paint(dr, brush(shift(along(keel, 12).reverse(), 0, -0.4), 6, rnd, { start: 0.3, end: 0.6, peak: 0.5, count: 24 }), HULL.shade);
    for (const dy of [6.4, 10.4]) paint(dr, brush(shift(gunwale.slice(0, 5), 0.4, dy), 0.6, rnd, { start: 0.4, end: 0.2, peak: 0.5, count: 20 }), HULL.shade, 0.8);
    paint(dr, streaks(rnd, [18, 68, 100, 84], 26, -6, 9, 0.7), HULL.shade, 0.3);
  });
  paint(dr, brush(gunwale, 2.2, rnd, { start: 0.9, end: 0.6, peak: 0.4, count: 24 }), '#e9d4a8');

  // the oar across the gunwale in its rowlock
  paint(dr, brush([[47, 62.6], [34, 70.6], [21, 81]], 1.9, rnd, { start: 0.9, end: 0.9, peak: 0.5 }), WOOD.light);
  paint(dr, brush([[47, 63.4], [34, 71.4], [21, 81.8]], 0.7, rnd, { start: 0.9, end: 0.9, peak: 0.5 }), WOOD.shade, 0.8);
  paint(dr, ellipse(34.2, 70.8, 1, 0.9), '#3b2f2f');

  // the near water over the hull's foot: the boat's dark in it, ripples, the lantern's gold, and a darker lap in front
  const near = waterStrip(rnd, 11, 109, 88.6, 15.4, 0.8);
  paint(dr, near, WATER.base);
  within(dr, near, () => {
    let dark = '';
    for (const [x0, x1, y, w] of [[24, 88, 83.4, 1.9], [30, 80, 86.8, 1.6], [38, 72, 90, 1.3]] as const) dark += brush([[x0, y], [(x0 + x1) / 2, y + 0.4], [x1, y]], w, rnd, { start: 0.3, end: 0.3, peak: 0.5 });
    paint(dr, dark, WATER.shade);
    paint(dr, streaks(rnd, [2, 81, 118, 96], 22, 0, 10, 0.8), WATER.light, 0.3);
    let ripples = '';
    for (const [x, y, l] of [[10, 90.6, 9], [88, 89.6, 12], [70, 93.6, 10], [28, 93, 8], [104, 84.6, 6], [50, 94.4, 7], [16, 85.4, 5]] as const) {
      ripples += brush([[x - l / 2, y], [x, y - 0.3], [x + l / 2, y]], 1, rnd, { start: 0.2, end: 0.2, peak: 0.5 });
    }
    paint(dr, ripples, WATER.light);
    let gold = '';
    for (const [y, l] of [[83.4, 5], [86.4, 4.2], [89.4, 3.4], [92.4, 2.4], [95, 1.6]] as const) gold += brush([[101 - l / 2, y], [101, y - 0.2], [101 + l / 2, y]], 1.1, rnd, { start: 0.3, end: 0.3, peak: 0.5 });
    paint(dr, gold, '#f2c35c');
    paint(dr, brush([[16.6, 81.6], [21.4, 80.8], [26, 81.8]], 0.9, rnd, { start: 0.3, end: 0.3, peak: 0.5 }), WATER.light);
  });
  paint(dr, waterStrip(rnd, 20, 100, 97.2, 4.4, 0.5), WATER.shade);

  // the lantern at the bow on a crooked pole, and its light on the rail below it
  paint(dr, brush([[94, 64.4], [95.4, 50], [96.4, 37.6], [99.2, 35.2], [102.2, 36.6]], 1.3, rnd, { start: 1, end: 0.8, peak: 0.5 }), '#5a3a26');
  paint(dr, brush([[102.2, 36.8], [102.2, 39.4]], 0.4, rnd, { start: 1, end: 1 }), '#3b2f2f');
  paint(dr, outline(tremble(runs([[98.8, 50.4], [98.8, 43.2], [105.2, 43.2], [105.2, 50.4]], 1.2), rnd, 0.15)), LANTERN);
  paint(dr, outline(roundish(102, 47.2, 1.1, 1.7, rnd, { wobble: 0.05, count: 10 })), '#f08a32');
  paint(dr, outline(tremble([[98, 43.6], [102, 39.6], [106, 43.6]], rnd, 0.1)), '#3b2f2f');
  paint(dr, brush([[99.4, 43.4], [99.4, 50.4]], 0.5, rnd, { start: 1, end: 1 }) + brush([[104.6, 43.4], [104.6, 50.4]], 0.5, rnd, { start: 1, end: 1 }), '#3b2f2f');
  paint(dr, outline(roundish(102, 50.9, 3.6, 1, rnd, { count: 12 })), '#3b2f2f');
  paint(dr, brush([[88, 66.6], [96, 63.4], [102, 59.4]], 1.4, rnd), '#f2c35c', 0.7);
  dr.add('</g>');
}

// ───────────────────────────────────────────────────────────────── mala gund

const MUD: Tone = { base: '#d8a46a', light: '#edc58c', shade: '#ae7845' };
const EARTH: Tone = { base: '#cdab7b', light: '#e2c596', shade: '#a98656' };
const DOOR: Tone = { base: '#8a5634', light: '#a86d44', shade: '#5f3820' };

export function mal(dr: Drawing, rnd: Rnd): void {
  // the ground round it, the house's shadow on it, and tufts of grass
  const ground = roundish(60, 101, 55, 11, rnd, { wobble: 0.04, tremor: 0.6, count: 36 });
  paint(dr, outline(ground), EARTH.base);
  within(dr, outline(ground), () => {
    paint(dr, outline(tremble(runs([[77, 100.5], [101.5, 91.6], [116, 95.6], [92, 106]]), rnd, 0.6)), EARTH.shade);
    paint(dr, outline(roundish(38, 103.6, 14, 3, rnd)), EARTH.light);
  });
  // the walls: the face toward us in the light, the side in shade; the flat earth roof on top with its parapet
  const front = tremble(runs([[20, 45], [76, 48], [77.5, 100.5], [20.5, 98.6]]), rnd, 0.55);
  const sideWall = tremble(runs([[76, 48], [101, 39], [101.6, 91.6], [77.5, 100.5]]), rnd, 0.55);
  const roof = tremble(runs([[19.6, 45], [45, 36.6], [101.2, 39], [76, 48]]), rnd, 0.45);
  paint(dr, outline(sideWall), MUD.shade);
  within(dr, outline(sideWall), () => paint(dr, streaks(rnd, [78, 42, 101, 98], 9, -18, 7, 1), MUD.base, 0.3));
  paint(dr, outline(front), MUD.base);
  within(dr, outline(front), () => {
    paint(dr, streaks(rnd, [22, 54, 76, 97], 14, 2, 8, 1.2), MUD.light, 0.5);
    let straw = '';
    for (let i = 0; i < 16; i++) {
      const x = 23 + rnd() * 52;
      const y = 53 + rnd() * 44;
      const a = (rnd() - 0.5) * 1.2;
      straw += brush([[x, y], [x + Math.cos(a) * 1.8, y + Math.sin(a) * 1.8]], 0.35, rnd, { count: 4 });
    }
    paint(dr, straw, '#f3dca3', 0.85);
    paint(dr, brush([[18, 50], [48, 51.6], [78, 52.6]], 2.4, rnd, { start: 0.8, end: 0.8, peak: 0.5 }), MUD.shade, 0.7);
  });
  paint(dr, outline(roof), MUD.light);
  paint(dr, brush([[45.6, 37.2], [74, 38], [100.6, 39.6]], 1.3, rnd, { start: 0.8, end: 0.8, peak: 0.5 }), MUD.shade, 0.8);
  paint(dr, brush([[19.4, 44.8], [34, 45.6], [48, 46.2], [62, 47], [76.2, 48]], 2, rnd, { start: 0.9, end: 0.9, peak: 0.5, count: 26 }), MUD.light);
  // a stack of hay on the roof against the winter, and a clay chimney with its smoke
  const hay = roundish(32.6, 38.6, 9, 5.6, rnd, { wobble: 0.06 });
  form(dr, hay, { base: '#ddb764', light: '#f0d38c', shade: '#b28c3e' }, [0, -2], [0.6, 1.6]);
  within(dr, outline(hay), () => paint(dr, streaks(rnd, [24, 33, 41, 44], 12, 70, 4, 0.5), '#b28c3e', 0.6));
  const chimney = tremble(runs([[55.6, 30.8], [61, 30.6], [61.4, 40.6], [55.2, 40.6]], 1.6), rnd, 0.25);
  paint(dr, outline(chimney), MUD.base);
  within(dr, outline(chimney), () => paint(dr, outline(runs([[58.6, 29], [63, 29], [63, 42], [58.6, 42]], 2)), MUD.shade));
  paint(dr, outline(roundish(58.3, 30.8, 2.8, 0.9, rnd, { count: 12 })), '#4a3326');
  for (const [pts, w] of [[[[58, 29.6], [55.6, 23], [59, 16.6], [55, 9.6], [57.6, 3.6]], 2.6], [[[59.6, 29], [62.8, 23.4], [61, 18.6]], 1.6]] as Array<[Pt[], number]>) {
    paint(dr, brush(shift(pts, 0.6, 0.2), w, rnd, { start: 0.6, end: 0.05, peak: 0.3 }), '#a99fae', 0.8);
    paint(dr, brush(pts, w, rnd, { start: 0.6, end: 0.05, peak: 0.3 }), '#d7d0da', 0.95);
  }
  // the ends of the poplar beams that carry the roof, under the parapet
  let ends = '';
  let lit = '';
  for (let i = 0; i < 6; i++) {
    const x = 25 + i * 9.2;
    const y = 49.6 + (x - 20) * 0.054;
    ends += ellipse(x, y, 1.5, 1.4);
    lit += ellipse(x - 0.4, y - 0.4, 0.6, 0.55);
  }
  for (const [x, y] of [[82.6, 45.8], [89.6, 43.2], [96.4, 40.8]] as const) ends += ellipse(x, y, 0.9, 1.3);
  paint(dr, ends, '#6a4428');
  paint(dr, lit, '#a87b4e');

  // the door: planks under a lintel, an iron ring to knock with, a stone step
  paint(dr, outline(tremble(runs([[30.4, 66.4], [47.8, 66.8], [47.8, 69.8], [30.2, 69.6]], 1.6), rnd, 0.3)), DOOR.shade);
  paint(dr, brush([[30.6, 66.8], [39, 67], [47.4, 67.2]], 0.8, rnd), DOOR.light);
  const door = tremble(runs([[32, 69.8], [44.8, 70], [45, 99.4], [32.2, 99.2]], 1.8), rnd, 0.3);
  paint(dr, outline(door), DOOR.base);
  within(dr, outline(door), () => {
    paint(dr, brush([[36.4, 70], [36.3, 85], [36.4, 99.4]], 0.6, rnd, { start: 1, end: 1 }) + brush([[40.6, 70], [40.7, 85], [40.6, 99.4]], 0.6, rnd, { start: 1, end: 1 }), DOOR.shade);
    paint(dr, brush([[33, 70.6], [33.2, 85], [33, 99]], 1.6, rnd, { start: 1, end: 1, peak: 0.5 }), DOOR.shade);
    paint(dr, brush([[38.4, 71], [38.5, 84], [38.4, 98]], 0.9, rnd), DOOR.light, 0.7);
  });
  dr.add(`<circle cx="42.8" cy="85.2" r="1.1" fill="none" stroke="#3a2a22" stroke-width="0.5"/>`);
  paint(dr, outline(roundish(38.6, 100.4, 9.2, 1.8, rnd, { count: 16 })), '#e3dccb');
  paint(dr, brush([[30.4, 101.4], [38.6, 102.2], [47, 101.4]], 0.9, rnd), '#c4b9a2');

  // the window, its frame painted blue, lamplight inside, geraniums in a pot on its sill
  const frame = tremble(runs([[55.4, 57.4], [68.6, 58], [68.6, 70.6], [55.4, 70.2]], 1.6), rnd, 0.25);
  paint(dr, outline(frame), '#3d6a94');
  const glass = tremble(runs([[57, 59.2], [67, 59.6], [67, 69], [57, 68.6]], 1.6), rnd, 0.2);
  paint(dr, outline(glass), '#f2b54e');
  within(dr, outline(glass), () => paint(dr, outline([[57, 59], [61.6, 59.2], [57, 64.6]]), '#f8e8cc'));
  paint(dr, brush([[62, 59.4], [62, 64], [62, 68.8]], 0.9, rnd, { start: 1, end: 1 }) + brush([[57, 64], [62, 64.1], [67, 64.2]], 0.9, rnd, { start: 1, end: 1 }), '#3d6a94');
  paint(dr, outline(tremble(runs([[53.8, 70.4], [70.2, 70.8], [70.2, 72.6], [53.8, 72.2]], 1.6), rnd, 0.2)), '#94643a');
  const pot = tremble(runs([[58.4, 66.2], [63.4, 66.2], [62.6, 70.6], [59.2, 70.6]], 1.2), rnd, 0.15);
  form(dr, pot, { base: '#c4643a', light: '#de8558', shade: '#93442a' }, [-1, 0], [0.5, 0]);
  let leaves = '';
  for (const [x, y, deg] of [[58.4, 65.2, -30], [61, 64.6, 10], [63.4, 65.4, 40], [60, 63, -60]] as const) leaves += outline(roundish(x, y, 1.6, 1.1, rnd, { count: 8, rot: deg, tremor: 0.1 }));
  paint(dr, leaves, '#5f8746');
  let petals = '';
  for (const [x, y] of [[59.2, 62.2], [61.8, 61.6], [60.6, 60.2], [63, 63]] as const) petals += outline(roundish(x, y, 1.15, 1.05, rnd, { count: 8, tremor: 0.1 }));
  paint(dr, petals, '#d43a3a');
  paint(dr, ellipse(60.4, 60.8, 0.35, 0.3) + ellipse(61.4, 61.4, 0.35, 0.3), '#f6a49a');

  // the ladder up to the roof, leant on the parapet, its poles standing above it
  const rails: Pt[][] = [
    [[84.2, 104], [83.2, 70], [82.2, 32.4]],
    [[91.6, 102.2], [90.4, 68], [89.2, 31.4]],
  ];
  let rungs = '';
  for (let y = 98; y > 36; y -= 6.6) {
    const t0 = (104 - y) / (104 - 32.4);
    const t1 = (102.2 - y) / (102.2 - 31.4);
    rungs += brush([[84.2 - t0 * 2, y], [87.6 - (t0 + t1), y - 0.5], [91.6 - t1 * 2.4, y - 0.6]], 1.1, rnd, { start: 0.9, end: 0.9, peak: 0.5, count: 6 });
  }
  paint(dr, rungs, WOOD.shade);
  for (const r of rails) {
    paint(dr, brush(r, 1.7, rnd, { start: 1, end: 0.85, peak: 0.5, count: 20 }), WOOD.base);
    paint(dr, brush(shift(r, -0.4, 0), 0.6, rnd, { start: 1, end: 0.85, peak: 0.5, count: 20 }), WOOD.light);
  }
  // tufts of grass at the walls' feet
  let grass = '';
  for (const [x, y, s] of [[13, 100, 1], [19.4, 103.6, 0.8], [104, 96, 1], [110.4, 99.4, 0.9], [72, 106, 0.7]] as const) {
    for (const a of [-0.5, -0.15, 0.2, 0.5]) grass += brush([[x, y], [x + Math.sin(a) * 2.5 * s, y - 2.8 * s], [x + Math.sin(a) * 4.6 * s, y - 4.8 * s]], 0.9 * s, rnd, { start: 1, end: 0.05, count: 6 });
  }
  paint(dr, grass, '#7d9a52');
}

/** A cut-paper cylinder from (x0, top) to (x1, bottom): lit on its left, in shade on its right, the base between. */
function drum(dr: Drawing, rnd: Rnd, x0: number, x1: number, top: number, bottom: number, tone: Tone): Pt[] {
  const w = x1 - x0;
  const pts = tremble(runs([[x0, top], [x1, top], [x1, bottom], [x0 + w / 2, bottom + w * 0.12], [x0, bottom]], 2.5), rnd, 0.2);
  paint(dr, outline(pts), tone.base);
  within(dr, outline(pts), () => {
    paint(dr, polygon([[x0 - 1, top - 1], [x0 + w * 0.26, top - 1], [x0 + w * 0.26, bottom + w], [x0 - 1, bottom + w]]), tone.light);
    paint(dr, polygon([[x0 + w * 0.7, top - 1], [x1 + 1, top - 1], [x1 + 1, bottom + w], [x0 + w * 0.7, bottom + w]]), tone.shade);
  });
  return pts;
}

/** Battlements along a wall top from (x0, y) to (x1, y): merlons `w` wide with gaps between, lit on top. */
function battlements(dr: Drawing, rnd: Rnd, x0: number, x1: number, y: number, w: number, h: number, tone: Tone): void {
  let merlons = '';
  let tops = '';
  for (let x = x0; x + w <= x1 + 0.01; x += w * 1.8) {
    merlons += polygon(tremble([[x, y], [x + w, y], [x + w, y - h], [x, y - h]], rnd, 0.12));
    tops += polygon([[x, y - h], [x + w, y - h], [x + w, y - h + 0.8], [x, y - h + 0.8]]);
  }
  paint(dr, merlons, tone.base);
  paint(dr, tops, tone.light);
}

/** A pointed arch's opening, `w` wide, springing at `spring` and peaking `rise` above it, standing on `foot`. */
function pointed(x: number, w: number, spring: number, rise: number, foot: number): Pt[] {
  const pts: Pt[] = [[x - w / 2, foot], [x - w / 2, spring]];
  for (let i = 1; i < 6; i++) {
    const t = i / 6;
    pts.push([x - w / 2 + (w / 2) * Math.sin((t * Math.PI) / 2), spring - rise * Math.pow(Math.sin((t * Math.PI) / 2), 1.6)]);
  }
  pts.push([x, spring - rise]);
  for (let i = 5; i > 0; i--) {
    const t = i / 6;
    pts.push([x + w / 2 - (w / 2) * Math.sin((t * Math.PI) / 2), spring - rise * Math.pow(Math.sin((t * Math.PI) / 2), 1.6)]);
  }
  pts.push([x + w / 2, spring], [x + w / 2, foot]);
  return pts;
}

// ───────────────────────────────────────────────────────────────────── kelek

const POPLAR: Tone = { base: '#c49a62', light: '#e0bc86', shade: '#8a6438' };
const LEATHER: Tone = { base: '#6a4430', light: '#9a6a4a', shade: '#3e2518' };
const BURLAP: Tone = { base: '#d6c096', light: '#ecdcb8', shade: '#a48e5c' };

export function kelek(dr: Drawing, rnd: Rnd): void {
  // the river in torn strips
  paint(dr, waterStrip(rnd, 6, 114, 64, 9, 0.5), WATER.light);
  // the goatskins it floats on, blown up and tied, half in the water
  let skins = '';
  let lit = '';
  let nubs = '';
  for (let i = 0; i < 9; i++) {
    const [x, y] = [17 + i * 10.6, 78.4 + (i % 2) * 1.2];
    skins += outline(roundish(x, y, 6.2, 4.6, rnd, { wobble: 0.08, count: 12 }));
    lit += touch(x - 2, y - 1.8, 5, 1.4, -10);
    nubs += touch(x + 4.8, y - 3.4, 2.6, 1.4, -50);
  }
  paint(dr, skins + nubs, LEATHER.base);
  paint(dr, lit, LEATHER.light);
  // the platform: poplar poles laid side by side and lashed across, their cut ends to us
  for (let i = 0; i < 6; i++) {
    const y = 60 + i * 2.9;
    const x0 = 15 + i * 0.9;
    paint(dr, brush([[x0, y], [60, y - 0.4], [104 - i * 0.6, y - 1]], 3.8, rnd, { start: 0.95, end: 0.9, peak: 0.5, count: 10 }), i % 2 ? POPLAR.base : POPLAR.light);
    paint(dr, brush([[x0 + 2, y + 1.2], [60, y + 0.8], [102 - i * 0.6, y + 0.2]], 0.9, rnd, { start: 0.6, end: 0.6, peak: 0.5, count: 8 }), POPLAR.shade, 0.8);
    paint(dr, ellipse(x0, y, 1.9, 1.9), '#ead3a4');
    paint(dr, ellipse(x0, y, 0.8, 0.8), POPLAR.shade);
  }
  let lashing = '';
  for (const x of [32, 58, 86]) lashing += brush([[x, 57.6], [x + 1, 66], [x + 2, 76]], 0.9, rnd, { start: 1, end: 1, peak: 0.5, count: 6 });
  paint(dr, lashing, '#6e5434');
  // its load: sacks of wool and a crate of pomegranates for the market downriver
  for (const [x, y, rx, ry] of [[46, 52, 7, 6.4], [36, 55, 8, 6.6]] as const) {
    const sack = roundish(x, y, rx, ry, rnd, { wobble: 0.06 });
    form(dr, sack, BURLAP, [-1.4, -1.2], [1, 1]);
    paint(dr, brush([[x - 1.6, y - ry + 0.6], [x, y - ry - 1.6], [x + 1.6, y - ry + 0.4]], 1.2, rnd), BURLAP.shade);
  }
  const crate = tremble(runs([[62, 46], [80, 45], [80.6, 58.6], [61.4, 59]], 3), rnd, 0.2);
  form(dr, crate, POPLAR, [-1.2, 0], [0.8, 0]);
  paint(dr, brush([[62, 52], [71, 51.6], [80.4, 51.4]], 0.8, rnd) + brush([[70.8, 45.6], [71, 52], [71, 58.6]], 0.8, rnd), POPLAR.shade);
  let fruit = '';
  let shine = '';
  for (const [x, y] of [[65, 44.4], [70, 43.6], [75, 44.2], [67.6, 41.4], [72.6, 41]] as const) {
    fruit += outline(roundish(x, y, 2.6, 2.4, rnd, { count: 8, tremor: 0.15 }));
    shine += touch(x - 0.8, y - 0.8, 1.4, 0.5, -40);
  }
  paint(dr, fruit, '#b8313c');
  paint(dr, shine, '#e06a6e');
  // the long sweep it is steered with, out over the stern
  paint(dr, brush([[92, 48], [102, 60], [110, 74]], 1.6, rnd, { start: 1, end: 0.8, peak: 0.5 }), POPLAR.light);
  paint(dr, outline(tremble(blade([108, 70], [114.6, 82], 4.4, { at: 0.6, point: 0.1 }), rnd, 0.15)), POPLAR.base);
  // the near water over the skins' bellies, the raft's dark in it, and ripples
  const near = waterStrip(rnd, 4, 116, 85, 12, 0.8);
  paint(dr, near, WATER.base);
  within(dr, near, () => {
    let dark = '';
    for (const [x0, x1, y] of [[16, 104, 82], [22, 96, 85.4], [30, 84, 88.6]] as const) dark += brush([[x0, y], [(x0 + x1) / 2, y + 0.4], [x1, y]], 1.6, rnd, { start: 0.3, end: 0.3, peak: 0.5 });
    paint(dr, dark, WATER.shade);
    paint(dr, streaks(rnd, [6, 80, 114, 90], 16, 0, 9, 0.8), WATER.light, 0.4);
  });
  paint(dr, waterStrip(rnd, 16, 104, 92.6, 4, 0.5), WATER.shade);
}

// ─────────────────────────────────────────────────────────────────── reşmal

const HAIR: Tone = { base: '#302824', light: '#4d423c', shade: '#1c1613' };

export function kon(dr: Drawing, rnd: Rnd): void {
  // the ground it is pitched on, and the ropes out to their pegs
  const ground = roundish(60, 100, 56, 9, rnd, { wobble: 0.04, tremor: 0.6, count: 30 });
  paint(dr, outline(ground), '#c7a979');
  side(dr, ground, 0, -1.6, '#a68a5c');
  let ropes = '';
  for (const [a, b] of [[[14, 58], [3, 98]], [[30, 46], [10, 100]], [[106, 56], [117, 96]], [[88, 44], [110, 100]]] as Array<[Pt, Pt]>) ropes += brush([a, lerp(a, b, 0.5), b], 0.45, rnd, { start: 1, end: 1, peak: 0.5, count: 4 });
  paint(dr, ropes, '#8a7a62');
  paint(dr, brush([[2, 98], [4, 99.6]], 1.2, rnd) + brush([[9, 100], [11, 101.6]], 1.2, rnd) + brush([[116, 96], [118, 97.6]], 1.2, rnd) + brush([[109, 100], [111, 101.6]], 1.2, rnd), '#5a4632');
  // inside, in its shade: a kilim on the floor, cushions against the back, a copper jug
  const inside = tremble(runs([[22, 64], [98, 62], [99, 97], [21, 98]], 4), rnd, 0.3);
  paint(dr, outline(inside), '#3e322b');
  within(dr, outline(inside), () => {
    paint(dr, polygon(tremble([[24, 88], [96, 87], [100, 98], [20, 99]], rnd, 0.3)), '#a83c2c');
    paint(dr, polygon([[24, 90], [96, 89], [96.4, 90.6], [23.6, 91.6]]) + polygon([[22, 95.6], [98, 95], [98.4, 96.6], [21.6, 97.2]]), '#2f3c68');
    let diamonds = '';
    for (let x = 30; x < 92; x += 8) diamonds += polygon([[x, 91.8], [x + 2.2, 93.4], [x, 95], [x - 2.2, 93.4]]);
    paint(dr, diamonds, '#dea43f');
    for (const [x, w] of [[34, 15], [52, 14], [70, 13]] as const) {
      const cushion = tremble(runs([[x - w / 2, 88], [x - w / 2 + 1, 79], [x + w / 2 - 1, 78.6], [x + w / 2, 88]], 2.5), rnd, 0.3);
      form(dr, cushion, { base: '#c8582e', light: '#e2804e', shade: '#8a3418' }, [-1.4, -0.8], [0.8, 0.8]);
      paint(dr, brush([[x - w / 2 + 1, 83.6], [x, 83.2], [x + w / 2 - 1, 83.4]], 1.2, rnd), '#e3b552');
    }
    const jug = roundish(86, 84, 4, 4.6, rnd, { count: 12 });
    form(dr, jug, { base: '#b9693c', light: '#dc925e', shade: '#83442a' }, [-1, -0.8], [0.8, 0.6]);
    paint(dr, brush([[86, 79.4], [86.4, 76.4], [88.6, 75]], 1.4, rnd), '#b9693c');
  });
  // the reed screen at its side, the reeds bound in coloured wool in the old patterns
  const screen = tremble(runs([[8, 70], [22, 65], [21, 97], [7, 96]], 3), rnd, 0.2);
  paint(dr, outline(screen), '#e6d6b2');
  within(dr, outline(screen), () => {
    let reeds = '';
    for (let x = 8.6; x < 22; x += 1.6) reeds += brush([[x, 64], [x - 0.2, 80], [x - 0.6, 98]], 0.35, rnd, { count: 4 });
    paint(dr, reeds, '#b8a478', 0.8);
    let red = '';
    let dark = '';
    for (const y of [72, 82, 92]) {
      red += polygon([[14.6, y - 4], [19, y], [14.6, y + 4], [10.2, y]]);
      dark += polygon([[14.6, y - 1.8], [16.6, y], [14.6, y + 1.8], [12.6, y]]);
    }
    paint(dr, red, '#b8382e');
    paint(dr, dark, '#2a2420');
  });
  // the goat-hair flap let down at the other side
  const flap = tremble(runs([[98, 62], [111, 67], [113, 95], [99, 97]], 3), rnd, 0.3);
  form(dr, flap, HAIR, [-1.2, 0], [1, 0]);
  // the roof: strips of woven goat hair, raised into peaks by the poles along the ridge
  const roof = tremble([[8, 72], [14, 56], [34, 40.6], [47, 47], [60, 35], [73, 46], [86, 39.4], [105, 52.6], [112, 69], [92, 64.6], [60, 66.4], [28, 66]], rnd, 0.35);
  paint(dr, outline(roof), HAIR.base);
  within(dr, outline(roof), () => {
    let strips = '';
    for (let i = 1; i < 6; i++) {
      const t = i / 6;
      strips += brush([[10, 70 - t * 18], [34, 64 - t * 22], [60, 64 - t * 26], [86, 62 - t * 21], [110, 67 - t * 15]], 0.8, rnd, { start: 0.8, end: 0.8, peak: 0.5, count: 12 });
    }
    paint(dr, strips, HAIR.light);
    paint(dr, streaks(rnd, [10, 36, 110, 68], 26, 80, 5, 0.6), HAIR.light, 0.45);
  });
  side(dr, roof, 0, -2.4, HAIR.shade);
  side(dr, roof, 1.6, 2, '#5c5048');
  // the poles holding up its front
  let poles = '';
  for (const [x, top] of [[24, 65.6], [60, 66.4], [96, 64.4]] as const) poles += brush([[x, top], [x + 0.3, 82], [x + 0.4, 98]], 1.3, rnd, { start: 1, end: 0.9, peak: 0.5, count: 6 });
  paint(dr, poles, '#8a6a46');
  // a kettle on three stones before the door, a thread of smoke from it
  let stones = '';
  for (const [x, y] of [[100, 101], [106, 102.4], [103.6, 99]] as const) stones += outline(roundish(x, y, 2.2, 1.5, rnd, { count: 8 }));
  paint(dr, stones, '#8e877c');
  paint(dr, outline(tremble(blade([103, 99.6], [103.4, 94], 3.4, { point: 0.3, count: 6 }), rnd, 0.1)), '#f08a3c');
  const kettle = roundish(103.2, 94.6, 3.6, 3, rnd, { count: 12 });
  form(dr, kettle, { base: '#3f6b8e', light: '#6a93b4', shade: '#284a66' }, [-0.8, -0.6], [0.6, 0.6]);
  paint(dr, brush([[106.4, 94], [109, 92.4], [110, 90.6]], 1, rnd) + brush([[100.6, 92], [103.2, 89.6], [105.8, 92]], 0.6, rnd, { start: 1, end: 1, peak: 0.5 }), '#284a66');
  paint(dr, brush([[110, 89.6], [108, 82], [111, 74], [109, 66]], 1.6, rnd, { start: 0.5, end: 0.05, peak: 0.3 }), '#cfc6bc', 0.85);
}

// ───────────────────────────────────────────────────────────────────── gemî

const SHIP: Tone = { base: '#6a3a22', light: '#94593a', shade: '#40200f' };
const SAIL: Tone = { base: '#f1e5c8', light: '#fdf7e8', shade: '#d0bd96' };
const SEA: Tone = { base: '#2f6f8c', light: '#6fa8bf', shade: '#1f4f66' };
const RIGGING = '#3a2a20';

export function gemi(dr: Drawing, rnd: Rnd): void {
  // the far sea, pale under the sky
  paint(dr, waterStrip(rnd, 8, 112, 82, 7, 0.6), SEA.light);
  // the stays and shrouds behind the sails
  let lines = '';
  for (const [a, b] of [[[40, 13], [7, 62]], [[67, 7], [41, 15]], [[67, 7], [100, 57]], [[40, 15], [47, 76]], [[40, 15], [33, 76]], [[67, 9], [75, 76]], [[67, 9], [60, 76]]] as Array<[Pt, Pt]>) lines += brush([a, lerp(a, b, 0.5), b], 0.4, rnd, { start: 1, end: 1, peak: 0.5, count: 4 });
  paint(dr, lines, RIGGING, 0.85);
  // the masts and the bowsprit
  paint(dr, brush([[40, 77], [40, 44], [40, 11]], 1.8, rnd, { start: 1, end: 0.7, peak: 0.05, count: 8 }) + brush([[67.6, 77], [67.4, 40], [67, 5]], 2, rnd, { start: 1, end: 0.7, peak: 0.05, count: 8 }) + brush([[22, 72], [12, 66], [5, 61.6]], 1.6, rnd, { start: 1, end: 0.6, peak: 0.1, count: 6 }), SHIP.shade);
  // the sails, full of wind from astern: each bellied toward the bow, its seams showing, a reef band across it
  const sail = (top: number, bottom: number, x: number, half: number, belly: number): void => {
    const pts = tremble([[x - half, top], [x, top - 0.6], [x + half, top], [x + half - 0.6, (top + bottom) / 2], [x + half - 1.4, bottom], [x - belly * 0.3, bottom + belly * 0.5], [x - half - belly * 0.4, bottom - 0.6], [x - half - belly * 0.6, (top + bottom) / 2]], rnd, 0.25);
    paint(dr, outline(pts), SAIL.base);
    side(dr, pts, -2.2, -1.4, SAIL.shade, { grow: 0.99 });
    side(dr, pts, 1.6, 1.2, SAIL.light);
    within(dr, outline(pts), () => {
      let seams = '';
      for (const t of [-0.5, 0, 0.5]) seams += brush([[x + t * half, top + 1], [x + t * half - belly * 0.3, (top + bottom) / 2], [x + t * half - belly * 0.1, bottom]], 0.4, rnd, { start: 1, end: 1, peak: 0.5, count: 6 });
      seams += brush([[x - half - 2, top + (bottom - top) * 0.28], [x, top + (bottom - top) * 0.28 + belly * 0.2], [x + half, top + (bottom - top) * 0.28]], 0.5, rnd, { start: 1, end: 1, peak: 0.5, count: 6 });
      paint(dr, seams, SAIL.shade, 0.8);
    });
    paint(dr, brush([[x - half - 1, top], [x, top - 0.4], [x + half + 1, top]], 1.2, rnd, { start: 1, end: 1, peak: 0.5, count: 6 }), SHIP.base);
  };
  sail(15, 30, 40, 10, 3);
  sail(9, 26, 67.4, 12, 3.4);
  sail(32, 56, 40, 13, 4.4);
  sail(28, 58, 67.4, 16, 5);
  const jib = tremble([[7, 62], [39, 16], [37, 50], [30, 64]], rnd, 0.25);
  paint(dr, outline(jib), SAIL.base);
  side(dr, jib, 1.4, -1.2, SAIL.shade);
  // pennants streaming from the mastheads
  paint(dr, outline(tremble(blade([40, 11], [27, 8.6], 3, { at: 0.2, bend: 0.12, point: 1 }), rnd, 0.1)), '#c0392f');
  paint(dr, outline(tremble(blade([67, 5], [50, 2.6], 3.4, { at: 0.2, bend: -0.12, point: 1 }), rnd, 0.1)), '#d9a440');
  // the hull: dark timber sweeping up to a high stern, a gold wale down its length, gun ports, the stern windows lit
  const hull = tremble([[12, 69], [24, 74.4], [44, 77], [64, 77], [82, 74], [93, 68.6], [97.4, 58.4], [103, 60], [103, 67], [99, 79], [86, 87.6], [62, 90], [40, 88.6], [24, 82.6]], rnd, 0.3);
  paint(dr, outline(hull), SHIP.base);
  within(dr, outline(hull), () => {
    paint(dr, streaks(rnd, [12, 70, 104, 90], 24, 3, 9, 0.7), SHIP.light, 0.4);
    paint(dr, brush([[14, 71.6], [40, 80], [66, 80.6], [90, 76], [102, 66]], 1.8, rnd, { start: 0.6, end: 0.8, peak: 0.5, count: 16 }), '#d9a440');
    paint(dr, brush([[20, 77.6], [42, 84.6], [66, 85.2], [88, 81.4], [100, 73]], 1, rnd, { start: 0.6, end: 0.8, peak: 0.5, count: 16 }), '#a8742a');
    let ports = '';
    for (const x of [30, 40, 50, 60, 70, 80]) ports += polygon(tremble([[x, 80.4 + (x > 70 ? -1.4 : 0)], [x + 3.4, 80.4 + (x > 70 ? -1.4 : 0)], [x + 3.4, 83 + (x > 70 ? -1.4 : 0)], [x, 83 + (x > 70 ? -1.4 : 0)]], rnd, 0.1));
    paint(dr, ports, SHIP.shade);
    paint(dr, polygon([[92, 62], [100, 61], [100, 64.4], [92, 65.4]]), SHIP.light);
  });
  side(dr, hull, 0, -2.6, SHIP.shade, { grow: 0.99 });
  let windows = '';
  for (const x of [93.4, 96.2, 99]) windows += polygon([[x, 62.6], [x + 1.8, 62.4], [x + 1.8, 64.4], [x, 64.6]]);
  paint(dr, windows, '#f6c25a');
  paint(dr, brush([[101, 58.6], [101.4, 53.6]], 0.7, rnd, { start: 1, end: 1 }), RIGGING);
  paint(dr, outline(roundish(101.4, 52.4, 1.4, 1.8, rnd, { count: 8, tremor: 0.1 })), '#ffd46b');
  paint(dr, brush([[12, 69], [44, 76.4], [82, 73.4], [97.4, 58.4]], 1.2, rnd, { start: 0.8, end: 0.6, peak: 0.5, count: 14 }), SHIP.light);
  // the near sea over its waterline: its dark in the water, foam at the bow, the crests of the waves
  const near = waterStrip(rnd, 2, 118, 94, 15, 0.9);
  paint(dr, near, SEA.base);
  within(dr, near, () => {
    let dark = '';
    for (const [x0, x1, y] of [[18, 100, 89], [26, 92, 92.6], [36, 80, 96.4]] as const) dark += brush([[x0, y], [(x0 + x1) / 2, y + 0.4], [x1, y]], 1.8, rnd, { start: 0.3, end: 0.3, peak: 0.5 });
    paint(dr, dark, SEA.shade);
    let crests = '';
    for (const [x, y, l] of [[8, 94, 8], [98, 92, 10], [76, 99, 9], [30, 100, 8], [112, 97, 5], [54, 102, 7]] as const) crests += brush([[x - l / 2, y], [x, y - 0.7], [x + l / 2, y + 0.2]], 1.2, rnd, { start: 0.2, end: 0.2, peak: 0.5, count: 6 });
    paint(dr, crests, SEA.light);
  });
  let foam = '';
  for (let i = 0; i < 9; i++) foam += outline(roundish(12 + i * 1.9 + rnd(), 87 - Math.sin(i * 0.6) * 1.4, 1.4 + rnd() * 0.8, 1 + rnd() * 0.5, rnd, { count: 7, tremor: 0.1 }));
  paint(dr, foam, '#f6f3ea');
  paint(dr, waterStrip(rnd, 10, 106, 103, 5, 0.6), SEA.shade);
  // two gulls following it
  paint(dr, brush([[92, 22], [95, 20], [97, 22]], 0.7, rnd, { start: 0.2, end: 0.2, peak: 0.5 }) + brush([[100, 28], [102.4, 26.4], [104, 28]], 0.6, rnd, { start: 0.2, end: 0.2, peak: 0.5 }), '#5a5a6a');
}

// ───────────────────────────────────────────────────────────────────── koşk

const LIMESTONE: Tone = { base: '#d9b67c', light: '#efd3a0', shade: '#a98550' };
const RIGGING_DARK = '#3a2a20';

export function kosk(dr: Drawing, rnd: Rnd): void {
  // the paved terrace it stands on
  const terrace = roundish(60, 104, 56, 8, rnd, { wobble: 0.03, tremor: 0.5, count: 30 });
  paint(dr, outline(terrace), '#cdb994');
  within(dr, outline(terrace), () => {
    let joints = '';
    for (let x = 10; x < 112; x += 7) joints += brush([[x, 97], [x - 1.4, 104], [x - 2.6, 112]], 0.4, rnd, { count: 4 });
    paint(dr, joints, '#a8946e', 0.7);
  });
  // a cypress at its side
  const cypress = tremble(blade([14, 104], [16, 28], 13, { at: 0.42, point: 0.5, count: 12 }), rnd, 0.4);
  paint(dr, outline(cypress), '#3e5a38');
  side(dr, cypress, -1.6, 0, '#2a4026');
  within(dr, outline(cypress), () => paint(dr, streaks(rnd, [8, 30, 22, 102], 22, 80, 6, 0.8), '#5e7e50', 0.8));
  // the house: its front in the light, the side wall in shade, a carved parapet round its flat roof
  const sideWall = tremble(runs([[88, 40], [106, 32], [106, 95], [88, 102]], 4), rnd, 0.3);
  paint(dr, outline(sideWall), LIMESTONE.shade);
  const front = tremble(runs([[22, 40], [88, 40], [88, 102], [22, 102]], 4), rnd, 0.3);
  paint(dr, outline(front), LIMESTONE.base);
  within(dr, outline(front), () => {
    let courses = '';
    for (let y = 45; y < 102; y += 4.6) courses += brush([[21, y], [55, y + 0.2], [89, y]], 0.35, rnd, { count: 4 });
    let joints = '';
    for (let y = 45, i = 0; y < 100; y += 4.6, i++) for (let x = 24 + (i % 2) * 5; x < 88; x += 10) joints += polygon([[x, y], [x + 0.3, y], [x + 0.3, y + 4.6], [x, y + 4.6]]);
    paint(dr, courses + joints, LIMESTONE.shade, 0.35);
    paint(dr, streaks(rnd, [22, 40, 88, 102], 18, 0, 8, 1), LIMESTONE.light, 0.4);
  });
  within(dr, outline(sideWall), () => {
    let courses = '';
    for (let y = 44; y < 100; y += 4.6) courses += brush([[87, y], [97, y - 4], [107, y - 8]], 0.35, rnd, { count: 4 });
    paint(dr, courses, '#8a6a3e', 0.4);
    for (const x of [93, 101]) paint(dr, outline(pointed(x, 4.2, 62 - (x - 88) * 0.44, 3, 72 - (x - 88) * 0.44)), '#5a4630');
  });
  const parapet = tremble(runs([[20, 41], [20, 33.6], [90, 33.6], [108, 25.6], [108, 32.6], [90, 41]], 3), rnd, 0.2);
  paint(dr, outline(parapet), LIMESTONE.light);
  let arcade = '';
  for (let x = 23; x < 88; x += 5) arcade += outline(pointed(x + 2, 3, 39.4, 2.6, 40.4));
  paint(dr, arcade, LIMESTONE.shade, 0.6);
  // the ground floor: an arcade of three pointed arches, lamplight in the middle one
  const arches = [32, 55, 78];
  for (const x of arches) {
    const arch = pointed(x, 15, 80, 11, 102);
    paint(dr, outline(arch), '#4a3626');
    paint(dr, brush(pointed(x, 17.6, 80, 12.4, 102).slice(1, -1), 1.3, rnd, { start: 1, end: 1, peak: 0.5, count: 18 }), LIMESTONE.light);
  }
  within(dr, outline(pointed(55, 15, 80, 11, 102)), () => {
    paint(dr, polygon([[46, 66], [64, 66], [64, 103], [46, 103]]), '#8a5a30');
    paint(dr, polygon(tremble([[46, 96], [64, 96], [64, 103], [46, 103]], rnd, 0.2)), '#b07a3e');
    paint(dr, brush([[55, 69], [55, 76]], 0.4, rnd, { start: 1, end: 1 }), RIGGING_DARK);
    paint(dr, outline(roundish(55, 78.6, 1.8, 2.6, rnd, { count: 8, tremor: 0.1 })), '#ffd46b');
  });
  // the upper floor: a tall iwan in the middle with its balcony, carved hoods over the windows either side, iron grilles
  paint(dr, outline(pointed(55, 18, 58, 14, 72)), '#8a6640');
  within(dr, outline(pointed(55, 18, 58, 14, 72)), () => {
    let cells = '';
    for (let i = 0; i < 5; i++) cells += touch(48 + i * 3.5, 47.6 + Math.abs(i - 2) * 1.6, 3.6, 1.4, 90);
    paint(dr, cells, '#a8804e');
    paint(dr, outline(pointed(55, 10, 62, 6, 72)), '#5a4630');
  });
  paint(dr, brush(pointed(55, 20.6, 58, 15.6, 72).slice(1, -1), 1.3, rnd, { start: 1, end: 1, peak: 0.5, count: 18 }), LIMESTONE.light);
  let rail = brush([[45, 66], [55, 65.8], [65, 66]], 1, rnd, { start: 1, end: 1, peak: 0.5 });
  for (let x = 46.4; x < 64.4; x += 2.4) rail += brush([[x, 66], [x, 71.6]], 0.5, rnd, { count: 4 });
  paint(dr, rail, '#6a4628');
  for (const x of [32, 78]) {
    paint(dr, outline(pointed(x, 9, 56, 5.6, 68)), '#39384a');
    let grille = '';
    for (const dx of [-2.2, 0, 2.2]) grille += brush([[x + dx, 51], [x + dx, 68]], 0.4, rnd, { count: 4 });
    grille += brush([[x - 4.5, 60], [x + 4.5, 60]], 0.4, rnd, { count: 4 });
    paint(dr, grille, '#9a8a70');
    paint(dr, brush(pointed(x, 12, 56, 7.4, 68).slice(1, -1), 1.2, rnd, { start: 1, end: 1, peak: 0.5, count: 14 }), LIMESTONE.light);
    paint(dr, polygon([[x - 6, 68], [x + 6, 68], [x + 6.6, 69.6], [x - 6.6, 69.6]]), LIMESTONE.shade);
  }
  // a frieze of carved rosettes between the floors
  let rosettes = '';
  for (let x = 25; x < 88; x += 4.4) rosettes += ellipse(x, 75.2, 1.1, 1.1);
  paint(dr, polygon([[22, 73], [88, 73], [88, 77.4], [22, 77.4]]), LIMESTONE.shade, 0.5);
  paint(dr, rosettes, LIMESTONE.light);
  // a pomegranate tree in fruit by the side wall, and geraniums in pots on the terrace
  paint(dr, brush([[100, 104], [99, 92], [101, 82]], 2.2, rnd, { start: 1, end: 0.6 }), '#6a4a32');
  const crown = roundish(101, 74, 13, 11, rnd, { wobble: 0.12, count: 16 });
  form(dr, crown, { base: '#5f8a48', light: '#86ad66', shade: '#3e6430' }, [-1.6, -1.6], [1.2, 1.2]);
  let fruit = '';
  for (const [x, y] of [[94, 72], [104, 68], [107, 78], [97, 80], [101, 75]] as const) fruit += outline(roundish(x, y, 1.9, 1.8, rnd, { count: 7, tremor: 0.1 }));
  paint(dr, fruit, '#c22f38');
  for (const x of [38, 72]) {
    paint(dr, polygon(tremble([[x - 2.6, 97], [x + 2.6, 97], [x + 2, 102], [x - 2, 102]], rnd, 0.1)), '#b65a36');
    paint(dr, outline(roundish(x, 95, 3.4, 2.4, rnd, { count: 8 })), '#5f8a48');
    paint(dr, ellipse(x - 1.2, 93.6, 1, 1) + ellipse(x + 1.4, 94, 1, 1) + ellipse(x, 92.4, 0.9, 0.9), '#d6403a');
  }
}

// ──────────────────────────────────────────────────────────────────── keleh

const HILL: Tone = { base: '#8ea36a', light: '#b3c58c', shade: '#66804c' };
const KELEH_STONE: Tone = { base: '#cbb28a', light: '#e6d3ad', shade: '#98805e' };

export function keleh(dr: Drawing, rnd: Rnd): void {
  // the hill: steep, green, rock breaking through, the road winding up it to the gate
  const hill = tremble([[2, 113], [10, 100], [22, 86], [32, 72], [42, 63], [60, 59], [78, 61], [88, 68], [100, 83], [110, 99], [118, 113], [60, 116]], rnd, 0.5);
  paint(dr, outline(hill), HILL.base);
  within(dr, outline(hill), () => {
    paint(dr, polygon(tremble([[60, 59], [78, 61], [88, 68], [100, 83], [110, 99], [118, 113], [76, 116], [70, 90]], rnd, 0.4)), HILL.shade);
    paint(dr, polygon(tremble([[2, 113], [10, 100], [22, 86], [32, 72], [42, 63], [50, 62], [36, 84], [26, 104]], rnd, 0.4)), HILL.light);
    let rocks = '';
    for (const [x, y, w] of [[30, 84, 8], [84, 78, 7], [94, 96, 9], [18, 102, 7], [64, 72, 6]] as const) rocks += polygon(tremble([[x - w / 2, y + 2], [x - w / 4, y - 2], [x + w / 3, y - 2.6], [x + w / 2, y + 2]], rnd, 0.3));
    paint(dr, rocks, '#a59a86');
    paint(dr, streaks(rnd, [6, 62, 114, 114], 30, -30, 6, 0.8), HILL.light, 0.4);
    paint(dr, brush([[62, 116], [40, 106], [72, 96], [50, 84], [62, 72], [60, 64]], 2.6, rnd, { start: 1, end: 0.7, peak: 0.3, count: 24 }), '#e3cfa2');
  });
  // poplars and the village's houses at its foot
  let poplars = '';
  for (const [x, y, h] of [[12, 106, 14], [18, 109, 11], [104, 105, 14], [110, 109, 11]] as const) poplars += outline(tremble(blade([x, y], [x, y - h], 4, { at: 0.4, point: 0.6, count: 6 }), rnd, 0.15));
  paint(dr, poplars, '#4f7a3e');
  for (const [x, y] of [[26, 108], [34, 110], [86, 107], [94, 110]] as const) {
    paint(dr, polygon(tremble([[x - 3.6, y], [x + 3.6, y], [x + 3.6, y - 4.6], [x - 3.6, y - 4.6]], rnd, 0.15)), '#ead6ae');
    paint(dr, polygon([[x + 3.6, y], [x + 5.4, y - 1], [x + 5.4, y - 5.4], [x + 3.6, y - 4.6]]), '#bfa57c');
    paint(dr, ellipse(x - 1, y - 2.4, 0.7, 0.9), '#f2b54e');
  }
  // the castle: the keep rising at the back with a red pennant, curtain walls between round towers, the gate
  const keep = tremble(runs([[44, 52], [44, 22], [60, 22], [60, 52]], 4), rnd, 0.2);
  form(dr, keep, KELEH_STONE, [-2.2, 0], [1.4, 0]);
  battlements(dr, rnd, 43.4, 61, 22, 2.4, 3, KELEH_STONE);
  let slits = '';
  for (const [x, y] of [[49, 30], [55, 30], [52, 40]] as const) slits += polygon([[x, y], [x + 1, y], [x + 1, y + 4.6], [x, y + 4.6]]);
  paint(dr, slits, '#3e3226');
  paint(dr, ellipse(52, 30.6, 0.9, 1.4), '#f2b54e');
  paint(dr, brush([[52, 19], [52, 7]], 0.6, rnd, { start: 1, end: 1 }), '#4a3a2c');
  paint(dr, outline(tremble(blade([52, 7.6], [62, 9.4], 4, { at: 0.2, bend: 0.1, point: 1 }), rnd, 0.1)), '#c0392f');
  const wall = tremble(runs([[30, 66], [30, 52], [94, 52], [94, 68]], 4), rnd, 0.25);
  paint(dr, outline(wall), KELEH_STONE.base);
  within(dr, outline(wall), () => {
    let courses = '';
    for (let y = 55; y < 68; y += 3.4) courses += brush([[29, y], [62, y + 0.2], [95, y]], 0.35, rnd, { count: 4 });
    paint(dr, courses, KELEH_STONE.shade, 0.45);
    paint(dr, polygon([[30, 52], [94, 52], [94, 54], [30, 54]]), KELEH_STONE.light, 0.8);
  });
  battlements(dr, rnd, 30, 94, 52, 2.6, 3.2, KELEH_STONE);
  // the towers: round, each with its battlements and slits, the gate tower in the middle
  for (const [x0, x1, top] of [[22, 36, 42], [86, 100, 44], [54, 70, 40]] as const) {
    drum(dr, rnd, x0, x1, top, 68, KELEH_STONE);
    battlements(dr, rnd, x0 - 0.6, x1 + 0.6, top, 2.4, 3, KELEH_STONE);
    paint(dr, polygon([[(x0 + x1) / 2 - 0.5, top + 7], [(x0 + x1) / 2 + 0.5, top + 7], [(x0 + x1) / 2 + 0.5, top + 12], [(x0 + x1) / 2 - 0.5, top + 12]]), '#3e3226');
  }
  paint(dr, outline(pointed(62, 7, 62, 5, 70)), '#3e3226');
  paint(dr, outline(pointed(62, 5, 63, 3.6, 70)), '#7a5434');
  paint(dr, brush(pointed(62, 9, 62, 6.4, 70).slice(1, -1), 0.9, rnd, { start: 1, end: 1, peak: 0.5, count: 12 }), KELEH_STONE.light);
  for (const [x, y] of [[29, 54], [93, 56]] as const) paint(dr, ellipse(x, y, 0.9, 1.3), '#f2b54e');
}
