/**
 * The land the lesson path runs through: which landscape each unit crosses,
 * which landmark stands beside its route, who of the course's people waits
 * by it, where each of those stands, and where the stepping stones between
 * two stops lie.
 *
 * The Kurmanji Road walks one year in the life of a village: arriving at
 * Sêvan's blue gate, Hamo's tea, the spring under the walnut tree, market
 * day, the bus that left without them, Amed's black walls, the Newroz fire,
 * the hives whose honey went missing, the river Bozo ran off along, the black
 * tents of the summer pastures, the school, and the last winter by the stove.
 * Each unit of a course takes the land of the unit at its place on that road
 * (`pathLand`), so the seasons turn as the learner goes on — and a course
 * longer than twelve units starts the year again.
 *
 * Pure numbers in the path's own logical terms (`x` from the middle toward
 * the end of the line, as `lessonPath` places stops), so both apps put the
 * same things in the same places and a right-to-left page mirrors them as it
 * mirrors the stops. The drawings are art/path-land.ts.
 */
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

/** Who of the course's people stands by a unit: the rigs the lessons use, unchanged. */
export type PathHost = 'hamo' | 'xezo';

export interface PathLand {
  landmark: PathLandmark;
  ground: PathGround;
  host: PathHost;
}

/**
 * The twelve lands of the road, in its order. Hamo keeps the village and its
 * stories; Xezal goes where the road goes to town, to the market, to the
 * pastures and to her new school.
 */
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

/**
 * What stands where beside the stops: the landmark's largest size and how
 * close to the edge it may stand; the people's height, drawn whole (as tall
 * as Hevalo is on the path), and how much room their words take above them.
 */
export const PATH_SCENERY = { landmark: 150, landmarkMin: 96, edge: 6, host: 132, hostWidth: 88, bubble: 44, overStop: 130 } as const;

/** The stop's own footprint, for keeping things off it: its round, its lip and a little air. */
const STOP_CLEAR = PATH_GEOMETRY.node / 2 + 10;

/** A placed stop as the world needs it. */
export interface WorldStop {
  key: string;
  x: number;
  y: number;
}

/**
 * The landmark: at the top of the unit, on the start side of its first stop
 * (which always stands in the middle), as large as the room beside the path
 * allows, its foot level with the first stop's foot. Hevalo never stands
 * there: beside a stop in the middle he stands on the end side, and the next
 * stop leans toward the start, a step further down.
 */
export function landmarkBox(width: number): PathBox {
  const { landmark, landmarkMin, edge } = PATH_SCENERY;
  const half = width / 2;
  const size = Math.max(landmarkMin, Math.min(landmark, half - STOP_CLEAR - edge));
  // as far out as the edge allows, but never so far that it is cut by it, nor further than a wide page needs
  const middle = Math.min(half - edge - size / 2, STOP_CLEAR + size / 2 + 72);
  const foot = PATH_GEOMETRY.pad + PATH_GEOMETRY.node / 2 + 4;
  return { x: -Math.max(middle, STOP_CLEAR + size / 2), y: foot - size, w: size, h: size };
}

/** Where Hevalo stands beside a placed stop, as a box: `mascotSpot`'s place, drawn whole (PathMascot). */
export function mascotBox(stop: { x: number; y: number }): PathBox {
  const spot = mascotSpot(stop);
  const tall = PATH_SCENERY.host;
  return { x: spot.x, y: stop.y + PATH_GEOMETRY.node / 2 + 12 - tall, w: PATH_MASCOT.size, h: tall };
}

function overlaps(a: PathBox, b: PathBox): boolean {
  return Math.abs(a.x - b.x) * 2 < a.w + b.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Who waits by the unit, and beside which stop: the unit's last stop (its
 * chest), on the side away from its lean, as Hevalo would stand by it — or
 * nowhere, when Hevalo stands close enough to crowd them (`mascotAt`, the stop
 * he is beside, in this unit) or the landmark is in the way.
 */
export function hostBox(stops: readonly WorldStop[], width: number, mascotAt: WorldStop | null): { box: PathBox; by: string } | null {
  const last = stops[stops.length - 1];
  if (!last || stops.length < 3) return null;
  const box = mascotBox(last);
  // the words over them need room above, inside the unit
  box.y -= PATH_SCENERY.bubble;
  box.h += PATH_SCENERY.bubble;
  if (Math.abs(box.x) + box.w / 2 > width / 2) return null;
  if (mascotAt && overlaps(box, mascotBox(mascotAt))) return null;
  if (overlaps(box, landmarkBox(width))) return null;
  return { box, by: last.key };
}

/**
 * The lands where a shepherds' cairn stands beside the road, on its knoll of
 * dry grass: where the road crosses open country — the stubble on the way to
 * the bus, the river valley, and the summer pastures in the mountains.
 */
