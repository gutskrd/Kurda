/**
 * The learner's tree, drawn: every kind (`tree.ts`) at each of its seven
 * stages, from a seed under the ground to a great tree, and as it fares when
 * it goes without water — thirsty, wilting, withered.
 *
 * A tree is built the way the app's other pictures are: flat shapes with one
 * step of light and one of shade. Its crown is a handful of leafy masses,
 * the far ones dark and the near ones light, each lit from the upper left
 * with a patch of light whose lower edge breaks into leaves; its trunk is a
 * few tapered limbs joined into one piece of wood, lit down one side. What
 * makes one kind another is its silhouette, its colours and what it bears:
 * an oak's broad dome and acorns, a pomegranate's red fruit, an almond's
 * cloud of blossom, a willow's hanging strands.
 *
 * The picture closes in on a young tree and stands back from an old one, so
 * a sprout is not a speck: each stage fills more of the canvas than the last
 * and none is lost in it. Nothing is random: what varies along an edge comes
 * from a generator seeded with the tree's own kind, so the same tree is the
 * same string on every machine.
 */
import type { TreeHealth, TreeSpecies, TreeStage } from '../tree.js';
import { leaf } from './paint.js';
import { Drawing, checkSize, linearAt, mix, n, prefixFor, pt, radialBox, seeded, tint, type Pt } from './svg.js';

/** The ground line, and the middle of the canvas a tree stands on. */
const GROUND = 100;
const MID = 60;

type Rand = () => number;

/** A crown's colours, far to near: the darkest for what is deepest in it, the last for the glint on top. */
type Ramp = readonly [string, string, string, string, string, string];
/** Wood: its deepest shade, its shade, its face and its light. */
type Wood = readonly [string, string, string, string];

/** How a kind's crown is built, and what marks its leaves leave on it. */
type Habit = 'dome' | 'shrub' | 'cloud' | 'weeping' | 'column' | 'tiers';

interface Kind {
  habit: Habit;
  leaves: Ramp;
  wood: Wood;
  /** what it bears once it is grown, and in what colours */
  bears: 'acorns' | 'pomegranates' | 'blossom' | 'berries' | 'cones' | 'leaves' | 'ribbons' | 'lights' | 'catkins' | 'none';
  /** the colours of what it bears: its body, its shade, its light */
  fruit: readonly [string, string, string];
  /** its seed: the shape under the ground, and its colour */
  seed: 'acorn' | 'drop' | 'almond' | 'round' | 'cone';
  seedColour: string;
  /** the grass round its foot */
  grass: readonly [string, string];
  /** the green leaves that stand out of a crown of another colour (a tree in blossom) */
  sprig?: string;
  /** what its crown turns to as it dries and as it dies, where that is not a green leaf's yellow and brown */
  turns?: readonly [string, string];
}

const KINDS: Record<TreeSpecies, Kind> = {
  // the Zagros oak: a broad dome on a thick trunk
  beru: {
    habit: 'dome',
    leaves: ['#125038', '#1b7340', '#2f9648', '#4fb24f', '#8bd457', '#cdf08e'],
    wood: ['#4a2618', '#6f3a22', '#96532c', '#c47a3d'],
    bears: 'acorns',
    fruit: ['#b9803a', '#7c4f22', '#e6b563'],
    seed: 'acorn',
    seedColour: '#b9803a',
    grass: ['#3d9c4c', '#74c95a'],
  },
  // the pomegranate: a round bush of a tree, hung with red fruit
  hinar: {
    habit: 'shrub',
    leaves: ['#1b5d33', '#27803c', '#3ea447', '#6cc24c', '#a3dd58', '#d6f28c'],
    wood: ['#4b2a20', '#74432d', '#9c6038', '#c98a4c'],
    bears: 'pomegranates',
    fruit: ['#e23a36', '#a81f2c', '#ff8a6b'],
    seed: 'drop',
    seedColour: '#d6303a',
    grass: ['#3f9f4a', '#7fcf58'],
  },
  // the almond: a cloud of blossom before its leaves
  behiv: {
    habit: 'cloud',
    leaves: ['#c2527f', '#dd6f98', '#f08fb0', '#f9b2c8', '#ffd3df', '#fff0f4'],
    wood: ['#3a2428', '#573238', '#77454a', '#a26764'],
    bears: 'blossom',
    fruit: ['#fff4f7', '#f6a9c2', '#ffd76a'],
    seed: 'almond',
    seedColour: '#c79a63',
    grass: ['#4aa457', '#86d06a'],
    sprig: '#6cc24c',
    turns: ['#d8c2b4', '#a58a72'],
  },
  // the willow by the water: a dome that hangs down in strands
  bi: {
    habit: 'weeping',
    leaves: ['#17604f', '#1f8062', '#32a274', '#5cc487', '#92e09b', '#cdf5bd'],
    wood: ['#3f3326', '#5e4c35', '#806a48', '#ab9263'],
    bears: 'catkins',
    fruit: ['#e9f7b0', '#b7d877', '#ffffff'],
    seed: 'round',
    seedColour: '#b9a36a',
    grass: ['#3a9a5c', '#70c97a'],
  },
  // the mulberry: wide and low, its berries dark, red and white
  tu: {
    habit: 'dome',
    leaves: ['#1c5a2a', '#2a7a30', '#449c38', '#72bb3e', '#a7d84c', '#dcf183'],
    wood: ['#3d2a1c', '#5f4229', '#856037', '#b3874d'],
    bears: 'berries',
    fruit: ['#5a2470', '#33123f', '#c84b6e'],
    seed: 'round',
    seedColour: '#7a4a86',
    grass: ['#3f9c46', '#7ccc55'],
  },
  // the poplar of the valleys: tall and narrow
  spindar: {
    habit: 'column',
    leaves: ['#225f38', '#2f8040', '#49a34a', '#78c152', '#addc62', '#e0f39a'],
    wood: ['#6f6a5e', '#928c7c', '#b9b39f', '#dedac8'],
    bears: 'none',
    fruit: ['#ffffff', '#dddddd', '#ffffff'],
    seed: 'round',
    seedColour: '#c9bf9d',
    grass: ['#3f9c4c', '#78ca5a'],
  },
  // the mountain pine: tiers of dark needles
  kaj: {
    habit: 'tiers',
    leaves: ['#0b3d32', '#10553f', '#176d49', '#238753', '#4aa868', '#93d89c'],
    wood: ['#42261a', '#653a24', '#8a5330', '#b47841'],
    bears: 'cones',
    fruit: ['#9a6238', '#6b3f22', '#c88f55'],
    seed: 'cone',
    seedColour: '#8a5330',
    grass: ['#358f4e', '#66bf62'],
  },
  // a tree in its autumn: gold, amber and red
  payiz: {
    habit: 'dome',
    leaves: ['#a5341f', '#cb4f1e', '#ea7a1c', '#f9a424', '#ffc93f', '#ffe98a'],
    wood: ['#3c2219', '#5c3524', '#804c2f', '#ab6f40'],
    bears: 'leaves',
    fruit: ['#f9a424', '#cb4f1e', '#ffe98a'],
    seed: 'round',
    seedColour: '#b56a2c',
    grass: ['#8a9a3c', '#c2c558'],
    turns: ['#c39a55', '#8f6a42'],
  },
  // the wish tree: an old tree tied with ribbons, a wish to each
  miraz: {
    habit: 'dome',
    leaves: ['#2a5e4b', '#3b7d5c', '#56a070', '#7fbf86', '#aedba0', '#dcf2c4'],
    wood: ['#4a3a30', '#6c5645', '#917560', '#bd9d83'],
    bears: 'ribbons',
    fruit: ['#e8443a', '#f7c531', '#3aa3e8'],
    seed: 'round',
    seedColour: '#a8876a',
    grass: ['#4aa05a', '#84cf6e'],
  },
  // the night tree: dark as the sky, hung with small lights
  sev: {
    habit: 'cloud',
    leaves: ['#1c1a52', '#2a2a7a', '#3a43a6', '#4f6bd0', '#74a2ee', '#b9dcff'],
    wood: ['#2a2540', '#40395e', '#5d5482', '#8b82b3'],
    bears: 'lights',
    fruit: ['#fff6c2', '#ffd76a', '#ffffff'],
    seed: 'drop',
    seedColour: '#6f7fe0',
    grass: ['#2f6f72', '#4fa39a'],
    turns: ['#9a9ab8', '#6f6a78'],
  },
};

/** What a crown turns to as it dries: the yellow of a leaf going, then its brown. */
const DRY = '#d9ab2e';
const DEAD = '#96683c';
/** How far each state has turned, how much of its crown it still carries, and how far it hangs. */
const STATE: Record<TreeHealth, { dry: number; dead: number; full: number; droop: number; fallen: number }> = {
  fresh: { dry: 0, dead: 0, full: 1, droop: 0, fallen: 0 },
  thirsty: { dry: 0.3, dead: 0, full: 0.96, droop: 1.6, fallen: 2 },
  wilting: { dry: 0.72, dead: 0.12, full: 0.82, droop: 3.4, fallen: 6 },
  withered: { dry: 0.4, dead: 0.85, full: 0.4, droop: 4.5, fallen: 10 },
};

/** A crown's colours in a state: toward yellow as it dries, toward brown as it dies (or toward the kind's own faded colours). */
function fared(ramp: Ramp, health: TreeHealth, turns: readonly [string, string] = [DRY, DEAD]): Ramp {
  const s = STATE[health];
  return ramp.map((c) => mix(mix(c, turns[0], s.dry), turns[1], s.dead)) as unknown as Ramp;
}

// ───────────────────────────────────────────────────────────────── shapes

