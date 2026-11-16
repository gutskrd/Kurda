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
import { n, n2, type Pt } from './svg.js';
import {
  FLAME,
  VALLEY,
  blobPath,
  dusk,
  ellipsePath,
  fill,
  flowers,
  foliage,
  bark,
  grownTree,
  orchardTree,
  poplar,
  poplarLeaves,
  sheep,
  smoothPath,
  stroke,
  warm,
  type Foliage,
  type TreeShape,
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
  /** an almond tree in blossom: the lit cap of its crown, and its underside in shade */
  blossomLight: '#fde4ec',
  blossomShade: '#e4a6bb',
  /** the burnt ground under the fire, and the grass round it lit warm by the flames */
  char: '#6b4a34',
  glow: '#e3dc8c',
  /** a hill further off, paler for the distance, and its flank in shade */
  farHill: '#c2d3a0',
  farHillShade: '#adc18c',
  /** the cut end of a log, pale against its bark, and its rings */
  logEnd: '#e8c08a',
  logRing: '#c99863',
  /** planks: their face, their lit top, their side in shade */
  wood: '#a87545',
  woodLight: '#c99a64',
  woodShade: '#86593a',
  /** the cream hive's face and side */
  hiveCream: '#f3e7cb',
  hiveCreamSide: '#d8c49c',
  /** the bee */
  beeBody: '#2a2018',
  beeStripe: '#f6c836',
  /** a poppy's red, a daisy's white is the valley's blossom white, and the yellow of the meadow's buttercups */
  poppy: '#d9473a',
  buttercup: '#f6d256',
  /** the old bridge's limestone: its face, the shade under the arch, and its lit edges */
  lime: '#e2d3b4',
  limeShade: '#bfa985',
  limeLight: '#f2e9d5',
  /** the far bank seen through the bridge's arch */
  farBank: '#9dbb72',
  /** the water under the arch, in the bridge's shade */
  waterShade: '#72b2cc',
  /** black goat-hair cloth: its lit top, its side in shade, the dark inside of the tent, and the sheen along its ridge */
  goat: '#4c4240',
  goatShade: '#352d2b',
  goatInside: '#221b1a',
  goatLight: '#695c55',
  /** the reed screen's pale reeds, and the worn rope of the guy lines */
  reed: '#ead59b',
  rope: '#9b8a76',
  /** a sooty kettle and the light on its shoulder */
  kettle: '#3b3735',
  kettleLight: '#6a6461',
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
  /** a window lit by the fire inside */
  lamp: '#f2c35c',
  /** summer smoke and its shaded side */
  smoke: '#ece8e2',
  smokeShade: '#d4cec4',
  /** smoke against the snow, a cool grey a step darker than the snow so it still reads */
  smokeOnSnow: '#cdd0d7',
  smokeOnSnowShade: '#b4b8c2',
} as const;

