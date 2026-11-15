/**
 * The painted valley's landmarks for the second half of the road's year in
 * Sêvan (chapters 7 to 12): the Newroz fire on its hill, the beehives at the
 * edge of the flowering meadow, the old stone bridge, the black tents of the
 * summer pastures, the village school in autumn, and the snowbound house
 * with its hearth lit.
 *
 * Each is painted with the valley's own colours and brushes (art/valley.ts)
 * so it stands beside the road as part of the same painting: flat planes, no
 * outlines, every form one face and one step of shade with the light from
 * the upper left, and its shadow a flat patch of the ground's darker colour
 * to the lower right. Each draws its moving part at rest where `loop` says,
 * so the picture is whole when nothing moves; the apps lay the moving sprite
 * over that box.
 *
 * By evening every colour is taken toward the dusk (`dusk`) and fire and lit
 * windows stay warm (`warm`). Scatter comes only from the generator the
 * caller passes in, so a landmark is the same string every time.
 */
import { n, type Pt } from './svg.js';
import {
  VALLEY,
  blobPath,
  bush,
  dusk,
  ellipsePath,
  fill,
  flowers,
  foliage,
  poplar,
  poplarLeaves,
  roundTree,
  sheep,
  smoothPath,
  stroke,
  warm,
  type Foliage,
  type ValleyLandmark,
} from './valley.js';

const f = (v: number): string => n(v);

/** A closed polygon through the points. */
const poly = (pts: readonly Pt[]): string => `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z`;

/** A smooth line run backwards, to close a band whose other edge was drawn forwards. */
const back = (pts: readonly Pt[]): string => smoothPath([...pts].reverse()).replace(/^M/, 'L');

// ─────────────────────────────────────────────────────────── colours of these chapters

/**
 * Colours the valley's palette does not have, each needed by one season or
 * one thing here. They are kept beside the drawings that use them rather
 * than in art/valley.ts, which the first chapters' landmarks share.
 */
const HUE = {
  /** the shaded underside of an almond tree in blossom */
  blossomShade: '#e4a6bb',
  /** the blossom's deeper pink, dotted through the crown */
  blossomDeep: '#ec93b0',
  /** the flame's side away from the viewer, a step darker than the fire */
  flameShade: '#e0623a',
  /** the burnt wood under the fire */
  char: '#5b3a28',
  /** the cut end of a log, pale against its bark */
  logEnd: '#e8c08a',
  logRing: '#c99863',
  /** planks: their face, their lit top, their side in shade */
  wood: '#a87545',
  woodLight: '#c99a64',
  woodShade: '#86593a',
  /** the hives: the cream one's face and side */
  hiveCream: '#f3e7cb',
  hiveCreamSide: '#d8c49c',
  /** the bee */
  beeBody: '#2a2018',
  beeStripe: '#f6c836',
  /** the far bank seen through the bridge's arch, in the bridge's shade */
  farBank: '#9dbb72',
  /** the water under the arch, in the bridge's shade */
  waterShade: '#6fb0cb',
  /** the lit top of a stone, the walkway of the bridge */
  stoneLight: '#f1ece1',
  /** black goat-hair cloth: its lit top, its side in shade, the dark inside of the tent, and the sheen on its ridges */
  goat: '#4c4240',
  goatShade: '#332b2a',
  goatInside: '#221b1a',
  goatLight: '#61554f',
  /** the reed screen's pale reeds and their worn rope */
  reed: '#ead59b',
  rope: '#9b8a76',
  /** a sooty kettle */
  kettle: '#3b3735',
  /** the school's whitewash, its side in shade, and its window panes */
  whitewash: '#f7efdf',
  whitewashSide: '#dcc9a8',
  pane: '#6f93ab',
  /** the flagpole */
  pole: '#d8d3c9',
  /** autumn leaves on a round tree: orange, and the poplar's yellow */
  autumn: '#e68f3a',
  autumnLight: '#f4b862',
  autumnShade: '#c3692c',
  autumnPoplar: '#e2b443',
  autumnPoplarLight: '#f2d277',
  autumnPoplarShade: '#bb8c2c',
  /** a lit window by day, the fire inside showing */
  hearthWindow: '#f2c35c',
  /** smoke against the snow, a little darker than the summer's so it still reads */
  smokeOnSnow: '#d3cfc9',
  smokeOnSnowShade: '#bdb8b1',
} as const;

/** An almond tree in blossom, by day or by evening. */
function blossoms(dark: boolean): Foliage {
  return { face: dusk(VALLEY.blossom, dark), light: dusk(VALLEY.blossomWhite, dark), shade: dusk(HUE.blossomShade, dark), dots: dusk(HUE.blossomDeep, dark, 0.2) };
}

/** A round tree in its autumn orange. */
function autumnLeaves(dark: boolean): Foliage {
  return { face: dusk(HUE.autumn, dark), light: dusk(HUE.autumnLight, dark), shade: dusk(HUE.autumnShade, dark) };
}

/** A poplar gone yellow in autumn. */
function autumnPoplar(dark: boolean): Foliage {
  return { face: dusk(HUE.autumnPoplar, dark), light: dusk(HUE.autumnPoplarLight, dark), shade: dusk(HUE.autumnPoplarShade, dark) };
}

// ─────────────────────────────────────────────────────────── the moving parts at rest

type Box = ValleyLandmark['loop'];

