/**
 * How the gift box moves (gift-box.ts), the same on the website and the phone: an occasional hop while it waits, with
 * squash and stretch, the bow following a beat behind, sparks over it and gold thrown out as it lands, and a glint now
 * and then; the unwrap, which shakes harder and harder, squashes, lets the ribbon go, pops the lid and bow off and lets
 * the light out, longer and grander for a richer tier (`GIFT_UNWRAP_MS`); the box giving way to the gift; and the
 * sender's send, in which the box is wrapped round the gift, tied and sent off. Each play
 * is a track of keys per moving part, already eased and sampled, so a renderer only joins its keys with straight lines:
 * the web hands them to the browser's animations and the phone to its native driver, and both play the same motion.
 * Under Reduce Motion nothing here plays; the box stands still and the moments fade.
 */
import { GIFT_SENT_FADE_MS, GIFT_SENT_MS } from '../gift-moment.js';
import { GIFT_UNWRAP_MS, type GiftTier } from '../gifts.js';

/** A part's pose: moved by x and y in the drawing's units, turned `rot` degrees and scaled about its pivot, and seen. */
export interface GiftBoxPose {
  x: number;
  y: number;
  sx: number;
  sy: number;
  rot: number;
  o: number;
}

/** A pose at a share (0–1) of the play. */
export interface GiftBoxKey extends GiftBoxPose {
  at: number;
}

/**
 * What moves: `hop` is the whole box (all but its shadow and the thrown gold), `lid` the lid with everything on it, and
 * the bow's parts and the tag move again within it.
 */
export const GIFT_BOX_TRACKS = ['hop', 'shadow', 'splash', 'ribbon', 'lidShade', 'inside', 'light', 'lid', 'tag', 'tailLeft', 'tailRight', 'loopLeft', 'loopRight', 'knot', 'sparks'] as const;
export type GiftBoxTrack = (typeof GIFT_BOX_TRACKS)[number];

export interface GiftBoxPlay {
  ms: number;
  /** Round again from the start when it ends. */
  loop: boolean;
  /** The parts that move, each from 0 to 1; a part left out keeps its rest pose (`GIFT_BOX_REST`). */
  tracks: Readonly<Partial<Record<GiftBoxTrack, readonly GiftBoxKey[]>>>;
  /** When light passes over the box, as [start, end] shares of the play. */
  glints: readonly (readonly [number, number])[];
}

const REST: GiftBoxPose = { x: 0, y: 0, sx: 1, sy: 1, rot: 0, o: 1 };
const HIDDEN: GiftBoxPose = { ...REST, o: 0 };

/** How each part stands when nothing moves it: the shut box, with its light, sparks and thrown gold unseen. */
export const GIFT_BOX_REST: Readonly<Record<GiftBoxTrack, GiftBoxPose>> = {
  hop: REST,
  shadow: REST,
  splash: HIDDEN,
  ribbon: REST,
  lidShade: REST,
  inside: HIDDEN,
  light: HIDDEN,
  lid: REST,
  tag: REST,
  tailLeft: REST,
  tailRight: REST,
  loopLeft: REST,
  loopRight: REST,
  knot: REST,
  sparks: HIDDEN,
};

// ─────────────────────────────────────────────────────────────── building a track

type Ease = 'linear' | 'in' | 'out' | 'inOut';
const EASES: Readonly<Record<Ease, (t: number) => number>> = {
  linear: (t) => t,
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  inOut: (t) => 0.5 - Math.cos(Math.PI * t) / 2,
};

/** A beat: at `ms`, the part reaches these values (the rest carried on from the beat before), arriving with `ease`. */
type Beat = readonly [ms: number, pose: Partial<GiftBoxPose>, ease?: Ease];

/** How many straight pieces an eased stretch between two beats is drawn with: enough that no corner shows at 60 fps. */
const PIECES = 5;

/** Rounded to thousandths, and never -0, which would tell a mirrored rest from the rest. */
const r3 = (v: number): number => Math.round(v * 1000) / 1000 || 0;
const r4 = (v: number): number => Math.round(v * 10000) / 10000;