/** An almond tree in blossom, by day or by evening. */
function blossoms(dark: boolean): Foliage {
  return {
    face: dusk(VALLEY.blossom, dark),
    light: dusk(HUE.blossomLight, dark),
    shade: dusk(HUE.blossomShade, dark),
    dots: dusk(VALLEY.blossomWhite, dark, 0.2),
  };
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

/** The fire's flames at rest, filling their box from the bottom: the same three tongues the apps make flicker over them. */
function restFlame(box: Box, dark: boolean): string {
  const s = box.w / FLAME.w;
  return (
    `<g transform="translate(${f(box.x)} ${f(box.y)}) scale(${n2(s)})">` +
    fill(FLAME.outer, warm(VALLEY.flame, dark)) +
    fill(FLAME.face, warm(VALLEY.fire, dark)) +
    fill(FLAME.core, warm(VALLEY.fireCore, dark)) +
    '</g>'
  );
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
  return stroke(ellipsePath(x, y, box.w * 0.34, box.h * 0.26), light, 1.3) + stroke(ellipsePath(x, y, box.w * 0.14, box.h * 0.11), light, 1);
}

/**
 * Smoke going up from the bottom middle of the box: one plume, thin where it
 * leaves the fire and billowing into rounded lobes as it rises and drifts,
 * its shade a step down along its lower right.
 */
function restSmoke(box: Box, face: string, shade: string): string {
  const s = box.w / 16;
  const k = box.h / s / 30;
  const plume: Pt[] = [
    [8, 29.6],
    [9.6, 26.4],
    [10.4, 23],
    [12.6, 19.6],
    [13.2, 15],
    [14.8, 10.6],
    [14.2, 5.4],
    [11.6, 2],
    [8.4, 3],
    [7.2, 6.6],
    [4.4, 9.2],
    [3.2, 13.6],
    [5, 17],
    [4, 20.6],
    [5.8, 24],
    [7, 27.2],
  ];
  const at = (dx: number, dy: number): Pt[] => plume.map(([px, py]) => [box.x + (px + dx) * s, box.y + (py * k + dy) * s] as Pt);
  // the face is drawn a little up and to the left of the shade, its foot pulled up so the shade shows under it
  const lit = at(-0.3, -0.3).map(([x, y], i) => (i === 0 ? [x, y - 0.6 * s] : [x, y]) as Pt);
  return fill(smoothPath(at(0.7, 0.6), true), shade) + fill(smoothPath(lit, true), face);
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

/** A fieldstone lying on the ground: its shade a step down to the lower right, and its face. */
function stone(x: number, y: number, rx: number, ry: number, dark: boolean, random: () => number): string {
  return (
    fill(blobPath(x + rx * 0.22, y + ry * 0.3, rx, ry, 7, 0.22, random), dusk(VALLEY.stoneSide, dark)) +
    fill(blobPath(x - rx * 0.12, y - ry * 0.18, rx * 0.82, ry * 0.76, 7, 0.22, random), dusk(VALLEY.stone, dark))
  );
}

/**
 * A boulder of the high pastures, (x, y) the middle of its foot: its shadow,
 * then the rock cut in two facets, the one turned to the light on the left
 * and the one turned away in shade, as a broken stone shows.
 */
function rock(x: number, y: number, w: number, h: number, dark: boolean, ground: string): string {
  const c = (hex: string): string => dusk(hex, dark);
  const p = (pts: readonly (readonly [number, number])[]): Pt[] => pts.map(([u, v]) => [x + u * w, y - v * h] as Pt);
  let out = fill(ellipsePath(x + w * 0.3, y + 0.4, w * 0.6, Math.max(1.6, h * 0.22)), ground);
  out += fill(poly(p([[-0.5, 0], [-0.44, 0.52], [-0.16, 0.96], [0.12, 1], [0.34, 0.72], [0.5, 0.34], [0.48, 0]])), c(VALLEY.stoneSide));
  out += fill(poly(p([[-0.5, 0], [-0.44, 0.52], [-0.16, 0.96], [0.12, 1], [0.02, 0.5], [0.12, 0]])), c(VALLEY.stone));
  return out;
}

/** A tuft of grass: three pointed blades rising from one broad foot, filled as one shape. */
function tuft(x: number, y: number, s: number, colour: string): string {
  const p = (u: number, v: number): string => `${f(x + u * s)} ${f(y - v * s)}`;
  const left = `M${p(-2.6, 0)}Q${p(-2.8, 2)} ${p(-3.8, 4.2)}Q${p(-1.6, 3)} ${p(-0.8, 1.6)}`;
  const middle = `Q${p(-0.6, 4)} ${p(0.4, 5.8)}Q${p(1, 3.4)} ${p(1, 1.6)}`;
  const right = `Q${p(2.4, 3)} ${p(3.8, 3.6)}Q${p(2.8, 1.8)} ${p(2.6, 0)}Z`;
  return fill(left + middle + right, colour);
}

/** Wildflowers on their stems, the heads of each colour gathered into one shape. */
function wildflowers(spots: readonly (readonly [number, number, number, string])[], stem: string): string {
  let stems = '';
  const heads = new Map<string, string>();
  for (const [x, y, h, colour] of spots) {
    stems += `M${f(x)} ${f(y)}Q${f(x - 0.8)} ${f(y - h / 2)} ${f(x + 0.3)} ${f(y - h)}`;
    heads.set(colour, (heads.get(colour) ?? '') + ellipsePath(x + 0.3, y - h, 1.7, 1.5));
  }
  let out = stroke(stems, stem, 0.8);
  for (const [colour, d] of heads) out += fill(d, colour);
  return out;
}

/** A bare winter tree: the trunk, its right side a step darker, its forked boughs, and snow lying along the tops of the boughs. */
function bareTree(x: number, y: number, s: number, dark: boolean, ground: string): string {
  const bark = dusk(VALLEY.trunk, dark);
  const barkShade = dusk(HUE.woodShade, dark);
  const snow = dusk(VALLEY.snow, dark);
  const p = (pts: readonly Pt[]): Pt[] => pts.map(([dx, dy]) => [x + dx * s, y + dy * s] as Pt);
  let out = fill(ellipsePath(x + 6 * s, y + 1.5, 9 * s, 2.6 * s), ground);
  out += fill(poly(p([[-3, 0], [-1.6, -24], [1.6, -24], [3, 0]])), bark);
  out += fill(poly(p([[0.4, 0], [0.4, -24], [1.6, -24], [3, 0]])), barkShade);
  const boughs: [readonly Pt[], number][] = [
    [[[-0.8, -20], [-6, -31], [-10.5, -42]], 2.8],
    [[[-6, -31], [-11.5, -34], [-14, -40]], 1.5],
    [[[0.8, -21], [6, -32], [9.5, -45]], 2.6],
    [[[6, -32], [11, -35.5], [13.5, -41]], 1.4],
    [[[0, -23], [1, -38], [-0.6, -52]], 2.1],
    [[[1, -38], [-3.6, -45.5]], 1.1],
    [[[-8.4, -37], [-6.4, -45.5]], 1],
    [[[8.6, -41], [5, -48.5]], 1],
  ];
  for (const [pts, w] of boughs) out += stroke(smoothPath(p(pts)), bark, w * s);
  // snow lies on the upper side of the thicker boughs, a little above their line
  out += stroke(smoothPath(p([[-4.8, -30.8], [-7.8, -36], [-10.4, -41.6]])), snow, 1.6 * s);
  out += stroke(smoothPath(p([[5.2, -32.4], [7.4, -38.6], [9, -44.4]])), snow, 1.5 * s);
  out += stroke(smoothPath(p([[-8, -33.4], [-12, -35.2]])), snow, 1.2 * s);
  out += stroke(smoothPath(p([[0.4, -38], [-0.4, -50]])), snow, 1.2 * s);
  return out;
}

// ─────────────────────────────────────────────────────────── 7 · Newroz

const NEWROZ_FLAME: Box = { kind: 'flame', x: 50.4, y: 25, w: 26, h: 40 };

/** A ribbon along a line of points, each with how wide it is there: a path up a hill that narrows as it goes. */
function ribbon(line: readonly (readonly [number, number, number])[]): string {
  const left: Pt[] = [];
  const right: Pt[] = [];
  line.forEach(([x, y, w], i) => {
    const [ax, ay] = line[Math.max(0, i - 1)]!;
    const [bx, by] = line[Math.min(line.length - 1, i + 1)]!;
    const len = Math.hypot(bx - ax, by - ay) || 1;
    left.push([x + ((by - ay) / len) * w, y - ((bx - ax) / len) * w]);
    right.push([x - ((by - ay) / len) * w, y + ((bx - ax) / len) * w]);
  });
  return `${smoothPath(left)}${back(right)}Z`;
}

/** A torch stuck in the ground beside the way up, `s` times full size: its stake, the rag bound round its head, and its flame. */
function torch(x: number, y: number, s: number, dark: boolean, ground: string): string {
  const q = (u: number, v: number): string => `${f(x + u * s)} ${f(y - v * s)}`;
  const flame = `M${q(0, 9.6)}C${q(-2.2, 10)} ${q(-2.1, 12.6)} ${q(0.7, 15.6)}C${q(1.6, 13)} ${q(2.4, 10.4)} ${q(0, 9.6)}Z`;
  const core = `M${q(0.1, 9.9)}C${q(-1, 10.2)} ${q(-0.9, 11.6)} ${q(0.4, 13)}C${q(0.9, 11.8)} ${q(1.2, 10.4)} ${q(0.1, 9.9)}Z`;
  return (
    fill(ellipsePath(x + 1.6 * s, y + 0.3, 2.4 * s, 0.8 * s), ground) +
    stroke(`M${q(0, 0)}L${q(0.3, 8.6)}`, dusk(HUE.woodShade, dark), 1.1 * s) +
    fill(`M${q(-0.9, 8)}h${f(2.2 * s)}v${f(-1.8 * s)}h${f(-2.2 * s)}Z`, dusk(HUE.char, dark)) +
    fill(flame, warm(VALLEY.fire, dark)) +
    fill(core, warm(VALLEY.fireCore, dark))
  );
}

/** A clump of narcissus, the flower of Newroz: its blades, and white heads with their yellow cups, `count` of them. */
function narcissus(x: number, y: number, s: number, count: number, dark: boolean, random: () => number): string {
  let blades = '';
  let heads = '';
  let cups = '';
  for (let k = 0; k < count + 1; k++) {
    const lean = (k - count / 2) * 1.3 * s + (random() - 0.5) * s;
    blades += `M${f(x + (k - count / 2) * 0.8 * s)} ${f(y)}Q${f(x + lean * 0.4)} ${f(y - 4 * s)} ${f(x + lean)} ${f(y - (6.4 + random() * 2) * s)}`;
  }
  for (let k = 0; k < count; k++) {
    const hx = x + (k - (count - 1) / 2) * 2.6 * s + (random() - 0.5) * s;
    const hy = y - (7 + random() * 2.6) * s;
    heads += ellipsePath(hx, hy, 1.7 * s, 1.45 * s);
    cups += ellipsePath(hx + 0.3 * s, hy - 0.2 * s, 0.7 * s, 0.65 * s);
  }
  return stroke(blades, dusk(VALLEY.leafShade, dark), 0.8 * s) + fill(heads, dusk(VALLEY.blossomWhite, dark, 0.2)) + fill(cups, dusk(HUE.buttercup, dark));
}

/**
 * The Newroz fire on its hill, as the villages light it on the evening of the
 * twentieth of March: a heap of logs and brushwood burning on the bare top of
 * the hill, its sparks and smoke going off with the wind, more wood stacked
 * ready beside it, and the way up lit by torches stuck in the ground. A fire
 * burns on the next hill too, as on every hilltop that night. An almond is in
 * blossom on the slope, and narcissus, the flower of Newroz, is out in the
 * grass.
 */
function newroz(dark: boolean, random: () => number): string {
  const c = (hex: string): string => dusk(hex, dark);
  const ground = c(VALLEY.meadowShade);
  const wood = c(VALLEY.trunk);
  const woodShade = c(HUE.woodShade);
  let out = '';
  // the next hill, paler for being further off, with its own small fire on top
  out += fill(`${smoothPath([[70, 104], [84, 92], [96, 84.4], [105, 81.2], [112, 82.6], [119, 86.4]])}L119 104Z`, c(HUE.farHill));
  out += fill(`${smoothPath([[105, 81.2], [112, 82.6], [119, 86.4]])}L119 104L110 104C111.4 96 109.6 87.6 105 81.2Z`, c(HUE.farHillShade));
  out += `<g transform="translate(103.4 76.2) scale(0.13)">${fill(FLAME.outer, warm(VALLEY.flame, dark))}${fill(FLAME.core, warm(VALLEY.fireCore, dark))}</g>`;
  // the hill's shadow on the meadow, then the hill: its face in the light, its right flank in shade
  out += fill(ellipsePath(70, 113.6, 47, 3.6), ground);
  const hill: Pt[] = [[1, 114.8], [10, 107.6], [21, 98.4], [33, 88.2], [45, 78.4], [55, 71.8], [63.4, 69.4], [71.4, 70.2], [80.6, 74.4], [90.4, 81.4], [100.6, 90.2], [110.4, 100], [119, 107.6]];
  out += fill(`${smoothPath(hill)}L119 115.4L1 115.4Z`, c(VALLEY.green));
  out += fill(`${smoothPath(hill.slice(7))}L119 115.4L104.6 115.4C100.2 108.6 95.4 103 90.6 97.6C83.4 89.4 77.4 80.4 71.4 70.2Z`, c(VALLEY.greenShade));
  // the way up: a worn path that winds to the top, narrowing as it climbs, its lower edge a step darker
  const way = [[33.6, 117, 4], [43.4, 108.6, 3.3], [37.6, 99.2, 2.7], [47.4, 89.6, 2.2], [54.6, 81.2, 1.8], [59.4, 74.6, 1.4]] as const;
  out += fill(ribbon(way.map(([x, y, w]) => [x + 0.5, y + 0.8, w] as const)), c(VALLEY.dirtEdge));
  out += fill(ribbon(way), c(VALLEY.dirt));
  // a grey outcrop on the shaded flank and a smaller stone by the path
  out += rock(94.6, 96.6, 10.4, 6.6, dark, c(VALLEY.greenShade)) + rock(24.4, 108.4, 5.6, 3.4, dark, ground);
  // the almond on the lower slope, in blossom before its leaves: its limbs show between the clouds of flowers
  const almond: TreeShape = {
    foot: [14.6, 103.4],
    base: 3,
    fork: [15.8, 94.6],
    limbs: [
      { from: [15.8, 94.6], bend: [10.6, 91.4], to: [6.8, 86.2], width: 1.7 },
      { from: [15.8, 94.6], bend: [14.2, 87.8], to: [11.8, 80.4], width: 1.9 },
      { from: [15.8, 94.6], bend: [20.4, 88.4], to: [22.8, 81.6], width: 1.8 },
      { from: [17.2, 92.2], bend: [24.6, 90.4], to: [29.4, 88.2], width: 1.3 },
    ],
    lobes: [
      { x: 6.8, y: 85.2, rx: 5.6, ry: 4.4 },
      { x: 12.4, y: 79, rx: 6.6, ry: 5.4 },
      { x: 22.4, y: 80.4, rx: 7.2, ry: 5.6 },
      { x: 29.8, y: 87.4, rx: 4.6, ry: 3.6 },
    ],
    rough: 0.26,
    dot: 0.62,
  };
  out += grownTree(almond, blossoms(dark), { face: wood, shade: woodShade }, ground, random);
  out += narcissus(20.8, 113.8, 0.9, 3, dark, random) + narcissus(70.4, 104.2, 0.72, 2, dark, random) + narcissus(83.6, 111.6, 0.95, 4, dark, random);
  // the torches up the way, smaller as they climb
  out += torch(29.4, 110.6, 1, dark, ground) + torch(49.2, 103.6, 0.86, dark, ground) + torch(42.2, 92.6, 0.74, dark, ground) + torch(52.6, 82.2, 0.62, dark, ground);
  // wood stacked ready on the flank: two logs side by side and one across them, their cut ends to us
  out += stroke('M83.4 80.4L92.2 78.2M87.4 82.4L96 80.2M85.2 78.2L94 76', wood, 2.6);
  out += fill(ellipsePath(83.4, 80.4, 1.4, 1.4) + ellipsePath(87.4, 82.4, 1.4, 1.4) + ellipsePath(85.2, 78.2, 1.4, 1.4), c(HUE.logEnd));
  out += fill(ellipsePath(83.6, 80.5, 0.5, 0.5) + ellipsePath(87.6, 82.5, 0.5, 0.5) + ellipsePath(85.4, 78.3, 0.5, 0.5), c(HUE.logRing));
  // the top of the hill burnt black where the fire stands
  out += fill(blobPath(63.4, 72.2, 19.6, 3.2, 9, 0.2, random), c(HUE.char));
  // the heap: logs and brushwood piled into a cone, its right side in shade, the cut ends of the logs at its foot
  const heap: Pt[] = [[45, 72.6], [46.6, 69.4], [45.6, 67], [49, 65.2], [48.4, 62.4], [52.4, 60.6], [55.4, 56.4], [59.8, 53.6], [63.6, 51.6], [67.6, 53.4], [71.4, 56], [74.4, 59.4], [77.6, 61.4], [77.2, 64.2], [80.6, 66.6], [79.8, 69.2], [81.6, 72.4]];
  out += fill(poly(heap), woodShade);
  out += fill(poly([...heap.slice(0, 10), [66.2, 60], [69, 72.8]]), wood);
  out += stroke('M48.6 69.6L58.4 63.4M50.6 65.2L60.2 58.8M57.6 71.4L64.6 66.6M70.6 70.2L77.2 66.2', woodShade, 0.9);
  out += stroke('M46.4 66.6L41.4 63.8M78.2 62L82.4 58.6', wood, 0.8);
  out += fill(ellipsePath(49.4, 71.4, 1.6, 1.4) + ellipsePath(55.4, 72.2, 1.4, 1.3) + ellipsePath(74.6, 71.8, 1.5, 1.3), c(HUE.logEnd));
  out += fill(ellipsePath(49.6, 71.5, 0.5, 0.5) + ellipsePath(55.6, 72.3, 0.45, 0.45) + ellipsePath(74.8, 71.9, 0.5, 0.5), c(HUE.logRing));
  out += restFlame(NEWROZ_FLAME, dark);
  // the smoke rising off the top of the flames and going away with the wind, and sparks flying with it
  // the smoke is a run of puffs, each bigger and further downwind than the last
  const puffs = [[70.2, 20.8, 2.6, 2.4], [73.4, 16.6, 3.6, 3.2], [78.4, 12.6, 4.4, 3.6], [84.8, 9.8, 4.8, 3.4], [91.4, 8.4, 3.8, 2.6]] as const;
  out += fill(puffs.map(([x, y, rx, ry]) => blobPath(x + 0.6, y + 0.8, rx, ry, 8, 0.16, random)).join(''), c(HUE.smokeShade));
  out += fill(puffs.map(([x, y, rx, ry]) => blobPath(x - 0.2, y - 0.2, rx * 0.97, ry * 0.95, 8, 0.16, random)).join(''), c(HUE.smoke));
  const sparks = [[55.4, 20.6, 0.8], [80.6, 19.8, 1.05], [86.4, 26.4, 0.7], [62.6, 13.6, 0.6], [94.2, 16.8, 0.55]] as const;
  out += fill(sparks.map(([x, y, r]) => ellipsePath(x, y, r, r)).join(''), warm(VALLEY.fireCore, dark));
  return out;
}

// ─────────────────────────────────────────────────────────── 8 · the hives

const HIVES_BEE: Box = { kind: 'bee', x: 43, y: 24, w: 34, h: 34 };

/**
 * One painted box hive, seen a little from above and to the right as the
 * village's houses are, its foot at (x, y): `boxes` boxes stacked to `h`
 * high with a seam between each, its side in shade, the entrance slot over
 * its landing board, and the lid overhanging with its top in the light. A
 * hive that stands in the wind has a flat stone on its lid.
 */
function hive(x: number, y: number, w: number, h: number, boxes: number, tones: { face: string; side: string }, dark: boolean, stone = false): string {
  const c = (hex: string): string => dusk(hex, dark);
  const d = 7.4;
  let out = fill(poly([[x + w, y], [x + w + d, y - d / 2], [x + w + d, y - d / 2 - h], [x + w, y - h]]), c(tones.side));
  out += fill(`M${f(x)} ${f(y - h)}h${f(w)}v${f(h)}h${f(-w)}Z`, c(tones.face));
  let seams = '';
  for (let k = 1; k < boxes; k++) seams += `M${f(x)} ${f(y - (h * k) / boxes)}h${f(w)}l${f(d)} ${f(-d / 2)}`;
  if (seams) out += stroke(seams, c(tones.side), 0.9);
  out += fill(`M${f(x + w * 0.24)} ${f(y - 3.2)}h${f(w * 0.52)}v1.7h${f(-w * 0.52)}Z`, c(VALLEY.window));
  out += fill(`M${f(x + w * 0.18)} ${f(y - 1.4)}h${f(w * 0.64)}v1.4h${f(-w * 0.64)}Z`, c(HUE.woodLight));
  // the lid: its side, its front edge, its lit top
  const t = y - h;
  out += fill(poly([[x + w + 1, t], [x + w + 1 + d, t - d / 2], [x + w + 1 + d, t - d / 2 - 3], [x + w + 1, t - 3]]), c(VALLEY.wallSide));
  out += fill(`M${f(x - 1)} ${f(t - 3)}h${f(w + 2)}v3h${f(-(w + 2))}Z`, c(VALLEY.parapet));
  out += fill(poly([[x - 1, t - 3], [x - 1 + d, t - 3 - d / 2], [x + w + 1 + d, t - 3 - d / 2], [x + w + 1, t - 3]]), c(VALLEY.roof));
  if (stone) {
    const [sx, sy] = [x + w * 0.5 + d * 0.4, t - 3 - d * 0.22];
    out += fill(`M${f(sx - 5.4)} ${f(sy + 0.6)}C${f(sx - 5)} ${f(sy - 2.2)} ${f(sx + 3)} ${f(sy - 2.6)} ${f(sx + 5.6)} ${f(sy - 0.4)}C${f(sx + 5.8)} ${f(sy + 1)} ${f(sx - 4.6)} ${f(sy + 1.6)} ${f(sx - 5.4)} ${f(sy + 0.6)}Z`, c(VALLEY.stoneSide));
    out += fill(`M${f(sx - 4.8)} ${f(sy - 0.2)}C${f(sx - 4.2)} ${f(sy - 2)} ${f(sx + 2.4)} ${f(sy - 2.4)} ${f(sx + 4.4)} ${f(sy - 0.8)}C${f(sx + 1.6)} ${f(sy - 0.2)} ${f(sx - 2)} ${f(sy)} ${f(sx - 4.8)} ${f(sy - 0.2)}Z`, c(VALLEY.stone));
  }
  return out;
}

/** The two stones a hive stands on, its shadow on the grass falling to the lower right. */
function hiveStand(x: number, y: number, w: number, h: number, ground: string, dark: boolean): string {
  const c = (hex: string): string => dusk(hex, dark);
  let out = fill(poly([[x + 1, y + 4], [x + w + 9, y + 4], [x + w + 16, y - 1], [x + 9, y - 1]]), ground);
  out += fill(poly([[x + w, y], [x + w + 7.4, y - 3.7], [x + w + 7.4 + h * 0.3, y - 3.7 + h * 0.16], [x + w + h * 0.3, y + h * 0.16]]), ground);
  for (const sx of [x + 1, x + w - 6]) out += fill(`M${f(sx)} ${f(y)}h6v4.6h-6Z`, c(VALLEY.stoneSide)) + fill(`M${f(sx)} ${f(y)}h4.2v4.6h-4.2Z`, c(VALLEY.stone));
  return out;
}

/**
 * The beehives at the edge of the flowering meadow: three painted box hives,
 * each on its own stones and none like another (the blue one two boxes high
 * with a stone on its lid against the wind, the cream one low, the saffron
 * one older and standing back), a fruit tree in blossom behind them, patches
 * of poppies, daisies and buttercups in the grass, a jar of the honey with a
 * cloth tied over it, and a bee out over the flowers.
 */
function hives(dark: boolean, random: () => number): string {
  const c = (hex: string): string => dusk(hex, dark);
  const ground = c(VALLEY.meadowShade);
  let out = '';
  // the fruit tree in blossom behind the hives, and a few flowers growing up behind them
  out += grownTree({ ...orchardTree(101, 90, 0.8, 0.5, random), dot: 0.9 }, foliage(dark, VALLEY.blossom), bark(dark), ground, random);
  out += wildflowers([[4.6, 97, 8, c(HUE.poppy)], [62.4, 95, 6, c(VALLEY.blossomWhite)]], c(VALLEY.leafShade));
  // the saffron hive stands furthest back, the blue one in the middle distance, the cream one nearest
  out += hiveStand(70, 97.6, 18, 24, ground, dark) + hive(70, 97.6, 18, 24, 2, { face: VALLEY.gold, side: VALLEY.goldDark }, dark);
  out += hiveStand(9, 100.4, 19, 30, ground, dark) + hive(9, 100.4, 19, 30, 2, { face: VALLEY.gate, side: VALLEY.gateDark }, dark, true);
  out += hiveStand(39, 104, 21, 19, ground, dark) + hive(39, 104, 21, 19, 1, { face: HUE.hiveCream, side: HUE.hiveCreamSide }, dark);
  // a bee coming in to land at the blue hive's door
  out += fill(ellipsePath(26.4, 94.2, 1.1, 0.8), dusk(HUE.beeBody, dark, 0.1)) + fill(ellipsePath(26, 93.3, 0.8, 0.5), dusk('#ffffff', dark, 0.15));
  // the honey jar: its shadow, the glass full of honey with its lit edge and shaded side, a red cloth tied over its mouth
  out += fill(ellipsePath(110, 114, 6, 1.7), ground);
  out += fill('M101 104a3 3 0 0 1 3 -3h6a3 3 0 0 1 3 3v8a2.5 2.5 0 0 1 -2.5 2.5h-7a2.5 2.5 0 0 1 -2.5 -2.5Z', warm(VALLEY.gold, dark));
  out += fill('M110 101a3 3 0 0 1 3 3v8a2.5 2.5 0 0 1 -2.5 2.5h-1.5Z', warm(VALLEY.goldDark, dark));
  out += stroke('M103.2 104.6v6.6', warm(VALLEY.goldLight, dark), 1.2);
  const cloth = 'M100.4 101.6C100.4 98.6 103 97.4 107 97.4C111 97.4 113.6 98.6 113.6 101.6L112.6 103.4L110.4 102.4L107 103.4L103.6 102.4L101.4 103.4Z';
  out += fill(cloth, c(VALLEY.red));
  out += stroke('M101.4 101.2H112.6', c(VALLEY.cream), 1);
  // the meadow's flowers in patches of different sizes, not in a row, with grass between them
  out += wildflowers(
    [
      [5.4, 115.4, 6.4, c(HUE.poppy)],
      [8.6, 113.8, 9, c(VALLEY.blossomWhite)],
      [12.4, 115.8, 4.6, c(HUE.poppy)],
      [33.6, 112.2, 5.4, c(HUE.buttercup)],
      [80.4, 115.2, 7.6, c(HUE.poppy)],
      [84.2, 113.6, 5, c(VALLEY.blossomWhite)],
      [91.4, 115.8, 8.4, c(HUE.buttercup)],
    ],
    c(VALLEY.leafShade),
  );
  out += flowers(64, 113, c(VALLEY.blossomWhite)) + flowers(21.4, 109.4, c(HUE.buttercup));
  out += tuft(18.6, 115.6, 1, c(VALLEY.leafShade)) + tuft(70.4, 111.4, 0.8, c(VALLEY.leafShade)) + tuft(97, 112.6, 0.9, c(VALLEY.leafShade));
  out += restBee(HIVES_BEE, dark);
  return out;
}

// ─────────────────────────────────────────────────────────── 9 · the bridge

const BRIDGE_WATER: Box = { kind: 'water', x: 45, y: 102, w: 30, h: 12 };

/**
 * The old stone bridge: one tall arch humped over the river, as the old
 * bridges of the Kurdish valleys stand, its parapet lit along the top, the
 * arch ringed with its voussoirs, the river coming through under it toward
 * us onto its gravel bar between green banks, a poplar and a walnut behind.
 */
function bridge(dark: boolean, random: () => number): string {
  const c = (hex: string): string => dusk(hex, dark);
  const ground = c(VALLEY.meadowShade);
  let out = '';
  // the trees on the banks, behind the bridge's two ramps: two poplars of different heights, and a walnut grown wide
  out += poplar(19.4, 100.6, 0.56, poplarLeaves(dark), ground);
  out += poplar(12.6, 99, 0.76, poplarLeaves(dark), ground);
  out += grownTree(orchardTree(103.6, 98.4, 0.74, -0.4, random), foliage(dark), bark(dark), ground, random);
  // the bridge's shadow along its foot, falling to the lower right
  out += fill(poly([[8, 108], [112, 108], [116, 111], [14, 111.5]]), ground);
  // the bridge: its face, and the parapet's top in the light
  const deck: Pt[] = [[4, 103.6], [18, 97.4], [33, 85], [47, 71.4], [60, 64.6], [73, 71.4], [87, 85], [102, 97.4], [116, 103.6]];
  out += fill(`${smoothPath(deck)}L116 109L4 109Z`, c(HUE.lime));
  out += stroke(smoothPath(deck.map(([x, y]) => [x, y + 0.4] as Pt)), c(HUE.limeLight), 2);
  // the arch: its ring of voussoirs, then through it the shade under the arch, the far banks, and the river going on away from us
  out += fill('M33 109V102A27 32 0 0 1 87 102V109Z', c(HUE.limeLight));
  out += fill('M37 109V102A23 28 0 0 1 83 102V109Z', c(HUE.limeShade));
  out += fill('M38.5 109V103A21.5 23 0 0 1 81.5 103V109Z', c(HUE.farBank));
  out += fill('M37 109V104L53.4 89.6C56 88.8 64 88.8 66.6 89.6L83 104V109Z', c(HUE.waterShade));
  const joints: string[] = [];
  for (let k = 1; k < 10; k++) {
    const a = (k / 10) * Math.PI;
    joints.push(`M${f(60 - Math.cos(a) * 23)} ${f(102 - Math.sin(a) * 28)}L${f(60 - Math.cos(a) * 27)} ${f(102 - Math.sin(a) * 32)}`);
  }
  out += stroke(joints.join(''), c(HUE.limeShade), 0.8);
  // the courses of the masonry in the spandrels and the ramps
  const courses = ['M10 104h7', 'M20 100h6', 'M14 107h6', 'M25 95h5', 'M24 105h6', 'M30 90h4'];
  courses.push('M90 90h4', 'M93 104h7', 'M95 96h6', 'M102 106h7', 'M104 101h5', 'M88 100h4');
  out += stroke(courses.join(''), c(HUE.limeShade), 0.8);
  // the river coming out toward us between its banks, onto a bar of gravel, and the ripple under the arch
  out += fill('M33 106C26 108.6 19 111 19.6 114C22 117.4 44 117.8 60 117.8C76 117.8 98 117.4 100.4 114C101 111 94 108.6 87 106Z', c(VALLEY.bank));
  out += fill('M37 106C33 108.4 27 110.6 25.6 113C31 115 46 114.6 60 115.2C74 115.6 89 115 94.4 113C93 110.6 87 108.4 83 106Z', c(VALLEY.water));
  const gravel = 'M25.6 113C31 115 46 114.6 60 115.2C74 115.6 89 115 94.4 113C95.6 115 92 116.6 84 117C70 117.6 50 117.6 36 117C28 116.6 24.4 115 25.6 113Z';
  out += fill(gravel, c(VALLEY.dirt));
  out += fill(ellipsePath(41, 116.2, 1.4, 0.8) + ellipsePath(66, 116.6, 1.6, 0.8) + ellipsePath(81, 116, 1.2, 0.7), c(VALLEY.pebble));
  out += restRipple(BRIDGE_WATER, dark);
  out += stroke('M27 109.4q8 -1.6 14 -0.4M79 110q7 -1.2 13 0.6', c(VALLEY.waterLight), 1);
  out += tuft(22, 112, 1, c(VALLEY.leafShade)) + tuft(98, 112, 1, c(VALLEY.leafShade));
  return out;
}

// ─────────────────────────────────────────────────────────── 10 · the tents

const TENTS_SMOKE: Box = { kind: 'smoke', x: 82, y: 72, w: 16, h: 30 };

/**
 * A black tent of woven goat hair as the herding families pitch them on the
 * summer pastures, (x, y) its front left foot: long and low, its roof cloth
 * lifted into peaks by the poles and sagging a little between them, its
 * right end in shade, the front open on the dark inside, a reed screen bound
 * with a woven band across the lower front, and guy ropes out to the pegs.
 */
function tent(x: number, y: number, w: number, h: number, d: number, poles: readonly number[], dark: boolean): string {
  const c = (hex: string): string => dusk(hex, dark);
  const rise = d * 0.5;
  const top = y - h;
  const ridgeY = top - d / 4 - rise;
  let out = fill(poly([[x + w, y], [x + w + d, y - d / 2], [x + w + d + 8, y - d / 2 + 4], [x + w + 8, y + 4]]), c(VALLEY.meadowShade));
  out += fill(`M${f(x - 1)} ${f(y + 0.5)}h${f(w + 2)}l4 2.4h${f(-w - 2)}Z`, c(VALLEY.meadowShade));
  // the guy ropes out to their pegs
  out += stroke(`M${f(x)} ${f(top + 1)}L${f(x - 4)} ${f(y + 1)}M${f(x + w + d)} ${f(top - d / 2 + 1)}L${f(x + w + d + 5)} ${f(y - d / 2 + 2)}`, c(HUE.rope), 0.7);
  // its right end in shade, with the gable the roof makes over it
  out += fill(poly([[x + w, y], [x + w + d, y - d / 2], [x + w + d, top - d / 2], [x + w + d / 2, ridgeY], [x + w, top]]), c(HUE.goatShade));
  // the open front: the dark inside, the poles, the reed screen with its woven band
  out += fill(`M${f(x)} ${f(top)}h${f(w)}v${f(h)}h${f(-w)}Z`, c(HUE.goatInside));
  out += stroke(poles.map((p) => `M${f(x + p)} ${f(y)}V${f(top)}`).join(''), c(HUE.woodLight), 1.1);
  const screenTop = y - h * 0.5;
  out += fill(`M${f(x)} ${f(screenTop)}h${f(w)}v${f(y - screenTop)}h${f(-w)}Z`, c(HUE.reed));
  let zig = `M${f(x + 0.5)} ${f(screenTop + 3)}`;
  for (let k = 0; x + 0.5 + (k + 1) * 3 <= x + w; k++) zig += `l3 ${k % 2 ? -2 : 2}`;
  out += stroke(zig, c(VALLEY.red), 1);
  out += stroke(`M${f(x)} ${f(screenTop + 0.4)}h${f(w)}M${f(x)} ${f(y - 1.4)}h${f(w)}`, c(VALLEY.indigo), 0.8);
  // the roof cloth: its front edge lifted at each pole and sagging between, its ridge peaked over them
  const xs = [0, ...poles, w];
  const eave: Pt[] = [];
  const ridge: Pt[] = [];
  xs.forEach((p, i) => {
    const end = i === 0 || i === xs.length - 1;
    eave.push([x + p + (i === 0 ? -1 : end ? 1 : 0), top - 0.4]);
    ridge.push([x + p + d / 2, ridgeY - (end ? 0 : 1.8)]);
    if (i < xs.length - 1) {
      const m = (p + xs[i + 1]!) / 2;
      eave.push([x + m, top + 0.8]);
      ridge.push([x + m + d / 2, ridgeY + 0.3]);
    }
  });
  out += fill(`${smoothPath(eave)}${back(ridge)}Z`, c(HUE.goat));
  // a seam where two woven strips of the cloth are sewn, and the sheen along the ridge where the cloth is pulled tight
  out += stroke(smoothPath(eave.map(([ex, ey], i) => [ex + (ridge[i]![0] - ex) * 0.5, ey + (ridge[i]![1] - ey) * 0.5] as Pt)), c(HUE.goatShade), 0.7);
  out += stroke(smoothPath(ridge.map(([rx, ry]) => [rx, ry + 0.7] as Pt)), c(HUE.goatLight), 1.3);
  return out;
}

/**
 * The summer pastures: two black goat-hair tents pitched on the high grass,
 * the nearer one long and the farther smaller, boulders of the mountain, a
 * sheep, and the cooking fire with its kettle and its smoke.
 */
function tents(dark: boolean, random: () => number): string {
  const c = (hex: string): string => dusk(hex, dark);
  const ground = c(VALLEY.meadowShade);
  let out = '';
  out += rock(20, 80, 22, 15, dark, ground);
  out += rock(36, 80, 11, 8, dark, ground);
  out += tent(64, 87, 34, 13, 10, [11, 23], dark);
  out += tent(5, 103, 56, 18, 14, [14, 28, 42], dark);
  out += rock(110, 100, 8, 6, dark, ground);
  // the cooking fire: its hearthstones, the burning sticks, a little flame, and the kettle set beside it
  const fx = TENTS_SMOKE.x + 8;
  const fy = TENTS_SMOKE.y + TENTS_SMOKE.h + 4;
  out += fill(ellipsePath(fx + 3, fy + 3, 9, 2.4), ground);
  out += stone(fx - 6, fy + 1, 2.4, 1.8, dark, random) + stone(fx + 6, fy + 1, 2.4, 1.8, dark, random);
  out += stroke(`M${f(fx - 4)} ${f(fy + 2)}L${f(fx + 3)} ${f(fy - 1)}M${f(fx + 4)} ${f(fy + 2)}L${f(fx - 3)} ${f(fy - 1)}`, c(VALLEY.trunk), 1.6);
  const q = (u: number, v: number): string => `${f(fx + u)} ${f(fy + v)}`;
  const flame = `M${q(0, -9)}C${q(3, -5)} ${q(4, -2)} ${q(2.4, 0)}C${q(1, 1)} ${q(-2, 1)} ${q(-2.6, -0.6)}C${q(-3.6, -3)} ${q(-1, -5)} ${q(0, -9)}Z`;
  out += fill(flame, warm(VALLEY.fire, dark));
  out += fill(`M${q(0, -4)}C${q(1.4, -2)} ${q(1.4, 0)} ${q(0, 0)}C${q(-1.4, 0)} ${q(-1.2, -2)} ${q(0, -4)}Z`, warm(VALLEY.fireCore, dark));
  out += restSmoke(TENTS_SMOKE, c(HUE.smoke), c(HUE.smokeShade));
  const kx = fx + 13;
  const ky = fy + 5;
  out += fill(ellipsePath(kx + 2, ky + 1, 5, 1.4), ground);
  out += stroke(`M${f(kx - 3)} ${f(ky - 5)}C${f(kx - 3)} ${f(ky - 10)} ${f(kx + 3)} ${f(ky - 10)} ${f(kx + 3)} ${f(ky - 5)}`, c(HUE.kettle), 0.9);
  out += stroke(`M${f(kx - 3)} ${f(ky - 3)}L${f(kx - 7)} ${f(ky - 6)}`, c(HUE.kettle), 1.4);
  const k = (u: number, v: number): string => `${f(kx + u)} ${f(ky + v)}`;
  out += fill(`M${k(-4, 0)}C${k(-5, -4)} ${k(-3, -6)} ${k(0, -6)}C${k(3, -6)} ${k(5, -4)} ${k(4, 0)}Z`, c(HUE.kettle));
  out += fill(ellipsePath(kx - 1.6, ky - 3.6, 1, 1.4), c(HUE.kettleLight));
  out += sheep(24, 109, 1, ground, dark);
  out += rock(52, 113, 8, 5, dark, ground);
  out += tuft(7, 112, 1, c(VALLEY.leafShade)) + tuft(70, 112, 0.9, c(VALLEY.leafShade));
  out += flowers(40, 112, c(HUE.buttercup));
  return out;
}

// ─────────────────────────────────────────────────────────── 11 · the school

const SCHOOL_FLAG: Box = { kind: 'flag', x: 96, y: 20, w: 20, h: 16 };

/**
 * The village school in autumn: one long whitewashed room under a red tin
 * roof, its gable end in shade, a row of tall windows and a blue door, the
 * flag on its pole by the yard, and the trees gone orange and yellow, their
 * leaves on the ground.
 */
function school(dark: boolean, random: () => number): string {
  const c = (hex: string): string => dusk(hex, dark);
  let out = '';
  const x = 14;
  const y = 104;
  const w = 62;
  const h = 21;
  const d = 14;
  const rise = 8;
  const top = y - h;
  const ridgeY = top - d / 4 - rise;
  // the poplar behind the roof, and the yard of beaten earth the school stands in
  out += poplar(78, 84, 0.84, autumnPoplar(dark), c(VALLEY.meadowShade));
  out += fill(blobPath(60, 106.4, 55, 8.4, 12, 0.08, random), c(VALLEY.dirt));
  // the school's shadow, its gable end in shade, its front, the blue plinth, the windows and the door
  out += fill(poly([[x + w, y], [x + w + d, y - d / 2], [x + w + d + 11, y - d / 2 + 6], [x + w + 11, y + 6]]), c(VALLEY.dirtEdge));
  out += fill(poly([[x + w, y], [x + w + d, y - d / 2], [x + w + d, top - d / 2], [x + w + d / 2, ridgeY], [x + w, top]]), c(HUE.whitewashSide));
  out += fill(`M${x} ${top}h${w}v${h}h${-w}Z`, c(HUE.whitewash));
  out += fill(`M${x} ${y - 3}h${w}v3h${-w}Z`, c(VALLEY.gate));
  out += fill(poly([[x + w, y], [x + w + d, y - d / 2], [x + w + d, y - d / 2 - 3], [x + w, y - 3]]), c(VALLEY.gateDark));
  const lit = dark ? warm(HUE.lamp, true) : HUE.pane;
  for (let k = 0; k < 4; k++) {
    const wx = x + 6 + k * 11.5;
    out += fill(`M${f(wx)} ${top + 4.5}h7v10h-7Z`, lit);
    out += stroke(`M${f(wx + 3.5)} ${top + 4.5}v10M${f(wx)} ${top + 9.5}h7`, c(HUE.whitewash), 0.8);
    out += fill(`M${f(wx - 0.8)} ${top + 14.5}h8.6v1.4h-8.6Z`, c(HUE.whitewashSide));
  }
  const dx = x + w - 13;
  out += fill(`M${dx} ${y}v-14h9v14Z`, c(VALLEY.gate));
  out += fill(`M${dx + 4.5} ${y}v-14h4.5v14Z`, c(VALLEY.gateLight));
  out += fill(`M${dx - 1.4} ${y - 15.8}h11.8v1.8h-11.8Z`, c(VALLEY.redDark));
  // the red tin roof: the edge of its far slope over the gable, its front slope in the light with the ribs of the tin, and the ridge
  const verge: Pt[] = [
    [x + w + d / 2 + 1.5, ridgeY],
    [x + w + d + 1.5, top - d / 2 + 0.8],
    [x + w + d + 1.5, top - d / 2 + 2.6],
    [x + w + d / 2 + 1, ridgeY + 2.2],
  ];
  out += fill(poly(verge), c(VALLEY.redDark));
  out += fill(poly([[x - 2, top + 1], [x + w + 2, top + 1], [x + w + 2 + d / 2, ridgeY], [x - 2 + d / 2, ridgeY]]), c(VALLEY.red));
  const ribs: string[] = [];
  for (let k = 1; k < 12; k++) {
    const rx = x - 2 + (k * (w + 4)) / 12;
    ribs.push(`M${f(rx)} ${top + 0.6}L${f(rx + d / 2)} ${f(ridgeY + 0.6)}`);
  }
  out += stroke(ribs.join(''), c(VALLEY.redDark), 0.6);
  out += stroke(`M${f(x - 2 + d / 2)} ${f(ridgeY)}H${f(x + w + 2 + d / 2)}`, c(VALLEY.redDark), 1.6);
  // the tree at the yard's corner in its autumn orange, its limbs showing where the leaves have thinned
  out += grownTree(orchardTree(12.6, 112, 0.6, 0.6, random), autumnLeaves(dark), bark(dark), c(VALLEY.dirtEdge), random);
  // the flagpole on its stone foot, and the flag hanging at rest
  const px = SCHOOL_FLAG.x;
  out += fill(ellipsePath(px + 5, 110.5, 6, 1.6), c(VALLEY.dirtEdge));
  out += fill(`M${px - 3} 110.5v-3h6v3Z`, c(VALLEY.stoneSide)) + fill(`M${px - 3} 107.5l1.5 -1h6l-1.5 1Z`, c(VALLEY.stone));
  out += stroke(`M${px} 107V${SCHOOL_FLAG.y}`, c(HUE.pole), 1.5);
  out += fill(ellipsePath(px, SCHOOL_FLAG.y - 1, 1.5, 1.5), c(VALLEY.gold));
  out += restFlag(SCHOOL_FLAG, dark);
  // fallen leaves on the yard
  let leaves = '';
  for (let k = 0; k < 10; k++) leaves += ellipsePath(22 + random() * 84, 106 + random() * 7, 1.2, 0.8);
  out += fill(leaves, c(HUE.autumn));
  return out;
}

// ─────────────────────────────────────────────────────────── 12 · the hearth

const HEARTH_SMOKE: Box = { kind: 'smoke', x: 72, y: 28, w: 16, h: 30 };

/**
 * Winter: an earth house deep in snow, the snow lying thick on its flat roof
 * and over the lip of the front, the chimney smoking, the window lit by the
 * fire inside, a stack of firewood against the wall with snow on it, and a
 * bare tree beside the house. Every heap of snow has its far edge in shade,
 * so it still reads against the snow behind it.
 */
function hearth(dark: boolean, random: () => number): string {
  const c = (hex: string): string => dusk(hex, dark);
  const snow = c(VALLEY.snow);
  const snowShade = c(VALLEY.snowShade);
  let out = '';
  // the snowy ground the house stands in
  out += fill(blobPath(60, 106, 55, 11, 12, 0.1, random), snow);
  out += bareTree(102, 100, 0.88, dark, snowShade);
  // the house: its shadow on the snow, the side in shade, the front, the blue door and the lit window
  const x = 28;
  const y = 104;
  const w = 52;
  const h = 27;
  const d = 16;
  const top = y - h;
  out += fill(poly([[x + w, y], [x + w + d, y - d / 2], [x + w + d + 11, y - d / 2 + 6], [x + w + 11, y + 6]]), snowShade);
  out += fill(poly([[x + w, y], [x + w + d, y - d / 2], [x + w + d, top - d / 2], [x + w, top]]), c(VALLEY.wallSide));
  out += fill(`M${x} ${top}h${w}v${h}h${-w}Z`, c(VALLEY.wall));
  out += fill(`M${x + 9} ${y}v-14a5.5 5.5 0 0 1 11 0v14Z`, c(VALLEY.gate));
  out += fill(`M${x + 14.5} ${y}v-19.5a5.5 5.5 0 0 1 5.5 5.5v14Z`, c(VALLEY.gateLight));
  out += fill(`M${x + 32} ${top + 8}h9v7.5h-9Z`, warm(HUE.lamp, dark));
  out += stroke(`M${x + 36.5} ${top + 8}v7.5`, c(VALLEY.window), 0.9);
  // the snow on the roof: the heap in shade, its lit top drawn in from the far edges, and the lip it makes over the front
  const heap: Pt[] = [
    [x - 1.5, top + 1],
    [x + 5, top - 3.6],
    [x + d - 1, top - d / 2 - 1.4],
    [x + d + 22, top - d / 2 - 2.2],
    [x + w + d + 1, top - d / 2 - 0.6],
    [x + w + d + 0.6, top - d / 2 + 2.4],
    [x + w + 1, top + 1.4],
    [x + 24, top + 1.6],
  ];
  const heapLit: Pt[] = [
    [x - 1.2, top + 0.4],
    [x + 5, top - 3.4],
    [x + d - 2, top - d / 2 - 0.6],
    [x + d + 20, top - d / 2 - 1],
    [x + w + d - 4, top - d / 2 + 0.6],
    [x + w - 1, top - 0.2],
    [x + 24, top + 0.4],
  ];
  out += fill(smoothPath(heap, true), snowShade) + fill(smoothPath(heapLit, true), snow);
  // the lip hangs over the front edge in soft scallops, each a dip and a swell
  const r = x + w;
  let lip = `M${x - 1.4} ${top + 0.6}H${r + 1}V${top + 2.6}`;
  lip += `C${r - 3} ${top + 4.6} ${r - 6} ${top + 2.4} ${r - 10} ${top + 3.2}C${r - 14} ${top + 4.2} ${r - 17} ${top + 2.2} ${r - 22} ${top + 2.8}`;
  lip += `C${r - 26} ${top + 3.4} ${r - 28} ${top + 5.4} ${r - 32} ${top + 3.2}C${r - 36} ${top + 2.2} ${r - 40} ${top + 4.4} ${r - 44} ${top + 3}`;
  lip += `C${r - 47} ${top + 2.2} ${x + 1} ${top + 3.8} ${x - 1.4} ${top + 2.8}Z`;
  out += fill(lip, snowShade);
  // the chimney on the roof, built of the same earth, with its own cap of snow
  const cx = HEARTH_SMOKE.x + 8;
  const cy = HEARTH_SMOKE.y + HEARTH_SMOKE.h;
  out += fill(poly([[cx + 3, cy + 12], [cx + 5.5, cy + 10.8], [cx + 5.5, cy + 0.6], [cx + 3, cy + 1.6]]), c(VALLEY.wallSide));
  out += fill(`M${cx - 3} ${cy + 1.6}h6v10.4h-6Z`, c(VALLEY.wall));
  out += fill(blobPath(cx + 1.4, cy + 0.9, 4.8, 2, 8, 0.12, random), snowShade);
  out += fill(blobPath(cx + 0.6, cy + 0.3, 4, 1.6, 8, 0.12, random), snow);
  // the firewood stack against the wall: its end in shade, the bark behind, the cut ends of the logs, and snow along its top
  const sx = 6;
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
  const cap = (pts: readonly (readonly [number, number])[]): string => smoothPath(pts.map(([u, v]) => [sx + u, sy - v] as Pt), true);
  out += fill(cap([[3, 13.4], [8, 16.6], [15, 17], [22, 16.6], [27, 13.6], [20, 12.6], [10, 13.2]]), snowShade);
  out += fill(cap([[3, 13.8], [8, 16.8], [14, 17.2], [20, 16.8], [23, 14.6], [17, 14], [9, 14.2]]), snow);
  out += fill(ellipsePath(sx + 25, sy + 1.6, 9, 1.8), snowShade);
  // the drift along the foot of the walls, and the trodden way from the door
  const drift: Pt[] = [[x - 3, y + 1.2], [x + 10, y - 1.8], [x + 30, y - 1], [x + w + 2, y - 2], [x + w + 4, y + 1], [x + w - 6, y + 3], [x + 20, y + 3.6]];
  out += fill(smoothPath(drift, true), snow);
  let steps = '';
  for (let k = 0; k < 4; k++) steps += ellipsePath(x + 14.5 - k * 2.2 + (k % 2) * 2.4, y + 3.4 + k * 3.4, 1.3, 0.8);
  out += fill(steps, snowShade);
  out += restSmoke(HEARTH_SMOKE, c(HUE.smokeOnSnow), c(HUE.smokeOnSnowShade));
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
