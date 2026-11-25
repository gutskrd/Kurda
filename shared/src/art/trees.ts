/**
 * The learner's tree: every kind (`tree.ts`) at each of seven stages from seed to great tree, and as it fares without
 * water. The seed, sprout and swing are traced from the owner's references, and a grown crown is painted as the owner's
 * reference paints foliage: pads of leaves laid one by one. Each stage stands taller and wider than the last
 * (`tree-motion.ts` grows one out of the other) and the great tree stays clear of the picture's edges however it moves.
 * Drawn in layers an app can move apart (ground, plant, crown, swing, front), with variation seeded by the kind.
 */
import type { TreeHealth, TreeSeason, TreeSpecies, TreeStage } from '../tree.js';
import { leaf } from './paint.js';
import { CANVAS, Drawing, checkSize, linearAt, mix, n, prefixFor, pt, radialBox, seeded, tint, type Pt } from './svg.js';

/** The ground line, and the canvas's middle, where a tree stands. */
const GROUND = 100;
const MID = 60;

type Rand = () => number;

/** A crown's colours, far to near: the darkest for what is deepest, the last for the glint on top. */
type Ramp = readonly [string, string, string, string, string, string];
/** Wood: deepest shade, shade, face and light. */
type Wood = readonly [string, string, string, string];

/** How a kind's crown is built. */
type Habit = 'dome' | 'shrub' | 'cloud' | 'weeping' | 'column' | 'tiers';

interface Kind {
  habit: Habit;
  leaves: Ramp;
  wood: Wood;
  /** What it bears once grown. */
  bears: 'acorns' | 'pomegranates' | 'blossom' | 'berries' | 'cones' | 'leaves' | 'ribbons' | 'lights' | 'catkins' | 'none';
  /** The colours of what it bears: body, shade, light. */
  fruit: readonly [string, string, string];
  /** Its seed's shape and colour. */
  seed: 'acorn' | 'drop' | 'almond' | 'round' | 'cone';
  seedColour: string;
  /** The grass round its foot. */
  grass: readonly [string, string];
  /** Green leaves standing out of a crown of another colour (a tree in blossom). */
  sprig?: string;
  /** What its crown turns to as it dries and dies, where that is not a green leaf's yellow and brown. */
  turns?: readonly [string, string];
  /** Its leaves' shape: round and plump, or narrow and pointed. */
  edge: 'round' | 'point';
  /** Its build relative to others of its habit: crown spread, crown height, and trunk girth. */
  build?: { spread?: number; lift?: number; girth?: number };
  /** Other colours some of its masses come in, so the crown is not one flat colour. */
  hues?: readonly Ramp[];
  /**
   * Set when the tree is drawn in a season (`seasonal`): it stands on its scene's floor on a flat round of grass with a
   * long shadow and two pale stones, as in the owner's reference.
   */
  studio?: { litter: readonly string[]; flowers: boolean; snow: boolean };
}

const KINDS: Record<TreeSpecies, Kind> = {
  // The Zagros oak: a broad dome on a thick trunk.
  beru: {
    edge: 'round',
    build: { girth: 1.16 },
    hues: [['#26492a', '#365f31', '#4e7a3c', '#6f954a', '#9cb66a', '#cddb9e']],
    habit: 'dome',
    leaves: ['#1b4232', '#28583c', '#3a7246', '#568d52', '#86ae6c', '#c0d8a2'],
    wood: ['#4a2618', '#6f3a22', '#96532c', '#c47a3d'],
    bears: 'acorns',
    fruit: ['#b9803a', '#7c4f22', '#e6b563'],
    seed: 'acorn',
    seedColour: '#b9803a',
    grass: ['#4f9258', '#93c47a'],
  },
  // The pomegranate: a round bush of a tree, hung with red fruit.
  hinar: {
    edge: 'point',
    habit: 'shrub',
    leaves: ['#163d2c', '#215436', '#326d40', '#4d894c', '#7aaa62', '#b8d496'],
    wood: ['#4b2a20', '#74432d', '#9c6038', '#c98a4c'],
    bears: 'pomegranates',
    fruit: ['#e23a36', '#a81f2c', '#ff8a6b'],
    seed: 'drop',
    seedColour: '#d6303a',
    grass: ['#4e955a', '#99c97e'],
  },
  // The almond: a cloud of blossom before its leaves.
  behiv: {
    edge: 'round',
    hues: [['#c06e90', '#d98aa7', '#eaa7bd', '#f5c4d3', '#fbdde6', '#fff6f8'], ['#a8577a', '#c46e91', '#dc8ba9', '#eda9c0', '#f8c9d7', '#fde8ee']],
    habit: 'cloud',
    leaves: ['#b4607f', '#ce7c99', '#e29ab2', '#efb9ca', '#f8d6e0', '#fdf0f3'],
    wood: ['#3a2428', '#573238', '#77454a', '#a26764'],
    bears: 'blossom',
    fruit: ['#fff4f7', '#f6a9c2', '#ffd76a'],
    seed: 'almond',
    seedColour: '#c79a63',
    grass: ['#5a9d66', '#a3cf8a'],
    sprig: '#6cc24c',
    turns: ['#d8c2b4', '#a58a72'],
  },
  // The weeping willow: long sprays arching out of the crown and hanging nearly to the ground.
  bi: {
    edge: 'point',
    habit: 'weeping',
    leaves: ['#304e2a', '#436a33', '#5c873f', '#7ca24e', '#a8c272', '#d8e4a6'],
    wood: ['#3a2d22', '#57432f', '#77603f', '#a48958'],
    bears: 'catkins',
    fruit: ['#e9f7b0', '#b7d877', '#ffffff'],
    seed: 'round',
    seedColour: '#b9a36a',
    grass: ['#4a9168', '#93c78c'],
  },
  // The mulberry: wide and low, with dark, red and white berries.
  tu: {
    edge: 'point',
    build: { spread: 0.95, lift: 0.9 },
    habit: 'dome',
    leaves: ['#1f4a2b', '#2d6434', '#447f3f', '#649b4d', '#93bb68', '#c9dd9c'],
    wood: ['#3d2a1c', '#5f4229', '#856037', '#b3874d'],
    bears: 'berries',
    fruit: ['#5a2470', '#33123f', '#c84b6e'],
    seed: 'round',
    seedColour: '#7a4a86',
    grass: ['#4f9254', '#97c679'],
  },
  // The valley poplar: tall and narrow.
  spindar: {
    edge: 'point',
    habit: 'column',
    leaves: ['#2b5238', '#3c6b44', '#56874f', '#7aa45e', '#a9c47e', '#dae6b6'],
    wood: ['#6f6a5e', '#928c7c', '#b9b39f', '#dedac8'],
    bears: 'none',
    fruit: ['#ffffff', '#dddddd', '#ffffff'],
    seed: 'round',
    seedColour: '#c9bf9d',
    grass: ['#4f9259', '#98c67d'],
  },
  // The mountain pine: tiers of dark needles.
  kaj: {
    edge: 'point',
    habit: 'tiers',
    leaves: ['#173f3d', '#20554f', '#2c6b60', '#3f8574', '#6aa792', '#a9cfb7'],
    wood: ['#42261a', '#653a24', '#8a5330', '#b47841'],
    bears: 'cones',
    fruit: ['#9a6238', '#6b3f22', '#c88f55'],
    seed: 'cone',
    seedColour: '#8a5330',
    grass: ['#468a63', '#8cc49a'],
  },
  // A tree in autumn: gold, amber and red.
  payiz: {
    edge: 'point',
    build: { spread: 0.96, lift: 1 },
    hues: [['#8f2418', '#b53a1c', '#d9541d', '#f07a26', '#ffa63a', '#ffd27a'], ['#b5651a', '#d98a1c', '#f2ad22', '#ffcb3a', '#ffe169', '#fff3a8']],
    habit: 'dome',
    leaves: ['#a5341f', '#cb4f1e', '#ea7a1c', '#f9a424', '#ffc93f', '#ffe98a'],
    wood: ['#3c2219', '#5c3524', '#804c2f', '#ab6f40'],
    bears: 'leaves',
    fruit: ['#f9a424', '#cb4f1e', '#ffe98a'],
    seed: 'round',
    seedColour: '#b56a2c',
    grass: ['#8f9a4a', '#c2c26a'],
    turns: ['#c39a55', '#8f6a42'],
  },
  // The wish tree: an old tree tied with ribbons, a wish to each.
  miraz: {
    edge: 'round',
    build: { spread: 1.04, lift: 0.94, girth: 1.3 },
    habit: 'dome',
    leaves: ['#284f44', '#386853', '#518467', '#73a283', '#a2c4a4', '#d3e5cd'],
    wood: ['#4a3a30', '#6c5645', '#917560', '#bd9d83'],
    bears: 'ribbons',
    fruit: ['#e8443a', '#f7c531', '#3aa3e8'],
    seed: 'round',
    seedColour: '#a8876a',
    grass: ['#58976a', '#a0cc8e'],
  },
  // The night tree: dark as the sky, hung with small lights.
  sev: {
    edge: 'round',
    hues: [['#2a1650', '#41237a', '#5c3aa6', '#7d5cd0', '#a58bee', '#d9c9ff']],
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

/** What a crown turns to as it dries: a fading leaf's yellow, then brown. */
const DRY = '#d9ab2e';
const DEAD = '#96683c';
/** Per state: how far it has turned, how much crown it keeps, and how far it hangs. */
const STATE: Record<TreeHealth, { dry: number; dead: number; full: number; droop: number; fallen: number }> = {
  fresh: { dry: 0, dead: 0, full: 1, droop: 0, fallen: 0 },
  thirsty: { dry: 0.3, dead: 0, full: 0.96, droop: 1.6, fallen: 2 },
  wilting: { dry: 0.72, dead: 0.12, full: 0.82, droop: 3.4, fallen: 6 },
  withered: { dry: 0.4, dead: 0.85, full: 0.4, droop: 4.5, fallen: 10 },
};

/** A crown's colours in a state: toward yellow as it dries and brown as it dies, or toward the kind's own faded colours. */
function fared(ramp: Ramp, health: TreeHealth, turns: readonly [string, string] = [DRY, DEAD]): Ramp {
  const s = STATE[health];
  return ramp.map((c) => mix(mix(c, turns[0], s.dry), turns[1], s.dead)) as unknown as Ramp;
}

// ──────────────────────────────────────────────────────────────── seasons

/** The seasons' crowns, deep to light: spring blossom, autumn leaves and winter snow. */
const SPRING: Ramp = ['#b4507a', '#cc6a92', '#e088ab', '#eea6c2', '#f7c6d8', '#fde6ef'];
const AUTUMN: Ramp = ['#a3401a', '#cc5a1e', '#e8742a', '#f39239', '#f8b155', '#fcd78f'];
const SNOW: Ramp = ['#a9bdd4', '#c3d2e3', '#dbe5f0', '#ecf2f8', '#f7fafd', '#ffffff'];

const toward = (ramp: Ramp, to: Ramp, t: number): Ramp => ramp.map((c, i) => mix(c, to[i] as string, t)) as unknown as Ramp;

/**
 * A kind in a season. Deciduous trees blossom pink in spring, keep their green in summer, turn orange in autumn and
 * are white with snow in winter; evergreens and the night tree keep their colours and are frosted in winter. Each keeps
 * a little of its own colour under the season's, so an oak in autumn is still not a willow. What it bears and the grass
 * at its foot change with the season too.
 */
function seasonal(kind: Kind, species: TreeSpecies, season: TreeSeason): Kind {
  const evergreen = kind.habit === 'tiers' || kind.habit === 'column' || species === 'sev';
  const keeps = (bears: Kind['bears']): boolean => bears === 'lights' || bears === 'ribbons';
  const studio = { litter: [] as readonly string[], flowers: true, snow: false };
  if (season === 'summer') return { ...kind, studio };
  if (season === 'spring') {
    if (evergreen) return { ...kind, grass: [mix(kind.grass[0], '#6cbf72', 0.3), mix(kind.grass[1], '#a8dc95', 0.3)], studio };
    const t = kind.bears === 'blossom' ? 0.5 : 0.88;
    return {
      ...kind,
      leaves: toward(kind.leaves, SPRING, t),
      ...(kind.hues ? { hues: kind.hues.map((h) => toward(h, SPRING, t)) } : {}),
      bears: kind.bears === 'blossom' || keeps(kind.bears) ? kind.bears : 'none',
      grass: [mix(kind.grass[0], '#6cbf72', 0.3), mix(kind.grass[1], '#a8dc95', 0.3)],
      studio: { ...studio, litter: [SPRING[3], SPRING[4], SPRING[5]] },
    };
  }
  if (season === 'autumn') {
    const litter = [AUTUMN[1], AUTUMN[2], AUTUMN[3], AUTUMN[4]];
    if (evergreen) return { ...kind, grass: [mix(kind.grass[0], '#c9822f', 0.35), mix(kind.grass[1], '#e8a64a', 0.35)], studio: { ...studio, litter: litter.slice(0, 2) } };
    const t = species === 'payiz' ? 0.35 : 0.92;
    return {
      ...kind,
      sprig: undefined,
      leaves: toward(kind.leaves, AUTUMN, t),
      ...(kind.hues ? { hues: kind.hues.map((h) => toward(h, AUTUMN, t)) } : {}),
      bears: kind.bears === 'blossom' || kind.bears === 'catkins' ? 'none' : kind.bears,
      grass: ['#c9873e', '#e8b061'],
      studio: { ...studio, litter, flowers: false },
    };
  }
  // Winter.
  const t = evergreen ? 0.42 : 0.88;
  return {
    ...kind,
    sprig: undefined,
    leaves: toward(kind.leaves, SNOW, t),
    ...(kind.hues ? { hues: kind.hues.map((h) => toward(h, SNOW, t)) } : {}),
    bears: keeps(kind.bears) ? kind.bears : 'none',
    grass: ['#dbe6f1', '#ffffff'],
    studio: { litter: [], flowers: false, snow: true },
  };
}

// ───────────────────────────────────────────────────────────────── shapes

/**
 * A leafy mass: a round shape whose edge is a ring of soft, slightly uneven bumps, like a distant bush. `depth` is how
 * far each bump stands out (1 is half a circle).
 */
function puffPath(cx: number, cy: number, rx: number, ry: number, rand: Rand, bumps: number, depth: number, point = 0): string {
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
    if (point > 0) {
      // A leaf point between the two: out from the mass's middle, hanging a little.
      const [mx, my] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const far = Math.hypot(mx - cx, my - cy) || 1;
      const [ox, oy] = [(mx - cx) / far, (my - cy) / far];
      const h = chord * point;
      const sag = chord * 0.16;
      const [ex, ey] = [(b[0] - a[0]) * 0.12, (b[1] - a[1]) * 0.12];
      d += `Q${n(a[0] + ox * h * 0.8 + ex)} ${n(a[1] + oy * h * 0.8 + ey + sag * 0.5)} ${n(mx + ox * h)} ${n(my + oy * h + sag)}Q${n(b[0] + ox * h * 0.8 - ex)} ${n(b[1] + oy * h * 0.8 - ey + sag * 0.5)} ${pt(b)}`;
    } else {
      const r = chord * (0.5 + (1 - depth) * 0.6);
      d += `A${n(r)} ${n(r)} 0 0 1 ${pt(b)}`;
    }
  }
  return `${d}Z`;
}

/** A unit vector at `deg`, 0 pointing right and 90 down. */
const dir = (deg: number): Pt => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];

/** A leaf from `at`, pointing along `deg`. */
const leafAt = (at: Pt, deg: number, len: number, w: number): string => leaf(at, dir(deg), len, w);

/** An open Catmull-Rom curve through `points` as cubic Béziers, from the first, which is already reached. */
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
 * A limb: a tapered piece of wood along `line`, `widths` thick at each point, with a round end. Every limb is wound the
 * same way, so several written as one path form one piece of wood.
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

/** A limb's line shifted sideways by `by` (to its left when positive), for the light and shade along it. */
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

/** One pad of a crown: position, size, and depth (0 far, 1 middle, 2 near). */
interface Puff {
  x: number;
  y: number;
  r: number;
  near: 0 | 1 | 2;
  /** Flatter or taller than round. */
  squash?: number;
}

/** The marks a kind's leaves leave on its crown. */
type Mark = 'leaf' | 'petal' | 'needle';

/** How a kind's crown is drawn: the marks its leaves make, green standing out of a blossom, and the flowers of a tree in blossom. */
interface Foliage {
  mark: Mark;
  /** Green leaves standing out of a crown of another colour. */
  sprig?: string;
  /** A flower's throat and heart, for a tree whose crown is its blossom. */
  flower?: readonly [throat: string, heart: string];
}

/** A blossom's five round petals as path data; a crown of flowers is many of them in one path. */
function petalsAt(x: number, y: number, r: number, turn: number): string {
  const pr = r * 0.46;
  let d = '';
  for (let k = 0; k < 5; k++) {
    const [ux, uy] = dir(k * 72 + turn);
    d += `M${n(x + ux * r * 0.56 - pr)} ${n(y + uy * r * 0.56)}a${n(pr)} ${n(pr)} 0 1 0 ${n(pr * 2)} 0a${n(pr)} ${n(pr)} 0 1 0 ${n(-pr * 2)} 0Z`;
  }
  return d;
}

/**
 * One painted leaf: a short almond centred on `at` along `deg`, fuller toward its stalk, its two sides a little unequal
 * (`lean`) as a brush leaves them. Written compactly, since a crown is hundreds of them.
 */
function dab(at: Pt, deg: number, len: number, plump: number, lean: number): string {
  const [ux, uy] = dir(deg);
  const [vx, vy] = [-uy, ux];
  const h = len / 2;
  const k = len * plump;
  const b: Pt = [at[0] - ux * h, at[1] - uy * h];
  const [mx, my] = [at[0] - ux * len * 0.1, at[1] - uy * len * 0.1];
  return `M${pt(b)}Q${pt([mx + vx * k * (1 + lean), my + vy * k * (1 + lean)])} ${pt([at[0] + ux * h, at[1] + uy * h])}Q${pt([mx - vx * k * (1 - lean), my - vy * k * (1 - lean)])} ${pt(b)}Z`;
}