/**
 * A leafy mass: a round shape whose edge is a ring of soft bumps, as a bush
 * seen from far off has. `depth` is how far each bump stands out (1 is half
 * a circle), and the bumps are a little uneven, as leaves are.
 */
function puffPath(cx: number, cy: number, rx: number, ry: number, rand: Rand, bumps: number, depth: number): string {
  const points: Pt[] = [];
  const start = rand() * Math.PI * 2;
  const step = (Math.PI * 2) / bumps;
  for (let i = 0; i < bumps; i++) {
    const a = start + step * (i + (rand() - 0.5) * 0.3);
    const k = 1 + (rand() - 0.5) * 0.1;
    points.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  let d = `M${pt(points[0] as Pt)}`;
  for (let i = 0; i < bumps; i++) {
    const a = points[i] as Pt;
    const b = points[(i + 1) % bumps] as Pt;
    const chord = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const r = chord * (0.5 + (1 - depth) * 0.6);
    d += `A${n(r)} ${n(r)} 0 0 1 ${pt(b)}`;
  }
  return `${d}Z`;
}

/** A unit vector at `deg`, 0 pointing right and 90 down. */
const dir = (deg: number): Pt => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];

/** A leaf from `at`, pointing along `deg`. */
const leafAt = (at: Pt, deg: number, len: number, w: number): string => leaf(at, dir(deg), len, w);

/** Curves through `points` (Catmull-Rom as cubic Béziers), from the first, which is already reached. */
function smooth(points: readonly Pt[]): string {
  const at = (i: number): Pt => points[Math.max(0, Math.min(points.length - 1, i))] as Pt;
  let d = '';
  for (let i = 0; i < points.length - 1; i++) {
    const [a, b, c, e] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const h1: Pt = [b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6];
    const h2: Pt = [c[0] - (e[0] - b[0]) / 6, c[1] - (e[1] - b[1]) / 6];
    d += `C${pt(h1)} ${pt(h2)} ${pt(c)}`;
  }
  return d;
}

/**
 * A limb: a tapered piece of wood along `line`, `widths` thick at each of
 * its points, with a round end. Every limb is drawn the same way round, so
 * several of them written as one path are one piece of wood.
 */
function limb(line: readonly Pt[], widths: readonly number[]): string {
  const side = (s: number): Pt[] =>
    line.map(([x, y], i) => {
      const [px, py] = line[Math.max(0, i - 1)] as Pt;
      const [qx, qy] = line[Math.min(line.length - 1, i + 1)] as Pt;
      const len = Math.hypot(qx - px, qy - py) || 1;
      const w = ((widths[i] ?? 1) / 2) * s;
      return [x + ((qy - py) / len) * w, y - ((qx - px) / len) * w];
    });
  const left = side(1);
  const right = side(-1).reverse();
  const tip = (widths[widths.length - 1] ?? 1) / 2;
  return `M${pt(left[0] as Pt)}${smooth(left)}A${n(tip)} ${n(tip)} 0 0 1 ${pt(right[0] as Pt)}${smooth(right)}Z`;
}

/** A limb's line moved sideways by `by` (to its left when positive), for the light and the shade that run along it. */
function beside(line: readonly Pt[], by: readonly number[]): Pt[] {
  return line.map(([x, y], i) => {
    const [px, py] = line[Math.max(0, i - 1)] as Pt;
    const [qx, qy] = line[Math.min(line.length - 1, i + 1)] as Pt;
    const len = Math.hypot(qx - px, qy - py) || 1;
    const w = by[i] ?? 0;
    return [x + ((qy - py) / len) * w, y - ((qx - px) / len) * w];
  });
}

const ellipse = (cx: number, cy: number, rx: number, ry: number, fill: string, more = ''): string =>
  `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="${fill}"${more}/>`;
const path = (d: string, fill: string, more = ''): string => `<path d="${d}" fill="${fill}"${more}/>`;
const turned = (deg: number, cx: number, cy: number): string => ` transform="rotate(${n(deg)} ${n(cx)} ${n(cy)})"`;

// ────────────────────────────────────────────────────────────────── crown

/** One leafy mass of a crown: where it is, how big, and how near (0 far, 1 middle, 2 near). */
interface Puff {
  x: number;
  y: number;
  r: number;
  near: 0 | 1 | 2;
  /** flatter or taller than round */
  squash?: number;
  /** which way is out of the crown from it, in degrees: where its leaves stand out past its edge */
  out: number;
}

/** The marks a kind's leaves leave on its crown. */
type Mark = 'leaf' | 'petal' | 'needle';

/** A mass's outline: a few big uneven bumps, as a bough of leaves has. */
function massPath(p: Puff, rand: Rand): string {
  return puffPath(p.x, p.y, p.r, p.r * (p.squash ?? 0.9), rand, Math.max(7, Math.round(p.r * 0.28) + 5), 0.8);
}

/**
 * The dark under a crown: every mass again, lower and darker, drawn first so
 * that together they are the one shadowed underside the lit masses sit on.
 */
function drawUnderside(puffs: readonly Puff[], ramp: Ramp, rand: Rand): string {
  return puffs.map((p) => path(massPath({ ...p, y: p.y + p.r * 0.2, r: p.r * 1.02 }, rand), ramp[0])).join('');
}

/**
 * One mass of a crown, lit from the upper left: its face, a cap of light over
 * its upper side whose lower edge breaks into leaves, a sliver of shade along
 * its lower right, and a leaf or two standing out past its edge.
 */
function drawPuff(dr: Drawing, p: Puff, ramp: Ramp, rand: Rand, mark: Mark, droop: number, sprig?: string): string {
  const far = p.near === 0;
  const [shade, base, light, glint] = far ? [ramp[1], ramp[2], ramp[3], ramp[4]] : [ramp[2], ramp[3], ramp[4], ramp[5]];
  const rx = p.r;
  const ry = p.r * (p.squash ?? 0.9);
  const d = massPath(p, rand);
  let out = '';
  // a pair of small leaves standing out of the crown; they hang as it wilts
  if (p.near !== 1) {
    const [ux, uy] = dir(p.out);
    const at: Pt = [p.x + ux * rx * 0.88, p.y + uy * ry * 0.88];
    const len = Math.min(5.2, p.r * 0.3);
    const hang = droop * 34;
    out += path(leafAt(at, p.out - 30 + hang, len, len * 0.44), sprig ?? base) + path(leafAt(at, p.out + 34 + hang, len * 0.82, len * 0.42), sprig ? tint(sprig, 0.25) : far ? base : light);
  }
  out += path(d, base);
  const clip = dr.clip(d);
  // the sliver of shade along its lower right: what its own face leaves uncovered when laid a little up and left
  // (a far mass goes without: it is in the crown's own shade already)
  let inside = far ? '' : path(d, shade) + path(massPath({ ...p, x: p.x - rx * 0.1, y: p.y - ry * 0.14 }, rand), base);
  // the cap of light over its upper left, and a row of leaves let down along the cap's lower edge
  const capR = p.r * 0.7;
  const cx = p.x - rx * 0.14;
  const cy = p.y - ry * 0.44;
  let lit = massPath({ ...p, x: cx, y: cy, r: capR }, rand);
  const row = Math.max(3, Math.round(p.r / 3.4));
  for (let i = 0; i < row; i++) {
    const a = 18 + (144 / (row - 1)) * i + (rand() - 0.5) * 12;
    const [ux, uy] = dir(a);
    const at: Pt = [cx + ux * capR * 0.8, cy + uy * capR * 0.74];
    const len = p.r * (0.24 + rand() * 0.08);
    lit += leafAt(at, a + (rand() - 0.5) * 24, len, len * 0.5);
  }
  inside += path(lit, light);
  // a second, thinner row lower down, half way to the face's own colour
  const lower = Math.max(2, Math.round(p.r / 6));
  let half = '';
  for (let i = 0; i < lower; i++) {
    const a = 34 + (112 / Math.max(1, lower - 1)) * i + (rand() - 0.5) * 16;
    const [ux, uy] = dir(a);
    const at: Pt = [cx + ux * capR * 1.2, cy + uy * capR * 1.12];
    const len = p.r * (0.2 + rand() * 0.06);
    half += leafAt(at, a + (rand() - 0.5) * 30, len, len * 0.5);
  }
  inside += path(half, mix(base, light, 0.5));
  // and a leaf or two in shade near its foot
  let dark = '';
  for (let i = 0; i < (p.r > 12 ? 2 : 1); i++) {
    const at: Pt = [p.x + rx * (0.16 + i * 0.36 + rand() * 0.1), p.y + ry * (0.62 - i * 0.16)];
    const len = p.r * (0.16 + rand() * 0.06);
    dark += leafAt(at, 56 + rand() * 40, len, len * 0.5);
  }
  inside += path(dark, shade);
  if (p.near === 2) {
    // the glint: a small spray of leaves where the light is strongest
    const gx = cx - capR * 0.2;
    const gy = cy - capR * 0.16;
    const spray = mark === 'petal' ? 5 : 3;
    let bright = '';
    for (let i = 0; i < spray; i++) {
      const a = mark === 'petal' ? i * 72 - 90 : -150 + i * 44 + (rand() - 0.5) * 10;
      const len = p.r * (mark === 'petal' ? 0.2 : 0.3);
      bright += leafAt([gx, gy], a, len, len * (mark === 'petal' ? 0.52 : 0.4));
    }
    inside += path(bright, glint);
  }
  return `${out}<g clip-path="url(#${clip})">${inside}</g>`;
}

// ────────────────────────────────────────────────────────────────── wood

