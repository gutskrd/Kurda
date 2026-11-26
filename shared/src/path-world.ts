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
import type { PathSceneId } from './art/path-scenes.js';
import { PATH_GEOMETRY, PATH_MASCOT, PATH_RETURN } from './lesson-path.js';

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
 * Where a unit's playful touches stand, in the stops' logical terms: `scene`, its little scene on the open side of the
 * unit's fourth stop (or its third, or its second), and `chest`, the unit's painted sandûq on the open side of its second stop. `x` is
 * the middle of each from the path's middle and `y` its middle from the unit's top. Either is left out where Hevalo
 * stands beside the stop to do now (`mascot`, from `mascotSpot`), so nobody stands on him; and since he is there himself,
 * so is the scene of him eating his apple.
 */
export const PATH_SCENERY_SPOT = { sceneAcross: 128, chestAcross: 112, sceneClear: 116, chestClear: 96 } as const;

export function unitScenery(
  stops: readonly { x: number; y: number }[],
  mascot: { x: number; y: number } | null = null,
  scene: PathSceneId | null = null,
): { scene: { x: number; y: number } | null; chest: { x: number; y: number } | null } {
  const { sceneAcross, chestAcross, sceneClear, chestClear } = PATH_SCENERY_SPOT;
  const beside = (stop: { x: number; y: number } | undefined, across: number, side: number): { x: number; y: number } | null =>
    stop ? { x: (Math.sign(stop.x) === 0 ? side : -Math.sign(stop.x)) * across, y: stop.y } : null;
  // Hevalo's middle, level with the stop he stands by.
  const him = mascot ? { x: mascot.x, y: mascot.y + PATH_MASCOT.size / 2 } : null;
  // A scene is taller than the chest, so it keeps further from him.
  const free = (spot: { x: number; y: number } | null, clear: number): { x: number; y: number } | null =>
    spot && him && Math.sign(spot.x) === Math.sign(him.x) && Math.abs(spot.y - him.y) < clear ? null : spot;
  const place = scene === 'apple' && him ? null : free(beside(stops[3] ?? stops[2] ?? stops[1], sceneAcross, -1), sceneClear);
  const chest = stops.length > 2 ? free(beside(stops[1], chestAcross, 1), chestClear) : null;
  return { scene: place, chest };
}

/**
 * How the scenes move, in ms, shared so both apps play them alike. Each but the pigeon's goes on a beat at a time
 * (`sceneBeat`): a bite, a sugar cube, a letter. The pigeon's try at landing is one flight (`PATH_PIGEON_FLIGHT`).
 * The rest are the small moments inside a beat, and how long a tap's own moment lasts.
 */
export const PATH_SCENE_MOTION = {
  beatMs: { apple: 3600, tea: 3200, slate: 2600 },
  beats: { apple: 7, tea: 6, slate: 6 },
  crumbMs: 900,
  cubeMs: 560,
  chalkMs: 420,
  dropMs: 800,
  growMs: 900,
  flapMs: 180,
  tapMs: 1000,
} as const;

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
 * The pigeon's try at landing on the fence post with its letter, round once in `ms`: it flies in, hovers, overshoots,
 * comes back and lands, teeters, settles with the letter, then flies off and away until its next try. `x` and `y` are
 * points from its place on the post (on the road's start side; the apps mirror `x` on the other), `tilt` degrees, and
 * `shown` its opacity. It is on the post from `perched[0]` to `perched[1]` of the way round, and flapping otherwise.
 */
export const PATH_PIGEON_FLIGHT = {
  ms: 11000,
  x: [[0, -96], [0.06, -84], [0.22, -8], [0.3, 10], [0.38, -2], [0.44, 0], [0.86, 0], [0.92, 26], [1, 96]],
  y: [[0, -70], [0.06, -62], [0.22, -20], [0.3, -14], [0.38, -18], [0.44, 0], [0.86, 0], [0.92, -20], [1, -76]],
  tilt: [[0, 0], [0.44, 0], [0.48, 16], [0.52, -11], [0.56, 7], [0.6, -3], [0.64, 0], [1, 0]],
  shown: [[0, 0], [0.06, 1], [0.94, 1], [1, 0]],
  perched: [0.44, 0.88],
} as const satisfies {
  ms: number;
  x: readonly (readonly [number, number])[];
  y: readonly (readonly [number, number])[];
  tilt: readonly (readonly [number, number])[];
  shown: readonly (readonly [number, number])[];
  perched: readonly [number, number];
};

/** A unit's rounds: full rounds every one of its topics has played, 0 to 3, which its scene's garland and milestone light up. */
export function unitRounds(stops: readonly { stop: { kind: string; rounds?: number } }[]): number {
  const skills = stops.map((p) => p.stop).filter((s) => s.kind === 'skill');
  if (skills.length === 0) return 0;
  return Math.max(0, Math.min(3, ...skills.map((s) => Math.floor(s.rounds ?? 0))));
}