/** A painted leaf measured from its stalk at `base`, about `w` to either side of its middle. */
function dabFrom(base: Pt, deg: number, len: number, w: number): string {
  const [ux, uy] = dir(deg);
  return dab([base[0] + (ux * len) / 2, base[1] + (uy * len) / 2], deg, len, (1.5 * w) / len, 0);
}

/** `deg` turned toward hanging straight down by `share` of the way, the shorter way round. */
function hung(deg: number, share: number): number {
  const off = ((((90 - deg) % 360) + 540) % 360) - 180;
  return deg + off * share;
}

/** How a crown's pads are painted: its leaves' length and plumpness, which way they lie, and how the tree is faring. */
interface Brush {
  len: number;
  plump: number;
  /** Fanning out from the pad's foot, lying level like a pine's, or reaching up like a poplar's. */
  lie: 'fan' | 'level' | 'rise';
  /** The share of its leaves a pad keeps, and how far they hang, 0 to 1. */
  keep: number;
  droop: number;
  /** A dry tree's leaves have lost their light. */
  dull: boolean;
  snow: boolean;
}

/** The tones of a pad's leaves, deep to pale: shade, face, light and the tips the light catches. */
type Tone = 0 | 1 | 2 | 3;

/**
 * One pad of a crown, painted as the owner's reference paints foliage: a dark body, then leaves laid over it one by one,
 * each at its own angle and size and seeded with the pad, so the tree is the same each time it is drawn. Leaves to the
 * lower right are in shade, those in the middle are its face and those to the upper left are lit, with a few pale tips
 * along its top; its rim is all leaves, some standing out. Without water the leaves hang and fewer are left; in winter
 * snow lies along its top.
 */
function drawPad(pad: Puff, ramp: Ramp, rand: Rand, fol: Foliage, brush: Brush): string {
  const near = pad.near;
  const colours = [ramp[near], ramp[near + 1], ramp[near + 2], ramp[near + 3]] as [string, string, string, string];
  const rx = pad.r;
  // Pads that fan out lie flatter than round, in layers as the reference's do, their tops where a round one's would be.
  const round = pad.r * (pad.squash ?? 0.9);
  const ry = round * (brush.lie === 'fan' ? 0.86 : 1);
  const p = { ...pad, y: pad.y - round + ry };
  const len = brush.len * (near === 0 ? 1.1 : 1);
  // A leaf covers about this much of the pad.
  const leaf = 0.67 * len * len * brush.plump;
  const tones: [string, string, string, string] = ['', '', '', ''];
  // Where its leaves fan out from: low in the pad, where its twig comes in.
  const [ox, oy] = [p.x, p.y + ry * 0.9];
  const lie = (x: number, y: number, out: number): number => {
    if (brush.lie === 'level') return (x < p.x ? 180 : 0) + (x < p.x ? -1 : 1) * (12 + (y - p.y) * 0.8) + out * 0.3;
    if (brush.lie === 'rise') return -90 + (x - p.x) * 3.2 + out * 0.4;
    return (Math.atan2(y - oy, x - ox) * 180) / Math.PI;
  };
  // Lit from the upper left; `noise` keeps the light from falling in bands.
  const toneAt = (ux: number, uy: number, noise: number): Tone => {
    const lit = -(0.6 * ux + 0.8 * uy) + noise;
    if (lit > (near === 0 ? 0.4 : 0.2)) return brush.dull ? 1 : 2;
    if (lit > -0.34) return 1;
    return 0;
  };
  const lay = (x: number, y: number, deg: number, size: number, lean: number, tone: Tone, keep: number): void => {
    if (keep > brush.keep) return;
    tones[tone] += dab([x, y], hung(deg, brush.droop), size, brush.plump, lean);
  };
  // The body the leaves lie on, a step deeper than the deepest of them, inside the rim so the rim is all leaves.
  const body = path(puffPath(p.x, p.y + ry * 0.08, rx * 0.78, ry * 0.74, rand, 9, 0.8), tint(colours[0], near === 0 ? -0.06 : -0.14));
  // The rim: leaves round the edge pointing outward, a few standing out past it.
  const rim = Math.max(8, Math.round((Math.PI * (rx + ry)) / (len * (near === 0 ? 1.15 : 0.85))));
  for (let i = 0; i < rim; i++) {
    const a = ((i + rand() * 0.7) / rim) * Math.PI * 2;
    const [ux, uy] = [Math.cos(a), Math.sin(a)];
    const reach = 0.8 + rand() * 0.24;
    const [x, y] = [p.x + ux * rx * reach, p.y + uy * ry * reach];
    const out = (Math.atan2(uy * rx, ux * ry) * 180) / Math.PI;
    const turn = (rand() - 0.5) * 56;
    const size = len * (0.8 + rand() * 0.45);
    const lean = (rand() - 0.5) * 0.6;
    const tone = toneAt(ux, uy, (rand() - 0.5) * 0.5);
    lay(x, y, brush.lie === 'fan' ? out + turn : lie(x, y, out) + turn * 0.6, size, lean, tone, rand());
  }
  // The face: leaves scattered over it by the golden angle, so they cover it evenly without lying in rows.
  // In its shade only some, so the body shows between them as the dark inside of the pad.
  const face = Math.round((Math.PI * rx * ry * 0.64 * (near === 0 ? 0.36 : 0.74)) / leaf);
  for (let i = 0; i < face; i++) {
    const t = Math.sqrt((i + 0.5) / face) * 0.8;
    const a = i * 2.39996 + (rand() - 0.5) * 0.6;
    const [ux, uy] = [Math.cos(a) * t, Math.sin(a) * t];
    const [x, y] = [p.x + ux * rx + (rand() - 0.5) * len * 0.5, p.y + uy * ry + (rand() - 0.5) * len * 0.5];
    const turn = (rand() - 0.5) * 70;
    const size = len * (0.75 + rand() * 0.45);
    const lean = (rand() - 0.5) * 0.6;
    const tone = toneAt(ux, uy, (rand() - 0.5) * 0.6);
    const sparse = rand();
    if (tone === 0 && sparse < 0.45) continue;
    lay(x, y, lie(x, y, 0) + turn, size, lean, tone, rand());
  }
  // The pale tips the light catches along its top.
  if (near !== 0 && !brush.dull) {
    const tips = Math.max(2, Math.round(rx / 4));
    for (let i = 0; i < tips; i++) {
      const a = Math.PI * (1.08 + (i / tips) * 0.62 + rand() * 0.1);
      const [ux, uy] = [Math.cos(a), Math.sin(a)];
      const [x, y] = [p.x + ux * rx * (0.66 + rand() * 0.2), p.y + uy * ry * (0.66 + rand() * 0.2)];
      lay(x, y, lie(x, y, (Math.atan2(uy, ux) * 180) / Math.PI) + (rand() - 0.5) * 40, len * (0.7 + rand() * 0.3), (rand() - 0.5) * 0.5, 3, rand());
    }
  }
  let out = body + tones.map((d, i) => (d ? path(d, colours[i] as string) : '')).join('');
  if (fol.sprig && near !== 0) {
    // Green leaves standing out of a crown of blossom, at its rim.
    let green = '';
    for (let i = 0; i < 3; i++) {
      const a = Math.PI * (0.1 + i * 0.62 + rand() * 0.2);
      green += dab([p.x + Math.cos(a) * rx * 0.96, p.y + Math.sin(a) * ry * 0.96], hung((a * 180) / Math.PI, brush.droop), len * 1.1, 0.5, 0.2);
    }
    out += path(green, fol.sprig);
  }
  if (fol.flower && near !== 0 && brush.keep > 0.8) {
    // A tree in blossom: a few open flowers over its petals, pale in the light, each with its throat and heart.
    const count = Math.max(1, Math.round(rx / 5.5));
    let pale = '';
    let hearts = '';
    for (let i = 0; i < count; i++) {
      const a = i * 2.39996 + rand();
      const k = 0.2 + rand() * 0.5;
      const [fx, fy] = [p.x + Math.cos(a) * rx * k, p.y + Math.sin(a) * ry * k - ry * 0.12];
      const fr = Math.max(2, Math.min(3.6, rx * 0.2)) * (0.85 + rand() * 0.3);
      pale += petalsAt(fx, fy, fr, rand() * 72);
      hearts += ellipse(fx, fy, fr * 0.3, fr * 0.3, fol.flower[0]) + ellipse(fx, fy, fr * 0.15, fr * 0.15, fol.flower[1]);
    }
    out += path(pale, colours[3]) + hearts;
  }
  if (brush.snow) {
    // Snow along its top: soft clumps lying level, as it settles on a branch of leaves.
    const clumps = Math.max(3, Math.round(rx / 2.6));
    let snow = '';
    for (let i = 0; i < clumps; i++) {
      const u = (i + 0.5) / clumps;
      const a = Math.PI * (1.12 + u * 0.76);
      const [x, y] = [p.x + Math.cos(a) * rx * 0.86, p.y + Math.sin(a) * ry * 0.82 + ry * 0.08];
      snow += dab([x, y], (rand() - 0.5) * 16, len * (1.3 + rand() * 0.5) * (1 - Math.abs(u - 0.5) * 0.6), 0.5, (rand() - 0.5) * 0.4);
    }
    out += path(snow, '#ffffff');
  }
  return out;
}

// ────────────────────────────────────────────────────────────────── wood

/**
 * A tree's wood: its limbs, each with its line and role (trunk, bough, twig ending in the air, or the arm a swing hangs
 * from); its roots, which lie on the ground and do not sway; and, on a tree with a swing, where the ropes are tied.
 */
interface Timber {
  limbs: { line: Pt[]; widths: number[]; part: 'trunk' | 'bough' | 'twig' | 'arm' }[];
  roots: { line: Pt[]; widths: number[] }[];
  /** Where the crown's shade falls across the wood: its middle and reach. */
  under: { y: number; reach: number };
  /** The swing's ropes: where each is tied on the arm, and how low the seat hangs. */
  swing?: { ties: readonly [Pt, Pt]; seat: number };
}

/** A limb's line shifted bodily, for the light and shade along it. */
const moved = (line: readonly Pt[], dx: readonly number[], dy: readonly number[]): Pt[] => line.map(([x, y], i) => [x + (dx[i] ?? 0), y + (dy[i] ?? 0)]);

/**
 * The wood as one piece lit from the upper left: a warm light down the trunk's left and broad shade down its right,
 * short bark strokes up it, a knot on an old trunk (the carved swirl from the owner's reference on a great tree), boughs
 * shaded below and lit above, and the crown's shade over the top.
 */
function drawWood(dr: Drawing, timber: Timber, wood: Wood, rand: Rand, stage: Grown): string {
  const knots = stage >= 4;
  const [deep, shade, base, light] = wood;
  const whole = timber.limbs.map((l) => limb(l.line, l.widths)).join('');
  const clip = dr.clip(whole);
  const face = mix(base, light, 0.55);
  let inside = '';
  for (const l of timber.limbs) {
    if (l.part === 'trunk') {
      inside += path(limb(moved(l.line, l.widths.map((w) => w * 0.32), []), l.widths.map((w) => w * 0.42)), shade);
      inside += path(limb(moved(l.line, l.widths.map((w) => -w * 0.22), []), l.widths.map((w, i) => w * (i === l.widths.length - 1 ? 0.14 : 0.28))), face);
    } else {
      inside += path(limb(moved(l.line, l.widths.map((w) => w * 0.2), l.widths.map((w) => w * 0.28)), l.widths.map((w) => w * 0.4)), shade);
      inside += path(limb(moved(l.line, l.widths.map((w) => -w * 0.18), l.widths.map((w) => -w * 0.2)), l.widths.map((w) => w * 0.26)), face);
    }
  }
  const trunk = timber.limbs[0];
  if (trunk && stage >= 3) {
    const at = (u: number): Pt => {
      const t = Math.max(0, Math.min(0.999, u)) * (trunk.line.length - 1);
      const i = Math.min(trunk.line.length - 2, Math.floor(t));
      const [a, b] = [trunk.line[i] as Pt, trunk.line[i + 1] as Pt];
      return [a[0] + (b[0] - a[0]) * (t - i), a[1] + (b[1] - a[1]) * (t - i)];
    };
    const w = trunk.widths[trunk.widths.length - 2] ?? 6;
    // Bark: short strokes up the trunk, dark down its shaded side and pale on its lit one, as a brush leaves them.
    let dark = '';
    let pale = '';
    for (let i = 0; i < stage + 3; i++) {
      const u = 0.2 + (i / (stage + 3)) * 0.5 + rand() * 0.06;
      const [x, y] = at(u);
      const [x2, y2] = at(u + 0.04);
      const up = (Math.atan2(y2 - y, x2 - x) * 180) / Math.PI + (rand() - 0.5) * 14;
      const lit = i % 3 === 1;
      const side = lit ? -0.26 - rand() * 0.1 : 0.12 + rand() * 0.24;
      const stroke = dab([x + side * w * 1.4, y], up, w * (0.4 + rand() * 0.3), 0.16, (rand() - 0.5) * 0.4);
      if (lit) pale += stroke;
      else dark += stroke;
    }
    inside += path(dark, deep, ' opacity="0.55"') + path(pale, light, ' opacity="0.6"');
  }
  if (trunk && knots) {
    const at = (u: number): Pt => {
      const t = u * (trunk.line.length - 1);
      const i = Math.min(trunk.line.length - 2, Math.floor(t));
      const [a, b] = [trunk.line[i] as Pt, trunk.line[i + 1] as Pt];
      return [a[0] + (b[0] - a[0]) * (t - i), a[1] + (b[1] - a[1]) * (t - i)];
    };
    const w = trunk.widths[trunk.widths.length - 2] ?? 6;
    const [kx, ky] = at(0.46);
    if (stage === 6) {
      // The carved swirl: a curl winding in from the trunk's lit side, cut dark, its outer lip catching the light.
      const r = w * 0.26;
      const curl: Pt[] = Array.from({ length: 15 }, (_, i) => {
        const t = i / 14;
        const a = ((-210 + t * 600) * Math.PI) / 180;
        return [kx - w * 0.06 + Math.cos(a) * r * (1 - t * 0.8) * 0.84, ky + Math.sin(a) * r * (1 - t * 0.8)] as Pt;
      });
      const taper = curl.map((_, i) => r * (0.3 - (i / 14) * 0.2));
      inside += path(limb(curl, taper), deep, ' opacity="0.6"') + path(limb(beside(curl, taper.map((t) => t * 0.6)), taper.map((t) => t * 0.32)), light, ' opacity="0.4"');
    } else {
      inside += ellipse(kx + w * 0.12, ky, w * 0.15, w * 0.2, deep, ' opacity="0.75"') + ellipse(kx + w * 0.09, ky - w * 0.03, w * 0.07, w * 0.1, shade);
    }
  }
  // The crown's shade over the top of the wood, fading down it.
  const under = dr.id('u');
  dr.def(linearAt(under, [[0, deep, 0.62], [1, deep, 0]], 0, timber.under.y - timber.under.reach * 0.2, 0, timber.under.y + timber.under.reach * 0.34));
  inside += `<rect x="0" y="${n(timber.under.y - timber.under.reach)}" width="120" height="${n(timber.under.reach * 1.4)}" fill="url(#${under})"/>`;
  return `${path(whole, base)}<g clip-path="url(#${clip})">${inside}</g>`;
}

// ───────────────────────────────────────────────────────────────── ground

/** A tuft of grass: three blades from one foot. */
function tuft(x: number, y: number, h: number, lean: number, g0: string, g1: string): string {
  return path(dabFrom([x, y], -122 + lean, h * 0.76, h * 0.28), g0) + path(dabFrom([x, y], -90 + lean, h, h * 0.3) + dabFrom([x, y], -58 + lean, h * 0.8, h * 0.28), g1);
}

/** Earth in a state: dark and moist while watered, paler as it dries. */
function soilOf(health: TreeHealth): readonly [string, string, string] {
  const dry = Math.min(1, STATE[health].dry + STATE[health].dead);
  return [mix('#4f2c1f', '#8f6a4b', dry * 0.7), mix('#74452e', '#b0875f', dry * 0.7), mix('#9a6240', '#cfa77c', dry * 0.7)];
}

/** Grass in a state: green while watered, straw as it dries. */
function grassOf(kind: Kind, health: TreeHealth): [string, string] {
  const s = STATE[health];
  return kind.grass.map((c) => mix(mix(c, '#c7b452', s.dry * 0.8), '#b89a5a', s.dead * 0.7)) as [string, string];
}

/**
 * The tree's own island of ground: grass on top hanging over the edge, earth below with a stone or two. `half` is half
 * its width, `depth` how far the earth goes down, and `tall` the plant's height, which sets its shadow's length in a
 * season's scene. Unwatered, the grass turns to straw, the earth pales and the flowers go.
 */