/** A tree's wood: its limbs, each with the line it runs along, and whether it is the trunk, a root or a bough. */
interface Timber {
  limbs: { line: Pt[]; widths: number[]; part: 'trunk' | 'root' | 'bough' }[];
  /** where the crown's shade falls across the wood: its middle and how far it reaches */
  under: { y: number; reach: number };
}

/** A limb's line moved bodily, for the light and the shade that lie along it. */
const moved = (line: readonly Pt[], dx: readonly number[], dy: readonly number[]): Pt[] => line.map(([x, y], i) => [x + (dx[i] ?? 0), y + (dy[i] ?? 0)]);

/**
 * The wood drawn: one piece, lit from the upper left. The trunk carries the
 * light down its left and a broad shade down its right; a bough or a root is
 * only shaded along its lower side; and under the crown the whole of it is
 * in the crown's shade.
 */
function drawWood(dr: Drawing, timber: Timber, wood: Wood, rand: Rand, knots: boolean): string {
  const [deep, shade, base, light] = wood;
  const whole = timber.limbs.map((l) => limb(l.line, l.widths)).join('');
  const clip = dr.clip(whole);
  const face = mix(base, light, 0.62);
  let inside = '';
  for (const l of timber.limbs) {
    if (l.part === 'trunk') {
      inside += path(limb(moved(l.line, l.widths.map((w) => w * 0.36), []), l.widths.map((w) => w * 0.34)), shade);
      inside += path(limb(moved(l.line, l.widths.map((w) => -w * 0.2), []), l.widths.map((w, i) => w * (i === l.widths.length - 1 ? 0.14 : 0.3))), face);
    } else {
      inside += path(limb(moved(l.line, l.widths.map((w) => w * 0.2), l.widths.map((w) => w * 0.28)), l.widths.map((w) => w * 0.4)), shade);
      if (l.part === 'bough') inside += path(limb(moved(l.line, l.widths.map((w) => -w * 0.18), l.widths.map((w) => -w * 0.2)), l.widths.map((w) => w * 0.26)), face);
    }
  }
  const trunk = timber.limbs[0];
  if (trunk && knots) {
    // the bark: a few strokes up the trunk, and a knot
    const [bx, by] = trunk.line[0] as Pt;
    const [tx, ty] = trunk.line[trunk.line.length - 1] as Pt;
    const w = trunk.widths[2] ?? 6;
    for (let i = 0; i < 3; i++) {
      const u = 0.24 + i * 0.18 + rand() * 0.04;
      const x = bx + (tx - bx) * u + [-0.24, 0.16, -0.06][i]! * w;
      const y = by + (ty - by) * u;
      inside += path(limb([[x, y], [x + w * 0.05, y - w * 0.26], [x - w * 0.02, y - w * 0.5]], [w * 0.05, w * 0.08, w * 0.03]), shade);
    }
    const ky = by + (ty - by) * 0.5;
    const kx = bx + (tx - bx) * 0.5 + w * 0.1;
    inside += ellipse(kx, ky, w * 0.15, w * 0.19, deep, ' opacity="0.7"') + ellipse(kx - w * 0.03, ky - w * 0.03, w * 0.07, w * 0.09, shade);
  }
  // the crown's shade over the top of the wood, fading down it
  const under = dr.id('u');
  dr.def(linearAt(under, [[0, deep, 0.75], [1, deep, 0]], 0, timber.under.y - timber.under.reach * 0.2, 0, timber.under.y + timber.under.reach * 0.34));
  inside += `<rect x="0" y="${n(timber.under.y - timber.under.reach)}" width="120" height="${n(timber.under.reach * 1.4)}" fill="url(#${under})"/>`;
  return `${path(whole, base)}<g clip-path="url(#${clip})">${inside}</g>`;
}

// ───────────────────────────────────────────────────────────────── ground

/** A tuft of grass: three blades from one foot. */
function tuft(x: number, y: number, h: number, lean: number, g0: string, g1: string): string {
  return path(leafAt([x, y], -90 + lean, h, h * 0.3), g1) + path(leafAt([x, y], -122 + lean, h * 0.76, h * 0.28), g0) + path(leafAt([x, y], -58 + lean, h * 0.8, h * 0.28), g1);
}

/** Earth in a state: dark and moist while the tree is watered, paler as it dries. */
function soilOf(health: TreeHealth): readonly [string, string, string] {
  const dry = Math.min(1, STATE[health].dry + STATE[health].dead);
  return [mix('#4f2c1f', '#8f6a4b', dry * 0.7), mix('#74452e', '#b0875f', dry * 0.7), mix('#9a6240', '#cfa77c', dry * 0.7)];
}

/** Grass in a state: green while the tree is watered, straw as it dries. */
function grassOf(kind: Kind, health: TreeHealth): [string, string] {
  const s = STATE[health];
  return kind.grass.map((c) => mix(mix(c, '#c7b452', s.dry * 0.8), '#b89a5a', s.dead * 0.7)) as [string, string];
}

/**
 * The tree's own piece of ground: a little island of earth, its top grown
 * over with grass that hangs over the edge, its underside the earth it was
 * cut from, with a stone or two in it. `half` is half its width, `depth` how
 * far the earth goes down, and `top` where its grass lies. Round a tree left
 * unwatered the grass turns to straw, the earth pales and the flowers go.
 */
function drawIsland(dr: Drawing, kind: Kind, health: TreeHealth, half: number, depth: number, rand: Rand, tufts: number, flowers: number, top = GROUND): string {
  const s = STATE[health];
  const [g0, g1] = grassOf(kind, health);
  const soil = soilOf(health);
  let out = ellipse(MID + 1, top + depth + 2.6, half * 0.7, 2.2 + half * 0.03, '#000000', ' opacity="0.1"');
  // the earth under it, rounded like a clod
  const x0 = MID - half * 0.95;
  const x1 = MID + half * 0.95;
  const clod = `M${n(x0)} ${n(top)}C${n(x0 + half * 0.04)} ${n(top + depth * 0.86)} ${n(MID - half * 0.46)} ${n(top + depth)} ${n(MID)} ${n(top + depth)}C${n(MID + half * 0.46)} ${n(top + depth)} ${n(x1 - half * 0.04)} ${n(top + depth * 0.86)} ${n(x1)} ${n(top)}Z`;
  const clip = dr.clip(clod);
  let inside = path(clod, soil[1]);
  inside += ellipse(MID + half * 0.3, top + depth * 0.9, half * 0.8, depth * 0.62, soil[0], ' opacity="0.7"');
  inside += ellipse(MID - half * 0.34, top + depth * 0.3, half * 0.5, depth * 0.3, soil[2], ' opacity="0.5"');
  const stones = Math.max(2, Math.round(half / 9));
  for (let i = 0; i < stones; i++) {
    const x = MID + (rand() - 0.5) * half * 1.4;
    const y = top + depth * (0.42 + rand() * 0.34);
    const r = 0.8 + rand() * (depth * 0.1);
    inside += ellipse(x, y, r * 1.3, r, i % 2 === 0 ? soil[2] : soil[0], ' opacity="0.9"');
  }
  out += `<g clip-path="url(#${clip})">${inside}</g>`;
  // the grass over it: its rim hanging over the earth in soft drips, and the lighter top
  const ry = half * 0.15;
  out += path(puffPath(MID, top + ry * 0.34, half, ry * 1.12, rand, Math.round(half * 0.36) + 7, 0.62), g0);
  out += ellipse(MID, top - ry * 0.06, half * 0.95, ry * 0.84, g0);
  out += path(puffPath(MID - half * 0.04, top - ry * 0.16, half * 0.82, ry * 0.6, rand, Math.round(half * 0.3) + 5, 0.5), g1, ' opacity="0.62"');
  // the tree's own shade on the grass at its foot
  out += ellipse(MID + half * 0.05, top, half * 0.46, ry * 0.44, tint(g0, -0.34), ' opacity="0.3"');
  for (let i = 0; i < tufts; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = MID + side * half * (0.4 + rand() * 0.48);
    const y = top + ry * (0.1 + rand() * 0.5);
    out += tuft(x, y, 2.6 + rand() * 2.4, s.droop * 5 * side, g0, g1);
  }
  if (health === 'fresh') {
    for (let i = 0; i < flowers; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const x = MID + side * half * (0.5 + rand() * 0.34);
      const y = top + ry * (0.2 + rand() * 0.4);
      const c = i % 3 === 0 ? '#ffd45a' : '#ffffff';
      out += path(limb([[x, y + 1.4], [x + 0.3, y - 1.2]], [0.7, 0.5]), g0);
      for (let k = 0; k < 5; k++) out += path(leafAt([x + 0.3, y - 1.8], k * 72 - 90, 1.9, 0.9), c);
      out += ellipse(x + 0.3, y - 1.8, 0.7, 0.7, c === '#ffffff' ? '#ffcf4a' : '#f08a2a');
    }
  }
  return out;
}

/** Leaves that have come down: lying on the grass, and one or two still in the air. */
function drawFallen(colours: readonly string[], count: number, half: number, top: number, rand: Rand): string {
  let out = '';
  for (let i = 0; i < count; i++) {
    const air = i % 4 === 3;
    const x = MID + (rand() - 0.5) * half * (air ? 1.9 : 1.7);
    const y = air ? top + (GROUND - top) * (0.4 + rand() * 0.4) : GROUND - 0.4 + rand() * half * 0.1;
    const len = 2.6 + rand() * 1.6;
    out += path(leafAt([x, y], rand() * 360, len, len * 0.44), colours[i % colours.length] as string);
  }
  return out;
}

// ───────────────────────────────────────────────────────────── the stages

