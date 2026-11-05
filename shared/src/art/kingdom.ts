/**
 * Kurdish Kingdom's village, drawn by code: a mountain village on two
 * terraces under snow-capped peaks, with its six buildings each at its own
 * level — an empty plot staked out with stones, then five stages of building.
 *
 * Flat painted cut-outs, as the rest of Hevalo's art: soft rounded shapes,
 * flat planes of colour, and at most one light and one shade on any form — a
 * wall's sunlit face and its side in shadow, a roof slab with its lit top
 * edge, a tree crown with one patch of light and one of shade. Nothing glows,
 * nothing is bevelled, and there are no people anywhere: a village is told
 * by its stone houses with their flat earth roofs and the beam ends under
 * them, the stone roller left on a roof, a spring under its arch, poplars by
 * the stream, terraces held up by dry-stone walls, and an orchard of
 * pomegranates and apricots.
 *
 * Three pictures come from here:
 * - `kingdomSceneSvg`: the whole village, 360 × 300 units, for the village
 *   screen; `KINGDOM_PLOTS` says where each building stands in it, so the
 *   apps can put a button over each one.
 * - `kingdomBuildingSvg`: one building at one level on the 120-unit canvas,
 *   for its sheet and its celebration.
 * - `kingdomLife` and `kingdomLifeSvg`: where the village moves — chimney
 *   smoke, the spring's water, the orchard's leaves — and the small sprite
 *   each app lays over the scene there and moves gently (or not at all, for a
 *   reader who asked for less motion). The scene itself never moves, so the
 *   phone and the browser draw the same still picture.
 *
 * Deterministic: the same levels give the same string. Ids come from a hash
 * of what was asked for, as every drawing's do (svg.ts).
 */
import { KINGDOM_BUILDINGS, type KingdomBuilding, type KingdomLevel } from '../games/kingdom/buildings.js';
import { curve, taper, type Knot } from '../characters/pen.js';
import { CANVAS, checkSize, escapeXml, linearAt, n, n2, prefixFor, type Pt } from './svg.js';

/** The scene's own units. */
export const KINGDOM_SCENE = { width: 360, height: 300 } as const;

/** One form's three tones: its lit edge, its face, and its side in shadow. */
interface Tones {
  light: string;
  face: string;
  shade: string;
}

// ───────────────────────────────────────────────────────────── the palette

const STONE: Tones = { light: '#f5e6c8', face: '#e4cba3', shade: '#bf9d72' };
const STONE_WARM: Tones = { light: '#f6dcae', face: '#e8bf87', shade: '#c4935c' };
const STONE_GREY: Tones = { light: '#ece6da', face: '#d3cabb', shade: '#a99d8a' };
const ROOF: Tones = { light: '#d3a777', face: '#b98a5b', shade: '#8a6440' };
const WOOD: Tones = { light: '#c99461', face: '#a8733f', shade: '#7a5129' };
const EARTH: Tones = { light: '#e3c497', face: '#cfa671', shade: '#a67c4b' };
const WATER: Tones = { light: '#bfe9f5', face: '#6cc0e0', shade: '#3c91bd' };
const LEAF: Tones = { light: '#9ccf6a', face: '#6eab4b', shade: '#4a8237' };
const POPLAR: Tones = { light: '#79b25c', face: '#4f8d48', shade: '#356b33' };
const DOOR = '#6e4627';
const OPENING = '#3a2a22';
const FRAME = '#3f918c';
const BEAM = '#6b4b2e';
const RED = '#d8493b';
const SAFFRON = '#f2b632';
const CREAM = '#fff4e2';
const GREEN = '#3fa45b';
const APRICOT = '#f39a3d';

interface Sky {
  top: string;
  low: string;
  far: string;
  farLo: string;
  snow: string;
  near: string;
  grass: Tones;
  wall: Tones;
  path: string;
}

/** By day, for a light screen: a clear sky over the peaks. */
const DAY: Sky = {
  top: '#9fd3ef',
  low: '#eef6ea',
  far: '#a9bfd8',
  farLo: '#93aac6',
  snow: '#f7f9fc',
  near: '#8fb39a',
  grass: { light: '#c4dc86', face: '#a9c96c', shade: '#87ad52' },
  wall: STONE_GREY,
  path: '#e6d2a8',
};

/** For a dark screen: the same village in the last light of the evening. */
const DUSK: Sky = {
  top: '#2d3a66',
  low: '#d9a07a',
  far: '#5d6890',
  farLo: '#4c5679',
  snow: '#dfe2f0',
  near: '#4f6f6a',
  grass: { light: '#8faa63', face: '#78964f', shade: '#5c7a3c' },
  wall: { light: '#c9c0b0', face: '#ab9f8c', shade: '#857a69' },
  path: '#b9a581',
};

// ───────────────────────────────────────────────────────────── the pen