function drawIsland(dr: Drawing, kind: Kind, health: TreeHealth, half: number, depth: number, rand: Rand, tufts: number, flowers: number, tall: number): string {
  const top = GROUND;
  if (kind.studio) return drawRound(dr, kind, health, half, tufts, flowers, tall);
  const s = STATE[health];
  const [g0, g1] = grassOf(kind, health);
  const soil = soilOf(health);
  let out = ellipse(MID + 1, top + depth + 2.6, half * 0.7, 2.2 + half * 0.03, '#000000', ' opacity="0.1"');
  // The earth below, rounded like a clod.
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
  // The grass over it: its rim hanging over the earth in soft drips, and the lighter top.
  const ry = half * 0.15;
  out += path(puffPath(MID, top + ry * 0.34, half, ry * 1.12, rand, Math.round(half * 0.36) + 7, 0.62), g0);
  out += ellipse(MID, top - ry * 0.06, half * 0.95, ry * 0.84, g0);
  out += path(puffPath(MID - half * 0.04, top - ry * 0.16, half * 0.82, ry * 0.6, rand, Math.round(half * 0.3) + 5, 0.5), g1, ' opacity="0.62"');
  // The tree's own shade on the grass at its foot.
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

/** A matte pale stone on a scene's floor, as in the reference: its body, the light on top, and the shade under it. */
function paleStone(x: number, y: number, r: number): string {
  return (
    ellipse(x + r * 0.3, y + r * 0.42, r * 1.3, r * 0.34, '#1e2a4a', ' opacity="0.12"') +
    path(`M${n(x - r * 1.2)} ${n(y + r * 0.3)}C${n(x - r * 1.24)} ${n(y - r * 0.5)} ${n(x - r * 0.5)} ${n(y - r * 0.92)} ${n(x + r * 0.2)} ${n(y - r * 0.86)}C${n(x + r * 0.9)} ${n(y - r * 0.8)} ${n(x + r * 1.26)} ${n(y - r * 0.2)} ${n(x + r * 1.2)} ${n(y + r * 0.3)}Z`, '#cdc9d2') +
    path(`M${n(x - r * 1.06)} ${n(y + r * 0.06)}C${n(x - r * 1.04)} ${n(y - r * 0.5)} ${n(x - r * 0.44)} ${n(y - r * 0.82)} ${n(x + r * 0.16)} ${n(y - r * 0.78)}C${n(x + r * 0.7)} ${n(y - r * 0.72)} ${n(x + r * 0.96)} ${n(y - r * 0.3)} ${n(x + r * 0.9)} ${n(y + r * 0.02)}Z`, '#e8e5ec')
  );
}

/**
 * The tree's ground in a season (`seasonal`), traced from the owner's reference: a flat round of grass on the scene's
 * floor, its rim a shade darker, a long shadow fading away to the left, and two pale stones. The shadow is as long as
 * the plant is tall. Autumn strews it with fallen leaves, winter covers it with snow, and spring and summer have flowers.
 */
function drawRound(dr: Drawing, kind: Kind, health: TreeHealth, half: number, tufts: number, flowers: number, tall: number): string {
  const top = GROUND;
  const studio = kind.studio!;
  // Its own random stream, so a season's litter or snow never moves a leaf of the tree above.
  const rand = seeded(`round:${n(half)}:${tufts}:${flowers}`);
  const s = STATE[health];
  const [g0, g1] = grassOf(kind, health);
  const ry = half * 0.2;
  // The long shadow, darkest at the tree and gone before the picture's edge, as long as the plant is tall.
  const far = Math.max(3, MID - half * 0.9 - tall * 0.42);
  const fade = dr.id('sh');
  dr.def(linearAt(fade, [[0, '#1e2a4a', 0], [0.45, '#1e2a4a', 0.16], [1, '#1e2a4a', 0.34]], far, 0, MID, 0));
  const reach = MID - far;
  let out = `<path d="M${n(MID + half * 0.3)} ${n(top + ry * 0.7)}C${n(MID - reach * 0.3)} ${n(top + ry * 1.5)} ${n(MID - reach * 0.76)} ${n(top + ry * 1.2)} ${n(far)} ${n(top + ry * 0.3)}C${n(MID - reach * 0.76)} ${n(top - ry * 1.6)} ${n(MID - reach * 0.3)} ${n(top - ry * 2.2)} ${n(MID)} ${n(top - ry * 1.4)}Z" fill="url(#${fade})"/>`;
  out += ellipse(MID + 1, top + ry * 0.9, half * 1.02, ry * 0.6, '#1e2a4a', ' opacity="0.12"');
  // The round: its rim, its top, then the lighter grass on it.
  out += ellipse(MID, top + ry * 0.32, half, ry, tint(g0, -0.18));
  out += ellipse(MID, top, half, ry, g0);
  out += path(puffPath(MID - half * 0.06, top - ry * 0.12, half * 0.84, ry * 0.66, rand, Math.round(half * 0.3) + 5, 0.4), g1, ' opacity="0.7"');
  // The dappled shade of a crown above, laid by hand in a few soft patches toward the back of the round.
  if (tall > 40 && !studio.snow) {
    let dapple = '';
    for (let i = 0; i < 4; i++) {
      const [dx, dy, k] = [MID + half * (-0.5 + i * 0.3 + (rand() - 0.5) * 0.14), top - ry * (0.2 + rand() * 0.4), half * (0.12 + rand() * 0.08)];
      dapple += closed(Array.from({ length: 7 }, (_, j) => {
        const a = (j / 7) * Math.PI * 2;
        const r = k * (0.7 + rand() * 0.5);
        return [dx + Math.cos(a) * r * 1.6, dy + Math.sin(a) * r * 0.5] as Pt;
      }));
    }
    out += path(dapple, tint(g0, -0.3), ' opacity="0.32"');
  }
  // The grass of it, as the reference's round is made: many small blades seen from above, deep, mid and pale, laid by hand.
  const blades = ['', '', ''];
  for (let i = 0; i < Math.round(half * 1.7); i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * 0.94;
    const [bx, by] = [MID + Math.cos(a) * half * d, top + Math.sin(a) * ry * d];
    const lit = -(Math.cos(a) * 0.6 + Math.sin(a) * 0.8) * d + (rand() - 0.5) * 0.8;
    blades[lit > 0.3 ? 2 : lit > -0.35 ? 1 : 0] += dab([bx, by], -90 + (rand() - 0.5) * 120, 1.6 + rand() * 1.2, 0.5, (rand() - 0.5) * 0.5);
  }
  out += path(blades[0]!, tint(g0, -0.14)) + path(blades[1]!, mix(g0, g1, 0.55)) + path(blades[2]!, tint(g1, 0.22));
  out += ellipse(MID + half * 0.05, top, half * 0.36, ry * 0.36, tint(g0, -0.3), ' opacity="0.26"');
  if (!studio.snow) {
    for (let i = 0; i < Math.ceil(tufts / 2); i++) {
      const side = i % 2 === 0 ? -1 : 1;
      out += tuft(MID + side * half * (0.4 + rand() * 0.46), top + ry * (rand() - 0.3) * 0.8, 1.8 + rand() * 1.6, s.droop * 5 * side, g0, g1);
    }
  }
  if (studio.flowers && health === 'fresh') {
    for (let i = 0; i < flowers; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const x = MID + side * half * (0.5 + rand() * 0.3);
      const y = top + ry * (rand() - 0.2) * 0.6;
      const c = i % 3 === 0 ? '#ffd45a' : '#ffffff';
      for (let k = 0; k < 5; k++) out += path(leafAt([x, y - 0.6], k * 72 - 90, 1.7, 0.85), c);
      out += ellipse(x, y - 0.6, 0.6, 0.6, c === '#ffffff' ? '#ffcf4a' : '#f08a2a');
    }
  }
  // What has come down on it: leaves in autumn, petals in spring.
  studio.litter.forEach((c) => {
    for (let k = 0; k < 3; k++) {
      const a = rand() * Math.PI * 2;
      const d = 0.2 + rand() * 0.7;
      out += path(dabFrom([MID + Math.cos(a) * half * d, top + Math.sin(a) * ry * d], rand() * 360, 2.4 + rand(), 1.1), c);
    }
  });
  // The two pale stones: one at the round's left edge and one on the floor to its right, both kept inside the picture.
  const [left, right] = [3.6 + half * 0.08, 2.6 + half * 0.06];
  out += paleStone(Math.max(left * 1.3 + 2, MID - half * 1.02), top + ry * 0.5, left) + paleStone(Math.min(118 - right * 1.3, MID + half * 1.36), top + ry * 0.1, right);
  return out;
}

/** Fallen leaves: lying on the grass, with one or two still in the air. */
function drawFallen(colours: readonly string[], count: number, half: number, top: number, rand: Rand): string {
  const each = colours.map(() => '');
  for (let i = 0; i < count; i++) {
    const air = i % 4 === 3;
    const x = MID + (rand() - 0.5) * half * (air ? 1.9 : 1.7);
    const y = air ? top + (GROUND - top) * (0.4 + rand() * 0.4) : GROUND - 0.4 + rand() * half * 0.1;
    const len = 2.6 + rand() * 1.6;
    each[i % colours.length] += dabFrom([x, y], rand() * 360, len, len * 0.44);
  }
  return each.map((d, i) => (d ? path(d, colours[i] as string) : '')).join('');
}

/** A stone on the grass: its body, its lit top, and the dark where it meets the ground. */
function stone(x: number, y: number, r: number, rand: Rand): string {
  const f = frame(x, y, (rand() - 0.5) * 16, r);
  const shape: Pt[] = [[-1, 0.1], [-0.84, -0.5], [-0.3, -0.84], [0.36, -0.78], [0.9, -0.34], [1, 0.14], [0.5, 0.36], [-0.5, 0.36]];
  return (
    ellipse(x + r * 0.08, y + r * 0.3, r * 1.04, r * 0.3, '#000000', ' opacity="0.16"') +
    path(closed(through(f, shape)), '#8d9099') +
    path(closed(through(f, shape.map(([px, py]) => [px * 0.66 - 0.16, py * 0.56 - 0.26] as Pt))), '#c2c5cc') +
    path(closed(through(f, [[0.2, 0.36], [0.94, 0.16], [0.86, -0.16], [0.5, 0.1]])), '#6b6e78', ' opacity="0.7"')
  );
}

/** A mushroom: its stalk, cap, the light on the cap, and its spots. */
function mushroom(x: number, y: number, r: number, cap: string, spot: string): string {
  return (
    path(limb([[x, y], [x + r * 0.06, y - r * 1.1]], [r * 0.62, r * 0.46]), '#f4ecd8') +
    path(`M${n(x - r * 1.1)} ${n(y - r * 1.0)}C${n(x - r * 1.0)} ${n(y - r * 2.3)} ${n(x + r * 1.1)} ${n(y - r * 2.3)} ${n(x + r * 1.16)} ${n(y - r * 1.0)}C${n(x + r * 0.5)} ${n(y - r * 0.8)} ${n(x - r * 0.5)} ${n(y - r * 0.8)} ${n(x - r * 1.1)} ${n(y - r * 1.0)}Z`, cap) +
    ellipse(x - r * 0.4, y - r * 1.6, r * 0.34, r * 0.22, spot) +
    ellipse(x + r * 0.38, y - r * 1.34, r * 0.22, r * 0.16, spot) +
    ellipse(x + r * 0.1, y - r * 1.86, r * 0.16, r * 0.1, spot)
  );
}

/**
 * What lies on the ground round a grown tree: a stone or two, and under the great tree something of its own
 * (mushrooms under the pine, a pool by the willow, a lantern by the wish tree, a split pomegranate, a drift of autumn
 * leaves). A withered tree keeps only its stones.
 */
function drawDressing(dr: Drawing, kind: Kind, species: TreeSpecies, stage: Grown, health: TreeHealth, half: number, rand: Rand): string {
  let out = '';
  const stones = stage - 3;
  for (let i = 0; i < stones; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    out += stone(MID + side * half * (0.56 + rand() * 0.22), GROUND + 0.6 + rand() * 1.6, 1.7 + rand() * 1.5, rand);
  }
  if (stage < 6 || health === 'withered' || health === 'wilting') return out;
  const x = MID - half * 0.52;
  const y = GROUND + 2.4;
  if (species === 'kaj') {
    out += mushroom(x, y, 3.1, '#d8413a', '#fff3e0') + mushroom(x + 5.8, y + 1, 2, '#e2574c', '#fff3e0') + mushroom(MID + half * 0.44, y + 0.6, 2.4, '#d8413a', '#fff3e0');
  } else if (species === 'sev') {
    // Mushrooms giving off their own light, like everything under this tree.
    const glow = dr.id('m');
    dr.def(radialBox(glow, [[0, '#9cf0ff', 0.7], [1, '#9cf0ff', 0]]));
    for (const [mx, my, r] of [[x, y, 3], [x + 5.8, y + 1, 2], [MID + half * 0.44, y + 0.6, 2.4]] as const) out += ellipse(mx, my - r * 1.4, r * 3.2, r * 2.6, `url(#${glow})`) + mushroom(mx, my, r, '#6fe0f5', '#e8fdff');
  } else if (species === 'bi') {
    // The pool it grows by: still water with the sky's light on it, and a lily.
    const [px, py] = [MID - half * 0.3, GROUND + 3.6];
    out += ellipse(px, py, 11.5, 2.9, '#2d7fb8') + ellipse(px - 0.4, py - 0.3, 10.4, 2.3, '#49a7dc') + ellipse(px - 3.4, py - 0.7, 4.4, 0.7, '#a9dcf7', ' opacity="0.9"') + ellipse(px + 4.4, py + 0.7, 2.6, 0.4, '#a9dcf7', ' opacity="0.6"');
    out += ellipse(px + 3.2, py - 0.5, 2.3, 0.9, '#3f9c4c') + blossomAt(px + 3.4, py - 1, 1.5, '#ffd9e6', '#ffd24a', 0);
  } else if (species === 'miraz') {
    // A lantern left burning at its foot, on the side away from the swing.
    const [lx, ly] = [MID - half * 0.6, GROUND + 2.6];
    const glow = dr.id('m');
    dr.def(radialBox(glow, [[0, '#ffe08a', 0.75], [1, '#ffe08a', 0]]));
    out += ellipse(lx, ly - 6, 13, 12, `url(#${glow})`);
    out += path(`M${n(lx - 3.9)} ${n(ly)}L${n(lx - 3.3)} ${n(ly - 9.6)}L${n(lx + 3.3)} ${n(ly - 9.6)}L${n(lx + 3.9)} ${n(ly)}Z`, '#3a2c2a');
    out += path(`M${n(lx - 2.6)} ${n(ly - 1.3)}L${n(lx - 2.2)} ${n(ly - 8.4)}L${n(lx + 2.2)} ${n(ly - 8.4)}L${n(lx + 2.6)} ${n(ly - 1.3)}Z`, '#ffd76a') + ellipse(lx, ly - 4.2, 1.3, 2.5, '#fff6c9');
    out += path(limb([[lx, ly - 1.3], [lx, ly - 8.4]], [0.6, 0.6]), '#3a2c2a') + path(`M${n(lx - 5)} ${n(ly - 9.3)}L${n(lx)} ${n(ly - 13.5)}L${n(lx + 5)} ${n(ly - 9.3)}Z`, '#2c2120') + path(limb([[lx, ly - 13.2], [lx, ly - 15.2]], [1, 1]), '#2c2120');
  } else if (species === 'hinar') {
    // A fallen, split pomegranate showing its seeds.
    const [fx, fy] = [MID + half * 0.46, GROUND + 1.6];
    out += fruitAt(fx, fy - 2.6, 3.3, kind.fruit) + path(`M${n(fx - 1.6)} ${n(fy - 4.4)}C${n(fx + 1.4)} ${n(fy - 5.2)} ${n(fx + 3)} ${n(fy - 2.6)} ${n(fx + 1.6)} ${n(fy - 0.6)}C${n(fx + 0.2)} ${n(fy - 1.8)} ${n(fx - 1)} ${n(fy - 3)} ${n(fx - 1.6)} ${n(fy - 4.4)}Z`, '#fbe3c4');
    for (const [dx, dy] of [[0.2, -3.7], [1.2, -2.9], [0.9, -1.8], [1.9, -3.5], [-0.1, -2.7]] as const) out += ellipse(fx + dx, fy + dy, 0.5, 0.56, '#c9202f');
    for (const [dx, dy] of [[4.6, 0.2], [5.8, -0.4], [-3.8, 0.4]] as const) out += ellipse(fx + dx, fy + dy, 0.6, 0.5, '#d6303a');
  } else if (species === 'payiz') {
    // A drift of what it has let fall.
    const [hx, hy] = [MID - half * 0.48, GROUND + 2.6];
    const colours = [kind.leaves[1], kind.leaves[2], kind.leaves[3], kind.leaves[4], '#d9541d', '#ffcb3a'];
    let k = 0;
    for (const [dx, dy, deg] of [[-5, 0, 200], [-2.4, -0.8, 250], [0.4, -1.4, 280], [3, -0.8, 310], [5.4, 0.2, 340], [-3.6, 0.8, 170], [1.6, 0.6, 20], [-0.8, -2.2, 265], [2.2, -2, 300]] as const) out += path(leafAt([hx + dx, hy + dy], deg, 4.2, 1.9), colours[k++ % colours.length] as string);
  } else if (species === 'tu') {
    // Berries fallen on the grass.
    for (const [dx, dy] of [[-0.5, 0.3], [-0.42, 0.9], [-0.3, 0.1], [0.38, 0.5], [0.5, 0.9], [0.3, 1.2]] as const) out += ellipse(MID + dx * half, GROUND + 1.6 + dy * 2, 0.9, 0.8, rand() > 0.4 ? kind.fruit[0] : '#d8375a');
  } else if (species === 'beru') {
    // Acorns fallen among its roots.
    for (const [dx, dy] of [[-0.46, 0.6], [0.44, 0.9], [0.56, 0.2]] as const) {
      const [ax, ay] = [MID + dx * half, GROUND + 1.4 + dy * 2];
      out += ellipse(ax, ay, 1.3, 1, kind.fruit[0]) + ellipse(ax - 0.9, ay - 0.1, 0.8, 1, kind.fruit[1]);
    }
  }
  return out;
}

// ───────────────────────────────────────────────────────────── the stages

/** A local coordinate frame for drawing a small thing upright in its own units and placing it on the canvas. */
type Frame = (x: number, y: number) => Pt;
function frame(cx: number, cy: number, deg: number, k: number): Frame {
  const [c, s] = dir(deg);
  return (x, y) => [cx + (x * c - y * s) * k, cy + (x * s + y * c) * k];
}
const through = (f: Frame, points: readonly Pt[]): Pt[] => points.map(([x, y]) => f(x, y));

/** A closed, smooth outline through `points`. */
function closed(points: readonly Pt[]): string {
  const m = points.length;
  const at = (i: number): Pt => points[((i % m) + m) % m] as Pt;
  let d = `M${pt(at(0))}`;
  for (let i = 0; i < m; i++) {
    const [a, b, c, e] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    d += `C${pt([b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6])} ${pt([c[0] - (e[0] - b[0]) / 6, c[1] - (e[1] - b[1]) / 6])} ${pt(c)}`;
  }
  return `${d}Z`;
}

/** Where the light comes from: the upper left. */
const LIGHT: Pt = [-0.6, -0.8];

/** The seeds' upright outlines, one unit being half their height. */
const SEED_SHAPES: Record<Kind['seed'], readonly Pt[]> = {
  round: [[0, -1], [0.5, -0.8], [0.76, -0.2], [0.68, 0.48], [0.32, 0.92], [0, 1], [-0.32, 0.92], [-0.68, 0.48], [-0.76, -0.2], [-0.5, -0.8]],
  acorn: [[0, -0.5], [0.48, -0.46], [0.66, -0.06], [0.56, 0.5], [0.22, 0.9], [0, 1.04], [-0.22, 0.9], [-0.56, 0.5], [-0.66, -0.06], [-0.48, -0.46]],
  drop: [[0, -1.06], [0.22, -0.68], [0.6, -0.08], [0.7, 0.46], [0.4, 0.9], [0, 1], [-0.4, 0.9], [-0.7, 0.46], [-0.6, -0.08], [-0.22, -0.68]],
  almond: [[0.06, -1.08], [0.34, -0.7], [0.62, -0.1], [0.6, 0.5], [0.3, 0.92], [0, 1], [-0.3, 0.92], [-0.6, 0.5], [-0.62, -0.1], [-0.28, -0.7]],
  cone: [[0, -1.02], [0.38, -0.8], [0.68, -0.2], [0.7, 0.4], [0.4, 0.86], [0, 1], [-0.4, 0.86], [-0.7, 0.4], [-0.68, -0.2], [-0.38, -0.8]],
};
/** An acorn's cup, over the top of its nut. */
const ACORN_CUP: readonly Pt[] = [[-0.8, -0.2], [-0.78, -0.62], [-0.44, -0.96], [0, -1.06], [0.44, -0.96], [0.78, -0.62], [0.8, -0.2], [0.4, -0.3], [0, -0.33], [-0.4, -0.3]];

/** A seed's colours: shade, face and light. */
function seedTones(c: string): readonly [string, string, string] {
  return [tint(c, -0.38), c, tint(c, 0.52)];
}

/** Everything except `d`: a frame far bigger than the canvas with `d` cut out, filled evenodd. */
const without = (d: string): string => `M-60 -60H180V180H-60Z${d}`;
const EVENODD = ' fill-rule="evenodd"';

/**
 * A glossy solid lit from the upper left, like the owner's sprouting seed: its face; the shade on its underside (what
 * the face leaves uncovered when shifted toward the light); a bright rim along its upper edge (what is left when shifted
 * away); and one glint on the rim. `r` is about half its size.
 */
function glossy(dr: Drawing, points: readonly Pt[], [shade, base, light]: readonly [string, string, string], r: number, glint = true): string {
  const d = closed(points);
  const clip = dr.clip(d);
  const laid = (k: number): string => closed(points.map(([x, y]) => [x + LIGHT[0] * r * k, y + LIGHT[1] * r * k] as Pt));
  let inside = path(d, shade) + path(laid(0.24), base) + path(without(laid(-0.12)), light, EVENODD);
  if (glint) {
    // Where the rim is widest: the outline point furthest toward the light, slightly inside it.
    const lit = points.reduce((a, p) => (p[0] * LIGHT[0] + p[1] * LIGHT[1] > a[0] * LIGHT[0] + a[1] * LIGHT[1] ? p : a));
    const cx = points.reduce((a, p) => a + p[0], 0) / points.length;
    const cy = points.reduce((a, p) => a + p[1], 0) / points.length;
    const [gx, gy] = [lit[0] + (cx - lit[0]) * 0.26, lit[1] + (cy - lit[1]) * 0.26];
    inside += ellipse(gx, gy, r * 0.16, r * 0.09, '#ffffff', ` opacity="0.85"${turned((Math.atan2(cy - lit[1], cx - lit[0]) * 180) / Math.PI + 90, gx, gy)}`);
  }
  return `${path(d, base)}<g clip-path="url(#${clip})">${inside}</g>`;
}

/** Where a kind's seed splits along its back, in its upright units: the seam the shell parts at and the shoot emerges from. */
function seamOf(seed: Kind['seed']): readonly Pt[] {
  return seed === 'acorn' ? [[0.6, -0.16], [0.66, 0.16], [0.56, 0.48], [0.34, 0.8]] : [[0.36, -0.78], [0.62, -0.38], [0.72, 0.06], [0.62, 0.48]];
}

/**
 * A kind's seed lying on its side in the earth, as in the owner's reference: glossy, tip to the upper left, split along
 * its back, with its own marks (an acorn's cup, an almond's pits, a cone's scales, a pomegranate pip's wet shine). The
 * split is `shut`; `cracked`, with green light and a green tip showing; or `open` for the shoot, which `drawSprout` draws
 * over the opening before `seedLip` covers the shoot's foot. `f` places it and `k` is half its length on the canvas.
 */
function drawSeedBody(dr: Drawing, kind: Kind, f: Frame, k: number, split: 'shut' | 'cracked' | 'open'): string {
  const tones = seedTones(kind.seedColour);
  const [shade, base, light] = tones;
  let out = glossy(dr, through(f, SEED_SHAPES[kind.seed]), tones, k);
  const dot = (x: number, y: number, rx: number, ry: number, fill: string, more = ''): string => {
    const [px, py] = f(x, y);
    return ellipse(px, py, rx * k, ry * k, fill, more);
  };
  if (kind.seed === 'acorn') {
    // Its cup: darker and rougher than the nut, with rows of scales and a stalk.
    const cup: readonly [string, string, string] = [tint(base, -0.62), tint(base, -0.42), tint(base, -0.1)];
    out += path(limb(through(f, [[0, -0.98], [0.1, -1.24], [0.26, -1.4]]), [k * 0.2, k * 0.16, k * 0.12]), cup[0]);
    out += glossy(dr, through(f, ACORN_CUP), cup, k * 0.8, false);
    let scales = '';
    for (const [y, half, count] of [[-0.76, 0.5, 4], [-0.52, 0.66, 5]] as const) {
      for (let i = 0; i < count; i++) {
        const x = -half + ((half * 2) / (count - 1)) * i;
        const [px, py] = f(x, y);
        const [qx, qy] = f(x, y + 1);
        scales += leafAt([px, py], (Math.atan2(qy - py, qx - px) * 180) / Math.PI + x * 30, k * 0.2, k * 0.11);
      }
    }
    out += path(scales, cup[0], ' opacity="0.7"');
  } else if (kind.seed === 'almond') {
    // The pits of its shell.
    for (const [x, y] of [[-0.2, -0.36], [0.06, -0.1], [-0.3, 0.14], [0.04, 0.4], [-0.14, 0.66], [0.2, -0.5]] as const) out += dot(x, y, 0.05, 0.09, shade, ' opacity="0.55"');
  } else if (kind.seed === 'cone') {
    // Its scales, row over row, each with a lit lip.
    let dark = '';
    let lit = '';
    for (const [y, half, count] of [[-0.56, 0.3, 3], [-0.2, 0.52, 4], [0.16, 0.54, 4], [0.52, 0.4, 3]] as const) {
      for (let i = 0; i < count; i++) {
        const x = -half + ((half * 2) / (count - 1)) * i;
        const [px, py] = f(x, y);
        const [qx, qy] = f(x, y + 1);
        const down = (Math.atan2(qy - py, qx - px) * 180) / Math.PI + x * 24;
        dark += leafAt([px, py], down, k * 0.36, k * 0.2);
        lit += leafAt(f(x - 0.03, y - 0.03), down, k * 0.2, k * 0.13);
      }
    }
    out += path(dark, shade, ' opacity="0.8"') + path(lit, mix(base, light, 0.5));
  } else if (kind.seed === 'drop') {
    // Wet and clear, with the pip showing through.
    out += dot(-0.1, 0.28, 0.24, 0.4, tint(base, 0.45), ' opacity="0.45"');
  } else {
    // A plain seed: the scar it hung by, and a speck or two.
    out += dot(0.04, 0.8, 0.16, 0.08, light, ' opacity="0.6"');
    for (const [x, y] of [[-0.3, -0.2], [-0.16, 0.3], [-0.1, -0.56]] as const) out += dot(x, y, 0.05, 0.06, shade, ' opacity="0.45"');
  }
  const seam = seamOf(kind.seed);
  const dark = tint(base, -0.66);
  if (split === 'shut') {
    // The seam it will part at, barely visible.
    return out + path(limb(through(f, seam), [k * 0.02, k * 0.05, k * 0.05, k * 0.02]), shade, ' opacity="0.7"');
  }
  if (split === 'cracked') {
    // The crack: dark where the shell has parted, green light inside, and the shoot's tip showing at its widest.
    const crack = seam.map(([x, y], i) => [x + (i % 2 === 0 ? -0.05 : 0.04), y] as Pt);
    out += path(limb(through(f, crack), [k * 0.05, k * 0.15, k * 0.13, k * 0.04]), dark);
    out += path(limb(through(f, crack), [k * 0.02, k * 0.07, k * 0.06, k * 0.015]), '#e6ff8f');
    const at = f(0.7, -0.2);
    const out1 = f(1.4, -0.4);
    const up = (Math.atan2(out1[1] - at[1], out1[0] - at[0]) * 180) / Math.PI;
    return out + path(leafAt(at, up - 18, k * 0.34, k * 0.13), '#8fd24e') + path(leafAt(at, up + 22, k * 0.28, k * 0.12), '#d6f77e');
  }
  // Open: the shell parted along its back, the gap's dark and the seed's pale inside, its edge lifted past the outline.
  const lip = seam.map(([x, y], i) => [x + 0.16 * Math.sin((i / (seam.length - 1)) * Math.PI), y] as Pt);
  const inner = seam.map(([x, y], i) => [x - 0.2 * Math.sin((i / (seam.length - 1)) * Math.PI), y] as Pt);
  const gap = closed(through(f, [...lip, ...[...inner].reverse()]));
  const flesh = closed(through(f, [...seam.map(([x, y], i) => [x + 0.04 * Math.sin((i / (seam.length - 1)) * Math.PI), y] as Pt), ...inner.map(([x, y], i) => [x + 0.07 * Math.sin((i / (seam.length - 1)) * Math.PI), y] as Pt).reverse()]));
  return out + path(gap, dark) + path(flesh, '#f2f0b8');
}

/** The split shell's edge over the shoot's foot, so the shoot is seen to come out of the seed and not stand on it. */
function seedLip(kind: Kind, f: Frame, k: number): string {
  const seam = seamOf(kind.seed);
  const [, base, light] = seedTones(kind.seedColour);
  const lip = seam.map(([x, y], i) => [x + 0.16 * Math.sin((i / (seam.length - 1)) * Math.PI), y] as Pt);
  const rim = through(f, lip);
  return path(limb(rim, [k * 0.04, k * 0.12, k * 0.12, k * 0.04]), base) + path(limb(beside(rim, [k * 0.02, k * 0.04, k * 0.04, k * 0.02]), [k * 0.02, k * 0.05, k * 0.05, k * 0.02]), light);
}

/** A heap of turned earth the seed was set in, lit on its upper left, with a crumb or two beside it. */
function drawMound(x: number, w: number, h: number, soil: readonly [string, string, string], rand: Rand): string {
  const g = GROUND;
  let out = path(`M${n(x - w)} ${n(g + 0.8)}C${n(x - w * 0.8)} ${n(g - h * 0.9)} ${n(x - w * 0.3)} ${n(g - h)} ${n(x)} ${n(g - h)}C${n(x + w * 0.3)} ${n(g - h)} ${n(x + w * 0.8)} ${n(g - h * 0.9)} ${n(x + w)} ${n(g + 0.8)}C${n(x + w * 0.5)} ${n(g + 2.8)} ${n(x - w * 0.5)} ${n(g + 2.8)} ${n(x - w)} ${n(g + 0.8)}Z`, soil[1]);
  out += ellipse(x + w * 0.3, g - h * 0.1, w * 0.6, h * 0.5, soil[0], ' opacity="0.5"');
  out += ellipse(x - w * 0.34, g - h * 0.62, w * 0.4, h * 0.24, soil[2], ' opacity="0.75"');
  for (let i = 0; i < 5; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const cx = x + side * w * (0.74 + rand() * 0.46);
    const r = 0.7 + rand() * 0.9;
    out += ellipse(cx, g + 0.6 + rand() * 1.4, r * 1.2, r * 0.8, i % 3 === 0 ? soil[2] : soil[0]);
  }
  return out;
}

/** A four-pointed spark of light. */
function sparkle(cx: number, cy: number, r: number): string {
  const k = r * 0.24;
  return `M${n(cx)} ${n(cy - r)}Q${n(cx + k)} ${n(cy - k)} ${n(cx + r)} ${n(cy)}Q${n(cx + k)} ${n(cy + k)} ${n(cx)} ${n(cy + r)}Q${n(cx - k)} ${n(cy + k)} ${n(cx - r)} ${n(cy)}Q${n(cx - k)} ${n(cy - k)} ${n(cx)} ${n(cy - r)}Z`;
}

/**
 * A plump leaf from `base` along `deg`, its tip curled to one side by `bend` (a share of its length) like a young
 * leaf: the whole leaf, its half toward the light, the bright rim on its lit edge, and its midrib line.
 */
function blade(base: Pt, deg: number, len: number, w: number, bend = 0): { whole: string; lit: string; rim: string; rib: Pt[] } {
  const u = dir(deg);
  const v: Pt = [-u[1], u[0]];
  const at = (s: number, o: number): Pt => {
    const curl = bend * len * s * s;
    return [base[0] + u[0] * s * len + v[0] * (o + curl), base[1] + u[1] * s * len + v[1] * (o + curl)];
  };
  // The side whose face is turned to the light.
  const side = v[0] * LIGHT[0] + v[1] * LIGHT[1] >= 0 ? 1 : -1;
  const tip = at(1, 0);
  const edge = (k: number): string => `C${pt(at(0.16, w * 1.12 * k))} ${pt(at(0.7, w * 0.8 * k))} ${pt(tip)}`;
  const back = (k: number): string => `C${pt(at(0.7, w * 0.8 * k))} ${pt(at(0.16, w * 1.12 * k))} ${pt(base)}`;
  return {
    whole: `M${pt(base)}${edge(1)}${back(-1)}Z`,
    lit: `M${pt(base)}${edge(side)}Q${pt(at(0.5, 0))} ${pt(base)}Z`,
    rim: `M${pt(base)}${edge(side)}C${pt(at(0.72, w * 0.6 * side))} ${pt(at(0.2, w * 0.84 * side))} ${pt(base)}Z`,
    rib: [0, 0.3, 0.6, 0.9].map((s) => at(s, 0)),
  };
}

/** A leaf's colours: its half turned from the light, its half turned toward it, and its rim and midrib. */
type Greens = readonly [shade: string, face: string, light: string];

/** A plump leaf drawn: shaded half, lit half, the rim of light on its lit edge, and its midrib. */
function drawBlade(base: Pt, deg: number, len: number, w: number, bend: number, [shade, face, light]: Greens): string {
  const b = blade(base, deg, len, w, bend);
  return path(b.whole, shade) + path(b.lit, face) + path(b.rim, light) + path(limb(b.rib, [len * 0.05, len * 0.04, len * 0.026, len * 0.01]), light, ' opacity="0.8"');
}

/** Small fallen leaves by a young plant's foot, as in the owner's reference; they lie on the ground layer and stay still. */
function drawFlecks(points: readonly (readonly [number, number, number, number])[], colours: readonly string[]): string {
  let out = '';
  points.forEach(([x, y, deg, len], i) => {
    out += path(leafAt([x, y], deg, len, len * 0.42), colours[i % colours.length] as string);
  });
  return out;
}

/** The width of the round a young plant stands on at each young stage: wider each time, never wider than the young tree's after it. */
const YOUNG_GROUND = [20, 21, 22] as const;

/** Where the seed lies, the same for seed and sprout so the sprout rises out of it: centre, turn (tip to the upper left) and half-length. */
const SEED_AT = { x: MID - 1, y: GROUND - 9, turn: -64, k: 13.5 } as const;
const seedFrame = (): Frame => frame(SEED_AT.x, SEED_AT.y, SEED_AT.turn, SEED_AT.k);

/** The seed's bed on the ground layer: a little heap of turned earth behind it and the dark hollow it is set in. */
function seedBed(soil: readonly [string, string, string], rand: Rand): string {
  return drawMound(MID, 17, 4.6, soil, rand) + ellipse(MID - 1, GROUND - 2.6, 14, 3.4, tint(soil[0], -0.12));
}

/**
 * The earth drawn up over the seed's lower side, so it lies in the ground rather than on it. It is the front layer:
 * it stays still with the ground, and a seed dropped in falls behind it.
 */
function seedLipOfEarth(soil: readonly [string, string, string]): string {
  const [x, y, w] = [MID - 1, GROUND - 0.2, 16];
  let out = path(`M${n(x - w)} ${n(y + 2.6)}C${n(x - w * 0.7)} ${n(y - 1.6)} ${n(x - w * 0.3)} ${n(y - 0.8)} ${n(x)} ${n(y - 1.3)}C${n(x + w * 0.34)} ${n(y - 0.8)} ${n(x + w * 0.74)} ${n(y - 2)} ${n(x + w)} ${n(y + 2.6)}C${n(x + w * 0.5)} ${n(y + 5.6)} ${n(x - w * 0.5)} ${n(y + 5.6)} ${n(x - w)} ${n(y + 2.6)}Z`, soil[1]);
  out += ellipse(x - w * 0.46, y - 0.2, w * 0.26, 0.9, soil[2], ' opacity="0.8"') + ellipse(x + w * 0.4, y + 0.1, w * 0.2, 0.8, soil[2], ' opacity="0.6"') + ellipse(x + w * 0.16, y + 2.6, w * 0.5, 1.4, soil[0], ' opacity="0.5"');
  for (const [dx, dy, r] of [[-10.6, 2.4, 1.1], [9.6, 2.6, 1.2], [-3.2, 3.6, 0.9], [4.2, 2, 0.8]] as const) out += ellipse(x + dx, y + dy, r * 1.25, r * 0.85, soil[0]);
  return out;
}

/**
 * The seed: the kind's own, in its hollow with earth drawn up over its lower side, and while watered cracked along its
 * back with green light showing and a soft glow round it. It lies exactly where the sprout will rise.
 */
function drawSeed(drs: Drawings, kind: Kind, health: TreeHealth, rand: Rand): Layers {
  const soil = soilOf(health);
  const alive = health === 'fresh';
  let ground = drawIsland(drs.ground, kind, health, YOUNG_GROUND[0], 15, rand, 5, 2, 18);
  ground += seedBed(soil, rand);
  if (alive) {
    // The light of what is inside, about the crack.
    const glow = drs.ground.id('h');
    drs.ground.def(radialBox(glow, [[0, '#f4ffa6', 0.62], [0.5, '#e8f9a0', 0.22], [1, '#e8f9a0', 0]]));
    ground += ellipse(SEED_AT.x + 3, SEED_AT.y - 5, 24, 20, `url(#${glow})`);
  }
  const plant = drawSeedBody(drs.plant, kind, seedFrame(), SEED_AT.k, alive ? 'cracked' : 'shut');
  return { ground, plant, crown: '', front: seedLipOfEarth(soil), swing: '' };
}

/** A young shoot's green, the same for every kind; the kind's own colour arrives with its first real leaves. */
const SHOOT: Ramp = ['#1d6b3a', '#2a8a3e', '#3fae45', '#62c94a', '#9fe05a', '#dcf79a'];

/**
 * The sprout, traced from the owner's reference: the seed split open where it lay, a pale S-shaped stem with light up
 * its middle, two broad first leaves (one large, one small) and the newest leaf still curled between them, with small
 * leaves drifting by its foot. Without water the stem bows and the leaves hang; withered, it lies over brown.
 */
function drawSprout(drs: Drawings, kind: Kind, health: TreeHealth, rand: Rand): Layers {
  const s = STATE[health];
  const soil = soilOf(health);
  const green = fared(SHOOT, health);
  const alive = health === 'fresh';
  let ground = drawIsland(drs.ground, kind, health, YOUNG_GROUND[1], 15, rand, 5, 1, 50);
  ground += seedBed(soil, rand);
  const f = seedFrame();
  const k = SEED_AT.k;
  const seam = seamOf(kind.seed);
  const mouth = f(seam[1]![0] + 0.04, (seam[1]![1] + seam[2]![1]) / 2);
  // The stem: out of the split and up in an S, bowing further the longer it goes without water.
  const bow = s.droop;
  const rise: Pt[] = [[0, 0], [3.2, -5.6], [3.2, -12], [-0.6, -18.4], [-3, -24.2], [-1.8, -30], [0.8, -34.2], [3.6, -35.6], [5.4, -34], [4.8, -31.8]];
  const stem: Pt[] = rise.map(([dx, dy], i) => {
    const t = Math.min(1, i / 6);
    return [mouth[0] + dx + bow * t * t * 2.6, mouth[1] + dy + bow * t * t * 3.4] as Pt;
  });
  const widths = [4.4, 4.2, 3.8, 3.3, 2.9, 2.4, 2, 1.7, 1.4, 1];
  const pale = mix(green[4], '#f4ffb0', 0.42);
  const shadeOf = mix(green[3], green[2], 0.4);
  const hang = s.droop * 12;
  const leaves: Greens = [green[2], green[3], green[5]];
  const node = stem[4] as Pt;
  const tip = stem[7] as Pt;
  let plant = drawSeedBody(drs.plant, kind, f, k, 'open');
  // The small leaf, behind the stem, to the left.
  plant += drawBlade([node[0] - 0.6, node[1] + 0.8], 200 + hang, 16, 6.6, 0.14 + s.droop * 0.04, [green[2], green[3], green[4]]);
  // The stem: its body, the shade down its right side, and the light up its middle.
  plant += path(limb(stem, widths), pale);
  plant += path(limb(beside(stem, widths.map((w) => -w * 0.26)), widths.map((w) => w * 0.42)), shadeOf, ' opacity="0.75"');
  plant += path(limb(beside(stem, widths.map((w) => w * 0.12)), widths.map((w) => w * 0.26)), alive ? '#f8ffd2' : mix(pale, '#ffffff', 0.3), ' opacity="0.9"');
  // The newest leaf, still rolled, along the curl at the stem's tip.
  const curl = blade(tip, -18 + hang * 0.6, 7.6, 2.6, 0.62 + s.droop * 0.04);
  plant += path(curl.whole, green[3]) + path(curl.lit, green[4]) + path(curl.rim, green[5]);
  // The large leaf, in front, to the right, hanging a little from where it leaves the stem.
  plant += drawBlade([node[0] + 0.6, node[1] + 0.4], -12 + hang, 23.5, 9.4, 0.18 + s.droop * 0.05, leaves);
  // The shell's lip over the stem's foot, and the earth over the seed's lower side.
  plant += seedLip(kind, f, k);
  if (alive) ground += drawFlecks([[MID - 19, GROUND - 9, -150, 3.6], [MID + 17, GROUND - 13, -24, 3.2], [MID - 13, GROUND - 19, -112, 2.4], [MID + 21, GROUND - 5, 18, 2.6]], [green[4], green[3], green[5]]);
  if (s.fallen > 0) ground += drawFallen([green[3], green[4]], Math.round(s.fallen * 0.3), YOUNG_GROUND[1], GROUND - 30, rand);
  return { ground, plant, crown: '', front: seedLipOfEarth(soil), swing: '' };
}

/** How a kind's sapling carries its leaves: where up the stem, which way, their size, and how far they hang. */
interface Young {
  /** Leaves up the stem, as shares of its height, alternately left and right. */
  at: readonly number[];
  /** How far above level a leaf points, in degrees, at the stem's foot and at its top. */
  rise: readonly [number, number];
  len: readonly [number, number];
  /** A leaf's half-width as a share of its length. */
  wide: number;
  bend: number;
}

/** A sapling's stem height: taller than the sprout, shorter than any kind's youngest tree. */
const SAPLING_TALL = 52;

const YOUNG: Record<Habit, Young> = {
  dome: { at: [0.34, 0.47, 0.6, 0.72, 0.84], rise: [8, 34], len: [17.5, 12.5], wide: 0.44, bend: 0.2 },
  shrub: { at: [0.26, 0.38, 0.5, 0.62, 0.73, 0.84], rise: [14, 40], len: [13.5, 10], wide: 0.36, bend: 0.14 },
  cloud: { at: [0.34, 0.48, 0.62, 0.76], rise: [10, 36], len: [16, 11.5], wide: 0.4, bend: 0.2 },
  weeping: { at: [0.4, 0.5, 0.6, 0.7, 0.8, 0.9], rise: [16, 30], len: [20, 15], wide: 0.17, bend: 0.5 },
  column: { at: [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9], rise: [38, 62], len: [12, 9], wide: 0.42, bend: 0.06 },
  tiers: { at: [0.26, 0.46, 0.64, 0.8], rise: [-16, -16], len: [19, 8], wide: 0.2, bend: 0.1 },
};

/**
 * The sapling: a young stem, woody at its foot, with leaves up it, already its kind: a pine in tiers of needles, a
 * willow's long hanging leaves, a poplar's reaching up, the top in its crown's future colour, and a first flower on a
 * tree that blossoms.
 */
function drawSapling(drs: Drawings, kind: Kind, health: TreeHealth, ramp: Ramp, rand: Rand): Layers {
  const s = STATE[health];
  const soil = soilOf(health);
  const young = YOUNG[kind.habit];
  // A tree whose crown is not green (blossom, autumn, the night tree) is green below and its own colour on top.
  const own = kind.turns === undefined;
  const green = own ? ramp : fared(SHOOT, health);
  const alive = health === 'fresh';
  const tall = SAPLING_TALL;
  let ground = drawIsland(drs.ground, kind, health, YOUNG_GROUND[2], 15, rand, 6, 1, tall + 8);
  ground += drawMound(MID, 11, 3.2, soil, rand);
  let plant = '';
  const bow = s.droop;
  const stem: Pt[] = [
    [MID, GROUND + 0.4],
    [MID - 1.8 + bow * 0.2, GROUND - tall * 0.3],
    [MID + 1.4 + bow * 0.8, GROUND - tall * 0.64 + bow * 0.4],
    [MID + 0.2 + bow * 1.9, GROUND - tall + bow * 1.8],
  ];
  const widths = [5.2, 4, 3, 1.8];
  const along = (u: number): Pt => {
    const t = Math.max(0, Math.min(0.999, u)) * (stem.length - 1);
    const i = Math.floor(t);
    const [a, b] = [stem[i] as Pt, stem[i + 1] as Pt];
    return [a[0] + (b[0] - a[0]) * (t - i), a[1] + (b[1] - a[1]) * (t - i)];
  };
  const wood = kind.wood.map((c) => mix(c, '#8a8078', s.dead * 0.45)) as unknown as Wood;
  const hang = s.droop * 10;
  const greens: Greens = [green[3], green[4], green[5]];
  const deep: Greens = [green[2], green[3], green[4]];
  const conifer = kind.habit === 'tiers';
  const leafOn = (u: number, i: number, tones: Greens): string => {
    const t = young.at.length === 1 ? 0 : i / (young.at.length - 1);
    const left = i % 2 === 0;
    const rise = young.rise[0] + (young.rise[1] - young.rise[0]) * t - hang;
    const len = (young.len[0] + (young.len[1] - young.len[0]) * t) * (0.94 + rand() * 0.12);
    return drawBlade(along(u), left ? 180 + rise : -rise, len, len * young.wide, (left ? -1 : 1) * (young.bend + s.droop * 0.04), tones);
  };
  // Leaves on the far side of the stem first, then the stem, then the near ones.
  if (!conifer) young.at.forEach((u, i) => (i % 2 === 0 ? (plant += leafOn(u, i, deep)) : rand()));
  plant += path(limb(stem, widths), mix(wood[2], green[2], 0.3));
  plant += path(limb(beside(stem, widths.map((w) => w * 0.22)), widths.map((w) => w * 0.3)), mix(wood[3], green[4], 0.35));
  plant += path(limb(beside(stem, widths.map((w) => -w * 0.3)), widths.map((w) => w * 0.26)), mix(wood[1], green[1], 0.3), ' opacity="0.7"');
  if (conifer) {
    // A small pine: a fan of needles to each side at every tier, shorter toward the tip, and a spike on top.
    young.at.forEach((u, i) => {
      const at = along(u);
      const t = i / (young.at.length - 1);
      const len = young.len[0] + (young.len[1] - young.len[0]) * t;
      for (const side of [-1, 1]) {
        // Three boughs to a side, each lower and shorter than the last: a skirt of needles round the stem.
        for (const [fall, k, tone] of [[58, 0.62, 1], [34, 0.86, 2], [12, 1, 3]] as const) {
          const deg = side < 0 ? 180 - fall - hang : fall + hang;
          plant += drawBlade(at, deg, len * k, len * k * young.wide, side * (young.bend + s.droop * 0.05), [green[tone], green[tone + 1] as string, green[tone + 2] as string]);
        }
      }
    });
    const top = stem[stem.length - 1] as Pt;
    plant += drawBlade(along(0.84), -90 + bow * 6, 17, 3, 0, [green[2], green[4], green[5]]);
    plant += path(leafAt(top, -138, 5.4, 1.5), green[3]) + path(leafAt(top, -42, 5.4, 1.5), green[4]);
  } else {
    young.at.forEach((u, i) => (i % 2 === 1 ? (plant += leafOn(u, i, greens)) : rand()));
    // The top: its newest leaves in the crown's future colour, and a first flower on a tree that blossoms.
    const top = stem[stem.length - 1] as Pt;
    const crown: Greens = own ? [ramp[4], ramp[5], tint(ramp[5], 0.3)] : [ramp[3], ramp[4], ramp[5]];
    const lift = kind.habit === 'weeping' ? 40 : 0;
    plant += drawBlade(top, -146 + lift - hang, 10.5, 10.5 * young.wide, -young.bend, [mix(crown[0], ramp[2], 0.4), crown[0], crown[1]]);
    plant += drawBlade(top, -34 - lift + hang, 11.5, 11.5 * young.wide, young.bend, crown);
    if (kind.habit !== 'weeping') plant += drawBlade(top, -92 + bow * 8, 9, 9 * young.wide * 0.8, 0, [crown[0], crown[1], crown[2]]);
    if (kind.bears === 'blossom' && health !== 'withered' && health !== 'wilting') {
      const at = along(0.9);
      plant += blossomAt(at[0] + 5.4, at[1] - 1, 4.2, kind.fruit[0], kind.fruit[2], 12) + ellipse(at[0] - 5, at[1] + 4.6, 1.9, 2.2, ramp[2]) + ellipse(at[0] - 5.4, at[1] + 4.1, 1, 1.2, ramp[4]);
    }
  }
  if (alive) ground += drawFlecks([[MID - 20, GROUND - 10, -150, 3.8], [MID + 19, GROUND - 16, -30, 3.2], [MID + 22, GROUND - 5, 24, 2.8]], own ? [ramp[4], ramp[3]] : [ramp[3], ramp[4]]);
  if (s.fallen > 0) ground += drawFallen([green[3], green[4]], Math.round(s.fallen * 0.4), YOUNG_GROUND[2], GROUND - tall, rand);
  return { ground, plant, crown: '', front: '', swing: '' };
}

/** One crown mass as a stand lists it: x and y from the crown's middle in half-widths, size, depth and flatness. */
type Mass = readonly [x: number, y: number, r: number, near: 0 | 1 | 2, squash?: number];

/** How a tree stands at a stage: trunk height and girth, crown width and position. */
interface Stand {
  trunk: number;
  girth: number;
  /** The crown's middle above the ground, and half its width. */
  crownY: number;
  half: number;
  /** Its island: half its width, and its earth's depth. */
  ground: number;
  depth: number;
  tufts: number;
  flowers: number;
  /** Its masses, far ones first. */
  puffs: readonly Mass[];
}

type Grown = 3 | 4 | 5 | 6;

/** A leaf's length in a grown tree's crown at each stage: a little larger as the tree is, so a great tree is not a blur of specks. */
const LEAF_LEN: Record<Grown, number> = { 3: 3.3, 4: 3.7, 5: 4, 6: 4.3 };

/**
 * A broad dome as it grows: a few masses on a young trunk, then a full crown wider than tall. Masses vary in size and
 * are unevenly laid, the far ones high and at the sides, and its middle is open below so the fork and boughs show
 * against the dark inside.
 */
const DOME: Record<Grown, Stand> = {
  3: { trunk: 27, girth: 5.8, crownY: 49.5, half: 23, ground: 26, depth: 14, tufts: 6, flowers: 0, puffs: [[0.36, -0.34, 0.5, 0], [-0.52, 0.06, 0.5, 1], [0.5, 0.1, 0.44, 2], [-0.06, -0.3, 0.6, 2]] },
  4: {
    trunk: 27,
    girth: 8.6,
    crownY: 50,
    half: 31,
    ground: 32,
    depth: 14,
    tufts: 7,
    flowers: 1,
    puffs: [[-0.4, -0.48, 0.42, 0], [0.46, -0.46, 0.42, 0], [0.78, 0.04, 0.3, 0], [-0.64, -0.02, 0.44, 1], [0.5, -0.06, 0.44, 2], [-0.04, -0.4, 0.5, 2], [-0.32, 0.26, 0.28, 2]],
  },
  5: {
    trunk: 30,
    girth: 12,
    crownY: 52,
    half: 40,
    ground: 38,
    depth: 15,
    tufts: 8,
    flowers: 2,
    puffs: [
      [-0.44, -0.5, 0.38, 0],
      [0.42, -0.52, 0.38, 0],
      [-0.84, 0.04, 0.28, 0],
      [0.86, 0.0, 0.28, 0],
      [-0.68, -0.18, 0.36, 1],
      [0.7, -0.22, 0.36, 1],
      [0.42, 0.26, 0.26, 1],
      [-0.4, -0.26, 0.4, 2],
      [0.38, -0.3, 0.4, 2],
      [-0.02, -0.46, 0.42, 2],
      [-0.44, 0.24, 0.26, 2],
    ],
  },
  6: {
    trunk: 33,
    girth: 15.5,
    crownY: 55,
    half: 45,
    ground: 44,
    depth: 15,
    tufts: 10,
    flowers: 3,
    puffs: [
      [-0.46, -0.5, 0.36, 0],
      [0.42, -0.52, 0.36, 0],
      [-0.02, -0.58, 0.32, 0],
      [-0.86, 0.02, 0.27, 0],
      [0.88, -0.02, 0.27, 0],
      [-0.7, -0.2, 0.34, 1],
      [0.7, -0.24, 0.34, 1],
      [0.44, 0.26, 0.25, 1],
      [0.16, -0.54, 0.3, 1],
      [-0.42, -0.28, 0.4, 2],
      [0.4, -0.32, 0.4, 2],
      [-0.02, -0.42, 0.4, 2],
      [-0.46, 0.24, 0.25, 2],
      [0.76, 0.1, 0.22, 2],
    ],
  },
};

/** A blossom crown: a dome's, with masses slightly smaller and further apart like clouds, on a slenderer, taller trunk. */
const cloudOf = (d: Stand): Stand => ({ ...d, trunk: d.trunk + 2, girth: d.girth * 0.74, crownY: d.crownY + 2, puffs: d.puffs.map(([x, y, r, near]) => [x * 1.04, y, r * 0.93, near] as Mass) });
const CLOUD: Record<Grown, Stand> = { 3: cloudOf(DOME[3]), 4: cloudOf(DOME[4]), 5: cloudOf(DOME[5]), 6: cloudOf(DOME[6]) };

/** A bush-like tree: a dome's crown, rounder and lower, on a trunk forking near the ground into stems that lean apart. */
const shrubOf = (d: Stand): Stand => ({ ...d, trunk: d.trunk * 0.5, girth: d.girth * 0.82, crownY: d.crownY - d.trunk * 0.16, half: d.half * 0.9, puffs: d.puffs.map(([x, y, r, near]) => [x * 0.96, y * 1.06, r * 1.03, near] as Mass) });
// Its first crown is lifted a little, so even this low tree stands clear above the sapling it grew from.
const SHRUB: Record<Grown, Stand> = { 3: { ...shrubOf(DOME[3]), crownY: shrubOf(DOME[3]).crownY + 4 }, 4: shrubOf(DOME[4]), 5: shrubOf(DOME[5]), 6: shrubOf(DOME[6]) };

/** A tall, narrow tree: masses stacked one over another, narrowing to a point. */
const COLUMN: Record<Grown, Stand> = {
  3: { trunk: 22, girth: 3.4, crownY: 45, half: 10, ground: 22, depth: 14, tufts: 6, flowers: 0, puffs: [[0.1, 0.9, 0.9, 0], [-0.1, 0.0, 1.0, 2], [0.04, -1.0, 0.74, 2]] },
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
    crownY: 48,
    half: 17,
    ground: 36,
    depth: 15,
    tufts: 10,
    flowers: 3,
    puffs: [[0.22, 1.5, 0.78, 0], [-0.2, 0.96, 0.94, 2], [0.2, 0.34, 1.0, 0], [-0.16, -0.3, 0.98, 2], [0.14, -0.94, 0.88, 0], [-0.08, -1.52, 0.74, 2], [0.06, -2.02, 0.56, 2], [0.0, -2.42, 0.36, 2]],
  },
};

