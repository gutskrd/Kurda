/**
 * The village's life: what moves over the still scene, and how.
 *
 * Every moving thing is an actor — a tree of nodes, each a box on the canvas
 * (a root's in canvas units, a child's in its parent's units), an optional
 * sprite drawn in that box, and an optional looping motion. A motion is a
 * list of frames over one period: where the node has moved (x, y, in canvas
 * units), how far it has turned (r, degrees, about its origin), how it is
 * scaled (sx, sy) and how opaque it is (o). Frames are linear between one
 * another, already phased so every loop starts at 0 with no delay, and
 * every child shares its parent's clock only when it shares its period.
 *
 * Both apps play exactly these frames — the website as CSS keyframes, the
 * phone as native-driver interpolations of one value per node — so the deer
 * stops by the same apple on both, and nothing runs per frame in script. With
 * less motion asked for, each node is drawn still at its `still` pose: the
 * deer by the apple, the sheep grazing, the smoke a single puff, so the
 * scene is complete and quiet. An app moves only the actors near its view
 * (`kingdomActorReach` says how far each one goes).
 *
 * The cast: Hevalo the deer — the app's own drawing of him, his body, his
 * head, an ear and his eyes as layers — walking a loop down through the
 * village, out along the road and up the farm track and back, stopping to
 * look about, blinking, and happy when tapped; Hamo by the tea house and
 * Xezal by the school once they stand, idle and blinking (the course's own
 * drawings of them, unchanged); fat-tailed sheep at the camp and in their
 * fold, black goats on the hill and in theirs, a brown cow swishing her tail,
 * a donkey, all walking on legs that swing from the hip; hens pecking with
 * their chicks trailing; a cat asleep on a roof; the shepherd dog trotting the
 * road; bees at the hives; butterflies; swallows and pigeons; clouds, and
 * their shadows sliding over the land; smoke from the tenûr, the chimneys and
 * the camp's fire, its flame flickering; the waterfall falling and foaming,
 * light shimmering over the lake, a fish leaping now and then, the stream
 * running, the mill's wheel turning, the boat bobbing; gusts running over the
 * fields; poplars and the groves' trees swaying each in its own time; washing
 * and kilims stirring on their lines.
 */
import type { KingdomBuilding, KingdomLevel } from '../../games/kingdom/buildings.js';
import { villageFlock, villageHas, type VillageFeature } from '../../games/kingdom/growth.js';
import { characterArt } from '../../characters/index.js';
import { n, type Pt } from '../svg.js';
import { DAY, DUSK, FIGURE_HEIGHT, INK, Part, SHADOW, disc, inked, iso, oval, type Palette } from './pen.js';
import * as P from './props.js';
import { WATER_Z } from './land.js';
import { CREATURES, CREATURE_BOX, type CreatureSprite } from './creatures.js';
import { VILLAGER_BOX, VILLAGER_JOINTS, VILLAGER_LAYERS, VILLAGER_SPRITE_BOX, VILLAGER_TALL, isChild, showsLegs, type Villager, type VillagerSprite } from './villagers.js';
import { millWheel } from './farm.js';
import { SLAB } from './buildings.js';
import { BOAT, CAMP, DOVECOTE, FIELDS, FLOOR_Z, GROVE_TREES, HIVES, KILIMS, LAUNDRY, MILL, PENS, ROAD_POPLARS, STREAM, WATERFALL } from './valley.js';
import { laundryCloths } from './farm.js';

/** One moment of a node's loop. */
export interface KingdomFrame {
  /** share of the period, 0–1 */
  t: number;
  x: number;
  y: number;
  r: number;
  sx: number;
  sy: number;
  o: number;
}

/** A loop: its length and its frames, from t 0 to t 1 (the last the same as the first). */
export interface KingdomMotion {
  period: number;
  frames: KingdomFrame[];
}

/** The people's and the deer's layers: their own soft-lit drawings, not the village's ink. */
const FIGURE_SPRITES = [
  'deerBody',
  'deerCrown',
  'deerEar',
  'deerHead',
  'deerEyes',
  'deerBlink',
  'deerHappy',
  'hamo',
  'hamoEyes',
  'hamoBlink',
  'hamoFace',
  'xezo',
  'xezoEyes',
  'xezoBlink',
  'xezoFace',
] as const;
type FigureSprite = (typeof FIGURE_SPRITES)[number];

/** Everything a sprite can be. */
export type KingdomSprite =
  | 'cloud'
  | 'birds'
  | 'smoke'
  | 'trickle'
  | 'drop'
  | 'ripple'
  | 'poplar'
  | 'kilim'
  | 'banner'
  | 'sheepHead'
  | 'goatHead'
  | 'shadow'
  | 'bees'
  | 'butterfly'
  | 'dust'
  | 'sparkle'
  | 'fireflies'
  | CreatureSprite
  | VillagerSprite
  | FigureSprite;

/** A node: a box, what is drawn in it, how it moves, and what moves with it. */
export interface KingdomNode {
  sprite?: KingdomSprite;
  /** a root's box in canvas units; a child's in its parent's box units (its top left at 0, 0) */
  box: { x: number; y: number; w: number; h: number };
  /** the point it turns and scales about, as shares of its box */
  origin: Pt;
  motion?: KingdomMotion;
  /** its pose when nothing moves */
  still: Omit<KingdomFrame, 't'>;
  /** what shows inside its box only (the waterfall's streaks inside the fall) */
  clip?: boolean;
  /**
   * what an app moves when the actor is tapped: the layer it shows (the
   * deer's happy eyes, hidden otherwise), or the head, wing or tail it turns
   */
  role?: 'happy' | 'head' | 'wing' | 'tail' | 'arm';
  children?: KingdomNode[];
}

/** What kind of life an actor is. */
export type KingdomLifeKind = 'sky' | 'smoke' | 'water' | 'sway' | 'animal' | 'deer' | 'person';

/** One moving thing in the village, its root node, and the building it belongs to if any. */
export interface KingdomActor extends KingdomNode {
  id: string;
  kind: KingdomLifeKind;
  building?: KingdomBuilding;
  /** what a tap makes it do (an app may pad its target beyond its box) */
  tap?: KingdomTap;
}

/**
 * What a tap makes an actor do: the deer hops for joy, Hamo or Xezal says a
 * word of praise, a villager nods and waves,
 * a sheep or a goat hops, a hen flutters up in a puff of feathers, the cow or
 * the donkey turns its head, the dog wags, a tree rustles and lets a leaf go.
 */
export type KingdomTap = 'deer' | 'person' | 'wave' | 'hop' | 'flutter' | 'turn' | 'wag' | 'rustle';

// ───────────────────────────────────────────────────────────── motion

type Prop = 'x' | 'y' | 'r' | 'sx' | 'sy' | 'o';
const PROPS: readonly Prop[] = ['x', 'y', 'r', 'sx', 'sy', 'o'];
const REST: Omit<KingdomFrame, 't'> = { x: 0, y: 0, r: 0, sx: 1, sy: 1, o: 1 };

/** A key: a time and whichever of the properties it sets. */
export type Key = { t: number } & Partial<Omit<KingdomFrame, 't'>>;

/** One property's value at a time, linear between the keys that set it. */
function sample(keys: readonly Key[], prop: Prop, t: number): number {
  let before: Key | undefined;
  let after: Key | undefined;
  for (const k of keys) {
    if (k[prop] === undefined) continue;
    if (k.t <= t) before = k;
    if (k.t >= t && after === undefined) after = k;
  }
  if (!before && !after) return REST[prop];
  if (!before) return after![prop]!;
  if (!after) return before[prop]!;
  if (after.t === before.t) return after[prop]!;
  const f = (t - before.t) / (after.t - before.t);
  return before[prop]! + (after[prop]! - before[prop]!) * f;
}

const frameAt = (keys: readonly Key[], t: number): KingdomFrame => {
  const f = { t } as KingdomFrame;
  for (const p of PROPS) f[p] = Math.round(sample(keys, p, t) * 1000) / 1000;
  return f;
};

/** The pose at a share of a set of keys, for a still picture. */
export function poseAt(keys: readonly Key[], t: number): Omit<KingdomFrame, 't'> {
  const { x, y, r, sx, sy, o } = frameAt(keys, t);
  return { x, y, r, sx, sy, o };
}

/**
 * A loop from keys, started `phase` of the way through, so a crowd of the
 * same loop does not move in step. Keys at 0 and 1 should agree; the frames
 * come out sorted, from 0 to 1, with a frame at every key's time.
 */
export function loop(period: number, keys: readonly Key[], phase = 0): KingdomMotion {
  const times = [...new Set([0, 1, ...keys.map((k) => k.t)])].sort((a, b) => a - b);
  const p = ((phase % 1) + 1) % 1;
  if (p === 0) return { period, frames: times.map((t) => frameAt(keys, t)) };
  // the loop seen from `p` on: each key's time moved back by p, wrapping, and the original start and end meeting in the middle
  const shifted = new Set<number>([0, 1]);
  for (const t of times) shifted.add(Math.round((((t - p) % 1) + 1) % 1 * 1e6) / 1e6);
  const frames = [...shifted].sort((a, b) => a - b).map((t) => ({ ...frameAt(keys, t === 1 ? p : (t + p) % 1), t }));
  return { period, frames };
}

/** A gentle swing to and fro: r following a sine, sampled finely enough to look round. */
function swing(amp: number, steps = 8, extra: Partial<Omit<KingdomFrame, 't'>> = {}): Key[] {
  return Array.from({ length: steps + 1 }, (_, i) => ({ t: i / steps, r: Math.round(amp * Math.sin((i / steps) * Math.PI * 2) * 100) / 100, ...extra }));
}

// ───────────────────────────────────────────────────────────── sprites

type Box = { x: number; y: number; w: number; h: number };

/** Each sprite's own box, in its own units: what its SVG's viewBox is. */
export const SPRITE_BOX: Readonly<Record<KingdomSprite, Box>> = {
  cloud: { x: -38, y: -24, w: 76, h: 34 },
  birds: { x: -16, y: -8, w: 32, h: 14 },
  smoke: { x: -7, y: -14, w: 14, h: 15 },
  trickle: { x: -2.4, y: -1, w: 4.8, h: 9 },
  drop: { x: -1.2, y: -2, w: 2.4, h: 4 },
  ripple: { x: -9, y: -4, w: 18, h: 8 },
  poplar: { x: -10, y: -66, w: 20, h: 70 },
  kilim: { x: 1.5, y: -16.5, w: 21, h: 23.5 },
  banner: { x: 0.6, y: 2.4, w: 8.2, h: 22.6 },
  sheepHead: { x: -14, y: -18, w: 32, h: 20 },
  goatHead: { x: -14, y: -24, w: 32, h: 26 },
  shadow: { x: -10, y: -3, w: 22, h: 6 },
  bees: { x: -8, y: -6, w: 16, h: 12 },
  butterfly: { x: -6.5, y: -6, w: 13, h: 10 },
  dust: { x: -34, y: -26, w: 68, h: 30 },
  sparkle: { x: -5, y: -5, w: 10, h: 10 },
  fireflies: { x: -14, y: -9, w: 28, h: 18 },
  ...CREATURE_BOX,
  ...VILLAGER_SPRITE_BOX,
  ...(Object.fromEntries(FIGURE_SPRITES.map((s) => [s, { x: 0, y: 0, w: 0, h: 0 }])) as Record<FigureSprite, Box>),
};

/** The deer, the app's own drawing of Hevalo, as the layers the village moves: body, antlers, the ear that flicks, the rest of his head, and his eyes open, shut and smiling. */
function deer(): { box: Box; layers: Record<'deerBody' | 'deerCrown' | 'deerEar' | 'deerHead' | 'deerEyes' | 'deerBlink' | 'deerHappy', string>; head: Pt; ear: Pt } {
  const art = characterArt('hevalo', 'kgdeer');
  const rig = art.rig!;
  const box = art.viewBox;
  const share = (p: { x: number; y: number }): Pt => [(p.x - box.x) / box.w, (p.y - box.y) / box.h];
  return {
    box,
    layers: {
      deerBody: art.body,
      deerCrown: rig.crown,
      deerEar: rig.ears.left.art,
      deerHead: rig.ears.right.art + rig.face + art.mouths.rest + art.overlay,
      deerEyes: art.eyes.open,
      deerBlink: art.eyes.closed,
      deerHappy: art.eyes.happy,
    },
    head: share(art.headPivot),
    ear: share(rig.ears.left.pivot),
  };
}

/** One of the course's people as the village lays them: the figure without its eyes, the eyes open and shut (each whole, swapped for a blink), and the mouth at rest. */
function person(id: 'hamo' | 'xezo'): { box: Box; layers: [string, string, string, string] } {
  const art = characterArt(id, `kg${id}`);
  return { box: art.viewBox, layers: [art.body + art.head, art.eyes.open, art.eyes.closed, art.mouths.rest + art.overlay] };
}

