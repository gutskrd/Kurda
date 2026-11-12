/**
 * The games' emblems: one picture for each game on Learn's Games page, drawn
 * the way Kurdish Impostor's own pictures are (impostor.ts) — cut-outs in
 * flat colour, lit from the upper left, their thickness showing below them.
 *
 * Each says what is done in its game with things, never with writing: a
 * picture holds no letters and no numerals, so it reads the same in every
 * language the app speaks. The guessed word is rows of tiles going from grey
 * to gold to green; the rhyme is two speech bubbles that end alike; the word
 * chain is three cards whose ends match the next one's beginning.
 *
 * Every emblem has a colour of its own (`gameEmblemTone`), which the two apps
 * tint its card with. Kurdish Impostor wears the hand of cards its own page
 * already shows.
 *
 * An emblem also moves. It is drawn in a few layers (`gameEmblemLayers`), and
 * each layer has a short piece of acting of its own: where it is, how it is
 * turned and how big, at every moment of a loop a few seconds long. The
 * acting is written the way an animator blocks a shot — a wind-up before a
 * move, a landing that goes a little too far and comes back, things that
 * follow one another rather than moving at once, and long rests in between —
 * because a picture that only floats up and down says nothing about its
 * game. The last row of Peyvok is stamped in tile by tile; the thief's word
 * dips, lifts off the page and is put back; the glass looks in one place,
 * finds nothing, and looks in another.
 *
 * The apps play the layers with transforms and opacity only (the website with
 * the browser's animations, the phone on the native driver), so nothing is
 * drawn again while it moves. Where a reader has asked for less motion the
 * still emblem is shown instead.
 */
import { dab, form, ring, rr, type Tones } from './cutout.js';
import { IMPOSTOR_FAN_ANGLES, IMPOSTOR_FAN_FOOT, impostorEmblemSvg, impostorMaskedCard, impostorOpenCard } from './impostor.js';
import { deerSilhouetteSvg } from '../games/who-am-i/silhouette.js';
import { Drawing, checkSize, n, prefixFor, tint } from './svg.js';

/** The games that have an emblem, by the name each goes by on the Games page. */
export const GAME_EMBLEMS = ['peyvok', 'rhyme', 'race', 'memory-thief', 'detective', 'last-letter', 'impostor', 'who-am-i'] as const;
export type GameEmblem = (typeof GAME_EMBLEMS)[number];

export interface GameArtOptions {
  /** how big it is drawn, in pixels (it is square) */
  size?: number;
  /** its text label; the apps say the game's name beside it and hide the picture from screen readers */
  title?: string;
  idPrefix?: string;
}

// ───────────────────────────────────────────────────────────── the colours

const RED = '#d8493b';
const GOLD = '#f2b632';
const GREEN = '#3fa45b';
const SKY = '#74bdea';
const PURPLE = '#8a5bd6';
const PINK = '#e96a9c';
const ORANGE = '#f08a34';
const STEEL = '#9aa5b4';
const NIGHT = '#3b2f63';
/** The deep tone lines are drawn in: never black. */
const INK = '#3a2b4d';
const CREAM: Tones = { light: '#fffaf1', base: '#f6ead6', shade: '#cdb898' };
const WHITE: Tones = { light: '#ffffff', base: '#eef2f7', shade: '#bcc6d4' };
const WOOD: Tones = { light: '#f3cf9c', base: '#dba869', shade: '#a2733c' };

/** A colour as a form's three tones. */
const tones = (hex: string): Tones => ({ light: tint(hex, 0.32), base: hex, shade: tint(hex, -0.32) });