/**
 * A mountain pine, as the owner's reference paints one: a trunk rising through flat pads of needles held out on its
 * boughs, to one side and then the other, a crown pad on top and darker pads behind, with air between them.
 */
const TIERS: Record<Grown, Stand> = {
  3: { trunk: 14, girth: 3.6, crownY: 42, half: 22, ground: 23, depth: 14, tufts: 6, flowers: 0, puffs: [[0.06, 0.12, 0.44, 0, 0.55], [0.02, -0.66, 0.46, 2, 0.62], [-0.36, -0.08, 0.58, 1, 0.5], [0.38, 0.4, 0.62, 2, 0.46]] },
  4: {
    trunk: 15,
    girth: 5,
    crownY: 45,
    half: 25,
    ground: 28,
    depth: 14,
    tufts: 7,
    flowers: 1,
    puffs: [[0.1, -0.24, 0.38, 0, 0.55], [-0.06, 0.42, 0.44, 0, 0.5], [0.02, -0.84, 0.38, 2, 0.62], [-0.36, -0.4, 0.5, 1, 0.5], [0.4, 0.06, 0.56, 2, 0.46], [-0.44, 0.56, 0.62, 1, 0.44]],
  },
  5: {
    trunk: 16,
    girth: 6.6,
    crownY: 47,
    half: 27,
    ground: 33,
    depth: 15,
    tufts: 8,
    flowers: 2,
    puffs: [
      [0.12, -0.52, 0.34, 0, 0.55],
      [-0.08, 0.18, 0.42, 0, 0.5],
      [0.14, 0.7, 0.44, 0, 0.45],
      [0.02, -1.0, 0.34, 2, 0.62],
      [-0.38, -0.6, 0.46, 1, 0.5],
      [0.38, -0.22, 0.52, 2, 0.46],
      [-0.46, 0.22, 0.58, 1, 0.44],
      [0.48, 0.64, 0.6, 2, 0.42],
    ],
  },
  6: {
    trunk: 17,
    girth: 8,
    crownY: 52,
    half: 31,
    ground: 38,
    depth: 15,
    tufts: 10,
    flowers: 3,
    puffs: [
      [0.1, -0.78, 0.3, 0, 0.58],
      [-0.06, -0.06, 0.4, 0, 0.5],
      [0.16, 0.62, 0.44, 0, 0.45],
      [0.02, -1.14, 0.3, 2, 0.64],
      [-0.36, -0.78, 0.42, 1, 0.5],
      [0.36, -0.44, 0.48, 2, 0.46],
      [-0.44, -0.02, 0.54, 1, 0.44],
      [0.46, 0.36, 0.56, 2, 0.42],
      [-0.5, 0.74, 0.6, 1, 0.4],
    ],
  },
};