/** A rounded rectangle as path data, in relative steps (a village is hundreds of them, and short steps are short strings). */
function rr(x: number, y: number, w: number, h: number, r: number): string {
  const q = Math.max(0, Math.min(r, w / 2, h / 2));
  const a = (dx: number, dy: number): string => `a${n(q)} ${n(q)} 0 0 1 ${n(dx)} ${n(dy)}`;
  return `M${n(x + q)} ${n(y)}h${n(w - 2 * q)}${a(q, q)}v${n(h - 2 * q)}${a(-q, q)}h${n(2 * q - w)}${a(-q, -q)}v${n(2 * q - h)}${a(q, -q)}z`;
}

const fillPath = (d: string, colour: string, extra = ''): string => `<path d="${d}" fill="${colour}"${extra}/>`;
const ellipse = (cx: number, cy: number, rx: number, ry: number, colour: string): string =>
  `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="${colour}"/>`;
const circle = (cx: number, cy: number, r: number, colour: string): string => `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${colour}"/>`;
const group = (dx: number, dy: number, s: number, inner: string): string =>
  `<g transform="translate(${n(dx)} ${n(dy)})${s === 1 ? '' : ` scale(${n2(s)})`}">${inner}</g>`;

/**
 * A block: its face, the side turned from the light as a band of shade down
 * its right, and its lit top edge — one light and one shade.
 */
function block(x: number, y: number, w: number, h: number, r: number, t: Tones, side = 0.2): string {
  const band = Math.max(1.6, w * side);
  return fillPath(rr(x, y, w, h, r), t.shade) + fillPath(rr(x, y, w - band, h, r), t.face) + fillPath(rr(x + 0.8, y, w - band - 0.8, Math.min(2.2, h * 0.2), Math.min(r, 1.1)), t.light);
}

/** A flat earth roof: a slab overhanging the walls, its top lit, the round ends of its beams in a row under it. */
function roof(x: number, y: number, w: number, beams: boolean): string {
  let out = fillPath(rr(x - 2, y - 4.4, w + 4, 5.2, 2.2), ROOF.shade) + fillPath(rr(x - 2, y - 4.4, w + 4, 4, 2), ROOF.face) + fillPath(rr(x - 1, y - 4.4, w + 2, 1.4, 0.7), ROOF.light);
  if (beams) {
    const count = Math.max(2, Math.round(w / 7));
    for (let i = 0; i < count; i++) out += circle(x + 3 + (i * (w - 6)) / (count - 1), y + 1.8, 0.9, BEAM);
  }
  return out;
}

/** A door with a rounded top. */
function door(cx: number, foot: number, w: number, h: number): string {
  return fillPath(`M${n(cx - w / 2)} ${n(foot)}V${n(foot - h + w / 2)}A${n(w / 2)} ${n(w / 2)} 0 0 1 ${n(cx + w / 2)} ${n(foot - h + w / 2)}V${n(foot)}Z`, DOOR);
}

/** A small window in the blue-green the village frames are painted. */
function windowAt(cx: number, cy: number, s: number): string {
  return fillPath(rr(cx - s / 2 - 1, cy - s / 2 - 1, s + 2, s + 2, 1.2), FRAME) + fillPath(rr(cx - s / 2, cy - s / 2, s, s, 0.8), OPENING);
}

/** The stone roller kept on a flat roof, to roll the earth firm after rain. */
function roller(cx: number, y: number): string {
  return fillPath(rr(cx - 4, y - 3.2, 8, 3.2, 1.6), STONE_GREY.shade) + fillPath(rr(cx - 4, y - 3.2, 6.6, 3.2, 1.6), STONE_GREY.face);
}

/** A chimney on a roof; its top is where the smoke rises. */
function chimney(cx: number, roofTop: number): string {
  return block(cx - 2.2, roofTop - 6, 4.4, 6.4, 1, STONE, 0.3);
}

interface HouseOptions {
  door?: number | null;
  windows?: readonly number[];
  chimney?: number | null;
  roller?: number | null;
  tones?: Tones;
}

/** A stone house with a flat roof, its foot at `foot`, `x` its left wall. */
function house(x: number, foot: number, w: number, h: number, o: HouseOptions = {}): string {
  const top = foot - h;
  let out = block(x, top, w, h, 2, o.tones ?? STONE) + roof(x, top, w, true);
  if (o.door !== undefined && o.door !== null) out += door(x + o.door * w, foot, Math.min(7, w * 0.24), Math.min(12, h * 0.62));
  for (const at of o.windows ?? []) out += windowAt(x + at * w, top + h * 0.42, Math.min(5, w * 0.16));
  if (o.chimney !== undefined && o.chimney !== null) out += chimney(x + o.chimney * w, top - 4.4);
  if (o.roller !== undefined && o.roller !== null) out += roller(x + o.roller * w, top - 4.4);
  return out;
}