const line = (dr: Drawing, d: string, hex: string, width: number, more = ''): void => {
  dr.add(`<path d="${d}" fill="none" stroke="${hex}" stroke-width="${n(width)}" stroke-linecap="round" stroke-linejoin="round"${more}/>`);
};
const fill = (dr: Drawing, d: string, hex: string): void => {
  dr.add(`<path d="${d}" fill="${hex}"/>`);
};
/** A round bead: a dab as wide as it is tall. */
const bead = (dr: Drawing, cx: number, cy: number, r: number, hex: string, drop = 2.4): void => dab(dr, cx, cy, r, r, hex, drop);
/** What `draw` adds, turned by `angle` degrees about a point. */
function turned(dr: Drawing, angle: number, cx: number, cy: number, draw: () => void): void {
  dr.add(`<g transform="rotate(${n(angle)} ${n(cx)} ${n(cy)})">`);
  draw();
  dr.add('</g>');
}
/** A four-pointed sparkle about a point, its arms `r` long. */
const sparkle = (cx: number, cy: number, r: number): string => {
  const k = r * 0.16;
  return (
    `M${n(cx)} ${n(cy - r)}C${n(cx + k)} ${n(cy - k * 2.6)} ${n(cx + k * 2.6)} ${n(cy - k)} ${n(cx + r)} ${n(cy)}` +
    `C${n(cx + k * 2.6)} ${n(cy + k)} ${n(cx + k)} ${n(cy + k * 2.6)} ${n(cx)} ${n(cy + r)}` +
    `C${n(cx - k)} ${n(cy + k * 2.6)} ${n(cx - k * 2.6)} ${n(cy + k)} ${n(cx - r)} ${n(cy)}` +
    `C${n(cx - k * 2.6)} ${n(cy - k)} ${n(cx - k)} ${n(cy - k * 2.6)} ${n(cx)} ${n(cy - r)}Z`
  );
};
/** A five-pointed star about a point. */
const star = (cx: number, cy: number, r: number): string => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.45;
    pts.push(`${n(cx + rad * Math.cos(a))} ${n(cy + rad * Math.sin(a))}`);
  }
  return `M${pts.join('L')}Z`;
};

type Draw = (dr: Drawing) => void;

// ───────────────────────────────────────────────────────────── the acting

/**
 * Where a layer is at one moment: moved by (x, y) in the picture's own units
 * (it is 120 across), turned by `r` degrees and scaled by (sx, sy) about its
 * pivot, at opacity `o`. At rest a layer is where it was drawn.
 */
export interface GamePose {
  x: number;
  y: number;
  r: number;
  sx: number;
  sy: number;
  o: number;
}

const REST: GamePose = { x: 0, y: 0, r: 0, sx: 1, sy: 1, o: 1 };

/**
 * How a move is made between one key and the next:
 *   hold   — nothing until the key's moment, then there at once
 *   in     — starts slowly (something dropping, or leaving)
 *   out    — arrives gently
 *   inOut  — a move that is neither thrown nor caught
 *   back   — arrives a little too far and comes back: a landing, a pop
 */
type Ease = 'hold' | 'linear' | 'in' | 'out' | 'inOut' | 'back';

/** A key: the moment of the loop (0 to 1), what changes by then (the rest stays as it was; `s` is both scales), and how it gets there. */
type Key = readonly [t: number, to: Partial<GamePose> & { s?: number }, ease?: Ease];

const EASES: Record<Ease, (u: number) => number> = {
  hold: (u) => (u >= 1 ? 1 : 0),
  linear: (u) => u,
  in: (u) => u * u * u,
  out: (u) => 1 - (1 - u) ** 3,
  inOut: (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2),
  back: (u) => 1 + 2.70158 * (u - 1) ** 3 + 1.70158 * (u - 1) ** 2,
};

/** The moments a loop is sampled at: enough that a quick pop keeps its shape between two of them. */
export const GAME_EMBLEM_SAMPLES = 90;

