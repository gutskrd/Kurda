/**
 * How a gift's picture lives (gift-art.ts): its drawing is cut into a base and named layers over the same 120-unit
 * frame, and each layer plays a seamless round of keys, moved, turned and scaled about its origin and faded. Both apps
 * stack the layers as separate pictures and play the keys on transform and opacity alone, so nothing is drawn again.
 * The round's first frame is the gift's still picture, so a page can swap one for the other unseen, and Reduce Motion
 * keeps the still.
 */
import type { Pt } from './svg.js';

/** A layer's pose: moved by x and y in frame units, turned `rot` degrees and scaled about its origin, and seen. */
export interface GiftLoopPose {
  x: number;
  y: number;
  rot: number;
  sx: number;
  sy: number;
  o: number;
}

/** A pose at a share (0–1) of the layer's round. */
export interface GiftLoopKey extends GiftLoopPose {
  at: number;
}

/** A box on the frame: left, top, width and height in frame units. */
export type GiftLoopBox = readonly [x: number, y: number, w: number, h: number];

/** The tipped plane a layer turns in, as a disc seen from an angle: its long axis `tilt` degrees, squashed by `squash` across. */
export interface GiftLoopPlane {
  tilt: number;
  squash: number;
}

/** One moving part: the box its picture fills, the point it turns about, its round and its keys. */
export interface GiftLoopLayer {
  name: string;
  box: GiftLoopBox;
  origin: Pt;
  plane?: GiftLoopPlane;
  ms: number;
  keys: readonly GiftLoopKey[];
}

export interface GiftLoop {
  /** The gift's round; a layer may keep a round of its own (a slow turn, a quicker flicker). */
  ms: number;
  /** What lies under the layers: the still picture itself when every layer starts unseen, a picture of its own, or nothing. */
  base: 'still' | 'own' | 'none';
  /** Back to front. */
  layers: readonly GiftLoopLayer[];
}

/** The files' pixels per frame unit: 480 across, near the still's 512, and every whole-unit box a whole number of pixels. */
export const GIFT_LOOP_SCALE = 4;

export const GIFT_LOOP_REST: GiftLoopPose = { x: 0, y: 0, rot: 0, sx: 1, sy: 1, o: 1 };

// ─────────────────────────────────────────────────────────────── writing a round

export type GiftLoopEase = 'linear' | 'in' | 'out' | 'inOut';
const EASES: Readonly<Record<GiftLoopEase, (t: number) => number>> = {
  linear: (t) => t,
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  inOut: (t) => 0.5 - Math.cos(Math.PI * t) / 2,
};

/** A beat: at `ms`, the layer reaches these values (the rest carried on from the beat before), arriving with `ease`. */
export type GiftLoopBeat = readonly [ms: number, pose: Partial<GiftLoopPose>, ease?: GiftLoopEase];

export interface GiftLoopPlan {
  box: GiftLoopBox;
  /** What it turns and scales about; the middle of its box unless said. */
  origin?: Pt;
  plane?: GiftLoopPlane;
  /** Its own round, when it is not the gift's. */
  ms?: number;
  /** Its pose as the round starts, which is how the still picture shows it. */
  from?: Partial<GiftLoopPose>;
  /** Its round as beats, or as a pose for every share of it (sampled `samples` times); neither, and it stands still. */
  beats?: readonly GiftLoopBeat[];
  motion?: (t: number) => Partial<GiftLoopPose>;
  samples?: number;
  /** Where in its round a `motion` starts over, unseen (a wisp of steam gone at the top and born again below). */
  wrap?: number;
}

/** Rounded to thousandths, and never -0. */
const r3 = (v: number): number => Math.round(v * 1000) / 1000 || 0;
const r4 = (v: number): number => Math.round(v * 10000) / 10000;
const NAMES = ['x', 'y', 'rot', 'sx', 'sy', 'o'] as const;

