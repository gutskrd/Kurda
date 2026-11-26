/**
 * The land the lesson path runs through: each unit's landscape, the landmark beside its route, its little scene, and
 * which of the course's people belongs to it. The Kurmanji Road follows a village through one year, so each unit takes the land at
 * its place on that road (`pathLand`) and the seasons turn as the learner goes on; a course longer than twelve units
 * starts the year again.
 *
 * Pure numbers in the path's logical terms (`x` from the middle toward the end of a line, as `lessonPath` places stops),
 * so both apps agree and right-to-left pages mirror them like the stops. The drawings are in art/path-land.ts and
 * art/path-landmark.ts.
 */
import { PATH_SCENE_IDS, type PathSceneId } from './art/path-scenes.js';
import { seeded } from './art/svg.js';
import { sampleKeys } from './characters/life.js';
import { PATH_GEOMETRY, PATH_MASCOT, PATH_RETURN, mascotSpot } from './lesson-path.js';

/** The landmark that stands beside a unit's route. */
export const PATH_LANDMARKS = [
  'gate',
  'teahouse',
  'spring',
  'bazaar',
  'busstop',
  'citywall',
  'newroz',
  'hives',
  'bridge',
  'tents',
  'school',
  'hearth',
] as const;
export type PathLandmark = (typeof PATH_LANDMARKS)[number];

/** The ground a unit's route crosses: the season and the place. */
export const PATH_GROUNDS = ['orchard', 'meadow', 'lanes', 'town', 'stubble', 'plaza', 'bloom', 'honey', 'valley', 'alpine', 'autumn', 'snow'] as const;
export type PathGround = (typeof PATH_GROUNDS)[number];

/** Who of the course's people belongs to a unit's land, standing in its chapter's opening picture in the book. */
export type PathHost = 'hamo' | 'xezo';

export interface PathLand {
  landmark: PathLandmark;
  ground: PathGround;
  host: PathHost;
}

/** The twelve lands of the road in order. Hamo keeps the village and its stories; Xezo goes to town, the market, the pastures and school. */
export const PATH_LANDS: readonly PathLand[] = [
  { landmark: 'gate', ground: 'orchard', host: 'hamo' },
  { landmark: 'teahouse', ground: 'meadow', host: 'hamo' },
  { landmark: 'spring', ground: 'lanes', host: 'xezo' },
  { landmark: 'bazaar', ground: 'town', host: 'xezo' },
  { landmark: 'busstop', ground: 'stubble', host: 'hamo' },
  { landmark: 'citywall', ground: 'plaza', host: 'xezo' },
  { landmark: 'newroz', ground: 'bloom', host: 'hamo' },
  { landmark: 'hives', ground: 'honey', host: 'xezo' },
  { landmark: 'bridge', ground: 'valley', host: 'hamo' },
  { landmark: 'tents', ground: 'alpine', host: 'xezo' },
  { landmark: 'school', ground: 'autumn', host: 'xezo' },
  { landmark: 'hearth', ground: 'snow', host: 'hamo' },
];

/** The land of a course's unit, by its place in the course from 0. */
export function pathLand(index: number): PathLand {
  const at = ((Math.floor(index) % PATH_LANDS.length) + PATH_LANDS.length) % PATH_LANDS.length;
  return PATH_LANDS[at]!;
}

/** A box on a unit's path: `x` its middle, logical, from the path's middle; `y` its top; in points. */
export interface PathBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The landmark's largest and smallest size, and how near the page's edge it may stand. */
export const PATH_SCENERY = { landmark: 150, landmarkMin: 96, edge: 6 } as const;

/** The stop's own footprint, kept clear: its round, its lip and a little air. */
const STOP_CLEAR = PATH_GEOMETRY.node / 2 + 10;

/**
 * The landmark: at the top of the unit, on the start side of the first stop (which always stands in the middle), as large
 * as the room allows, its foot level with that stop's. Hevalo never stands there: beside a middle stop he stands on the
 * end side.
 */