export const PATH_CAIRN_GROUNDS: readonly PathGround[] = ['stubble', 'valley', 'alpine'];

/** The cairn's box at its largest and its smallest (its height; it is a little narrower than tall), and its width to height. */
export const PATH_CAIRN = { size: 124, min: 78, aspect: 0.8 } as const;

/**
 * Where the cairn stands in a unit: in the open beside the path, as large as
 * the room there allows — off every stop and the whole of the trail, off
 * anything else the land asks it to `avoid` (its stream), the landmark, the host,
 * every place Hevalo may stand by a stop and the room over each stop where the
 * learner and the flag stand. Nearest the unit's middle of the places that
 * fit; on a page too narrow for even the smallest, it may stand where the flag
 * over a stop would pass in front of it, and failing that nowhere. It
 * depends on the stops' places alone, never on how far the learner has
 * come, so it never moves as they go on. In the path's logical terms, so a right-to-left page mirrors it as it mirrors the
 * stops.
 */
export function cairnBox(stops: readonly WorldStop[], width: number, avoid: readonly PathBox[] = []): PathBox | null {
  if (stops.length < 3) return null;
  const half = width / 2;
  const solid: PathBox[] = [...avoid];
  for (const s of stops) solid.push({ x: s.x, y: s.y - STOP_CLEAR, w: 2 * STOP_CLEAR, h: 2 * STOP_CLEAR + 6 });
  // the whole trail, walked or not, so the cairn stands in the same place however far the learner has come
  const trail = trailStones(stops.map((s, i) => ({ stop: { key: s.key }, x: s.x, y: s.y, trail: i === 0 ? null : 'ahead' })));
  for (const s of trail) solid.push({ x: s.x, y: s.y - s.r - 4, w: 2 * s.r + 8, h: 2 * s.r + 8 });
  solid.push(landmarkBox(width));
  const host = hostBox(stops, width, null);
  if (host) solid.push(host.box);
  for (const s of stops) solid.push(mascotBox(s));
  const flags: PathBox[] = stops.map((s) => ({ x: s.x, y: s.y - PATH_SCENERY.overStop, w: 128, h: PATH_SCENERY.overStop }));
  const top = stops[0]!.y - PATH_GEOMETRY.node / 2;
  const bottom = stops[stops.length - 1]!.y + PATH_GEOMETRY.node / 2;
  const middle = (top + bottom) / 2;
  for (const keep of [flags, []] as const) {
    for (let h = PATH_CAIRN.size; h >= PATH_CAIRN.min; h -= 6) {
      const w = Math.round(h * PATH_CAIRN.aspect);
      let best: PathBox | null = null;
      for (let y = top; y + h <= bottom; y += 6) {
        for (const side of [-1, 1]) {
          for (let reach = w / 2 + 8; reach + w / 2 <= half - PATH_SCENERY.edge; reach += 6) {
            const box = { x: side * reach, y, w, h };
            if ([...solid, ...keep].some((b) => overlaps(box, b))) continue;
            const off = Math.abs(y + h / 2 - middle);
            if (!best || off < Math.abs(best.y + best.h / 2 - middle)) best = box;
            break;
          }
        }
      }
      if (best) return best;
    }
  }
  return null;
}

/** One stepping stone of the trail: where it lies, how big, and the stop the stretch it is on leads to. */
export interface TrailStone {
  x: number;
  y: number;
  /** its half-width; the half-height is a little under two thirds of it, as a flat stone seen from above */
  r: number;
  /** turned a few degrees, so a row of them reads as laid by hand */
  turn: number;
  walked: boolean;
  /** the stop this stretch leads to */
  to: string;
}

/** How far apart the stones lie along the line, and how much room is kept clear round each stop. */
export const PATH_TRAIL = { gap: 23, clear: PATH_GEOMETRY.node / 2 + 14, stone: 10 } as const;

/** The S between two stops' centres, as `lessonPath`'s apps have always drawn it. */
function bezier(a: { x: number; y: number }, b: { x: number; y: number }, t: number): [number, number] {
  const bend = PATH_GEOMETRY.step / 2;
  const p = [a.x, a.y, a.x, a.y + bend, b.x, b.y - bend, b.x, b.y];
  const u = 1 - t;
  const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return [w[0]! * p[0]! + w[1]! * p[2]! + w[2]! * p[4]! + w[3]! * p[6]!, w[0]! * p[1]! + w[1]! * p[3]! + w[2]! * p[5]! + w[3]! * p[7]!];
}

/**
 * The trail as stepping stones: along each stretch between two stops, a stone
 * every `PATH_TRAIL.gap` points, none on a stop. Walked where both ends have
 * been reached (the stop's own `trail`), ahead otherwise. Deterministic: each
 * stone's size and turn come from its place, so the trail is the same each
 * time it is drawn.
 */