/** A kind's seed, drawn with its middle at (x, y). */
function drawSeedling(kind: Kind, x: number, y: number): string {
  const c = kind.seedColour;
  if (kind.seed === 'acorn') {
    return (
      ellipse(x, y + 1.2, 5.2, 6.4, c) +
      ellipse(x - 1.7, y - 0.2, 1.5, 3, tint(c, 0.42), ' opacity="0.85"') +
      path(`M${n(x - 5.9)} ${n(y - 2.2)}C${n(x - 5.9)} ${n(y - 7.8)} ${n(x + 5.9)} ${n(y - 7.8)} ${n(x + 5.9)} ${n(y - 2.2)}Z`, tint(c, -0.44)) +
      path(`M${n(x - 4.6)} ${n(y - 4.4)}C${n(x - 3.6)} ${n(y - 6.4)} ${n(x - 0.6)} ${n(y - 6.8)} ${n(x + 0.6)} ${n(y - 6.6)}C${n(x - 1.6)} ${n(y - 5.6)} ${n(x - 3.4)} ${n(y - 4.6)} ${n(x - 4.6)} ${n(y - 4.4)}Z`, tint(c, -0.2)) +
      path(limb([[x, y - 6.2], [x + 0.6, y - 8.6]], [1.4, 1]), tint(c, -0.5))
    );
  }
  if (kind.seed === 'almond') {
    return path(leafAt([x, y + 7.4], -90, 15, 5.8), c) + path(leafAt([x - 1.4, y + 5], -92, 9.4, 1.7), tint(c, 0.45), ' opacity="0.8"') + path(leafAt([x + 2, y + 5], -88, 8, 1.2), tint(c, -0.3), ' opacity="0.5"');
  }
  if (kind.seed === 'drop') {
    return (
      path(`M${n(x)} ${n(y - 7.4)}C${n(x + 6.6)} ${n(y - 1)} ${n(x + 5.8)} ${n(y + 6.6)} ${n(x)} ${n(y + 6.6)}C${n(x - 5.8)} ${n(y + 6.6)} ${n(x - 6.6)} ${n(y - 1)} ${n(x)} ${n(y - 7.4)}Z`, c) +
      ellipse(x - 2, y + 0.8, 1.4, 2.8, tint(c, 0.55), ' opacity="0.85"') +
      ellipse(x + 2, y + 3.4, 2.2, 1.6, tint(c, -0.3), ' opacity="0.5"')
    );
  }
  if (kind.seed === 'cone') {
    let out = ellipse(x, y, 4.8, 6.8, c);
    for (let i = 0; i < 3; i++) out += path(limb([[x - 4.2, y - 3.4 + i * 3.2], [x, y - 1.2 + i * 3.2], [x + 4.2, y - 3.4 + i * 3.2]], [0.5, 1, 0.5]), tint(c, -0.4));
    return out + ellipse(x - 1.8, y - 3, 1.2, 1.8, tint(c, 0.4), ' opacity="0.7"');
  }
  return ellipse(x, y, 5.4, 6.2, c) + ellipse(x - 1.8, y - 1.6, 1.5, 2.4, tint(c, 0.48), ' opacity="0.85"') + ellipse(x + 1.8, y + 2.6, 2.4, 1.8, tint(c, -0.3), ' opacity="0.45"');
}

/**
 * Under the ground: the island seen close, cut open, and the seed asleep in
 * a hollow of it, with a first thread of root. Watered, a few drops of light
 * stand over where it will come up; left dry, the earth is pale and still.
 */
function drawSeed(dr: Drawing, kind: Kind, health: TreeHealth, rand: Rand): Layers {
  const top = 62;
  let out = drawIsland(dr, kind, health, 37, 44, rand, 7, 2, top);
  const soil = soilOf(health);
  let plant = '';
  // the hollow, and the seed in it
  out += ellipse(MID, top + 23, 12.6, 10.4, soil[0]);
  out += ellipse(MID - 1, top + 21.4, 10.4, 8, tint(soil[0], -0.18), ' opacity="0.55"');
  out += path(limb([[MID + 0.6, top + 28], [MID + 1.8, top + 32.4], [MID - 0.4, top + 35.6]], [1.3, 1, 0.5]), '#f1e7cf');
  out += drawSeedling(kind, MID, top + 22);
  if (health === 'fresh') {
    // it is alive down there: a little light over the spot
    for (const [dx, dy, r] of [[-7, -9, 1.5], [6, -13, 1.1], [1, -19, 0.8]] as const) plant += path(sparkle(MID + dx, top + dy, r * 1.9), '#fff3b0', ' opacity="0.95"');
  }
  return { ground: out, plant };
}

/** A four-pointed spark of light. */
function sparkle(cx: number, cy: number, r: number): string {
  const k = r * 0.24;
  return `M${n(cx)} ${n(cy - r)}Q${n(cx + k)} ${n(cy - k)} ${n(cx + r)} ${n(cy)}Q${n(cx + k)} ${n(cy + k)} ${n(cx)} ${n(cy + r)}Q${n(cx - k)} ${n(cy + k)} ${n(cx - r)} ${n(cy)}Q${n(cx - k)} ${n(cy - k)} ${n(cx)} ${n(cy - r)}Z`;
}

/** A sprout or a seedling: a stem out of a little mound, with its first leaves. */
function drawSprout(dr: Drawing, kind: Kind, stage: 1 | 2, health: TreeHealth, ramp: Ramp, rand: Rand): Layers {
  const s = STATE[health];
  const tall = stage === 1 ? 32 : 54;
  const half = stage === 1 ? 23 : 27;
  // a young shoot is green whatever it will be: the kind's own colour comes with its crown
  const green: Ramp = fared(['#1d6b3a', '#27883f', '#3da548', '#63c04e', '#9bdc5a', '#d3f28f'], health);
  let out = drawIsland(dr, kind, health, half, stage === 1 ? 15 : 14, rand, stage === 1 ? 4 : 6, 0);
  // the mound it came up through, and the husk of its seed
  const soil = soilOf(health);
  out += path(`M${n(MID - 12)} ${n(GROUND + 0.6)}C${n(MID - 10)} ${n(GROUND - 7)} ${n(MID + 10)} ${n(GROUND - 7)} ${n(MID + 12)} ${n(GROUND + 0.6)}C${n(MID + 7)} ${n(GROUND + 2.8)} ${n(MID - 7)} ${n(GROUND + 2.8)} ${n(MID - 12)} ${n(GROUND + 0.6)}Z`, soil[1]);
  out += ellipse(MID - 3.4, GROUND - 3.2, 5, 1.8, soil[2], ' opacity="0.7"');
  if (stage === 1) out += path(leafAt([MID + 3.4, GROUND - 1], -28, 6.4, 2.6), tint(kind.seedColour, -0.2)) + path(leafAt([MID + 3.8, GROUND - 1.6], -30, 4.4, 1.1), tint(kind.seedColour, 0.3));
  // the stem: it bows as it goes without water
  const bow = s.droop * (stage === 1 ? 1.7 : 2.3);
  const tip: Pt = [MID + bow * 1.8, GROUND - tall + bow * 1.4];
  const line: Pt[] = [[MID, GROUND - 2], [MID - 1.4 + bow * 0.3, GROUND - tall * 0.42], [MID + 0.8 + bow, GROUND - tall * 0.78], tip];
  let plant = path(limb(line, stage === 1 ? [3.6, 3, 2.3, 1.6] : [4.8, 3.8, 2.9, 1.8]), green[2]);
  plant += path(limb(beside(line, [0.8, 0.7, 0.5, 0.3]), [1.1, 1, 0.7, 0.4]), green[4]);
  // its leaves, in pairs up the stem; the first pair the biggest, each with its midrib of light
  const pairs = stage === 1 ? 1 : 3;
  const hang = s.droop * 17;
  for (let i = 0; i < pairs; i++) {
    const u = stage === 1 ? 1 : 0.44 + (i / (pairs - 1)) * 0.56;
    const at: Pt = [MID + (tip[0] - MID) * u * u + (i % 2 === 0 ? 0 : -0.4), GROUND - 2 - (tall - 2 - bow * 1.4) * u];
    const len = (stage === 1 ? 16 : 18 - i * 3) * (0.94 + rand() * 0.1);
    const left = -154 - i * 5 - hang;
    const right = -26 + i * 5 + hang;
    plant += path(leafAt(at, left, len, len * 0.36), green[2]) + path(leafAt(at, left - 6, len * 0.84, len * 0.17), green[4]);
    plant += path(leafAt(at, right, len * 0.94, len * 0.36), green[3]) + path(leafAt(at, right - 7, len * 0.78, len * 0.16), green[5]);
  }
  if (stage === 2 && health !== 'withered') {
    // the newest leaf, still furled at its tip, already in the colour its crown will be
    plant += path(leafAt(tip, -98 + hang * 0.4, 9, 2.8), ramp[3]) + path(leafAt(tip, -102 + hang * 0.4, 6.2, 1.2), ramp[5]);
  }
  if (s.fallen > 0) out += drawFallen([green[3], green[4]], Math.round(s.fallen * 0.4), half, GROUND - tall, rand);
  return { ground: out, plant };
}

/** One mass of a crown as a stand lists it: x and y from the crown's middle in halves of its width, its size, how near, and how flat. */
type Mass = readonly [x: number, y: number, r: number, near: 0 | 1 | 2, squash?: number];

/** How a tree stands at a stage: how tall its trunk and how thick, how wide its crown and where it sits. */
interface Stand {
  trunk: number;
  girth: number;
  /** the crown's middle above the ground, and half its width */
  crownY: number;
  half: number;
  /** its island: half its width, and how deep its earth */
  ground: number;
  depth: number;
  tufts: number;
  flowers: number;
  /** its masses, far ones first */
  puffs: readonly Mass[];
}