/** A layer's keys as its pose at every sample, the last one being the first again. */
function sample(keys: readonly Key[]): GamePose[] {
  const stops: Array<{ t: number; pose: GamePose; ease: Ease }> = [];
  let pose = REST;
  for (const [t, to, ease] of keys) {
    const { s, ...rest } = to;
    pose = { ...pose, ...(s === undefined ? {} : { sx: s, sy: s }), ...rest };
    stops.push({ t, pose, ease: ease ?? 'inOut' });
  }
  if (stops.length === 0) stops.push({ t: 0, pose: REST, ease: 'hold' });
  const out: GamePose[] = [];
  for (let i = 0; i <= GAME_EMBLEM_SAMPLES; i++) {
    const t = i / GAME_EMBLEM_SAMPLES;
    let next = stops.findIndex((stop) => stop.t > t);
    if (next === -1) next = stops.length;
    const from = stops[Math.max(0, next - 1)]!;
    const to = stops[Math.min(stops.length - 1, next)]!;
    if (next === 0 || next === stops.length || to.t === from.t) {
      out.push(next === 0 ? stops[0]!.pose : from.pose);
      continue;
    }
    const u = EASES[to.ease]((t - from.t) / (to.t - from.t));
    const mix = (a: number, b: number): number => Math.round((a + (b - a) * u) * 1000) / 1000;
    // a landing may go too far in place and in size; nothing is ever more than fully there
    out.push({ x: mix(from.pose.x, to.pose.x), y: mix(from.pose.y, to.pose.y), r: mix(from.pose.r, to.pose.r), sx: mix(from.pose.sx, to.pose.sx), sy: mix(from.pose.sy, to.pose.sy), o: Math.min(1, Math.max(0, mix(from.pose.o, to.pose.o))) });
  }
  return out;
}

interface LayerDef {
  draw: Draw;
  /** the point it turns and grows about */
  pivot?: readonly [number, number];
  /** its acting; none, and it stays where it is drawn */
  keys?: readonly Key[];
}

interface EmblemDef {
  title: string;
  /** how long one loop takes */
  loopMs: number;
  layers: readonly LayerDef[];
  /** the still picture, when it is not simply every layer where it is drawn */
  still?: Draw;
}

/** Something that pops into being at `at`, growing from nothing about its pivot and swinging in from `turn` degrees. */
const appears = (at: number, turn = 0): Key[] => [
  [0, { s: 0, o: 0, r: turn }],
  [at, {}, 'hold'],
  [at + 0.09, { s: 1, o: 1, r: 0 }, 'back'],
];

// ───────────────────────────────────────────────────────────── the emblems

const TILE = (c: number, r: number): string => rr(9 + c * 26.5, 15 + r * 31, 22, 24, 6);

/**
 * Peyvok: two guesses already made, and the third being stamped in tile by
 * tile, every one of them green — then the row takes a small bow, one tile
 * after another.
 */
const peyvok: EmblemDef = {
  title: 'Peyvok',
  loopMs: 5200,
  layers: [
    {
      draw: (dr) => {
        const rows = [
          [STEEL, GOLD, STEEL, STEEL],
          [GREEN, STEEL, GOLD, GREEN],
        ];
        rows.forEach((row, r) => row.forEach((hex, c) => form(dr, TILE(c, r), tones(hex), 3.4, 2)));
        // the places the third guess goes into, waiting
        for (let c = 0; c < 4; c++) line(dr, TILE(c, 2), tint(STEEL, -0.1), 2, ' stroke-dasharray="4 4"');
      },
    },
    ...[0, 1, 2, 3].map((c): LayerDef => {
      const lands = 0.1 + c * 0.075;
      const bows = 0.6 + c * 0.045;
      return {
        draw: (dr) => form(dr, TILE(c, 2), tones(GREEN), 3.4, 2),
        pivot: [20 + c * 26.5, 89],
        keys: [
          [0, { s: 0.2, o: 0 }],
          [lands, {}, 'hold'],
          [lands + 0.06, { s: 1.14, o: 1, y: -3 }, 'out'],
          [lands + 0.12, { s: 1, y: 0 }, 'inOut'],
          [bows, {}, 'hold'],
          [bows + 0.05, { y: -8, sx: 0.95, sy: 1.07 }, 'out'],
          [bows + 0.11, { y: 0, sx: 1.08, sy: 0.92 }, 'in'],
          [bows + 0.15, { s: 1 }, 'out'],
          [0.93, {}, 'hold'],
          [0.985, { s: 0.2, o: 0 }, 'in'],
          [1, {}, 'hold'],
        ],
      };
    }),
  ],
  still: (dr) => {
    const rows = [
      [STEEL, GOLD, STEEL, STEEL],
      [GREEN, STEEL, GOLD, GREEN],
      [GREEN, GREEN, GREEN, GREEN],
    ];
    rows.forEach((row, r) => row.forEach((hex, c) => form(dr, TILE(c, r), tones(hex), 3.4, 2)));
  },
};

