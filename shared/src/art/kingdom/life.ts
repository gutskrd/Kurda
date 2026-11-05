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
import { DAY, DUSK, INK, Part, disc, inked, iso, oval, type Palette } from './pen.js';
import * as P from './props.js';
import { WATER_Z } from './land.js';
import { CREATURES, CREATURE_BOX, type CreatureSprite } from './creatures.js';
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
  | 'hen'
  | 'shadow'
  | 'bees'
  | 'butterfly'
  | 'dust'
  | 'sparkle'
  | CreatureSprite
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
  /** a layer an app shows when the actor is tapped (the deer's happy eyes), hidden otherwise */
  role?: 'happy';
  children?: KingdomNode[];
}

/** What kind of life an actor is. */
export type KingdomLifeKind = 'sky' | 'smoke' | 'water' | 'sway' | 'animal' | 'deer' | 'person';

/** One moving thing in the village, its root node, and the building it belongs to if any. */
export interface KingdomActor extends KingdomNode {
  id: string;
  kind: KingdomLifeKind;
  building?: KingdomBuilding;
  /** something a tap answers: the deer hops for joy, a person says a word of praise */
  tap?: 'deer' | 'person';
}

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
  hen: { x: -7, y: -12, w: 14, h: 13 },
  shadow: { x: -10, y: -3, w: 20, h: 6 },
  bees: { x: -8, y: -6, w: 16, h: 12 },
  butterfly: { x: -5, y: -4, w: 10, h: 8 },
  dust: { x: -34, y: -26, w: 68, h: 30 },
  sparkle: { x: -5, y: -5, w: 10, h: 10 },
  ...CREATURE_BOX,
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