type Grown = 3 | 4 | 5 | 6;

/** A broad dome as it grows: a few masses on a slip of a trunk, then a full round crown, wider than it is tall, its fork showing under it. */
const DOME: Record<Grown, Stand> = {
  3: { trunk: 27, girth: 4.6, crownY: 45, half: 21, ground: 25, depth: 14, tufts: 6, flowers: 0, puffs: [[0.44, 0.1, 0.54, 0], [-0.42, 0.14, 0.58, 2], [0.1, -0.3, 0.68, 2]] },
  4: {
    trunk: 28,
    girth: 7.4,
    crownY: 51,
    half: 30,
    ground: 31,
    depth: 14,
    tufts: 7,
    flowers: 1,
    puffs: [[0.54, 0.06, 0.48, 0], [-0.2, -0.42, 0.48, 0], [-0.56, 0.08, 0.46, 2], [0.32, -0.3, 0.5, 2], [-0.06, 0.06, 0.52, 2]],
  },
  5: {
    trunk: 31,
    girth: 11,
    crownY: 56,
    half: 39,
    ground: 37,
    depth: 15,
    tufts: 8,
    flowers: 2,
    puffs: [[0.64, 0.06, 0.4, 0], [-0.66, 0.1, 0.38, 0], [0.06, -0.46, 0.44, 0], [-0.42, -0.26, 0.42, 2], [0.46, -0.24, 0.42, 2], [0.3, 0.12, 0.36, 1], [-0.3, 0.14, 0.36, 2], [0.0, -0.1, 0.42, 2]],
  },
  6: {
    trunk: 33,
    girth: 14.5,
    crownY: 59,
    half: 47,
    ground: 43,
    depth: 15,
    tufts: 10,
    flowers: 3,
    puffs: [
      [0.7, 0.06, 0.34, 0],
      [-0.72, 0.08, 0.34, 0],
      [0.3, -0.46, 0.34, 0],
      [-0.34, -0.44, 0.36, 0],
      [-0.52, -0.18, 0.38, 2],
      [0.54, -0.18, 0.38, 2],
      [0.02, -0.4, 0.38, 2],
      [0.38, 0.12, 0.32, 1],
      [-0.4, 0.14, 0.32, 2],
      [-0.02, -0.04, 0.4, 2],
    ],
  },
};

/** A bush of a tree: rounder and lower than a dome, on several stems. */
const SHRUB: Record<Grown, Stand> = {
  3: { trunk: 20, girth: 3.6, crownY: 36, half: 20, ground: 25, depth: 14, tufts: 6, flowers: 0, puffs: [[0.4, 0.1, 0.56, 0], [-0.44, 0.12, 0.58, 2], [0.04, -0.34, 0.64, 2]] },
  4: { trunk: 22, girth: 5.4, crownY: 43, half: 28, ground: 31, depth: 14, tufts: 7, flowers: 1, puffs: [[0.5, 0.1, 0.5, 0], [-0.14, -0.5, 0.5, 0], [-0.52, 0.06, 0.5, 2], [0.34, -0.3, 0.5, 2], [-0.02, 0.1, 0.52, 2]] },
  5: {
    trunk: 24,
    girth: 7.4,
    crownY: 49,
    half: 36,
    ground: 37,
    depth: 15,
    tufts: 8,
    flowers: 2,
    puffs: [[0.58, 0.1, 0.42, 0], [-0.6, 0.14, 0.42, 0], [0.04, -0.56, 0.44, 0], [-0.4, -0.3, 0.44, 2], [0.42, -0.3, 0.44, 2], [0.28, 0.16, 0.38, 1], [-0.26, 0.18, 0.38, 2], [0.0, -0.12, 0.44, 2]],
  },
  6: {
    trunk: 26,
    girth: 9.4,
    crownY: 54,
    half: 43,
    ground: 43,
    depth: 15,
    tufts: 10,
    flowers: 3,
    puffs: [
      [0.64, 0.1, 0.36, 0],
      [-0.66, 0.12, 0.36, 0],
      [0.28, -0.58, 0.36, 0],
      [-0.3, -0.58, 0.36, 0],
      [-0.5, -0.24, 0.4, 2],
      [0.5, -0.24, 0.4, 2],
      [0.0, -0.52, 0.4, 2],
      [0.36, 0.16, 0.34, 1],
      [-0.36, 0.18, 0.34, 2],
      [0.0, -0.1, 0.42, 2],
    ],
  },
};

/** A crown of blossom: its masses a little apart, like clouds, on a slender dark trunk. */
const CLOUD: Record<Grown, Stand> = {
  3: { trunk: 28, girth: 3.8, crownY: 46, half: 22, ground: 25, depth: 14, tufts: 6, flowers: 0, puffs: [[0.5, 0.0, 0.5, 0], [-0.46, 0.1, 0.52, 2], [0.06, -0.36, 0.6, 2]] },
  4: { trunk: 29, girth: 5.6, crownY: 52, half: 31, ground: 31, depth: 14, tufts: 7, flowers: 1, puffs: [[0.6, 0.02, 0.42, 0], [-0.24, -0.5, 0.42, 0], [-0.6, 0.08, 0.42, 2], [0.3, -0.34, 0.46, 2], [-0.08, 0.02, 0.46, 2]] },
  5: {
    trunk: 31,
    girth: 7.6,
    crownY: 57,
    half: 40,
    ground: 37,
    depth: 15,
    tufts: 8,
    flowers: 2,
    puffs: [[0.7, 0.04, 0.34, 0], [-0.7, 0.1, 0.34, 0], [0.1, -0.52, 0.38, 0], [-0.46, -0.3, 0.38, 2], [0.48, -0.28, 0.38, 2], [0.26, 0.1, 0.32, 1], [-0.3, 0.12, 0.34, 2], [0.0, -0.14, 0.38, 2]],
  },
  6: {
    trunk: 33,
    girth: 9.6,
    crownY: 60,
    half: 48,
    ground: 43,
    depth: 15,
    tufts: 10,
    flowers: 3,
    puffs: [
      [0.74, 0.04, 0.3, 0],
      [-0.74, 0.08, 0.3, 0],
      [0.32, -0.5, 0.32, 0],
      [-0.36, -0.48, 0.32, 0],
      [-0.54, -0.2, 0.34, 2],
      [0.56, -0.2, 0.34, 2],
      [0.0, -0.44, 0.34, 2],
      [0.36, 0.1, 0.3, 1],
      [-0.4, 0.12, 0.3, 2],
      [-0.02, -0.08, 0.36, 2],
    ],
  },
};

/** A tall, narrow tree: its masses one over another, narrowing to a point. */
const COLUMN: Record<Grown, Stand> = {
  3: { trunk: 22, girth: 3.4, crownY: 38, half: 10, ground: 22, depth: 14, tufts: 6, flowers: 0, puffs: [[0.1, 0.9, 0.9, 0], [-0.1, 0.0, 1.0, 2], [0.04, -1.0, 0.74, 2]] },
  4: { trunk: 20, girth: 4.6, crownY: 42, half: 12.5, ground: 27, depth: 14, tufts: 7, flowers: 1, puffs: [[0.16, 1.3, 0.84, 0], [-0.14, 0.5, 0.98, 2], [0.1, -0.3, 0.96, 0], [-0.06, -1.1, 0.8, 2], [0.02, -1.8, 0.54, 2]] },
  5: {
    trunk: 18,
    girth: 5.8,
    crownY: 46,
    half: 15,
    ground: 32,
    depth: 15,
    tufts: 8,
    flowers: 2,
    puffs: [[0.2, 1.5, 0.8, 0], [-0.18, 0.84, 0.96, 2], [0.16, 0.14, 1.0, 0], [-0.12, -0.56, 0.94, 2], [0.1, -1.24, 0.8, 0], [-0.04, -1.84, 0.62, 2], [0.02, -2.3, 0.4, 2]],
  },
  6: {
    trunk: 18,
    girth: 7,
    crownY: 51,
    half: 17,
    ground: 36,
    depth: 15,
    tufts: 10,
    flowers: 3,
    puffs: [[0.22, 1.5, 0.78, 0], [-0.2, 0.96, 0.94, 2], [0.2, 0.34, 1.0, 0], [-0.16, -0.3, 0.98, 2], [0.14, -0.94, 0.88, 0], [-0.08, -1.52, 0.74, 2], [0.06, -2.02, 0.56, 2], [0.0, -2.42, 0.36, 2]],
  },
};

/** A conifer: tiers of needles, each a flattened mass over the dark of the one above it, narrowing to its tip. */
const TIERS: Record<Grown, Stand> = {
  3: { trunk: 14, girth: 3.6, crownY: 31, half: 17, ground: 23, depth: 14, tufts: 6, flowers: 0, puffs: [[0, -0.7, 0.42, 2, 0.8], [0, -0.16, 0.7, 2, 0.5], [0, 0.42, 0.96, 2, 0.42]] },
  4: { trunk: 15, girth: 5, crownY: 39, half: 22, ground: 28, depth: 14, tufts: 7, flowers: 1, puffs: [[0, -0.86, 0.36, 2, 0.84], [0, -0.38, 0.58, 2, 0.5], [0, 0.14, 0.8, 2, 0.42], [0, 0.68, 0.98, 2, 0.38]] },
  5: { trunk: 16, girth: 6.6, crownY: 47, half: 27, ground: 33, depth: 15, tufts: 8, flowers: 2, puffs: [[0, -0.98, 0.32, 2, 0.86], [0, -0.56, 0.5, 2, 0.52], [0, -0.1, 0.68, 2, 0.44], [0, 0.38, 0.84, 2, 0.4], [0, 0.86, 0.98, 2, 0.36]] },
  6: {
    trunk: 17,
    girth: 8,
    crownY: 54,
    half: 31,
    ground: 38,
    depth: 15,
    tufts: 10,
    flowers: 3,
    puffs: [[0, -1.1, 0.28, 2, 0.9], [0, -0.74, 0.44, 2, 0.54], [0, -0.34, 0.6, 2, 0.46], [0, 0.08, 0.74, 2, 0.42], [0, 0.52, 0.88, 2, 0.38], [0, 0.96, 1.0, 2, 0.36]],
  },
};