/** Rhyming Words: one thing is said, another answers it, and for a moment their endings light up together. */
const rhyme: EmblemDef = {
  title: 'Rhyming Words',
  loopMs: 5000,
  layers: [
    {
      draw: (dr) => {
        form(dr, `${rr(8, 14, 78, 38, 15)}M24 46L42 50L20 64Z`, CREAM, 4.5, 2.4);
        line(dr, 'M24 33H42', STEEL, 7);
        line(dr, 'M54 33H72', PINK, 7);
      },
      pivot: [20, 64],
      // the first thing said is always there: it only leans in as it speaks, so the picture is never empty
      keys: [[0, {}], [0.04, {}, 'hold'], [0.09, { r: -4, s: 1.05 }, 'out'], [0.17, { r: 0, s: 1 }, 'inOut'], [0.5, {}, 'hold'], [0.53, { y: -2.5 }, 'out'], [0.58, { y: 0 }, 'in'], [1, {}, 'hold']],
    },
    {
      draw: (dr) => {
        form(dr, `${rr(34, 62, 78, 38, 15)}M96 94L100 112L78 98Z`, tones(tint(PINK, 0.55)), 4.5, 2.4);
        line(dr, 'M48 81H68', tint(PINK, -0.3), 7);
        line(dr, 'M80 81H98', PINK, 7);
      },
      pivot: [100, 112],
      keys: [...appears(0.28, 10), [0.52, {}, 'hold'], [0.55, { y: -2.5 }, 'out'], [0.6, { y: 0 }, 'in'], [0.93, {}, 'hold'], [0.98, { s: 0.9, o: 0 }, 'in'], [1, { s: 0, o: 0, r: 10 }, 'hold']],
    },
    // the two endings, lit: the same light on both, twice, as a rhyme is heard
    ...[
      ['M54 33H72', 0],
      ['M80 81H98', 0.025],
    ].map(
      ([d, late]): LayerDef => ({
        draw: (dr) => line(dr, d as string, tint(PINK, 0.5), 11),
        keys: [
          [0, { o: 0 }],
          [0.5 + (late as number), {}, 'hold'],
          [0.54 + (late as number), { o: 1 }, 'out'],
          [0.61 + (late as number), { o: 0 }, 'inOut'],
          [0.66 + (late as number), { o: 0.9 }, 'out'],
          [0.76 + (late as number), { o: 0 }, 'inOut'],
          [1, {}, 'hold'],
        ],
      }),
    ),
  ],
};

/**
 * Typing Race: the second hand goes round in twelve ticks, each one a small
 * snap, while the key is tapped in a typist's uneven rhythm — two quick, a
 * breath, another.
 */
const race: EmblemDef = {
  title: 'Typing Race',
  loopMs: 6000,
  layers: [
    {
      draw: (dr) => {
        form(dr, rr(48, 8, 16, 14, 4), tones(STEEL), 2.4, 1.6);
        turned(dr, 42, 56, 62, () => form(dr, rr(51, 14, 10, 10, 3), tones(STEEL), 2, 1.4));
        form(dr, ring(56, 62, 42), tones(ORANGE), 5, 3);
        form(dr, ring(56, 62, 31), CREAM, 0, 2.4);
        for (const [x, y] of [[56, 38], [80, 62], [56, 86], [32, 62]] as const) fill(dr, ring(x, y, 2.6), tint(INK, 0.45));
      },
    },
    {
      draw: (dr) => line(dr, 'M56 62L70 45', INK, 5),
      pivot: [56, 62],
      keys: Array.from({ length: 12 }, (_, k): Key[] => [
        [(k + 0.7) / 12, { r: 30 * k }, 'hold'],
        [(k + 1) / 12, { r: 30 * (k + 1) }, 'back'],
      ]).flat(),
    },
    { draw: (dr) => fill(dr, ring(56, 62, 5), INK) },
    {
      draw: (dr) => {
        form(dr, rr(78, 78, 34, 32, 8), WHITE, 4.5, 2.4);
        line(dr, 'M88 94H102', STEEL, 5);
      },
      pivot: [95, 110],
      keys: [0.06, 0.15, 0.21, 0.34, 0.43, 0.56, 0.62, 0.75, 0.87, 0.94].flatMap((at): Key[] => [
        [at - 0.012, {}, 'hold'],
        [at + 0.018, { y: 3.4, sy: 0.92 }, 'out'],
        [at + 0.04, { y: 0, sy: 1 }, 'back'],
      ]),
    },
  ],
};