export function landmarkBox(width: number): PathBox {
  const { landmark, landmarkMin, edge } = PATH_SCENERY;
  const half = width / 2;
  const size = Math.max(landmarkMin, Math.min(landmark, half - STOP_CLEAR - edge));
  // As far out as the edge allows without being cut, and no further than a wide page needs.
  const middle = Math.min(half - edge - size / 2, STOP_CLEAR + size / 2 + 72);
  const foot = PATH_GEOMETRY.pad + PATH_GEOMETRY.node / 2 + 4;
  return { x: -Math.max(middle, STOP_CLEAR + size / 2), y: foot - size, w: size, h: size };
}

/**
 * Motion on the path in ms and points, shared so both apps move alike: the current stop's bob, stops rising in turn when
 * their unit first comes into view, a chest's wobble before it bursts open, and a landmark's own small loop.
 */
export const PATH_MOTION = {
  bobMs: 2400,
  bob: 4,
  riseMs: 380,
  riseEach: 45,
  rise: 18,
  wobbleAtMs: PATH_RETURN.finishAtMs + PATH_RETURN.popMs,
  wobbleMs: 640,
  wobble: 9,
  /** a landmark's own small loop, once round */
  loopMs: 2800,
} as const;

/**
 * The words in the bubble over the stop to do now, in the course's own dialect whatever the reader's language, so the
 * road greets every learner in the language they are learning: "Start here!" for a topic not begun, "Keep going!" for
 * one under way.
 */
export const PATH_START_WORDS: Readonly<Record<'kurmanji' | 'sorani', { start: string; going: string }>> = {
  kurmanji: { start: 'Ji vir dest pê bike!', going: 'Berdewam bike!' },
  sorani: { start: 'لێرەوە دەست پێ بکە!', going: 'بەردەوام بە!' },
};

/**
 * The little scene beside each chapter's road, chosen from the chapter itself: Hevalo eating an apple over the orchard
 * wall where apples go missing, Hamo sugaring his tea far too much where there is tea and time, the pigeon trying to land
 * with a letter where letters come and go, and Xezo chalking Kurmanji's own letters on her slate where there is something
 * to learn. A course longer than twelve chapters starts them again.
 */
export const PATH_SCENE_ORDER: readonly PathSceneId[] = ['apple', 'tea', 'letter', 'slate', 'tea', 'letter', 'slate', 'apple', 'tea', 'apple', 'slate', 'letter'];

/** The scene beside a course's unit, by its place in the course from 0. */
export function pathScene(index: number): PathSceneId {
  const at = ((Math.floor(index) % PATH_SCENE_ORDER.length) + PATH_SCENE_ORDER.length) % PATH_SCENE_ORDER.length;
  return PATH_SCENE_ORDER[at]!;
}

/**
 * Where a unit's playful touches stand, in the stops' logical terms. `scene`: the side its little scene leans in from
 * (-1 the start of the line, 1 its end), opposite the lean of the unit's fourth stop (or its third, or its second), and
 * `y`, the scene's middle from the unit's top, level with that stop; the apps stand it against the screen's edge on that
 * side. `chest`: the unit's painted sandûq on the open side of its second stop, `x` and `y` its middle.
 *
 * Both keep clear of the stop to do now (`here`): of Hevalo beside it (`mascotSpot`), and of the bubble and bar over it.
 * Since Hevalo is there himself, the scene of him eating his apple is left out of his unit.
 */
export const PATH_SCENERY_SPOT = { chestAcross: 112, sceneClear: 150, chestClear: 96 } as const;

/** How far in from the screen's edge a scene's drawing reaches, and how far above and below its middle. */
export const PATH_SCENE_REACH = { across: 128, up: 82, down: 82 } as const;

/** The bubble and bar over the stop to do now, from the stop's middle: across each way, and how far up. */
const BUBBLE = { across: 104, up: 128 } as const;

