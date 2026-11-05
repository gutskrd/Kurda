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
 * scene is complete and quiet.
 *
 * The cast, all without people: Hevalo the deer — the app's own drawing of
 * him, his body, his head and an ear as layers — walking down the village's
 * path, stopping to sniff a half-eaten apple and flick an ear; fat-tailed
 * sheep grazing on the meadow; black goats on the hill; hens pecking by the
 * tenûr; a cat on a roof flicking its tail; the shepherd dog by the gate;
 * bees at the hives; butterflies; swallows crossing the sky; clouds; smoke
 * from the tenûr and the chimneys; the spring's trickle and ripples; poplars,
 * the kilim on its line and the banners by the gate swaying in the wind.
 */
import type { KingdomBuilding, KingdomLevel } from '../../games/kingdom/buildings.js';
import { characterArt } from '../../characters/index.js';
import { n, type Pt } from '../svg.js';
import { DAY, DUSK, INK, Part, disc, inked, iso, oval, type Palette } from './pen.js';
import * as P from './props.js';
import { WATER_Z } from './land.js';

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
  | 'sheep'
  | 'sheepHead'
  | 'goat'
  | 'goatHead'
  | 'hen'
  | 'cat'
  | 'catTail'
  | 'dog'
  | 'dogTail'
  | 'shadow'
  | 'deerBody'
  | 'deerCrown'
  | 'deerEar'
  | 'deerHead'
  | 'bees'
  | 'butterfly'
  | 'dust'
  | 'sparkle';

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
  children?: KingdomNode[];
}

/** What kind of life an actor is. */
export type KingdomLifeKind = 'sky' | 'smoke' | 'water' | 'sway' | 'animal' | 'deer';

/** One moving thing in the village, its root node, and the building it belongs to if any. */
export interface KingdomActor extends KingdomNode {
  id: string;
  kind: KingdomLifeKind;
  building?: KingdomBuilding;
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

/** Each sprite's own box, in its own units: what its SVG's viewBox is. */
export const SPRITE_BOX: Readonly<Record<KingdomSprite, { x: number; y: number; w: number; h: number }>> = {
  cloud: { x: -38, y: -24, w: 76, h: 34 },
  birds: { x: -16, y: -8, w: 32, h: 14 },
  smoke: { x: -7, y: -14, w: 14, h: 15 },
  trickle: { x: -2.4, y: -1, w: 4.8, h: 9 },
  drop: { x: -1.2, y: -2, w: 2.4, h: 4 },
  ripple: { x: -9, y: -4, w: 18, h: 8 },
  poplar: { x: -10, y: -66, w: 20, h: 70 },
  kilim: { x: 1.5, y: -16.5, w: 21, h: 23.5 },
  banner: { x: 0.6, y: 2.4, w: 8.2, h: 22.6 },
  sheep: { x: -14, y: -18, w: 32, h: 20 },
  sheepHead: { x: -14, y: -18, w: 32, h: 20 },
  goat: { x: -14, y: -24, w: 32, h: 26 },
  goatHead: { x: -14, y: -24, w: 32, h: 26 },
  hen: { x: -7, y: -12, w: 14, h: 13 },
  cat: { x: -7, y: -14, w: 16, h: 15 },
  catTail: { x: -7, y: -14, w: 16, h: 15 },
  dog: { x: -11, y: -17, w: 24, h: 18 },
  dogTail: { x: -11, y: -17, w: 24, h: 18 },
  shadow: { x: -10, y: -3, w: 20, h: 6 },
  deerBody: { x: 0, y: 0, w: 0, h: 0 },
  deerCrown: { x: 0, y: 0, w: 0, h: 0 },
  deerEar: { x: 0, y: 0, w: 0, h: 0 },
  deerHead: { x: 0, y: 0, w: 0, h: 0 },
  bees: { x: -8, y: -6, w: 16, h: 12 },
  butterfly: { x: -5, y: -4, w: 10, h: 8 },
  dust: { x: -34, y: -26, w: 68, h: 30 },
  sparkle: { x: -5, y: -5, w: 10, h: 10 },
};

/** The deer, the app's own drawing of Hevalo, as the four layers the village moves: body, antlers, the ear that flicks, and the rest of his head. */
function deer(): { box: { x: number; y: number; w: number; h: number }; layers: Record<'deerBody' | 'deerCrown' | 'deerEar' | 'deerHead', string>; head: Pt; ear: Pt } {
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
      deerHead: rig.ears.right.art + rig.face + art.eyes.open + art.mouths.rest + art.overlay,
    },
    head: share(art.headPivot),
    ear: share(rig.ears.left.pivot),
  };
}