/**
 * The Memory Thief: the word sits in its line, dips as a thing does before
 * it is picked up, and is lifted clean off the page; it hangs there turning
 * a little while the page shows the gap it left, and then it is put back.
 */
const memoryThief: EmblemDef = {
  title: 'The Memory Thief',
  loopMs: 5600,
  layers: [
    {
      draw: (dr) => {
        form(dr, rr(16, 14, 78, 96, 9), CREAM, 5, 2.6);
        const ink = tint(INK, 0.5);
        line(dr, 'M30 36H58', ink, 6);
        line(dr, 'M68 36H80', ink, 6);
        line(dr, 'M30 56H42', ink, 6);
        line(dr, rr(51, 48, 30, 16, 6), tint(GOLD, -0.12), 2.6, ' stroke-dasharray="5 4.5"');
        line(dr, 'M30 76H72', ink, 6);
        line(dr, 'M30 94H54', ink, 6);
      },
    },
    {
      draw: (dr) =>
        turned(dr, -16, 88, 26, () => {
          form(dr, rr(68, 14, 40, 22, 8), tones(GOLD), 4, 2.2);
          line(dr, 'M79 25H97', tint(GOLD, -0.42), 6);
        }),
      pivot: [88, 25],
      keys: [
        [0, { x: -22, y: 31, r: 16, s: 0.76 }],
        [0.14, {}, 'hold'],
        [0.2, { y: 32.6, r: 13, sx: 0.82, sy: 0.7 }, 'inOut'],
        [0.4, { x: 0, y: 0, r: 0, s: 1 }, 'back'],
        [0.5, { y: -2.6, r: -3 }, 'inOut'],
        [0.62, { y: 1.6, r: 2 }, 'inOut'],
        [0.74, { y: -1.4, r: -1 }, 'inOut'],
        [0.8, { y: 0, r: 0 }, 'inOut'],
        [0.93, { x: -22, y: 31, r: 16, s: 0.76 }, 'inOut'],
        [0.96, { sx: 0.83, sy: 0.69 }, 'out'],
        [1, { s: 0.76 }, 'out'],
      ],
    },
    ...[
      [100, 52, 9, 0.38],
      [60, 18, 6, 0.44],
    ].map(
      ([x, y, size, at]): LayerDef => ({
        draw: (dr) => fill(dr, sparkle(x!, y!, size!), tint(GOLD, 0.25)),
        pivot: [x!, y!],
        keys: [
          [0, { s: 0, o: 0 }],
          [at!, {}, 'hold'],
          [at! + 0.08, { s: 1.25, o: 1, r: 40 }, 'out'],
          [at! + 0.16, { s: 0.9, r: 62 }, 'inOut'],
          [at! + 0.28, { s: 1.05, r: 90 }, 'inOut'],
          [at! + 0.4, { s: 0, o: 0, r: 140 }, 'in'],
          [1, { r: 0 }, 'hold'],
        ],
      }),
    ),
  ],
};

/**
 * Kurdish Detective: the glass comes in from the corner, looks at one card,
 * finds nothing and moves on; over the second it stops, and what it was
 * looking for turns up in it.
 */