/** The fire's flame, filling its box from the bottom: three tongues, the far side a step darker, and the hot core. */
function restFlame(box: Box, dark: boolean): string {
  const s = box.w / 26;
  const outer = 'M13 39C5 39 1 33 3 26C4 21 7 19 6 13C10 16 11 19 11.5 22C11 14 13 8 14 1C18 8 22 14 21 21C23 19 24 16 24 14C27 21 26 30 23 34C21 37 17 39 13 39Z';
  const shade = 'M14 1C18 8 22 14 21 21C23 19 24 16 24 14C27 21 26 30 23 34C21 37 17 39 13 39C18 36 20 30 18.5 22C17.5 15 16 8 14 1Z';
  const core = 'M13 38.5C8.5 38.5 6.5 34.5 7.5 30C8.5 26 11 24 11.5 19C14.5 23 18 27 18 31.5C18 35.5 16 38.5 13 38.5Z';
  return `<g transform="translate(${f(box.x)} ${f(box.y)}) scale(${n(s)})">${fill(outer, warm(VALLEY.fire, dark))}${fill(shade, warm(HUE.flameShade, dark))}${fill(core, warm(VALLEY.fireCore, dark))}</g>`;
}

/** The bee at the top of the circle it flies, where the moving bee starts. */
function restBee(box: Box, dark: boolean): string {
  const x = box.x + box.w / 2;
  const y = box.y + 4;
  return (
    fill(ellipsePath(x - 0.6, y - 2.8, 2.2, 1.4), dusk('#ffffff', dark, 0.15)) +
    fill(ellipsePath(x, y, 3.4, 2.4), dusk(HUE.beeBody, dark, 0.1)) +
    fill(`M${f(x - 1.4)} ${f(y - 2.2)}h1.2v4.4h-1.2ZM${f(x + 1)} ${f(y - 2.2)}h1.1v4.4h-1.1Z`, warm(HUE.beeStripe, dark))
  );
}

/** A ripple on the water, two rings about the middle of the box. */
function restRipple(box: Box, dark: boolean): string {
  const x = box.x + box.w / 2;
  const y = box.y + box.h / 2;
  const light = dusk(VALLEY.waterLight, dark, 0.2);
  return stroke(ellipsePath(x, y, box.w * 0.36, box.h * 0.3), light, 1.4) + stroke(ellipsePath(x, y, box.w * 0.16, box.h * 0.14), light, 1.1);
}

/** Smoke going up from the bottom middle of the box: three puffs, each with its shade a step down to the lower right. */
function restSmoke(box: Box, face: string, shade: string, random: () => number): string {
  const s = box.w / 16;
  const puffs: [number, number, number][] = [
    [8, box.h / s - 5, 3.6],
    [6.5, box.h / s - 13, 4.6],
    [9, box.h / s - 22.5, 4.2],
  ];
  let back = '';
  let front = '';
  for (const [px, py, r] of puffs) {
    const x = box.x + px * s;
    const y = box.y + py * s;
    back += blobPath(x + 0.8 * s, y + 0.8 * s, r * s, r * s * 0.92, 7, 0.16, random);
    front += blobPath(x - 0.3 * s, y - 0.3 * s, r * s * 0.86, r * s * 0.8, 7, 0.16, random);
  }
  return fill(back, shade) + fill(front, face);
}

/** A kilim flag hanging from the pole at the box's left edge: madder red, a cream band, a gold diamond and an indigo hem, its free end ragged. */
function restFlag(box: Box, dark: boolean): string {
  const s = box.w / 20;
  const c = (hex: string): string => dusk(hex, dark);
  const body = 'M0.5 1L18 1.6C19 1.7 19.4 2.4 19.2 3.4L18.8 11.2L17 13L15.4 11.4L13.6 13.1L12 11.4L10.2 13L8.6 11.4L0.5 11.6Z';
  const fold = 'M10.5 1.3L14.5 1.5L14 11.7L12 11.4L10.2 13L10.3 1.3Z';
  return (
    `<g transform="translate(${f(box.x)} ${f(box.y)}) scale(${n(s)})">` +
    fill(body, c(VALLEY.red)) +
    fill(fold, c(VALLEY.redDark)) +
    fill('M0.5 4.3L19.1 4.6L19 5.9L0.5 5.7Z', c(VALLEY.cream)) +
    fill('M6 6.6L8.4 8.4L6 10.2L3.6 8.4Z', c(VALLEY.gold)) +
    fill('M0.5 10.4L18.9 10.3L18.8 11.2L0.5 11.4Z', c(VALLEY.indigo)) +
    '</g>'
  );
}

// ─────────────────────────────────────────────────────────── small brushes of these chapters

/** A fieldstone lying on the ground: its shade a step down to the lower right, its face, and a lit cap. */
function stone(x: number, y: number, rx: number, ry: number, dark: boolean, random: () => number, tones = { face: VALLEY.stone, shade: VALLEY.stoneSide }): string {
  return fill(blobPath(x + rx * 0.22, y + ry * 0.3, rx, ry, 7, 0.22, random), dusk(tones.shade, dark)) + fill(blobPath(x - rx * 0.12, y - ry * 0.18, rx * 0.82, ry * 0.76, 7, 0.22, random), dusk(tones.face, dark));
}

/** A tuft of grass: three blades. */
function tuft(x: number, y: number, s: number, colour: string): string {
  return stroke(`M${f(x - 2.4 * s)} ${f(y - 3.4 * s)}L${f(x)} ${f(y)}L${f(x)} ${f(y - 4.6 * s)}M${f(x)} ${f(y)}L${f(x + 2.6 * s)} ${f(y - 3.2 * s)}`, colour, 1.1);
}