const DEER = deer();
for (const k of ['deerBody', 'deerCrown', 'deerEar', 'deerHead'] as const) (SPRITE_BOX as Record<KingdomSprite, { x: number; y: number; w: number; h: number }>)[k] = DEER.box;

/** A sheep (facing right): a fleece of round lobes, the fat tail of the mountain breeds, short dark legs. */
function sheepBody(pal: Palette, fleece = '#fffaf0'): string {
  const p = new Part(0);
  const legs = 'M-8 -4v4M-4.6 -4v4.2M5 -4v4.2M8.4 -4v4';
  p.line(legs, 3.4).line(legs, 1.8, '#4b3a33');
  const lobes: [number, number, number][] = [[-7, -9, 5], [-2, -11.5, 5.6], [3.6, -10.6, 5], [7.4, -8.4, 4.2], [-9.6, -6.4, 4], [0, -6.4, 6.2], [-11.2, -9.6, 3.2]];
  for (const [x, y, r] of lobes) p.sil(disc(x, y, r));
  p.flat(lobes.map(([x, y, r]) => disc(x, y, r)).join(''), pal.dusk ? '#c9b9a4' : '#dccbb0');
  p.flat(lobes.map(([x, y, r]) => disc(x - r * 0.15, y - r * 0.2, r * 0.8)).join(''), pal.dusk ? '#e9dccb' : fleece);
  p.line('M-6 -10q1.6 1.6 3.2 0M1 -12.4q1.6 1.6 3.2 0M-3 -6q1.6 1.6 3.2 0', 0.7);
  return p.svg();
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

/** A black mountain goat (facing right): long hair hanging in a fringe, a short tail up, longer legs. */
function goatBody(pal: Palette): string {
  const p = new Part(0);
  const legs = 'M-8 -6v6M-5 -6v6.2M5.4 -6v6.2M8.4 -6v6';
  p.line(legs, 3.2).line(legs, 1.6, '#2c211d');
  const body = 'M-10 -14q8 -3.6 19.6 -0.4q2.6 3 1 6.4l-1.2 2.4l-1.4 -1.2l-1.2 2l-1.6 -1.6l-1.4 2l-1.6 -1.8l-1.6 2l-1.6 -1.8l-1.6 2l-1.4 -1.8l-1.6 1.6l-1.4 -2l-1.8 0.8q-2.6 -5 0.4 -9Z';
  const tail = 'M-10 -13.4l-2.6 -3.4l1.8 -0.4l2.4 2.6Z';
  p.sil(body + tail).fill(tail, '#3a2c26').fill(body, pal.dusk ? '#3b2e29' : '#47362f');
  p.flat('M-7 -14.4q7 -2.6 15 -0.6q-6 0.6 -15 2.8Z', pal.dusk ? '#55443b' : '#66524a');
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

/** A cat sitting on a roof, three-quarters to us: ginger, striped, ears up. */
function cat(pal: Palette): string {
  const p = new Part(0);
  const body = 'M-4.4 0q-1.6 -5.4 0.8 -8.4q1.6 -1.8 3.8 -1.6q2.6 0.4 3 3.6q0.4 3.8 -0.4 6.4Z';
  const head = 'M-3.4 -9.6q-0.4 -2.6 0.6 -4l1.4 1.6q1.4 -0.6 2.8 0l1.4 -1.8q1 1.6 0.6 4.2q-0.6 2.4 -3.4 2.4q-2.8 0 -3.4 -2.4Z';
  p.sil(body + head).fill(body, pal.dusk ? '#c8813f' : '#e8964a').fill(head, pal.dusk ? '#d38c48' : '#f0a457');
  p.line('M-3 -5.4q1.4 0.6 2.4 0M-2.6 -3q1.4 0.6 2.4 0M-2 -12.2l0.6 1.4M1.6 -12.2l-0.4 1.4', 0.6, '#a85a22');
  p.flat(disc(-1.6, -10, 0.55) + disc(1.4, -10, 0.55), INK).flat('M-0.6 -8.8h1.2l-0.6 0.6Z', '#e27a7a');
  p.flat('M-2.6 0q-0.2 -1.6 1 -2.2q0.8 1.4 0.6 2.2ZM1.2 0q0 -1.6 1.2 -2q0.6 1.2 0.4 2Z', pal.dusk ? '#e9dccb' : '#fff4e2');
  return p.svg();
}

/** The cat's tail, curled up at its side, to flick. */
function catTail(pal: Palette): string {
  const p = new Part(0);
  const tail = 'M3.4 -1.2q4.6 0.4 4.6 -4.6q0 -2.6 -1.4 -3.6l-1.2 1q1 1 0.8 2.6q-0.2 3 -3 3Z';
  p.sil(tail).fill(tail, pal.dusk ? '#c8813f' : '#e8964a').line('M6.6 -6.4l1.2 -0.4M6.4 -3.6l1.4 0.2', 0.6, '#a85a22');
  return p.svg();
}

/** The shepherd's dog, sitting: a big fawn mountain dog with a dark muzzle and dark ears. */
function dog(pal: Palette): string {
  const p = new Part(0);
  const body = 'M-8 0q-1.4 -6 1.4 -9.4q3 -2.8 7.4 -1.8q3.6 1 4.4 4.6l0.6 6.6Z';
  const leg = 'M2.6 0v-6.6h2.6v6.6ZM5.6 0v-5.4h2.4v5.4Z';
  const head = 'M1.6 -11.4q0.2 -4.4 4.4 -5.2q4.2 -0.6 5.6 2.6q1 2.4 -0.6 4.4l-3.6 1.4q-3.8 0.6 -5.8 -3.2Z';
  const muzzle = 'M8.4 -12.6q2.6 -0.6 3.4 1.6q-0.4 2 -3.2 2.4q-1.8 -1.4 -0.2 -4Z';
  const ear = 'M4 -15.4q-2.2 0.6 -2 3.8q2 -0.2 3 -2.2Z';
  p.sil(body + leg + head).fill(body, pal.dusk ? '#c9a46f' : '#e2bf86').fill(leg, pal.dusk ? '#bb9763' : '#d6b077');
  p.flat('M-7 -2q-0.8 -4.4 1.4 -7.2q1.6 2.4 1.2 7.2Z', pal.dusk ? '#b18d5c' : '#c9a36d');
  p.fill(head, pal.dusk ? '#d3ae78' : '#ebc890').fill(muzzle, '#3e2c24').fill(ear, '#4a3428');
  p.flat(disc(7.4, -13.8, 0.7), INK).flat(disc(11.4, -12, 0.8), INK);
  return p.svg();
}

/** The dog's tail, lying out behind it, to wag. */
function dogTail(pal: Palette): string {
  const p = new Part(0);
  const tail = 'M-7.6 -1.6q-3.6 -0.6 -3.2 -5.2q1.4 3 3.8 3.2Z';
  p.sil(tail).fill(tail, pal.dusk ? '#c9a46f' : '#e2bf86');
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

/** A glint of falling water. */
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
  sheep: (pal) => sheepBody(pal),
  sheepHead,
  goat: goatBody,
  goatHead,
  hen,
  cat,
  catTail,
  dog,
  dogTail,
  shadow: () => shadowSprite(),
  deerBody: () => DEER.layers.deerBody,
  deerCrown: () => DEER.layers.deerCrown,
  deerEar: () => DEER.layers.deerEar,
  deerHead: () => DEER.layers.deerHead,
  bees: () => bees(),
  butterfly,
  dust,
  sparkle,
};

const DEER_SPRITES = new Set<KingdomSprite>(['deerBody', 'deerCrown', 'deerEar', 'deerHead']);

/** A sprite as a standalone SVG, sized by the box it is laid in (it stretches to fill it, keeping no aspect of its own). */
export function kingdomSpriteSvg(sprite: KingdomSprite, o: { dark?: boolean } = {}): string {
  const draw = DRAW[sprite];
  if (!draw) throw new RangeError(`art: no village sprite ${String(sprite)}`);
  const b = SPRITE_BOX[sprite];
  const body = draw(o.dark ? DUSK : DAY);
  // the deer is the app's own drawing, with its own soft light; the rest wear the village's ink
  const inner = DEER_SPRITES.has(sprite) ? body : inked(body);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(b.x)} ${n(b.y)} ${n(b.w)} ${n(b.h)}" preserveAspectRatio="none" aria-hidden="true">${inner}</svg>`;
}

// ───────────────────────────────────────────────────────────── the cast

/** Turns world points into canvas points; given by the scene, which knows where its origin is. */
export type ToCanvas = (x: number, y: number, z: number) => { x: number; y: number };

/** A sprite's box on the canvas, with its own origin (0, 0) at a canvas point, at a scale. */
function boxAt(sprite: KingdomSprite, at: { x: number; y: number }, k = 1): { x: number; y: number; w: number; h: number } {
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

/**
 * The keys of a walk round a loop of stops at `speed` canvas units a second,
 * back to the first: where it is (x, y from the first stop), which way it
 * faces (sx ±1 for an animal seen from the side), and when its head is down.
 */
function walk(to: ToCanvas, stops: readonly Stop[], speed: number): { period: number; path: Key[]; face: Key[]; head: Key[]; gait: Key[] } {
  const pts = stops.map((s) => to(...s.at));
  const legs: { from: number; to: number; dur: number }[] = [];
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
      legs.push({ from: i, to: j, dur });
      total += dur;
    }
  }
  const base = pts[0]!;
  const path: Key[] = [];
  const face: Key[] = [];
  const head: Key[] = [];
  const gait: Key[] = [];
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
      for (let s = 0; s <= steps; s++) gait.push({ t: a + ((b - a) * s) / steps, y: s % 2 ? -0.8 : 0 });
    } else gait.push({ t: a, y: 0 }, { t: b, y: 0 });
  }
  const first = marks.find((m) => m.kind === 'move')?.dir ?? 1;
  face.unshift({ t: 0, sx: first });
  face.push({ t: 1, sx: first });
  return { period: total, path, face, head, gait };
}