/** A round tree: its trunk, a crown of three soft lobes, one patch of light and one of shade, and its fruit if any. */
function tree(cx: number, foot: number, size: number, fruit: string | null, fruitCount = 0): string {
  const crownY = foot - size * 1.25;
  let out = fillPath(taper([[cx, foot], [cx, crownY]], [size * 0.22, size * 0.14]), WOOD.shade);
  const lobes = (dx: number, dy: number, r: number, c: string): string => circle(cx + dx * size, crownY + dy * size, r * size, c);
  out += lobes(0.05, 0.12, 0.62, LEAF.shade) + lobes(-0.42, 0.05, 0.46, LEAF.face) + lobes(0.4, 0.02, 0.46, LEAF.face) + lobes(0, -0.2, 0.58, LEAF.face);
  out += lobes(-0.22, -0.34, 0.24, LEAF.light);
  if (fruit) {
    const spots: readonly Pt[] = [[-0.38, 0.12], [0.32, -0.12], [0.08, 0.22], [-0.08, -0.32], [0.46, 0.18], [-0.5, -0.12]];
    for (const [dx, dy] of spots.slice(0, fruitCount)) out += circle(cx + dx * size, crownY + dy * size, size * 0.1, fruit);
  }
  return out;
}

/** A poplar: tall and narrow on a short trunk, lit down one side. */
function poplar(cx: number, foot: number, tall: number, wide: number): string {
  const top = foot - tall;
  const spine: Pt[] = [[cx, top], [cx, top + tall * 0.25], [cx, top + tall * 0.62], [cx, foot - tall * 0.14]];
  return (
    fillPath(taper([[cx, foot - tall * 0.2], [cx, foot]], [wide * 0.2, wide * 0.16]), WOOD.shade) +
    fillPath(taper(spine, [0, wide * 0.8, wide, wide * 0.5]), POPLAR.face) +
    fillPath(taper(spine.map(([x, y]) => [x + wide * 0.2, y] as Pt), [0, wide * 0.34, wide * 0.42, wide * 0.18]), POPLAR.shade) +
    fillPath(taper(spine.map(([x, y]) => [x - wide * 0.22, y + tall * 0.05] as Pt).slice(0, 3), [0, wide * 0.22, wide * 0.18]), POPLAR.light)
  );
}

/** Stones round a plot: the corners staked out for a building not built yet. */
function stakes(w: number): string {
  let out = '';
  for (const [x, y] of [[-w / 2, -3], [w / 2, -3], [-w / 2 + 4, 3], [w / 2 - 4, 3]] as const) {
    out += ellipse(x, y + 0.8, 3, 1.8, STONE_GREY.shade) + ellipse(x - 0.4, y, 2.6, 1.6, STONE_GREY.face);
  }
  return out;
}

/** The ground a building stands on: a pad of trodden earth. */
function pad(w: number): string {
  return ellipse(0, 1.4, w / 2 + 4, 6.4, EARTH.shade) + ellipse(0, 0, w / 2 + 3, 5.6, EARTH.face) + ellipse(-w * 0.12, -1.8, w * 0.28, 1.8, EARTH.light);
}

/** An awning of striped cloth on two posts: the kilim's red, saffron and cream. */
function awning(x: number, y: number, w: number, depth: number, colours: readonly string[] = [RED, CREAM]): string {
  let out = fillPath(rr(x + 1, y, 2, depth + 8, 1), WOOD.shade) + fillPath(rr(x + w - 3, y, 2, depth + 8, 1), WOOD.shade);
  const stripes = Math.max(3, Math.round(w / 6));
  const sw = w / stripes;
  for (let i = 0; i < stripes; i++) {
    out += fillPath(rr(x + i * sw, y - 1, sw + 0.2, depth, 0.6), colours[i % colours.length]!);
  }
  // the scalloped edge where it hangs, in the cloth's own shade
  let edge = `M${n(x)} ${n(y + depth - 1)}`;
  for (let i = 0; i < stripes; i++) edge += `Q${n(x + (i + 0.5) * sw)} ${n(y + depth + 2.6)} ${n(x + (i + 1) * sw)} ${n(y + depth - 1)}`;
  out += fillPath(`${edge}Z`, '#b7372c', ' fill-opacity="0.55"');
  return out;
}

/** A crate of fruit: wood, and the fruit heaped in it. */
function crate(cx: number, foot: number, w: number, fruit: string): string {
  return circle(cx - w * 0.22, foot - 4.4, w * 0.2, fruit) + circle(cx + w * 0.18, foot - 4.6, w * 0.2, fruit) + circle(cx, foot - 5.6, w * 0.2, fruit) + block(cx - w / 2, foot - 4.4, w, 4.4, 1, WOOD, 0.24);
}

/** A rug laid out or hung up: a field in red with a band of saffron diamonds, the motif of the village looms. */
function rug(x: number, y: number, w: number, h: number): string {
  let out = fillPath(rr(x, y, w, h, 1), RED) + fillPath(rr(x + 1.2, y + 1.2, w - 2.4, h - 2.4, 0.8), '#a93226');
  const count = Math.max(1, Math.floor(w / 6));
  for (let i = 0; i < count; i++) {
    const cx = x + (i + 0.5) * (w / count);
    const cy = y + h / 2;
    const s = Math.min(h * 0.32, 2.4);
    out += fillPath(`M${n(cx)} ${n(cy - s)}L${n(cx + s)} ${n(cy)}L${n(cx)} ${n(cy + s)}L${n(cx - s)} ${n(cy)}Z`, SAFFRON);
  }
  return out;
}

// ───────────────────────────────────────────────────────────── the buildings

/**
 * Each building in its own units: its foot centred on (0, 0), at most 96 wide
 * and 74 tall above it. Every stage keeps what the stage before it had, so a
 * level reads as something added, not something different.
 */
