/**
 * The games' covers: one illustration for each game on Learn's Games page,
 * drawn the way an illustrator would for a magazine — flat colour on a
 * ground of its own, a brush line only where a line says something, and one
 * small joke in each: the bird who will not sing along, the key that runs,
 * the fox with a word in his sack, the hound's one enormous eye.
 *
 * A cover fills its whole square; the apps round its corners. Each is drawn
 * in parts, back to front, and each part has its acting (game-acting.ts), so
 * a cover moves without anything being drawn again. A part where it was
 * drawn is the still picture: every part's acting starts from there and
 * comes back to it, so a cover that has played once is the picture it was.
 *
 * What is written in a cover is Kurdish and written by hand (ink.ts): the
 * letters the alphabet adds to the Latin one, and words a learner meets in
 * the first lessons. Nothing is in the reader's own language, so a cover is
 * the same picture for everybody.
 */
import { deerSilhouetteSvg } from '../games/who-am-i/silhouette.js';
import type { Cover, Key, Part } from './game-acting.js';
import { INK, PAPER, brush, letter, loop, roundish, smooth, type P } from './ink.js';
import { Drawing, n, tint } from './svg.js';

type Draw = (dr: Drawing) => void;

// ───────────────────────────────────────────────────────────── the pen

const fill = (dr: Drawing, d: string, hex: string, more = ''): void => {
  dr.add(`<path d="${d}" fill="${hex}"${more}/>`);
};
/** A shape through points placed by eye. */
const shape = (dr: Drawing, pts: readonly P[], hex: string): void => fill(dr, smooth(pts), hex);
/** One stroke of the brush. */
const stroke = (dr: Drawing, pts: readonly P[], width: number, hex = INK, taper?: readonly [number, number]): void => fill(dr, brush(pts, width, taper), hex);
/** A ring drawn in one go. */
const ringed = (dr: Drawing, pts: readonly P[], width: number, hex = INK, vary = 0.3, phase = 0): void => fill(dr, loop(pts, width, vary, phase), hex, ' fill-rule="evenodd"');
/** A letter written with the brush. */
const write = (dr: Drawing, ch: string, x: number, y: number, height: number, weight: number, hex = INK, turn = 0): void => fill(dr, letter(ch, x, y, height, weight, turn), hex);
/** The whole square in one colour: every cover's first part. */
const ground = (dr: Drawing, hex: string): void => fill(dr, 'M0 0H120V120H0Z', hex);

/** What `draw` adds, moved to (x, y), turned by `angle` degrees and scaled by `k` about its own origin. */
function placed(dr: Drawing, x: number, y: number, angle: number, k: number, draw: () => void): void {
  dr.add(`<g transform="translate(${n(x)} ${n(y)}) rotate(${n(angle)}) scale(${n(k)})">`);
  draw();
  dr.add('</g>');
}
/** What `draw` adds, turned by `angle` degrees about a point. */
function turned(dr: Drawing, angle: number, cx: number, cy: number, draw: () => void): void {
  dr.add(`<g transform="rotate(${n(angle)} ${n(cx)} ${n(cy)})">`);
  draw();
  dr.add('</g>');
}
/** What `draw` adds, kept inside a shape. */
function inside(dr: Drawing, d: string, draw: () => void): void {
  dr.add(`<g clip-path="url(#${dr.clip(d)})">`);
  draw();
  dr.add('</g>');
}

/** The white of an eye: paper, ringed in ink in one go. */
function white(dr: Drawing, cx: number, cy: number, r: number, phase = 0): void {
  shape(dr, roundish(cx, cy, r, r, phase), PAPER);
  ringed(dr, roundish(cx, cy, r, r, phase), r * 0.3, INK, 0.35, phase);
}
/** The pupil of an eye of radius `r`, looking `look` away from its middle (in shares of that radius). */
function pupil(dr: Drawing, cx: number, cy: number, r: number, look: readonly [number, number] = [0, 0]): void {
  shape(dr, roundish(cx + look[0] * r, cy + look[1] * r, r * 0.36, r * 0.4, 1), INK);
}
/** An eye that only ever looks one way. */
function eye(dr: Drawing, cx: number, cy: number, r: number, look: readonly [number, number] = [0, 0], phase = 0): void {
  white(dr, cx, cy, r, phase);
  pupil(dr, cx, cy, r, look);
}

/** A point of a drawing made about (cx, cy) and turned by `angle` degrees, as it lands on the page. */
function turnedPoint(x: number, y: number, angle: number, cx: number, cy: number): readonly [number, number] {
  const [cos, sin] = [Math.cos((angle * Math.PI) / 180), Math.sin((angle * Math.PI) / 180)];
  return [cx + (x - cx) * cos - (y - cy) * sin, cy + (x - cx) * sin + (y - cy) * cos];
}

/** A square nearly square, as scissors cut it: its corners a little off true, by a nudge of its own. */
function cut(x: number, y: number, w: number, h: number, nudge = 0): P[] {
  const o = [0.5, -0.3, 0.2, 0.4, -0.4, 0.3, -0.2, -0.5].map((v, i) => v * (1 + ((i + nudge) % 3) * 0.4));
  return [
    [x + o[0]!, y + o[1]!, 1],
    [x + w + o[2]!, y + o[3]!, 1],
    [x + w + o[4]!, y + h + o[5]!, 1],
    [x + o[6]!, y + h + o[7]!, 1],
  ];
}
/**
 * A card with its corners rounded by hand, as a path: its edges straight but
 * not quite parallel (`lean`), no two corners quite alike.
 */
function card(x: number, y: number, w: number, h: number, r: number, lean = 0.4): string {
  const a = lean;
  return (
    `M${n(x + r)} ${n(y + a)}L${n(x + w - r)} ${n(y - a)}Q${n(x + w + a)} ${n(y - a)} ${n(x + w + a)} ${n(y + r)}` +
    `L${n(x + w - a)} ${n(y + h - r)}Q${n(x + w - a)} ${n(y + h + a)} ${n(x + w - r * 1.1)} ${n(y + h + a)}` +
    `L${n(x + r)} ${n(y + h - a)}Q${n(x - a)} ${n(y + h - a)} ${n(x - a)} ${n(y + h - r * 0.9)}` +
    `L${n(x + a)} ${n(y + r)}Q${n(x + a)} ${n(y + a)} ${n(x + r)} ${n(y + a)}Z`
  );
}

// ───────────────────────────────────────────────────────────── Peyvok

const SAGE = '#cbd8bc';
const PHONE = '#8ea2ee';
const SKIN = '#b8702b';
const TILE_GREY = '#8f8d88';
const TILE_GOLD = '#f0c21f';
const TILE_GREEN = '#5aa832';