/** A weeping tree: a low dome its strands hang from. */
const WEEPING: Record<Grown, Stand> = {
  3: { trunk: 26, girth: 4.2, crownY: 44, half: 21, ground: 25, depth: 14, tufts: 6, flowers: 0, puffs: [[0.4, 0.0, 0.5, 0], [-0.42, 0.04, 0.52, 2], [0.04, -0.26, 0.62, 2]] },
  4: { trunk: 28, girth: 6.4, crownY: 52, half: 29, ground: 31, depth: 14, tufts: 7, flowers: 1, puffs: [[0.5, -0.02, 0.46, 0], [-0.52, 0.02, 0.46, 0], [-0.24, -0.26, 0.48, 2], [0.26, -0.28, 0.48, 2], [0.0, -0.42, 0.44, 2]] },
  5: {
    trunk: 30,
    girth: 9,
    crownY: 60,
    half: 37,
    ground: 37,
    depth: 15,
    tufts: 8,
    flowers: 2,
    puffs: [[0.62, 0.0, 0.38, 0], [-0.64, 0.02, 0.38, 0], [0.34, -0.3, 0.4, 0], [-0.36, -0.3, 0.4, 2], [0.0, -0.44, 0.42, 2], [0.2, -0.08, 0.36, 2], [-0.24, -0.06, 0.36, 2]],
  },
  6: {
    trunk: 32,
    girth: 12,
    crownY: 62,
    half: 44,
    ground: 43,
    depth: 15,
    tufts: 10,
    flowers: 3,
    puffs: [[0.68, 0.0, 0.34, 0], [-0.7, 0.02, 0.34, 0], [0.4, -0.3, 0.36, 0], [-0.42, -0.3, 0.36, 0], [0.0, -0.46, 0.34, 2], [0.5, -0.1, 0.32, 2], [-0.5, -0.08, 0.32, 2], [0.22, -0.26, 0.36, 2], [-0.22, -0.24, 0.36, 2]],
  },
};

const STANDS: Record<Habit, Record<Grown, Stand>> = { dome: DOME, shrub: SHRUB, cloud: CLOUD, column: COLUMN, tiers: TIERS, weeping: WEEPING };

/** A grown tree's wood, by its habit: a trunk that flares into roots, and boughs up to where its crown's masses are. */
function timberFor(habit: Habit, stand: Stand, stage: Grown, rand: Rand): Timber {
  const g = stand.girth;
  const cy = GROUND - stand.crownY;
  const limbs: Timber['limbs'] = [];
  const roots = (reach: number, toes: number): void => {
    limbs.push({ part: 'root', line: [[MID - g * 0.26, GROUND - g * 0.5], [MID - reach * 0.74, GROUND + 0.1], [MID - reach * 1.1, GROUND + 1.3]], widths: [g * 0.66, g * 0.4, g * 0.2] });
    limbs.push({ part: 'root', line: [[MID + g * 0.28, GROUND - g * 0.5], [MID + reach * 0.8, GROUND + 0.2], [MID + reach * 1.18, GROUND + 1.5]], widths: [g * 0.66, g * 0.4, g * 0.2] });
    if (toes > 2) limbs.push({ part: 'root', line: [[MID - g * 0.04, GROUND - g * 0.3], [MID + g * 0.06, GROUND + 1], [MID + g * 0.2, GROUND + 2.6]], widths: [g * 0.54, g * 0.4, g * 0.22] });
  };
  if (habit === 'tiers' || habit === 'column') {
    // one straight stem up through the whole crown
    const top: Pt = [MID, cy - stand.half * (habit === 'tiers' ? 0.7 : 1.9)];
    limbs.push({ part: 'trunk', line: [[MID, GROUND + 0.8], [MID + 0.3, GROUND - stand.trunk * 0.5], [MID, GROUND - stand.trunk], top], widths: [g * 1.4, g * 0.96, g * 0.84, g * 0.3] });
    if (stage >= 4) roots(g * 1.1, stage >= 5 ? 3 : 2);
    // a twig to each side at every mass of its crown, shorter toward the tip
    stand.puffs.forEach(([, y, r, , squash], i) => {
      const at = cy + y * stand.half * 0.94;
      if (at > GROUND - stand.trunk * 0.7) return;
      const reach = r * stand.half * 0.74;
      const rise = reach * (squash === undefined ? 0.5 : 0.16);
      for (const side of i % 2 === 0 ? [-1, 1] : [1, -1]) {
        limbs.push({ part: 'bough', line: [[MID, at + 1], [MID + side * reach * 0.5, at - rise * 0.4], [MID + side * reach, at - rise]], widths: [g * 0.3, g * 0.2, g * 0.1] });
      }
    });
    return { limbs, under: { y: GROUND - stand.trunk + g * 0.2, reach: stand.half * 1.2 } };
  }
  if (habit === 'shrub') {
    // several stems from one foot, leaning apart
    const stems: readonly (readonly [number, number, number])[] = stage === 3 ? [[-0.2, 0.06, 1], [0.24, 0.0, 0.84]] : [[-0.42, 0.06, 0.92], [0.02, -0.16, 1], [0.44, 0.02, 0.86]];
    stems.forEach(([ax, ay, k], i) => {
      const end: Pt = [MID + ax * stand.half, cy + ay * stand.half];
      const foot: Pt = [MID + ax * g * 0.9, GROUND + 0.8];
      const mid: Pt = [foot[0] + (end[0] - foot[0]) * 0.36 - ax * 3, foot[1] + (end[1] - foot[1]) * 0.5];
      limbs.push({ part: i === 1 || stems.length === 2 ? 'trunk' : 'bough', line: [foot, mid, end], widths: [g * 1.1 * k, g * 0.78 * k, g * 0.4 * k] });
      if (stage >= 5) {
        const out: Pt = [end[0] + (ax || 0.2) * stand.half * 0.5, end[1] - stand.half * 0.2];
        limbs.push({ part: 'bough', line: [mid, [(mid[0] + out[0]) / 2 + 1, (mid[1] + out[1]) / 2 - 2], out], widths: [g * 0.44 * k, g * 0.3 * k, g * 0.16 * k] });
      }
    });
    // the stem written first is the one the bark and the light go on
    limbs.sort((a, b) => (a.part === 'trunk' ? -1 : 0) - (b.part === 'trunk' ? -1 : 0));
    return { limbs, under: { y: cy + stand.half * 0.34, reach: stand.half * 0.8 } };
  }
  // a trunk with a lean to it (more of one on a blossom tree), forking under its crown
  const lean = (rand() - 0.5) * 2.4 + (habit === 'cloud' ? 3.4 : 0);
  const fork: Pt = [MID - lean * 0.5, GROUND - stand.trunk];
  limbs.push({
    part: 'trunk',
    line: [[MID, GROUND + 0.8], [MID + lean * 0.5, GROUND - stand.trunk * 0.22], [MID + lean, GROUND - stand.trunk * 0.58], fork],
    widths: [g * 1.5, g * 1.0, g * 0.84, g * 0.92],
  });
  if (stage >= 4) roots(g * (stage === 6 ? 1.3 : 1.14), stage >= 5 ? 3 : 2);
  const arms: readonly (readonly [number, number])[] = stage === 3 ? [[-0.3, 0.14], [0.3, 0.08], [0.04, -0.24]] : [[-0.54, 0.0], [0.54, -0.04], [0.02, -0.3], [-0.26, -0.26], [0.28, -0.24]];
  arms.forEach(([ax, ay], i) => {
    if (stage === 4 && i > 2) return;
    const end: Pt = [MID + ax * stand.half, cy + ay * stand.half];
    const from: Pt = [fork[0] + ax * g * 0.3, fork[1] + g * 0.7];
    const mid: Pt = [from[0] + (end[0] - from[0]) * 0.46 + (ax < 0 ? 1 : -1) * stand.half * 0.08, from[1] + (end[1] - from[1]) * 0.36];
    const w = g * (i < 3 ? 0.62 : 0.4);
    limbs.push({ part: 'bough', line: [from, mid, end], widths: [w, w * 0.66, w * 0.32] });
    if (stage >= 5 && i < 3) {
      // a twig off each bough, the way it would go on
      const out: Pt = [end[0] + ax * stand.half * 0.3 + (i % 2 === 0 ? 2 : -2), end[1] - stand.half * 0.12];
      limbs.push({ part: 'bough', line: [mid, [(mid[0] + out[0]) / 2, (mid[1] + out[1]) / 2 - 1.6], out], widths: [w * 0.42, w * 0.3, w * 0.16] });
    }
  });
  return { limbs, under: { y: fork[1] + g * 0.1, reach: stand.half * 0.7 } };
}

/** The ends of a tree's boughs: where its last leaves hang when it has withered. */
function boughEnds(timber: Timber): Pt[] {
  return timber.limbs.filter((l) => l.part !== 'root').map((l) => l.line[l.line.length - 1] as Pt);
}

// ──────────────────────────────────────────────────────── what a tree bears