type Painter = (level: KingdomLevel) => string;

/** Houses: one stone house, then the cluster climbing the slope, roofs one above another. */
const houses: Painter = (level) => {
  let out = pad(72);
  if (level === 0) return out + stakes(56);
  // further up the slope first, so the nearer houses stand in front of them
  if (level >= 3) out += house(-30, -20, 24, 18, { windows: [0.5], chimney: 0.75, tones: STONE_WARM });
  if (level >= 4) out += house(6, -24, 28, 20, { windows: [0.3, 0.7], roller: 0.5 });
  if (level >= 5) out += house(-4, -36, 20, 14, { windows: [0.45], chimney: 0.2, tones: STONE_WARM }) + rug(9, -24, 12, 7);
  out += house(-24, 0, 30, 22, { door: 0.32, windows: level >= 3 ? [0.74] : [], chimney: 0.78, roller: level >= 2 ? 0.3 : null });
  if (level >= 2) out += house(8, 2, 28, 20, { door: 0.66, windows: [0.28], chimney: level >= 4 ? 0.2 : null, tones: STONE_WARM });
  // a ladder between two roofs, as the houses are entered from the one below
  if (level >= 4) out += fillPath(rr(4, -24, 1.4, 22, 0.7), WOOD.shade) + fillPath(rr(9, -24, 1.4, 22, 0.7), WOOD.shade) + [-20, -14, -8].map((y) => fillPath(rr(4, y, 6.4, 1.2, 0.6), WOOD.face)).join('');
  return out;
};

/** School: low walls going up, then the schoolhouse, its windows, a second wing and a bell. */
const school: Painter = (level) => {
  let out = pad(80);
  if (level === 0) return out + stakes(62);
  if (level === 1) {
    // the walls a course of stones high, and the door's gap
    return out + block(-30, -8, 26, 8, 1.5, STONE) + block(4, -8, 26, 8, 1.5, STONE) + block(-36, -12, 10, 4, 1.2, STONE_GREY, 0.3);
  }
  if (level >= 4) out += house(10, -2, 30, 30, { windows: [0.5], chimney: 0.7, tones: STONE_WARM });
  out += house(-36, 0, 50, 24, { door: 0.5, windows: level >= 3 ? [0.18, 0.82] : [], roller: level >= 3 ? 0.78 : null });
  if (level >= 3) out += fillPath(rr(-17, -1.2, 12, 2.4, 1), STONE_GREY.face);
  // the bell in its little arch on the roof
  if (level >= 5) {
    out += fillPath(`M-17 -28V-36A6 6 0 0 1 -5 -36V-28Z`, STONE.shade) + fillPath(`M-15 -28V-35.5A4 4 0 0 1 -7 -35.5V-28Z`, OPENING) + fillPath(`M-13.6 -30Q-11 -36.4 -8.4 -30Z`, SAFFRON);
    out += tree(38, 4, 9, null);
  }
  // the yard's low wall
  if (level >= 4) out += block(-44, -4, 8, 4, 1.2, STONE_GREY, 0.3) + block(36, -4, 10, 4, 1.2, STONE_GREY, 0.3);
  return out;
};

/** Tea house: a bench and a rug, then the room, its awning, a vine over the terrace and lanterns at dusk. */
const teahouse: Painter = (level) => {
  let out = pad(78);
  if (level === 0) return out + stakes(60);
  if (level >= 2) out += house(-34, -2, 40, 24, { door: 0.5, windows: level >= 3 ? [0.2, 0.8] : [0.2], chimney: 0.82, tones: STONE_WARM });
  if (level >= 4) {
    // the vine's frame over the terrace, and its leaves
    out += fillPath(rr(4, -32, 2, 32, 1), WOOD.shade) + fillPath(rr(38, -32, 2, 32, 1), WOOD.shade) + fillPath(rr(2, -33, 40, 2.4, 1.2), WOOD.face);
    for (const x of [6, 13, 20, 27, 34, 40]) out += circle(x, -33.6, 3.4, LEAF.face) + circle(x - 1, -34.6, 1.4, LEAF.light);
    out += circle(16, -30.4, 1.4, '#7b3f8c') + circle(30, -30.6, 1.4, '#7b3f8c');
  }
  if (level >= 3) out += awning(6, -24, 30, 6, [RED, CREAM, SAFFRON, CREAM]);
  // the bench and the low table, a rug before them
  out += rug(8, -2.4, 26, 4);
  out += block(8, -9, 26, 3.4, 1.2, WOOD, 0.2) + fillPath(rr(10, -6, 2, 5, 0.8), WOOD.shade) + fillPath(rr(30, -6, 2, 5, 0.8), WOOD.shade);
  // a teapot and two glasses on the bench
  out += ellipse(16, -11.4, 3, 2.4, '#c0392b') + fillPath(rr(18.4, -13, 3, 1, 0.5), '#c0392b') + fillPath(rr(23, -12, 1.8, 3, 0.6), '#d35400') + fillPath(rr(26, -12, 1.8, 3, 0.6), '#d35400');
  if (level >= 5) {
    // lanterns along the vine, and a second room above
    for (const x of [10, 22, 34]) out += fillPath(rr(x - 0.3, -31, 0.6, 3, 0.3), BEAM) + circle(x, -27, 1.8, SAFFRON);
    out += house(-30, -26, 26, 14, { windows: [0.5], tones: STONE });
  }
  return out;
};