/** Peyvok's three guesses: the camel, the walker and the word itself, coloured as the game would. */
const GUESSES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['DEVE', [TILE_GREY, TILE_GREEN, TILE_GOLD, TILE_GREY]],
  ['PEYA', [TILE_GREEN, TILE_GREEN, TILE_GREEN, TILE_GREY]],
  ['PEYV', [TILE_GREEN, TILE_GREEN, TILE_GREEN, TILE_GREEN]],
];
/** How far the phone leans in the hands that hold it, and the point it leans about. */
const PHONE_LEAN = -11;
const PHONE_AT = [60, 64] as const;
const tileAt = (c: number, r: number): readonly [number, number] => [34.5 + c * 12.9, 29 + r * 13.2];
/** What `draw` adds, leaning as the phone does. */
const onPhone = (dr: Drawing, draw: () => void): void => turned(dr, PHONE_LEAN, PHONE_AT[0], PHONE_AT[1], draw);

/** One tile of a guess, its letter written on it. */
function peyvokTile(dr: Drawing, c: number, r: number): void {
  const [x, y] = tileAt(c, r);
  const [word, colours] = GUESSES[r]!;
  shape(dr, cut(x, y, 11, 11, c + r * 2), colours[c]!);
  write(dr, word[c]!, x + 2.9, y + 1.9, 7.2, 1.7, INK, (c - 1.5) * 2);
}

/** The letters the Kurdish alphabet adds, adrift round the phone: each with where it is, how tall and how it is turned. */
const ADRIFT: ReadonlyArray<readonly [string, number, number, number, number]> = [
  ['Ê', 5, 9, 17, -14],
  ['Ş', 97, 5, 19, 13],
  ['Î', 3, 50, 15, 9],
  ['Ç', 101, 44, 16, -8],
];
const adrift = (dr: Drawing, i: number): void => {
  const [ch, x, y, h, turn] = ADRIFT[i]!;
  write(dr, ch, x, y, h, h * 0.2, '#f6d51f', turn);
};
/** A letter adrift lifting on a swell that passes at `at`, and settling again. */
const swell = (at: number, turn: number): Key[] => [[0, {}], [at, {}, 'hold'], [at + 0.1, { y: -3, r: turn }, 'out'], [at + 0.24, { y: 0.8, r: -turn * 0.3 }, 'inOut'], [at + 0.32, { y: 0, r: 0 }, 'inOut'], [1, {}, 'hold']];

function peyvokPhone(dr: Drawing): void {
  // the fingers of the hand behind it, showing past its edge
  for (const y of [56, 69, 82]) shape(dr, roundish(93.5, y, 6.4, 5.4, y), SKIN);
  onPhone(dr, () => {
    // its side, then its face: the side is what gives a flat phone its thickness
    fill(dr, card(25, 9, 60, 124, 9), tint(PHONE, -0.24));
    fill(dr, card(30, 8, 60, 124, 9), PHONE);
    fill(dr, card(33.5, 12, 53, 118, 6), PAPER);
    stroke(dr, [[53, 17.6], [68, 17]], 1.6, INK, [0.8, 0.8]);
    shape(dr, roundish(47, 17.5, 1.3), INK);
    // the two buttons on its side
    stroke(dr, [[27.4, 44], [27.2, 55]], 1.5, tint(PHONE, -0.5), [0.8, 0.8]);
    stroke(dr, [[27.3, 61], [27.1, 77]], 1.5, tint(PHONE, -0.5), [0.8, 0.8]);
    // the rows still to guess, and the two guesses already made
    for (let r = 2; r < 7; r++) for (let c = 0; c < 4; c++) shape(dr, cut(...tileAt(c, r), 11, 11, c + r), '#efe3cb');
    for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) peyvokTile(dr, c, r);
  });
  const line = tint(SKIN, -0.42);
  // the left hand: the ball of the thumb in the corner, and the thumb lying across the foot of the screen
  shape(dr, [[-6, 100], [4, 90], [18, 84], [32, 82], [43, 84], [48, 89.5], [45, 95], [36, 96.5], [26, 96], [18, 100], [13, 110], [12, 126], [-6, 126]], SKIN);
  shape(dr, [[38, 85], [44.5, 86.5], [46.5, 90], [43, 93], [38.5, 92]], tint(SKIN, 0.45));
  stroke(dr, [[20, 90], [27, 88.5]], 1.2, line);
  stroke(dr, [[6, 101], [13, 97], [17, 99.5]], 1.3, line, [0.4, 0.3]);
}

/** The right hand: the thumb come up to tap the next letter. */
function peyvokThumb(dr: Drawing): void {
  shape(dr, [[126, 92], [112, 88], [98, 89], [86, 93], [77.5, 99], [76.5, 104.5], [81, 108], [90, 107], [99, 107], [106, 113], [108, 126], [126, 126]], SKIN);
  shape(dr, [[85.5, 95], [79.5, 99], [78.5, 103.5], [82.5, 105], [87, 101]], tint(SKIN, 0.45));
  stroke(dr, [[104, 95], [97, 96.5]], 1.2, tint(SKIN, -0.42));
}

/** When each tile of the third guess is tapped in. */
const tapped = (c: number): number => 0.2 + c * 0.085;

/**
 * Peyvok: two guesses made, and the third typed in letter by letter under a
 * thumb that taps for each — all four green, and the row takes a small bow.
 * The letters adrift round the phone lift as if on one swell passing.
 */
const peyvok: Cover = {
  title: 'Peyvok',
  loopMs: 5600,
  parts: [
    { draw: (dr) => ground(dr, SAGE) },
    { draw: (dr) => [0, 2].forEach((i) => adrift(dr, i)), pivot: [12, 30], keys: swell(0.04, 4) },
    { draw: (dr) => [1, 3].forEach((i) => adrift(dr, i)), pivot: [106, 30], keys: swell(0.12, -4) },
    { draw: peyvokPhone },
    ...[0, 1, 2, 3].map((c): Part => {
      const [x, y] = tileAt(c, 2);
      const bows = 0.64 + c * 0.04;
      return {
        draw: (dr) => onPhone(dr, () => peyvokTile(dr, c, 2)),
        pivot: turnedPoint(x + 5.5, y + 5.5, PHONE_LEAN, PHONE_AT[0], PHONE_AT[1]),
        keys: [
          [0, {}],
          [0.06, {}, 'hold'],
          // the guess is taken back, and typed again
          [0.1, { s: 0.3, o: 0 }, 'in'],
          [tapped(c), {}, 'hold'],
          [tapped(c) + 0.05, { s: 1.16, o: 1 }, 'out'],
          [tapped(c) + 0.1, { s: 1 }, 'inOut'],
          [bows, {}, 'hold'],
          [bows + 0.045, { y: -4, sx: 0.95, sy: 1.07 }, 'out'],
          [bows + 0.095, { y: 0, sx: 1.07, sy: 0.93 }, 'in'],
          [bows + 0.135, { s: 1 }, 'out'],
          [1, {}, 'hold'],
        ],
      };
    }),
    {
      draw: peyvokThumb,
      pivot: [112, 112],
      keys: [[0, {}], ...[0, 1, 2, 3].flatMap((c): Key[] => [[tapped(c) - 0.035, {}, 'hold'], [tapped(c), { x: -2.6, y: 2.4, r: -3 }, 'out'], [tapped(c) + 0.045, { x: 0, y: 0, r: 0 }, 'inOut']]), [1, {}, 'hold']],
    },
  ],
};