/**
 * A weeping tree. Only the top of its crown is a leaf mass, small and flat; the rest is the sprays that arch out and
 * hang (`drawSprays`), which is why `half`, the sprays' reach, is much wider than the cap.
 */
const WEEPING: Record<Grown, Stand> = {
  3: { trunk: 24, girth: 4, crownY: 52, half: 22, ground: 25, depth: 14, tufts: 6, flowers: 0, puffs: [[0.04, -0.3, 0.36, 2, 0.78]] },
  4: { trunk: 27, girth: 6.2, crownY: 54, half: 30, ground: 31, depth: 14, tufts: 7, flowers: 1, puffs: [[-0.22, -0.2, 0.26, 0, 0.78], [0.2, -0.24, 0.3, 2, 0.78]] },
  5: { trunk: 30, girth: 8.8, crownY: 58, half: 38, ground: 37, depth: 15, tufts: 8, flowers: 2, puffs: [[0.3, -0.18, 0.24, 0, 0.78], [-0.26, -0.2, 0.26, 2, 0.78], [0.04, -0.32, 0.3, 2, 0.78]] },
  6: {
    trunk: 32,
    girth: 11.5,
    crownY: 62,
    half: 46,
    ground: 43,
    depth: 15,
    tufts: 10,
    flowers: 3,
    puffs: [[0.34, -0.2, 0.22, 0, 0.78], [-0.36, -0.2, 0.22, 0, 0.78], [-0.12, -0.3, 0.26, 2, 0.78], [0.12, -0.34, 0.28, 2, 0.78]],
  },
};