const detective: EmblemDef = {
  title: 'Kurdish Detective',
  loopMs: 6200,
  layers: [
    {
      draw: (dr) => {
        const ink = tint(INK, 0.5);
        turned(dr, -11, 40, 60, () => {
          form(dr, rr(14, 20, 48, 64, 8), CREAM, 4.5, 2.4);
          line(dr, 'M24 36H50', ink, 5);
          line(dr, 'M24 50H44', ink, 5);
        });
        turned(dr, 7, 70, 54, () => {
          form(dr, rr(46, 14, 48, 64, 8), WHITE, 4.5, 2.4);
          line(dr, 'M56 30H84', ink, 5);
        });
      },
    },
    {
      draw: (dr) => {
        line(dr, 'M88 92L106 110', WOOD.shade, 13);
        line(dr, 'M88 91L105 108', WOOD.base, 8);
        form(dr, ring(68, 72, 30), tones(NIGHT), 4.5, 2.6);
        form(dr, ring(68, 72, 22), tones(SKY), 0, 2.6);
      },
      pivot: [68, 72],
      keys: [
        [0, { x: -34, y: 22, r: -8 }],
        [0.06, {}, 'hold'],
        [0.24, { x: -14, y: -20, r: 4 }, 'inOut'],
        [0.3, { x: -12, y: -22 }, 'inOut'],
        [0.36, {}, 'hold'],
        [0.52, { x: 0, y: 0, r: 0 }, 'inOut'],
        [0.56, { s: 1.06 }, 'out'],
        [0.62, { s: 1 }, 'inOut'],
        [0.88, {}, 'hold'],
        [1, { x: -34, y: 22, r: -8 }, 'inOut'],
      ],
    },
    {
      draw: (dr) => form(dr, star(68, 73, 12), tones(GOLD), 2, 1.6),
      pivot: [68, 73],
      keys: [[0, { s: 0, o: 0, r: -30 }], [0.56, {}, 'hold'], [0.64, { s: 1.3, o: 1, r: 8 }, 'out'], [0.7, { s: 1, r: 0 }, 'inOut'], [0.86, {}, 'hold'], [0.91, { s: 0, o: 0 }, 'in'], [1, { r: -30 }, 'hold']],
    },
  ],
};

/** A word of The Last Letter: a card with its letters as blocks, the ones that matter in colour. */
function chainWord(dr: Drawing, x: number, y: number, letters: readonly string[]): void {
  form(dr, rr(x, y, letters.length * 18 + 10, 28, 9), CREAM, 4, 2.4);
  letters.forEach((hex, i) => form(dr, rr(x + 7 + i * 18, y + 7, 14, 14, 4.5), tones(hex), 1.8, 1.4));
}
const QUIET = tint(STEEL, 0.1);
/** A card of the chain leaving at the end of the loop, as all three do together. */
const chainLeaves = (from: number): Key[] => [
  [0.92, {}, 'hold'],
  [0.98, { o: 0, y: 3 }, 'in'],
  [1, { x: from, y: 0 }, 'hold'],
];

/**
 * The Last Letter: a word on the table, and two more played onto it one
 * after another, each sliding in from its own side and knocking the one
 * before it a little as it lands; then the chain is run through once, top to
 * bottom.
 */
const lastLetter: EmblemDef = {
  title: 'The Last Letter',
  loopMs: 5200,
  layers: [
    {
      draw: (dr) => chainWord(dr, 6, 12, [QUIET, QUIET, GREEN]),
      pivot: [38, 26],
      // the first word is on the table from the start: it is tapped down, and the others are played onto it
      keys: [[0, {}], [0.04, {}, 'hold'], [0.08, { y: 2, sy: 0.94 }, 'out'], [0.14, { y: 0, sy: 1 }, 'back'], [0.3, {}, 'hold'], [0.33, { x: 1.6, r: 1.3 }, 'out'], [0.38, { x: 0, r: 0 }, 'inOut'], [0.7, {}, 'hold'], [0.74, { y: -3 }, 'out'], [0.79, { y: 0 }, 'in'], [1, {}, 'hold']],
    },
    {
      draw: (dr) => chainWord(dr, 18, 46, [GREEN, QUIET, QUIET, ORANGE]),
      pivot: [59, 60],
      keys: [[0, { x: 18, o: 0 }], [0.22, {}, 'hold'], [0.31, { x: 0, o: 1 }, 'back'], [0.5, {}, 'hold'], [0.53, { x: -1.6, r: -1.3 }, 'out'], [0.58, { x: 0, r: 0 }, 'inOut'], [0.745, {}, 'hold'], [0.785, { y: -3 }, 'out'], [0.835, { y: 0 }, 'in'], ...chainLeaves(18)],
    },
    {
      draw: (dr) => chainWord(dr, 50, 80, [ORANGE, QUIET, QUIET]),
      pivot: [82, 94],
      keys: [[0, { x: -18, o: 0 }], [0.42, {}, 'hold'], [0.51, { x: 0, o: 1 }, 'back'], [0.79, {}, 'hold'], [0.83, { y: -3 }, 'out'], [0.88, { y: 0 }, 'in'], ...chainLeaves(-18)],
    },
  ],
};