/** An animal seen from the side, walking a loop of stops: a shadow, then the body and its head turning to face its way. */
function animal(id: string, to: ToCanvas, body: 'sheep' | 'goat', stops: readonly Stop[], speed: number, phase: number, k = 1, building?: KingdomBuilding): KingdomActor {
  const w = walk(to, stops, speed);
  const start = to(...stops[0]!.at);
  const box = boxAt(body, start, k);
  const flip = loop(w.period, w.face, phase);
  const headSprite = body === 'sheep' ? 'sheepHead' : 'goatHead';
  const neck: Pt = body === 'sheep' ? [(8 + 14) / 32, (-10 + 18) / 20] : [(8 + 14) / 32, (-16 + 24) / 26];
  return {
    id,
    kind: 'animal',
    building,
    box,
    origin: anchor(body),
    motion: loop(w.period, w.path, phase),
    still: REST,
    children: [
      { sprite: 'shadow', box: { x: box.w * 0.5 - 9 * k, y: box.h - 4 * k, w: 18 * k, h: 5 * k }, origin: [0.5, 0.5], still: REST },
      {
        box: { x: 0, y: 0, w: box.w, h: box.h },
        origin: anchor(body),
        motion: flip,
        still: { ...REST, sx: flip.frames[0]!.sx },
        children: [
          { sprite: body, box: { x: 0, y: 0, w: box.w, h: box.h }, origin: anchor(body), motion: loop(w.period, w.gait, phase), still: REST },
          layer(headSprite, box, neck, loop(w.period, w.head, phase), { ...REST, r: stops[0]!.graze ? 34 : 0 }),
        ],
      },
    ],
  };
}