const DEER = deer();
const HAMO = person('hamo');
const XEZO = person('xezo');
{
  const boxes = SPRITE_BOX as Record<KingdomSprite, Box>;
  for (const k of ['deerBody', 'deerCrown', 'deerEar', 'deerHead', 'deerEyes', 'deerBlink', 'deerHappy'] as const) boxes[k] = DEER.box;
  for (const k of ['hamo', 'hamoEyes', 'hamoBlink', 'hamoFace'] as const) boxes[k] = HAMO.box;
  for (const k of ['xezo', 'xezoEyes', 'xezoBlink', 'xezoFace'] as const) boxes[k] = XEZO.box;
}

/** A sheep's head: dark brown, an ear laid back, a tuft of fleece on top. */
function sheepHead(pal: Palette): string {
  const p = new Part(0);
  const head = 'M7 -12q4 -2.4 7.4 0.6q1.8 2.6 0.4 4.8q-2.4 1.6 -5.2 0q-2.8 -1.6 -2.6 -5.4Z';
  const ear = 'M8.4 -11.4q-3 -1.6 -4.4 0.4q2 1.4 4.6 0.8Z';
  p.sil(head + ear).fill(ear, '#5a4036').fill(head, pal.dusk ? '#4c3830' : '#5f463c');
  p.flat(disc(10.8, -9.6, 0.9), '#ffffff').flat(disc(11, -9.6, 0.45), INK);
  p.sil(disc(8.6, -12.8, 2.2)).flat(disc(8.6, -12.8, 2.2), pal.dusk ? '#e9dccb' : '#fffaf0');
  return p.svg();
}

/** A goat's head: horns sweeping back, a beard, a white blaze. */
function goatHead(pal: Palette): string {
  const p = new Part(0);
  const horns = 'M8.4 -19q-1.8 -4.6 -6 -4.4q3.4 1.4 4.4 5.2ZM10 -19.4q-0.8 -4.6 -4.6 -5.6q2.8 2 3.2 5.8Z';
  const head = 'M7 -18q3.6 -2.2 7.2 0.2q2.4 2.2 2.2 5.4q-1.4 1.6 -3.4 0.6l-1 3l-1.2 -3.2q-3.4 -0.8 -3.8 -6Z';
  const ear = 'M7.6 -16.4q-3.4 0.4 -3.6 2.8q2.8 -0.4 4.2 -1.6Z';
  p.sil(horns + head + ear).fill(horns, '#c9b79c').fill(ear, '#3a2c26').fill(head, pal.dusk ? '#3b2e29' : '#47362f');
  p.flat('M12.4 -17.6q2 1.4 2.6 4.4q-1 0.6 -1.6 0q-0.2 -2.4 -1 -4.4Z', '#efe6d6');
  p.flat(disc(11, -16.2, 0.8), '#f6d36b').flat(disc(11.1, -16.2, 0.4), INK);
  return p.svg();
}

/** Three bees, striped, their wings a white blur. */
function bees(): string {
  let wings = '';
  let bodies = '';
  let stripes = '';
  for (const [x, y] of [[-4.6, -1.6], [2, -3.4], [4.4, 2]] as const) {
    wings += oval(x - 0.4, y - 1.6, 1.3, 0.9) + oval(x + 1, y - 1.6, 1.3, 0.9);
    bodies += oval(x, y, 1.9, 1.3);
    stripes += `M${n(x - 0.3)} ${n(y - 1.2)}v2.4M${n(x + 0.8)} ${n(y - 1)}v2`;
  }
  return `<path d="${wings}" fill="#ffffff" fill-opacity="0.85" stroke="${INK}" stroke-width="0.4"/><path d="${bodies}" fill="#f6c431" stroke="${INK}" stroke-width="0.6"/><path d="${stripes}" fill="none" stroke="${INK}" stroke-width="0.6"/>`;
}

/** A butterfly, its wings open, saffron with a dark edge. */
function butterfly(pal: Palette): string {
  const p = new Part(0);
  const wings = 'M0 0q-4.6 -4.6 -4.4 -1.4q0.2 1.8 1.8 1.8q-2.2 1.4 -0.6 2.6q1.6 0.6 3.2 -3ZM0 0q4.6 -4.6 4.4 -1.4q-0.2 1.8 -1.8 1.8q2.2 1.4 0.6 2.6q-1.6 0.6 -3.2 -3Z';
  p.sil(wings).fill(wings, pal.saffron.left, ' stroke-width="0.5"').flat(disc(-2.4, -1.4, 0.8) + disc(2.4, -1.4, 0.8), pal.red.left);
  p.line('M0 -2v4', 1, INK);
  return p.svg();
}

/** Three swallows, wings out, crossing the sky. */
function birds(pal: Palette): string {
  const v = (x: number, y: number, s: number): string => `M${n(x - 5 * s)} ${n(y - 1.6 * s)}q${n(2.6 * s)} ${n(-1 * s)} ${n(5 * s)} ${n(1.6 * s)}q${n(2.4 * s)} ${n(-2.6 * s)} ${n(5 * s)} ${n(-1.6 * s)}`;
  return `<path d="${v(-8, 0, 1) + v(3, -3, 0.85) + v(9, 3, 0.7)}" fill="none" stroke="${pal.dusk ? '#2a2440' : '#3d3046'}" stroke-width="1.6"/>`;
}

/** A cloud: flat white puffs, their undersides in a soft blue shade, a soft edge. */
function cloud(pal: Palette): string {
  const puffs = disc(-20, -2, 10) + disc(-6, -11, 13) + disc(10, -6, 11) + disc(23, -1, 8) + oval(0, 2, 32, 7);
  return `<path d="${puffs}" fill="${pal.cloud.right}" stroke="${pal.cloud.right}" stroke-width="2"/><path d="${disc(-21, -4, 8.6) + disc(-7, -13, 11.6) + disc(9, -8, 9.6) + disc(22, -3, 6.6) + oval(-1, -1, 28, 5)}" fill="${pal.cloud.top}" stroke="none"/>`;
}

/** A puff of smoke: three round puffs, pale, lit on the left. */
function smoke(pal: Palette): string {
  const puffs = disc(-2.6, -3.6, 3.4) + disc(2.2, -6.6, 3.6) + disc(-0.6, -10.2, 2.8);
  return `<path d="${puffs}" fill="${pal.dusk ? '#9c97a8' : '#d9d3ca'}" stroke="${pal.dusk ? '#7d778c' : '#b9ad9e'}" stroke-width="0.8"/><path d="${disc(-3.2, -4.2, 2.4) + disc(1.4, -7.4, 2.6) + disc(-1.1, -10.7, 1.9)}" fill="${pal.dusk ? '#bdb7c6' : '#f6f3ee'}" stroke="none"/>`;
}

/** The spring's water as it falls from the spout: a ribbon of light blue, a white thread down it. */
function trickle(pal: Palette): string {
  return `<path d="M-1.4 0q-0.4 4 0 8h2.8q0.4 -4 0 -8Z" fill="${pal.water.top}" stroke="${INK}" stroke-width="0.5"/><path d="M-0.2 0.6v6.6" fill="none" stroke="#ffffff" stroke-width="0.7"/>`;
}

/** A glint of moving water. */
function drop(): string {
  return '<path d="M0 -1.4v2.8" fill="none" stroke="#ffffff" stroke-width="1.2"/>';
}

/** A ring spreading on still water. */
function ripple(pal: Palette): string {
  return `<path d="${oval(0, 0, 8, 3)}" fill="none" stroke="${pal.foam}" stroke-width="1.2"/>`;
}

/** A soft flat shadow on the ground under an animal or a person, falling a little to the right like every shadow in the village, and as dark. */
function shadowSprite(): string {
  return `<path d="${oval(1.8, 0.2, 9, 2.4)}" fill="${SHADOW.colour}" fill-opacity="${SHADOW.opacity + 0.06}" stroke="none"/>`;
}

/** The dust an upgrade raises: a low bank of beige puffs. */
function dust(pal: Palette): string {
  const back = disc(-22, -6, 10) + disc(-8, -14, 13) + disc(10, -12, 12) + disc(24, -5, 9) + oval(0, -2, 32, 8);
  const front = disc(-23, -8, 7.6) + disc(-9, -16, 10.4) + disc(8, -14, 9.4) + disc(22, -7, 6.6);
  return `<path d="${back}" fill="${pal.earth.top}" stroke="${pal.earth.right}" stroke-width="1.4"/><path d="${front}" fill="${pal.cream.left}" stroke="none"/>`;
}

/** A four-pointed sparkle in saffron with a white heart. */
function sparkle(pal: Palette): string {
  return `<path d="M0 -5Q0.6 -0.6 5 0Q0.6 0.6 0 5Q-0.6 0.6 -5 0Q-0.6 -0.6 0 -5Z" fill="${pal.saffron.top}" stroke="${INK}" stroke-width="0.6"/><path d="${disc(0, 0, 1.2)}" fill="#ffffff" stroke="none"/>`;
}

/** Fireflies over the meadow at dusk: a few warm specks, each with a soft ring of its own light; by day, nothing. */
function fireflies(pal: Palette): string {
  if (!pal.dusk) return '';
  const at: [number, number][] = [[-10, -4], [-3, 3], [5, -6], [11, 2], [1, -1]];
  return `<path d="${at.map(([x, y]) => disc(x, y, 3.4)).join('')}" fill="#ffe27a" fill-opacity="0.4" stroke="none"/><path d="${at.map(([x, y]) => disc(x, y, 1.3)).join('')}" fill="#fffbe0" stroke="none"/>`;
}

/** Scenery sprites are drawn as the scene draws them, a quarter larger than their own units. */
const SCENERY = 1.25;

function scenerySprite(sprite: 'poplar' | 'kilim' | 'banner', pal: Palette): string {
  const p = new Part(0);
  if (sprite === 'poplar') return P.poplar(pal, 0, 0, 0, 64, 12).svg();
  if (sprite === 'banner') P.bannerCloth(p, pal, 0, 0, 0);
  else P.kilim(p, (u, v) => iso(3 + u, 0.4, 5 + v), 18, 12, pal);
  return p.svg();
}

const DRAW: Readonly<Record<KingdomSprite, (pal: Palette) => string>> = {
  cloud,
  birds,
  smoke,
  trickle,
  drop: () => drop(),
  ripple,
  poplar: (pal) => scenerySprite('poplar', pal),
  kilim: (pal) => scenerySprite('kilim', pal),
  banner: (pal) => scenerySprite('banner', pal),
  sheepHead,
  goatHead,
  shadow: () => shadowSprite(),
  bees: () => bees(),
  butterfly,
  dust,
  sparkle,
  fireflies,
  ...CREATURES,
  ...VILLAGER_LAYERS,
  deerBody: () => DEER.layers.deerBody,
  deerCrown: () => DEER.layers.deerCrown,
  deerEar: () => DEER.layers.deerEar,
  deerHead: () => DEER.layers.deerHead,
  deerEyes: () => DEER.layers.deerEyes,
  deerBlink: () => DEER.layers.deerBlink,
  deerHappy: () => DEER.layers.deerHappy,
  hamo: () => HAMO.layers[0],
  hamoEyes: () => HAMO.layers[1],
  hamoBlink: () => HAMO.layers[2],
  hamoFace: () => HAMO.layers[3],
  xezo: () => XEZO.layers[0],
  xezoEyes: () => XEZO.layers[1],
  xezoBlink: () => XEZO.layers[2],
  xezoFace: () => XEZO.layers[3],
};

const FIGURES = new Set<KingdomSprite>(FIGURE_SPRITES);

/** A sprite as a standalone SVG, sized by the box it is laid in (it stretches to fill it, keeping no aspect of its own). */
export function kingdomSpriteSvg(sprite: KingdomSprite, o: { dark?: boolean } = {}): string {
  const draw = DRAW[sprite];
  if (!draw) throw new RangeError(`art: no village sprite ${String(sprite)}`);
  const b = SPRITE_BOX[sprite];
  const body = draw(o.dark ? DUSK : DAY);
  // the deer and the people are the course's own drawings, with their own soft light; the rest wear the village's ink
  const inner = FIGURES.has(sprite) ? body : inked(body);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(b.x)} ${n(b.y)} ${n(b.w)} ${n(b.h)}" preserveAspectRatio="none" aria-hidden="true">${inner}</svg>`;
}

// ───────────────────────────────────────────────────────────── the cast

/** Turns world points into canvas points; given by the scene, which knows where its origin is. */
export type ToCanvas = (x: number, y: number, z: number) => { x: number; y: number };

/** A sprite's box on the canvas, with its own origin (0, 0) at a canvas point, at a scale. */
function boxAt(sprite: KingdomSprite, at: { x: number; y: number }, k = 1): Box {
  const b = SPRITE_BOX[sprite];
  return { x: at.x + b.x * k, y: at.y + b.y * k, w: b.w * k, h: b.h * k };
}

/** Where a sprite's own (0, 0) falls in its box, as shares: the natural origin to turn and scale it about. */
function anchor(sprite: KingdomSprite): Pt {
  const b = SPRITE_BOX[sprite];
  return [-b.x / b.w, -b.y / b.h];
}