/** A track from its beats over a play of `total` ms, starting from `from`, held at its last pose to the end. */
function track(total: number, from: GiftBoxPose, beats: readonly Beat[]): GiftBoxKey[] {
  const keys: GiftBoxKey[] = [{ at: 0, ...from }];
  let pose = from;
  let ms = 0;
  for (const [at, change, ease = 'inOut'] of beats) {
    if (at < ms || at > total) throw new RangeError(`art: a beat at ${at} ms is out of order`);
    const next = { ...pose, ...change };
    const f = EASES[ease];
    const pieces = ease === 'linear' || at - ms < 40 ? 1 : PIECES;
    for (let i = 1; i <= pieces; i++) {
      const t = f(i / pieces);
      const k = {} as GiftBoxPose;
      for (const name of Object.keys(next) as (keyof GiftBoxPose)[]) k[name] = r3(pose[name] + (next[name] - pose[name]) * t);
      keys.push({ at: r4(ms + ((at - ms) * i) / pieces), ...k });
    }
    pose = next;
    ms = at;
  }
  if (ms < total) keys.push({ at: total, ...pose });
  // As shares of the play; a beat at the same moment as the one before replaces it.
  const out: GiftBoxKey[] = [];
  for (const k of keys) {
    const at = r4(k.at / total);
    if (out.length > 0 && out[out.length - 1]!.at === at) out.pop();
    out.push({ ...k, at });
  }
  return out;
}

/** A part's pose at `share` of a track, straight between keys and held beyond its ends. */
export function giftBoxPoseAt(keys: readonly GiftBoxKey[], share: number): GiftBoxPose {
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (!first || !last) throw new RangeError('art: an empty gift box track');
  const pick = ({ x, y, sx, sy, rot, o }: GiftBoxPose): GiftBoxPose => ({ x, y, sx, sy, rot, o });
  if (share <= first.at) return pick(first);
  if (share >= last.at) return pick(last);
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i]!;
    if (share > b.at) continue;
    const a = keys[i - 1]!;
    const t = b.at === a.at ? 1 : (share - a.at) / (b.at - a.at);
    const mixed = {} as GiftBoxPose;
    for (const name of ['x', 'y', 'sx', 'sy', 'rot', 'o'] as const) mixed[name] = a[name] + (b[name] - a[name]) * t;
    return mixed;
  }
  return pick(last);
}

/** A track's mirror for the right-hand part: turned the other way. */
const mirror = (beats: readonly Beat[]): Beat[] => beats.map(([ms, pose, ease]) => [ms, pose.rot === undefined ? pose : { ...pose, rot: -pose.rot || 0 }, ease]);

// ─────────────────────────────────────────────────────────────── waiting

/** One round of the waiting box: a hop at its start, a glint a while later, and rest between. */
export const GIFT_BOX_IDLE_MS = 8000;
/** When in the round the box lands from its hop. */
const IDLE_LAND = 650;

/** The hop: a crouch, a stretch up, a short hang, the fall, a squash as it lands, and a settle. */
const HOP: readonly Beat[] = [
  [140, { sx: 1.08, sy: 0.9 }, 'out'],
  [330, { y: -13, sx: 0.94, sy: 1.08, rot: -2 }, 'out'],
  [420, { y: -15, sx: 0.98, sy: 1.02, rot: -1 }],
  [570, { y: 0, sx: 0.96, sy: 1.06, rot: 1 }, 'in'],
  [IDLE_LAND, { sx: 1.1, sy: 0.88, rot: 0 }, 'out'],
  [780, { sx: 0.97, sy: 1.04 }],
  [900, { sx: 1.01, sy: 0.99 }],
  [1040, { sx: 1, sy: 1 }],
];

/** The left loop, a beat behind the box: pressed down as it rises, thrown up at the top, slapped down on landing, wobbling still. */
const LOOP_HOP: readonly Beat[] = [
  [190, { rot: -9, sy: 0.9 }, 'out'],
  [380, { rot: -3, sy: 0.98 }],
  [470, { rot: 6, sy: 1.06 }, 'out'],
  [620, { rot: 4, sy: 1.03 }],
  [710, { rot: -11, sy: 0.88 }, 'out'],
  [830, { rot: 6, sy: 1.05 }],
  [950, { rot: -3, sy: 0.98 }],
  [1080, { rot: 1.5, sy: 1 }],
  [1200, { rot: 0 }],
];
const TAIL_HOP: readonly Beat[] = [
  [200, { rot: 5 }, 'out'],
  [430, { rot: -4 }],
  [710, { rot: 8 }, 'out'],
  [850, { rot: -4 }],
  [990, { rot: 2 }],
  [1130, { rot: 0 }],
];
/** The tag swings on its string like a pendulum, longest after the landing. */
const TAG_HOP: readonly Beat[] = [
  [200, { rot: 6 }, 'out'],
  [450, { rot: -5 }],
  [700, { rot: 14 }, 'out'],
  [870, { rot: -9 }],
  [1020, { rot: 5 }],
  [1170, { rot: -2 }],
  [1320, { rot: 0 }],
];

