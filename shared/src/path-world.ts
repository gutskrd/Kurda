/**
 * The land the lesson path runs through: each unit's landscape, the landmark beside its route, and which of the
 * course's people belongs to it. The Kurmanji Road follows a village through one year, so each unit takes the land at
 * its place on that road (`pathLand`) and the seasons turn as the learner goes on; a course longer than twelve units
 * starts the year again.
 *
 * Pure numbers in the path's logical terms (`x` from the middle toward the end of a line, as `lessonPath` places stops),
 * so both apps agree and right-to-left pages mirror them like the stops. The drawings are in art/path-land.ts and
 * art/path-landmark.ts.
 */
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

/** Who peeks out beside a unit's road: the course's people and the pigeon, one to a unit, in turn. */
export const PATH_PEEKERS = ['xezo', 'pigeon', 'hamo', 'hevalo'] as const;
export type PathPeeker = (typeof PATH_PEEKERS)[number];

/** Who peeks out beside a course's unit, by its place in the course from 0. */
export function pathPeeker(index: number): PathPeeker {
  const at = ((Math.floor(index) % PATH_PEEKERS.length) + PATH_PEEKERS.length) % PATH_PEEKERS.length;
  return PATH_PEEKERS[at]!;
}

/**
 * Where a unit's playful touches stand, in the stops' logical terms: `peek`, someone peeking in from the page's edge on
 * the open side of the unit's fourth stop (or its second), and `chest`, the unit's painted sandûq on the open side of
 * its second stop. `x` is the middle of each from the path's middle and `y` its middle from the unit's top. Either is
 * left out where Hevalo stands beside the stop to do now (`mascot`, from `mascotSpot`), so nobody stands on him.
 */
export const PATH_SCENERY_SPOT = { peekAcross: 132, chestAcross: 112, clear: 96 } as const;

export function unitScenery(
  stops: readonly { x: number; y: number }[],
  mascot: { x: number; y: number } | null = null,
): { peek: { x: number; y: number } | null; chest: { x: number; y: number } | null } {
  const { peekAcross, chestAcross, clear } = PATH_SCENERY_SPOT;
  const beside = (stop: { x: number; y: number } | undefined, across: number, side: number): { x: number; y: number } | null =>
    stop ? { x: (Math.sign(stop.x) === 0 ? side : -Math.sign(stop.x)) * across, y: stop.y } : null;
  // Hevalo's middle, level with the stop he stands by.
  const him = mascot ? { x: mascot.x, y: mascot.y + PATH_MASCOT.size / 2 } : null;
  const free = (spot: { x: number; y: number } | null): { x: number; y: number } | null =>
    spot && him && Math.sign(spot.x) === Math.sign(him.x) && Math.abs(spot.y - him.y) < clear ? null : spot;
  const peek = free(beside(stops[3] ?? stops[1], peekAcross, -1));
  const chest = stops.length > 2 ? free(beside(stops[1], chestAcross, 1)) : null;
  return { peek, chest };
}