export function unitScenery(
  stops: readonly { x: number; y: number }[],
  here: { x: number; y: number } | null = null,
  scene: PathSceneId | null = null,
  /** The page's width, where the scene's reach from the edge is known; without it, only Hevalo is kept clear of. */
  width: number | null = null,
): { scene: { side: -1 | 1; y: number } | null; chest: { x: number; y: number } | null } {
  const { chestAcross, sceneClear, chestClear } = PATH_SCENERY_SPOT;
  const sideOf = (stop: { x: number }, otherwise: -1 | 1): -1 | 1 => (Math.sign(stop.x) === 0 ? otherwise : (-Math.sign(stop.x) as -1 | 1));
  // Hevalo's middle, level with the stop he stands by.
  const spot = here ? mascotSpot(here) : null;
  const him = spot ? { x: spot.x, y: spot.y + PATH_MASCOT.size / 2 } : null;
  const nearHim = (x: number, y: number, clear: number): boolean => !!him && Math.sign(x) === Math.sign(him.x) && Math.abs(y - him.y) < clear;

  let place: { side: -1 | 1; y: number } | null = null;
  const anchor = stops[3] ?? stops[2] ?? stops[1];
  if (anchor && !(scene === 'apple' && him)) {
    const side = sideOf(anchor, -1);
    place = { side, y: anchor.y };
    if (nearHim(side, anchor.y, sceneClear)) place = null;
    // Clear of the bubble over the stop to do now, where the page's width says how far in the scene reaches.
    if (place && here && width !== null) {
      const inner = width / 2 - PATH_SCENE_REACH.across;
      const reaches = side * here.x + BUBBLE.across > inner;
      const level = here.y - BUBBLE.up < anchor.y + PATH_SCENE_REACH.down && here.y > anchor.y - PATH_SCENE_REACH.up;
      if (reaches && level) place = null;
    }
  }
  const second = stops[1];
  const chestSide = second ? sideOf(second, 1) : 1;
  const chest = stops.length > 2 && second && !nearHim(chestSide, second.y, chestClear) ? { x: chestSide * chestAcross, y: second.y } : null;
  return { scene: place, chest };
}

/**
 * How the scenes move, in ms, shared so both apps play them alike. Each but the pigeon's goes on a beat at a time
 * (`sceneBeat`): a bite, a sugar cube, a letter, each beat a little longer or shorter than the last (`sceneBeatMs`) so
 * the scene never ticks like a clock. The pigeon's try at landing is one flight (`PATH_PIGEON_FLIGHT`). The rest are the
 * small moments inside a beat, and how long a tap's own moment lasts.
 */
export const PATH_SCENE_MOTION = {
  beatMs: { apple: 3400, tea: 3000, slate: 2500 },
  beats: { apple: 7, tea: 6, slate: 6 },
  crumbMs: 900,
  cubeMs: 560,
  chalkMs: 420,
  dropMs: 800,
  growMs: 900,
  flapMs: 180,
  tapMs: 1000,
} as const;

/** How much longer or shorter each beat runs than the scene's own, in turn: no two scenes keep the same time. */
const BEAT_SWING = [1, 1.3, 0.8, 1.15, 0.9, 1.45, 0.85, 1.1, 0.95] as const;

/** How long a scene's `beat` lasts before the next, varied beat by beat. */
export function sceneBeatMs(scene: Exclude<PathSceneId, 'letter'>, beat: number): number {
  const turn = PATH_SCENE_IDS.indexOf(scene) * 2;
  const k = BEAT_SWING[(((Math.floor(beat) + turn) % BEAT_SWING.length) + BEAT_SWING.length) % BEAT_SWING.length]!;
  return Math.round(PATH_SCENE_MOTION.beatMs[scene] * k);
}

/**
 * Hevalo reaching for his apple on a bite: he draws back a little, stretches his neck in to the apple and bites
 * (`biteAt`), pulls back with it, overshoots and settles. `stretch` is his height (1 as drawn) and `turn` degrees about the
 * foot of his neck, which stays past the edge, over `ms`. The bough gives as he tugs: `tug` degrees about its root at
 * the edge, springing back.
 */
export const PATH_APPLE_REACH = {
  ms: 1500,
  biteAt: 0.36,
  stretch: [[0, 1], [0.14, 0.95], [0.32, 1.12], [0.4, 1.1], [0.56, 0.98], [0.72, 1.01], [1, 1]],
  turn: [[0, 0], [0.14, 2.5], [0.32, -4], [0.4, -3.5], [0.56, 1.2], [0.75, -0.4], [1, 0]],
  tug: [[0, 0], [0.34, 0], [0.42, 4], [0.52, -2], [0.62, 1.1], [0.74, -0.5], [0.86, 0.2], [1, 0]],
} as const satisfies Record<'stretch' | 'turn' | 'tug', readonly (readonly [number, number])[]> & { ms: number; biteAt: number };