/** A round fruit: its body, a spot of light, and its shade below. */
function fruitAt(x: number, y: number, r: number, [body, shade, light]: readonly [string, string, string]): string {
  return ellipse(x, y, r, r, shade) + ellipse(x - r * 0.1, y - r * 0.12, r * 0.9, r * 0.9, body) + ellipse(x - r * 0.36, y - r * 0.4, r * 0.3, r * 0.22, light, turned(-30, x - r * 0.36, y - r * 0.4));
}

/** A blossom: five petals round a gold middle. */
function blossomAt(x: number, y: number, r: number, petal: string, heart: string, turn: number): string {
  let out = '';
  for (let k = 0; k < 5; k++) out += path(leafAt([x, y], k * 72 + turn, r, r * 0.52), petal);
  return out + ellipse(x, y, r * 0.24, r * 0.24, heart);
}

/**
 * What a kind bears, over its crown: acorns, fruit, flowers, berries, cones,
 * ribbons or lights, more of them on the great tree than on the grown one.
 * Nothing on a tree that is wilting: it has let them fall.
 */
function drawBears(dr: Drawing, kind: Kind, stage: Grown, puffs: readonly Puff[], stand: Stand, cy: number, rand: Rand): { on: string; down: string } {
  if (stage < 5 || puffs.length === 0) return { on: '', down: '' };
  const near = puffs.filter((p) => p.near !== 0);
  // one to each near mass in turn, each time at another place on it: `low` keeps to its underside, where fruit hangs
  const spots = (count: number, low: boolean): Pt[] =>
    Array.from({ length: count }, (_, i) => {
      const p = near[i % near.length] as Puff;
      const turn = Math.floor(i / near.length);
      const a = low ? 50 + ((i * 47 + turn * 31) % 80) : (i * 137 + turn * 61) % 360;
      const k = low ? 0.56 + rand() * 0.26 : 0.2 + rand() * 0.46;
      const [ux, uy] = dir(a);
      return [p.x + ux * p.r * k, p.y + uy * p.r * (p.squash ?? 0.9) * k] as Pt;
    });
  const more = stage === 6;
  let out = '';
  let down = '';
  if (kind.bears === 'acorns') {
    if (!more) return { on: '', down: '' };
    for (const [x, y] of spots(9, true)) {
      out += ellipse(x, y + 1.4, 1.5, 1.9, kind.fruit[0]) + ellipse(x - 0.5, y + 1, 0.5, 0.9, kind.fruit[2]);
      out += path(`M${n(x - 1.9)} ${n(y + 0.3)}C${n(x - 1.9)} ${n(y - 1.7)} ${n(x + 1.9)} ${n(y - 1.7)} ${n(x + 1.9)} ${n(y + 0.3)}Z`, kind.fruit[1]);
    }
  } else if (kind.bears === 'pomegranates') {
    if (!more) {
      // in flower first: the pomegranate's red bells
      for (const [x, y] of spots(6, false)) out += blossomAt(x, y, 2.6, '#f2542d', '#ffc94a', rand() * 72);
      return { on: out, down };
    }
    for (const [x, y] of spots(9, true)) {
      const r = 3.4 + rand() * 1;
      // its crown, underneath as it hangs
      for (const k of [-1, 0, 1]) out += path(leafAt([x + k * r * 0.26, y + r * 0.8], 90 + k * 26, r * 0.6, r * 0.2), kind.fruit[1]);
      out += fruitAt(x, y, r, kind.fruit);
    }
  } else if (kind.bears === 'blossom') {
    for (const [x, y] of spots(more ? 16 : 9, false)) out += blossomAt(x, y, more ? 3 : 2.6, kind.fruit[0], kind.fruit[2], rand() * 72);
    // petals coming down, and lying on the grass
    down += drawFallen([kind.leaves[4], kind.leaves[5], kind.fruit[0]], more ? 12 : 6, stand.ground, cy, rand);
  } else if (kind.bears === 'berries') {
    if (!more) return { on: '', down: '' };
    for (const [x, y] of spots(11, true)) {
      const ripe = rand() > 0.3;
      const c: readonly [string, string, string] = ripe ? kind.fruit : ['#d8375a', '#a11f45', '#ff9db0'];
      // a mulberry: a little bunch of beads
      for (const [dx, dy] of [[0, 0], [-0.9, 1.1], [0.9, 1.1], [0, 2.1], [-0.6, 3.1], [0.6, 3.1]] as const) out += ellipse(x + dx, y + dy, 1, 1, i_shade(c, dx));
      out += ellipse(x - 0.4, y + 0.4, 0.4, 0.4, c[2]);
      out += path(limb([[x, y - 0.6], [x + 0.3, y - 2.2]], [0.5, 0.4]), kind.leaves[1]);
    }
  } else if (kind.bears === 'cones') {
    if (!more) return { on: '', down: '' };
    for (const p of puffs.slice(0, 4)) {
      const x = p.x + (rand() - 0.5) * p.r * 1.1;
      const y = p.y + p.r * (p.squash ?? 0.9) * 0.5;
      out += ellipse(x, y + 1.6, 1.5, 2.4, kind.fruit[1]) + ellipse(x - 0.3, y + 1.3, 1.1, 2, kind.fruit[0]) + ellipse(x - 0.5, y + 0.6, 0.4, 0.7, kind.fruit[2]);
    }
  } else if (kind.bears === 'leaves') {
    // an autumn tree lets its leaves go all the time
    down += drawFallen([kind.leaves[2], kind.leaves[3], kind.leaves[4], kind.leaves[1]], more ? 14 : 8, stand.ground, cy, rand);
  } else if (kind.bears === 'ribbons') {
    // a wish to each ribbon, tied to the crown's lower boughs and let hang
    const colours = ['#e8443a', '#f7c531', '#3aa3e8', '#ffffff', '#f28a2e', '#b46be0', '#ff7fa8'];
    const count = more ? 7 : 4;
    for (let i = 0; i < count; i++) {
      const u = (i + 0.5) / count;
      const c = colours[i % colours.length] as string;
      const x = MID + (u - 0.5) * 2 * stand.half * 0.8 + (rand() - 0.5) * 3;
      const off = Math.abs(u - 0.5) * 2;
      const y = cy + stand.half * (0.36 - off * off * 0.14) + rand() * 2;
      const len = 12 + rand() * 6;
      const sway = (i % 2 === 0 ? 1 : -1) * (0.7 + rand() * 0.6);
      out += path(limb([[x + 0.5, y], [x - sway * 0.9, y + len * 0.34], [x + sway * 0.6, y + len * 0.7]], [1.6, 1.9, 1.3]), tint(c, -0.2));
      out += path(limb([[x, y], [x + sway, y + len * 0.5], [x - sway * 0.5, y + len]], [1.7, 2, 1.4]), c);
      out += ellipse(x + 0.2, y, 1.4, 1.1, tint(c, -0.34));
    }
  } else if (kind.bears === 'lights') {
    // small lights in the dark of it, each in its own glow, and a star or two
    const glow = dr.id('l');
    dr.def(radialBox(glow, [[0, kind.fruit[0], 0.85], [0.4, kind.fruit[1], 0.3], [1, kind.fruit[1], 0]]));
    for (const [x, y] of spots(more ? 16 : 8, false)) {
      const r = 0.9 + rand() * 0.6;
      out += ellipse(x, y, r * 3.6, r * 3.6, `url(#${glow})`) + ellipse(x, y, r, r, kind.fruit[2]);
    }
    for (const [x, y] of spots(more ? 5 : 3, false)) out += path(sparkle(x + 3, y - 3, 2.2), kind.fruit[0]);
  }
  return { on: out, down };
}

/** A bead of a mulberry, a little darker on its right. */
function i_shade(c: readonly [string, string, string], dx: number): string {
  return dx > 0 ? c[1] : c[0];
}

/** The strands a weeping tree lets down: far ones dark behind its trunk, near ones light before it. */
function drawStrands(stand: Stand, cy: number, ramp: Ramp, rand: Rand, front: boolean, health: TreeHealth, stage: Grown): string {
  const s = STATE[health];
  const count = (stage - 1) * 2 + (front ? 1 : 2);
  let out = '';
  for (let i = 0; i < count; i++) {
    const u = (i + 0.5) / count;
    const x = MID + (u - 0.5) * 2 * stand.half * (front ? 0.92 : 1.02) + (rand() - 0.5) * 2;
    const off = Math.abs(u - 0.5) * 2;
    // those in the middle are held back, so the trunk shows between them
    if (front && off < 0.26) continue;
    if (health === 'withered' && i % 3 !== 0) {
      rand();
      rand();
      continue;
    }
    const y0 = cy + stand.half * (0.1 - off * off * 0.06);
    const reach = (GROUND - y0 - 3) * (0.5 + off * 0.42 + rand() * 0.1) * (health === 'withered' ? 0.5 : s.full);
    const sway = (u - 0.5) * 4 + (rand() - 0.5) * 2;
    const line: Pt[] = [[x, y0], [x + sway * 0.5, y0 + reach * 0.5], [x + sway, y0 + reach]];
    const [c0, c1] = front ? [ramp[3], ramp[4]] : [ramp[1], ramp[2]];
    out += path(limb(line, [1.5, 1.2, 0.5]), c0);
    if (health === 'withered') continue;
    // its leaves, in pairs down it, one of each pair in each of its two colours
    const pairs = Math.max(3, Math.round(reach / 3.9));
    const drawn = ['', ''];
    for (let k = 0; k < pairs; k++) {
      const t = (k + 0.6) / pairs;
      const at: Pt = [x + sway * t * (0.5 + t * 0.5), y0 + reach * t];
      const len = 3.6 + (1 - t) * 1.4;
      drawn[k % 2] += leafAt(at, 118 + (rand() - 0.5) * 16, len, len * 0.36);
      drawn[(k + 1) % 2] += leafAt(at, 62 + (rand() - 0.5) * 16, len * 0.92, len * 0.36);
    }
    out += path(drawn[0] as string, c0) + path(drawn[1] as string, c1);
  }
  return out;
}