/** A round from its beats, each eased stretch cut into enough straight pieces that no corner shows. */
function fromBeats(total: number, from: GiftLoopPose, beats: readonly GiftLoopBeat[]): GiftLoopKey[] {
  const keys: GiftLoopKey[] = [{ at: 0, ...from }];
  let pose = from;
  let ms = 0;
  for (const [at, change, ease = 'inOut'] of beats) {
    if (at < ms || at > total) throw new RangeError(`art: a beat at ${at} ms is out of order`);
    const next = { ...pose, ...change };
    const f = EASES[ease];
    const pieces = ease === 'linear' ? 1 : Math.max(1, Math.min(10, Math.round((at - ms) / 150)));
    for (let i = 1; i <= pieces; i++) {
      const t = f(i / pieces);
      const k = {} as GiftLoopPose;
      for (const name of NAMES) k[name] = r3(pose[name] + (next[name] - pose[name]) * t);
      keys.push({ at: ms + ((at - ms) * i) / pieces, ...k });
    }
    pose = next;
    ms = at;
  }
  if (ms < total) keys.push({ at: total, ...pose });
  const out: GiftLoopKey[] = [];
  for (const k of keys) {
    const at = r4(k.at / total);
    if (out.length > 0 && out[out.length - 1]!.at === at) out.pop();
    out.push({ ...k, at });
  }
  return out;
}

/** A round sampled from its pose at each share, with the moment it starts over (if any) taken in one unseen step. */
function fromMotion(from: GiftLoopPose, motion: (t: number) => Partial<GiftLoopPose>, samples: number, wrap?: number): GiftLoopKey[] {
  const at = Array.from({ length: samples + 1 }, (_, i) => i / samples);
  if (wrap !== undefined && wrap > 0 && wrap < 1) at.push(wrap - 0.002, wrap);
  const keys: GiftLoopKey[] = [];
  for (const t of [...new Set(at.map(r4))].sort((a, b) => a - b)) {
    const p = { ...from, ...motion(t) };
    const k = { at: t } as GiftLoopKey;
    for (const name of NAMES) k[name] = r3(p[name]);
    keys.push(k);
  }
  return keys;
}

/** A gift's round from a plan per layer, back to front; `base: 'none'` when everything it draws is in a layer. */
export function giftLoop(ms: number, plans: Readonly<Record<string, GiftLoopPlan>>, opts: { base?: 'none' } = {}): GiftLoop {
  const layers = Object.entries(plans).map(([name, plan]): GiftLoopLayer => {
    const total = plan.ms ?? ms;
    const from = { ...GIFT_LOOP_REST, ...plan.from };
    const keys = plan.motion
      ? fromMotion(from, plan.motion, plan.samples ?? Math.max(12, Math.min(60, Math.round(total / 100))), plan.wrap)
      : fromBeats(total, from, plan.beats ?? []);
    const [x, y, w, h] = plan.box;
    return { name, box: plan.box, origin: plan.origin ?? [x + w / 2, y + h / 2], ...(plan.plane ? { plane: plan.plane } : {}), ms: total, keys };
  });
  const base = opts.base ?? (layers.every((l) => l.keys[0]!.o === 0) ? 'still' : 'own');
  return { ms, base, layers };
}

// ─────────────────────────────────────────────────────────────── beats for the common motions

/** Comes up to `peak` over `up` ms from `at`, holds `hold`, and goes over `down`: a twinkle, a glint, a puff. */
export function giftLoopPulse(at: number, up: number, hold: number, down: number, peak = 1): GiftLoopBeat[] {
  return [
    [at, { o: 0 }, 'linear'],
    [at + up, { o: peak }, 'out'],
    [at + up + hold, { o: peak }, 'linear'],
    [at + up + hold + down, { o: 0 }, 'inOut'],
  ];
}

/**
 * Light passing over a form drawn as `count` frames, each lit where the light is at its step: each frame comes up and
 * goes in its turn, overlapping the next, between `at` and `at + ms`. Returns each frame's beats.
 */