/** What a character does on a beat, by its act's name in the characters' shared acts. */
export type SceneAct = 'chew' | 'tongue' | 'preen' | 'chuckle' | 'tuck' | 'wink';

/** A scene at one beat. */
export interface SceneBeat {
  /** The apple: bites taken so far, 0 to 4, or 5 once only the core is left. */
  bites: number;
  /** The core dropping and a new apple growing on the bough. */
  growing: boolean;
  /** Crumbs falling from the bite just taken. */
  crumbs: boolean;
  /** A sugar cube hopping from the bowl into the glass. */
  cube: boolean;
  /** Letters chalked on the slate so far, 0 to 3, and the slate being wiped for the next ones. */
  letters: number;
  wiping: boolean;
  /** What the character does on this beat. */
  act: SceneAct | null;
}

const REST_BEAT: SceneBeat = { bites: 0, growing: false, crumbs: false, cube: false, letters: 0, wiping: false, act: null };

/**
 * A scene's `beat`, counted from when it came into view, round its cycle. Hevalo takes four bites with a chew after
 * each, licks his lips at the core, then the core drops as a new apple grows; Hamo drops in four cubes, preening his
 * moustache at each, and laughs at himself; Xezo chalks ê, ç and ş, tucks her hair back pleased, winks, and wipes the
 * slate. The pigeon has no beats. Under Reduce Motion the apps stay on beat 0.
 */
export function sceneBeat(scene: PathSceneId, beat: number): SceneBeat {
  if (scene === 'letter') return REST_BEAT;
  const count = PATH_SCENE_MOTION.beats[scene];
  const at = ((Math.floor(beat) % count) + count) % count;
  if (scene === 'apple') {
    if (at >= 1 && at <= 4) return { ...REST_BEAT, bites: at, crumbs: true, act: 'chew' };
    if (at === 5) return { ...REST_BEAT, bites: 5, act: 'tongue' };
    if (at === 6) return { ...REST_BEAT, growing: true };
    return REST_BEAT;
  }
  if (scene === 'tea') {
    if (at >= 1 && at <= 4) return { ...REST_BEAT, cube: true, act: 'preen' };
    if (at === 5) return { ...REST_BEAT, act: 'chuckle' };
    return REST_BEAT;
  }
  if (at >= 1 && at <= 3) return { ...REST_BEAT, letters: at, act: at === 3 ? 'tuck' : null };
  if (at === 4) return { ...REST_BEAT, letters: 3, act: 'wink' };
  if (at === 5) return { ...REST_BEAT, letters: 3, wiping: true };
  return REST_BEAT;
}

/**
 * The pigeon's try at landing on the twig's tip with its letter, round once in `ms`: it flies in from the screen's edge,
 * overshoots, comes back and lands, teeters, settles with the letter, then turns round and flies back out by the edge
 * until its next try, never leaving its scene but by that edge. `x` and `y` are points from its place on the twig (on
 * the road's start side; the apps mirror `x` on the other), `tilt` degrees, `face` 1 facing in and -1 facing out, and
 * `shown` its opacity. It is on the twig from `perched[0]` to `perched[1]` of the way round, and flapping otherwise.
 */