/** A child layer filling its parent's box exactly: the same sprite frame drawn over it. */
function layer(sprite: KingdomSprite, parent: { w: number; h: number }, origin: Pt, motion?: KingdomMotion, still?: Omit<KingdomFrame, 't'>): KingdomNode {
  return { sprite, box: { x: 0, y: 0, w: parent.w, h: parent.h }, origin, motion, still: still ?? (motion ? stillOf(motion, 0) : REST) };
}

const stillOf = (m: KingdomMotion, t: number): Omit<KingdomFrame, 't'> => poseAt(m.frames, t);

/** What an animal does while it stands at a stop: grazes head-down, chews its cud, sniffs the ground, sits, looks about, pecks and scratches (a hen), or flutters up. */
type Idle = 'graze' | 'chew' | 'sniff' | 'sit' | 'look' | 'peck' | 'flutter' | 'work';

/** A waypoint for a walker: where, and how long it stays there, and what it does while it stays. */
interface Stop {
  at: readonly [number, number, number];
  /** milliseconds spent here */
  wait?: number;
  /** grazing (head down) while waiting; the same as `idle: 'graze'` */
  graze?: boolean;
  idle?: Idle;
}

/** How far a leg swings either way from the hip in a stride, in degrees. */
const STRIDE = 24;

/**
 * The keys of a walk round a loop of stops at `speed` canvas units a second,
 * back to the first: where it is (x, y from the first stop), which way it
 * faces (sx ±1 for an animal seen from the side), what its head does, the
 * bob of its gait, the swing of one diagonal pair of its legs (the other pair
 * swings the opposite way), and when it sits. Every stretch of walking
 * starts and ends gently, at half pace, so nothing slides into or out of a
 * stop; a change of way is a quick turn on the spot; its legs move only
 * while it walks, a step for every stride's worth of ground.
 */
function walk(
  to: ToCanvas,
  stops: readonly Stop[],
  speed: number,
  stride = 6,
  bob = 0.8,
): { period: number; path: Key[]; face: Key[]; head: Key[]; gait: Key[]; legs: Key[]; scratch: Key[]; wing: Key[]; rise: Key[]; sit: Key[]; moving: Key[]; step: number; spans: { a: number; b: number; move: boolean; idle: Idle | undefined }[] } {
  const pts = stops.map((s) => to(...s.at));
  let total = 0;
  const marks: { t0: number; t1: number; kind: 'wait' | 'move'; i: number; dir: number; idle: Idle | undefined; d: number }[] = [];
  for (let i = 0; i < stops.length; i++) {
    const wait = stops[i]!.wait ?? 0;
    if (wait > 0) {
      marks.push({ t0: total, t1: total + wait, kind: 'wait', i, dir: 0, idle: stops[i]!.idle ?? (stops[i]!.graze ? 'graze' : undefined), d: 0 });
      total += wait;
    }
    const j = (i + 1) % stops.length;
    const d = Math.hypot(pts[j]!.x - pts[i]!.x, pts[j]!.y - pts[i]!.y);
    // a gentle start and stop make a stretch a third longer than at full pace
    const dur = ((d / speed) * 1000 * 4) / 3;
    if (dur > 0) {
      marks.push({ t0: total, t1: total + dur, kind: 'move', i, dir: Math.sign(pts[j]!.x - pts[i]!.x) || 1, idle: undefined, d });
      total += dur;
    }
  }
  const base = pts[0]!;
  const path: Key[] = [];
  const face: Key[] = [];
  const head: Key[] = [];
  const gait: Key[] = [];
  const legs: Key[] = [];
  const scratch: Key[] = [];
  const wing: Key[] = [{ t: 0, r: 0 }];
  const rise: Key[] = [{ t: 0, y: 0 }];
  const moving: Key[] = [];
  const sit: Key[] = [{ t: 0, o: 0 }];
  // a turn about on the spot takes a fifth of a second
  const turn = Math.min(0.02, 200 / total);
  let facing = marks.find((m) => m.kind === 'move')?.dir ?? 1;
  for (const m of marks) {
    const a = m.t0 / total;
    const b = m.t1 / total;
    const from = pts[m.i]!;
    const to2 = m.kind === 'move' ? pts[(m.i + 1) % pts.length]! : from;
    const at = (f: number): Key => ({ x: from.x - base.x + (to2.x - from.x) * f, y: from.y - base.y + (to2.y - from.y) * f, t: 0 });
    if (m.kind === 'move') {
      // the first and last fifth of the time cover a tenth of the ground each: easing in and out
      path.push({ ...at(0), t: a }, { ...at(0.1), t: a + (b - a) * 0.2 }, { ...at(0.9), t: a + (b - a) * 0.8 }, { ...at(1), t: b });
    } else path.push({ ...at(0), t: a }, { ...at(0), t: b });
    if (m.kind === 'move' && m.dir !== facing) {
      face.push({ t: Math.max(0, a - turn), sx: facing }, { t: a, sx: m.dir });
      facing = m.dir;
    }
    const ms = m.t1 - m.t0;
    const lift = Math.min(0.6, ms / 4000) * (1000 / total);
    const beats = (every: number, low: number, high: number): void => {
      const n = Math.max(2, Math.floor(ms / every));
      head.push({ t: a, r: 0 });
      for (let i = 1; i < n; i++) head.push({ t: a + ((b - a) * i) / n, r: i % 2 ? high : low });
      head.push({ t: b, r: 0 });
    };
    if (m.idle === 'graze') head.push({ t: a, r: 0 }, { t: a + lift, r: 34 }, { t: b - lift, r: 34 }, { t: b, r: 0 });
    else if (m.idle === 'chew') beats(520, 1, 5);
    else if (m.idle === 'sniff') beats(360, 18, 26);
    else if (m.idle === 'look') head.push({ t: a, r: 0 }, { t: a + lift, r: -8 }, { t: (a + b) / 2, r: -8 }, { t: (a + b) / 2 + lift, r: 6 }, { t: b - lift, r: 6 }, { t: b, r: 0 });
    else if (m.idle === 'peck') {
      // a scratch of one foot back over the ground, twice, then a look down and a double peck, over and over
      const slots = Math.max(1, Math.floor(ms / 1300));
      const q = 110 / total;
      head.push({ t: a, r: 0 });
      scratch.push({ t: a, r: 0 });
      for (let i = 0; i < slots; i++) {
        const s0 = a + ((b - a) * i) / slots + q;
        scratch.push({ t: s0, r: 0 }, { t: s0 + q, r: -38 }, { t: s0 + 2 * q, r: 4 }, { t: s0 + 3 * q, r: -38 }, { t: s0 + 4 * q, r: 0 });
        const p0 = s0 + 6 * q;
        head.push({ t: p0, r: 0 }, { t: p0 + q, r: 44 }, { t: p0 + 2 * q, r: 10 }, { t: p0 + 3 * q, r: 46 }, { t: p0 + 4.4 * q, r: 0 });
      }
      head.push({ t: b, r: 0 });
      scratch.push({ t: b, r: 0 });
    } else head.push({ t: a, r: 0 }, { t: b, r: 0 });
    if (m.idle === 'flutter') {
      // up off the ground with two beats of her wings, and down again
      const q = 120 / total;
      const f0 = a + (b - a) * 0.3;
      wing.push({ t: f0, r: 0 }, { t: f0 + q, r: 62 }, { t: f0 + 2 * q, r: 8 }, { t: f0 + 3 * q, r: 62 }, { t: f0 + 4 * q, r: 8 }, { t: f0 + 5 * q, r: 0 });
      rise.push({ t: f0, y: 0 }, { t: f0 + 2 * q, y: -3.2 }, { t: f0 + 4 * q, y: -1.6 }, { t: f0 + 5 * q, y: 0 });
    }
    // sitting: down a moment after stopping, up a moment before moving on
    if (m.idle === 'sit') sit.push({ t: a, o: 0 }, { t: a + lift, o: 1 }, { t: b - lift, o: 1 }, { t: b, o: 0 });
    // walking or standing, switched in a moment at each end of a stretch
    const e = Math.min(0.0004, (b - a) / 4);
    moving.push({ t: a + e, o: m.kind === 'move' ? 1 : 0 }, { t: b - e, o: m.kind === 'move' ? 1 : 0 });
    if (m.kind === 'move') {
      const steps = 2 * Math.max(1, Math.round(m.d / stride / 2));
      for (let s = 0; s <= steps; s++) {
        const t = a + ((b - a) * s) / steps;
        gait.push({ t, y: s % 2 ? -bob : 0 });
        legs.push({ t, r: s === 0 || s === steps ? 0 : s % 2 ? STRIDE : -STRIDE });
      }
      scratch.push(...legs.slice(-steps - 1));
    } else {
      gait.push({ t: a, y: 0 }, { t: b, y: 0 });
      legs.push({ t: a, r: 0 }, { t: b, r: 0 });
      if (m.idle !== 'peck') scratch.push({ t: a, r: 0 }, { t: b, r: 0 });
    }
  }
  const first = marks.find((m) => m.kind === 'move')?.dir ?? 1;
  face.unshift({ t: 0, sx: first });
  face.push({ t: 1, sx: first });
  sit.push({ t: 1, o: 0 });
  wing.push({ t: 1, r: 0 });
  rise.push({ t: 1, y: 0 });
  moving.unshift({ t: 0, o: moving[0]!.o });
  moving.push({ t: 1, o: moving[0]!.o });
  // how long one step takes at full pace, in milliseconds
  const step = (stride / speed) * 1000;
  const spans = marks.map((m) => ({ a: m.t0 / total, b: m.t1 / total, move: m.kind === 'move', idle: m.idle }));
  return { period: total, path, face, head, gait, legs, scratch, wing, rise, sit, moving, step, spans };
}

/**
 * The parts of each four-legged animal: body, head and tail sprites (one
 * box), its legs, where its hips, neck and tail root are in that box's units,
 * how tall it stands in its own units (to the top of its head, horns or ears),
 * how tall it stands in the world, and what a tap makes it do.
 */
const RIGS = {
  sheep: { body: 'fleece', head: 'sheepHead', tail: undefined, leg: 'legDark', hips: [[-8, -4], [5, -4], [-4.6, -4], [8.4, -4]], neck: [8, -10], tailRoot: undefined, tall: 17.5, height: 9.5, tap: 'hop' },
  goat: { body: 'goatBody', head: 'goatHead', tail: undefined, leg: 'legDark', hips: [[-8, -6.5], [5.4, -6.5], [-5, -6.5], [8.4, -6.5]], neck: [8, -16], tailRoot: undefined, tall: 24.4, height: 10, tap: 'hop' },
  cow: { body: 'cow', head: 'cowHead', tail: 'cowTail', leg: 'legLight', hips: [[-13, -10.5], [7.6, -10.5], [-9, -10.5], [11.6, -10.5]], neck: [10, -20], tailRoot: [-16, -19], tall: 29, height: 13, tap: 'turn' },
  donkey: { body: 'donkey', head: 'donkeyHead', tail: undefined, leg: 'legGrey', hips: [[-11, -12.5], [6.6, -12.5], [-7, -12.5], [10.6, -12.5]], neck: [7, -22], tailRoot: undefined, tall: 36.8, height: 14, tap: 'turn' },
  dog: { body: 'dogWalk', head: 'dogHead', tail: undefined, leg: 'legLight', hips: [[-7, -9.5], [5.4, -9.5], [-4, -9.5], [8.4, -9.5]], neck: [7, -14], tailRoot: undefined, tall: 23.8, height: 7.5, tap: 'wag' },
} as const satisfies Record<string, { body: KingdomSprite; head: KingdomSprite; tail: KingdomSprite | undefined; leg: KingdomSprite; hips: readonly (readonly [number, number])[]; neck: Pt; tailRoot: Pt | undefined; tall: number; height: number; tap: KingdomTap }>;
type Species = keyof typeof RIGS;

/** How tall a person stands in the world, in canvas units (see FIGURE_HEIGHT); Hevalo, a red deer, is about a person's height to the tips of his antlers. */
export const KINGDOM_FIGURE_HEIGHT = FIGURE_HEIGHT;

/** How tall each animal stands in the world, in canvas units, against a person. */
export const KINGDOM_ANIMAL_HEIGHT: Readonly<Record<Species | 'hen' | 'chick', number>> = { sheep: RIGS.sheep.height, goat: RIGS.goat.height, cow: RIGS.cow.height, donkey: RIGS.donkey.height, dog: RIGS.dog.height, hen: 6, chick: 3 };

/**
 * A four-legged animal seen from the side, walking a loop of stops: a
 * shadow, then the animal turning to face its way, bobbing in its gait, its
 * legs swinging in diagonal pairs from the hip while it walks, its head doing
 * what it does at each stop (grazing, chewing, sniffing), the dog sitting
 * down at some, and the cow's tail swishing all the while. `size` scales it
 * from a grown one (a lamb is smaller).
 */