// ───────────────────────────────────────────────────────────── the rhyme

const ROSE = '#f4c0c9';
const SLATE = '#6f88a8';
const BUFF = '#f6e2c2';
const BEAK = '#dc4b3e';

/**
 * A kew, the partridge of the Kurdish hills, facing right about its own
 * middle: the buff face inside its black necklace, the barred flank, the red
 * beak. `singing` opens the beak and shuts the eye with the effort of it;
 * otherwise it sits and gives the look of a bird that has heard this song
 * before.
 */
function kew(dr: Drawing, singing: boolean): void {
  shape(dr, [[-15, 17, 1], [-31, 31, 1], [-9, 28, 1]], tint(SLATE, -0.18));
  shape(dr, [[-1, -31], [11, -26], [17, -11], [20, 7], [16, 23], [3, 31], [-13, 27], [-21, 8], [-18, -13], [-11, -26]], SLATE);
  shape(dr, [[5, 0], [18, 6], [16, 22], [5, 30], [-3, 22], [-2, 8]], BUFF);
  // the bars on its flank
  for (const [x, y] of [[13, 9], [8, 12], [3, 15]] as const) stroke(dr, [[x, y], [x - 1.4, y + 5], [x - 1, y + 10]], 2.5, INK, [0.5, 0.3]);
  shape(dr, [[2, -27], [12, -22], [15, -11], [8, -5], [0, -12], [-1, -21]], BUFF);
  stroke(dr, [[11, -27], [1, -25], [-3, -15], [3, -6], [15, -5.5]], 2.8, INK, [0.6, 0.45]);
  if (singing) {
    shape(dr, [[13, -22, 1], [27, -27, 1], [15, -15.5, 1]], BEAK);
    shape(dr, [[13.5, -13.5, 1], [23, -8.5, 1], [13, -9.5, 1]], BEAK);
    stroke(dr, [[0.5, -18], [4, -21], [7.5, -18]], 1.7, INK, [0.5, 0.5]);
  } else {
    shape(dr, [[13.5, -20, 1], [25, -15.5, 1], [13.5, -12, 1]], BEAK);
    eye(dr, 4, -18.5, 3.9, [0.42, 0.1]);
    // the lid, half down
    shape(dr, [[-0.6, -19.4, 1], [8.6, -17.6, 1], [8, -23, 1], [1, -24, 1]], BUFF);
    stroke(dr, [[-1, -19.8], [9.2, -17.6]], 1.6, INK, [0.7, 0.7]);
  }
  stroke(dr, [[-14, -3], [-11, 10], [-1, 17]], 2.1, tint(SLATE, -0.5), [0.4, 0.3]);
  stroke(dr, [[-13, 6], [-8, 14]], 1.6, tint(SLATE, -0.5));
  for (const x of [-3, 7]) stroke(dr, [[x, 29], [x + 0.6, 36]], 2.3, BEAK, [0.8, 0.8]);
}

/** A note of music, written the way a hand writes one: its head, its stem and its flag. */
function note(dr: Drawing, x: number, y: number, k: number, hex = INK): void {
  placed(dr, x, y, -14, k, () => {
    shape(dr, roundish(0, 0, 4.2, 3.1, 0.6), hex);
    stroke(dr, [[3.6, -0.6], [3.9, -15]], 1.7, hex, [0.9, 0.7]);
    stroke(dr, [[3.9, -15], [8.5, -11.5], [8, -6.5]], 2.2, hex, [0.9, 0.2]);
  });
}

/** A note sung at `at`: the one already in the air is gone, and a new one pops out of the beak and hangs there. */
const sung = (at: number): Key[] => [[0, {}], [0.03, {}, 'hold'], [0.07, { o: 0, y: -5 }, 'in'], [at, { s: 0, y: 2 }, 'hold'], [at + 0.08, { s: 1, o: 1, y: 0 }, 'back'], [1, {}, 'hold']];
/** The listener through the loop: it leans away from the song, gives in, and for a moment sings. `shown` is when this drawing of it is the one seen. */
const listens = (shown: 'sitting' | 'singing'): Key[] => [
  [0, shown === 'sitting' ? {} : { o: 0 }],
  [0.36, {}, 'hold'],
  [0.42, { r: -3 }, 'out'],
  [0.5, { r: 0 }, 'inOut'],
  [0.56, {}, 'hold'],
  [0.6, { sx: 1.05, sy: 0.93 }, 'in'],
  [0.64, { sx: 0.96, sy: 1.07, y: -2.4, o: shown === 'sitting' ? 0 : 1 }, 'out'],
  [0.7, { s: 1, y: 0 }, 'inOut'],
  [0.82, {}, 'hold'],
  [0.86, { o: shown === 'sitting' ? 1 : 0 }, 'inOut'],
  [1, {}, 'hold'],
];

/**
 * Rhyming words: two partridges on a branch. One sings; the other has heard
 * it before, leans away — and then cannot help answering with the same note.
 */
const rhyme: Cover = {
  title: 'Rhyme',
  loopMs: 6000,
  parts: [
    {
      draw: (dr) => {
        ground(dr, ROSE);
        // the branch they share, and the leaf left on it
        stroke(dr, [[-6, 97], [30, 94.5], [70, 96], [126, 92]], 5.4, '#5b3a3a', [1, 0.8]);
        stroke(dr, [[98, 93.5], [106, 104], [117, 108]], 2.6, '#5b3a3a', [0.9, 0.3]);
        shape(dr, [[108, 104, 1], [116, 98], [122, 104, 1], [115, 109]], '#5f9e73');
      },
    },
    { draw: (dr) => placed(dr, 36, 60, 0, 1, () => kew(dr, false)), pivot: [38, 94], keys: listens('sitting') },
    { draw: (dr) => placed(dr, 36, 60, 0, 1, () => kew(dr, true)), pivot: [38, 94], keys: listens('singing'), passing: true },
    {
      draw: (dr) => placed(dr, 83, 57, -9, 1, () => kew(dr, true)),
      pivot: [86, 92],
      // it throws its head back for each note, and looks round when it is answered
      keys: [[0, {}], [0.1, {}, 'hold'], [0.15, { r: -5, y: -1.4 }, 'out'], [0.23, { r: 0, y: 0 }, 'inOut'], [0.26, { r: -4, y: -1 }, 'out'], [0.34, { r: 0, y: 0 }, 'inOut'], [0.66, {}, 'hold'], [0.71, { r: 3.5 }, 'out'], [0.8, {}, 'hold'], [0.87, { r: 0 }, 'inOut'], [1, {}, 'hold']],
    },
    { draw: (dr) => note(dr, 104, 26, 1.05), pivot: [100, 30], keys: sung(0.14) },
    { draw: (dr) => note(dr, 113, 46, 0.72), pivot: [108, 46], keys: sung(0.25) },
    // the answer: the same note, from the bird that was not going to sing
    {
      draw: (dr) => note(dr, 62, 24, 0.9, BEAK),
      pivot: [58, 34],
      keys: [[0, { s: 0, o: 0 }], [0.62, {}, 'hold'], [0.7, { s: 1, o: 1 }, 'back'], [0.8, { y: -3 }, 'inOut'], [0.87, { y: -7, o: 0 }, 'in'], [1, { s: 0, y: 0 }, 'hold']],
      passing: true,
    },
  ],
};