/** Spring: water from the rocks, then a stone trough, its arch, a channel running off it and a willow over it all. */
const spring: Painter = (level) => {
  let out = pad(70);
  if (level === 0) return out + stakes(54);
  if (level >= 5) out += tree(30, -2, 13, null) + poplar(-38, 2, 46, 8);
  // the rocks the water comes out of
  out += ellipse(-12, -6, 12, 8, STONE_GREY.shade) + ellipse(-14, -8, 10, 7, STONE_GREY.face) + ellipse(-17, -11, 4, 2.4, STONE_GREY.light);
  if (level >= 3) {
    // an arch built over the spring
    out += fillPath(`M-30 0V-18A14 14 0 0 1 -2 -18V0H-7V-17A9 9 0 0 0 -25 -17V0Z`, STONE.shade) + fillPath(`M-30 0V-18A14 14 0 0 1 -4 -21V0H-7V-17A9 9 0 0 0 -25 -17V0Z`, STONE.face);
    out += fillPath(rr(-31, -34, 30, 3, 1.4), ROOF.face) + fillPath(rr(-30, -34, 28, 1, 0.5), ROOF.light);
  }
  // the pool, or the trough with its spout
  if (level >= 2) {
    out += block(-6, -8, 26, 8, 2, STONE) + fillPath(rr(-4.4, -7.6, 19, 3, 1.4), WATER.face) + fillPath(rr(-4, -7.6, 9, 1, 0.5), WATER.light);
    out += fillPath(rr(-9, -11.6, 6, 1.6, 0.8), STONE_GREY.shade) + fillPath(`M-4 -10.6Q-1 -10.4 0 -6.4`, 'none', ` stroke="${WATER.face}" stroke-width="1.4" stroke-linecap="round"`);
  } else {
    out += ellipse(2, -1, 14, 3.6, WATER.shade) + ellipse(2, -1.6, 12, 2.8, WATER.face) + ellipse(-2, -2.4, 5, 1, WATER.light);
  }
  // the channel the overflow runs away down, and stones across it
  if (level >= 4) {
    out += fillPath(`M20 -2C30 0 34 4 46 6L46 10C32 8 28 4 18 2Z`, WATER.face) + fillPath(`M22 -1C30 1 34 4 44 6`, 'none', ` stroke="${WATER.light}" stroke-width="0.9" stroke-linecap="round"`);
    out += ellipse(30, 3.4, 2.4, 1.4, STONE_GREY.face) + ellipse(38, 6, 2.4, 1.4, STONE_GREY.face);
  }
  return out;
};

/** Market: crates on a cloth, then a stall, two, three with a rug hung up, and the arcade behind them. */
const market: Painter = (level) => {
  let out = pad(82);
  if (level === 0) return out + stakes(64);
  if (level >= 5) {
    // the covered bazaar's arches behind the stalls
    let arches = '';
    for (const x of [-42, -14, 14]) arches += `M${x} -10V-30A14 14 0 0 1 ${x + 28} -30V-10H${x + 22}V-28A8 8 0 0 0 ${x + 6} -28V-10Z`;
    out += fillPath(arches, STONE.shade) + fillPath(rr(-44, -48, 88, 6, 2), ROOF.face) + fillPath(rr(-43, -48, 86, 1.6, 0.8), ROOF.light);
    out += fillPath(arches, STONE.face, ' transform="translate(-1.4 0)"');
  }
  const stall = (x: number, colours: readonly string[], fruit: string): string =>
    awning(x, -22, 24, 6, colours) + block(x, -9, 24, 9, 1.4, WOOD, 0.2) + crate(x + 7, -9, 9, fruit) + crate(x + 17, -9, 9, SAFFRON);
  if (level === 1) {
    out += fillPath(rr(-20, -2, 40, 3, 1.2), '#e9d9b8') + crate(-10, 0, 12, RED) + crate(4, 0, 12, APRICOT) + crate(15, 0, 10, GREEN);
    return out;
  }
  out += stall(-12, [GREEN, CREAM], RED);
  if (level >= 3) out += stall(16, [RED, CREAM], APRICOT);
  if (level >= 4) out += stall(-40, [SAFFRON, CREAM], GREEN) + rug(-38, -34, 18, 10);
  return out;
};