/** A bare winter tree: the trunk, its right side a step darker, its forked branches, and snow lying along the tops of the boughs. */
function bareTree(x: number, y: number, s: number, dark: boolean, ground: string): string {
  const bark = dusk(VALLEY.trunk, dark);
  const barkShade = dusk(HUE.woodShade, dark);
  const snow = dusk(VALLEY.snow, dark);
  const p = (pts: readonly Pt[]): Pt[] => pts.map(([dx, dy]) => [x + dx * s, y + dy * s] as Pt);
  let out = fill(ellipsePath(x + 7 * s, y + 1.5, 12 * s, 3 * s), ground);
  out += fill(poly(p([[-2.6, 0], [-1.4, -24], [1.4, -24], [2.6, 0]])), bark);
  out += fill(poly(p([[0.4, 0], [0.4, -24], [1.4, -24], [2.6, 0]])), barkShade);
  const boughs: [readonly Pt[], number][] = [
    [[[-0.6, -20], [-6, -31], [-12, -41]], 2.4],
    [[[-6, -31], [-14, -34], [-18, -40]], 1.3],
    [[[0.6, -21], [6, -33], [10, -46]], 2.2],
    [[[6, -33], [13, -36], [17, -42]], 1.2],
    [[[0, -23], [1, -38], [-1, -51]], 1.8],
    [[[1, -38], [-4, -45]], 1],
    [[[-9, -36.5], [-8, -45]], 0.9],
    [[[9, -42], [5, -49]], 0.9],
  ];
  for (const [pts, w] of boughs) out += stroke(smoothPath(p(pts)), bark, w * s);
  // snow lies on the upper side of the thicker boughs, a little above their line
  out += stroke(smoothPath(p([[-4.6, -30.6], [-8, -35.4], [-11.4, -40.6]])), snow, 1.5 * s);
  out += stroke(smoothPath(p([[5, -32.8], [7.4, -38.6], [9.6, -45]])), snow, 1.4 * s);
  out += stroke(smoothPath(p([[-9, -33.6], [-13.6, -35.2]])), snow, 1.2 * s);
  out += stroke(smoothPath(p([[0.3, -38], [-0.6, -48]])), snow, 1.1 * s);
  return out;
}

// ─────────────────────────────────────────────────────────── 7 · Newroz

const NEWROZ_FLAME: Box = { kind: 'flame', x: 47, y: 36, w: 26, h: 40 };

/**
 * The Newroz fire on its hill: a teepee of logs burning tall on a ring of
 * fieldstones, two almond trees in blossom on the slopes, and narcissus, the
 * flower of Newroz, in the spring grass.
 */
function newroz(dark: boolean, random: () => number): string {
  const c = (hex: string): string => dusk(hex, dark);
  let out = '';
  // the hill's shadow on the meadow, the hill in shade, and its lit face pulled in from the right so the shaded flank shows
  out += fill(ellipsePath(70, 112.5, 46, 4.6), c(VALLEY.meadowShade));
  out += fill(`${smoothPath([[5, 113], [20, 101], [40, 88], [60, 83.5], [82, 88], [101, 100], [115, 113]])}Z`, c(VALLEY.greenShade));
  out += fill(`${smoothPath([[5, 113], [20, 101], [40, 88], [60, 83.5], [76, 86.5], [88, 96], [95, 113]])}Z`, c(VALLEY.green));
  // the almond trees, standing on the slopes, their shadows on the grass
  out += roundTree(20, 104, 0.8, blossoms(dark), c(VALLEY.greenShade), random);
  out += roundTree(101, 106, 0.66, blossoms(dark), c(VALLEY.greenShade), random);
  for (const [x, y] of [[33, 101], [78, 104], [50, 106]] as const) out += flowers(x, y, c(VALLEY.blossomWhite));
  out += flowers(65, 99, c('#ffe68a'));
  // the ring of stones round the fire: the far ones first, behind the logs and the flame
  const ring: [number, number][] = [];
  for (let k = 0; k < 11; k++) {
    const a = (k / 11) * Math.PI * 2 + 0.2;
    ring.push([60 + Math.cos(a) * 19, 82 + Math.sin(a) * 5]);
  }
  const farStones = ring.filter(([, y]) => y < 82);
  const nearStones = ring.filter(([, y]) => y >= 82);
  out += fill(ellipsePath(62, 83, 17, 4), c(HUE.char));
  for (const [x, y] of farStones) out += stone(x, y, 3.2, 2.3, dark, random);
  // the logs leaning in to a point, their feet showing either side of the flame
  const wood = c(VALLEY.trunk);
  for (const [x0, y0] of [[44, 82], [51, 80], [69, 80], [76, 82]] as const) out += stroke(`M${x0} ${y0}L${f(60 + (x0 - 60) * 0.25)} 58`, wood, 3.2);
  out += restFlame(NEWROZ_FLAME, dark);
  // two logs across the foot of the fire, their cut ends lit
  out += stroke('M45 79.5L71 84.5', wood, 3.4) + stroke('M50 85L75 78.5', wood, 3.4);
  out += fill(ellipsePath(45, 79.5, 1.8, 1.8) + ellipsePath(75, 78.5, 1.8, 1.8), c(HUE.logEnd));
  for (const [x, y] of nearStones) out += stone(x, y, 3.4, 2.4, dark, random);
  // sparks going up
  out += fill(ellipsePath(51, 32, 1, 1) + ellipsePath(70, 28, 1.2, 1.2) + ellipsePath(64, 22, 0.8, 0.8), warm(VALLEY.fireCore, dark));
  return out;
}

// ─────────────────────────────────────────────────────────── 8 · the hives

const HIVES_BEE: Box = { kind: 'bee', x: 43, y: 22, w: 34, h: 34 };

/**
 * One painted box hive standing on the plank, seen a little from above and
 * to the right as the village's houses are: its two boxes, the side in
 * shade, the lid overhanging with its top in the light, and the entrance
 * slot on its landing board.
 */
function hive(x: number, y: number, tones: { face: string; side: string }, dark: boolean): string {
  const c = (hex: string): string => dusk(hex, dark);
  const w = 19;
  const h = 21;
  const d = 8;
  let out = fill(poly([[x + w, y], [x + w + d, y - d / 2], [x + w + d, y - d / 2 - h], [x + w, y - h]]), c(tones.side));
  out += fill(`M${f(x)} ${f(y - h)}h${w}v${h}h${-w}Z`, c(tones.face));
  out += stroke(`M${f(x)} ${f(y - h * 0.42)}h${w}l${d} ${-d / 2}`, c(tones.side), 1);
  out += fill(`M${f(x + 5)} ${f(y - 3)}h${w - 10}v1.6h${-(w - 10)}Z`, c(VALLEY.window));
  out += fill(`M${f(x + 4)} ${f(y - 1.4)}h${w - 8}v1.4h${-(w - 8)}Z`, c(HUE.woodLight));
  // the lid: its front edge, its side, its lit top
  const t = y - h;
  out += fill(poly([[x + w + 1, t], [x + w + 1 + d, t - d / 2], [x + w + 1 + d, t - d / 2 - 3], [x + w + 1, t - 3]]), c(VALLEY.wallSide));
  out += fill(`M${f(x - 1)} ${f(t - 3)}h${w + 2}v3h${-(w + 2)}Z`, c(VALLEY.parapet));
  out += fill(poly([[x - 1, t - 3], [x - 1 + d, t - 3 - d / 2], [x + w + 1 + d, t - 3 - d / 2], [x + w + 1, t - 3]]), c(VALLEY.roof));
  return out;
}