// ───────────────────────────────────────────────────────────── the typing race

const TANGERINE = '#f08a3a';
const KEY_SIDE = '#d6bf98';
const SNEAKER = '#d8473b';

/** A key of the keyboard seen from a little above, about its own middle: its top, the side below it, and its letter. */
function keycap(dr: Drawing, size: number, top: string, side: string, ch: string): void {
  const h = size * 0.9;
  fill(dr, card(-size / 2, -h / 2 + size * 0.16, size, h, size * 0.2), side);
  fill(dr, card(-size / 2, -h / 2, size, h, size * 0.2), top);
  write(dr, ch, -size * 0.19, -size * 0.3, size * 0.52, size * 0.1);
}

/** A running shoe at the end of a leg, its toe pointing along `angle`. */
function sneaker(dr: Drawing, x: number, y: number, angle: number, k = 1): void {
  placed(dr, x, y, angle, k, () => {
    shape(dr, [[-4.5, -3.6], [1, -4], [7, -1.2], [9.6, 2.2], [8, 4], [-4, 4], [-5.6, 0.6]], SNEAKER);
    stroke(dr, [[-4.6, 4.3], [8.6, 4.3]], 2, PAPER, [0.9, 0.9]);
    stroke(dr, [[0.5, -2.4], [3, 0.4]], 1.1, PAPER, [0.8, 0.8]);
  });
}

/** How many strides the runners take in one loop. */
const STRIDES = 6;
/** Something done once every stride: `keys` are written for one stride, their moments 0 to 1 of it. */
const everyStride = (keys: readonly Key[]): Key[] => Array.from({ length: STRIDES }, (_, k) => keys.map(([t, to, ease]): Key => [(k + t) / STRIDES, to, ease])).flat();

/**
 * The typing race: two keys off a keyboard, running. The one in front is in
 * the air for half of every stride, its legs closing under it and opening
 * again; the one behind gains a little, and loses it, and never stops trying.
 */
const race: Cover = {
  title: 'Typing race',
  loopMs: 4800,
  parts: [
    {
      draw: (dr) => {
        ground(dr, TANGERINE);
        // the track, and the dust the runners leave on it
        stroke(dr, [[-6, 105.5], [40, 104], [84, 105.5], [126, 103.5]], 2.2, tint(TANGERINE, -0.34), [1, 0.8]);
        for (const [x, w] of [[12, 9], [50, 6], [84, 8]] as const) stroke(dr, [[x, 112], [x + w, 111.6]], 1.6, tint(TANGERINE, -0.34));
      },
    },
    {
      // the one behind, giving it everything and still behind
      draw: (dr) => {
        stroke(dr, [[13, 86], [8, 94], [0, 92]], 2.5, INK, [0.8, 0.7]);
        stroke(dr, [[24, 87], [31, 94], [29, 101]], 2.5, INK, [0.8, 0.7]);
        sneaker(dr, -2, 88, -105, 0.7);
        sneaker(dr, 31, 101.6, 6, 0.7);
        stroke(dr, [[31, 68], [37, 73], [40, 67]], 2.1, INK, [0.8, 0.6]);
        placed(dr, 18, 72, 8, 1, () => keycap(dr, 27, '#7fb2ea', '#4c7fc0', 'Ê'));
        // what it costs him
        for (const [x, y] of [[5, 51], [12, 45]] as const) shape(dr, [[x, y - 3.4, 1], [x + 2.4, y + 1.2], [x, y + 3], [x - 2.4, y + 1.2]], PAPER);
      },
      pivot: [18, 84],
      keys: [
        [0, {}],
        ...Array.from({ length: STRIDES }, (_, k): Key[] => {
          // he rocks from foot to foot, and over the loop comes up a little and drops back
          const gain = Math.sin(((k + 0.5) / STRIDES) * Math.PI) * 5;
          return [
            [(k + 0.5) / STRIDES, { x: gain, y: -2, r: k % 2 === 0 ? -5 : 5 }, 'out'],
            [(k + 1) / STRIDES, { x: k === STRIDES - 1 ? 0 : gain, y: 0, r: 0 }, 'in'],
          ];
        }).flat(),
      ],
    },
    {
      // the air going by
      draw: (dr) => {
        for (const [x, y, w] of [[36, 28, 15], [29, 41, 11], [38, 53, 8]] as const) stroke(dr, [[x, y], [x + w, y - 0.6]], 2.4, '#ffe3bb', [0.3, 0.9]);
      },
      keys: [[0, {}], ...everyStride([[0.5, { x: -8, o: 0.25 }, 'in'], [1, { x: 0, o: 1 }, 'out']])],
    },
    {
      // the leg stretched out behind
      draw: (dr) => {
        stroke(dr, [[66, 77], [58, 89], [48, 87]], 3.6, INK, [0.9, 0.8]);
        sneaker(dr, 46, 82.4, -112);
      },
      pivot: [66, 76],
      keys: [[0, {}], ...everyStride([[0.5, { r: -52, y: -3 }, 'inOut'], [1, { r: 0, y: 0 }, 'inOut']])],
    },
    {
      // the leg reaching for the ground ahead
      draw: (dr) => {
        stroke(dr, [[84, 75], [98, 81], [101, 94]], 3.6, INK, [0.9, 0.8]);
        sneaker(dr, 103, 98, 12);
      },
      pivot: [84, 74],
      keys: [[0, {}], ...everyStride([[0.5, { r: 48, y: -3 }, 'inOut'], [1, { r: 0, y: 0 }, 'inOut']])],
    },
    {
      draw: (dr) => {
        stroke(dr, [[56, 50], [50, 58], [55, 64]], 3, INK, [0.9, 0.7]);
        stroke(dr, [[98, 46], [108, 50], [112, 40]], 3, INK, [0.9, 0.7]);
        placed(dr, 77, 50, -9, 1, () => keycap(dr, 46, PAPER, KEY_SIDE, 'Ç'));
      },
      pivot: [77, 52],
      keys: [[0, {}], ...everyStride([[0.5, { y: -3, r: 2.5 }, 'out'], [1, { y: 0, r: 0 }, 'in']])],
    },
  ],
};