/** A hen (facing right): plump and russet, her tail up, a red comb, yellow legs. */
function hen(pal: Palette): string {
  const p = new Part(0);
  p.line('M-1.4 -3v3M1.4 -3v3', 1.1, '#e0a52e');
  const tail = 'M-4.6 -6.4l-2.2 -4.6l2.6 1.2l0.6 -2.2l1.6 3.2Z';
  const body = 'M-4.6 -6.4q0 -4 4.2 -4.6q2.6 -0.4 3.4 -2.6q0.6 -1.6 2.4 -1.2q1.8 0.6 1.4 2.8l-0.6 1.8q1.4 4.2 -1.6 6.8q-3.4 2.4 -7 0.6q-2.4 -1.2 -2.2 -3.6Z';
  const comb = 'M4.2 -14.6q0.4 -1.8 1.6 -1q0.4 -1.2 1.4 -0.4q0.8 0.6 -0.2 1.6Z';
  p.sil(tail + body + comb);
  p.fill(tail, pal.dusk ? '#7a3d24' : '#8a4424').fill(body, pal.dusk ? '#b0613a' : '#c8703f').fill(comb, '#e2392f');
  p.flat('M-3 -6q2.6 -2.2 6.4 -1.4q-1 3.2 -4.4 3.2q-1.6 -0.4 -2 -1.8Z', pal.dusk ? '#8e4a2a' : '#a2532d');
  p.fill('M7.8 -12.6l2 0.8l-2 0.6Z', '#f2b632', ' stroke-width="0.6"').flat(disc(6.2, -12.8, 0.55), INK).flat('M7 -11.2q0.8 1.6 -0.2 2.2q-0.8 -1 0.2 -2.2Z', '#e2392f');
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

/** A soft flat shadow on the ground under an animal. */
function shadowSprite(): string {
  return `<path d="${oval(0, 0, 9, 2.4)}" fill="${INK}" fill-opacity="0.22" stroke="none"/>`;
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
  hen,
  shadow: () => shadowSprite(),
  bees: () => bees(),
  butterfly,
  dust,
  sparkle,
  ...CREATURES,
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

/** A waypoint for a walker: where, and how long it stays there, and what it does while it stays. */
interface Stop {
  at: readonly [number, number, number];
  /** milliseconds spent here */
  wait?: number;
  /** grazing (head down) or looking about (head up) while waiting */
  graze?: boolean;
}

/** How far a leg swings either way from the hip in a stride, in degrees. */
const STRIDE = 24;

/**
 * The keys of a walk round a loop of stops at `speed` canvas units a second,
 * back to the first: where it is (x, y from the first stop), which way it
 * faces (sx ±1 for an animal seen from the side), when its head is down, the
 * bob of its gait, and the swing of one diagonal pair of its legs (the other
 * pair swings the opposite way). Its legs are still while it stands.
 */
function walk(to: ToCanvas, stops: readonly Stop[], speed: number): { period: number; path: Key[]; face: Key[]; head: Key[]; gait: Key[]; legs: Key[] } {
  const pts = stops.map((s) => to(...s.at));
  let total = 0;
  const marks: { t0: number; t1: number; kind: 'wait' | 'move'; i: number; dir: number; graze: boolean }[] = [];
  for (let i = 0; i < stops.length; i++) {
    const wait = stops[i]!.wait ?? 0;
    if (wait > 0) {
      marks.push({ t0: total, t1: total + wait, kind: 'wait', i, dir: 0, graze: stops[i]!.graze === true });
      total += wait;
    }
    const j = (i + 1) % stops.length;
    const d = Math.hypot(pts[j]!.x - pts[i]!.x, pts[j]!.y - pts[i]!.y);
    const dur = (d / speed) * 1000;
    if (dur > 0) {
      marks.push({ t0: total, t1: total + dur, kind: 'move', i, dir: Math.sign(pts[j]!.x - pts[i]!.x) || 1, graze: false });
      total += dur;
    }
  }
  const base = pts[0]!;
  const path: Key[] = [];
  const face: Key[] = [];
  const head: Key[] = [];
  const gait: Key[] = [];
  const legs: Key[] = [];
  const eps = 0.0005;
  let facing = marks.find((m) => m.kind === 'move')?.dir ?? 1;
  for (const m of marks) {
    const a = m.t0 / total;
    const b = m.t1 / total;
    const from = pts[m.i]!;
    const to2 = m.kind === 'move' ? pts[(m.i + 1) % pts.length]! : from;
    path.push({ t: a, x: from.x - base.x, y: from.y - base.y }, { t: b, x: to2.x - base.x, y: to2.y - base.y });
    if (m.kind === 'move' && m.dir !== facing) {
      face.push({ t: Math.max(0, a - eps), sx: facing }, { t: a, sx: m.dir });
      facing = m.dir;
    }
    // the head goes down to graze a moment after stopping, and comes up a moment before moving on
    const lift = Math.min(0.6, (m.t1 - m.t0) / 4000) * (1000 / total);
    if (m.graze) head.push({ t: a, r: 0 }, { t: a + lift, r: 34 }, { t: b - lift, r: 34 }, { t: b, r: 0 });
    else head.push({ t: a, r: 0 }, { t: b, r: 0 });
    if (m.kind === 'move') {
      const steps = 2 * Math.max(1, Math.round((m.t1 - m.t0) / 640));
      for (let s = 0; s <= steps; s++) {
        const t = a + ((b - a) * s) / steps;
        gait.push({ t, y: s % 2 ? -0.8 : 0 });
        legs.push({ t, r: s === 0 || s === steps ? 0 : s % 2 ? STRIDE : -STRIDE });
      }
    } else {
      gait.push({ t: a, y: 0 }, { t: b, y: 0 });
      legs.push({ t: a, r: 0 }, { t: b, r: 0 });
    }
  }
  const first = marks.find((m) => m.kind === 'move')?.dir ?? 1;
  face.unshift({ t: 0, sx: first });
  face.push({ t: 1, sx: first });
  return { period: total, path, face, head, gait, legs };
}

/** The parts of each four-legged animal: body, head and tail sprites (one box), its legs, and where its hips, neck and tail root are in that box's units. */
const RIGS = {
  sheep: { body: 'fleece', head: 'sheepHead', tail: undefined, leg: 'legDark', hips: [[-8, -4], [5, -4], [-4.6, -4], [8.4, -4]], neck: [8, -10], tailRoot: undefined },
  goat: { body: 'goatBody', head: 'goatHead', tail: undefined, leg: 'legDark', hips: [[-8, -6.5], [5.4, -6.5], [-5, -6.5], [8.4, -6.5]], neck: [8, -16], tailRoot: undefined },
  cow: { body: 'cow', head: 'cowHead', tail: 'cowTail', leg: 'legLight', hips: [[-13, -10.5], [7.6, -10.5], [-9, -10.5], [11.6, -10.5]], neck: [10, -20], tailRoot: [-16, -19] },
  donkey: { body: 'donkey', head: 'donkeyHead', tail: undefined, leg: 'legGrey', hips: [[-11, -12.5], [6.6, -12.5], [-7, -12.5], [10.6, -12.5]], neck: [7, -22], tailRoot: undefined },
  dog: { body: 'dogWalk', head: 'dogHead', tail: undefined, leg: 'legLight', hips: [[-7, -9.5], [5.4, -9.5], [-4, -9.5], [8.4, -9.5]], neck: [7, -14], tailRoot: undefined },
} as const satisfies Record<string, { body: KingdomSprite; head: KingdomSprite; tail: KingdomSprite | undefined; leg: KingdomSprite; hips: readonly (readonly [number, number])[]; neck: Pt; tailRoot: Pt | undefined }>;
type Species = keyof typeof RIGS;

/**
 * A four-legged animal seen from the side, walking a loop of stops: a
 * shadow, then the animal turning to face its way, bobbing in its gait, its
 * legs swinging in diagonal pairs from the hip while it walks, its head going
 * down to graze where it stops, and the cow's tail swishing all the while.
 */
function animal(id: string, to: ToCanvas, species: Species, stops: readonly Stop[], speed: number, phase: number, k = 1, building?: KingdomBuilding): KingdomActor {
  const rig = RIGS[species];
  const w = walk(to, stops, speed);
  const start = to(...stops[0]!.at);
  const box = boxAt(rig.body, start, k);
  const b = SPRITE_BOX[rig.body];
  const flip = loop(w.period, w.face, phase);
  const stride = loop(w.period, w.legs, phase);
  const counter = loop(
    w.period,
    w.legs.map((key) => ({ ...key, r: -(key.r ?? 0) })),
    phase,
  );
  const lb = SPRITE_BOX[rig.leg];
  const legs: KingdomNode[] = rig.hips.map(([hx, hy], i) => ({
    sprite: rig.leg,
    box: { x: (hx - b.x) * k - (lb.w * k) / 2, y: (hy - b.y) * k, w: lb.w * k, h: (-hy + 0.8) * k },
    origin: [0.5, 0] as Pt,
    // the far hind leg and the near foreleg step together, then the other two
    motion: i === 0 || i === 3 ? stride : counter,
    still: REST,
  }));
  const share = ([x, y]: Pt): Pt => [(x - b.x) / b.w, (y - b.y) / b.h];
  const parts: KingdomNode[] = [...legs];
  if (rig.tail && rig.tailRoot) parts.push(layer(rig.tail, box, share(rig.tailRoot), loop(2400, swing(16), phase)));
  parts.push({ sprite: rig.body, box: { x: 0, y: 0, w: box.w, h: box.h }, origin: anchor(rig.body), still: REST });
  parts.push(layer(rig.head, box, share(rig.neck), loop(w.period, w.head, phase), { ...REST, r: stops[0]!.graze ? 34 : 0 }));
  return {
    id,
    kind: 'animal',
    building,
    box,
    origin: anchor(rig.body),
    motion: loop(w.period, w.path, phase),
    still: REST,
    children: [
      { sprite: 'shadow', box: { x: box.w * 0.5 - 10 * k, y: box.h - 4 * k, w: 20 * k, h: 5 * k }, origin: [0.5, 0.5], still: REST },
      {
        box: { x: 0, y: 0, w: box.w, h: box.h },
        origin: anchor(rig.body),
        motion: flip,
        still: { ...REST, sx: flip.frames[0]!.sx },
        children: [{ box: { x: 0, y: 0, w: box.w, h: box.h }, origin: anchor(rig.body), motion: loop(w.period, w.gait, phase), still: REST, children: parts }],
      },
    ],
  };
}

/** Smoke from a chimney, the tenûr or a fire: two puffs a half-loop apart, each rising, curling aside, growing and thinning away. */
function smokeFrom(id: string, at: { x: number; y: number }, building?: KingdomBuilding, phase = 0): KingdomActor[] {
  const keys: Key[] = [
    { t: 0, x: 0, y: 0, sx: 0.5, sy: 0.5, o: 0 },
    { t: 0.12, o: 0.9 },
    { t: 0.45, x: -3, y: -12, sx: 0.9, sy: 0.9 },
    { t: 0.8, o: 0.5 },
    { t: 1, x: 5, y: -28, sx: 1.5, sy: 1.5, o: 0 },
  ];
  return [0, 0.5].map((p, i) => ({
    id: `${id}${i}`,
    kind: 'smoke' as const,
    building,
    sprite: 'smoke' as const,
    box: boxAt('smoke', at),
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
  return { id, kind, sprite, box: boxAt(sprite, at, k), origin, motion: loop(period, swing(amp), phase), still: REST };
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
  const speed = 15;
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
    const steps = Math.max(2, Math.round((nextT - t1) / 340));
    for (let s = 1; s < steps; s++) gait.push({ t: T(t1 + ((nextT - t1) * s) / steps), y: s % 2 ? -1 : 0, r: s % 2 ? 1.6 : -1.6 });
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
  // he stands in the canvas about 54 units tall, a little taller than a door, the village's own deer
  const tall = 54;
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
      { sprite: 'shadow', box: { x: w / 2 - 8, y: tall - 3.2, w: 16, h: 4.4 }, origin: [0.5, 0.5], still: REST },
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
  const tall = 60;
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
      { sprite: 'shadow', box: { x: w / 2 - 10, y: tall - 3, w: 20, h: 5 }, origin: [0.5, 0.5], still: REST },
      { sprite: body, box: full, origin: [0.5, 1], still: REST },
      { sprite: eyes, box: full, origin: [0.5, 1], motion: blink(period * 1.3, false), still: REST },
      { sprite: shut, box: full, origin: [0.5, 1], motion: blink(period * 1.3, true), still: { ...REST, o: 0 } },
      { sprite: face, box: full, origin: [0.5, 1], still: REST },
    ],
  };
}

/** A hen pecking about a patch between two spots, and the chicks that trail after her a step behind. */
function henAndChicks(id: string, a: { x: number; y: number }, b: { x: number; y: number }, phase: number, chicks: number, building?: KingdomBuilding): KingdomActor[] {
  const dir = Math.sign(b.x - a.x) || 1;
  const peck: Key[] = [
    { t: 0, r: 0 },
    { t: 0.08, r: 28 },
    { t: 0.13, r: 0 },
    { t: 0.18, r: 30 },
    { t: 0.23, r: 0 },
    { t: 0.32, r: 0, x: 0, y: 0 },
    { t: 0.46, x: b.x - a.x, y: b.y - a.y },
    { t: 0.55, r: 0 },
    { t: 0.6, r: 28 },
    { t: 0.65, r: 0 },
    { t: 0.7, r: 26 },
    { t: 0.75, r: 0 },
    { t: 0.82, x: b.x - a.x, y: b.y - a.y },
    { t: 0.96, x: 0, y: 0 },
    { t: 1, r: 0, x: 0, y: 0 },
  ];
  const faceKeys: Key[] = [{ t: 0, sx: dir }, { t: 0.819, sx: dir }, { t: 0.82, sx: -dir }, { t: 0.959, sx: -dir }, { t: 0.96, sx: dir }, { t: 1, sx: dir }];
  const box = boxAt('hen', a, 1.05);
  const out: KingdomActor[] = [
    {
      id,
      kind: 'animal',
      building,
      box,
      origin: anchor('hen'),
      motion: loop(6000, peck.map(({ r: _r, ...k }) => k), phase),
      still: REST,
      children: [
        { sprite: 'shadow', box: { x: box.w / 2 - 5, y: box.h - 2.4, w: 10, h: 3 }, origin: [0.5, 0.5], still: REST },
        {
          box: { x: 0, y: 0, w: box.w, h: box.h },
          origin: anchor('hen'),
          motion: loop(6000, faceKeys, phase),
          still: { ...REST, sx: dir },
          children: [{ sprite: 'hen', box: { x: 0, y: 0, w: box.w, h: box.h }, origin: [0.5, 0.95], motion: loop(6000, peck.map((k) => ({ t: k.t, ...(k.r !== undefined ? { r: k.r } : {}) })), phase), still: { ...REST, r: 26 } }],
        },
      ],
    },
  ];
  // each chick runs the hen's way a little after her, a little behind her, and hops as it goes
  for (let c = 0; c < chicks; c++) {
    const lag = 0.035 * (c + 1);
    const off = { x: -dir * (6 + c * 4), y: 2 + (c % 2) * 3 };
    const at = { x: a.x + off.x, y: a.y + off.y };
    const cbox = boxAt('chick', at, 1.1);
    out.push({
      id: `${id}chick${c}`,
      kind: 'animal',
      building,
      box: cbox,
      origin: anchor('chick'),
      motion: loop(6000, peck.map(({ r: _r, ...k }) => k), (phase - lag + 1) % 1),
      still: REST,
      children: [
        {
          box: { x: 0, y: 0, w: cbox.w, h: cbox.h },
          origin: anchor('chick'),
          motion: loop(6000, faceKeys, (phase - lag + 1) % 1),
          still: { ...REST, sx: dir },
          children: [{ sprite: 'chick', box: { x: 0, y: 0, w: cbox.w, h: cbox.h }, origin: [0.5, 1], motion: loop(520, [{ t: 0, y: 0 }, { t: 0.5, y: -0.9 }, { t: 1, y: 0 }], c * 0.3), still: REST }],
        },
      ],
    });
  }
  return out;
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
export function lifeOf(levels: Readonly<Record<KingdomBuilding, KingdomLevel>>, to: ToCanvas, inPlot: InPlot, swaying: { poplars: readonly (readonly number[])[]; kilim: readonly number[]; banners: readonly (readonly number[])[] }, origin: { x: number; y: number }): KingdomActor[] {
  const total = (Object.values(levels) as number[]).reduce((a, b) => a + b, 0);
  const has = (f: VillageFeature): boolean => villageHas(total, f);
  const flock = villageFlock(total);
  const rand = scatter(total * 7919 + 17);
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
    shadows.push({ id: `cloudshade${i}`, kind: 'sky', sprite: 'cloudShadow', box: boxAt('cloudShadow', { x: x - 60, y: y + 420 + i * 160 }, k * 1.6), origin: [0.5, 0.5], motion: loop(period, drift, p), still: { ...REST, x: 420 + i * 380 } });
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
  if (has('dovecote')) {
    const at = to(DOVECOTE[0], DOVECOTE[1], F0 + 40);
    ground.push({
      id: 'pigeons',
      kind: 'sky',
      box: boxAt('birds', at, 0.8),
      origin: [0.5, 0.5],
      motion: loop(7000, [{ t: 0, x: 0, y: -10 }, { t: 0.25, x: 40, y: -24 }, { t: 0.5, x: 0, y: -40 }, { t: 0.75, x: -40, y: -24 }, { t: 1, x: 0, y: -10 }]),
      still: { ...REST, y: -20 },
      children: [{ sprite: 'birds', box: { x: 0, y: 0, w: 32 * 0.8, h: 14 * 0.8 }, origin: [0.5, 0.5], motion: loop(420, [{ t: 0, sy: 1 }, { t: 0.5, sy: -0.4 }, { t: 1, sy: 1 }]), still: REST }],
    });
  }

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
    ground.push({ id: `fish${i}`, kind: 'water', sprite: 'fish', box: boxAt('fish', at, 1.3), origin: [0.5, 0.5], motion: loop(period, jump, i * 0.3), still: { ...REST, o: 0 } });
    const splash: Key[] = [{ t: 0, sx: 0.2, sy: 0.2, o: 0 }, { t: 0.905, sx: 0.2, sy: 0.2, o: 0 }, { t: 0.92, o: 1 }, { t: 1, sx: 1.2, sy: 1.2, o: 0 }];
    ground.push({ id: `splash${i}`, kind: 'water', sprite: 'ripple', box: boxAt('ripple', { x: at.x + 18 * 1.3, y: at.y + 2 }, 1.1), origin: [0.5, 0.5], motion: loop(period, splash, i * 0.3), still: { ...REST, o: 0 } });
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
  campSheep.slice(0, flock.campSheep).forEach((stops, i) => ground.push(animal(`campsheep${i}`, to, 'sheep', stops, 5.5, i * 0.4, 1.05)));
  ground.push(animal('goat0', to, 'goat', [{ at: [10, -40, 48], wait: 5200, graze: true }, { at: [26, -34, 48], wait: 3600 }, { at: [40, -36, 60], wait: 4200, graze: true }, { at: [22, -46, 54], wait: 2000 }], 6, 0.1, 0.72));
  ground.push(animal('goat1', to, 'goat', [{ at: [86, -74, 48], wait: 6400, graze: true }, { at: [98, -70, 62], wait: 2600 }, { at: [80, -84, 56], wait: 3000, graze: true }], 5, 0.6, 0.66));
  ground.push(...henAndChicks('hen0', to(244, 98, 34), to(258, 104, 34), 0, 0));
  ground.push(...henAndChicks('hen1', to(268, 104, 34), to(278, 92, 34), 0.33, 0));
  ground.push(
    animal(
      'dog',
      to,
      'dog',
      [
        { at: [330, 336, 0], wait: 2400 },
        { at: [452, 336, F0] },
        { at: [575, 336, F0] },
        { at: [575, 120, F0], wait: 3000 },
        { at: [575, 336, F0] },
        { at: [760, 336, F0] },
        { at: [760, 470, F0] },
        { at: [900, 470, F0], wait: 2600 },
        { at: [760, 470, F0] },
        { at: [760, 336, F0] },
        { at: [452, 336, F0] },
      ],
      26,
      0.15,
      1.05,
    ),
  );

  // as the village grows: the sheepfold, the goatfold with a goat up on its rock, the hens and chicks in their yard, the cow and the donkey
  const { sheepfold, goatfold, paddock, coop } = PENS;
  for (let i = 0; i < flock.sheep; i++) {
    const a = inPen(sheepfold, i, flock.sheep, rand);
    const b = inPen(sheepfold, (i + 1) % flock.sheep, flock.sheep, rand);
    ground.push(animal(`sheep${i}`, to, 'sheep', [{ at: [a[0], a[1], F0], wait: 5000 + i * 900, graze: true }, { at: [b[0], b[1], F0], wait: 4000, graze: i % 2 === 0 }], 5, (i * 0.29) % 1, 1.05));
  }
  for (let i = 0; i < flock.goats; i++) {
    const a = inPen(goatfold, i, flock.goats, rand);
    const stops: Stop[] = i === 0 ? [{ at: [a[0], a[1], F0], wait: 4000, graze: true }, { at: [goatfold.x + 40, goatfold.y + 30, F0 + 9], wait: 5200 }] : [{ at: [a[0], a[1], F0], wait: 5000, graze: true }, { at: [a[0] + 12, a[1] - 6, F0], wait: 3000 }];
    ground.push(animal(`foldgoat${i}`, to, 'goat', stops, 6, (i * 0.41) % 1, 0.8));
  }
  for (let i = 0; i < flock.hens; i++) {
    const a = to(coop.x + 6 + i * 11, coop.y + 6 + (i % 2) * 8, F0);
    const b = to(coop.x + 14 + i * 9, coop.y + 14 - (i % 2) * 6, F0);
    ground.push(...henAndChicks(`coophen${i}`, a, b, (i * 0.27) % 1, i === 0 ? flock.chicks : 0));
  }
  if (flock.cows > 0) ground.push(animal('cow', to, 'cow', [{ at: [paddock.x + 30, paddock.y + 22, F0], wait: 7000, graze: true }, { at: [paddock.x + 64, paddock.y + 30, F0], wait: 6000, graze: true }], 4.5, 0.2, 1.1));
  if (flock.donkeys > 0) ground.push(animal('donkey', to, 'donkey', [{ at: [paddock.x + 90, paddock.y + 16, F0], wait: 5200 }, { at: [paddock.x + 76, paddock.y + 34, F0], wait: 6400, graze: true }], 5, 0.55, 1.05));

  // the cat asleep on the first house's roof, breathing slowly
  if (levels.houses >= 1) {
    const at = inPlot('houses', ...ROOF_CAT);
    ground.push({ id: 'cat', kind: 'animal', building: 'houses', sprite: 'catSleep', box: boxAt('catSleep', at, 1.15), origin: [0.5, 1], motion: loop(3200, [{ t: 0, sy: 1 }, { t: 0.5, sy: 1.08 }, { t: 1, sy: 1 }]), still: REST });
  }
  // bees about the orchard's first hive, and about the valley's hives
  const beesAt = (id: string, at: { x: number; y: number }, building?: KingdomBuilding): KingdomActor => ({
    id,
    kind: 'animal',
    building,
    box: boxAt('bees', { x: at.x, y: at.y - 8 }, 1.1),
    origin: [0.5, 0.5],
    motion: loop(5200, [{ t: 0, x: 0, y: 0 }, { t: 0.25, x: 6, y: -4 }, { t: 0.5, x: 0, y: -7 }, { t: 0.75, x: -6, y: -3 }, { t: 1, x: 0, y: 0 }]),
    still: REST,
    children: [{ sprite: 'bees', box: { x: 0, y: 0, w: 16 * 1.1, h: 12 * 1.1 }, origin: [0.5, 0.5], motion: loop(1800, [{ t: 0, r: 0 }, { t: 0.5, r: 180 }, { t: 1, r: 360 }]), still: REST }],
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
      box: boxAt('butterfly', to(x, y, z), 1.2),
      origin: [0.5, 0.5],
      motion: loop(9000 + i * 800, [{ t: 0, x: 0, y: 0 }, { t: 0.2, x: 14, y: -8 }, { t: 0.4, x: 22, y: 4 }, { t: 0.55, x: 8, y: 10 }, { t: 0.75, x: -10, y: 2 }, { t: 0.9, x: -6, y: -8 }, { t: 1, x: 0, y: 0 }], p),
      still: REST,
      children: [{ sprite: 'butterfly', box: { x: 0, y: 0, w: 12, h: 9.6 }, origin: [0.5, 0.5], motion: wing, still: REST }],
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