export const GIFT_BOX_IDLE: GiftBoxPlay = (() => {
  const ms = GIFT_BOX_IDLE_MS;
  return {
    ms,
    loop: true,
    tracks: {
      hop: track(ms, REST, HOP),
      shadow: track(ms, REST, [
        [140, { sx: 1.04, sy: 1.04 }, 'out'],
        [330, { sx: 0.8, sy: 0.8, o: 0.7 }, 'out'],
        [420, { sx: 0.76, sy: 0.76, o: 0.65 }],
        [570, { sx: 0.98, sy: 0.98, o: 1 }, 'in'],
        [IDLE_LAND, { sx: 1.08, sy: 1.08 }, 'out'],
        [800, { sx: 1, sy: 1 }],
      ]),
      loopLeft: track(ms, REST, LOOP_HOP),
      loopRight: track(ms, REST, mirror(LOOP_HOP)),
      tailLeft: track(ms, REST, TAIL_HOP),
      tailRight: track(ms, REST, mirror(TAIL_HOP)),
      knot: track(ms, REST, [
        [IDLE_LAND, { sx: 1, sy: 1 }],
        [IDLE_LAND + 70, { sx: 1.1, sy: 0.9 }, 'out'],
        [IDLE_LAND + 200, { sx: 1, sy: 1 }],
      ]),
      tag: track(ms, REST, TAG_HOP),
      sparks: track(ms, { ...HIDDEN, sx: 0.6, sy: 0.6 }, [
        [300, { o: 0 }],
        [390, { o: 1, sx: 1, sy: 1, y: -2 }, 'out'],
        [640, { o: 0, sx: 1.2, sy: 1.2, y: -6 }, 'in'],
      ]),
      splash: track(ms, { ...HIDDEN, sx: 0.6, sy: 0.6 }, [
        [IDLE_LAND - 20, { o: 0 }],
        [IDLE_LAND + 60, { o: 1, sx: 1, sy: 1, y: -1 }, 'out'],
        [IDLE_LAND + 340, { o: 0, sx: 1.25, sy: 1.25, y: 1 }, 'in'],
      ]),
    },
    glints: [[4400 / ms, 5100 / ms]],
  };
})();

// ─────────────────────────────────────────────────────────────── unwrapping

/** How each tier's unwrap is built inside its time: the shaking first, then the squash, then the pop. */
interface UnwrapShape {
  /** bursts of shaking before it opens, each fiercer than the last */
  bursts: number;
  /** the last burst's turn either way, in degrees */
  shake: number;
  squashMs: number;
  popMs: number;
  /** how big the pop is: how high the box springs and how far the lid flies */
  heave: number;
}

const UNWRAP_SHAPE: Readonly<Record<GiftTier, UnwrapShape>> = {
  common: { bursts: 1, shake: 5, squashMs: 90, popMs: 430, heave: 0.75 },
  rare: { bursts: 2, shake: 7, squashMs: 140, popMs: 620, heave: 0.9 },
  legendary: { bursts: 3, shake: 8, squashMs: 170, popMs: 760, heave: 1.05 },
  grand: { bursts: 4, shake: 9, squashMs: 200, popMs: 900, heave: 1.2 },
};

/** The box opening, timed to its tier's `GIFT_UNWRAP_MS`, and the moment within it the light bursts out. */
export interface GiftBoxUnwrap extends GiftBoxPlay {
  /** When the light bursts out, in ms from the start: the moment the stage's rays may come up. */
  burstMs: number;
}

/**
 * The unwrap at `tier`: shaking in bursts that grow (light leaking out with each), a squash, the ribbon sliding loose,
 * then the box springs, the lid and bow fly up and off to the right with the loops flapping and the tag swinging, the
 * light bursts out of the open box with sparks, and the box lands with gold thrown out. It ends open and lit, still,
 * for the gift to come out of (`GIFT_BOX_EXIT`).
 */