// ───────────────────────────────────────────────────────────── the memory thief

const NAVY = '#1a2444';
const FOX = '#6d87c6';
const FOX_PALE = '#d3dcf2';
const FOX_DARK = '#28335e';
const BEAM = '#f5d373';

/** The thief's sack, and the word he took sticking out of the top of it. */
function sack(dr: Drawing): void {
  turned(dr, 14, 96, 36, () => {
    fill(dr, card(86, 22, 24, 17, 3), PAPER);
    stroke(dr, [[90, 30], [94, 27.5], [97, 31], [101, 28], [105, 30.5]], 1.7, INK, [0.6, 0.4]);
  });
  shape(dr, [[82, 62], [88, 46], [101, 38], [116, 44], [124, 62], [122, 86], [108, 98], [92, 94], [82, 80]], '#8ea4d8');
  stroke(dr, [[96, 48], [104, 60], [103, 76]], 1.8, tint('#8ea4d8', -0.3), [0.3, 0.3]);
  stroke(dr, [[112, 52], [116, 66]], 1.6, tint('#8ea4d8', -0.3));
}

function thiefBody(dr: Drawing): void {
  const torso = smooth([[46, 78], [58, 66], [76, 62], [90, 70], [97, 90], [99, 126], [42, 126], [42, 98]]);
  fill(dr, torso, FOX_PALE);
  // the stripes go round him, so they bend with his back
  inside(dr, torso, () => {
    for (let i = 0; i < 6; i++) stroke(dr, [[38, 74 + i * 11], [62, 68 + i * 11], [102, 77 + i * 11]], 5.2, FOX_DARK, [1, 1]);
  });
}

function thiefHead(dr: Drawing): void {
  // the far ear, then the near one
  shape(dr, [[50, 34, 1], [47, 11, 1], [62, 28, 1]], tint(FOX, -0.3));
  shape(dr, [[62, 30, 1], [70, 7, 1], [80, 33, 1]], FOX);
  shape(dr, [[66, 28, 1], [70, 14, 1], [75, 30, 1]], FOX_DARK);
  shape(dr, [[49, 35], [61, 27], [76, 32], [83, 46], [78, 58], [64, 62], [46, 61], [25, 56, 1], [35, 46], [43, 39]], FOX);
  shape(dr, [[25, 56, 1], [42, 53.5], [58, 51], [72, 55], [70, 60], [56, 62.5], [42, 61.5]], FOX_PALE);
  shape(dr, roundish(26.6, 54.4, 3.4, 2.9, 1), INK);
  // the mask, and the eye that keeps looking over his shoulder
  shape(dr, [[39, 44], [50, 36], [66, 34], [80, 40], [81, 47], [66, 49], [50, 48.5]], FOX_DARK);
  eye(dr, 59, 42.2, 4.6, [0.45, 0.12], 2);
  shape(dr, [[53.6, 41.6, 1], [64.6, 39.6, 1], [64, 35.6, 1], [54, 36.6, 1]], FOX_DARK);
  stroke(dr, [[53.4, 41.8], [64.8, 39.6]], 1.5, INK, [0.7, 0.7]);
  // the cap, pulled down between his ears
  shape(dr, [[47, 34], [50, 23], [61, 17.5], [72, 20], [77, 30], [62, 28.5]], '#3f4f8c');
  stroke(dr, [[47.5, 34.4], [62, 29.6], [77.4, 31.2]], 3, '#55679f', [0.9, 0.9]);
  for (const [x, y] of [[54, 31.2], [61, 29.2], [68, 29.4]] as const) stroke(dr, [[x, y - 1.6], [x + 0.2, y + 1.4]], 0.9, '#3f4f8c', [1, 1]);
  stroke(dr, [[35, 58.4], [44, 59.6], [50, 57.4]], 1.3, INK, [0.3, 0.5]);
}

function thiefTorch(dr: Drawing): void {
  // his arm, and the torch in his paw
  stroke(dr, [[56, 78], [50, 92], [38, 95]], 9, FOX, [0.9, 0.8]);
  turned(dr, 8, 30, 93, () => {
    fill(dr, card(24, 89.5, 17, 7.6, 2), '#55679f');
    shape(dr, [[25, 87.4, 1], [25.4, 99.4, 1], [18.4, 101.6, 1], [18, 85, 1]], '#8ea4d8');
  });
  shape(dr, roundish(38, 95.4, 5, 4.6, 2), FOX);
}

/** The fox stands a little in from the edge and a little small, so that the torch has room to shine. */
const fox =
  (draw: Draw): Draw =>
  (dr) =>
    placed(dr, 11, 8, 0, 0.92, () => draw(dr));

/**
 * A creeping step taken at `at`: everything sinks onto the foot and comes up
 * again. What is carried arrives `late` and sinks `deep`er, as a sack does;
 * `then` is what this part does once the creeping stops.
 */
const creeps = (late: number, deep: number, then: readonly Key[] = []): Key[] => [
  [0, {}],
  ...[0.06, 0.24, 0.42].flatMap((at): Key[] => [[at + late, {}, 'hold'], [at + late + 0.06, { y: deep }, 'out'], [at + late + 0.15, { y: 0 }, 'inOut']]),
  ...then,
  [1, {}, 'hold'],
];

/**
 * The memory thief: a fox in a striped jersey creeping off with a word in
 * his sack, three careful steps — and then he stops, lifts his head, and
 * swings the torch round at a noise that was nothing.
 */
const thief: Cover = {
  title: 'Memory thief',
  loopMs: 6400,
  parts: [
    {
      draw: (dr) => {
        ground(dr, NAVY);
        // two or three stars, for a night with nobody about
        for (const [x, y, r] of [[14, 20, 3.2], [34, 10, 2], [104, 14, 2.4]] as const) {
          stroke(dr, [[x - r, y], [x + r, y]], r * 0.5, FOX_PALE, [0.2, 0.2]);
          stroke(dr, [[x, y - r], [x, y + r]], r * 0.5, FOX_PALE, [0.2, 0.2]);
        }
      },
    },
    {
      draw: (dr) => shape(dr, [[28, 86.4, 1], [-4, 61, 1], [-4, 123, 1], [28.4, 100.6, 1]], BEAM),
      pivot: [29, 93.5],
      keys: creeps(0, 2.2, [[0.66, {}, 'hold'], [0.72, { r: 15 }, 'out'], [0.84, {}, 'hold'], [0.92, { r: 0 }, 'inOut']]),
    },
    { draw: fox(sack), pivot: [100, 100], keys: creeps(0.03, 3.4) },
    { draw: fox(thiefBody), keys: creeps(0, 2.2) },
    { draw: fox(thiefHead), pivot: [78, 62], keys: creeps(0.015, 2.6, [[0.64, {}, 'hold'], [0.69, { y: -2.6, r: 4 }, 'out'], [0.84, {}, 'hold'], [0.92, { y: 0, r: 0 }, 'inOut']]) },
    { draw: fox(thiefTorch), pivot: [58, 80], keys: creeps(0, 2.2) },
  ],
};