const STANDS: Record<Habit, Record<Grown, Stand>> = { dome: DOME, shrub: SHRUB, cloud: CLOUD, column: COLUMN, tiers: TIERS, weeping: WEEPING };

/** Whether the `i`th of a crown's `count` pads is left in a state: a wilting crown has thinned, a withered one is gone but for scraps on a single stem. */
function padKept(habit: Habit, health: TreeHealth, count: number, i: number): boolean {
  const stem = habit === 'tiers' || habit === 'column';
  if (health === 'withered') return stem && i % 3 === 0;
  if (health === 'wilting' && !stem) return i % 3 !== 1 || count < 5;
  return true;
}

/** Whether a kind has the swing at a stage: a full-grown broad-crowned tree with a bough long and low enough. */
function swingsAt(habit: Habit, stage: TreeStage): boolean {
  return stage === 6 && (habit === 'dome' || habit === 'cloud');
}

/**
 * A grown tree's wood by habit: a trunk rising out of the mound at its foot, roots spreading from under the mound, and
 * boughs up to the crown masses; on a great broad-crowned tree, the long low swing arm reaching past the crown's edge,
 * as in the owner's reference.
 */
function timberFor(habit: Habit, stand: Stand, stage: Grown, rand: Rand): Timber {
  const g = stand.girth;
  const cy = GROUND - stand.crownY;
  const limbs: Timber['limbs'] = [];
  const roots: Timber['roots'] = [];
  // Its roots: one out along the ground to each side, and on an old tree two more behind them, going back into the ground.
  const spread = (far: number, back: boolean): void => {
    if (back) {
      roots.push({ line: [[MID - g * 0.3, GROUND - g * 0.3], [MID - far * 0.56, GROUND - 1.4 - g * 0.06], [MID - far * 0.84, GROUND - 0.2]], widths: [g * 0.3, g * 0.18, g * 0.08] });
      roots.push({ line: [[MID + g * 0.3, GROUND - g * 0.3], [MID + far * 0.58, GROUND - 1.2 - g * 0.06], [MID + far * 0.88, GROUND]], widths: [g * 0.3, g * 0.18, g * 0.08] });
    }
    roots.push({ line: [[MID - g * 0.42, GROUND - g * 0.14], [MID - far * 0.7, GROUND + 1.6], [MID - far * 1.0, GROUND + 3.8]], widths: [g * 0.42, g * 0.24, g * 0.1] });
    roots.push({ line: [[MID + g * 0.42, GROUND - g * 0.14], [MID + far * 0.72, GROUND + 1.8], [MID + far * 1.04, GROUND + 4]], widths: [g * 0.42, g * 0.24, g * 0.1] });
  };
  if (habit === 'column') {
    // One straight stem up through the whole crown, and a twig to each side at every crown mass, shorter toward the tip.
    const top: Pt = [MID, cy - stand.half * 1.9];
    limbs.push({ part: 'trunk', line: [[MID, GROUND + 1.6], [MID + 0.3, GROUND - stand.trunk * 0.5], [MID, GROUND - stand.trunk], top], widths: [g * 1.4, g * 0.96, g * 0.84, g * 0.3] });
    if (stage >= 4) spread(g * 1.3, stage >= 5);
    stand.puffs.forEach(([, y, r, , squash], i) => {
      const at = cy + y * stand.half * 0.94;
      if (at > GROUND - stand.trunk * 0.7) return;
      const reach = r * stand.half * 0.74;
      const rise = reach * (squash === undefined ? 0.5 : 0.16);
      for (const side of i % 2 === 0 ? [-1, 1] : [1, -1]) {
        limbs.push({ part: 'bough', line: [[MID, at + 1], [MID + side * reach * 0.5, at - rise * 0.4], [MID + side * reach, at - rise]], widths: [g * 0.3, g * 0.2, g * 0.1] });
      }
    });
    return { limbs, roots, under: { y: GROUND - stand.trunk + g * 0.2, reach: stand.half * 1.2 } };
  }
  if (habit === 'tiers') {
    // A trunk leaning one way and back as it rises to the crown pad, tapering all the way.
    const lean = g * 0.55;
    // The first near pad is the crown pad on top.
    const crown = stand.puffs.find((m) => m[3] === 2) ?? [0, -1, 0.3, 2];
    const top: Pt = [MID + crown[0] * stand.half, cy + crown[1] * stand.half * 0.94];
    const line: Pt[] = [[MID, GROUND + 1.6], [MID, GROUND - stand.trunk * 0.3], [MID + lean, GROUND - stand.trunk * 1.1], [MID - lean * 0.6, (GROUND - stand.trunk + top[1]) / 2 + 2], top];
    limbs.push({ part: 'trunk', line, widths: [g * 1.36, g * 1.06, g * 0.84, g * 0.56, g * 0.22] });
    if (stage >= 4) spread(g * 1.3, stage >= 5);
    // A bough out to each pad on its own side, leaving the trunk a little below it and rising into it.
    const along = (y: number): number => {
      for (let i = 0; i < line.length - 1; i++) {
        const [a, b] = [line[i] as Pt, line[i + 1] as Pt];
        if (y <= a[1] && y >= b[1]) return a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1] || 1);
      }
      return MID;
    };
    for (const [x, y, r, near] of stand.puffs) {
      if (near === 0 || Math.abs(x) < 0.1) continue;
      const end: Pt = [MID + x * stand.half * 0.8, cy + y * stand.half * 0.94 + 1];
      const from: Pt = [along(end[1] + 4), end[1] + 4];
      limbs.push({ part: 'bough', line: [from, [from[0] + (end[0] - from[0]) * 0.5, from[1] - 0.6 + r * 0.4], end], widths: [g * 0.42, g * 0.28, g * 0.14] });
    }
    return { limbs, roots, under: { y: GROUND - stand.trunk + g * 0.2, reach: stand.half * 1.2 } };
  }
  // A trunk that winds as it rises (more on a blossom tree), flaring at its foot and forking under its crown.
  const sway = (rand() > 0.5 ? 1 : -1) * g * (habit === 'cloud' ? 0.5 : 0.22);
  const fork: Pt = [MID + sway * 0.1, GROUND - stand.trunk];
  // It leaves the ground straight up, so its foot is level under the grass in front, and only then winds.
  limbs.push({
    part: 'trunk',
    line: [[MID, GROUND + 1.6], [MID, GROUND - stand.trunk * 0.1], [MID + sway, GROUND - stand.trunk * 0.32], [MID - sway * 0.5, GROUND - stand.trunk * 0.7], fork],
    widths: [g * 1.34, g * 1.12, g * 0.92, g * 0.8, g * 0.94],
  });
  if (stage >= 4) spread(g * (stage === 6 ? 1.5 : stage === 5 ? 1.38 : 1.22), stage >= 5);
  // Its boughs: out from the fork, then up to the crown's masses.
  const arms: readonly (readonly [number, number, number])[] =
    stage === 3 ? [[-0.36, 0.1, 0.5], [0.34, 0.06, 0.5], [0.02, -0.22, 0.44]] : stage === 4 ? [[-0.52, 0.02, 0.58], [0.5, -0.02, 0.58], [0.02, -0.3, 0.5]] : [[-0.58, -0.02, 0.64], [0.58, -0.06, 0.62], [0.04, -0.34, 0.54], [-0.24, -0.3, 0.4], [0.3, -0.26, 0.4]];
  arms.forEach(([ax, ay, k], i) => {
    const end: Pt = [MID + ax * stand.half, cy + ay * stand.half];
    const from: Pt = [fork[0] + ax * g * 0.5, fork[1] + g * 0.56];
    const mid: Pt = [from[0] + (end[0] - from[0]) * 0.56, from[1] + (end[1] - from[1]) * 0.3];
    const w = g * k;
    limbs.push({ part: 'bough', line: [from, mid, end], widths: [w, w * 0.68, w * 0.34] });
    if (stage >= 4 && i < 2) {
      // A twig off each main bough, out under the crown's edge, ending in the air.
      const out: Pt = [MID + ax * stand.half * 1.46, cy + stand.half * (0.34 + i * 0.04)];
      limbs.push({ part: 'twig', line: [mid, [(mid[0] + out[0]) / 2, (mid[1] + out[1]) / 2 + stand.half * 0.06], out], widths: [w * 0.34, w * 0.24, w * 0.12] });
    }
  });
  if (!swingsAt(habit, stage)) return { limbs, roots, under: { y: fork[1] - g * 0.1, reach: stand.half * 0.62 } };
  // The swing arm: out of the trunk's right side low under the crown, level past the crown's edge, rising a little at its end.
  const h = stand.half;
  const y0 = GROUND - stand.trunk * 0.6;
  const arm: Pt[] = [[MID - sway * 0.3 + g * 0.2, y0 + g * 0.1], [MID + h * 0.3, y0 - 4.2], [MID + h * 0.62, y0 - 6], [MID + h * 0.86, y0 - 6.6], [MID + h * 0.98, y0 - 8.6]];
  limbs.push({ part: 'arm', line: arm, widths: [g * 0.5, g * 0.3, g * 0.2, g * 0.15, g * 0.08] });
  // Its ropes are tied where it runs level, a seat's width apart.
  const level = (x: number): Pt => [x, y0 - 6 - ((x - (MID + h * 0.62)) / (h * 0.24)) * 0.6 + 0.2];
  const ties: readonly [Pt, Pt] = [level(MID + h * 0.5), level(MID + h * 0.74)];
  return { limbs, roots, under: { y: fork[1] - g * 0.1, reach: h * 0.62 }, swing: { ties, seat: GROUND - 11.5 } };
}

/**
 * A tree's roots on the ground layer, spreading from under the mound at the trunk's foot, shaded below and lit on top.
 * They are separate from the trunk because they do not move; the trunk sways above them and the mound hides the join.
 */
function drawRoots(roots: Timber['roots'], wood: Wood): string {
  if (roots.length === 0) return '';
  const [, shade, base, light] = wood;
  // One path per colour for all the roots, as one piece of wood: back roots first, then the side ones.
  const each = (d: (r: Timber['roots'][number]) => string): string => roots.map(d).join('');
  return (
    path(each((r) => limb(r.line, r.widths)), base) +
    path(each((r) => limb(moved(r.line, [], r.widths.map((w) => w * 0.2)), r.widths.map((w) => w * 0.42))), shade) +
    path(each((r) => limb(moved(r.line, [], r.widths.map((w) => -w * 0.22)), r.widths.map((w) => w * 0.16))), mix(base, light, 0.5))
  );
}

/**
 * The small grassy hill a grown tree stands on, as in the owner's reference: a soft hump lit on its upper left with the
 * roots over it (`back`, on the ground layer), and its near slope with blades along the edge (`near`, the front layer),
 * which covers the foot of the trunk and roots so the trunk rises out of the hill and sways behind its edge. Under snow
 * it is a drift without blades.
 */
function footHill(kind: Kind, health: TreeHealth, girth: number, rand: Rand): { back: string; near: string } {
  const [g0, g1] = grassOf(kind, health);
  const body = mix(g0, g1, 0.38);
  const s = STATE[health];
  const [x, g] = [MID, GROUND];
  const w = Math.max(7, girth * 1.75);
  const h = 2.2 + girth * 0.14;
  let back = path(`M${n(x - w)} ${n(g + 5)}C${n(x - w * 0.72)} ${n(g - h * 0.7)} ${n(x - w * 0.34)} ${n(g - h)} ${n(x)} ${n(g - h)}C${n(x + w * 0.36)} ${n(g - h)} ${n(x + w * 0.74)} ${n(g - h * 0.66)} ${n(x + w)} ${n(g + 5)}C${n(x + w * 0.5)} ${n(g + 6.4)} ${n(x - w * 0.5)} ${n(g + 6.4)} ${n(x - w)} ${n(g + 5)}Z`, body);
  back += path(`M${n(x - w * 0.82)} ${n(g + 2.4)}C${n(x - w * 0.66)} ${n(g - h * 0.6)} ${n(x - w * 0.3)} ${n(g - h * 0.94)} ${n(x - w * 0.02)} ${n(g - h * 0.95)}C${n(x + w * 0.2)} ${n(g - h * 0.95)} ${n(x - w * 0.06)} ${n(g - h * 0.3)} ${n(x - w * 0.34)} ${n(g - h * 0.1)}C${n(x - w * 0.56)} ${n(g + h * 0.1)} ${n(x - w * 0.72)} ${n(g + 1.4)} ${n(x - w * 0.82)} ${n(g + 2.4)}Z`, g1, ' opacity="0.7"');
  back += path(`M${n(x + w * 0.2)} ${n(g + 5.8)}C${n(x + w * 0.54)} ${n(g + 5.6)} ${n(x + w * 0.86)} ${n(g + 4.6)} ${n(x + w * 0.97)} ${n(g + 4)}C${n(x + w * 0.84)} ${n(g + 1.4)} ${n(x + w * 0.56)} ${n(g + 3.4)} ${n(x + w * 0.2)} ${n(g + 5.8)}Z`, g0, ' opacity="0.6"');
  // The near slope: a fringe of grass across the trunk's foot, thick enough to hide where wood meets ground.
  const v = girth * 0.86 + 1.4;
  const snow = kind.studio?.snow === true;
  let near = snow ? ellipse(x, g + 1.6, v, 2.2, body) : '';
  if (snow) return { back, near };
  // Three blades to a tuft, as in `tuft`, one path per colour.
  const count = Math.max(5, Math.round(v / 1.5));
  const blades: [string, string, string] = ['', '', ''];
  for (let i = 0; i < count; i++) {
    const u = i / (count - 1) - 0.5;
    const lean = s.droop * 5 * (u < 0 ? -1 : 1) + u * 30;
    const [bx, by, bh] = [x + u * v * 2, g + 2.2 + u * u * 2.4 + (i % 2) * 0.5, 2.4 + rand() * 1.6];
    blades[i % 2] += dabFrom([bx, by], -122 + lean, bh * 0.76, bh * 0.28);
    blades[2] += dabFrom([bx, by], -90 + lean, bh, bh * 0.3) + dabFrom([bx, by], -58 + lean, bh * 0.8, bh * 0.28);
  }
  near += path(blades[0], body) + path(blades[1], g0) + path(blades[2], g1);
  return { back, near };
}