/**
 * The beehives at the edge of the flowering meadow: three painted box hives
 * in a row on a plank stand, the meadow behind them in flower, a jar of the
 * honey with a cloth tied over it, and a bee out over the flowers.
 */
function hives(dark: boolean, random: () => number): string {
  const c = (hex: string): string => dusk(hex, dark);
  let out = '';
  // the meadow behind, a field of green with its edge a step darker below it
  const field: Pt[] = [[4, 92], [9, 80], [32, 74], [62, 77], [92, 71], [112, 77], [116, 88], [100, 96], [60, 95], [18, 97]];
  out += fill(smoothPath(field.map(([x, y]) => [x + 1.5, y + 3] as Pt), true), c(VALLEY.greenShade));
  out += fill(smoothPath(field, true), c(VALLEY.green));
  const bloom = [c(VALLEY.blossomWhite), c('#ffe68a'), c(VALLEY.blossom), c(VALLEY.red)];
  for (let k = 0; k < 9; k++) {
    const x = 12 + k * 11 + random() * 5;
    const y = 79 + random() * 11;
    out += flowers(x, y, bloom[k % bloom.length]!);
  }
  out += bush(110, 84, 0.7, foliage(dark, VALLEY.blossom), c(VALLEY.greenShade), random);
  // the stand: its shadow on the grass, the stone feet, the plank's lit top and its face
  out += fill(poly([[86, 105], [96, 100], [106, 104], [96, 109]]), c(VALLEY.meadowShade));
  out += fill(ellipsePath(52, 106, 44, 3.4), c(VALLEY.meadowShade));
  for (const x of [12, 48, 84]) out += fill(`M${x} 100h6v6h-6Z`, c(VALLEY.stoneSide)) + fill(`M${x} 100h4v6h-4Z`, c(VALLEY.stone));
  out += fill(poly([[8, 99], [14, 96], [98, 96], [92, 99]]), c(HUE.woodLight));
  out += fill('M8 99h84v3h-84Z', c(HUE.wood));
  out += fill(poly([[92, 99], [98, 96], [98, 99], [92, 102]]), c(HUE.woodShade));
  // the three hives: Sêvan's blue, cream, and saffron
  out += hive(11, 97.5, { face: VALLEY.gate, side: VALLEY.gateDark }, dark);
  out += hive(38, 97.5, { face: HUE.hiveCream, side: HUE.hiveCreamSide }, dark);
  out += hive(65, 97.5, { face: VALLEY.gold, side: VALLEY.goldDark }, dark);
  // the honey jar: its shadow, the glass full of honey with its lit edge and shaded side, a red cloth tied over its mouth
  out += fill(ellipsePath(110, 113, 6, 1.8), c(VALLEY.meadowShade));
  out += fill('M101 103a3 3 0 0 1 3 -3h6a3 3 0 0 1 3 3v8a2.5 2.5 0 0 1 -2.5 2.5h-7a2.5 2.5 0 0 1 -2.5 -2.5Z', warm(VALLEY.gold, dark));
  out += fill('M110 100a3 3 0 0 1 3 3v8a2.5 2.5 0 0 1 -2.5 2.5h-1.5Z', warm(VALLEY.goldDark, dark));
  out += fill('M102.6 103.4v7', warm(VALLEY.goldLight, dark)) + stroke('M103 103.6v6.6', warm(VALLEY.goldLight, dark), 1.2);
  out += fill('M100.4 100.6C100.4 97.6 103 96.4 107 96.4C111 96.4 113.6 97.6 113.6 100.6L112.6 102.4L110.4 101.4L107 102.4L103.6 101.4L101.4 102.4Z', c(VALLEY.red));
  out += stroke('M101.4 100.2H112.6', c(VALLEY.cream), 1);
  for (const [x, y] of [[24, 110], [64, 112], [6, 106]] as const) out += flowers(x, y, c(VALLEY.blossomWhite));
  out += flowers(42, 110, c('#ffe68a'));
  out += tuft(36, 112, 1, c(VALLEY.leafShade)) + tuft(84, 113, 0.9, c(VALLEY.leafShade));
  out += restBee(HIVES_BEE, dark);
  return out;
}

// ─────────────────────────────────────────────────────────── 9 · the bridge

const BRIDGE_WATER: Box = { kind: 'water', x: 45, y: 100, w: 30, h: 12 };

/**
 * The old stone bridge: one tall arch humped over the river, as the
 * Ottoman-era bridges of the Kurdish valleys stand, its walkway lit along
 * the top, the arch ringed with its voussoirs, the river coming through
 * under it toward us between green banks, a poplar and a walnut on the far
 * side.
 */