export function giftBoxUnwrap(tier: GiftTier): GiftBoxUnwrap {
  const shape = UNWRAP_SHAPE[tier];
  if (!shape) throw new RangeError(`art: no unwrap for tier ${String(tier)}`);
  const ms = GIFT_UNWRAP_MS[tier];
  const { bursts, shake, squashMs, popMs, heave } = shape;
  const wait = ms - popMs - squashMs;
  const hop: Beat[] = [];
  const light: Beat[] = [];
  const knot: Beat[] = [];
  // The shaking: a pause, then a burst of quick turns either way, each burst fiercer and longer-lifted than the last.
  const burstMs = (wait * 0.62) / bursts;
  const pauseMs = (wait * 0.38) / bursts;
  let t = 0;
  for (let i = 0; i < bursts; i++) {
    const grow = bursts === 1 ? 1 : 0.35 + (0.65 * i) / (bursts - 1);
    const amp = shake * grow;
    t += pauseMs;
    hop.push([Math.round(t), { rot: 0, sx: 1, sy: 1, y: 0 }]);
    light.push([Math.round(t), { o: 0, sx: 0.7, sy: 0.7 }]);
    const halves = Math.max(2, Math.round(burstMs / 70));
    const half = burstMs / halves;
    const lift = i >= bursts - 2 && bursts > 1 ? -2.5 * grow : 0;
    for (let h = 1; h <= halves; h++) {
      const last = h === halves;
      const turn = last ? 0 : (h % 2 === 1 ? -amp : amp) * (0.75 + (0.25 * h) / halves);
      hop.push([Math.round(t + half * h), { rot: turn, sx: last ? 1 : 1.03, sy: last ? 1 : 0.97, y: last ? 0 : h % 2 === 1 ? lift : 0 }, 'inOut']);
    }
    light.push([Math.round(t + burstMs * 0.4), { o: 0.3 * grow, sx: 0.85, sy: 0.85 }, 'out']);
    light.push([Math.round(t + burstMs), { o: 0, sx: 0.7, sy: 0.7 }, 'in']);
    t += burstMs;
  }
  // The squash, deep and held for a breath: something is about to happen.
  const sq = wait;
  const pop = wait + squashMs;
  hop.push([Math.round(sq + squashMs * 0.7), { rot: 0, sx: 1.15, sy: 0.83, y: 0 }, 'out']);
  hop.push([pop, { sx: 1.14, sy: 0.84 }]);
  light.push([Math.round(sq + squashMs * 0.8), { o: 0.45, sx: 0.9, sy: 0.9 }, 'out']);
  knot.push([Math.round(sq + squashMs * 0.7), { sx: 1.12, sy: 0.88 }, 'out']);
  const at = (share: number): number => Math.round(pop + popMs * share);
  // The pop: up, stretching, a short hang, down, a squash as it lands, and a settle.
  hop.push(
    [at(0.2), { y: -10 * heave, sx: 0.9, sy: 1.14 }, 'out'],
    [at(0.36), { y: -12 * heave, sx: 0.97, sy: 1.04 }],
    [at(0.52), { y: 0, sx: 0.96, sy: 1.05 }, 'in'],
    [at(0.62), { sx: 1.1, sy: 0.9 }, 'out'],
    [at(0.78), { sx: 0.98, sy: 1.03 }],
    [at(0.92), { sx: 1, sy: 1 }],
  );
  // The light bursts out as the lid goes: past full, then settling; it stays, pouring out of the open box.
  light.push([at(0.04), { o: 0.5, sx: 0.6, sy: 0.6 }, 'linear'], [at(0.22), { o: 1, sx: 1.18, sy: 1.18 }, 'out'], [at(0.5), { sx: 1, sy: 1 }]);
  knot.push([pop, { sx: 1.12, sy: 0.88 }], [at(0.14), { sx: 0.9, sy: 1.12 }, 'out'], [at(0.32), { sx: 1.05, sy: 0.95 }], [at(0.5), { sx: 1, sy: 1 }]);
  // The lid and everything on it: held a moment by the ribbon, then up and away to the right, turning, and gone.
  const lid: Beat[] = [
    [pop, {}],
    [at(0.08), { y: -4 * heave }, 'out'],
    [at(0.3), { x: 16 * heave, y: -36 * heave, rot: 18 }, 'out'],
    [at(0.6), { x: 38 * heave, y: -24 * heave, rot: 46, sx: 0.96, sy: 0.96 }],
    [at(0.86), { x: 52 * heave, y: 4, rot: 72, sx: 0.9, sy: 0.9, o: 0 }, 'in'],
  ];
  // The bow follows through: the loops pressed down by the launch, whipped up, flapping out; the tails stream.
  const loop: Beat[] = [
    [pop, {}],
    [at(0.16), { rot: -18, sy: 0.8 }, 'out'],
    [at(0.34), { rot: 14, sy: 1.1 }],
    [at(0.5), { rot: -8, sy: 0.95 }],
    [at(0.66), { rot: 4, sy: 1.02 }],
    [at(0.8), { rot: 0, sy: 1 }],
  ];
  const tail: Beat[] = [
    [pop, {}],
    [at(0.2), { rot: 16 }, 'out'],
    [at(0.4), { rot: -10 }],
    [at(0.6), { rot: 4 }],
    [at(0.8), { rot: 0 }],
  ];
  const tag: Beat[] = [
    [Math.round(sq), {}],
    [Math.round(sq + squashMs * 0.8), { rot: -8 }, 'out'],
    [at(0.22), { rot: 28 }, 'out'],
    [at(0.44), { rot: -18 }],
    [at(0.64), { rot: 10 }],
    [at(0.84), { rot: -4 }],
  ];
  return {
    ms,
    loop: false,
    burstMs: at(0.1),
    tracks: {
      hop: track(ms, REST, hop),
      shadow: track(ms, REST, [
        [Math.round(sq + squashMs * 0.7), { sx: 1.06, sy: 1.06 }, 'out'],
        [pop, {}],
        [at(0.3), { sx: 0.82, sy: 0.82, o: 0.7 }, 'out'],
        [at(0.52), { sx: 1, sy: 1, o: 1 }, 'in'],
        [at(0.62), { sx: 1.08, sy: 1.08 }, 'out'],
        [at(0.8), { sx: 1, sy: 1 }],
      ]),
      // the ribbon slides up off the walls and is gone as the lid lifts
      ribbon: track(ms, REST, [
        [Math.round(sq + squashMs * 0.5), {}],
        [at(0.16), { y: -7, o: 0 }, 'out'],
      ]),
      lidShade: track(ms, REST, [
        [pop, {}],
        [at(0.1), { o: 0 }, 'out'],
      ]),
      inside: track(ms, HIDDEN, [
        [pop, {}],
        [at(0.04), { o: 1 }, 'linear'],
      ]),
      light: track(ms, HIDDEN, light),
      lid: track(ms, REST, lid),
      loopLeft: track(ms, REST, loop),
      loopRight: track(ms, REST, mirror(loop)),
      tailLeft: track(ms, REST, tail),
      tailRight: track(ms, REST, mirror(tail)),
      knot: track(ms, REST, knot),
      tag: track(ms, REST, tag),
      sparks: track(ms, { ...HIDDEN, sx: 0.5, sy: 0.5 }, [
        [at(0.08), {}],
        [at(0.26), { o: 1, sx: 1.15, sy: 1.15, y: -4 }, 'out'],
        [at(0.75), { o: 0, sx: 1.4, sy: 1.4, y: -10 }, 'in'],
      ]),
      splash: track(ms, { ...HIDDEN, sx: 0.6, sy: 0.6 }, [
        [at(0.56), {}],
        [at(0.64), { o: 1, sx: 1, sy: 1, y: -1 }, 'out'],
        [at(0.98), { o: 0, sx: 1.3, sy: 1.3, y: 1 }, 'in'],
      ]),
    },
    // a richer gift catches the light once before it starts to shake
    glints: tier === 'common' ? [] : [[0, r4(Math.min(600, wait * 0.6) / ms)]],
  };
}