export function trailStones(stops: readonly { stop: { key: string }; x: number; y: number; trail: 'walked' | 'ahead' | null }[]): TrailStone[] {
  const out: TrailStone[] = [];
  stops.forEach((p, i) => {
    const before = stops[i - 1];
    if (!before || !p.trail) return;
    // measure the curve, then lay stones at even steps along it
    const samples: [number, number][] = [];
    for (let k = 0; k <= 48; k++) samples.push(bezier(before, p, k / 48));
    const along: number[] = [0];
    for (let k = 1; k < samples.length; k++) {
      const [x0, y0] = samples[k - 1]!;
      const [x1, y1] = samples[k]!;
      along.push(along[k - 1]! + Math.hypot(x1 - x0, y1 - y0));
    }
    const length = along[along.length - 1]!;
    const room = length - 2 * PATH_TRAIL.clear;
    if (room <= 0) return;
    const count = Math.max(1, Math.round(room / PATH_TRAIL.gap) + 1);
    const step = count > 1 ? room / (count - 1) : 0;
    for (let s = 0; s < count; s++) {
      const want = count > 1 ? PATH_TRAIL.clear + s * step : length / 2;
      let k = 1;
      while (k < along.length - 1 && along[k]! < want) k++;
      const share = (want - along[k - 1]!) / Math.max(0.0001, along[k]! - along[k - 1]!);
      const [x0, y0] = samples[k - 1]!;
      const [x1, y1] = samples[k]!;
      const wobble = ((i * 7 + s * 13) % 5) - 2;
      out.push({
        x: Math.round((x0 + (x1 - x0) * share) * 10) / 10,
        y: Math.round((y0 + (y1 - y0) * share) * 10) / 10,
        r: PATH_TRAIL.stone + (((i + s) % 3) - 1) * 0.8,
        turn: wobble * 6,
        walked: p.trail === 'walked',
        to: p.stop.key,
      });
    }
  });
  return out;
}

/**
 * What the drawing of the land keeps clear: every stop, every stone, the
 * landmark, the cairn where there is one, the host, and the places beside
 * the stops where Hevalo may stand — so a tree never grows through the path
 * or behind someone standing by it.
 * Small things (grass, flowers, pebbles) may still lie in Hevalo's places.
 */
export function landClear(stops: readonly WorldStop[], width: number, stones: readonly TrailStone[], cairn: PathBox | null = null): { solid: PathBox[]; tall: PathBox[] } {
  const solid: PathBox[] = [];
  for (const s of stops) solid.push({ x: s.x, y: s.y - STOP_CLEAR, w: 2 * STOP_CLEAR, h: 2 * STOP_CLEAR + 6 });
  for (const s of stones) solid.push({ x: s.x, y: s.y - s.r - 4, w: 2 * s.r + 8, h: 2 * s.r + 8 });
  solid.push(landmarkBox(width));
  if (cairn) solid.push(cairn);
  const tall: PathBox[] = stops.map((s) => mascotBox(s));
  // over any stop the learner may stand on, with the flag over them
  for (const s of stops) tall.push({ x: s.x, y: s.y - PATH_SCENERY.overStop, w: 128, h: PATH_SCENERY.overStop });
  const host = hostBox(stops, width, null);
  if (host) tall.push(host.box);
  return { solid, tall };
}

/**
 * The motion on the path, in ms and points, shared so the phone and the
 * website move alike: the current stop's slow bob; the stops rising one after
 * another the first time their unit comes into view; the learner's hop from
 * the stop they finished to the next one, as the bubble moves on
 * (`PATH_RETURN.bubbleAtMs`); and a chest's wobble before it bursts open, as
 * the skill that earns it pops.
 */
export const PATH_MOTION = {
  bobMs: 2400,
  bob: 4,
  riseMs: 380,
  riseEach: 45,
  rise: 18,
  hopAtMs: PATH_RETURN.bubbleAtMs,
  hopMs: 520,
  hop: 46,
  wobbleAtMs: PATH_RETURN.finishAtMs + PATH_RETURN.popMs,
  wobbleMs: 640,
  wobble: 9,
  /** a landmark's own small loop, once round */
  loopMs: 2800,
  /** how often one of the people says something, and for how long */
  sayEveryMs: 9000,
  sayForMs: 3200,
} as const;

/**
 * Where the learner's hop goes, at `share` (0–1) of its way from `from` to `to`
 * (both the points their feet stand on): straight across, and up and down on a
 * parabola that peaks `PATH_MOTION.hop` above the higher end.
 */
export function hopAt(from: { x: number; y: number }, to: { x: number; y: number }, share: number): { x: number; y: number } {
  const t = Math.max(0, Math.min(1, share));
  const lift = PATH_MOTION.hop + Math.max(0, (from.y - to.y) / 2);
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t - 4 * lift * t * (1 - t) };
}