function animal(id: string, to: ToCanvas, species: Species, stops: readonly Stop[], speed: number, phase: number, size = 1, building?: KingdomBuilding, rider = false): KingdomActor {
  const rig = RIGS[species];
  const k = (rig.height / rig.tall) * size;
  // a step covers the ground a foot sweeps as its leg swings through the stride, so the feet never slide
  const w = walk(to, stops, speed, 2 * Math.sin((STRIDE * Math.PI) / 180) * (-rig.hips[0][1] + 0.8) * k, Math.min(0.8, rig.height * size * 0.06));
  const start = to(...stops[0]!.at);
  const box = boxAt(rig.body, start, k);
  const b = SPRITE_BOX[rig.body];
  const flip = loop(w.period, w.face, phase);
  // the legs swing in a loop of two steps of their own, shown while it walks; a set standing square shows while it stands
  // (so a long walk is a few frames, not one for every step)
  const cycle = Math.max(240, Math.round(w.step * 2));
  const swingKeys: Key[] = [{ t: 0, r: 0 }, { t: 0.25, r: STRIDE }, { t: 0.5, r: 0 }, { t: 0.75, r: -STRIDE }, { t: 1, r: 0 }];
  const lb = SPRITE_BOX[rig.leg];
  const leg = (hx: number, hy: number, motion?: KingdomMotion): KingdomNode => ({
    sprite: rig.leg,
    box: { x: (hx - b.x) * k - (lb.w * k) / 2, y: (hy - b.y) * k, w: lb.w * k, h: (-hy + 0.8) * k },
    origin: [0.5, 0] as Pt,
    motion,
    still: REST,
  });
  const full0 = { x: 0, y: 0, w: box.w, h: box.h };
  const walking = loop(w.period, w.moving, phase);
  const standing = loop(
    w.period,
    w.moving.map((key) => ({ t: key.t, o: 1 - (key.o ?? 0) })),
    phase,
  );
  const legs: KingdomNode[] = [
    // the far hind leg and the near foreleg step together, then the other two
    { box: full0, origin: [0.5, 1], motion: walking, still: { ...REST, o: 0 }, children: rig.hips.map(([hx, hy], i) => leg(hx, hy, loop(cycle, swingKeys, i === 0 || i === 3 ? 0 : 0.5))) },
    { box: full0, origin: [0.5, 1], motion: standing, still: REST, children: rig.hips.map(([hx, hy]) => leg(hx, hy)) },
  ];
  const share = ([x, y]: Pt): Pt => [(x - b.x) / b.w, (y - b.y) / b.h];
  const parts: KingdomNode[] = [...legs];
  if (rig.tail && rig.tailRoot) parts.push(layer(rig.tail, box, share(rig.tailRoot), loop(2400 + phase * 900, swing(16), phase)));
  parts.push({ sprite: rig.body, box: { x: 0, y: 0, w: box.w, h: box.h }, origin: anchor(rig.body), still: REST });
  if (rider) {
    // a man astride its back, his seat on its back's middle, swaying a little with its steps
    const kr = KINGDOM_FIGURE_HEIGHT / VILLAGER_TALL;
    const vb = VILLAGER_BOX;
    const seat = { x: (-1 - b.x) * k, y: (-25 - b.y) * k };
    const rbox = { x: seat.x - (0 - vb.x) * kr, y: seat.y - (-12.6 - vb.y) * kr, w: vb.w * kr, h: vb.h * kr };
    const rfull = { x: 0, y: 0, w: rbox.w, h: rbox.h };
    const rshare = ([x, y]: readonly [number, number]): Pt => [(x - vb.x) / vb.w, (y - vb.y) / vb.h];
    parts.push({
      box: rbox,
      origin: rshare([0, -12.6]),
      motion: loop(Math.max(400, Math.round(w.step * 2)), [{ t: 0, r: -1.5 }, { t: 0.5, r: 1.5 }, { t: 1, r: -1.5 }]),
      still: REST,
      children: [
        { sprite: 'riderSeat', box: rfull, origin: [0.5, 1], still: REST },
        { sprite: 'riderBody', box: rfull, origin: [0.5, 1], still: REST },
        { ...layer('riderHead', rfull, rshare(VILLAGER_JOINTS.neck), loop(w.period, w.head.map((key) => ({ ...key, r: (key.r ?? 0) * 0.4 })), phase), REST), role: 'head' },
        { ...layer('riderArm', rfull, rshare(VILLAGER_JOINTS.shoulder)), role: 'arm', still: { ...REST, r: -24 } },
      ],
    });
  }
  parts.push({ ...layer(rig.head, box, share(rig.neck), loop(w.period, w.head, phase), { ...REST, r: stops[0]!.graze || stops[0]!.idle === 'graze' ? 34 : 0 }), role: 'head' });
  const full = { x: 0, y: 0, w: box.w, h: box.h };
  const sits = stops.some((s) => s.idle === 'sit');
  const sitting = loop(w.period, w.sit, phase);
  const up = loop(
    w.period,
    w.sit.map((key) => ({ ...key, o: 1 - (key.o ?? 0) })),
    phase,
  );
  const body: KingdomNode = { box: full, origin: anchor(rig.body), motion: loop(w.period, w.gait, phase), still: REST, children: parts };
  const shown: KingdomNode[] = sits
    ? [
        { box: full, origin: anchor(rig.body), motion: up, still: REST, children: [body] },
        { sprite: 'dogSit', box: full, origin: anchor(rig.body), motion: sitting, still: { ...REST, o: 0 } },
      ]
    : [body];
  return {
    id,
    kind: 'animal',
    tap: rig.tap,
    building,
    box,
    origin: anchor(rig.body),
    motion: loop(w.period, w.path, phase),
    still: REST,
    children: [
      { sprite: 'shadow', box: { x: box.w * 0.5 - 10 * k, y: (0.6 - b.y) * k - 2.5 * k, w: 20 * k, h: 5 * k }, origin: [0.5, 0.5], still: REST },
      { box: full, origin: anchor(rig.body), motion: flip, still: { ...REST, sx: flip.frames[0]!.sx }, children: shown },
    ],
  };
}

/** What a villager's working arm does while they stand at their work: hoe, slap bread into the tenûr, sip tea, throw the shuttle, lean on the staff. */
type Work = 'hoe' | 'bread' | 'sip' | 'weave' | 'staff' | 'still';

/** The working arm's turns about the shoulder, beat by beat, over one stretch of standing (shares of the loop from a to b), for a kind of work. */
function workBeats(work: Work, a: number, b: number, total: number): Key[] {
  const ms = (b - a) * total;
  const out: Key[] = [{ t: a, r: 0 }];
  const beat = (every: number, keys: readonly (readonly [number, number])[]): void => {
    const n = Math.max(1, Math.floor(ms / every));
    for (let i = 0; i < n; i++) {
      const s = a + ((b - a) * i) / n;
      for (const [f, r] of keys) out.push({ t: s + ((b - a) / n) * f, r });
    }
  };
  // a hoe raised high and brought down, a hand reaching into the oven and back, a glass up to the lips and held there, a shuttle thrown across and back
  if (work === 'hoe') beat(1150, [[0.1, 0], [0.45, -78], [0.62, 14], [0.8, 6], [0.95, 0]]);
  if (work === 'bread') beat(1500, [[0.1, 0], [0.4, -46], [0.55, -50], [0.8, 0]]);
  if (work === 'sip') beat(3600, [[0.15, 0], [0.32, -96], [0.55, -96], [0.72, 0]]);
  if (work === 'weave') beat(900, [[0.1, 0], [0.45, -34], [0.6, -34], [0.95, 0]]);
  if (work === 'staff') beat(4200, [[0.2, 0], [0.5, -8], [0.8, 0]]);
  out.push({ t: b, r: 0 });
  return out;
}

/**
 * One of the village's people at a chore: walking from stop to stop (if
 * they move at all) at `speed`, turning to face their way, bobbing with
 * their steps, their legs swinging (where their clothes let them show),
 * their working arm at its work at every stop, their head looking about now
 * and then. A tap makes them nod and wave. `size` scales a child down.
 */
function villager(id: string, who: Villager, to: ToCanvas, stops: readonly Stop[], speed: number, phase: number, work: Work, building?: KingdomBuilding): KingdomActor {
  const k = (KINGDOM_FIGURE_HEIGHT / VILLAGER_TALL) * (isChild(who) ? 0.66 : 1);
  const w = walk(to, stops, speed, 4.6 * k, isChild(who) ? 0.9 : 0.6);
  const start = to(...stops[0]!.at);
  const box = boxAt(`${who}Body` as KingdomSprite, start, k);
  const b = VILLAGER_BOX;
  const full = { x: 0, y: 0, w: box.w, h: box.h };
  const share = ([x, y]: readonly [number, number]): Pt => [(x - b.x) / b.w, (y - b.y) / b.h];
  const flip = loop(w.period, w.face, phase);
  const parts: KingdomNode[] = [];
  if (showsLegs(who)) {
    const lb = SPRITE_BOX[`${who}Leg` as KingdomSprite];
    const legAt = ([hx, hy]: readonly [number, number], motion?: KingdomMotion): KingdomNode => ({
      sprite: `${who}Leg` as KingdomSprite,
      box: { x: (hx - b.x + lb.x) * k, y: (hy - b.y + lb.y) * k, w: lb.w * k, h: lb.h * k },
      origin: anchor(`${who}Leg` as KingdomSprite),
      motion,
      still: REST,
    });
    // a pair that swings in a short loop of its own while they walk, a pair standing still while they stand
    const cycle = Math.max(300, Math.round(w.step * 2));
    const swingKeys: Key[] = [{ t: 0, r: 0 }, { t: 0.25, r: 22 }, { t: 0.5, r: 0 }, { t: 0.75, r: -22 }, { t: 1, r: 0 }];
    parts.push(
      { box: full, origin: [0.5, 1], motion: loop(w.period, w.moving, phase), still: { ...REST, o: 0 }, children: VILLAGER_JOINTS.hips.map((h, i) => legAt(h, loop(cycle, swingKeys, i * 0.5))) },
      { box: full, origin: [0.5, 1], motion: loop(w.period, w.moving.map((key) => ({ t: key.t, o: 1 - (key.o ?? 0) })), phase), still: REST, children: VILLAGER_JOINTS.hips.map((h) => legAt(h)) },
    );
  }
  // the working arm: at its work wherever they stand, swinging a little as they walk
  const arm: Key[] = [];
  for (const span of w.spans) {
    if (span.move) arm.push({ t: span.a, r: 0 }, { t: (span.a + span.b) / 2, r: work === 'hoe' || work === 'staff' ? 4 : 10 }, { t: span.b, r: 0 });
    else arm.push(...workBeats(work, span.a, span.b, w.period));
  }
  arm.sort((p, q) => p.t - q.t);
  if (!arm.length || arm[0]!.t > 0) arm.unshift({ t: 0, r: 0 });
  if (arm[arm.length - 1]!.t < 1) arm.push({ t: 1, r: 0 });
  const head = w.head.map((key) => ({ ...key, r: (key.r ?? 0) * 0.5 }));
  parts.push(
    { sprite: `${who}Body` as KingdomSprite, box: full, origin: [0.5, 1], still: REST },
    { ...layer(`${who}Head` as KingdomSprite, full, share(VILLAGER_JOINTS.neck), loop(w.period, head, phase), REST), role: 'head' },
    { ...layer(`${who}Arm` as KingdomSprite, full, share(VILLAGER_JOINTS.shoulder), loop(w.period, arm, phase), REST), role: 'arm' },
  );
  // a woman's dress sways a little with her steps, the whole of her rocking from her feet
  const rock = w.gait.map((key) => ({ t: key.t, y: key.y, r: (key.y ?? 0) ? 1.6 : 0 }));
  return {
    id,
    kind: 'person',
    tap: 'wave',
    building,
    box,
    origin: [0.5, 1],
    motion: loop(w.period, w.path, phase),
    still: REST,
    children: [
      { sprite: 'shadow', box: { x: box.w / 2 - 6 * k * 2, y: (0 - b.y) * k - 1.4 * k * 2, w: 12 * k * 2, h: 2.8 * k * 2 }, origin: [0.5, 0.5], still: REST },
      {
        box: full,
        origin: [0.5, 1],
        motion: flip,
        still: { ...REST, sx: flip.frames[0]!.sx },
        children: [{ box: full, origin: share([0, 0]), motion: loop(w.period, showsLegs(who) ? w.gait : rock, phase), still: REST, children: parts }],
      },
    ],
  };
}