/** A rope's colours: shade, body and the light along it. */
const ROPE = ['#86663a', '#c8a266', '#ecd39c'] as const;
/** The seat's wood: shade, face and lit edge. */
const PLANK = ['#7a4421', '#a8652f', '#dc9a5c'] as const;

/**
 * The swing, traced from the owner's reference: a wooden seat on two ropes from the great tree's long arm. It is its
 * own layer (its knots are on the tree's), so an app can move it in the breeze a little after the crown (`TREE_SWING`);
 * the two ropes keep the seat level. In winter it has snow on it.
 */
function drawSwing(swing: NonNullable<Timber['swing']>, snow: boolean): string {
  const [a, b] = swing.ties;
  const y = swing.seat;
  let out = '';
  for (const [x, top] of [a, b]) out += path(limb([[x, top + 0.4], [x, y + 0.6]], [1.3, 1.3]), ROPE[1]) + path(limb([[x + 0.34, top + 0.6], [x + 0.34, y + 0.4]], [0.44, 0.44]), ROPE[0], ' opacity="0.75"');
  const [x0, x1] = [a[0] - 3.6, b[0] + 3.6];
  const [t, d] = [y - 1.1, y + 2.9];
  const r = 1.1;
  out += path(`M${n(x0 + r)} ${n(t)}H${n(x1 - r)}Q${n(x1)} ${n(t)} ${n(x1)} ${n(t + r)}V${n(d - r)}Q${n(x1)} ${n(d)} ${n(x1 - r)} ${n(d)}H${n(x0 + r)}Q${n(x0)} ${n(d)} ${n(x0)} ${n(d - r)}V${n(t + r)}Q${n(x0)} ${n(t)} ${n(x0 + r)} ${n(t)}Z`, PLANK[1]);
  out += path(`M${n(x0 + r)} ${n(t)}H${n(x1 - r)}Q${n(x1)} ${n(t)} ${n(x1)} ${n(t + r * 0.8)}H${n(x0)}Q${n(x0)} ${n(t)} ${n(x0 + r)} ${n(t)}Z`, PLANK[2]);
  out += path(`M${n(x0)} ${n(d - 0.9)}H${n(x1)}V${n(d - r)}Q${n(x1)} ${n(d)} ${n(x1 - r)} ${n(d)}H${n(x0 + r)}Q${n(x0)} ${n(d)} ${n(x0)} ${n(d - r)}Z`, PLANK[0]);
  // The rope round each end of the seat.
  for (const [x] of [a, b]) out += ellipse(x, y + 0.8, 1.15, 2.1, ROPE[1]) + ellipse(x - 0.36, y + 0.3, 0.36, 0.95, ROPE[2], ' opacity="0.8"');
  if (snow) out += path(`M${n(x0 + 0.4)} ${n(t + 0.2)}C${n(x0 + 1)} ${n(t - 1.6)} ${n(x1 - 1)} ${n(t - 1.8)} ${n(x1 - 0.4)} ${n(t + 0.2)}Z`, '#ffffff');
  return out;
}

/** The ropes' knots round the swing arm, on the tree's own layer since they move with the arm. */
function swingKnots(swing: NonNullable<Timber['swing']>, girth: number): string {
  let out = '';
  for (const [x, y] of swing.ties) {
    const w = girth * 0.18;
    out += path(limb([[x - 0.9, y - w - 0.4], [x + 0.5, y + w + 0.2]], [1.2, 1.2]), ROPE[1]) + path(limb([[x + 0.4, y - w - 0.4], [x + 1.6, y + w + 0.2]], [1, 1]), ROPE[0]);
  }
  return out;
}

/** The ends of a tree's boughs, where its last leaves hang once it has withered. */
function boughEnds(timber: Timber): Pt[] {
  return timber.limbs.map((l) => l.line[l.line.length - 1] as Pt);
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
 * What a kind bears, over its crown: acorns, fruit, flowers, berries, cones, ribbons or lights, more on the great tree
 * than the grown one. A wilting tree has let them fall.
 */
function drawBears(dr: Drawing, kind: Kind, stage: Grown, puffs: readonly Puff[], stand: Stand, cy: number, rand: Rand): { on: string; down: string } {
  if (stage < 5 || puffs.length === 0) return { on: '', down: '' };
  const near = puffs.filter((p) => p.near !== 0);
  // One per near mass in turn, at a different place each time; `low` keeps to the underside, where fruit hangs.
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
      // In flower first: the pomegranate's red bells.
      for (const [x, y] of spots(6, false)) out += blossomAt(x, y, 2.6, '#f2542d', '#ffc94a', rand() * 72);
      return { on: out, down };
    }
    for (const [x, y] of spots(8, true)) {
      const r = 2.3 + rand() * 0.6;
      // Its crown, underneath as it hangs.
      for (const k of [-1, 0, 1]) out += path(leafAt([x + k * r * 0.26, y + r * 0.8], 90 + k * 26, r * 0.6, r * 0.2), kind.fruit[1]);
      out += fruitAt(x, y, r, kind.fruit);
    }
  } else if (kind.bears === 'blossom') {
    // Its crown is already its blossom (`drawPuff`), so what it bears is the petals it lets go, falling and lying on the grass.
    down += drawFallen([kind.leaves[4], kind.leaves[5], kind.fruit[0]], more ? 12 : 6, stand.ground, cy, rand);
  } else if (kind.bears === 'berries') {
    if (!more) return { on: '', down: '' };
    for (const [x, y] of spots(11, true)) {
      const ripe = rand() > 0.3;
      const c: readonly [string, string, string] = ripe ? kind.fruit : ['#d8375a', '#a11f45', '#ff9db0'];
      // A mulberry: a small bunch of beads.
      for (const [dx, dy] of [[0, 0], [-0.9, 1.1], [0.9, 1.1], [0, 2.1], [-0.6, 3.1], [0.6, 3.1]] as const) out += ellipse(x + dx, y + dy, 1, 1, i_shade(c, dx));
      out += ellipse(x - 0.4, y + 0.4, 0.4, 0.4, c[2]);
      out += path(limb([[x, y - 0.6], [x + 0.3, y - 2.2]], [0.5, 0.4]), kind.leaves[1]);
    }
  } else if (kind.bears === 'cones') {
    if (!more) return { on: '', down: '' };
    for (const p of puffs.filter((m) => m.near !== 0).slice(1, 3)) {
      const x = p.x + (rand() - 0.5) * p.r * 0.9;
      const y = p.y + p.r * (p.squash ?? 0.9) * 0.62;
      out += ellipse(x, y + 1.4, 1.1, 1.8, kind.fruit[1]) + ellipse(x - 0.25, y + 1.15, 0.8, 1.5, kind.fruit[0]) + ellipse(x - 0.4, y + 0.6, 0.3, 0.5, kind.fruit[2]);
    }
  } else if (kind.bears === 'leaves') {
    // An autumn tree is always letting its leaves go.
    down += drawFallen([kind.leaves[2], kind.leaves[3], kind.leaves[4], kind.leaves[1]], more ? 14 : 8, stand.ground, cy, rand);
  } else if (kind.bears === 'ribbons') {
    // A wish on each ribbon, tied to the crown's lower boughs and left hanging.
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
    // Small lights in the dark of it, each in its own glow, and a star or two.
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

/**
 * One weeping spray: a twig leaving the crown outward and ending straight down, thin at its start, full of leaves in the
 * middle and pointed at its tip. Its narrow leaves lie nearly along it with their tips standing out, the left ones lit.
 * `bare` draws the twig alone, for a withered tree.
 */
function spray(from: Pt, tip: Pt, width: number, body: string, lit: string, rand: Rand, bare: boolean): string {
  // Out first, then down, overshooting its tip a little: the curve is pulled toward a point above and outside it.
  const side = Math.sign(tip[0] - from[0]);
  const ctrl: Pt = [tip[0] + side * Math.abs(tip[0] - from[0]) * 0.34, from[1] - Math.abs(tip[0] - from[0]) * 0.28];
  const steps = Math.max(5, Math.round(Math.hypot(tip[0] - from[0], tip[1] - from[1]) / 6.5));
  const spine: Pt[] = Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const [a, b, c] = [(1 - t) * (1 - t), 2 * (1 - t) * t, t * t];
    return [a * from[0] + b * ctrl[0] + c * tip[0], a * from[1] + b * ctrl[1] + c * tip[1]] as Pt;
  });
  if (bare) return path(limb(spine, spine.map((_, i) => 1.2 - (i / steps) * 0.9)), body);
  const widths = spine.map((_, i) => {
    const t = i / steps;
    return width * 0.6 * (0.34 + Math.sin(Math.PI * Math.min(1, t * 1.1)) * 0.66) * (t > 0.86 ? 0.5 : 1);
  });
  let left = '';
  let right = '';
  for (let i = 1; i < steps; i++) {
    const [x, y] = spine[i] as Pt;
    const [px, py] = spine[i - 1] as Pt;
    const along = (Math.atan2(y - py, x - px) * 180) / Math.PI;
    // Longer where the spray is full, shorter toward its tip.
    const len = width * (1.3 - (i / steps) * 0.5) * (0.9 + rand() * 0.3);
    const w = (widths[i] as number) * 0.34;
    const l = Math.hypot(x - px, y - py) || 1;
    // To the twig's own left and right, a little off it.
    const [nx, ny] = [(y - py) / l, -(x - px) / l];
    const [ax, ay] = nx < 0 ? [nx, ny] : [-nx, -ny];
    // Standing off the twig where it is full and lying closer toward its tip, so it ends in a tuft, not a tail.
    const off = 28 - (i / steps) * 16 + rand() * 8;
    left += dabFrom([x + ax * w, y + ay * w], along + (nx < 0 ? -1 : 1) * off, len, len * 0.2);
    right += dabFrom([x - ax * w, y - ay * w], along + (nx < 0 ? 1 : -1) * off, len, len * 0.2);
  }
  const end = spine[steps - 1] as Pt;
  right += dabFrom(end, 90 + (rand() - 0.5) * 16, width * 1.25, width * 0.22);
  // The twig and its shaded-side leaves share a colour, so one path.
  return path(limb(spine, widths) + right, body) + path(left, lit);
}

/** A tier of a weeping tree's sprays: count, where they leave the crown, where their tips hang, thickness and colours. */
interface Tier {
  count: number;
  /** Where a spray starts and where its tip hangs, for `u` from -1 (far left) to 1 (far right). */
  from: (u: number) => Pt;
  tip: (u: number) => Pt;
  width: number;
  tones: readonly (readonly [string, string])[];
  /** The sprays nearest the middle are left out, so the trunk shows between them. */
  part: number;
}

/**
 * The sprays that make up most of a weeping crown: a dark far tier behind the trunk, hanging lowest; a middle tier from
 * under the cap down to the grass at the sides; and a lit near tier from the top to halfway down. Thirsty they hang
 * closer in, wilting they are shorter, and withered only a few bare twigs remain.
 */
function drawSprays(stand: Stand, cy: number, ramp: Ramp, rand: Rand, layer: 'far' | 'middle' | 'near', health: TreeHealth, stage: Grown): string {
  const s = STATE[health];
  const h = stand.half;
  const more = stage - 3;
  const floor = GROUND - 3;
  // How far out a tip hangs: fully when fresh, drawn in as the tree dries.
  const out = 1 - s.droop * 0.03;
  const tiers: Record<typeof layer, Tier> = {
    far: {
      count: 4 + more * 2,
      from: (u) => [MID + u * h * 0.4, cy - h * 0.1],
      tip: (u) => [MID + u * h * 0.84 * out, floor - (1 - Math.abs(u)) ** 2 * h * 0.2],
      width: h * 0.135,
      tones: [[ramp[0], ramp[1]], [ramp[1], ramp[1]]],
      part: 0,
    },
    middle: {
      count: 5 + more * 2,
      from: (u) => [MID + u * h * 0.44, cy - h * 0.3 * (1 - u * u)],
      tip: (u) => [MID + u * h * 0.9 * out, floor - 3 - (1 - Math.abs(u)) ** 1.5 * (floor - 3 - (cy + h * 0.5))],
      width: h * 0.12,
      tones: [[ramp[2], ramp[3]], [ramp[1], ramp[2]]],
      part: 0.14,
    },
    near: {
      count: 5 + more * 2,
      from: (u) => [MID + u * h * 0.2, cy - h * (0.5 - Math.abs(u) * 0.08)],
      tip: (u) => [MID + u * h * 0.8 * out, cy + h * (0.04 + Math.abs(u) * 0.74)],
      width: h * 0.11,
      tones: [[ramp[3], ramp[5]], [ramp[2], ramp[4]], [ramp[3], ramp[4]]],
      part: 0,
    },
  };
  const tier = tiers[layer];
  const bare = health === 'withered';
  let drawn = '';
  // From the outside in, so sprays nearer the middle lie over their neighbours.
  const order = Array.from({ length: tier.count }, (_, i) => i).sort((a, b) => Math.abs(b - (tier.count - 1) / 2) - Math.abs(a - (tier.count - 1) / 2));
  for (const i of order) {
    const u = tier.count === 1 ? 0 : (i / (tier.count - 1)) * 2 - 1;
    const jitter: Pt = [(rand() - 0.5) * h * 0.07, (rand() - 0.5) * h * 0.1];
    const keep = rand();
    if (Math.abs(u) < tier.part) continue;
    // A withered tree keeps a twig here and there; a wilting one has let some sprays go.
    if (bare ? layer !== 'middle' || i % 2 === 1 : health === 'wilting' && keep < 0.22) continue;
    const from = tier.from(u);
    const full = tier.tip(u);
    const reach = bare ? 0.62 : s.full;
    const tip: Pt = [from[0] + (full[0] - from[0]) * (0.5 + reach * 0.5) + jitter[0], Math.min(floor, from[1] + (full[1] - from[1]) * reach + jitter[1])];
    const [body, lit] = tier.tones[i % tier.tones.length] as readonly [string, string];
    drawn += spray(from, tip, tier.width, body, lit, rand, bare);
  }
  return drawn;
}

/**
 * A drawing's layers: the ground, which stays still; the plant, which moves (sway, the start when watered); a grown
 * tree's crown, its nearer leaves, which moves with the plant and stirs on its own; the swing on a great tree, which
 * moves with the plant and on its own; and the front, which stays still with the ground but lies over the plant's foot
 * (earth over a seed, the mound a tree rises from) so what moves is seen to be in the ground.
 */
interface Layers {
  ground: string;
  plant: string;
  crown: string;
  swing: string;
  front: string;
}

/** The drawings each layer is made in: one shared drawing for the whole picture, or one per layer drawn alone. */
interface Drawings {
  ground: Drawing;
  plant: Drawing;
  crown: Drawing;
  swing: Drawing;
  front: Drawing;
}

/** A stand adjusted for a kind's build: crown wider or narrower, higher or lower, trunk thicker. */
function built(stand: Stand, build: Kind['build']): Stand {
  if (!build) return stand;
  return { ...stand, half: stand.half * (build.spread ?? 1), crownY: stand.crownY * (build.lift ?? 1), girth: stand.girth * (build.girth ?? 1) };
}

/**
 * A grown tree: its island, wood and crown in its current state. The crown is layered: its far pads and dark inside
 * behind the wood, so the fork and boughs show against them, and its nearer pads over the bough ends, in a layer of
 * their own.
 */