export const PATH_PIGEON_FLIGHT = {
  ms: 11000,
  x: [[0, -150], [0.06, -128], [0.22, -34], [0.3, 8], [0.38, -2], [0.44, 0], [0.86, 0], [0.9, -8], [0.94, -70], [1, -160]],
  y: [[0, -34], [0.06, -36], [0.22, -30], [0.3, -12], [0.38, -16], [0.44, 0], [0.86, 0], [0.9, -14], [0.94, -30], [1, -38]],
  face: [[0, 1], [0.88, 1], [0.895, -1], [1, -1]],
  tilt: [[0, 0], [0.44, 0], [0.48, 16], [0.52, -11], [0.56, 7], [0.6, -3], [0.64, 0], [1, 0]],
  shown: [[0, 0], [0.06, 1], [0.94, 1], [1, 0]],
  perched: [0.44, 0.88],
  /** The twig dipping under the landing and springing back, and again as the pigeon pushes off: degrees about its root. */
  twig: [[0, 0], [0.44, 0], [0.47, 5], [0.52, -2.4], [0.57, 1.2], [0.62, -0.4], [0.66, 0], [0.88, 0], [0.9, 3.2], [0.94, -1.4], [0.98, 0.4], [1, 0]],
} as const satisfies {
  ms: number;
  x: readonly (readonly [number, number])[];
  y: readonly (readonly [number, number])[];
  tilt: readonly (readonly [number, number])[];
  face: readonly (readonly [number, number])[];
  shown: readonly (readonly [number, number])[];
  perched: readonly [number, number];
  twig: readonly (readonly [number, number])[];
};

/**
 * The moment a finished stop becomes its wax seal, the first time the learner comes back to the road after finishing it:
 * a big drop of red wax falls onto the tile and lands with a splash, the tile melts under it as the wax flows out round
 * into the seal's poured disc, and the brass stamp comes in over it, draws up, presses the seal so it squashes and the wax
 * spreads, and lifts away, overshooting a little, to show the sun pressed in it. Each track runs from 0 to 1 of `ms`:
 * `blob` the falling drop's height over the tile in points, its opacity and `splat` its height as it lands (its width
 * the other way); `splash` the droplets it throws out, their spread and opacity; `melt` the tile melting away (0 as it
 * stands, 1 gone); `flow` the poured disc's size (with its opacity, `poured`); `tool` the stamp's height and opacity,
 * `tilt` its lean in degrees (it comes in leaning, presses straight and rocks a little as it lifts), and `dieOpen` how
 * far its die opens out to show its face (1 as drawn, edge on as it presses, open for a beat as it rises); `squash` the
 * stop's height (1 as drawn). The suns show from `pressAt`, under the stamp, and a phone taps then.
 */
export const PATH_STAMP_MOMENT = {
  ms: PATH_RETURN.stampMs,
  pressAt: 0.5,
  // Falling as a dropped thing falls, faster and faster.
  blobY: [[0, -50], [0.02, -50], [0.06, -43], [0.09, -30], [0.115, -13], [0.13, 0], [1, 0]],
  blobShown: [[0, 0], [0.02, 0], [0.035, 1], [0.19, 1], [0.24, 0], [1, 0]],
  splat: [[0, 1.08], [0.12, 1.1], [0.14, 0.6], [0.17, 0.72], [0.2, 0.45], [1, 0.45]],
  splash: [[0, 0.5], [0.13, 0.5], [0.22, 1.35], [1, 1.35]],
  splashShown: [[0, 0], [0.13, 0], [0.14, 1], [0.2, 0.8], [0.26, 0], [1, 0]],
  flow: [[0, 0.3], [0.14, 0.3], [0.27, 0.97], [0.31, 1.02], [0.36, 1], [0.5, 1], [0.53, 1.035], [0.64, 1], [1, 1]],
  poured: [[0, 0], [0.14, 0], [0.16, 1], [1, 1]],
  // The tile slumps and goes as the wax spreads over it, gone well before the stamp comes.
  melt: [[0, 0], [0.14, 0], [0.3, 1], [1, 1]],
  // In and down, up a little to gather itself, then down hard, held, and off with a little too much spring.
  toolY: [[0, -50], [0.26, -50], [0.36, -30], [0.44, -40], [0.465, -34], [0.485, -20], [0.5, 0], [0.58, 0], [0.7, -52], [0.78, -46], [1, -46]],
  toolShown: [[0, 0], [0.26, 0], [0.32, 1], [0.82, 1], [0.9, 0], [1, 0]],
  tilt: [[0, -8], [0.26, -8], [0.38, -1.5], [0.44, 0], [0.6, 0], [0.68, 2.2], [0.76, -0.8], [0.84, 0], [1, 0]],
  dieOpen: [[0, 1.6], [0.3, 1.6], [0.44, 1.15], [0.5, 1], [0.58, 1], [0.66, 2.6], [0.8, 2.6], [0.9, 1.6], [1, 1.6]],
  squash: [[0, 1], [0.5, 1], [0.525, 0.86], [0.6, 1.05], [0.68, 0.98], [0.75, 1]],
} as const satisfies Record<MomentTrack, readonly (readonly [number, number])[]> & { ms: number; pressAt: number };