/** Smoke from a chimney, the tenûr or a fire: two puffs a half-loop apart, each rising, curling aside, growing and thinning away. */
function smokeFrom(id: string, at: { x: number; y: number }, building?: KingdomBuilding, phase = 0): KingdomActor[] {
  const keys: Key[] = [
    { t: 0, x: 0, y: 0, sx: 0.5, sy: 0.5, o: 0 },
    { t: 0.12, o: 0.9 },
    { t: 0.45, x: -2.4, y: -10, sx: 0.9, sy: 0.9 },
    { t: 0.8, o: 0.5 },
    { t: 1, x: 4, y: -24, sx: 1.5, sy: 1.5, o: 0 },
  ];
  return [0, 0.5].map((p, i) => ({
    id: `${id}${i}`,
    kind: 'smoke' as const,
    building,
    sprite: 'smoke' as const,
    box: boxAt('smoke', at, 0.75),
    origin: anchor('smoke'),
    motion: loop(4800, keys, (phase + p) % 1),
    still: i === 0 ? { ...REST, x: -2, y: -8, sx: 0.8, sy: 0.8, o: 0.8 } : { ...REST, o: 0 },
  }));
}

/** Rings spreading on still water, two a half-loop apart. */
function ripples(id: string, at: { x: number; y: number }, k: number, building?: KingdomBuilding, period = 2600): KingdomActor[] {
  const keys: Key[] = [
    { t: 0, sx: 0.25, sy: 0.25, o: 0 },
    { t: 0.15, o: 1 },
    { t: 1, sx: 1.1, sy: 1.1, o: 0 },
  ];
  return [0, 0.5].map((p, i) => ({
    id: `${id}${i}`,
    kind: 'water' as const,
    building,
    sprite: 'ripple' as const,
    box: boxAt('ripple', at, k),
    origin: anchor('ripple'),
    motion: loop(period, keys, p),
    still: i === 0 ? { ...REST, sx: 0.7, sy: 0.7, o: 0.8 } : { ...REST, o: 0 },
  }));
}

/** Falling water: a ribbon, and glints running down it. */
function fall(id: string, from: { x: number; y: number }, length: number, building: KingdomBuilding | undefined, k = 1): KingdomActor {
  const box = { x: from.x - 2.4 * k, y: from.y, w: 4.8 * k, h: length };
  const glint = (p: number): KingdomNode => ({
    sprite: 'drop',
    box: { x: box.w / 2 - 1.2 * k, y: 0, w: 2.4 * k, h: 4 * k },
    origin: [0.5, 0.5],
    motion: loop(900, [{ t: 0, y: 0, o: 0 }, { t: 0.15, o: 1 }, { t: 0.85, o: 1 }, { t: 1, y: length - 4 * k, o: 0 }], p),
    still: { ...REST, y: length / 2, o: p === 0 ? 1 : 0 },
  });
  return { id, kind: 'water', building, sprite: 'trickle', box, origin: [0.5, 0], still: REST, children: [glint(0), glint(0.5)] };
}

/** Something swaying in the wind about a point: a poplar from its foot, cloth from where it hangs. */
function sway(id: string, sprite: KingdomSprite, at: { x: number; y: number }, k: number, amp: number, period: number, phase: number, origin: Pt, kind: KingdomLifeKind = 'sway'): KingdomActor {
  // a tree answers a tap with a rustle
  const tap: KingdomTap | undefined = sprite === 'tree' || sprite === 'poplar' ? 'rustle' : undefined;
  return { id, kind, sprite, box: boxAt(sprite, at, k), origin, motion: loop(period, swing(amp), phase), still: REST, ...(tap ? { tap } : {}) };
}

/** A blink: open eyes shown all the loop but a moment near its end, when the shut ones show instead. */
function blink(period: number, shut: boolean): KingdomMotion {
  const [a, b] = shut ? [0, 1] : [1, 0];
  return loop(period, [
    { t: 0, o: a },
    { t: 0.93, o: a },
    { t: 0.935, o: b },
    { t: 0.965, o: b },
    { t: 0.97, o: a },
    { t: 1, o: a },
  ]);
}

/**
 * Hevalo, on a loop round the village and out into the valley: down the
 * village's path from where the trail from the pass comes in, stopping
 * halfway to look about with a flick of his ear and again by the half-eaten
 * apple to sniff it; past the spring to the gate; out along the road and up
 * the farm track between the fields, where he stops to look over the wheat;
 * then back down to the road and up through the village to where he began.
 * He is the app's own drawing of him, facing us, and he tips his head the way
 * he is going; he blinks now and then, and a tap makes him smile and hop.
 */
function hevalo(to: ToCanvas): KingdomActor {
  const F0 = FLOOR_Z;
  const route: Stop[] = [
    { at: [114, 2, 48], wait: 1400 },
    { at: [114, 56, 48], wait: 3200 },
    { at: [114, 108, 48] },
    { at: [114, 136, 24] },
    { at: [188, 124, 24], wait: 5200 },
    { at: [230, 124, 24] },
    { at: [230, 220, 24] },
    { at: [230, 246, 0] },
    { at: [296, 238, 0], wait: 3000 },
    { at: [314, 238, 0] },
    { at: [314, 336, 0] },
    { at: [452, 336, F0] },
    { at: [575, 336, F0] },
    { at: [575, 228, F0], wait: 4200 },
    { at: [575, 336, F0] },
    { at: [452, 336, F0] },
    { at: [314, 336, 0] },
    { at: [314, 238, 0] },
    { at: [230, 246, 0] },
    { at: [230, 220, 24] },
    { at: [230, 124, 24] },
    { at: [114, 136, 24] },
    { at: [114, 108, 48] },
  ];
  const pts = route.map((s) => to(...s.at));
  // a stroll, in canvas units a second: a little under a person's height
  const speed = 9;
  let total = 0;
  const times: { t0: number; t1: number; i: number }[] = [];
  for (let i = 0; i < route.length; i++) {
    const wait = route[i]!.wait ?? 0;
    const arrive = total;
    total += wait;
    times.push({ t0: arrive, t1: total, i });
    const j = (i + 1) % route.length;
    total += (Math.hypot(pts[j]!.x - pts[i]!.x, pts[j]!.y - pts[i]!.y) / speed) * 1000;
  }
  const period = total;
  const base = pts[0]!;
  const T = (ms: number): number => Math.min(1, ms / period);
  const path: Key[] = [];
  const gait: Key[] = [];
  const headKeys: Key[] = [{ t: 0, r: 0, y: 0 }];
  const earKeys: Key[] = [{ t: 0, r: 0 }];
  times.forEach(({ t0, t1, i }, k) => {
    const p = pts[i]!;
    path.push({ t: T(t0), x: p.x - base.x, y: p.y - base.y }, { t: T(t1), x: p.x - base.x, y: p.y - base.y });
    gait.push({ t: T(t0), y: 0, r: 0 }, { t: T(t1), y: 0, r: 0 });
    const nextT = k + 1 < times.length ? times[k + 1]!.t0 : total;
    const q = pts[(i + 1) % pts.length]!;
    const steps = Math.max(2, Math.round((nextT - t1) / 300));
    for (let s = 1; s < steps; s++) gait.push({ t: T(t1 + ((nextT - t1) * s) / steps), y: s % 2 ? -0.5 : 0, r: s % 2 ? 2.4 : -2.4 });
    // walking, his head tips the way he goes (and stays level going straight up or down the path)
    const dx = q.x - p.x;
    const tilt = Math.abs(dx) < 4 ? 0 : Math.sign(dx) * 5;
    if (nextT - t1 > 600) headKeys.push({ t: T(t1 + 250), r: tilt, y: 0 }, { t: T(nextT - 250), r: tilt, y: 0 }, { t: T(nextT), r: 0, y: 0 });
  });
  // back where he began, standing square, so the loop closes without a jump
  path.push({ t: 1, x: 0, y: 0 });
  gait.push({ t: 1, y: 0, r: 0 });
  // looking about halfway down the upper path: a turn of the head each way, and a flick of the ear
  const look = times[1]!;
  headKeys.push({ t: T(look.t0 + 300), r: 0 }, { t: T(look.t0 + 800), r: -7 }, { t: T(look.t0 + 1700), r: -7 }, { t: T(look.t0 + 2200), r: 6 }, { t: T(look.t0 + 2900), r: 6 }, { t: T(look.t1), r: 0 });
  earKeys.push({ t: T(look.t0 + 1100), r: 0 }, { t: T(look.t0 + 1250), r: -24 }, { t: T(look.t0 + 1450), r: 0 });
  // by the apple: the head dips to sniff it, comes up, and the ear flicks twice
  const apple = times[4]!;
  headKeys.push({ t: T(apple.t0 + 400), r: 0, y: 0 }, { t: T(apple.t0 + 1100), r: 5, y: 3 }, { t: T(apple.t0 + 2600), r: 5, y: 3 }, { t: T(apple.t0 + 3300), r: 0, y: 0 });
  earKeys.push({ t: T(apple.t0 + 3600), r: 0 }, { t: T(apple.t0 + 3750), r: -26 }, { t: T(apple.t0 + 3950), r: 0 }, { t: T(apple.t0 + 4300), r: -22 }, { t: T(apple.t0 + 4500), r: 0 });
  // at the spring, and up the track by the wheat: a long look across, one way and then the other
  for (const at of [times[8]!, times[13]!]) {
    headKeys.push({ t: T(at.t0 + 300), r: 0, y: 0 }, { t: T(at.t0 + 900), r: -8 }, { t: T((at.t0 + at.t1) / 2), r: -8 }, { t: T((at.t0 + at.t1) / 2 + 600), r: 7 }, { t: T(at.t1 - 400), r: 7 }, { t: T(at.t1), r: 0 });
  }
  headKeys.push({ t: 1, r: 0, y: 0 });
  earKeys.push({ t: 1, r: 0 });
  headKeys.sort((a, b) => a.t - b.t);
  earKeys.sort((a, b) => a.t - b.t);
  // he stands a person's height to the tips of his antlers
  const tall = KINGDOM_FIGURE_HEIGHT;
  const k = tall / DEER.box.h;
  const w = DEER.box.w * k;
  const box = { x: base.x - w / 2, y: base.y - tall, w, h: tall };
  const restAt = T(apple.t0 + 1800);
  const motion = loop(period, path);
  const headMotion = loop(period, headKeys);
  const full = { x: 0, y: 0, w, h: tall };
  return {
    id: 'hevalo',
    kind: 'deer',
    tap: 'deer',
    box,
    origin: [0.5, 1],
    motion,
    still: poseAt(motion.frames, restAt),
    children: [
      { sprite: 'shadow', box: { x: w / 2 - 4.4, y: tall - 1.6, w: 8.8, h: 2.6 }, origin: [0.5, 0.5], still: REST },
      {
        box: full,
        origin: [0.5, 1],
        motion: loop(period, gait),
        still: REST,
        children: [
          { sprite: 'deerBody', box: full, origin: [0.5, 1], still: REST },
          {
            box: full,
            origin: DEER.head,
            motion: headMotion,
            still: poseAt(headMotion.frames, restAt),
            children: [
              { sprite: 'deerCrown', box: full, origin: DEER.head, still: REST },
              { sprite: 'deerEar', box: full, origin: DEER.ear, motion: loop(period, earKeys), still: REST },
              { sprite: 'deerHead', box: full, origin: DEER.head, still: REST },
              { sprite: 'deerEyes', box: full, origin: DEER.head, motion: blink(3900, false), still: REST },
              { sprite: 'deerBlink', box: full, origin: DEER.head, motion: blink(3900, true), still: { ...REST, o: 0 } },
              { sprite: 'deerHappy', box: full, origin: DEER.head, role: 'happy', still: { ...REST, o: 0 } },
            ],
          },
        ],
      },
    ],
  };
}

/** One of the course's people standing by a building: a breath now and then, a blink, and a word of praise for a tap. */
function standing(id: 'hamo' | 'xezo', at: { x: number; y: number }, building: KingdomBuilding, period: number): KingdomActor {
  const art = id === 'hamo' ? HAMO : XEZO;
  const tall = KINGDOM_FIGURE_HEIGHT;
  const k = tall / art.box.h;
  const w = art.box.w * k;
  const full = { x: 0, y: 0, w, h: tall };
  const [body, eyes, shut, face] = id === 'hamo' ? (['hamo', 'hamoEyes', 'hamoBlink', 'hamoFace'] as const) : (['xezo', 'xezoEyes', 'xezoBlink', 'xezoFace'] as const);
  return {
    id,
    kind: 'person',
    tap: 'person',
    building,
    box: { x: at.x - w / 2, y: at.y - tall, w, h: tall },
    origin: [0.5, 1],
    motion: loop(period, [{ t: 0, sy: 1 }, { t: 0.4, sy: 1.014 }, { t: 0.8, sy: 1 }, { t: 1, sy: 1 }]),
    still: REST,
    children: [
      { sprite: 'shadow', box: { x: w / 2 - 5, y: tall - 1.6, w: 10, h: 2.8 }, origin: [0.5, 0.5], still: REST },
      { sprite: body, box: full, origin: [0.5, 1], still: REST },
      { sprite: eyes, box: full, origin: [0.5, 1], motion: blink(period * 1.3, false), still: REST },
      { sprite: shut, box: full, origin: [0.5, 1], motion: blink(period * 1.3, true), still: { ...REST, o: 0 } },
      { sprite: face, box: full, origin: [0.5, 1], still: REST },
    ],
  };
}