function bridge(dark: boolean, random: () => number): string {
  const c = (hex: string): string => dusk(hex, dark);
  let out = '';
  // the trees on the banks, behind the bridge's two ramps
  out += poplar(15, 96, 0.74, poplarLeaves(dark), c(VALLEY.meadowShade));
  out += roundTree(103, 95, 0.72, foliage(dark), c(VALLEY.meadowShade), random);
  // the bridge's shadow on the bank to the lower right
  out += fill(poly([[86, 109], [112, 105], [118, 108], [94, 113]]), c(VALLEY.meadowShade));
  // the bridge: its face, the walkway along its top in the light
  const deck: Pt[] = [[5, 108], [18, 97], [38, 75], [60, 63], [82, 75], [102, 97], [115, 108]];
  out += fill(`${smoothPath(deck)}L115 109L5 109Z`, c(VALLEY.stone));
  out += stroke(smoothPath(deck.map(([x, y]) => [x, y - 1.8] as Pt)), c(HUE.stoneLight), 3.6);
  // the arch: its ring of voussoirs, the shade under it, the far bank and the water seen through it
  out += fill('M33.5 108V100A26.5 29 0 0 1 86.5 100V108Z', c(VALLEY.stoneSide));
  out += fill('M37.5 108V100A22.5 25 0 0 1 82.5 100V108Z', c(HUE.farBank));
  out += fill('M37.5 108V101A22.5 25 0 0 1 82.5 101V102C76 96 44 96 37.5 102Z', c(VALLEY.stoneSide));
  out += fill('M37.5 99.5C44 97.5 76 97.5 82.5 99.5V108H37.5Z', c(HUE.waterShade));
  const joints: string[] = [];
  for (let k = 1; k < 9; k++) {
    const a = (k / 9) * Math.PI;
    joints.push(`M${f(60 - Math.cos(a) * 22.5)} ${f(100 - Math.sin(a) * 25)}L${f(60 - Math.cos(a) * 26.5)} ${f(100 - Math.sin(a) * 29)}`);
  }
  out += stroke(joints.join(''), c(VALLEY.stone), 0.9);
  // a few courses of the masonry in the spandrels
  const courses = ['M12 104h6', 'M22 100h7', 'M15 108h5', 'M27 92h5', 'M24 106h6', 'M88 106h6', 'M92 98h6', 'M100 104h7', 'M87 90h4'];
  out += stroke(courses.join(''), c(VALLEY.stoneSide), 0.9);
  // the river coming out toward us between its banks, and the ripple under the arch
  out += fill('M32 106C28 110 26 115 32 117.5C42 120 78 120 88 117.5C94 115 92 110 88 106Z', c(VALLEY.bank));
  out += fill('M37.5 106C35 109.5 33 114 38 115.6C46 117.4 74 117.4 82 115.6C87 114 85 109.5 82.5 106Z', c(VALLEY.water));
  out += fill('M37.5 106.6C46 105 74 105 82.5 106.6V105.4H37.5Z', c(HUE.waterShade));
  out += restRipple(BRIDGE_WATER, dark);
  out += tuft(31, 111, 1, c(VALLEY.leafShade)) + tuft(89, 111, 1, c(VALLEY.leafShade));
  out += flowers(14, 112, c(VALLEY.blossomWhite));
  return out;
}

// ─────────────────────────────────────────────────────────── 10 · the tents

const TENTS_SMOKE: Box = { kind: 'smoke', x: 80, y: 72, w: 16, h: 30 };

/**
 * A black tent of woven goat hair as the herding families pitch them on the
 * summer pastures, (x, y) its front left foot: long and low, its roof cloth
 * lifted into peaks by the poles and sagging between them, its right end in
 * shade, the front open on the dark inside, a reed screen bound with a
 * woven band across the lower front, and guy ropes out to the pegs.
 */
function tent(x: number, y: number, w: number, h: number, d: number, poles: readonly number[], dark: boolean): string {
  const c = (hex: string): string => dusk(hex, dark);
  const rise = d * 0.55;
  const top = y - h;
  const ridgeY = top - d / 4 - rise;
  let out = fill(poly([[x + w, y], [x + w + d, y - d / 2], [x + w + d + 12, y - d / 2 + 5], [x + w + 12, y + 5]]), c(VALLEY.meadowShade));
  out += fill(`M${f(x - 1)} ${f(y + 0.5)}h${f(w + 2)}l4 2.4h${f(-w - 2)}Z`, c(VALLEY.meadowShade));
  // the guy ropes and their pegs
  const rope = c(HUE.rope);
  out += stroke(`M${f(x)} ${f(top + 1)}L${f(x - 5)} ${f(y + 1)}M${f(x + w + d)} ${f(top - d / 2 + 1)}L${f(x + w + d + 6)} ${f(y - d / 2 + 2)}`, rope, 0.7);
  // its right end in shade, with the gable the roof makes over it
  out += fill(poly([[x + w, y], [x + w + d, y - d / 2], [x + w + d, top - d / 2], [x + w + d / 2, ridgeY], [x + w, top]]), c(HUE.goatShade));
  // the open front: the dark inside, the poles, the reed screen with its woven band
  out += fill(`M${f(x)} ${f(top)}h${f(w)}v${f(h)}h${f(-w)}Z`, c(HUE.goatInside));
  out += stroke(poles.map((p) => `M${f(x + p)} ${f(y)}V${f(top)}`).join(''), c(HUE.woodLight), 1.1);
  const screenTop = y - h * 0.52;
  out += fill(`M${f(x)} ${f(screenTop)}h${f(w)}v${f(y - screenTop)}h${f(-w)}Z`, c(HUE.reed));
  let zig = `M${f(x + 0.5)} ${f(screenTop + 3.2)}`;
  for (let k = 0; x + 0.5 + (k + 1) * 3 <= x + w; k++) zig += `l3 ${k % 2 ? -2 : 2}`;
  out += stroke(zig, c(VALLEY.red), 1);
  out += stroke(`M${f(x)} ${f(screenTop + 0.4)}h${f(w)}M${f(x)} ${f(y - 1.4)}h${f(w)}`, c(VALLEY.indigo), 0.8);
  // the roof cloth: its front edge lifted at each pole and sagging between, its ridge peaked over them
  const xs = [0, ...poles, w];
  const eave: Pt[] = [];
  const ridge: Pt[] = [];
  xs.forEach((p, i) => {
    eave.push([x + p + (i === 0 ? -1 : i === xs.length - 1 ? 1 : 0), top - 0.6]);
    ridge.push([x + p + d / 2, ridgeY - (i === 0 || i === xs.length - 1 ? 0 : 2.4)]);
    if (i < xs.length - 1) {
      const m = (p + xs[i + 1]!) / 2;
      eave.push([x + m, top + 1.6]);
      ridge.push([x + m + d / 2, ridgeY + 0.6]);
    }
  });
  out += fill(`${smoothPath(eave)}${back(ridge)}Z`, c(HUE.goat));
  // the woven strips of the cloth, and the sheen where it is pulled tight over the poles
  for (const t of [0.36, 0.68]) out += stroke(smoothPath(eave.map(([ex, ey], i) => [ex + (ridge[i]![0] - ex) * t, ey + (ridge[i]![1] - ey) * t] as Pt)), c(HUE.goatShade), 0.7);
  out += stroke(poles.map((p) => `M${f(x + p + d / 2 - 0.4)} ${f(ridgeY - 1.4)}L${f(x + p + 0.6)} ${f(top - 1.6)}`).join(''), c(HUE.goatLight), 1.4);
  return out;
}