/** An answer of Who Am I? being given: its bead swells and settles. */
const answers = (...at: number[]): Key[] => [[0, {}], ...at.flatMap((t): Key[] => [[t, {}, 'hold'], [t + 0.04, { s: 1.4 }, 'out'], [t + 0.11, { s: 1 }, 'inOut']]), [1, {}, 'hold']];

/** The green the hidden deer is cut from: the game's own, a step deeper than the board's so the card stands off it. */
const DEER = '#45a26a';

/**
 * Hevalo's head and shoulders as the flat silhouette the game's stage wears
 * (games/who-am-i/silhouette.ts), fitted to the emblem's square: the same
 * drawing in both places, so the picture on the game's card is the one the
 * player meets when the game opens.
 */
function hiddenDeer(dr: Drawing): void {
  const svg = deerSilhouetteSvg(DEER, 120, '');
  const box = (/viewBox="([^"]+)"/.exec(svg)?.[1] ?? '0 0 120 120').split(/\s+/).map(Number) as [number, number, number, number];
  const inner = svg
    .replace(/^<svg[^>]*>/, '')
    .replace(/<title[^>]*>[\s\S]*?<\/title>/, '')
    .replace(/<\/svg>\s*$/, '');
  // the drawing runs on below the shoulders: it is cut at the picture's own edge
  const frame = dr.clip('M0 0H120V120H0Z');
  dr.add(`<g clip-path="url(#${frame})"><g fill="${DEER}" transform="scale(${n(120 / box[2])}) translate(${n(-box[0])} ${n(-box[1])})">${inner}</g></g>`);
}

/**
 * Who Am I?: the hidden deer. Hevalo is a shadow with a card on the forehead
 * that everyone can read but the one who wears it; the card tips as if its
 * wearer were trying to look up at it, and the table answers, yes on one
 * side and no on the other.
 */
const whoAmI: EmblemDef = {
  title: 'Who Am I?',
  loopMs: 5200,
  layers: [
    // the wearer keeps still: it is the card that moves
    { draw: hiddenDeer },
    {
      draw: (dr) =>
        turned(dr, -5, 60, 48, () => {
          form(dr, rr(37, 31, 46, 34, 8), CREAM, 4, 2.4);
          form(dr, star(60, 48, 10.5), tones(GOLD), 1.8, 1.4);
        }),
      pivot: [60, 64],
      keys: [[0, {}], [0.1, { r: -6 }, 'inOut'], [0.22, { r: 5 }, 'inOut'], [0.32, { r: -2 }, 'inOut'], [0.4, { r: 0 }, 'inOut'], [0.72, {}, 'hold'], [0.76, { y: -5, r: 3 }, 'out'], [0.83, { y: 0, r: 0 }, 'in'], [0.87, { sx: 1.04, sy: 0.95 }, 'out'], [0.91, { s: 1 }, 'out'], [1, {}, 'hold']],
    },
    { draw: (dr) => bead(dr, 15, 100, 10, GREEN, 3), pivot: [15, 100], keys: answers(0.26, 0.66) },
    { draw: (dr) => bead(dr, 105, 100, 10, RED, 3), pivot: [105, 100], keys: answers(0.46) },
  ],
};

/**
 * Kurdish Impostor: the hand opens card by card from the foot of the fan,
 * and the masked card in the middle comes up out of it and looks from one
 * side to the other before the hand closes again.
 */