// ───────────────────────────────────────────────────────────── the detective

const SKY = '#b8d2ec';
const HOUND = '#d99b56';
const HOUND_EAR = '#7c4b30';
const MUZZLE = '#f7e5c6';
const TWEED = '#7f9c63';
const GLASS = '#eaf5fb';

function houndEar(dr: Drawing, right: boolean): void {
  if (right) shape(dr, [[84, 34], [94, 46], [99, 68], [96, 90], [87, 98], [79, 86], [78, 60]], HOUND_EAR);
  else shape(dr, [[36, 34], [26, 46], [21, 68], [24, 90], [33, 98], [41, 86], [42, 60]], HOUND_EAR);
}

function houndHead(dr: Drawing): void {
  shape(dr, [[60, 24], [80, 30], [89, 50], [86, 72], [78, 92], [60, 100], [42, 92], [34, 72], [31, 50], [40, 30]], HOUND);
  shape(dr, [[60, 60], [73, 65], [78, 80], [71, 93], [60, 97], [49, 93], [42, 80], [47, 65]], MUZZLE);
  shape(dr, [[51, 66.5], [60, 64.6], [69, 66.5], [65, 74], [60, 77], [55, 74]], INK);
  stroke(dr, [[60, 77], [60, 84]], 1.5, INK, [0.9, 0.6]);
  stroke(dr, [[50, 83.4], [54.4, 88.2], [60, 84], [65.6, 88.2], [70, 83.4]], 1.7, INK, [0.3, 0.3]);
  for (const [x, y] of [[48, 76], [45.6, 80.4], [72, 76], [74.4, 80.4]] as const) shape(dr, roundish(x, y, 0.9), tint(INK, 0.3));
  // his eyes as they are without the glass, and the brow that has had an idea
  eye(dr, 46.4, 52, 4.8, [0.3, 0.25], 1);
  eye(dr, 73.6, 52, 4.8, [0.1, 0.25], 2);
  stroke(dr, [[39, 43], [46, 39.4], [53, 42.4]], 2.2, HOUND_EAR, [0.5, 0.4]);
  stroke(dr, [[67, 43.4], [74, 41.4], [81, 43.6]], 2.2, HOUND_EAR, [0.5, 0.4]);
}

function houndCap(dr: Drawing): void {
  const dome = smooth([[33, 36], [38, 18], [60, 9], [82, 18], [87, 36], [60, 29]]);
  fill(dr, dome, TWEED);
  inside(dr, dome, () => {
    const check = tint(TWEED, -0.34);
    for (const x of [44, 60, 76]) stroke(dr, [[x, 6], [x + (x - 60) * 0.08, 40]], 1.4, check, [1, 1]);
    stroke(dr, [[30, 25], [60, 18.4], [90, 25]], 1.4, check, [1, 1]);
    stroke(dr, [[34, 15], [60, 9.4], [86, 15]], 1.2, '#f3d58a', [1, 1]);
  });
  // the peak, and the flaps tied up on top
  shape(dr, [[33, 36], [46, 31], [60, 29], [74, 31], [87, 36], [74, 41], [60, 42.6], [46, 41]], tint(TWEED, -0.2));
  shape(dr, [[60, 9.6], [52, 4.4], [50.4, 10.6], [60, 9.6], [68, 4.4], [69.6, 10.6]], tint(TWEED, -0.2));
  shape(dr, roundish(60, 9.2, 2.4, 2.2), tint(TWEED, -0.4));
}

/** The glass itself: its handle and the lens, with nothing in it yet. */
function houndGlass(dr: Drawing): void {
  stroke(dr, [[90, 63], [102, 78], [112, 92]], 7.4, '#8a4f2b', [0.9, 1]);
  stroke(dr, [[96.4, 68.4], [108, 84]], 1.4, '#c98a52', [0.5, 0.5]);
  shape(dr, roundish(76, 50, 17.2), GLASS);
}
/** Its rim, and the light on it: drawn over whatever the lens shows. */
function houndRim(dr: Drawing): void {
  ringed(dr, roundish(76, 50, 17.2), 4.6, INK, 0.22, 4);
  stroke(dr, [[64.6, 43], [68, 37.6], [73.4, 34.8]], 1.7, PAPER, [0.3, 0.3]);
}

/**
 * The glass through the loop: a small lift, then lowered to his chest while
 * he thinks, and brought up again past where it belongs. `eye` is the eye
 * seen in it, which is only there while the glass is in front of his own: it
 * goes as the glass leaves his face, and swims back into focus once it is
 * there again.
 */
const peers = (eye: boolean): Key[] => [
  [0, {}],
  [0.08, {}, 'hold'],
  [0.12, { s: 1.05, y: -1.5, ...(eye ? { o: 0 } : {}) }, 'out'],
  [0.24, { x: 17, y: 31, r: 20, s: 0.92 }, 'inOut'],
  [0.6, {}, 'hold'],
  [0.64, { x: 19, y: 33 }, 'out'],
  [0.72, { x: 0, y: 0, r: 0, s: 1.1 }, 'back'],
  [0.76, { s: 1, ...(eye ? { o: 1 } : {}) }, 'inOut'],
  [0.8, { x: -2.6 }, 'inOut'],
  [0.86, { x: 2 }, 'inOut'],
  [0.91, { x: 0 }, 'inOut'],
  [1, {}, 'hold'],
];

/** The hound's head cocking to one side while he thinks, and whatever hangs from it swinging `late` after. */
const cocks = (late: number, far: number): Key[] => [[0, {}], [0.26 + late, {}, 'hold'], [0.34 + late, { r: far }, 'inOut'], [0.46 + late, {}, 'hold'], [0.54 + late, { r: 0 }, 'inOut'], [0.6 + late, { r: -far * 0.3 }, 'out'], [0.68 + late, { r: 0 }, 'inOut'], [1, {}, 'hold']];

/**
 * The detective: a hound in a tweed cap. He lowers his glass and thinks,
 * head on one side, ears swinging after it — then up it comes again, and
 * there is the one enormous eye, looking the evidence over from left to
 * right.
 */