/**
 * The summer pastures: two black goat-hair tents pitched on the high grass,
 * the nearer one long and the farther smaller, rocks of the mountain, a
 * sheep, and the cooking fire with its kettle and smoke.
 */
function tents(dark: boolean, random: () => number): string {
  const c = (hex: string): string => dusk(hex, dark);
  let out = '';
  out += stone(106, 92, 7, 4.6, dark, random);
  out += stone(114, 96, 4, 2.8, dark, random);
  out += tent(64, 86, 32, 12, 10, [11, 21], dark);
  out += tent(6, 101, 52, 17, 14, [13, 26, 39], dark);
  // the cooking fire: its hearthstones, the burning sticks, a little flame, and the kettle set beside it
  const fx = TENTS_SMOKE.x + 8;
  const fy = 106;
  out += fill(ellipsePath(fx + 3, fy + 3, 9, 2.4), c(VALLEY.meadowShade));
  out += stone(fx - 6, fy + 1, 2.4, 1.8, dark, random) + stone(fx + 6, fy + 1, 2.4, 1.8, dark, random);
  out += stroke(`M${f(fx - 4)} ${f(fy + 2)}L${f(fx + 3)} ${f(fy - 1)}M${f(fx + 4)} ${f(fy + 2)}L${f(fx - 3)} ${f(fy - 1)}`, c(VALLEY.trunk), 1.6);
  out += fill(`M${f(fx)} ${f(fy - 9)}C${f(fx + 3)} ${f(fy - 5)} ${f(fx + 4)} ${f(fy - 2)} ${f(fx + 2.4)} ${f(fy)}C${f(fx + 1)} ${f(fy + 1)} ${f(fx - 2)} ${f(fy + 1)} ${f(fx - 2.6)} ${f(fy - 0.6)}C${f(fx - 3.6)} ${f(fy - 3)} ${f(fx - 1)} ${f(fy - 5)} ${f(fx)} ${f(fy - 9)}Z`, warm(VALLEY.fire, dark));
  out += fill(`M${f(fx)} ${f(fy - 4)}C${f(fx + 1.4)} ${f(fy - 2)} ${f(fx + 1.4)} ${f(fy)} ${f(fx)} ${f(fy)}C${f(fx - 1.4)} ${f(fy)} ${f(fx - 1.2)} ${f(fy - 2)} ${f(fx)} ${f(fy - 4)}Z`, warm(VALLEY.fireCore, dark));
  out += restSmoke(TENTS_SMOKE, c(VALLEY.smoke), c(VALLEY.woolShade), random);
  const kx = fx + 13;
  const ky = 109;
  out += fill(ellipsePath(kx + 2, ky + 1, 5, 1.4), c(VALLEY.meadowShade));
  out += stroke(`M${f(kx - 3)} ${f(ky - 5)}C${f(kx - 3)} ${f(ky - 10)} ${f(kx + 3)} ${f(ky - 10)} ${f(kx + 3)} ${f(ky - 5)}`, c(HUE.kettle), 0.9);
  out += stroke(`M${f(kx - 3)} ${f(ky - 3)}L${f(kx - 7)} ${f(ky - 6)}`, c(HUE.kettle), 1.4);
  out += fill(`M${f(kx - 4)} ${f(ky)}C${f(kx - 5)} ${f(ky - 4)} ${f(kx - 3)} ${f(ky - 6)} ${f(kx)} ${f(ky - 6)}C${f(kx + 3)} ${f(ky - 6)} ${f(kx + 5)} ${f(ky - 4)} ${f(kx + 4)} ${f(ky)}Z`, c(HUE.kettle));
  out += fill(ellipsePath(kx - 1.6, ky - 3.6, 1, 1.4), c('#6a6461'));
  out += sheep(22, 108, 1, c(VALLEY.meadowShade), dark);
  out += stone(48, 112, 3.6, 2.4, dark, random);
  out += tuft(6, 110, 1, c(VALLEY.leafShade)) + tuft(66, 111, 0.9, c(VALLEY.leafShade));
  out += flowers(104, 113, c('#ffe68a'));
  return out;
}

// ─────────────────────────────────────────────────────────── 11 · the school

const SCHOOL_FLAG: Box = { kind: 'flag', x: 97, y: 22, w: 20, h: 16 };

/**
 * The village school in autumn: one long whitewashed room under a red tin
 * roof, its gable end in shade, a row of tall windows and a blue door, the
 * flag on its pole by the yard, and the trees gone orange and yellow, their
 * leaves on the ground.
 */