/** Every tier's unwrap, built once. */
export const GIFT_BOX_UNWRAPS: Readonly<Record<GiftTier, GiftBoxUnwrap>> = {
  common: giftBoxUnwrap('common'),
  rare: giftBoxUnwrap('rare'),
  legendary: giftBoxUnwrap('legendary'),
  grand: giftBoxUnwrap('grand'),
};

// ─────────────────────────────────────────────────────────────── giving way

/** The open box giving way to the gift: it sinks a little, shrinks and fades as its light swells, while the gift springs out. */
export const GIFT_BOX_EXIT_MS = 320;

/** The open box's pose for every part, as the unwrap leaves it. */
function openPose(name: GiftBoxTrack): GiftBoxPose {
  const keys = GIFT_BOX_UNWRAPS.common.tracks[name];
  return keys ? giftBoxPoseAt(keys, 1) : GIFT_BOX_REST[name];
}

export const GIFT_BOX_EXIT: GiftBoxPlay = (() => {
  const ms = GIFT_BOX_EXIT_MS;
  const tracks: Partial<Record<GiftBoxTrack, readonly GiftBoxKey[]>> = {};
  for (const name of GIFT_BOX_TRACKS) {
    const from = openPose(name);
    if (name === 'hop') tracks.hop = track(ms, from, [[ms, { y: 5, sx: 0.84, sy: 0.84, o: 0 }, 'in']]);
    // the light swells as the gift comes out of it, and goes with the box rather than before it
    else if (name === 'light') tracks.light = track(ms, from, [[ms, { sx: 1.4, sy: 1.4 }, 'out']]);
    else if (name === 'shadow') tracks.shadow = track(ms, from, [[ms, { sx: 0.7, sy: 0.7, o: 0 }, 'in']]);
    else tracks[name] = track(ms, from, []);
  }
  return { ms, loop: false, tracks, glints: [] };
})();