/** Orchard: a sapling tied to its stake, then young trees, fruit, a dry-stone wall and a beehive. */
const orchard: Painter = (level) => {
  let out = pad(84);
  if (level === 0) {
    // the ground dug over and waiting
    for (const x of [-20, -6, 8, 22]) out += fillPath(rr(x - 5, -1.6, 10, 2, 1), EARTH.shade);
    return out + stakes(64);
  }
  if (level >= 4) out += block(-46, -5, 92, 5, 2, STONE_GREY, 0.08);
  if (level >= 5) out += poplar(-40, -4, 50, 8) + poplar(42, -4, 44, 7);
  const trees: readonly [number, number, number, string | null][] = [
    [-22, -2, 9, RED],
    [16, -1, 10, APRICOT],
    [-4, 2, 11, RED],
    [34, 2, 9, APRICOT],
    [-36, 3, 8, RED],
  ];
  if (level === 1) {
    out += fillPath(rr(-1, -20, 1.4, 20, 0.7), WOOD.face) + fillPath(taper([[1.5, 0], [1.5, -12]], [1.6, 0.8]), WOOD.shade) + circle(1.5, -14, 4.4, LEAF.face) + circle(0.4, -15.4, 1.6, LEAF.light);
    return out;
  }
  const count = level === 2 ? 2 : level === 3 ? 3 : level === 4 ? 4 : 5;
  const fruitCount = level >= 5 ? 6 : level >= 4 ? 4 : level >= 3 ? 3 : 0;
  // the trees further back first
  const planted = trees.slice(0, count).sort((a, b) => a[1] - b[1]);
  for (const [x, foot, size, fruit] of planted) out += tree(x, foot, level === 2 ? size * 0.7 : size, fruitCount > 0 ? fruit : null, fruitCount);
  if (level >= 5) {
    // a beehive at the orchard's edge
    out += block(38, -10, 9, 10, 2.4, WOOD, 0.24) + fillPath(rr(37, -11.6, 11, 2.4, 1.2), ROOF.face) + circle(42, -4, 1, OPENING);
  }
  return out;
};

const PAINTERS: Readonly<Record<KingdomBuilding, Painter>> = { houses, school, teahouse, spring, market, orchard };

// ───────────────────────────────────────────────────────────── the scene

/** Where each building stands in the scene: its foot's middle, how big it is drawn, and the box a tap on it covers. */
export interface KingdomPlot {
  x: number;
  y: number;
  scale: number;
  box: { x: number; y: number; w: number; h: number };
}

const plot = (x: number, y: number, scale: number): KingdomPlot => ({
  x,
  y,
  scale,
  box: { x: x - 46 * scale, y: y - 62 * scale, w: 92 * scale, h: 72 * scale },
});

/**
 * The upper terrace holds the houses, the school and the tea house; the lower
 * one the spring, the market and the orchard, nearer and drawn larger.
 */
export const KINGDOM_PLOTS: Readonly<Record<KingdomBuilding, KingdomPlot>> = {
  houses: plot(62, 150, 1.08),
  school: plot(182, 146, 1.04),
  teahouse: plot(298, 152, 1.08),
  spring: plot(62, 252, 1.22),
  market: plot(182, 248, 1.22),
  orchard: plot(298, 254, 1.22),
};