function school(dark: boolean, random: () => number): string {
  const c = (hex: string): string => dusk(hex, dark);
  let out = '';
  const x = 10;
  const y = 104;
  const w = 62;
  const h = 19;
  const d = 14;
  const rise = 8;
  const top = y - h;
  const ridgeY = top - d / 4 - rise;
  // the poplar behind, and the yard of beaten earth the school stands in
  out += poplar(88, 92, 0.8, autumnPoplar(dark), c(VALLEY.meadowShade));
  out += fill(blobPath(56, 106, 54, 8.5, 12, 0.08, random), c(VALLEY.dirt));
  // the school's shadow, its gable end in shade, its front, the blue plinth, the windows and the door
  out += fill(poly([[x + w, y], [x + w + d, y - d / 2], [x + w + d + 12, y - d / 2 + 6], [x + w + 12, y + 6]]), c(VALLEY.dirtEdge));
  out += fill(poly([[x + w, y], [x + w + d, y - d / 2], [x + w + d, top - d / 2], [x + w + d / 2, ridgeY], [x + w, top]]), c(HUE.whitewashSide));
  out += fill(`M${x} ${top}h${w}v${h}h${-w}Z`, c(HUE.whitewash));
  out += fill(`M${x} ${y - 3}h${w}v3h${-w}Z`, c(VALLEY.gate));
  out += fill(poly([[x + w, y], [x + w + d, y - d / 2], [x + w + d, y - d / 2 - 3], [x + w, y - 3]]), c(VALLEY.gateDark));
  const lit = dark ? warm(HUE.hearthWindow, true) : HUE.pane;
  for (let k = 0; k < 4; k++) {
    const wx = x + 17 + k * 11.5;
    out += fill(`M${f(wx)} ${top + 4}h7v9.5h-7Z`, lit);
    out += stroke(`M${f(wx + 3.5)} ${top + 4}v9.5M${f(wx)} ${top + 8.5}h7`, c(HUE.whitewash), 0.8);
    out += fill(`M${f(wx - 0.8)} ${top + 13.5}h8.6v1.4h-8.6Z`, c(HUE.whitewashSide));
  }
  out += fill(`M${x + 4} ${y}v-13h9v13Z`, c(VALLEY.gate));
  out += fill(`M${x + 8.5} ${y}v-13h4.5v13Z`, c(VALLEY.gateLight));
  out += fill(`M${x + 2.6} ${y - 14.6}h11.8v1.8h-11.8Z`, c(VALLEY.redDark));
  // the red tin roof: its front slope in the light with the ribs of the tin, the edge of the far slope over the gable
  out += fill(poly([[x + w + d / 2 + 1.5, ridgeY], [x + w + d + 1.5, top - d / 2 + 0.8], [x + w + d + 1.5, top - d / 2 + 2.6], [x + w + d / 2 + 1, ridgeY + 2.2]]), c(VALLEY.redDark));
  const roof = poly([[x - 2, top + 1], [x + w + 2, top + 1], [x + w + 2 + d / 2, ridgeY], [x - 2 + d / 2, ridgeY]]);
  out += fill(roof, c(VALLEY.red));
  const ribs: string[] = [];
  for (let k = 1; k < 12; k++) {
    const rx = x - 2 + (k * (w + 4)) / 12;
    ribs.push(`M${f(rx)} ${top + 0.6}L${f(rx + d / 2)} ${f(ridgeY + 0.6)}`);
  }
  out += stroke(ribs.join(''), c(VALLEY.redDark), 0.6);
  out += stroke(`M${f(x - 2 + d / 2)} ${f(ridgeY)}H${f(x + w + 2 + d / 2)}`, c(VALLEY.redDark), 1.6);
  // the round tree in front at the yard's corner, in its autumn orange
  out += roundTree(14, 112, 0.62, autumnLeaves(dark), c(VALLEY.dirtEdge), random);
  // the flagpole on its stone foot, and the flag hanging at rest
  const px = SCHOOL_FLAG.x;
  out += fill(ellipsePath(px + 5, 110.5, 6, 1.6), c(VALLEY.dirtEdge));
  out += fill(`M${px - 3} 110.5v-3h6v3Z`, c(VALLEY.stoneSide)) + fill(`M${px - 3} 107.5l1.5 -1h6l-1.5 1Z`, c(VALLEY.stone));
  out += stroke(`M${px} 107V${SCHOOL_FLAG.y}`, c(HUE.pole), 1.5);
  out += fill(ellipsePath(px, SCHOOL_FLAG.y - 1, 1.5, 1.5), c(VALLEY.gold));
  out += restFlag(SCHOOL_FLAG, dark);
  // fallen leaves on the yard
  let leaves = '';
  for (let k = 0; k < 9; k++) leaves += ellipsePath(24 + random() * 80, 106 + random() * 7, 1.2, 0.8);
  out += fill(leaves, c(HUE.autumn));
  return out;
}

// ─────────────────────────────────────────────────────────── 12 · the hearth

const HEARTH_SMOKE: Box = { kind: 'smoke', x: 66, y: 30, w: 16, h: 30 };

/**
 * Winter: an earth house deep in snow, the snow lying thick on its flat roof
 * and over the lip of the front, the chimney smoking, the window lit by the
 * fire inside, a stack of firewood against the wall with snow on it, and a
 * bare tree beside the house.
 */