// ─────────────────────────────────────────────────────────────── sending

/** The sender's moment as a gift goes (shared gift-moment.ts): the gift shows, then is wrapped, tied and sent off. */
export const GIFT_BOX_SEND_MS = GIFT_SENT_FADE_MS + GIFT_SENT_MS;
/** When the dropped box lands over the gift, hiding it. */
const SEND_LAND = 600;

/**
 * The send: the gift springs in on its own, the box drops over it and lands with a squash, the ribbon slides into place,
 * the bow pops on with the tag swinging, and the box crouches, hops and flies up and away, smaller as it goes.
 */
export const GIFT_BOX_SEND: GiftBoxPlay = (() => {
  const ms = GIFT_BOX_SEND_MS;
  const popOn: GiftBoxPose = { ...HIDDEN, sx: 0, sy: 0 };
  const loop: Beat[] = [
    [SEND_LAND + 100, {}],
    [SEND_LAND + 110, { o: 1 }, 'linear'],
    [SEND_LAND + 260, { sx: 1.18, sy: 1.18, rot: -6 }, 'out'],
    [SEND_LAND + 360, { sx: 0.94, sy: 0.94, rot: 4 }],
    [SEND_LAND + 460, { sx: 1, sy: 1, rot: 0 }],
    [1180, { rot: -8, sy: 0.9 }, 'out'],
    [1330, { rot: 10, sy: 1.1 }],
    [1500, { rot: 0, sy: 1 }],
  ];
  const tail: Beat[] = [
    [SEND_LAND + 120, {}],
    [SEND_LAND + 130, { o: 1 }, 'linear'],
    [SEND_LAND + 280, { sx: 1, sy: 1, rot: 10 }, 'out'],
    [SEND_LAND + 400, { rot: -4 }],
    [SEND_LAND + 500, { rot: 0 }],
    [1330, { rot: 12 }, 'out'],
    [1500, { rot: 0 }],
  ];
  return {
    ms,
    loop: false,
    tracks: {
      hop: track(ms, { ...HIDDEN, y: -46, sx: 0.9, sy: 1.1 }, [
        [380, {}],
        [440, { o: 1 }, 'linear'],
        [SEND_LAND, { y: 0, sx: 0.92, sy: 1.1 }, 'in'],
        [SEND_LAND + 80, { sx: 1.14, sy: 0.86 }, 'out'],
        [SEND_LAND + 200, { sx: 0.97, sy: 1.04 }],
        [SEND_LAND + 300, { sx: 1, sy: 1 }],
        [1080, {}],
        [1180, { sx: 1.1, sy: 0.88 }, 'out'],
        [1330, { y: -34, sx: 0.86, sy: 1.1 }, 'out'],
        [ms, { y: -78, sx: 0.55, sy: 0.6, o: 0 }, 'in'],
      ]),
      shadow: track(ms, { ...HIDDEN, sx: 0.5, sy: 0.5 }, [
        [440, {}],
        [SEND_LAND, { o: 1, sx: 1, sy: 1 }, 'in'],
        [SEND_LAND + 80, { sx: 1.08, sy: 1.08 }, 'out'],
        [SEND_LAND + 200, { sx: 1, sy: 1 }],
        [1180, { sx: 1.05, sy: 1.05 }],
        [1400, { o: 0, sx: 0.6, sy: 0.6 }, 'out'],
      ]),
      splash: track(ms, { ...HIDDEN, sx: 0.6, sy: 0.6 }, [
        [SEND_LAND, {}],
        [SEND_LAND + 80, { o: 1, sx: 1, sy: 1, y: -1 }, 'out'],
        [SEND_LAND + 350, { o: 0, sx: 1.25, sy: 1.25, y: 1 }, 'in'],
      ]),
      // the ribbon slides down into place before the bow is tied
      ribbon: track(ms, { ...HIDDEN, y: -8 }, [
        [SEND_LAND + 20, {}],
        [SEND_LAND + 160, { o: 1, y: 0 }, 'out'],
      ]),
      loopLeft: track(ms, popOn, loop),
      loopRight: track(ms, popOn, mirror(loop)),
      tailLeft: track(ms, { ...HIDDEN, sx: 0.2, sy: 0.2 }, tail),
      tailRight: track(ms, { ...HIDDEN, sx: 0.2, sy: 0.2 }, mirror(tail)),
      knot: track(ms, popOn, [
        [SEND_LAND + 90, {}],
        [SEND_LAND + 100, { o: 1 }, 'linear'],
        [SEND_LAND + 220, { sx: 1.25, sy: 1.25 }, 'out'],
        [SEND_LAND + 320, { sx: 1, sy: 1 }],
      ]),
      tag: track(ms, { ...HIDDEN, rot: 30 }, [
        [SEND_LAND + 180, {}],
        [SEND_LAND + 200, { o: 1 }, 'linear'],
        [SEND_LAND + 360, { rot: -14 }, 'out'],
        [SEND_LAND + 500, { rot: 7 }],
        [1230, { rot: -3 }],
        [1330, { rot: 12 }],
        [1500, { rot: 0 }],
      ]),
      sparks: track(ms, { ...HIDDEN, sx: 0.6, sy: 0.6 }, [
        [1180, {}],
        [1260, { o: 1, sx: 1, sy: 1, y: -2 }, 'out'],
        [1480, { o: 0, sx: 1.2, sy: 1.2, y: -8 }, 'in'],
      ]),
    },
    glints: [],
  };
})();