const detective: Cover = {
  title: 'Detective',
  loopMs: 6400,
  parts: [
    {
      draw: (dr) => {
        ground(dr, SKY);
        // the collar of his coat
        shape(dr, [[22, 126], [28, 106], [46, 98], [60, 104], [74, 98], [92, 106], [98, 126]], '#8a6748');
        stroke(dr, [[46, 99], [58, 112], [60, 126]], 1.6, tint('#8a6748', -0.4), [0.4, 0.8]);
        stroke(dr, [[74, 99], [62, 112], [60, 126]], 1.6, tint('#8a6748', -0.4), [0.4, 0.8]);
      },
    },
    { draw: (dr) => houndEar(dr, false), pivot: [38, 36], keys: cocks(0.025, 7) },
    { draw: (dr) => houndEar(dr, true), pivot: [82, 36], keys: cocks(0.035, 7) },
    {
      draw: (dr) => {
        houndHead(dr);
        houndCap(dr);
      },
      pivot: [60, 98],
      keys: cocks(0, 4),
    },
    { draw: houndGlass, pivot: [76, 50], keys: peers(false) },
    { draw: (dr) => eye(dr, 76.4, 51, 10.4, [-0.2, 0.14], 3), pivot: [76, 50], keys: peers(true) },
    { draw: houndRim, pivot: [76, 50], keys: peers(false) },
  ],
};

// ───────────────────────────────────────────────────────────── the last letter

const GRAPE = '#6a4bc6';
const SUN = '#ffd64a';
const SKIN_PALE = '#e7ab7a';

/** A letter tile about its own middle: its face, its thickness below it, and the letter both players are after. */
function letterTile(dr: Drawing, face: string, side: string): void {
  fill(dr, card(-19, -15, 38, 38, 6), side);
  fill(dr, card(-19, -20, 38, 38, 6), face);
  write(dr, 'R', -8.6, -13.4, 24, 4.4);
}

/** A hand drawing its tile back and bringing it down on the other's: `side` is -1 for the left hand, 1 for the right. */
const strikes = (side: -1 | 1): Key[] => [[0, {}], [0.1, {}, 'hold'], [0.24, { x: side * 9, r: side * 7 }, 'inOut'], [0.3, {}, 'hold'], [0.355, { x: side * -2.6, r: side * -2 }, 'in'], [0.42, { x: 0, r: 0 }, 'out'], [1, {}, 'hold']];

/**
 * The last letter: one player's word ends in a letter, and the other's has
 * to begin with it. Two hands, each with its tile — they draw back, and bring
 * them together hard enough to strike sparks.
 */
const lastLetter: Cover = {
  title: 'Last letter',
  loopMs: 5200,
  parts: [
    { draw: (dr) => ground(dr, GRAPE) },
    {
      // what flies off when the two meet
      draw: (dr) => {
        for (const [x1, y1, x2, y2] of [[60, 24, 60, 8], [50, 27, 43, 14], [70, 27, 77, 14], [43, 34, 32, 28], [77, 34, 88, 28]] as const) stroke(dr, [[x1, y1], [x2, y2]], 3, SUN, [0.9, 0.25]);
      },
      pivot: [60, 36],
      keys: [[0, {}], [0.1, {}, 'hold'], [0.16, { o: 0, s: 0.6 }, 'in'], [0.355, {}, 'hold'], [0.42, { o: 1, s: 1.25 }, 'out'], [0.5, { s: 1 }, 'inOut'], [0.6, { s: 1.08 }, 'inOut'], [0.7, { s: 1 }, 'inOut'], [1, {}, 'hold']],
    },
    {
      // the sleeve, the fingers behind the tile, the tile, and the thumb that holds it
      draw: (dr) => {
        shape(dr, [[-6, 96], [10, 100], [24, 112], [28, 126], [-6, 126]], '#1ea394');
        shape(dr, [[6, 98], [12, 84], [24, 76], [34, 80], [34, 96], [26, 108], [14, 110]], SKIN);
        placed(dr, 41, 60, -10, 1, () => letterTile(dr, PAPER, KEY_SIDE));
        shape(dr, [[16, 88], [22, 77], [31, 71.4], [36.4, 74], [35, 80], [28, 86], [23, 94]], SKIN);
        shape(dr, [[28.4, 74.6], [33.6, 73], [35, 76], [31, 79]], tint(SKIN, 0.45));
      },
      pivot: [8, 116],
      keys: strikes(-1),
    },
    {
      draw: (dr) => {
        shape(dr, [[126, 96], [110, 100], [96, 112], [92, 126], [126, 126]], '#f0705c');
        shape(dr, [[114, 98], [108, 84], [96, 76], [86, 80], [86, 96], [94, 108], [106, 110]], SKIN_PALE);
        placed(dr, 80, 58, 9, 1, () => letterTile(dr, SUN, '#d9a514'));
        shape(dr, [[104, 88], [98, 77], [89, 71.4], [83.6, 74], [85, 80], [92, 86], [97, 94]], SKIN_PALE);
        shape(dr, [[91.6, 74.6], [86.4, 73], [85, 76], [89, 79]], tint(SKIN_PALE, 0.5));
      },
      pivot: [112, 116],
      keys: strikes(1),
    },
  ],
};

// ───────────────────────────────────────────────────────────── the impostor

const MUSTARD = '#ebb946';
const COAT = '#2a2140';
const SHADE = '#43365f';
const BAND = '#d8473b';

function spyCoat(dr: Drawing): void {
  shape(dr, [[10, 126], [15, 100], [32, 88], [60, 84], [88, 88], [105, 100], [110, 126]], COAT);
  // his face, kept in the shadow of the brim
  shape(dr, [[40, 50], [60, 46], [80, 50], [82, 70], [72, 84], [60, 88], [48, 84], [38, 70]], SHADE);
  // the collar turned up either side of it
  shape(dr, [[30, 92], [33, 66, 1], [48, 80], [58, 100, 1]], COAT);
  shape(dr, [[90, 92], [87, 66, 1], [72, 80], [62, 100, 1]], COAT);
  stroke(dr, [[34, 69], [47, 81], [57, 99]], 1.3, MUSTARD, [0.4, 0.3]);
  stroke(dr, [[86, 69], [73, 81], [63, 99]], 1.3, MUSTARD, [0.4, 0.3]);
}

/** Where the spy's eyes are. */
const SPY_EYES = [50, 70] as const;

function spyHat(dr: Drawing): void {
  shape(dr, [[16, 53], [36, 45], [60, 43], [84, 45], [104, 53], [86, 58.4], [60, 60], [34, 58.4]], COAT);
  shape(dr, [[36, 48], [38, 26], [48, 15], [60, 19], [72, 15], [82, 26], [84, 48], [60, 51]], COAT);
  const band = smooth([[36.6, 38], [60, 41.6], [83.4, 38], [84, 46.6], [60, 50], [36, 46.6]]);
  fill(dr, band, BAND);
  stroke(dr, [[52, 19], [60, 24], [68, 19]], 1.2, SHADE, [0.4, 0.4]);
}