/** The sky, the peaks and the two terraces with their walls, the path and the stream, and the poplars by it. */
function land(sky: Sky, p: string, springLevel: KingdomLevel): { defs: string; body: string } {
  const W = KINGDOM_SCENE.width;
  const H = KINGDOM_SCENE.height;
  const defs = linearAt(`${p}sky`, [[0, sky.top], [1, sky.low]], 0, 0, 0, 120);
  const far: Knot[] = [[-10, 120, 0], [-10, 70], [40, 38, 0.3], [86, 66], [132, 54], [176, 24, 0.3], [222, 62], [262, 48], [306, 30, 0.3], [370, 64], [370, 120, 0]];
  const near: Knot[] = [[-10, 130, 0], [-10, 96], [60, 80], [120, 94], [190, 78], [260, 92], [320, 80], [370, 90], [370, 130, 0]];
  // snow on the three high peaks, each a cap following the ridge down a little way
  const snow = [
    [40, 38],
    [176, 24],
    [306, 30],
  ]
    .map(([x, y]) => fillPath(`M${n(x! - 11)} ${n(y! + 12)}Q${n(x! - 4)} ${n(y! + 1)} ${n(x!)} ${n(y!)}Q${n(x! + 5)} ${n(y! + 2)} ${n(x! + 12)} ${n(y! + 13)}Q${n(x! + 5)} ${n(y! + 9)} ${n(x! + 1)} ${n(y! + 12)}Q${n(x! - 4)} ${n(y! + 9)} ${n(x! - 11)} ${n(y! + 12)}Z`, sky.snow))
    .join('');
  const upper: Knot[] = [[-10, 300, 0], [-10, 104], [80, 98], [180, 106], [270, 98], [370, 104], [370, 300, 0]];
  const lower: Knot[] = [[-10, 300, 0], ...[-10, 50, 110, 170, 230, 290, 370].map((x) => [x, 170 + 4 * Math.sin((x / W) * Math.PI * 2.2)] as Knot), [370, 300, 0]];
  // each terrace held up by a dry-stone wall along its edge: a band of the wall's stone with the courses marked in its shade
  const wallKnots = (k: Knot[], drop: number): string => curve([...k.slice(1, -1), ...k.slice(1, -1).reverse().map(([x, y]) => [x, y + drop] as Knot)]);
  // the wall's stones in two courses, each laid over the joint below it, along the terrace's edge
  const edgeAt = (x: number): number => 170 + 4 * Math.sin((x / W) * Math.PI * 2.2);
  const courses = (): string => {
    const lit: string[] = [];
    const dark: string[] = [];
    for (let x = -6, i = 0; x < W; x += 15, i++) {
      for (const row of [0, 1]) {
        const sx = x + (row === 1 ? 7.5 : 0);
        (i % 3 === row ? lit : dark).push(rr(sx, edgeAt(sx) + 2 + row * 4.4, 13, 3.8, 1.8));
      }
    }
    return fillPath(dark.join(''), sky.wall.shade, ' fill-opacity="0.8"') + fillPath(lit.join(''), sky.wall.light, ' fill-opacity="0.8"');
  };
  let body =
    `<rect width="${W}" height="${H}" fill="url(#${p}sky)"/>` +
    fillPath(curve(far), sky.far) +
    fillPath(curve(far.map(([x, y, r]) => [x, y + 10, r ?? 1] as Knot)), sky.farLo, ' fill-opacity="0.6"') +
    snow +
    fillPath(curve(near), sky.near) +
    fillPath(curve(upper), sky.grass.face) +
    fillPath(curve(upper.map(([x, y, r]) => [x, y + 4, r ?? 1] as Knot)), sky.grass.light, ' fill-opacity="0.35"') +
    fillPath(wallKnots(lower, 11), sky.wall.face) +
    courses() +
    fillPath(curve(lower.map(([x, y, r]) => [x, y + 10, r ?? 1] as Knot)), sky.grass.face) +
    fillPath(curve(lower.map(([x, y, r]) => [x, y + 14, r ?? 1] as Knot)), sky.grass.shade, ' fill-opacity="0.25"');
  // the path up from the foot of the scene between the plots, and on to the upper terrace
  body += fillPath(`M170 300C176 280 196 270 188 250C182 232 160 226 172 204C180 190 202 186 196 174L206 174C214 188 192 194 186 206C176 226 198 232 202 252C208 272 190 282 196 300Z`, sky.path);
  body += fillPath(`M188 168C192 150 178 140 182 128L190 128C188 142 200 150 198 168Z`, sky.path, ' fill-opacity="0.8"');
  // the stream from the spring down to the foot of the scene, once there is water to run
  if (springLevel >= 1) {
    body += fillPath(`M86 252C100 262 104 276 120 300L134 300C116 276 112 262 94 250Z`, WATER.face) + fillPath(`M92 254C104 264 108 278 124 300`, 'none', ` stroke="${WATER.light}" stroke-width="1.2" stroke-linecap="round"`);
  }
  // poplars in a row along the stream and at the ends of the upper terrace
  body += poplar(18, 196, 44, 8) + poplar(30, 200, 36, 7) + poplar(244, 112, 34, 6) + poplar(352, 196, 40, 8) + poplar(120, 108, 30, 6);
  return { defs, body };
}

export interface KingdomSceneOptions {
  levels: Readonly<Record<KingdomBuilding, KingdomLevel>>;
  /** how wide it is drawn, in pixels; its height follows */
  width?: number;
  /** for a dark screen: the village at dusk */
  dark?: boolean;
  title?: string;
  idPrefix?: string;
}

/** The whole village, each building at its level. */
export function kingdomSceneSvg(o: KingdomSceneOptions): string {
  const width = checkSize(o.width, KINGDOM_SCENE.width);
  const height = (width * KINGDOM_SCENE.height) / KINGDOM_SCENE.width;
  const key = KINGDOM_BUILDINGS.map((b) => levelOf(o.levels, b)).join('');
  const p = prefixFor(o.idPrefix, 'kingdom', key, o.dark === true);
  const ground = land(o.dark ? DUSK : DAY, p, levelOf(o.levels, 'spring'));
  // the upper terrace first, so the lower one's buildings stand in front of it
  const order: KingdomBuilding[] = [...KINGDOM_BUILDINGS].sort((a, b) => KINGDOM_PLOTS[a].y - KINGDOM_PLOTS[b].y);
  const buildings = order.map((b) => group(KINGDOM_PLOTS[b].x, KINGDOM_PLOTS[b].y, KINGDOM_PLOTS[b].scale, PAINTERS[b](levelOf(o.levels, b)))).join('');
  const t = `${p}t`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(width)}" height="${n2(height)}" viewBox="0 0 ${KINGDOM_SCENE.width} ${KINGDOM_SCENE.height}" role="img" aria-labelledby="${t}">` +
    `<title id="${t}">${escapeXml(o.title ?? 'Your village')}</title><defs>${ground.defs}</defs>${ground.body}${buildings}</svg>`
  );
}

export interface KingdomBuildingOptions {
  building: KingdomBuilding;
  level: KingdomLevel;
  /** how big it is drawn, in pixels (it is square) */
  size?: number;
  dark?: boolean;
  title?: string;
  idPrefix?: string;
}