/** The gift itself through the send, on the same clock: shown until the box lands over it, then gone inside. */
export const GIFT_BOX_SEND_ITEM: readonly GiftBoxKey[] = track(GIFT_BOX_SEND_MS, REST, [
  [SEND_LAND - 40, {}],
  [SEND_LAND + 40, { o: 0, sx: 0.85, sy: 0.85 }, 'in'],
]);

// ─────────────────────────────────────────────────────────────── the glint

/** The glint is drawn at these phases across the box (gift-box.ts `giftBoxGlint`); showing each in turn is the pass. */
export const GIFT_BOX_GLINT_PHASES = [0.1, 0.26, 0.42, 0.58, 0.74, 0.9] as const;

/** Each glint frame's opacity through a play, as keys: each comes up and goes in its turn as light passes over the box. */
export function giftBoxGlintKeys(play: GiftBoxPlay): GiftBoxKey[][] {
  const frames = GIFT_BOX_GLINT_PHASES.length;
  return GIFT_BOX_GLINT_PHASES.map((_, i) => {
    const keys: GiftBoxKey[] = [{ at: 0, ...HIDDEN }];
    for (const [a, b] of play.glints) {
      const step = (b - a) / frames;
      const mid = a + step * (i + 0.5);
      // each frame is up for about one step, handing over to the next, so one band crosses the box
      for (const [at, o] of [
        [mid - step * 0.75, 0],
        [mid, 1],
        [mid + step * 0.75, 0],
      ] as const) {
        const share = r4(Math.min(1, Math.max(0, at)));
        if (share > keys[keys.length - 1]!.at) keys.push({ at: share, ...HIDDEN, o });
      }
    }
    if (keys[keys.length - 1]!.at < 1) keys.push({ at: 1, ...HIDDEN });
    return keys;
  });
}