/** Where the hen's parts join, in her sprites' units: her hips, the foot of her neck, her wing's shoulder; and how tall she stands in them, comb to toes. */
const HEN = { hips: [[-1.4, -1.8], [1.2, -1.6]] as const, neck: [3.2, -8.6] as Pt, shoulder: [2.6, -7.4] as Pt, tall: 17 };
const CHICK_TALL = 7.4;

/**
 * A hen about a yard, and the chicks that hurry after her: she walks from
 * spot to spot on her two legs, and at each she scratches the ground back
 * with one foot and pecks at what she turned up; at one spot she flutters up
 * with a beat of her wings. Each chick runs her way a moment after her, a
 * little behind, hopping as it goes, and dips its head when she pecks.
 */
function henAndChicks(id: string, to: ToCanvas, stops: readonly Stop[], phase: number, chicks: number, building?: KingdomBuilding, speed = 3.4): KingdomActor[] {
  const k = KINGDOM_ANIMAL_HEIGHT.hen / HEN.tall;
  const w = walk(to, stops, speed, 1.6, 0.4);
  const start = to(...stops[0]!.at);
  const box = boxAt('henBody', start, k);
  const b = SPRITE_BOX.henBody;
  const full = { x: 0, y: 0, w: box.w, h: box.h };
  const share = ([x, y]: Pt): Pt => [(x - b.x) / b.w, (y - b.y) / b.h];
  const lb = SPRITE_BOX.henLeg;
  const flip = loop(w.period, w.face, phase);
  const legs: KingdomNode[] = HEN.hips.map(([hx, hy], i) => ({
    sprite: 'henLeg' as const,
    box: { x: (hx - b.x + lb.x) * k, y: (hy - b.y + lb.y) * k, w: lb.w * k, h: lb.h * k },
    origin: anchor('henLeg'),
    // the near leg walks and scratches; the far one walks the other way
    motion: i === 1 ? loop(w.period, w.scratch, phase) : loop(w.period, w.legs.map((key) => ({ ...key, r: -(key.r ?? 0) })), phase),
    still: REST,
  }));
  const parts: KingdomNode[] = [
    ...legs,
    { sprite: 'henBody', box: full, origin: anchor('henBody'), still: REST },
    { ...layer('henWing', full, share(HEN.shoulder), loop(w.period, w.wing, phase), REST), role: 'wing' },
    { ...layer('henHead', full, share(HEN.neck), loop(w.period, w.head, phase), { ...REST, r: 30 }), role: 'head' },
  ];
  const out: KingdomActor[] = [
    {
      id,
      kind: 'animal',
      tap: 'flutter',
      building,
      box,
      origin: anchor('henBody'),
      motion: loop(w.period, w.path, phase),
      still: REST,
      children: [
        { sprite: 'shadow', box: { x: box.w / 2 - 9.6 * k, y: box.h - 5.4 * k, w: 19.2 * k, h: 5.8 * k }, origin: [0.5, 0.5], still: REST },
        {
          box: full,
          origin: anchor('henBody'),
          motion: flip,
          still: { ...REST, sx: flip.frames[0]!.sx },
          children: [
            // her flutter lifts her on a node of its own, so her chicks hop only with her steps
            { box: full, origin: anchor('henBody'), motion: loop(w.period, w.rise, phase), still: REST, children: [{ box: full, origin: anchor('henBody'), motion: loop(w.period, w.gait, phase), still: REST, children: parts }] },
          ],
        },
      ],
    },
  ];
  // each chick runs her way a little after her and a little behind, hopping as it goes, and dips its head as she pecks
  const ck = KINGDOM_ANIMAL_HEIGHT.chick / CHICK_TALL;
  const dir = w.face[0]!.sx ?? 1;
  for (let c = 0; c < chicks; c++) {
    const lag = (380 + c * 260) / w.period;
    const p = (phase - lag + 1) % 1;
    const at = { x: start.x - dir * (3.2 + c * 2.4), y: start.y + 1.2 + (c % 2) * 1.8 };
    const cbox = boxAt('chick', at, ck);
    const cfull = { x: 0, y: 0, w: cbox.w, h: cbox.h };
    const hop = w.gait.map((key) => ({ t: key.t, y: (key.y ?? 0) * 1.9 }));
    const dip = w.head.map((key) => ({ t: key.t, r: (key.r ?? 0) * 0.5 }));
    const cflip = loop(w.period, w.face, p);
    out.push({
      id: `${id}chick${c}`,
      kind: 'animal',
      building,
      box: cbox,
      origin: anchor('chick'),
      motion: loop(w.period, w.path, p),
      still: REST,
      children: [
        { sprite: 'shadow', box: { x: cbox.w / 2 - 2, y: cbox.h - 1.6, w: 4, h: 1.6 }, origin: [0.5, 0.5], still: REST },
        {
          box: cfull,
          origin: anchor('chick'),
          motion: cflip,
          still: { ...REST, sx: cflip.frames[0]!.sx },
          children: [{ box: cfull, origin: [0.5, 1], motion: loop(w.period, hop, p), still: REST, children: [{ sprite: 'chick', box: cfull, origin: [0.6, 0.9], motion: loop(w.period, dip, p), still: REST }] }],
        },
      ],
    });
  }
  return out;
}

/** Pigeons wheeling round the dovecote: a few birds on one circuit, a little apart, each beating its wings in its own time. */
function pigeons(id: string, at: { x: number; y: number }): KingdomActor {
  const k = 0.5;
  const pb = SPRITE_BOX.pigeon;
  const pw = { w: pb.w * k, h: pb.h * k };
  const span = 60;
  const box = { x: at.x - span / 2, y: at.y - 40, w: span, h: 40 };
  // the circuit: out and round in a flattened ring, each bird facing the way it flies
  const ring = (p: number): KingdomMotion =>
    loop(
      8000,
      Array.from({ length: 13 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return { t: i / 12, x: Math.round(Math.cos(a) * 22 * 10) / 10, y: Math.round(Math.sin(a) * 9 * 10) / 10 };
      }),
      p,
    );
  const facing = (p: number): KingdomMotion => loop(8000, [{ t: 0, sx: -1 }, { t: 0.49, sx: -1 }, { t: 0.51, sx: 1 }, { t: 0.98, sx: 1 }, { t: 1, sx: -1 }], p);
  return {
    id,
    kind: 'sky',
    box,
    origin: [0.5, 0.5],
    still: REST,
    children: [0, 0.12, 0.27].map((p, i) => {
      const f = facing(p);
      const self = { x: span / 2 - pw.w / 2, y: 18 - i * 4, w: pw.w, h: pw.h };
      return {
        box: self,
        origin: [0.5, 0.5] as Pt,
        motion: ring(p),
        still: { ...REST, x: [-14, 4, 16][i]!, y: [-2, 4, -5][i]! },
        children: [
          {
            box: { x: 0, y: 0, w: pw.w, h: pw.h },
            origin: [0.5, 0.5] as Pt,
            motion: f,
            still: { ...REST, sx: f.frames[0]!.sx },
            children: [
              { sprite: 'pigeon' as const, box: { x: 0, y: 0, w: pw.w, h: pw.h }, origin: anchor('pigeon'), still: REST },
              {
                sprite: 'pigeonWing' as const,
                box: { x: 0, y: 0, w: pw.w, h: pw.h },
                origin: [(0.2 - pb.x) / pb.w, (-0.7 - pb.y) / pb.h] as Pt,
                motion: loop(300 + i * 40, [{ t: 0, sy: 1 }, { t: 0.5, sy: -0.7 }, { t: 1, sy: 1 }], i * 0.3),
                still: REST,
              },
            ],
          },
        ],
      };
    }),
  };
}

/** Where, in each building's own units, its chimneys stand (the top of each), and the level each is built at. */
export const CHIMNEYS: Readonly<Record<KingdomBuilding, readonly { from: KingdomLevel; at: readonly [number, number, number] }[]>> = {
  houses: [
    { from: 3, at: [71.4, 11.2, 29.8] },
    { from: 5, at: [13.4, 17.6, 65.6] },
  ],
  school: [{ from: 3, at: [29, 9.2, 32.4] }],
  teahouse: [{ from: 2, at: [31.9, 13, 29.8] }],
  spring: [],
  market: [],
  orchard: [],
};

/** Where the life sits that belongs to buildings, in each building's own units: the spring's water, the hives' bees, the cat's roof, where the people stand. */
const SPRING_WATER = { pool: [30, 32, 0.4], basin: [31, 29, 6], spout: [31, 21, 9.6] } as const;
const HIVE = [82, 14, 10] as const;
const ROOF_CAT = [44, 58, 20 + SLAB] as const;
const BY_TEAHOUSE = [62, 66, 0] as const;
const BY_SCHOOL = [64, 70, 0] as const;

/** A building's own point on the canvas. */
export type InPlot = (b: KingdomBuilding, x: number, y: number, z: number) => { x: number; y: number };

/** A grid of points spread through a pen, kept clear of its fences, in world units. */
function inPen(pen: { x: number; y: number; w: number; d: number }, i: number, count: number, rand: () => number): [number, number] {
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const c = i % cols;
  const r = Math.floor(i / cols);
  const rows = Math.ceil(count / cols);
  return [pen.x + 14 + ((c + 0.3 + rand() * 0.4) / cols) * (pen.w - 28), pen.y + 12 + ((r + 0.3 + rand() * 0.4) / rows) * (pen.d - 34)];
}