function drawGrown(drs: Drawings, kind: Kind, species: TreeSpecies, stage: Grown, health: TreeHealth, ramp: Ramp, rand: Rand): Layers {
  const dr = drs.plant;
  const stand = built(STANDS[kind.habit][stage], kind.build);
  const s = STATE[health];
  const cy = GROUND - stand.crownY + s.droop;
  let ground = drawIsland(drs.ground, kind, health, stand.ground, stand.depth, rand, stand.tufts, stand.flowers, stand.crownY + stand.half * 0.9);
  ground += drawDressing(drs.ground, kind, species, stage, health, stand.ground, rand);
  let plant = '';
  const wood = kind.wood.map((c) => mix(c, '#8a8078', s.dead * 0.45)) as unknown as Wood;
  const timber = timberFor(kind.habit, stand, stage, rand);
  const hill = footHill(kind, health, stand.girth, rand);
  ground += hill.back + drawRoots(timber.roots, wood);
  const blossom = kind.bears === 'blossom';
  const fol: Foliage = {
    mark: blossom ? 'petal' : kind.habit === 'tiers' ? 'needle' : 'leaf',
    ...(kind.sprig === undefined ? {} : { sprig: kind.sprig }),
    ...(blossom ? { flower: [mix(kind.leaves[1], kind.fruit[2], 0.25), kind.fruit[2]] as const } : {}),
  };
  const stem = kind.habit === 'tiers' || kind.habit === 'column';
  const kept = (i: number): boolean => padKept(kind.habit, health, stand.puffs.length, i);
  // The colours a pad comes in: the kind's own or one of its others, in turn.
  const ramps: Ramp[] = [ramp, ...(kind.hues ?? []).map((h) => fared(h, health, kind.turns))];
  const puffs: (Puff & { ramp: Ramp; seed: number })[] = stand.puffs.flatMap(([x, y, r, near, squash], i) =>
    kept(i)
      ? [
          {
            x: MID + x * stand.half,
            y: cy + y * stand.half * 0.94,
            r: r * stand.half * (health === 'withered' ? 0.56 : s.full),
            near,
            ...(squash === undefined ? {} : { squash }),
            ramp: ramps[(i * 2 + (i % 3 === 0 ? 1 : 0)) % ramps.length] as Ramp,
            seed: i,
          },
        ]
      : [],
  );
  // How its leaves are painted: each pad from its own seed, so a pad keeps its leaves whatever the tree's state or season.
  const brush: Brush = {
    len: LEAF_LEN[stage] * (kind.habit === 'column' ? 0.84 : 1),
    plump: fol.mark === 'petal' ? 0.78 : fol.mark === 'needle' ? 0.42 : kind.edge === 'round' ? 0.6 : 0.48,
    lie: kind.habit === 'tiers' ? 'level' : kind.habit === 'column' ? 'rise' : 'fan',
    keep: health === 'fresh' ? 1 : health === 'thirsty' ? 0.93 : health === 'wilting' ? 0.72 : 0.5,
    droop: s.droop / 9,
    dull: health === 'wilting' || health === 'withered',
    snow: kind.studio?.snow === true,
  };
  const pad = (p: Puff & { ramp: Ramp; seed: number }): string => drawPad(p, p.ramp, seeded(`pad:${species}:${stage}:${p.seed}`), fol, brush);
  const weeping = kind.habit === 'weeping';
  const forked = !stem && !weeping;
  const bare = health === 'withered';
  const dark = tint(ramp[0], -0.08);
  // The crown's nearer pads, and what hangs in them, are a layer of their own over the wood, to stir in the breeze.
  let crown = '';
  // Far pads lie behind the wood, so trunk and boughs show against them; the rest over it.
  const back = weeping ? [] : puffs.filter((p) => p.near === 0);
  const near = weeping ? puffs : puffs.filter((p) => p.near !== 0);
  if (weeping) plant += drawSprays(stand, cy, ramp, rand, 'far', health, stage);
  if (!bare || stem) for (const p of back) plant += pad(p);
  if (forked && (health === 'fresh' || health === 'thirsty')) {
    // The crown's dark inside, which the fork shows against; a thinned crown has none left to show.
    const h = stand.half * s.full;
    plant += path(puffPath(MID, cy + h * 0.08, h * 0.76, h * 0.4, rand, 13, 0.7, kind.edge === 'point' ? 0.5 : 0), dark);
  }
  plant += drawWood(dr, timber, wood, rand, stage);
  if (timber.swing) plant += swingKnots(timber.swing, stand.girth);
  if (bare && !stem) {
    // Bare except for a last leaf or two at the bough ends.
    boughEnds(timber).forEach(([x, y], i) => {
      // The twigs its leaves grew on, so a bough does not end like a post.
      const out = x < MID ? -1 : 1;
      const t = 2.6 + stage * 0.5;
      plant += path(limb([[x, y + 0.4], [x + out * t * 0.5, y - t * 0.7], [x + out * t * 0.7, y - t * 1.5]], [1.1, 0.8, 0.4]) + limb([[x, y + 0.4], [x - out * t * 0.5, y - t * 0.8], [x - out * t * 0.3, y - t * 1.4]], [1, 0.7, 0.4]), wood[2]);
      if (i % 2 === 1) return;
      const len = 3 + rand() * 1.6;
      plant += path(leafAt([x, y], 70 + rand() * 50, len, len * 0.42), ramp[2]) + (i % 4 === 0 ? path(leafAt([x, y], 120 + rand() * 30, len * 0.8, len * 0.4), ramp[3]) : '');
    });
    // A weeping tree keeps the twigs its sprays hung on.
    if (weeping) plant += drawSprays(stand, cy, [wood[1], wood[1], wood[1], wood[2], wood[2], wood[2]], rand, 'middle', health, stage);
  } else {
    if (weeping) {
      // The fountain's shaded inside, which the sprays hang in front of, and its round top, which they flow over.
      const h = stand.half * s.full;
      plant += path(puffPath(MID, cy - h * 0.12, h * 0.62, h * 0.3, rand, 11, 0.6), ramp[1]);
      plant += drawSprays(stand, cy, ramp, rand, 'middle', health, stage);
      for (const p of near) crown += pad(p);
    } else {
      // The leaves at the ends of the twigs reaching out under the crown.
      if (!bare) {
        for (const l of timber.limbs) {
          if (l.part !== 'twig' && l.part !== 'arm') continue;
          const [x, y] = l.line[l.line.length - 1] as Pt;
          const away = x < MID ? 180 : 0;
          const len = 3.4 + stage * 0.36;
          const hang = s.droop * 9 * (x < MID ? -1 : 1);
          plant += path(dabFrom([x, y], away - 34 + hang, len, len * 0.44), fol.sprig ?? ramp[3]) + path(dabFrom([x, y], away + 30 + hang, len * 0.9, len * 0.44), fol.sprig ? tint(fol.sprig, 0.25) : ramp[4]) + path(dabFrom([x, y], away + (x < MID ? 62 : -62) + hang, len * 0.7, len * 0.4), fol.sprig ?? ramp[2]);
        }
      }
      for (const p of near) crown += pad(p);
    }
    if (health === 'fresh' || health === 'thirsty') {
      const bears = drawBears(drs.crown, kind, stage, puffs, stand, cy, rand);
      crown += bears.on;
      ground += bears.down;
    }
  }
  if (weeping && !bare) crown += drawSprays(stand, cy, ramp, rand, 'near', health, stage);
  if (s.fallen > 0) ground += drawFallen([ramp[2], ramp[3], ramp[4]], Math.round(s.fallen * (0.5 + stage * 0.12)), stand.ground, cy, rand);
  // The swing, while the tree is well enough to be played under, and its shadow on the grass under the seat.
  let swing = '';
  if (timber.swing && (health === 'fresh' || health === 'thirsty')) {
    swing = drawSwing(timber.swing, kind.studio?.snow === true);
    const [a, b] = timber.swing.ties;
    ground += ellipse((a[0] + b[0]) / 2 + 1, GROUND + 3.4, (b[0] - a[0]) * 0.62, 1.3, '#1e2a4a', ' opacity="0.13"');
  }
  // The mound it rises out of and, on the great tree, a small red mushroom at its roots as in the owner's reference (the
  // pine and the night tree have their own).
  const g = stand.girth;
  let front = hill.near;
  if (stage === 6 && (health === 'fresh' || health === 'thirsty') && species !== 'kaj' && species !== 'sev') {
    // On whichever side of the trunk is clear of the kind's own ground dressing.
    const side = species === 'bi' || species === 'payiz' || species === 'miraz' ? 1 : -1;
    front += mushroom(MID + side * g * 1.2, GROUND + 4.2, 2.5, '#e0443a', '#fff4e4') + mushroom(MID + side * g * 1.2 - side * 3.6, GROUND + 4.8, 1.5, '#e8584c', '#fff4e4');
  }
  return { ground, plant, crown, swing, front };
}

// ─────────────────────────────────────────────────────────────── the tree

export interface TreeOptions {
  species: TreeSpecies;
  stage: TreeStage;
  health?: TreeHealth;
  /**
   * Which part to draw: the whole picture, or one layer: `ground` (still), `plant` (laid over the ground and moved: a sway,
   * the start when watered), `crown` (a grown tree's nearer leaves, over the plant, moved with it and stirring on their
   * own), `swing` (hangs from the plant and moves with it and on its own) or `front` (still, over the plant's foot). All
   * layers share the canvas, so stacked in that order they make the whole. `treeRig` says whether a tree has the last three.
   */
  part?: 'whole' | 'ground' | 'plant' | 'crown' | 'swing' | 'front';
  /**
   * The season to draw it in (`treeSeasonAt` gives today's): crown and ground as the season has them, standing on its
   * scene's floor (`treeStudioSvg`). Without one it stands on its floating island.
   */
  season?: TreeSeason;
  /** Size in points or CSS pixels; the drawing is square. */
  size?: number;
  /** The accessible label; empty where the text beside it says what it is. */
  title?: string;
  idPrefix?: string;
}

/**
 * The top of the plant at each stage, which is also where poured water lands, as shares of the picture's height from
 * the top. A seed lies low and a great tree fills the picture, each stage taller than the last (the shared tests check
 * every kind). Apps drop water to it, float a thirsty tree's thought bubble beside it, and grow each stage from one top
 * to the next (`treeGrowFrom`).
 */
export const TREE_TOP: readonly [number, number, number, number, number, number, number] = [0.64, 0.37, 0.33, 0.27, 0.21, 0.13, 0.07];
export const TREE_WATER_LANDS: readonly [number, number, number, number, number, number, number] = [0.73, 0.56, 0.5, 0.45, 0.4, 0.34, 0.3];

/** Where a plant stands, as shares of the canvas's width and height: the point a sway turns about. */
export const TREE_FOOT = { x: MID / 120, y: GROUND / 120 } as const;

/** A tree, as an SVG. */
export function treeSvg(opts: TreeOptions): string {
  const size = checkSize(opts.size, 240);
  const health = opts.health ?? 'fresh';
  const part = opts.part ?? 'whole';
  const kind = opts.season ? seasonal(KINDS[opts.species], opts.species, opts.season) : KINDS[opts.species];
  const prefix = prefixFor(opts.idPrefix, 'tree', opts.species, opts.stage, health, part, opts.season);
  // Layers are drawn alongside the whole picture so each comes out exactly as it is in the whole.
  const whole = new Drawing(prefix);
  const own = (key: string): Drawing => (part === 'whole' ? whole : new Drawing(`${prefix}${key}`));
  const drs: Drawings = { ground: own('g'), plant: own('p'), crown: own('c'), swing: own('s'), front: own('f') };
  const rand = seeded(`tree:${opts.species}:${opts.stage}`);
  const ramp = fared(kind.leaves, health, kind.turns);
  const layers =
    opts.stage === 0
      ? drawSeed(drs, kind, health, rand)
      : opts.stage === 1
        ? drawSprout(drs, kind, health, rand)
        : opts.stage === 2
          ? drawSapling(drs, kind, health, ramp, rand)
          : drawGrown(drs, kind, opts.species, opts.stage as Grown, health, ramp, rand);
  drs.ground.add(layers.ground);
  drs.plant.add(layers.plant);
  drs.crown.add(layers.crown);
  drs.swing.add(layers.swing);
  drs.front.add(layers.front);
  return (part === 'whole' ? whole : drs[part]).svg(size, opts.title ?? '');
}

/** What a tree has besides ground and plant: whether a front lies over its foot, and where its crown and swing move about. */
export interface TreeRig {
  /** Earth or a mound drawn over the plant's foot, which stays still with the ground. */
  front: boolean;
  /** The foot of a grown tree's crown, as shares of the picture's width and height: what its leaves stir about. */
  crown: { x: number; y: number } | null;
  /** The line the swing's ropes are tied on, as shares of the picture's width and height: what the ropes lean about. */
  swing: { x: number; y: number } | null;
}

/**
 * Which layers beyond ground and plant a tree has (`TreeOptions.part`), so an app lays only those: every tree but a
 * sapling has a front, a grown tree has a crown while it has leaves left, and a great broad-crowned tree has its swing
 * while it is well.
 */
export function treeRig(opts: { species: TreeSpecies; stage: TreeStage; health?: TreeHealth }): TreeRig {
  const health = opts.health ?? 'fresh';
  const habit = KINDS[opts.species].habit;
  const share = (v: number): number => Math.round((v / CANVAS) * 1000) / 1000;
  let crown: TreeRig['crown'] = null;
  if (opts.stage >= 3) {
    const stand = built(STANDS[habit][opts.stage as Grown], KINDS[opts.species].build);
    // A weeping crown is all its own until it withers; any other is its nearer pads, while some are left.
    const leaves = habit === 'weeping' ? health !== 'withered' : stand.puffs.some((m, i) => m[3] !== 0 && padKept(habit, health, stand.puffs.length, i));
    const cy = GROUND - stand.crownY;
    if (leaves) crown = { x: share(MID), y: share(habit === 'weeping' ? cy : cy + stand.half * 0.5) };
  }
  let swing: TreeRig['swing'] = null;
  if (swingsAt(habit, opts.stage) && (health === 'fresh' || health === 'thirsty')) {
    const stand = built(STANDS[habit][opts.stage as Grown], KINDS[opts.species].build);
    const timber = timberFor(habit, stand, opts.stage as Grown, seeded(`tree:${opts.species}:${opts.stage}`));
    const [a, b] = timber.swing!.ties;
    swing = { x: Math.round(((a[0] + b[0]) / 2 / CANVAS) * 1000) / 1000, y: Math.round(((a[1] + b[1]) / 2 / CANVAS) * 1000) / 1000 };
  }
  return { front: opts.stage !== 2, crown, swing };
}

/** Whether this build has art for a kind; a kind the server knows but this build does not is simply not drawn. */
export function hasTreeArt(species: string): species is TreeSpecies {
  return Object.hasOwn(KINDS, species);
}

/** A kind's own colour, for what an app draws round its tree: the light behind it, a chip, a bar. */
export function treeColour(species: TreeSpecies): string {
  return KINDS[species].leaves[3];
}

/** What the wind carries past a tree in a season, and its colours; the apps blow it away to the left. */
export interface TreeSeasonAir {
  air: 'petals' | 'leaves' | 'snow';
  colours: readonly [string, string, string];
}

/** A summer leaf blown in from elsewhere, for a tree with none of its own to lose. */
const SUMMER_LEAF = ['#4fae4a', '#79c95a', '#a6dd7a'] as const;

/**
 * What blows past a tree in a season, as in the owner's reference: blossom in spring, green leaves in summer, orange
 * in autumn, snow in winter. A grown deciduous tree loses its own leaves in its own colours; past a young tree or an
 * evergreen the wind brings the season's from elsewhere. A wilting tree has still air, but snow falls on every tree.
 */
export function treeSeasonAir(species: TreeSpecies, stage: TreeStage, health: TreeHealth, season: TreeSeason): TreeSeasonAir | null {
  if (season === 'winter') return { air: 'snow', colours: [SNOW[5], SNOW[4], SNOW[3]] };
  if (health === 'wilting' || health === 'withered') return null;
  const kind = KINDS[species];
  const own = stage >= 3 && kind.habit !== 'tiers' && kind.habit !== 'column' && species !== 'sev';
  const air = season === 'spring' ? 'petals' : 'leaves';
  // Blossom is pale, so spring's are a step deeper than the leaves to show on a blush wall.
  if (own) {
    const leaves = seasonal(kind, species, season).leaves;
    return { air, colours: season === 'spring' ? [leaves[1], leaves[2], leaves[3]] : [leaves[2], leaves[3], leaves[4]] };
  }
  if (season === 'spring') return { air, colours: [SPRING[1], SPRING[2], SPRING[3]] };
  if (season === 'autumn') return { air, colours: [AUTUMN[2], AUTUMN[3], AUTUMN[4]] };
  return { air, colours: SUMMER_LEAF };
}

// ─────────────────────────────────────────────────────────────────── water

/** Water's colours: deep, body, light, and the glint on it. */
const WATER = ['#1c6fd0', '#2f9bf0', '#8fd2ff', '#ffffff'] as const;

/** A water drop: what a lesson earns and a tree drinks. */
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

/** The watering can: body, rim, a handle behind and a spout with a rose to the left, as held to pour. Drawn level; an app tips it. */
export function wateringCanSvg(opts: { size?: number; title?: string; idPrefix?: string } = {}): string {
  const size = checkSize(opts.size, 96);
  const dr = new Drawing(prefixFor(opts.idPrefix, 'watering-can'));
  const [deep, shade, body, light] = ['#0f6f86', '#1794ad', '#2fbccd', '#8ee6ee'];
  // The handle, behind the body.
  dr.add(path(limb([[84, 56], [106, 54], [110, 74], [90, 90]], [7, 7, 7, 7]), shade));
  // The spout, and the rose at its end.
  const spout: Pt[] = [[44, 88], [28, 68], [15, 48]];
  dr.add(path(limb(spout, [13, 10, 8]), shade));
  dr.add(path(limb(moved(spout, [-1.6, -1.4, -1.2], [-1.6, -1.4, -1.2]), [5, 4, 3]), light));
  dr.add(ellipse(12.5, 44, 10.5, 5.4, deep, turned(-34, 12.5, 44)) + ellipse(11.6, 43, 9, 4.2, body, turned(-34, 11.6, 43)));
  for (const [x, y] of [[8.6, 45.6], [12, 42.8], [15.4, 40.4]] as const) dr.add(ellipse(x, y, 1, 1, deep));
  // The body, wider at its foot, lit down its left.
  const can = 'M40 50L36 100C36 104.4 41 108 62 108C83 108 88 104.4 88 100L84 50Z';
  const clip = dr.clip(can);
  dr.add(path(can, body));
  dr.add(`<g clip-path="url(#${clip})">${path('M70 44L92 44L94 112L72 112Z', shade)}${path('M42 44L52 44L49 112L38 112Z', light)}${ellipse(62, 106, 30, 6, deep, ' opacity="0.45"')}</g>`);
  // Its rim, and the water in it.
  dr.add(ellipse(62, 50, 23, 6.4, deep) + ellipse(62, 49.4, 20.4, 4.8, WATER[1]) + ellipse(56, 48.6, 8, 1.8, WATER[2]));
  return dr.svg(size, opts.title ?? '');
}