function hearth(dark: boolean, random: () => number): string {
  const c = (hex: string): string => dusk(hex, dark);
  const snow = c(VALLEY.snow);
  const snowShade = c(VALLEY.snowShade);
  let out = '';
  // the snowy ground the house stands in
  out += fill(blobPath(60, 106, 58, 11, 12, 0.1, random), snow);
  out += bareTree(105, 100, 0.95, dark, snowShade);
  // the house: its shadow on the snow, the side in shade, the front, the blue door and the lit window
  const x = 32;
  const y = 104;
  const w = 50;
  const h = 25;
  const d = 16;
  const top = y - h;
  out += fill(poly([[x + w, y], [x + w + d, y - d / 2], [x + w + d + 11, y - d / 2 + 6], [x + w + 11, y + 6]]), snowShade);
  out += fill(poly([[x + w, y], [x + w + d, y - d / 2], [x + w + d, top - d / 2], [x + w, top]]), c(VALLEY.wallSide));
  out += fill(`M${x} ${top}h${w}v${h}h${-w}Z`, c(VALLEY.wall));
  out += fill(`M${x + 8} ${y}v-13a5.5 5.5 0 0 1 11 0v13Z`, c(VALLEY.gate));
  out += fill(`M${x + 13.5} ${y}v-18.5a5.5 5.5 0 0 1 5.5 5.5v13Z`, c(VALLEY.gateLight));
  out += fill(`M${x + 31} ${top + 7}h9v7h-9Z`, warm(HUE.hearthWindow, dark));
  out += stroke(`M${x + 35.5} ${top + 7}v7`, c(VALLEY.window), 0.9);
  // the chimney on the roof, built of the same earth, with its own cap of snow
  const cx = HEARTH_SMOKE.x + 8;
  const cy = HEARTH_SMOKE.y + HEARTH_SMOKE.h;
  out += fill(poly([[cx + 3, cy + 12], [cx + 5.5, cy + 10.8], [cx + 5.5, cy + 0.6], [cx + 3, cy + 1.6]]), c(VALLEY.wallSide));
  out += fill(`M${cx - 3} ${cy + 1.6}h6v10.4h-6Z`, c(VALLEY.wall));
  out += fill(blobPath(cx + 1, cy + 0.6, 4.8, 2, 8, 0.12, random), snow);
  // the snow on the roof: its lit top heaped soft, and the lip it makes over the front edge and the side, a step in shade
  out += fill(`M${x - 1} ${top + 0.4}H${x + w + 1}L${x + w + d + 1} ${top - d / 2}V${top - d / 2 + 2.4}L${x + w + 1} ${top + 3}C${x + w - 3} ${top + 5} ${x + w - 6} ${top + 2.6} ${x + w - 10} ${top + 3.4}C${x + w - 14} ${top + 4.4} ${x + w - 17} ${top + 2.4} ${x + w - 22} ${top + 3}C${x + w - 26} ${top + 3.6} ${x + w - 28} ${top + 5.6} ${x + w - 32} ${top + 3.4}C${x + w - 36} ${top + 2.4} ${x + w - 40} ${top + 4.6} ${x + w - 44} ${top + 3.2}C${x + w - 47} ${top + 2.4} ${x + 1} ${top + 4} ${x - 1} ${top + 3}Z`, snowShade);
  out += fill(smoothPath([[x - 1.5, top + 0.6], [x + 6, top - 4], [x + d - 1, top - d / 2 - 0.6], [x + d + 20, top - d / 2 - 1.8], [x + w + d + 1, top - d / 2 - 0.2], [x + w + d - 3, top - d / 2 + 2.4], [x + w + 1, top + 0.8], [x + 24, top + 1.2]], true), snow);
  // the firewood stack against the wall: the bark behind, the cut ends of the logs, and snow along its top
  const sx = 9;
  const sy = 106;
  out += fill(poly([[sx + 22, sy], [sx + 27, sy - 2.5], [sx + 26, sy - 13], [sx + 19, sy - 15.5]]), c(HUE.woodShade));
  out += fill(poly([[sx, sy], [sx + 23, sy], [sx + 21, sy - 14], [sx + 3, sy - 14]]), c(VALLEY.trunk));
  let ends = '';
  let rings = '';
  const rows: [number, number, number][] = [
    [sy - 2.8, sx + 3.2, 5],
    [sy - 7.6, sx + 5.6, 4],
    [sy - 12.4, sx + 8, 3],
  ];
  for (const [ry, rx0, count] of rows) {
    for (let k = 0; k < count; k++) {
      const lx = rx0 + k * 4.8 + (random() - 0.5) * 0.6;
      ends += ellipsePath(lx, ry, 2.3, 2.3);
      rings += ellipsePath(lx + 0.2, ry + 0.2, 0.9, 0.9);
    }
  }
  out += fill(ends, c(HUE.logEnd)) + fill(rings, c(HUE.logRing));
  out += fill(smoothPath([[sx + 3.5, sy - 13.6], [sx + 8, sy - 16.4], [sx + 14, sy - 16.8], [sx + 21, sy - 16.6], [sx + 24, sy - 14.2], [sx + 18, sy - 13.4], [sx + 10, sy - 14.2]], true), snow);
  out += fill(ellipsePath(sx + 25, sy + 1.6, 9, 1.8), snowShade);
  // the drift along the foot of the walls, and the trodden way from the door
  out += fill(smoothPath([[x - 3, y + 1.2], [x + 10, y - 1.6], [x + 30, y - 0.8], [x + w + 4, y - 2], [x + w + d - 2, y - d / 2 + 1], [x + w + d + 2, y - d / 2 + 3], [x + w + 8, y + 3], [x + 20, y + 3.6]], true), snow);
  let steps = '';
  for (let k = 0; k < 4; k++) steps += ellipsePath(x + 13.5 - k * 2.2 + (k % 2) * 2.4, y + 3.4 + k * 3.4, 1.3, 0.8);
  out += fill(steps, snowShade);
  out += restSmoke(HEARTH_SMOKE, c(HUE.smokeOnSnow), c(HUE.smokeOnSnowShade), random);
  return out;
}

// ─────────────────────────────────────────────────────────── the set

/** The landmarks of chapters 7 to 12, each with the box its moving part sits in. */
export const VALLEY_LANDMARKS_2: Record<'newroz' | 'hives' | 'bridge' | 'tents' | 'school' | 'hearth', ValleyLandmark> = {
  newroz: { draw: newroz, loop: NEWROZ_FLAME },
  hives: { draw: hives, loop: HIVES_BEE },
  bridge: { draw: bridge, loop: BRIDGE_WATER },
  tents: { draw: tents, loop: TENTS_SMOKE },
  school: { draw: school, loop: SCHOOL_FLAG },
  hearth: { draw: hearth, loop: HEARTH_SMOKE },
};