/** A small seeded scatter for the cast, so a crowd of the same loop is never in step and the same levels always move the same. */
function scatter(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Everything that moves in the village at these levels: the sky, the water,
 * the smoke, what sways, the animals, Hevalo and the people, back to front
 * (an app lays them in this order). `to` places world points on the canvas;
 * `inPlot` places a building's own points.
 */
export function lifeOf(levels: Readonly<Record<KingdomBuilding, KingdomLevel>>, village: number, to: ToCanvas, inPlot: InPlot, swaying: { poplars: readonly (readonly number[])[]; kilim: readonly number[]; banners: readonly (readonly number[])[] }, origin: { x: number; y: number }): KingdomActor[] {
  const has = (f: VillageFeature): boolean => villageHas(village, f);
  const flock = villageFlock(village);
  const rand = scatter(village * 7919 + 17);
  const S = (sx: number, sy: number): { x: number; y: number } => ({ x: origin.x + sx, y: origin.y + sy });
  const F0 = FLOOR_Z;
  const ground: KingdomActor[] = [];
  const shadows: KingdomActor[] = [];
  const sky: KingdomActor[] = [];

  // the sky: clouds drifting across the top of the world, fading in and out at its ends, and their shadows sliding over the land below
  const clouds: [number, number, number, number][] = [
    [-80, 60, 1.4, 0.1],
    [-80, 150, 1.1, 0.45],
    [-80, 110, 0.9, 0.75],
    [-80, 210, 1.2, 0.3],
  ];
  clouds.forEach(([x, y, k, p], i) => {
    const run = 2200;
    const period = 150000 - i * 21000;
    const drift: Key[] = [{ t: 0, x: 0, o: 0 }, { t: 0.04, o: 1 }, { t: 0.96, o: 1 }, { t: 1, x: run, o: 0 }];
    sky.push({ id: `cloud${i}`, kind: 'sky', sprite: 'cloud', box: boxAt('cloud', { x, y }, k), origin: [0.5, 0.5], motion: loop(period, drift, p), still: { ...REST, x: 420 + i * 380 } });
    shadows.push({ id: `cloudshade${i}`, kind: 'sky', sprite: 'cloudShadow', box: boxAt('cloudShadow', { x: x - 60, y: y + 420 + i * 160 }, k * 2.6), origin: [0.5, 0.5], motion: loop(period, drift, p), still: { ...REST, x: 420 + i * 380 } });
  });
  const flap = loop(560, [{ t: 0, sy: 1 }, { t: 0.5, sy: -0.5 }, { t: 1, sy: 1 }]);
  [[300, 230, 0.2], [900, 120, 0.7]].forEach(([x, y, p], i) => {
    sky.push({
      id: `birds${i}`,
      kind: 'sky',
      box: boxAt('birds', { x: x!, y: y! }, 1.1),
      origin: [0.5, 0.5],
      motion: loop(34000 + i * 9000, [{ t: 0, x: 0, y: 0, o: 0 }, { t: 0.03, o: 1 }, { t: 0.66, x: 1500, y: -140, o: 1 }, { t: 0.7, o: 0 }, { t: 1, x: 1500, y: -140, o: 0 }], p!),
      still: { ...REST, x: 400, y: -40 },
      children: [{ sprite: 'birds', box: { x: 0, y: 0, w: 32 * 1.1, h: 14 * 1.1 }, origin: [0.5, 0.5], motion: flap, still: REST }],
    });
  });
  if (has('dovecote')) ground.push(pigeons('pigeons', to(DOVECOTE[0], DOVECOTE[1], F0 + 30)));

  // fireflies over the meadows, which only show at dusk: each swarm drifting about its patch, each speck blinking in its own time
  [[560, 260], [320, 470], [860, 360], [140, 640], [470, 120]].forEach(([sx, sy], i) => {
    ground.push({
      id: `fireflies${i}`,
      kind: 'sky',
      box: boxAt('fireflies', S(sx!, sy! - 14)),
      origin: [0.5, 0.5],
      motion: loop(7000 + i * 900, [{ t: 0, x: 0, y: 0, o: 0.4 }, { t: 0.25, x: 10, y: -6, o: 1 }, { t: 0.5, x: 4, y: -12, o: 0.5 }, { t: 0.75, x: -8, y: -4, o: 1 }, { t: 1, x: 0, y: 0, o: 0.4 }], (i * 0.37) % 1),
      still: REST,
    });
  });

  // the lake: light shimmering across it, a fish leaping now and then, rings where it lands
  const shimmer: [number, number][] = [[-700, 160], [-420, 120], [-250, 260], [-760, 420], [-480, 480], [-300, 600], [-620, 660], [-120, 470], [-820, 760]];
  shimmer.forEach(([sx, sy], i) => {
    ground.push({
      id: `shimmer${i}`,
      kind: 'water',
      sprite: 'shimmer',
      box: boxAt('shimmer', S(sx, sy), 1.2),
      origin: [0.5, 0.5],
      motion: loop(5200 + i * 430, [{ t: 0, x: -10, o: 0 }, { t: 0.3, o: 0.9 }, { t: 0.7, o: 0.9 }, { t: 1, x: 22, o: 0 }], (i * 0.37) % 1),
      still: { ...REST, o: 0.7 },
    });
  });
  [[-380, 360], [-700, 560], [-200, 700]].forEach(([sx, sy], i) => {
    const at = S(sx!, sy!);
    const period = 9000 + i * 2600;
    const jump: Key[] = [
      { t: 0, x: 0, y: 0, r: -40, o: 0 },
      { t: 0.8, x: 0, y: 0, r: -40, o: 0 },
      { t: 0.81, o: 1 },
      { t: 0.86, x: 9, y: -14, r: 0 },
      { t: 0.91, x: 18, y: 0, r: 50, o: 1 },
      { t: 0.92, o: 0 },
      { t: 1, x: 0, y: 0, r: -40, o: 0 },
    ];
    ground.push({ id: `fish${i}`, kind: 'water', sprite: 'fish', box: boxAt('fish', at, 0.55), origin: [0.5, 0.5], motion: loop(period, jump.map((key) => ({ ...key, x: key.x === undefined ? undefined : key.x * 0.5, y: key.y === undefined ? undefined : key.y * 0.6 })), i * 0.3), still: { ...REST, o: 0 } });
    const splash: Key[] = [{ t: 0, sx: 0.2, sy: 0.2, o: 0 }, { t: 0.905, sx: 0.2, sy: 0.2, o: 0 }, { t: 0.92, o: 1 }, { t: 1, sx: 1.2, sy: 1.2, o: 0 }];
    ground.push({ id: `splash${i}`, kind: 'water', sprite: 'ripple', box: boxAt('ripple', { x: at.x + 9, y: at.y + 1 }, 0.6), origin: [0.5, 0.5], motion: loop(period, splash, i * 0.3), still: { ...REST, o: 0 } });
  });

  // the waterfall: its streaks falling down it, its foam heaving at the foot, rings spreading from it
  {
    const { x, top, bottom, w } = WATERFALL;
    const at = S(x, top + 6);
    const h = bottom - top - 14;
    const k = (w * 0.92) / CREATURE_BOX.flow.w;
    const tile = CREATURE_BOX.flow.h * k;
    // the streaks repeat every quarter of their sprite, so sliding them down by that much loops without a seam
    const count = Math.ceil(h / tile) + 1;
    ground.push({
      id: 'waterfall',
      kind: 'water',
      box: { x: at.x - (w * 0.92) / 2, y: at.y, w: w * 0.92, h },
      origin: [0.5, 0],
      clip: true,
      still: REST,
      children: Array.from({ length: count }, (_, i) => ({
        sprite: 'flow' as const,
        box: { x: 0, y: i * tile - tile / 4, w: w * 0.92, h: tile },
        origin: [0.5, 0] as Pt,
        motion: loop(1400, [{ t: 0, y: 0 }, { t: 1, y: tile / 4 }]),
        still: REST,
      })),
    });
    [[-8, 0], [6, 0.5]].forEach(([dx, p], i) => {
      ground.push({ id: `foam${i}`, kind: 'water', sprite: 'foam', box: boxAt('foam', S(x + dx!, bottom - 2), 1.2), origin: [0.5, 1], motion: loop(1100, [{ t: 0, sx: 1, sy: 1 }, { t: 0.5, sx: 1.12, sy: 0.86 }, { t: 1, sx: 1, sy: 1 }], p!), still: REST });
    });
    ground.push(...ripples('fallrings', S(x, bottom + 10), 2.6, undefined, 2200));
  }

  // the stream: glints running down it, out of the woods and away
  for (let g = 0; g < 4; g++) {
    // from where the stream first shows inside the world, down to where the woods take it
    const pts = STREAM.slice(1).map(([sx, sy]) => to(sx, sy, F0));
    const base = pts[0]!;
    const keys: Key[] = pts.map((p, i) => ({ t: i / (pts.length - 1), x: p.x - base.x, y: p.y - base.y }));
    keys[0]!.o = 0;
    keys.splice(1, 0, { t: 0.06, o: 1 });
    keys.push({ t: 0.94, o: 1 });
    keys[keys.length - 2]!.o = 0;
    const sorted = keys.sort((a, b) => a.t - b.t);
    ground.push({ id: `streamglint${g}`, kind: 'water', sprite: 'drop', box: boxAt('drop', { x: base.x + (g % 2 ? 3 : -3), y: base.y }, 1.6), origin: [0.5, 0.5], motion: loop(9000, sorted, g * 0.25), still: { ...REST, o: 0 } });
  }

  // the spring: rings on its pool or its basin, its trickle from the spout, and the stream falling into the lake
  if (levels.spring >= 1) {
    const [px, py, pz] = levels.spring >= 2 ? SPRING_WATER.basin : SPRING_WATER.pool;
    ground.push(...ripples('ripple', inPlot('spring', px, py, pz), 1.1, 'spring'));
    if (levels.spring >= 2) {
      const [sx, sy, sz] = SPRING_WATER.spout;
      ground.push(fall('spout', inPlot('spring', sx, sy, sz), 4.2, 'spring', 0.9));
    }
    const top = to(247, 340, 0);
    const foot = to(247, 340, WATER_Z);
    ground.push(fall('falls', { x: top.x, y: top.y + 2 }, foot.y - top.y - 2, 'spring', levels.spring >= 4 ? 2 : levels.spring >= 2 ? 1.6 : 1.2));
  }

  // the mill's wheel turning on its edge, and the boat bobbing at the dock
  if (has('mill')) {
    const { at, r } = millWheel(MILL[0], MILL[1], F0);
    const hub = to(...at);
    const d = (r * 2 * 1.1) / CREATURE_BOX.wheel.w;
    const size = CREATURE_BOX.wheel.w * d;
    ground.push({
      id: 'millwheel',
      kind: 'water',
      box: { x: hub.x - size / 2, y: hub.y - size / 2, w: size, h: size },
      origin: [0.5, 0.5],
      // the wheel stands in the plane facing down and to the right: a circle squashed, then turned
      still: { ...REST, r: -52 },
      children: [{ box: { x: 0, y: 0, w: size, h: size }, origin: [0.5, 0.5], still: { ...REST, sx: 1.28, sy: 0.78 }, children: [{ sprite: 'wheel', box: { x: 0, y: 0, w: size, h: size }, origin: [0.5, 0.5], motion: loop(4200, [{ t: 0, r: 0 }, { t: 1, r: 360 }]), still: REST }] }],
    });
  }
  if (has('boat')) {
    const at = to(BOAT[0], BOAT[1], WATER_Z);
    ground.push({ id: 'boat', kind: 'water', sprite: 'boat', box: boxAt('boat', { x: at.x, y: at.y - 4 }, 1), origin: [0.5, 0.7], motion: loop(3600, [{ t: 0, y: 0, r: 0 }, { t: 0.25, y: -1.4, r: 2 }, { t: 0.5, y: 0, r: 0 }, { t: 0.75, y: 1, r: -2 }, { t: 1, y: 0, r: 0 }]), still: REST });
  }

  // gusts running over the fields of grain and greens
  FIELDS.forEach((f, i) => {
    const crop = f.crop(has);
    if (!crop || crop === 'plot') return;
    const a = to(f.x, f.y + f.d / 2, F0 + 4);
    const b = to(f.x + f.w, f.y + f.d / 2, F0 + 4);
    ground.push({
      id: `gust${i}`,
      kind: 'sway',
      sprite: 'gust',
      box: boxAt('gust', a, 1.1),
      origin: [0.5, 0.5],
      motion: loop(4600 + i * 700, [{ t: 0, x: 0, y: 0, o: 0 }, { t: 0.15, o: 1 }, { t: 0.65, o: 1 }, { t: 0.8, x: (b.x - a.x) * 0.85, y: (b.y - a.y) * 0.85, o: 0 }, { t: 1, x: 0, y: 0, o: 0 }], i * 0.29),
      still: { ...REST, o: 0 },
    });
  });

  // smoke from the tenûr, always, from the camp's fire, and from each chimney built; the camp's flame flickering
  ground.push(...smokeFrom('tenur', to(230 + 7.5 * 1.25, 62 + 7.5 * 1.25, 34 + 11 * 1.25)));
  for (const b of Object.keys(CHIMNEYS) as KingdomBuilding[]) {
    CHIMNEYS[b].forEach((c, i) => {
      if (levels[b] >= c.from) ground.push(...smokeFrom(`${b}smoke${i}`, inPlot(b, ...c.at), b, 0.27 * (i + 1)));
    });
  }
  {
    const fire = to(CAMP.fire[0], CAMP.fire[1], F0);
    ground.push({ id: 'campflame', kind: 'smoke', sprite: 'flame', box: boxAt('flame', { x: fire.x, y: fire.y - 1 }, 1.1), origin: [0.5, 1], motion: loop(700, [{ t: 0, sx: 1, sy: 1 }, { t: 0.3, sx: 0.9, sy: 1.14 }, { t: 0.6, sx: 1.08, sy: 0.9 }, { t: 1, sx: 1, sy: 1 }]), still: REST });
    ground.push(...smokeFrom('campsmoke', { x: fire.x, y: fire.y - 10 }, undefined, 0.4));
  }

  // poplars in the village and along the road, the groves' trees, each swaying in its own time
  swaying.poplars.forEach(([x, y, z, tall], i) => ground.push(sway(`poplar${i}`, 'poplar', to(x!, y!, z!), tall! / 64, 1.6, 5200 + i * 700, i * 0.31, anchor('poplar'))));
  if (has('poplars')) ROAD_POPLARS.forEach(([x, y], i) => ground.push(sway(`roadpoplar${i}`, 'poplar', to(x, y, F0), 56 / 64, 1.8, 4800 + i * 530, 0.17 + i * 0.23, anchor('poplar'))));
  GROVE_TREES.forEach((t, i) => ground.push(sway(`tree${i}`, 'tree', S(t.x, t.y), t.h / 58, 1.4, 6000 + (i % 7) * 610, (i * 0.137) % 1, anchor('tree'))));

  // the kilims on their lines, the banners by the gate, the washing
  {
    const [x, y, z] = swaying.kilim;
    ground.push(sway('kilim', 'kilim', to(x!, y!, z!), SCENERY, 3, 3800, 0.2, [0.48, 0.24]));
  }
  swaying.banners.forEach(([x, y, z], i) => ground.push(sway(`banner${i}`, 'banner', to(x!, y!, z! + 30 * SCENERY), SCENERY, 5, 3000 + i * 400, i * 0.4, [0.5, 0.1])));
  if (has('kilims')) KILIMS.forEach(([x, y, len], i) => ground.push(sway(`valleykilim${i}`, 'kilim', to(x, y, F0), len / 20, 3, 4000 + i * 600, 0.3 + i * 0.4, [0.48, 0.24])));
  if (has('laundry')) {
    laundryCloths(DAY, LAUNDRY.x, LAUNDRY.y, F0, LAUNDRY.len).forEach((c, i) => {
      const sprite = (['clothA', 'clothB', 'clothC', 'clothD'] as const)[i % 4]!;
      ground.push(sway(`laundry${i}`, sprite, S(c.at[0], c.at[1]), 1, 7, 1900 + i * 260, i * 0.21, anchor(sprite)));
    });
  }

  // the animals: the camp's sheep from the first, the hill's goats, the hens by the tenûr, the dog on the road
  const campSheep: Stop[][] = [
    [{ at: [480, -120, F0], wait: 6000, graze: true }, { at: [506, -108, F0], wait: 5000, graze: true }],
    [{ at: [522, -90, F0], wait: 7000, graze: true }, { at: [500, -80, F0], wait: 2600 }, { at: [532, -70, F0], wait: 5200, graze: true }],
  ];
  campSheep.slice(0, flock.campSheep).forEach((stops, i) => ground.push(animal(`campsheep${i}`, to, 'sheep', stops, 3.6 + rand() * 0.8, (i * 0.4 + rand() * 0.2) % 1, i === 1 ? 0.8 : 1)));
  ground.push(animal('goat0', to, 'goat', [{ at: [10, -40, 48], wait: 5200, graze: true }, { at: [26, -34, 48], wait: 3600, idle: 'look' }, { at: [40, -36, 60], wait: 4200, graze: true }, { at: [22, -46, 54], wait: 2000, idle: 'chew' }], 4.4, 0.1));
  ground.push(animal('goat1', to, 'goat', [{ at: [86, -74, 48], wait: 6400, graze: true }, { at: [98, -70, 62], wait: 2600, idle: 'look' }, { at: [80, -84, 56], wait: 3000, graze: true }], 4, 0.6, 0.8));
  ground.push(...henAndChicks('hen0', to, [{ at: [236, 94, 34], wait: 3800, idle: 'peck' }, { at: [248, 98, 34], wait: 3000, idle: 'peck' }, { at: [242, 86, 34], wait: 2600, idle: 'flutter' }], 0, 0));
  ground.push(...henAndChicks('hen1', to, [{ at: [250, 80, 34], wait: 4200, idle: 'peck' }, { at: [255, 86, 34], wait: 3400, idle: 'peck' }], 0.33, 0));
  ground.push(
    animal(
      'dog',
      to,
      'dog',
      [
        { at: [330, 336, 0], wait: 3400, idle: 'sit' },
        { at: [452, 336, F0] },
        { at: [575, 336, F0], wait: 1600, idle: 'sniff' },
        { at: [575, 120, F0], wait: 4200, idle: 'sit' },
        { at: [575, 336, F0] },
        { at: [760, 336, F0], wait: 1800, idle: 'sniff' },
        { at: [760, 470, F0] },
        { at: [900, 470, F0], wait: 3000, idle: 'sit' },
        { at: [760, 470, F0] },
        { at: [760, 336, F0] },
        { at: [452, 336, F0] },
      ],
      13,
      0.15,
    ),
  );

  // as the village grows: the sheepfold, the goatfold with a goat up on its rock, the hens and chicks in their yard, the cow and the donkey
  const { sheepfold, goatfold, paddock, coop } = PENS;
  for (let i = 0; i < flock.sheep; i++) {
    const a = inPen(sheepfold, i, flock.sheep, rand);
    const b = inPen(sheepfold, (i + 1) % flock.sheep, flock.sheep, rand);
    const idle: Idle = i % 3 === 1 ? 'chew' : i % 3 === 2 ? 'look' : 'graze';
    ground.push(animal(`sheep${i}`, to, 'sheep', [{ at: [a[0], a[1], F0], wait: 4200 + rand() * 3000, graze: true }, { at: [b[0], b[1], F0], wait: 3000 + rand() * 2400, idle }], 3.4 + rand(), (i * 0.29 + rand() * 0.1) % 1, i % 4 === 3 ? 0.75 : 1));
  }
  for (let i = 0; i < flock.goats; i++) {
    const a = inPen(goatfold, i, flock.goats, rand);
    const stops: Stop[] =
      i === 0
        ? [{ at: [a[0], a[1], F0], wait: 4000, graze: true }, { at: [goatfold.x + 40, goatfold.y + 30, F0 + 9], wait: 5200, idle: 'look' }]
        : [{ at: [a[0], a[1], F0], wait: 4000 + rand() * 2400, graze: true }, { at: [a[0] + 12, a[1] - 6, F0], wait: 2400 + rand() * 1600, idle: 'chew' }];
    ground.push(animal(`foldgoat${i}`, to, 'goat', stops, 4 + rand(), (i * 0.41) % 1, i % 3 === 2 ? 0.75 : 1));
  }
  for (let i = 0; i < flock.hens; i++) {
    const a: [number, number, number] = [coop.x + 8 + i * 9, coop.y + 8 + (i % 2) * 7, F0];
    const b: [number, number, number] = [coop.x + 18 + i * 7, coop.y + 15 - (i % 2) * 5, F0];
    const c: [number, number, number] = [coop.x + 12 + i * 8, coop.y + 20 - (i % 3) * 3, F0];
    const stops: Stop[] = [
      { at: a, wait: 2600 + rand() * 2000, idle: 'peck' },
      { at: b, wait: 2400 + rand() * 1800, idle: i % 2 ? 'peck' : 'flutter' },
      { at: c, wait: 2000 + rand() * 1600, idle: 'peck' },
    ];
    ground.push(...henAndChicks(`coophen${i}`, to, stops, (i * 0.27 + rand() * 0.1) % 1, i === 0 ? flock.chicks : 0, undefined, 3 + rand()));
  }
  if (flock.cows > 0) ground.push(animal('cow', to, 'cow', [{ at: [paddock.x + 30, paddock.y + 22, F0], wait: 7000, graze: true }, { at: [paddock.x + 64, paddock.y + 30, F0], wait: 6000, idle: 'chew' }], 3, 0.2));
  if (flock.donkeys > 0) ground.push(animal('donkey', to, 'donkey', [{ at: [paddock.x + 90, paddock.y + 16, F0], wait: 5200, idle: 'look' }, { at: [paddock.x + 76, paddock.y + 34, F0], wait: 6400, graze: true }], 3.4, 0.55));

  // the village's people at their chores, more of them as it grows: the shepherd among the camp's sheep, bread slapped into the tenûr,
  // a farmer hoeing the wheat, children running about the coop, water carried up from the spring, an elder with his tea by the tea
  // house, a rider on his donkey along the road, a weaver at the loom
  const plot = (b: KingdomBuilding): ToCanvas => (x, y, z) => inPlot(b, x, y, z);
  if (has('shepherd')) ground.push(villager('shepherd', 'shepherd', to, [{ at: [466, -110, F0], wait: 5200, idle: 'work' }, { at: [498, -94, F0], wait: 4200, idle: 'look' }, { at: [524, -116, F0], wait: 4800, idle: 'work' }], 4.5, 0.12, 'staff'));
  if (has('baker')) ground.push(villager('baker', 'baker', to, [{ at: [224, 80, 34], wait: 12000, idle: 'work' }], 1, 0, 'bread'));
  if (has('farmer')) {
    const farm: Stop[] = [{ at: [490, 172, F0], wait: 5600, idle: 'work' }, { at: [528, 172, F0], wait: 5600, idle: 'work' }, { at: [528, 198, F0], wait: 5600, idle: 'work' }, { at: [490, 198, F0], wait: 5600, idle: 'work' }];
    ground.push(villager('farmer', 'farmer', to, farm, 6, 0.3, 'hoe'));
  }
  if (has('children')) {
    const round: Stop[] = [{ at: [462, 298, F0], wait: 700, idle: 'look' }, { at: [498, 308, F0] }, { at: [522, 294, F0], wait: 500 }, { at: [500, 300, F0] }];
    ground.push(villager('boy', 'boy', to, round, 15, 0, 'still'), villager('girl', 'girl', to, round, 15, 0.12, 'still'));
  }
  if (has('waterCarrier')) ground.push(villager('carrier', 'carrier', to, [{ at: [262, 318, 0], wait: 2600, idle: 'look' }, { at: [306, 318, 0] }, { at: [306, 248, 0], wait: 2200 }, { at: [306, 318, 0] }], 6.5, 0.4, 'still'));
  if (has('elder')) ground.push(villager('elder', 'elder', plot('teahouse'), [{ at: [36, 74, 0], wait: 14000, idle: 'work' }], 1, 0.2, 'sip', 'teahouse'));
  if (has('rider')) ground.push(animal('rider', to, 'donkey', [{ at: [462, 344, F0], wait: 2600, idle: 'look' }, { at: [740, 344, F0], wait: 3000, idle: 'graze' }], 5.5, 0.35, 1, undefined, true));
  if (has('weaver')) ground.push(villager('weaver', 'weaver', to, [{ at: [432, -50, F0], wait: 12000, idle: 'work' }], 1, 0.5, 'weave'));

  // the cat asleep on the first house's roof, breathing slowly
  if (levels.houses >= 1) {
    const at = inPlot('houses', ...ROOF_CAT);
    ground.push({ id: 'cat', kind: 'animal', building: 'houses', sprite: 'catSleep', box: boxAt('catSleep', at, 0.42), origin: [0.5, 1], motion: loop(3200, [{ t: 0, sy: 1 }, { t: 0.5, sy: 1.08 }, { t: 1, sy: 1 }]), still: REST });
  }
  // bees about the orchard's first hive, and about the valley's hives
  const beesAt = (id: string, at: { x: number; y: number }, building?: KingdomBuilding): KingdomActor => ({
    id,
    kind: 'animal',
    building,
    box: boxAt('bees', { x: at.x, y: at.y - 5 }, 0.55),
    origin: [0.5, 0.5],
    motion: loop(5200, [{ t: 0, x: 0, y: 0 }, { t: 0.25, x: 4, y: -3 }, { t: 0.5, x: 0, y: -5 }, { t: 0.75, x: -4, y: -2 }, { t: 1, x: 0, y: 0 }]),
    still: REST,
    children: [{ sprite: 'bees', box: { x: 0, y: 0, w: 16 * 0.55, h: 12 * 0.55 }, origin: [0.5, 0.5], motion: loop(1800, [{ t: 0, r: 0 }, { t: 0.5, r: 180 }, { t: 1, r: 360 }]), still: REST }],
  });
  if (levels.orchard >= 3) ground.push(beesAt('bees', inPlot('orchard', ...HIVE), 'orchard'));
  if (has('hives')) HIVES.forEach(([x, y], i) => i % 2 === 0 && ground.push(beesAt(`hivebees${i}`, to(x, y, F0 + 12))));
  // butterflies over the orchard, the flowers by the tea house, the fields and the camp
  const butterflies: [number, number, number, number][] = [
    [392, 282, 26, 0],
    [214, 210, 40, 0.5],
    [520, 110, F0 + 14, 0.2],
    [640, 260, F0 + 16, 0.7],
    [440, -20, F0 + 14, 0.35],
  ];
  butterflies.forEach(([x, y, z, p], i) => {
    const wing = loop(320, [{ t: 0, sx: 1 }, { t: 0.5, sx: 0.25 }, { t: 1, sx: 1 }], p);
    ground.push({
      id: `butterfly${i}`,
      kind: 'animal',
      box: boxAt('butterfly', to(x, y, z), 0.5),
      origin: [0.5, 0.5],
      motion: loop(9000 + i * 800, [{ t: 0, x: 0, y: 0 }, { t: 0.2, x: 14, y: -8 }, { t: 0.4, x: 22, y: 4 }, { t: 0.55, x: 8, y: 10 }, { t: 0.75, x: -10, y: 2 }, { t: 0.9, x: -6, y: -8 }, { t: 1, x: 0, y: 0 }], p),
      still: REST,
      children: [{ sprite: 'butterfly', box: { x: 0, y: 0, w: 13 * 0.5, h: 10 * 0.5 }, origin: [0.5, 0.5], motion: wing, still: REST }],
    });
  });

  // Hamo by the tea house once it is a house, Xezal by the school once it stands; and Hevalo
  if (levels.teahouse >= 2) ground.push(standing('hamo', inPlot('teahouse', ...BY_TEAHOUSE), 'teahouse', 3400));
  if (levels.school >= 1) ground.push(standing('xezo', inPlot('school', ...BY_SCHOOL), 'school', 3900));
  ground.push(hevalo(to));

  // back to front: the clouds' shadows on the land, then everything on the ground by where it stands, then the sky's
  const foot = (a: KingdomActor): number => a.box.y + a.box.h + a.still.y;
  return [...shadows, ...ground.map((a, i) => [a, i] as const).sort((a, b) => foot(a[0]) - foot(b[0]) || a[1] - b[1]).map(([a]) => a), ...sky];
}

/**
 * How far an actor reaches on the canvas over its whole loop: its box moved
 * through every frame of its root's motion, with a margin for its children's
 * own small moves. An app moves only the actors whose reach meets its view.
 */
export function kingdomActorReach(a: KingdomActor): { x: number; y: number; w: number; h: number } {
  const frames = a.motion?.frames ?? [];
  const xs = [a.still.x, ...frames.map((f) => f.x)];
  const ys = [a.still.y, ...frames.map((f) => f.y)];
  const m = 24;
  const x0 = a.box.x + Math.min(...xs) - m;
  const y0 = a.box.y + Math.min(...ys) - m;
  return { x: x0, y: y0, w: a.box.w + Math.max(...xs) - Math.min(...xs) + 2 * m, h: a.box.h + Math.max(...ys) - Math.min(...ys) + 2 * m };
}

/** Every sprite the village's life uses, for an app to make once. */
export const KINGDOM_SPRITES: readonly KingdomSprite[] = Object.keys(DRAW) as KingdomSprite[];