const impostor: EmblemDef = {
  title: 'Kurdish Impostor',
  loopMs: 5400,
  layers: [
    ...IMPOSTOR_FAN_ANGLES.map((angle, i): LayerDef => {
      // the outer cards open first, the inner ones after them
      const opens = 0.05 + (i === 0 || i === 3 ? 0 : 0.05);
      return {
        draw: impostorOpenCard,
        pivot: IMPOSTOR_FAN_FOOT,
        keys: [[0, { r: 0 }], [opens, {}, 'hold'], [opens + 0.17, { r: angle }, 'back'], [0.86, {}, 'hold'], [0.96, { r: 0 }, 'inOut'], [1, {}, 'hold']],
      };
    }),
    {
      draw: impostorMaskedCard,
      pivot: IMPOSTOR_FAN_FOOT,
      keys: [[0, {}], [0.3, {}, 'hold'], [0.4, { y: -7 }, 'out'], [0.48, { r: -4 }, 'inOut'], [0.58, { r: 4 }, 'inOut'], [0.66, { r: 0 }, 'inOut'], [0.76, { y: 0 }, 'inOut'], [1, {}, 'hold']],
    },
  ],
};

const EMBLEMS: Readonly<Record<GameEmblem, EmblemDef>> = {
  peyvok,
  rhyme,
  race,
  'memory-thief': memoryThief,
  detective,
  'last-letter': lastLetter,
  impostor,
  'who-am-i': whoAmI,
};

const TONES: Readonly<Record<GameEmblem, string>> = {
  peyvok: GREEN,
  rhyme: PINK,
  race: ORANGE,
  'memory-thief': GOLD,
  detective: SKY,
  'last-letter': ORANGE,
  impostor: PURPLE,
  'who-am-i': GREEN,
};

export function isGameEmblem(v: unknown): v is GameEmblem {
  return (GAME_EMBLEMS as readonly unknown[]).includes(v);
}

function emblemOf(game: GameEmblem): EmblemDef {
  if (!isGameEmblem(game)) throw new RangeError(`art: no game called ${String(game)}`);
  return EMBLEMS[game];
}

/** The colour a game's card is tinted with. */
export function gameEmblemTone(game: GameEmblem): string {
  emblemOf(game);
  return TONES[game];
}

/** A game's emblem, still: every layer where it is drawn. */
export function gameEmblemSvg(opts: GameArtOptions & { game: GameEmblem }): string {
  const emblem = emblemOf(opts.game);
  const size = checkSize(opts.size, 120);
  if (opts.game === 'impostor') return impostorEmblemSvg({ emblem: 'cards', size, title: opts.title, idPrefix: opts.idPrefix });
  const dr = new Drawing(prefixFor(opts.idPrefix, 'game-emblem', opts.game));
  if (emblem.still) emblem.still(dr);
  else for (const layer of emblem.layers) layer.draw(dr);
  return dr.svg(size, opts.title ?? emblem.title);
}

/** One layer of a moving emblem: its own picture, the point it turns about, and where it is at every sample of the loop. */
export interface GameEmblemLayer {
  svg: string;
  /** in the picture's units, 0 to 120 from its upper left */
  pivot: readonly [number, number];
  /** GAME_EMBLEM_SAMPLES + 1 poses, evenly spaced over the loop; null for a layer that never moves */
  poses: GamePose[] | null;
}

/** How long a game's emblem takes to play once. */
export function gameEmblemLoopMs(game: GameEmblem): number {
  return emblemOf(game).loopMs;
}

/**
 * A game's emblem in its moving layers, back to front. Each is a whole
 * picture of the emblem's size holding one part of it, so the apps lay them
 * over one another and move each by its poses.
 */
export function gameEmblemLayers(opts: GameArtOptions & { game: GameEmblem }): GameEmblemLayer[] {
  const emblem = emblemOf(opts.game);
  const size = checkSize(opts.size, 120);
  const prefix = prefixFor(opts.idPrefix, 'game-emblem-layers', opts.game);
  return emblem.layers.map((layer, i) => {
    const dr = new Drawing(`${prefix}l${i}`);
    layer.draw(dr);
    return { svg: dr.svg(size, opts.title ?? emblem.title), pivot: layer.pivot ?? [60, 60], poses: layer.keys ? sample(layer.keys) : null };
  });
}