/** One building at one level, on a round of sky and a mound of grass: its sheet's and its celebration's picture. */
export function kingdomBuildingSvg(o: KingdomBuildingOptions): string {
  const size = checkSize(o.size, 120);
  if (!(KINGDOM_BUILDINGS as readonly string[]).includes(o.building)) throw new RangeError(`art: no building ${String(o.building)}`);
  if (!Number.isInteger(o.level) || o.level < 0 || o.level > 5) throw new RangeError(`art: no level ${String(o.level)}`);
  const sky = o.dark ? DUSK : DAY;
  const p = prefixFor(o.idPrefix, 'kingdomb', o.building, o.level, o.dark === true);
  const t = `${p}t`;
  const backdrop =
    `<circle cx="60" cy="60" r="56" fill="url(#${p}sky)"/>` +
    fillPath(curve([[8, 80, 0], [22, 62], [44, 50, 0.3], [62, 64], [82, 46, 0.3], [112, 74, 0]]), sky.far) +
    fillPath(`M6 86Q60 70 114 86A56 56 0 0 1 6 86Z`, sky.grass.face) +
    fillPath(`M10 96Q60 86 110 96A56 56 0 0 1 10 96Z`, sky.grass.shade, ' fill-opacity="0.3"');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(size)}" height="${n2(size)}" viewBox="0 0 ${CANVAS} ${CANVAS}" role="img" aria-labelledby="${t}">` +
    `<title id="${t}">${escapeXml(o.title ?? o.building)}</title><defs>${linearAt(`${p}sky`, [[0, sky.top], [1, sky.low]], 0, 4, 0, 90)}</defs>` +
    `${backdrop}${group(60, 94, 1.2, PAINTERS[o.building](o.level))}</svg>`
  );
}

function levelOf(levels: Readonly<Record<KingdomBuilding, KingdomLevel>>, b: KingdomBuilding): KingdomLevel {
  const l = levels[b];
  if (!Number.isInteger(l) || l < 0 || l > 5) throw new RangeError(`art: no level ${String(l)} for ${b}`);
  return l;
}

// ───────────────────────────────────────────────────────────── the life

/** What moves in the village: smoke rising, water shimmering, leaves stirring. */
export type KingdomLifeKind = 'smoke' | 'water' | 'leaf';

/** One moving thing: what it is and where, in the scene's units (its middle), and how big. */
export interface KingdomLifeSpot {
  kind: KingdomLifeKind;
  building: KingdomBuilding;
  x: number;
  y: number;
  size: number;
}

/** Where, in a building's own units, each level has a chimney, water or a tree that moves. */
const LIFE: Readonly<Record<KingdomBuilding, readonly { kind: KingdomLifeKind; from: KingdomLevel; x: number; y: number; size: number }[]>> = {
  houses: [
    { kind: 'smoke', from: 1, x: -0.6, y: -33, size: 10 },
    { kind: 'smoke', from: 3, x: -12, y: -49, size: 8 },
  ],
  school: [{ kind: 'smoke', from: 4, x: 31, y: -43, size: 8 }],
  teahouse: [{ kind: 'smoke', from: 2, x: -1, y: -37, size: 9 }],
  spring: [
    { kind: 'water', from: 1, x: 2, y: -2, size: 14 },
    { kind: 'water', from: 4, x: 36, y: 4, size: 10 },
  ],
  market: [],
  orchard: [
    { kind: 'leaf', from: 1, x: 1.5, y: -16, size: 6 },
    { kind: 'leaf', from: 3, x: -4, y: -16, size: 10 },
    { kind: 'leaf', from: 4, x: 16, y: -14, size: 9 },
  ],
};

/** The moving things the village has at these levels, in the scene's units. */
export function kingdomLife(levels: Readonly<Record<KingdomBuilding, KingdomLevel>>): KingdomLifeSpot[] {
  const out: KingdomLifeSpot[] = [];
  for (const b of KINGDOM_BUILDINGS) {
    const level = levelOf(levels, b);
    const at = KINGDOM_PLOTS[b];
    for (const s of LIFE[b]) {
      if (level < s.from) continue;
      // the sapling's leaves are over its stake; a grown orchard's are over its biggest tree
      if (b === 'orchard' && s.from === 1 && level >= 2) continue;
      out.push({ kind: s.kind, building: b, x: at.x + s.x * at.scale, y: at.y + s.y * at.scale, size: s.size * at.scale });
    }
  }
  return out;
}

/** The sprite each app lays over the scene where a thing moves: a puff of smoke, a glint on water, a leaf. Square, 24 units. */
export function kingdomLifeSvg(kind: KingdomLifeKind, size = 24): string {
  const s = checkSize(size, 24);
  const body =
    kind === 'smoke'
      ? circle(12, 16, 4.4, '#f4f1ec') + circle(9, 10, 3.6, '#ece8e2') + circle(14, 5, 3, '#e4dfd8')
      : kind === 'water'
        ? fillPath(rr(3, 10.6, 10, 1.8, 0.9), WATER.light) + fillPath(rr(11, 14, 9, 1.6, 0.8), WATER.light)
        : fillPath(`M5 18C5 10 11 5 19 5C19 13 13 18 5 18Z`, LEAF.face) + fillPath(`M6 17C10 13 13 10 17 7`, 'none', ` stroke="${LEAF.light}" stroke-width="1.2" stroke-linecap="round"`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(s)}" height="${n2(s)}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
}