export function giftLoopSweep(count: number, at: number, ms: number, peak = 1): GiftLoopBeat[][] {
  const step = ms / (count + 1);
  return Array.from({ length: count }, (_, i) => [
    [Math.round(at + step * i), { o: 0 }, 'linear'],
    [Math.round(at + step * (i + 1)), { o: peak }, 'inOut'],
    [Math.round(at + step * (i + 2)), { o: 0 }, 'inOut'],
  ]);
}

/** Eases 0 to 1 in and out, flat at both ends. */
export const giftLoopSmooth = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/**
 * A wisp of steam or smoke over its round, drawn at `root` as it stands at its fullest: born at `born` of the round,
 * faint and low at the surface, it rises `lift`, widening and curling as it goes, and is gone before it starts again.
 */
export function giftLoopWisp(box: GiftLoopBox, root: Pt, born: number, { lift = 10, sway = 1.2, curl = 7, peak = 1, turn = 0 } = {}): GiftLoopPlan {
  return {
    box,
    origin: root,
    wrap: born,
    samples: 48,
    motion: (t) => {
      const u = (((t - born) % 1) + 1) % 1;
      const seen = u < 0.24 ? giftLoopSmooth(u / 0.24) : u < 0.5 ? 1 : 1 - giftLoopSmooth((u - 0.5) / 0.5);
      return {
        y: lift * (0.4 - u),
        x: sway * Math.sin(Math.PI * 2 * u + turn),
        rot: curl * Math.sin(Math.PI * 2 * u + turn + 1.2),
        sx: 0.8 + 0.4 * u,
        sy: 0.9 + 0.16 * u,
        o: peak * seen,
      };
    },
  };
}

// ─────────────────────────────────────────────────────────────── where a pose puts a layer

/** A 2-D affine map [a, b, c, d, e, f]: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type GiftLoopMatrix = readonly [number, number, number, number, number, number];

const times = (m: GiftLoopMatrix, n: GiftLoopMatrix): GiftLoopMatrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const move = (x: number, y: number): GiftLoopMatrix => [1, 0, 0, 1, x, y];
const spin = (deg: number): GiftLoopMatrix => {
  const a = (deg * Math.PI) / 180;
  return [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
};
const grow = (sx: number, sy: number): GiftLoopMatrix => [sx, 0, 0, sy, 0, 0];

/**
 * The map a pose makes of a layer's frame: about its origin, moved, turned (within its plane, if it has one) and
 * scaled, which is the order both apps write the transform in.
 */
export function giftLoopMatrix(layer: Pick<GiftLoopLayer, 'origin' | 'plane'>, pose: GiftLoopPose): GiftLoopMatrix {
  const [ox, oy] = layer.origin;
  const p = layer.plane;
  const turnIn = p ? [spin(p.tilt), grow(1, p.squash), spin(pose.rot), grow(1, 1 / p.squash), spin(-p.tilt)].reduce(times) : spin(pose.rot);
  return [move(ox + pose.x, oy + pose.y), turnIn, grow(pose.sx, pose.sy), move(-ox, -oy)].reduce(times);
}

/** A layer's pose at `share` of its round, straight between keys. */
export function giftLoopPoseAt(keys: readonly GiftLoopKey[], share: number): GiftLoopPose {
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (!first || !last) throw new RangeError('art: a gift loop layer with no keys');
  const pick = (k: GiftLoopPose): GiftLoopPose => ({ x: k.x, y: k.y, rot: k.rot, sx: k.sx, sy: k.sy, o: k.o });
  if (share <= first.at) return pick(first);
  if (share >= last.at) return pick(last);
  let i = 1;
  while (keys[i]!.at < share) i++;
  const a = keys[i - 1]!;
  const b = keys[i]!;
  const t = (share - a.at) / (b.at - a.at);
  const out = {} as GiftLoopPose;
  for (const name of NAMES) out[name] = a[name] + (b[name] - a[name]) * t;
  return out;
}

/** Whether a layer's keys move it at all, or only fade it. */
export function giftLoopMoves(layer: GiftLoopLayer): boolean {
  return layer.keys.some((k) => k.x !== 0 || k.y !== 0 || k.rot !== 0 || k.sx !== 1 || k.sy !== 1);
}