function spyCard(dr: Drawing): void {
  placed(dr, 82, 96, 9, 1, () => {
    fill(dr, card(-13, -17, 26, 34, 4), PAPER);
    write(dr, '?', -5.6, -11.6, 20, 3.6, BAND);
  });
  // the glove that holds it up
  shape(dr, [[70, 126], [70, 110], [77, 103], [85, 106], [86, 114], [92, 118], [94, 126]], PAPER);
  stroke(dr, [[77, 111], [81, 117]], 1.1, tint(PAPER, -0.3));
}

/**
 * The impostor: everybody at the table has the word but one, and he is not
 * going to be the one to say so. His eyes go to the left, to the right, back;
 * the card with nothing on it comes up for a look; the brim comes down.
 */
const impostor: Cover = {
  title: 'Impostor',
  loopMs: 5600,
  parts: [
    {
      draw: (dr) => {
        ground(dr, MUSTARD);
        spyCoat(dr);
        // the whites of his eyes: two slits
        for (const x of SPY_EYES) shape(dr, [[x - 6, 63, 1], [x, 59.6], [x + 6, 63, 1], [x, 65.4]], PAPER);
      },
    },
    {
      draw: (dr) => {
        for (const x of SPY_EYES) shape(dr, roundish(x - 3, 62.6, 2, 2.3), INK);
      },
      keys: [[0, {}], [0.1, {}, 'hold'], [0.13, { x: 6 }, 'out'], [0.34, {}, 'hold'], [0.37, { x: 0 }, 'out'], [0.52, {}, 'hold'], [0.55, { x: 6 }, 'out'], [0.66, {}, 'hold'], [0.69, { x: 0 }, 'out'], [1, {}, 'hold']],
    },
    { draw: spyHat, pivot: [60, 52], keys: [[0, {}], [0.7, {}, 'hold'], [0.76, { y: 2, r: -3 }, 'out'], [0.86, {}, 'hold'], [0.93, { y: 0, r: 0 }, 'inOut'], [1, {}, 'hold']] },
    {
      draw: spyCard,
      pivot: [82, 120],
      keys: [[0, {}], [0.16, {}, 'hold'], [0.2, { y: 1.6 }, 'out'], [0.29, { y: -5, r: -6 }, 'back'], [0.35, { r: 3 }, 'inOut'], [0.41, { r: -2 }, 'inOut'], [0.47, { r: 0 }, 'inOut'], [0.6, {}, 'hold'], [0.69, { y: 0 }, 'inOut'], [1, {}, 'hold']],
    },
  ],
};

// ───────────────────────────────────────────────────────────── who am I?

const MINT = '#8fd0b3';
const HIDDEN = '#1e5b47';
const NOTE = '#ffd84d';

/**
 * Hevalo's head and shoulders as the flat shadow the game's stage wears
 * (games/who-am-i/silhouette.ts), fitted to the cover's square: the same
 * drawing in both places, so the picture on the game's card is the one the
 * player meets when the game opens.
 */
function hiddenDeer(dr: Drawing): void {
  const svg = deerSilhouetteSvg(HIDDEN, 120, '');
  const box = (/viewBox="([^"]+)"/.exec(svg)?.[1] ?? '0 0 120 120').split(/\s+/).map(Number) as [number, number, number, number];
  const inner = svg
    .replace(/^<svg[^>]*>/, '')
    .replace(/<title[^>]*>[\s\S]*?<\/title>/, '')
    .replace(/<\/svg>\s*$/, '');
  // the drawing runs on below the shoulders: it is cut at the picture's own edge
  const frame = dr.clip('M0 0H120V120H0Z');
  dr.add(`<g clip-path="url(#${frame})"><g fill="${HIDDEN}" transform="scale(${n(120 / box[2])}) translate(${n(-box[0])} ${n(-box[1])})">${inner}</g></g>`);
}

/** Where the deer's eyes are, how big, and where each pupil rests: turned up and in, at what is stuck to his own forehead. */
const DEER_EYES = [
  { x: 44.6, look: [0.3, -0.42] },
  { x: 77.4, look: [-0.3, -0.42] },
] as const;
const DEER_EYE = { y: 74, r: 7.6 } as const;

function stickyNote(dr: Drawing): void {
  placed(dr, 60, 47, -5, 1, () => {
    // the shadow it throws, the note, and the corner that has come unstuck
    fill(dr, card(-14.4, -13, 31, 30, 1.5), tint(HIDDEN, -0.3));
    shape(dr, [[-16, -16, 1], [15.6, -16.6, 1], [16.2, 9, 1], [9, 14.6, 1], [-15.4, 14, 1]], NOTE);
    shape(dr, [[16.2, 9, 1], [9, 14.6, 1], [9.4, 8.4, 1]], tint(NOTE, -0.26));
    write(dr, '?', -6.4, -11.6, 20, 3.8);
  });
}

/** A pupil trying to read the note: over to one side of it, over to the other, and back to where it started. */
const reads = (left: number, right: number): Key[] => [[0, {}], [0.08, {}, 'hold'], [0.13, { x: left }, 'out'], [0.3, {}, 'hold'], [0.37, { x: right }, 'inOut'], [0.52, {}, 'hold'], [0.58, { x: 0 }, 'inOut'], [1, {}, 'hold']];

/**
 * Who am I?: Hevalo as a shadow, with a note on his forehead that everyone
 * can read but him. All that shows of him is his eyes, turned up at it: he
 * tries it from the left, tries it from the right, and a draught lifts the
 * note's corner just to make it worse.
 */
const whoAmI: Cover = {
  title: 'Who am I?',
  loopMs: 5200,
  parts: [
    {
      draw: (dr) => {
        ground(dr, MINT);
        hiddenDeer(dr);
        for (const e of DEER_EYES) white(dr, e.x, DEER_EYE.y, DEER_EYE.r, e.x);
      },
    },
    { draw: (dr) => pupil(dr, DEER_EYES[0].x, DEER_EYE.y, DEER_EYE.r, DEER_EYES[0].look), keys: reads(-4, 1.2) },
    { draw: (dr) => pupil(dr, DEER_EYES[1].x, DEER_EYE.y, DEER_EYE.r, DEER_EYES[1].look), keys: reads(-1.2, 4) },
    {
      draw: stickyNote,
      // it is stuck along its top edge, and turns about that
      pivot: [60, 32],
      keys: [[0, {}], [0.62, {}, 'hold'], [0.67, { r: 6, sy: 0.96 }, 'out'], [0.74, { r: -3.5, sy: 1 }, 'inOut'], [0.8, { r: 2 }, 'inOut'], [0.86, { r: 0 }, 'inOut'], [1, {}, 'hold']],
    },
  ],
};

/** Every game's cover, by the name the game goes by on the Games page. */
export const COVERS = {
  peyvok,
  rhyme,
  race,
  'memory-thief': thief,
  detective,
  'last-letter': lastLetter,
  impostor,
  'who-am-i': whoAmI,
} as const satisfies Record<string, Cover>;