/** The tracks of the sealing moment. */
type MomentTrack = 'blobY' | 'blobShown' | 'splat' | 'splash' | 'splashShown' | 'melt' | 'flow' | 'poured' | 'toolY' | 'toolShown' | 'tilt' | 'dieOpen' | 'squash';

/**
 * A round later, the stamp pressing a seal again, so the new sun is pressed in beside the others: it comes in over the
 * seal, draws up, presses down hard as the seal squashes a little, and lifts away; at `pressAt` the suns pressed in are
 * the new count. The tracks are as `PATH_STAMP_MOMENT`'s, over `ms`.
 */
export const PATH_STAMP_REPRESS = {
  ms: 900,
  pressAt: 0.42,
  toolY: [[0, -50], [0.2, -30], [0.32, -40], [0.36, -34], [0.39, -20], [0.42, 0], [0.52, 0], [0.68, -52], [0.78, -46], [1, -46]],
  toolShown: [[0, 0], [0.12, 1], [0.8, 1], [0.92, 0], [1, 0]],
  tilt: [[0, -8], [0.2, -1.5], [0.3, 0], [0.52, 0], [0.6, 2.2], [0.68, -0.8], [0.76, 0], [1, 0]],
  dieOpen: [[0, 1.6], [0.3, 1.15], [0.42, 1], [0.52, 1], [0.6, 2.6], [0.74, 2.6], [0.84, 1.6], [1, 1.6]],
  squash: [[0, 1], [0.42, 1], [0.45, 0.92], [0.53, 1.03], [0.62, 1]],
} as const satisfies Record<'toolY' | 'toolShown' | 'tilt' | 'dieOpen' | 'squash', readonly (readonly [number, number])[]> & { ms: number; pressAt: number };

/**
 * The stamp's shadow on the seal through a moment, from how high the stamp is: faint and wide while it hovers, darker
 * and smaller as it comes down, `shown` its opacity and `size` its scale.
 */
export function stampShadow(moment: { toolY: Keys; toolShown: Keys }): { shown: Array<[number, number]>; size: Array<[number, number]> } {
  const at = Array.from({ length: 81 }, (_, i) => i / 80);
  const near = (t: number): number => 1 - Math.min(1, Math.abs(sampleKeys(moment.toolY, t)) / 50);
  const round = (v: number): number => Math.round(v * 1000) / 1000;
  return {
    shown: at.map((t): [number, number] => [t, round(sampleKeys(moment.toolShown, t) * (0.06 + 0.36 * near(t)))]),
    size: at.map((t): [number, number] => [t, round(1.45 - 0.57 * near(t))]),
  };
}
type Keys = readonly (readonly [number, number])[];

/** The stamp's shadow through the first sealing, and through a press a round later. */
export const PATH_STAMP_SHADOW = stampShadow(PATH_STAMP_MOMENT);
export const PATH_REPRESS_SHADOW = stampShadow(PATH_STAMP_REPRESS);

/**
 * A topic's seal turning gold as its third sun is pressed in: once the stamp has lifted away, `afterMs` after its press
 * ends, the wax warms from red into gold over `warmMs`, and one glint crosses it over `glintMs`. A gold seal in view
 * glints again every `everyMs`, each stop at its own time (`waxGlintAt`): a pale band `band` points wide, leaning `tilt`
 * degrees. Under Reduce Motion it is simply gold, and still.
 */
export const PATH_WAX_GOLD = { afterMs: 120, warmMs: 650, glintMs: 1400, everyMs: 9000, band: 9, tilt: 24 } as const;

/** How far into its round of glints a stop's gold seal starts, in ms, so the gold seals down a road glint at their own times. */
export function waxGlintAt(stopKey: string): number {
  return Math.floor(seeded(`glint|${stopKey}`)() * PATH_WAX_GOLD.everyMs);
}