/** Smoke from a chimney or the tenûr: two puffs a half-loop apart, each rising, curling aside, growing and thinning away. */
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

/** Rings spreading on the spring's water, two a half-loop apart. */
function ripples(id: string, at: { x: number; y: number }, k: number, building: KingdomBuilding): KingdomActor[] {
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
    motion: loop(2600, keys, p),
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
function sway(id: string, sprite: 'poplar' | 'kilim' | 'banner', at: { x: number; y: number }, k: number, amp: number, period: number, phase: number, origin: Pt): KingdomActor {
  return { id, kind: 'sway', sprite, box: boxAt(sprite, at, k), origin, motion: loop(period, swing(amp), phase), still: REST };
}

/**
 * Hevalo, walking the village's path from the top of the upper terrace down
 * to the gate: he steps out where the trail from the pass meets the village,
 * stops halfway down to look about with a flick of his ear, stops again by
 * the half-eaten apple to sniff at it, looks over at the spring, and walks on
 * through the gate to the water's edge, where he is lost to view and comes
 * back down from the pass. He is the app's own drawing of him; he walks
 * facing us, as the path always runs towards us.
 */
function hevalo(to: ToCanvas): KingdomActor {
  const route: Stop[] = [
    { at: [114, 2, 48], wait: 600 },
    { at: [114, 56, 48], wait: 3200 },
    { at: [114, 108, 48] },
    { at: [114, 136, 24] },
    { at: [188, 124, 24], wait: 5200 },
    { at: [230, 124, 24] },
    { at: [230, 220, 24] },
    { at: [230, 246, 0] },
    { at: [296, 238, 0], wait: 3000 },
    { at: [314, 238, 0] },
    { at: [314, 330, 0] },
    { at: [314, 350, WATER_Z + 4], wait: 600 },
  ];
  // the walk in one direction only, the way back made unseen
  const pts = route.map((s) => to(...s.at));
  const speed = 15;
  let total = 0;
  const times: { t0: number; t1: number; i: number }[] = [];
  for (let i = 0; i < route.length; i++) {
    const wait = route[i]!.wait ?? 0;
    const arrive = total;
    total += wait;
    times.push({ t0: arrive, t1: total, i });
    if (i < route.length - 1) total += (Math.hypot(pts[i + 1]!.x - pts[i]!.x, pts[i + 1]!.y - pts[i]!.y) / speed) * 1000;
  }
  const hidden = 2600;
  const period = total + hidden;
  const base = pts[0]!;
  const T = (ms: number): number => Math.min(1, ms / period);
  const path: Key[] = [];
  const gait: Key[] = [];
  const headKeys: Key[] = [];
  const earKeys: Key[] = [{ t: 0, r: 0 }];
  times.forEach(({ t0, t1, i }, k) => {
    const p = pts[i]!;
    path.push({ t: T(t0), x: p.x - base.x, y: p.y - base.y }, { t: T(t1), x: p.x - base.x, y: p.y - base.y });
    gait.push({ t: T(t0), y: 0, r: 0 }, { t: T(t1), y: 0, r: 0 });
    const next = times[k + 1];
    if (next) {
      const steps = Math.max(2, Math.round((next.t0 - t1) / 340));
      for (let s = 1; s < steps; s++) gait.push({ t: T(t1 + ((next.t0 - t1) * s) / steps), y: s % 2 ? -1 : 0, r: s % 2 ? 1.6 : -1.6 });
    }
  });
  // fading in at the top of the path, out at the water's edge, and back unseen
  path.unshift({ t: 0, o: 0 });
  path.push({ t: T(times[0]!.t1), o: 1 }, { t: T(times[times.length - 1]!.t0), o: 1 }, { t: T(total), o: 0 }, { t: 1, x: 0, y: 0, o: 0 });
  // looking about halfway down the upper path: a turn of the head each way, and a flick of the ear
  const look = times[1]!;
  headKeys.push({ t: 0, r: 0, y: 0 }, { t: T(look.t0 + 300), r: 0 }, { t: T(look.t0 + 800), r: -7 }, { t: T(look.t0 + 1700), r: -7 }, { t: T(look.t0 + 2200), r: 6 }, { t: T(look.t0 + 2900), r: 6 }, { t: T(look.t1), r: 0 });
  earKeys.push({ t: T(look.t0 + 1100), r: 0 }, { t: T(look.t0 + 1250), r: -24 }, { t: T(look.t0 + 1450), r: 0 });
  // by the apple: the head dips to sniff it, comes up, and the ear flicks twice
  const apple = times[4]!;
  headKeys.push({ t: T(apple.t0 + 400), r: 0, y: 0 }, { t: T(apple.t0 + 1100), r: 5, y: 3 }, { t: T(apple.t0 + 2600), r: 5, y: 3 }, { t: T(apple.t0 + 3300), r: 0, y: 0 });
  earKeys.push({ t: T(apple.t0 + 3600), r: 0 }, { t: T(apple.t0 + 3750), r: -26 }, { t: T(apple.t0 + 3950), r: 0 }, { t: T(apple.t0 + 4300), r: -22 }, { t: T(apple.t0 + 4500), r: 0 });
  // at the spring: a long look across at the water
  const spring = times[8]!;
  headKeys.push({ t: T(spring.t0 + 300), r: 0, y: 0 }, { t: T(spring.t0 + 900), r: -8 }, { t: T(spring.t1 - 400), r: -8 }, { t: T(spring.t1), r: 0 }, { t: 1, r: 0, y: 0 });
  earKeys.push({ t: 1, r: 0 });
  // he stands in the canvas about 54 units tall, a little taller than a door, the village's own deer
  const tall = 54;
  const k = tall / DEER.box.h;
  const w = DEER.box.w * k;
  const box = { x: base.x - w / 2, y: base.y - tall, w, h: tall };
  const restAt = T(apple.t0 + 1800);
  const motion = loop(period, path);
  const headMotion = loop(period, headKeys);
  return {
    id: 'hevalo',
    kind: 'deer',
    box,
    origin: [0.5, 1],
    motion,
    still: poseAt(motion.frames, restAt),
    children: [
      { sprite: 'shadow', box: { x: w / 2 - 8, y: tall - 3.2, w: 16, h: 4.4 }, origin: [0.5, 0.5], still: REST },
      {
        box: { x: 0, y: 0, w, h: tall },
        origin: [0.5, 1],
        motion: loop(period, gait),
        still: REST,
        children: [
          { sprite: 'deerBody', box: { x: 0, y: 0, w, h: tall }, origin: [0.5, 1], still: REST },
          {
            box: { x: 0, y: 0, w, h: tall },
            origin: DEER.head,
            motion: headMotion,
            still: poseAt(headMotion.frames, restAt),
            children: [
              { sprite: 'deerCrown', box: { x: 0, y: 0, w, h: tall }, origin: DEER.head, still: REST },
              { sprite: 'deerEar', box: { x: 0, y: 0, w, h: tall }, origin: DEER.ear, motion: loop(period, earKeys), still: REST },
              { sprite: 'deerHead', box: { x: 0, y: 0, w, h: tall }, origin: DEER.head, still: REST },
            ],
          },
        ],
      },
    ],
  };
}

/** Where, in each building's own units, its chimneys stand (the top of each), and the level each is built at. */
export const CHIMNEYS: Readonly<Record<KingdomBuilding, readonly { from: KingdomLevel; at: readonly [number, number, number] }[]>> = {
  houses: [
    { from: 3, at: [71.4, 11.2, 29] },
    { from: 5, at: [13.4, 17.6, 64] },
  ],
  school: [{ from: 3, at: [29, 9.2, 31.6] }],
  teahouse: [{ from: 2, at: [31.9, 13, 29] }],
  spring: [],
  market: [],
  orchard: [],
};

/** Where the life sits that belongs to buildings, in each building's own units: the spring's water, the hives' bees, the cat's roof. */
const SPRING_WATER = { pool: [30, 32, 0.4], basin: [31, 29, 6], spout: [31, 21, 9.6] } as const;
const HIVE = [82, 14, 10] as const;
const ROOF_CAT = [44, 58, 22.6] as const;

/** A building's own point on the canvas. */
export type InPlot = (b: KingdomBuilding, x: number, y: number, z: number) => { x: number; y: number };

/**
 * Everything that moves in the village at these levels: the sky, the smoke,
 * the water, what sways, the animals and Hevalo, back to front (an app lays
 * them in this order). `to` places world points on the canvas; `inPlot`
 * places a building's own points.
 */
export function lifeOf(levels: Readonly<Record<KingdomBuilding, KingdomLevel>>, to: ToCanvas, inPlot: InPlot, swaying: { poplars: readonly (readonly number[])[]; kilim: readonly number[]; banners: readonly (readonly number[])[] }): KingdomActor[] {
  const out: KingdomActor[] = [];
  // the sky: clouds drifting right across the whole canvas, fading in and out at its ends; swallows crossing now and then
  const clouds: [number, number, number, number][] = [
    [-60, 70, 1.3, 0.1],
    [-60, 128, 1, 0.55],
    [-60, 168, 0.8, 0.8],
  ];
  clouds.forEach(([x, y, k, p], i) => {
    const run = 1100;
    out.push({
      id: `cloud${i}`,
      kind: 'sky',
      sprite: 'cloud',
      box: boxAt('cloud', { x, y }, k),
      origin: [0.5, 0.5],
      motion: loop(110000 - i * 24000, [{ t: 0, x: 0, o: 0 }, { t: 0.06, o: 1 }, { t: 0.94, o: 1 }, { t: 1, x: run, o: 0 }], p),
      still: { ...REST, x: 330 + i * 230 },
    });
  });
  const flap = loop(560, [{ t: 0, sy: 1 }, { t: 0.5, sy: -0.5 }, { t: 1, sy: 1 }]);
  out.push({
    id: 'birds',
    kind: 'sky',
    box: boxAt('birds', { x: 120, y: 190 }, 1.1),
    origin: [0.5, 0.5],
    motion: loop(30000, [{ t: 0, x: 0, y: 0, o: 0 }, { t: 0.03, o: 1 }, { t: 0.66, x: 860, y: -110, o: 1 }, { t: 0.7, o: 0 }, { t: 1, x: 860, y: -110, o: 0 }], 0.2),
    still: { ...REST, x: 300, y: -40 },
    children: [{ sprite: 'birds', box: { x: 0, y: 0, w: 32 * 1.1, h: 14 * 1.1 }, origin: [0.5, 0.5], motion: flap, still: REST }],
  });
  // poplars on the hill and at the corners, swaying each in its own time
  swaying.poplars.forEach(([x, y, z, tall], i) => {
    const at = to(x!, y!, z!);
    out.push(sway(`poplar${i}`, 'poplar', at, tall! / 64, 1.6, 5200 + i * 700, i * 0.31, anchor('poplar')));
  });
  // smoke from the tenûr, always, and from each chimney built
  out.push(...smokeFrom('tenur', to(230 + 7.5 * 1.25, 62 + 7.5 * 1.25, 34 + 11 * 1.25)));
  for (const b of Object.keys(CHIMNEYS) as KingdomBuilding[]) {
    CHIMNEYS[b].forEach((c, i) => {
      if (levels[b] >= c.from) out.push(...smokeFrom(`${b}smoke${i}`, inPlot(b, ...c.at), b, 0.27 * (i + 1)));
    });
  }
  // the spring: rings on its pool or its basin, its trickle from the spout, and the stream falling into the lake
  if (levels.spring >= 1) {
    const [px, py, pz] = levels.spring >= 2 ? SPRING_WATER.basin : SPRING_WATER.pool;
    out.push(...ripples('ripple', inPlot('spring', px, py, pz), 1.1, 'spring'));
    if (levels.spring >= 2) {
      const [sx, sy, sz] = SPRING_WATER.spout;
      out.push(fall('spout', inPlot('spring', sx, sy, sz), 4.2, 'spring', 0.9));
    }
    const top = to(247, 340, 0);
    const foot = to(247, 340, WATER_Z);
    out.push(fall('falls', { x: top.x, y: top.y + 2 }, foot.y - top.y - 2, 'spring', levels.spring >= 4 ? 2 : levels.spring >= 2 ? 1.6 : 1.2));
  }
  // the kilim on its line, the banners by the gate
  {
    const [x, y, z] = swaying.kilim;
    out.push(sway('kilim', 'kilim', to(x!, y!, z!), SCENERY, 3, 3800, 0.2, [0.48, 0.24]));
  }
  swaying.banners.forEach(([x, y, z], i) => out.push(sway(`banner${i}`, 'banner', to(x!, y!, z! + 30 * SCENERY), SCENERY, 5, 3000 + i * 400, i * 0.4, [0.5, 0.1])));
  // the goats up on the hill by the trail
  out.push(animal('goat0', to, 'goat', [{ at: [10, -40, 48], wait: 5200, graze: true }, { at: [26, -34, 48], wait: 3600 }, { at: [40, -36, 48], wait: 4200, graze: true }, { at: [22, -46, 48], wait: 2000 }], 6, 0.1, 0.72));
  out.push(animal('goat1', to, 'goat', [{ at: [86, -74, 48], wait: 6400, graze: true }, { at: [98, -70, 48], wait: 2600 }], 5, 0.6, 0.66));
  // the hens scratching on their ledge by the tenûr
  const hens: [number, number, number, number][] = [
    [244, 98, 258, 104],
    [268, 104, 278, 92],
    [252, 86, 262, 90],
  ];
  hens.forEach(([ax, ay, bx, by], i) => {
    const a = to(ax, ay, 34);
    const b = to(bx, by, 34);
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
    const face = loop(6000, [{ t: 0, sx: dir }, { t: 0.819, sx: dir }, { t: 0.82, sx: -dir }, { t: 0.959, sx: -dir }, { t: 0.96, sx: dir }, { t: 1, sx: dir }], i * 0.33);
    const box = boxAt('hen', a, 1.05);
    out.push({
      id: `hen${i}`,
      kind: 'animal',
      box,
      origin: anchor('hen'),
      motion: loop(6000, peck.map(({ r: _r, ...k }) => k), i * 0.33),
      still: REST,
      children: [
        { sprite: 'shadow', box: { x: box.w / 2 - 5, y: box.h - 2.4, w: 10, h: 3 }, origin: [0.5, 0.5], still: REST },
        {
          box: { x: 0, y: 0, w: box.w, h: box.h },
          origin: anchor('hen'),
          motion: face,
          still: { ...REST, sx: dir },
          children: [{ sprite: 'hen', box: { x: 0, y: 0, w: box.w, h: box.h }, origin: [0.5, 0.95], motion: loop(6000, peck.map((k) => ({ t: k.t, ...(k.r !== undefined ? { r: k.r } : {}) })), i * 0.33), still: { ...REST, r: 26 } }],
        },
      ],
    });
  });
  // the sheep on their meadow below the middle terrace, and a lamb
  out.push(animal('sheep0', to, 'sheep', [{ at: [176, 252, -4], wait: 5000, graze: true }, { at: [196, 262, -4], wait: 6000, graze: true }], 6, 0, 1.05));
  out.push(animal('sheep1', to, 'sheep', [{ at: [170, 276, -4], wait: 7000, graze: true }, { at: [186, 272, -4], wait: 2400 }, { at: [190, 286, -4], wait: 5200, graze: true }], 5.5, 0.4, 1.0));
  out.push(animal('sheep2', to, 'sheep', [{ at: [206, 252, -4], wait: 3200 }, { at: [210, 270, -4], wait: 4800, graze: true }], 7, 0.7, 0.72));
  // the cat on the first house's roof, flicking its tail
  if (levels.houses >= 1) {
    const at = inPlot('houses', ...ROOF_CAT);
    const box = boxAt('cat', at, 1.1);
    out.push({
      id: 'cat',
      kind: 'animal',
      building: 'houses',
      sprite: 'cat',
      box,
      origin: anchor('cat'),
      still: REST,
      children: [layer('catTail', box, [(3.4 + 7) / 16, (-1.2 + 14) / 15], loop(4200, [{ t: 0, r: 0 }, { t: 0.1, r: -18 }, { t: 0.2, r: 6 }, { t: 0.3, r: -12 }, { t: 0.42, r: 0 }, { t: 1, r: 0 }]))],
    });
  }
  // the dog sitting by the gate, its tail going
  {
    const at = to(294, 322, 0);
    const box = boxAt('dog', at, 1.15);
    out.push({
      id: 'dog',
      kind: 'animal',
      sprite: 'dog',
      box,
      origin: anchor('dog'),
      still: REST,
      children: [layer('dogTail', box, [(-7.6 + 11) / 24, (-1.6 + 17) / 18], loop(2400, [{ t: 0, r: 0 }, { t: 0.12, r: -16 }, { t: 0.24, r: 8 }, { t: 0.36, r: -16 }, { t: 0.48, r: 8 }, { t: 0.6, r: 0 }, { t: 1, r: 0 }]))],
    });
  }
  // bees about the first hive, once the orchard has one
  if (levels.orchard >= 3) {
    const at = inPlot('orchard', ...HIVE);
    out.push({
      id: 'bees',
      kind: 'animal',
      building: 'orchard',
      box: boxAt('bees', { x: at.x, y: at.y - 8 }, 1.1),
      origin: [0.5, 0.5],
      motion: loop(5200, [{ t: 0, x: 0, y: 0 }, { t: 0.25, x: 6, y: -4 }, { t: 0.5, x: 0, y: -7 }, { t: 0.75, x: -6, y: -3 }, { t: 1, x: 0, y: 0 }]),
      still: REST,
      children: [{ sprite: 'bees', box: { x: 0, y: 0, w: 16 * 1.1, h: 12 * 1.1 }, origin: [0.5, 0.5], motion: loop(1800, [{ t: 0, r: 0 }, { t: 0.5, r: 180 }, { t: 1, r: 360 }]), still: REST }],
    });
  }
  // butterflies over the orchard and over the flowers by the tea house
  const butterflies: [number, number, number, number][] = [
    [392, 282, 26, 0],
    [214, 210, 40, 0.5],
  ];
  butterflies.forEach(([x, y, z, p], i) => {
    const at = to(x, y, z);
    const wing = loop(320, [{ t: 0, sx: 1 }, { t: 0.5, sx: 0.25 }, { t: 1, sx: 1 }], p);
    out.push({
      id: `butterfly${i}`,
      kind: 'animal',
      box: boxAt('butterfly', at, 1.2),
      origin: [0.5, 0.5],
      motion: loop(9000, [{ t: 0, x: 0, y: 0 }, { t: 0.2, x: 14, y: -8 }, { t: 0.4, x: 22, y: 4 }, { t: 0.55, x: 8, y: 10 }, { t: 0.75, x: -10, y: 2 }, { t: 0.9, x: -6, y: -8 }, { t: 1, x: 0, y: 0 }], p),
      still: REST,
      children: [{ sprite: 'butterfly', box: { x: 0, y: 0, w: 12, h: 9.6 }, origin: [0.5, 0.5], motion: wing, still: REST }],
    });
  });
  out.push(hevalo(to));
  return out;
}

/** Every sprite the village's life uses, for an app to make once. */
export const KINGDOM_SPRITES: readonly KingdomSprite[] = Object.keys(DRAW) as KingdomSprite[];