/** What a drawing is made of: the ground, which stands still, and what grows on it, which can move. */
interface Layers {
  ground: string;
  plant: string;
}

/** A grown tree: its island, its wood, and its crown in whatever state it is in. */
function drawGrown(drGround: Drawing, dr: Drawing, kind: Kind, stage: Grown, health: TreeHealth, ramp: Ramp, rand: Rand): Layers {
  const stand = STANDS[kind.habit][stage];
  const s = STATE[health];
  const cy = GROUND - stand.crownY + s.droop;
  let ground = drawIsland(drGround, kind, health, stand.ground, stand.depth, rand, stand.tufts, stand.flowers);
  let plant = '';
  const wood = kind.wood.map((c) => mix(c, '#8a8078', s.dead * 0.45)) as unknown as Wood;
  const timber = timberFor(kind.habit, stand, stage, rand);
  const mark: Mark = kind.bears === 'blossom' ? 'petal' : kind.habit === 'tiers' ? 'needle' : 'leaf';
  const stem = kind.habit === 'tiers' || kind.habit === 'column';
  // a wilting tree's crown has thinned and sunk; a withered one has lost it, but for scraps on a tree of one stem
  const left = health === 'withered' ? (stem ? stand.puffs.filter((_, i) => i % 2 === 0) : []) : health === 'wilting' && !stem ? stand.puffs.filter((_, i) => i % 3 !== 1 || stand.puffs.length < 5) : stand.puffs;
  const puffs: Puff[] = left.map(([x, y, r, near, squash]) => ({
    x: MID + x * stand.half,
    y: cy + y * stand.half * 0.94,
    r: r * stand.half * (health === 'withered' ? 0.56 : s.full),
    near,
    ...(squash === undefined ? {} : { squash }),
    out: kind.habit === 'tiers' ? (x >= 0 ? -20 : 200) : (Math.atan2(y - 0.2, x || 0.01) * 180) / Math.PI,
  }));
  if (kind.habit === 'weeping') plant += drawStrands(stand, cy, ramp, rand, false, health, stage);
  plant += drawWood(dr, timber, wood, rand, stage >= 5);
  if (health === 'withered' && !stem) {
    // bare, but for a last leaf or two at the ends of its boughs
    boughEnds(timber).forEach(([x, y], i) => {
      if (i % 2 === 1) return;
      const len = 3 + rand() * 1.6;
      plant += path(leafAt([x, y], 70 + rand() * 50, len, len * 0.42), ramp[2]) + (i % 4 === 0 ? path(leafAt([x, y], 120 + rand() * 30, len * 0.8, len * 0.4), ramp[3]) : '');
    });
  } else {
    if (health !== 'withered') plant += drawUnderside(puffs, ramp, rand);
    for (const p of puffs) plant += drawPuff(dr, p, ramp, rand, mark, s.droop / 4.5, kind.sprig);
    if (health === 'fresh' || health === 'thirsty') {
      const bears = drawBears(dr, kind, stage, puffs, stand, cy, rand);
      plant += bears.on;
      ground += bears.down;
    }
  }
  if (kind.habit === 'weeping') plant += drawStrands(stand, cy, ramp, rand, true, health, stage);
  if (s.fallen > 0) ground += drawFallen([ramp[2], ramp[3], ramp[4]], Math.round(s.fallen * (0.5 + stage * 0.12)), stand.ground, cy, rand);
  return { ground, plant };
}

// ─────────────────────────────────────────────────────────────── the tree

export interface TreeOptions {
  species: TreeSpecies;
  stage: TreeStage;
  health?: TreeHealth;
  /**
   * Which of it to draw: the whole picture, or one of its two layers — the
   * ground, which stands still, and the plant on it, which an app lays over
   * the ground and moves (a sway, a start as it is watered). The layers are
   * drawn on the same canvas, so one over the other is the whole.
   */
  part?: 'whole' | 'ground' | 'plant';
  /** how big it is shown, in points or CSS pixels (it is square) */
  size?: number;
  /** what a screen reader is told it is; empty where the words beside it say so */
  title?: string;
  idPrefix?: string;
}

/** Where a plant stands on the canvas, as shares of its width and height: the point a sway turns about. */
export const TREE_FOOT = { x: MID / 120, y: GROUND / 120 } as const;

/** A tree, as an SVG. */
export function treeSvg(opts: TreeOptions): string {
  const size = checkSize(opts.size, 240);
  const health = opts.health ?? 'fresh';
  const part = opts.part ?? 'whole';
  const kind = KINDS[opts.species];
  const prefix = prefixFor(opts.idPrefix, 'tree', opts.species, opts.stage, health, part);
  // the whole is one drawing; a layer is drawn alongside the other, so that both come out exactly as they are in the whole
  const whole = new Drawing(prefix);
  const drGround = part === 'whole' ? whole : new Drawing(`${prefix}g`);
  const drPlant = part === 'whole' ? whole : new Drawing(`${prefix}p`);
  const rand = seeded(`tree:${opts.species}:${opts.stage}`);
  const ramp = fared(kind.leaves, health, kind.turns);
  const layers =
    opts.stage === 0
      ? drawSeed(drGround, kind, health, rand)
      : opts.stage <= 2
        ? drawSprout(drGround, kind, opts.stage as 1 | 2, health, ramp, rand)
        : drawGrown(drGround, drPlant, kind, opts.stage as Grown, health, ramp, rand);
  drGround.add(layers.ground);
  drPlant.add(layers.plant);
  return (part === 'ground' ? drGround : drPlant).svg(size, opts.title ?? '');
}

/** Whether there is a drawing for a kind: one the server knows that this build does not is simply not drawn. */
export function hasTreeArt(species: string): species is TreeSpecies {
  return Object.hasOwn(KINDS, species);
}

/** A kind's own colour, for what an app draws round its tree: the light behind it, a chip, a bar. */
export function treeColour(species: TreeSpecies): string {
  return KINDS[species].leaves[3];
}

// ─────────────────────────────────────────────────────────────────── water

/** Water's colours: deep, body, light, and the glint on it. */
const WATER = ['#1c6fd0', '#2f9bf0', '#8fd2ff', '#ffffff'] as const;

/** A drop of water: what a lesson earns and a tree drinks. */
export function waterDropSvg(opts: { size?: number; title?: string; idPrefix?: string } = {}): string {
  const size = checkSize(opts.size, 48);
  const dr = new Drawing(prefixFor(opts.idPrefix, 'water-drop'));
  const drop = 'M60 12C76 36 92 54 92 76C92 94.8 77.7 108 60 108C42.3 108 28 94.8 28 76C28 54 44 36 60 12Z';
  const clip = dr.clip(drop);
  dr.add(path(drop, WATER[0]));
  dr.add(`<g clip-path="url(#${clip})">${path(drop, WATER[1], ' transform="translate(-5 -6)"')}${ellipse(46, 66, 9, 20, WATER[2], turned(18, 46, 66))}</g>`);
  dr.add(ellipse(49, 86, 4.4, 5.6, WATER[3], ' opacity="0.9"'));
  return dr.svg(size, opts.title ?? '');
}

/**
 * The watering can: its body, its rim, a handle behind and a spout with a
 * rose to the left, the way it is held to pour. Drawn level; an app tips it.
 */
export function wateringCanSvg(opts: { size?: number; title?: string; idPrefix?: string } = {}): string {
  const size = checkSize(opts.size, 96);
  const dr = new Drawing(prefixFor(opts.idPrefix, 'watering-can'));
  const [deep, shade, body, light] = ['#0f6f86', '#1794ad', '#2fbccd', '#8ee6ee'];
  // the handle, behind the body
  dr.add(path(limb([[84, 56], [106, 54], [110, 74], [90, 90]], [7, 7, 7, 7]), shade));
  // the spout, and the rose at its end
  const spout: Pt[] = [[44, 88], [28, 68], [15, 48]];
  dr.add(path(limb(spout, [13, 10, 8]), shade));
  dr.add(path(limb(moved(spout, [-1.6, -1.4, -1.2], [-1.6, -1.4, -1.2]), [5, 4, 3]), light));
  dr.add(ellipse(12.5, 44, 10.5, 5.4, deep, turned(-34, 12.5, 44)) + ellipse(11.6, 43, 9, 4.2, body, turned(-34, 11.6, 43)));
  for (const [x, y] of [[8.6, 45.6], [12, 42.8], [15.4, 40.4]] as const) dr.add(ellipse(x, y, 1, 1, deep));
  // the body, wider at its foot, lit down its left
  const can = 'M40 50L36 100C36 104.4 41 108 62 108C83 108 88 104.4 88 100L84 50Z';
  const clip = dr.clip(can);
  dr.add(path(can, body));
  dr.add(`<g clip-path="url(#${clip})">${path('M70 44L92 44L94 112L72 112Z', shade)}${path('M42 44L52 44L49 112L38 112Z', light)}${ellipse(62, 106, 30, 6, deep, ' opacity="0.45"')}</g>`);
  // its rim, and the water in it
  dr.add(ellipse(62, 50, 23, 6.4, deep) + ellipse(62, 49.4, 20.4, 4.8, WATER[1]) + ellipse(56, 48.6, 8, 1.8, WATER[2]));
  return dr.svg(size, opts.title ?? '');
}
