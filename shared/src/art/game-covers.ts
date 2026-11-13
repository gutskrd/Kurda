/**
 * The games' covers: one picture for each game on Learn's Games page, drawn
 * the way the rest of the app's pictures are (cutout.ts) — clean cut-out
 * forms in flat colour, lit from the upper left, their thickness showing
 * below them — and each with somebody in it: two birds who rhyme, a fox who
 * takes words, a hound on a trail, a stranger behind a hand of cards.
 *
 * A cover shows its game as the game is. Peyvok's board is five letters wide
 * and scored by the real rules; the rhyme is two words that end alike; the
 * last letter of one word is the first of the next. What is written is
 * Kurdish, from the first lessons, so a cover is the same picture in every
 * language the app speaks.
 *
 * A cover fills its whole square; the apps round its corners. Each is drawn
 * in parts, back to front, and each part has its acting (game-acting.ts), so
 * a cover moves without anything being drawn again. A part where it was
 * drawn is the still picture: every part's acting starts from there and
 * comes back to it, so a cover that has played once is the picture it was.
 */
import { deerSilhouetteSvg } from '../games/who-am-i/silhouette.js';
import { GAME_NAMES } from '../games/names.js';
import { dab, form, ring, rr, type Tones } from './cutout.js';
import type { Cover, Key, Part } from './game-acting.js';
import { impostorMask } from './impostor.js';
import { letter, letterWidth, oval, smooth } from './ink.js';
import { Drawing, n, tint } from './svg.js';

// ───────────────────────────────────────────────────────────── the colours

const RED = '#d8493b';
const GOLD = '#f2b632';
const GREEN = '#3fa45b';
const BLUE = '#3d8fdd';
const SKY = '#74bdea';
const PINK = '#e96a9c';
const ORANGE = '#f08a34';
const STEEL = '#9aa5b4';
const NIGHT = '#3b2f63';
/** The deep tone lines and eyes are drawn in: never black. */
const INK = '#3a2b4d';
const CREAM: Tones = { light: '#fffaf1', base: '#f6ead6', shade: '#cdb898' };
const WHITE = '#ffffff';

/** A colour as a form's three tones. */
const tones = (hex: string): Tones => ({ light: tint(hex, 0.32), base: hex, shade: tint(hex, -0.32) });

// ───────────────────────────────────────────────────────────── the pen

const fill = (dr: Drawing, d: string, hex: string, more = ''): void => {
  dr.add(`<path d="${d}" fill="${hex}"${more}/>`);
};
const line = (dr: Drawing, d: string, hex: string, width: number, more = ''): void => {
  dr.add(`<path d="${d}" fill="none" stroke="${hex}" stroke-width="${n(width)}" stroke-linecap="round" stroke-linejoin="round"${more}/>`);
};
/** The whole square in one colour: every cover's first part. */
const ground = (dr: Drawing, hex: string): void => fill(dr, 'M0 0H120V120H0Z', hex);
/** A letter, drawn with an even line. */
const write = (dr: Drawing, ch: string, x: number, y: number, height: number, hex: string, weight: number, turn = 0): void => dr.add(letter(ch, x, y, height, hex, weight, turn));

/** What `draw` adds, moved to (x, y), turned by `angle` degrees and scaled by (kx, ky) about its own origin. */
function placed(dr: Drawing, x: number, y: number, angle: number, kx: number, draw: () => void, ky = kx): void {
  dr.add(`<g transform="translate(${n(x)} ${n(y)}) rotate(${n(angle)}) scale(${String(kx)} ${String(ky)})">`);
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
/** A point of a drawing made about (cx, cy) and turned by `angle` degrees, as it lands on the page. */
function turnedPoint(x: number, y: number, angle: number, cx: number, cy: number): readonly [number, number] {
  const [cos, sin] = [Math.cos((angle * Math.PI) / 180), Math.sin((angle * Math.PI) / 180)];
  return [cx + (x - cx) * cos - (y - cy) * sin, cy + (x - cx) * sin + (y - cy) * cos];
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

/** An eye: a dark pupil with one point of light in it, the way every character here has them. */
function pupil(dr: Drawing, cx: number, cy: number, r: number): void {
  fill(dr, oval(cx, cy, r, r * 1.12), INK);
  fill(dr, ring(cx + r * 0.32, cy - r * 0.4, r * 0.32), WHITE);
}

/**
 * A letter tile, as the games' own are: a rounded square standing on its
 * edge, its letter in the middle of its face. `ink` is the letter's colour.
 */
function tile(dr: Drawing, x: number, y: number, size: number, face: Tones, ch: string | null, ink: string, drop = size * 0.13): void {
  form(dr, rr(x, y, size, size, size * 0.22), face, drop, size * 0.09);
  if (ch === null) return;
  const h = size * 0.54;
  write(dr, ch, x + (size - letterWidth(h)) / 2, y + (size - h) / 2, h, ink, size * 0.115);
}

// ───────────────────────────────────────────────────────────── the birds

/**
 * A small round bird about its own middle, facing right: the cast of the
 * word games. `mood` is what its face is doing: looking, with its beak shut;
 * saying something, beak open and eye bright; or unimpressed, lid half down.
 */
function bird(dr: Drawing, colour: string, mood: 'looks' | 'speaks' | 'doubts'): void {
  const deep = tint(colour, -0.26);
  fill(dr, smooth([[-9, 5], [-25, 9], [-23, 16], [-8, 14]]), deep);
  form(dr, oval(0, 0, 15, 17), tones(colour), 3, 2);
  fill(dr, oval(4, 6.5, 8.6, 9.4), tint(colour, 0.62));
  fill(dr, smooth([[-11, -3], [-3, -3], [2, 5], [-2, 11], [-10, 7]]), deep);
  // its eye, and what the mood does to it
  fill(dr, ring(6, -7, 4.8), WHITE);
  pupil(dr, 7.2, -6.8, 2.5);
  if (mood === 'doubts') {
    fill(dr, 'M0.6 -12.4H11.4V-7.6H0.6Z', colour);
    line(dr, 'M1.2 -7.6H10.8', deep, 1.5);
  }
  // the beak: shut, or open on a word
  if (mood === 'speaks') {
    form(dr, smooth([[12.6, -7, 1], [22, -7.6, 1], [13.4, -2.6, 1]]), tones(ORANGE), 0.6, 0.8);
    fill(dr, smooth([[12.8, -1.6, 1], [20, 1.6, 1], [12.4, 2.2, 1]]), tint(ORANGE, -0.2));
  } else {
    form(dr, smooth([[12.8, -6, 1], [22, -2.8, 1], [12.8, 0.4, 1]]), tones(ORANGE), 0.8, 0.8);
  }
  line(dr, 'M-1 -16.4C0 -20 3 -21.4 5.6 -20', deep, 1.8);
  line(dr, 'M-3 16.5V21.5M5 16.5V21.5', tint(ORANGE, -0.18), 2.2);
}

// ───────────────────────────────────────────────────────────── Peyvok

const MINT = '#cfe9d6';
const MARK = { gray: STEEL, yellow: GOLD, green: GREEN } as const;
/** A game that ends on `heval`, friend, scored by the real rules: the guesses the app's front page shows. */
const GUESSES: ReadonlyArray<readonly [string, ReadonlyArray<keyof typeof MARK>]> = [
  ['DAYIK', ['gray', 'yellow', 'gray', 'gray', 'gray']],
  ['SILAV', ['gray', 'gray', 'yellow', 'green', 'yellow']],
  ['HEVAL', ['green', 'green', 'green', 'green', 'green']],
];
/** How far the phone leans, and the point it leans about. */
const LEAN = -7;
const LEAN_AT = [60, 66] as const;
const CELL = 12.4;
const cellAt = (c: number, r: number): readonly [number, number] => [24.6 + c * 14.6, 27 + r * 14.8];
const leaning = (dr: Drawing, draw: () => void): void => turned(dr, LEAN, LEAN_AT[0], LEAN_AT[1], draw);

/** One square of a guess: its mark's colour, its letter in white. */
function guessed(dr: Drawing, c: number, r: number): void {
  const [x, y] = cellAt(c, r);
  const [word, marks] = GUESSES[r]!;
  tile(dr, x, y, CELL, tones(MARK[marks[c]!]), word[c]!, WHITE, 1.5);
}

function peyvokPhone(dr: Drawing): void {
  leaning(dr, () => {
    // the phone, taller than the picture: its foot runs off the bottom edge
    form(dr, rr(17, 6, 86, 150, 13), tones(NIGHT), 4, 2.4);
    fill(dr, rr(21.6, 11, 76.8, 140, 8.6), '#fffdf8');
    fill(dr, rr(51, 14.4, 18, 4.4, 2.2), NIGHT);
    // the rows still to be guessed
    for (let r = 2; r < 7; r++) for (let c = 0; c < 5; c++) line(dr, rr(...cellAt(c, r), CELL, CELL, 2.7), '#e6dece', 1.3);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 5; c++) guessed(dr, c, r);
  });
}

/** When each square of the last guess turns over. */
const turnsAt = (c: number): number => 0.2 + c * 0.075;

/**
 * Peyvok: a phone with the game on it. Two guesses are made, and the third
 * turns over square by square, every one of them green: heval. Two of the
 * letters Kurmancî adds stand beside it and nod.
 */
const peyvok: Cover = {
  title: GAME_NAMES.peyvok,
  loopMs: 5600,
  parts: [
    {
      draw: (dr) => {
        ground(dr, MINT);
        fill(dr, sparkle(13, 22, 6), WHITE);
        fill(dr, sparkle(108, 60, 4.4), WHITE);
      },
    },
    { draw: peyvokPhone },
    ...[0, 1, 2, 3, 4].map((c): Part => {
      const [x, y] = cellAt(c, 2);
      const bows = 0.7 + c * 0.035;
      return {
        draw: (dr) => leaning(dr, () => guessed(dr, c, 2)),
        pivot: turnedPoint(x + CELL / 2, y + CELL / 2, LEAN, LEAN_AT[0], LEAN_AT[1]),
        keys: [
          [0, {}],
          [0.06, {}, 'hold'],
          // the guess is taken back, and made again
          [0.1, { sy: 0.1, o: 0 }, 'in'],
          [turnsAt(c), {}, 'hold'],
          [turnsAt(c) + 0.05, { sy: 1.12, o: 1 }, 'out'],
          [turnsAt(c) + 0.1, { sy: 1 }, 'inOut'],
          [bows, {}, 'hold'],
          [bows + 0.045, { y: -3.4, sx: 0.96, sy: 1.06 }, 'out'],
          [bows + 0.095, { y: 0, sx: 1.06, sy: 0.94 }, 'in'],
          [bows + 0.135, { s: 1 }, 'out'],
          [1, {}, 'hold'],
        ],
      };
    }),
    {
      draw: (dr) => placed(dr, 17, 97, -13, 1, () => tile(dr, -13, -13, 26, CREAM, 'Ê', INK)),
      pivot: [17, 97],
      keys: [[0, {}], [0.58, {}, 'hold'], [0.64, { y: -4, r: 5 }, 'out'], [0.72, { y: 0, r: 0 }, 'back'], [1, {}, 'hold']],
    },
    {
      draw: (dr) => placed(dr, 102, 100, 11, 1, () => tile(dr, -12, -12, 24, CREAM, 'Ş', INK)),
      pivot: [102, 100],
      keys: [[0, {}], [0.62, {}, 'hold'], [0.68, { y: -4, r: -5 }, 'out'], [0.76, { y: 0, r: 0 }, 'back'], [1, {}, 'hold']],
    },
  ],
};

// ───────────────────────────────────────────────────────────── the rhyme

const BLUSH = '#fcd8e2';
const SUN = '#f5bd3a';

/** A speech bubble about what a bird says: the word, its ending in the colour both endings share. */
function saying(dr: Drawing, x: number, y: number, word: string, tailAt: number): void {
  const [w, h] = [44, 23];
  const [r, b] = [x + w, y + h];
  const outline =
    `M${n(x + 11)} ${n(y)}H${n(r - 11)}A11 11 0 0 1 ${n(r)} ${n(y + 11)}V${n(b - 11)}A11 11 0 0 1 ${n(r - 11)} ${n(b)}` +
    `H${n(tailAt + 6)}L${n(tailAt)} ${n(b + 8)}L${n(tailAt - 5)} ${n(b)}H${n(x + 11)}A11 11 0 0 1 ${n(x)} ${n(b - 11)}V${n(y + 11)}A11 11 0 0 1 ${n(x + 11)} ${n(y)}Z`;
  form(dr, outline, CREAM, 2.4, 1.8);
  const size = 10;
  const step = letterWidth(size) + 2.6;
  const left = x + (w - (step * word.length - 2.6)) / 2;
  // the first letter is the word's own; what follows is the rhyme
  [...word].forEach((ch, i) => write(dr, ch, left + i * step, y + (h - size) / 2, size, i === 0 ? INK : PINK, 2.1));
}

/** A bird hopping as it speaks, at `at`. */
const hops = (at: number): Key[] => [[at, {}, 'hold'], [at + 0.03, { sy: 0.93, sx: 1.05 }, 'in'], [at + 0.08, { y: -4, sy: 1.05, sx: 0.97 }, 'out'], [at + 0.15, { y: 0, s: 1 }, 'in']];

/**
 * Rhyme: two birds on a wire. One says dar, a tree; the other answers kar,
 * work — and the ending they share is the same colour in both.
 */
const rhyme: Cover = {
  title: GAME_NAMES.rhyme,
  loopMs: 5600,
  parts: [
    {
      draw: (dr) => {
        ground(dr, BLUSH);
        line(dr, 'M-4 97C30 101 90 100 124 95', INK, 2.4);
      },
    },
    { draw: (dr) => placed(dr, 37, 77, 0, 1, () => bird(dr, BLUE, 'speaks')), pivot: [37, 97], keys: [[0, {}], ...hops(0.1), [1, {}, 'hold']] },
    { draw: (dr) => placed(dr, 85, 75, 0, -1, () => bird(dr, SUN, 'speaks'), 1), pivot: [85, 96], keys: [[0, {}], ...hops(0.42), [1, {}, 'hold']] },
    { draw: (dr) => saying(dr, 6, 12, 'DAR', 40), pivot: [40, 44], keys: [[0, {}], [0.04, {}, 'hold'], [0.08, { s: 0.6, o: 0 }, 'in'], [0.12, {}, 'hold'], [0.2, { s: 1, o: 1 }, 'back'], [1, {}, 'hold']] },
    { draw: (dr) => saying(dr, 70, 20, 'KAR', 84), pivot: [84, 52], keys: [[0, {}], [0.04, {}, 'hold'], [0.08, { s: 0.6, o: 0 }, 'in'], [0.44, {}, 'hold'], [0.52, { s: 1, o: 1 }, 'back'], [1, {}, 'hold']] },
  ],
};

// ───────────────────────────────────────────────────────────── the typing race

const PEACH = '#ffdfbf';

/** A key off a keyboard about its own middle: its cap, the side below it, and its letter. */
function keycap(dr: Drawing, size: number, cap: Tones, ch: string): void {
  form(dr, rr(-size / 2, -size / 2, size, size * 0.94, size * 0.2), cap, size * 0.15, size * 0.06);
  const h = size * 0.5;
  write(dr, ch, -letterWidth(h) / 2, -size / 2 + (size * 0.94 - h) / 2 - size * 0.02, h, INK, size * 0.095);
}

/** A running shoe, its toe pointing right from its heel at the origin. */
function shoe(dr: Drawing, k: number): void {
  form(dr, smooth([[-2.6, -3.4], [3, -3.8], [8.6, -0.6], [10.4, 2.6], [9, 4.2], [-2.4, 4.2], [-3.6, 0.4]]), tones(RED), 0, 1 * k);
  line(dr, 'M-2.6 4.4H9.2', WHITE, 1.9);
}

/** One runner's legs as two lines, each ending in a shoe: where each hip, knee and ankle is, and how the shoe is turned. */
type Leg = readonly [hip: readonly [number, number], knee: readonly [number, number], ankle: readonly [number, number], turn: number];
function leg(dr: Drawing, [hip, knee, ankle, turn]: Leg, width: number): void {
  line(dr, `M${n(hip[0])} ${n(hip[1])}L${n(knee[0])} ${n(knee[1])}L${n(ankle[0])} ${n(ankle[1])}`, INK, width);
  placed(dr, ankle[0], ankle[1], turn, width / 3.4, () => shoe(dr, 1));
}

/** How many strides the runners take in one loop. */
const STRIDES = 6;
/** Something done once every stride: `keys` are written for one stride, their moments 0 to 1 of it. */
const everyStride = (keys: readonly Key[]): Key[] => Array.from({ length: STRIDES }, (_, k) => keys.map(([t, to, ease]): Key => [(k + t) / STRIDES, to, ease])).flat();

/**
 * The typing race: two keys off a keyboard, running for the line. The one in
 * front is in the air for half of every stride; the one behind gains a
 * little, loses it, and never stops trying.
 */
const race: Cover = {
  title: GAME_NAMES.race,
  loopMs: 4800,
  parts: [
    {
      draw: (dr) => {
        ground(dr, PEACH);
        // the track they run on, and where each of them is over it
        fill(dr, 'M0 103H120V120H0Z', tint(PEACH, -0.1));
        fill(dr, oval(27, 104, 15, 2.6), tint(PEACH, -0.24));
        fill(dr, oval(80, 104, 23, 3.2), tint(PEACH, -0.24));
      },
    },
    {
      // the air going by
      draw: (dr) => {
        line(dr, 'M36 26H52M30 38H42M38 50H47', WHITE, 2.6);
      },
      keys: [[0, {}], ...everyStride([[0.5, { x: -7, o: 0.3 }, 'in'], [1, { x: 0, o: 1 }, 'out']])],
    },
    {
      // the one behind, giving it everything
      draw: (dr) => {
        leg(dr, [[20, 84], [13, 92], [5, 91], -100], 2.6);
        leg(dr, [[30, 84], [37, 91], [36, 99], 8], 2.6);
        line(dr, 'M40 68L46 72L48 65', INK, 2.4);
        line(dr, 'M11 70L5 75L7 81', INK, 2.4);
        placed(dr, 25, 70, 7, 1, () => keycap(dr, 29, tones(SKY), 'Ê'));
        // what it costs him
        fill(dr, 'M7 46C9.4 49.4 10.4 51 10.4 52.6A3.4 3.4 0 0 1 3.6 52.6C3.6 51 4.6 49.4 7 46Z', WHITE);
        fill(dr, 'M16 40C17.6 42.4 18.4 43.6 18.4 44.8A2.4 2.4 0 0 1 13.6 44.8C13.6 43.6 14.4 42.4 16 40Z', WHITE);
      },
      pivot: [25, 84],
      keys: [
        [0, {}],
        ...Array.from({ length: STRIDES }, (_, k): Key[] => {
          // he rocks from foot to foot, and over the loop comes up a little and drops back
          const gain = Math.sin(((k + 0.5) / STRIDES) * Math.PI) * 5;
          return [
            [(k + 0.5) / STRIDES, { x: gain, y: -2, r: k % 2 === 0 ? -4 : 4 }, 'out'],
            [(k + 1) / STRIDES, { x: k === STRIDES - 1 ? 0 : gain, y: 0, r: 0 }, 'in'],
          ];
        }).flat(),
      ],
    },
    {
      // the leg stretched out behind
      draw: (dr) => leg(dr, [[70, 76], [60, 88], [49, 85], -104], 3.4),
      pivot: [70, 75],
      keys: [[0, {}], ...everyStride([[0.5, { r: -50, y: -3 }, 'inOut'], [1, { r: 0, y: 0 }, 'inOut']])],
    },
    {
      // the leg reaching for the ground ahead
      draw: (dr) => leg(dr, [[88, 75], [100, 82], [101, 96], 10], 3.4),
      pivot: [88, 74],
      keys: [[0, {}], ...everyStride([[0.5, { r: 46, y: -3 }, 'inOut'], [1, { r: 0, y: 0 }, 'inOut']])],
    },
    {
      draw: (dr) => {
        line(dr, 'M57 48L50 57L55 64', INK, 3);
        line(dr, 'M103 44L111 48L113 39', INK, 3);
        placed(dr, 80, 50, -8, 1, () => keycap(dr, 46, CREAM, 'Ç'));
      },
      pivot: [80, 52],
      keys: [[0, {}], ...everyStride([[0.5, { y: -3, r: 2.5 }, 'out'], [1, { y: 0, r: 0 }, 'in']])],
    },
  ],
};

// ───────────────────────────────────────────────────────────── the memory thief

const DUSK = '#2b2456';
const FOX = '#ee8436';
const FUR = '#fbe9cf';
const BROWN = '#5a372b';

/** The sack over his shoulder, and the word he took showing out of the top of it. */
function sack(dr: Drawing): void {
  placed(dr, 31, 49, -16, 1, () => {
    form(dr, rr(-12, -6.5, 24, 13, 3.4), tones(GOLD), 2, 1.4);
    line(dr, 'M-6.4 0H6.4', WHITE, 2.4);
  });
  form(dr, smooth([[22, 62], [34, 52], [48, 54], [56, 68], [54, 86], [42, 94], [26, 92], [18, 78]]), tones('#cfa46c'), 3, 2.2);
  line(dr, 'M46 56C49 53 52 53 55 55', tint('#cfa46c', -0.4), 2.4);
}

function foxTail(dr: Drawing): void {
  form(dr, smooth([[58, 86], [46, 90], [30, 100], [20, 110], [34, 114], [52, 108], [64, 96]]), tones(FOX), 2, 2);
  fill(dr, smooth([[30, 100], [20, 110], [31, 113.6], [35, 106]]), FUR);
}

function foxBody(dr: Drawing): void {
  // his legs, on the tips of his toes
  line(dr, 'M63 88L59 100L54 104', BROWN, 5.4);
  line(dr, 'M76 88L81 99L87 102', BROWN, 5.4);
  // the striped jersey
  const jersey = rr(53, 58, 30, 34, 12);
  form(dr, jersey, CREAM, 3, 2);
  inside(dr, jersey, () => {
    for (let y = 63; y < 96; y += 9) fill(dr, `M50 ${n(y)}H86V${n(y + 4.4)}H50Z`, INK);
  });
}

function foxHead(dr: Drawing): void {
  // the ears, and the dark of them
  form(dr, smooth([[55, 32, 1], [53, 11, 1], [69, 25, 1]]), tones(FOX), 1.6, 1.6);
  form(dr, smooth([[71, 25, 1], [84, 10, 1], [88, 32, 1]]), tones(FOX), 1.6, 1.6);
  fill(dr, smooth([[57.6, 27, 1], [56.6, 17, 1], [64, 24, 1]]), BROWN);
  fill(dr, smooth([[76, 23.4, 1], [83, 16, 1], [84.6, 27, 1]]), BROWN);
  // the head, the long snout out to the right, and the pale of his cheek
  const head = smooth([[52, 42], [56, 29], [70, 23], [84, 28], [90, 38], [104, 46, 1], [90, 54], [72, 58], [58, 53]]);
  form(dr, head, tones(FOX), 3, 2.2);
  inside(dr, head, () => fill(dr, smooth([[66, 49], [82, 44.6], [106, 45], [100, 58], [70, 62]]), FUR));
  fill(dr, oval(102.6, 45.6, 3.2, 2.8), INK);
  // the mask, and the eye that keeps watch through it
  inside(dr, head, () => fill(dr, smooth([[50, 37], [64, 31.6], [80, 32], [93, 37.4], [91, 43], [78, 42], [64, 43.4], [52, 45]]), INK));
  fill(dr, smooth([[75.6, 38.4, 1], [80, 35.2], [85, 38, 1], [80.4, 40]]), WHITE);
  fill(dr, ring(81.6, 37.8, 1.5), INK);
  // the cap pulled down over his brow
  const cap = smooth([[54, 31], [58, 20], [70, 15], [82, 19], [87, 30], [70, 26.4]]);
  form(dr, cap, tones('#5b4a94'), 1.4, 1.8);
  line(dr, 'M55 31C64 25.6 77 25.4 87 30.4', '#8b7cc4', 3.4);
}

function foxTorch(dr: Drawing): void {
  // the arm he holds it out on, and the torch in his paw
  line(dr, 'M74 68L84 74L92 73', FOX, 6.4);
  form(dr, rr(90, 68.4, 15, 8.4, 3), tones(STEEL), 1.2, 1.2);
  fill(dr, rr(103, 66.4, 4.4, 12.4, 1.6), tint(STEEL, -0.3));
  fill(dr, ring(91.6, 73, 3.6), FUR);
}

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
 * his sack, three careful steps under the moon — and then he stops, lifts his
 * head, and swings the torch round at a noise that was nothing.
 */
const thief: Cover = {
  title: GAME_NAMES['memory-thief'],
  loopMs: 6400,
  parts: [
    {
      draw: (dr) => {
        ground(dr, DUSK);
        // the moon, two stars, and the rise he creeps along
        dab(dr, 20, 21, 10, 10, '#f6ead6', 0);
        fill(dr, ring(23.4, 24, 2.2), '#e4d3b3');
        fill(dr, sparkle(48, 12, 3.2), '#f6ead6');
        fill(dr, sparkle(108, 22, 2.6), '#f6ead6');
        fill(dr, 'M0 108C40 100 80 100 120 108V120H0Z', tint(DUSK, -0.3));
      },
    },
    {
      // the light of the torch, thrown ahead of him
      draw: (dr) => {
        fill(dr, 'M107 67L124 48V98L107 78Z', '#ffe58f', ' fill-opacity="0.7"');
        fill(dr, 'M107 70L124 60V86L107 76Z', '#fff6d6', ' fill-opacity="0.85"');
      },
      pivot: [105, 72.6],
      keys: creeps(0, 2.2, [[0.66, {}, 'hold'], [0.72, { r: -12 }, 'out'], [0.84, {}, 'hold'], [0.92, { r: 0 }, 'inOut']]),
    },
    { draw: foxTail, pivot: [60, 90], keys: creeps(0.04, 2.6, [[0.66, {}, 'hold'], [0.72, { r: 6 }, 'out'], [0.84, {}, 'hold'], [0.92, { r: 0 }, 'inOut']]) },
    { draw: sack, pivot: [50, 60], keys: creeps(0.03, 3.4) },
    { draw: foxBody, keys: creeps(0, 2.2) },
    { draw: foxTorch, pivot: [74, 68], keys: creeps(0, 2.2) },
    { draw: foxHead, pivot: [68, 54], keys: creeps(0.015, 2.6, [[0.64, {}, 'hold'], [0.69, { y: -2.4, r: -4 }, 'out'], [0.84, {}, 'hold'], [0.92, { y: 0, r: 0 }, 'inOut']]) },
  ],
};

// ───────────────────────────────────────────────────────────── the detective

const MIST = '#d3e8f7';
const HOUND = '#c98b4e';
const HOUND_DEEP = '#8b5a33';
const TWEED = '#7da36b';

/** A paw print about a point: the pad and its four toes. */
function pawPrint(dr: Drawing, cx: number, cy: number, k: number, hex: string, turn = 0): void {
  placed(dr, cx, cy, turn, k, () => {
    fill(dr, smooth([[0, -1.6], [3.6, 0.8], [3.2, 4], [0, 4.8], [-3.2, 4], [-3.6, 0.8]]), hex);
    for (const [x, y] of [[-4.2, -3], [-1.5, -5.4], [1.5, -5.4], [4.2, -3]] as const) fill(dr, oval(x, y, 1.3, 1.6), hex);
  });
}

function houndCoat(dr: Drawing): void {
  // the cape of his coat, and its check
  const cape = smooth([[42, 126], [46, 100], [60, 88], [82, 86], [98, 96], [104, 126]]);
  form(dr, cape, tones(TWEED), 0, 2.2);
  inside(dr, cape, () => {
    const check = tint(TWEED, -0.26);
    for (const x of [56, 70, 84, 98]) line(dr, `M${x} 80V126`, check, 1.5);
    for (const y of [98, 110]) line(dr, `M38 ${y}H108`, check, 1.5);
  });
  line(dr, 'M60 89C66 96 76 96 82 87', tint(TWEED, -0.4), 2.2);
}

function houndHead(dr: Drawing): void {
  // the long ear hangs behind, the skull, and the muzzle out to the left
  form(dr, smooth([[80, 36], [92, 40], [97, 60], [92, 78], [83, 76], [78, 58]]), tones(HOUND_DEEP), 2, 1.8);
  form(dr, oval(72, 50, 20, 19), tones(HOUND), 3, 2.4);
  form(dr, rr(31, 46, 46, 20, 10), tones(tint(HOUND, 0.3)), 2.4, 2);
  fill(dr, oval(34.6, 51.6, 4.6, 3.8), INK);
  line(dr, 'M37 61C44 65 52 65 59 61', HOUND_DEEP, 1.7);
  pupil(dr, 62, 48.4, 3.1);
}

function houndCap(dr: Drawing): void {
  // the deerstalker: a peak before and behind, the crown, and the flaps tied in a bow on top
  form(dr, smooth([[57, 37], [46, 37.6], [40, 41.6], [50, 42.4], [60, 40.4]]), tones(tint(TWEED, -0.14)), 1.4, 1.4);
  form(dr, smooth([[88, 37], [99, 40], [103, 45], [93, 44], [86, 40.6]]), tones(tint(TWEED, -0.14)), 1.4, 1.4);
  const crown = smooth([[53, 39], [56, 24], [72, 17], [88, 24], [92, 39], [72, 35]]);
  form(dr, crown, tones(TWEED), 1.6, 2);
  inside(dr, crown, () => {
    const check = tint(TWEED, -0.26);
    for (const x of [62, 72, 82]) line(dr, `M${x} 14V42`, check, 1.4);
    line(dr, 'M50 29C62 25 82 25 94 29', check, 1.4);
  });
  form(dr, oval(66.6, 16.6, 4.6, 3), tones(tint(TWEED, -0.14)), 0.8, 1);
  form(dr, oval(77.4, 16.6, 4.6, 3), tones(tint(TWEED, -0.14)), 0.8, 1);
  fill(dr, ring(72, 17, 2.3), tint(TWEED, -0.34));
}

/** The glass he holds over the trail, and the print it has found, large in it. */
function houndGlass(dr: Drawing): void {
  line(dr, 'M45 99L63 104', '#a9693a', 5.6);
  fill(dr, ring(64, 104, 5), tint(HOUND, 0.3));
  form(dr, ring(31, 94, 16), tones(NIGHT), 2.4, 2);
  fill(dr, ring(31, 94, 12), '#f3fbff');
  pawPrint(dr, 31, 95, 1.5, HOUND_DEEP, -18);
  line(dr, 'M22.6 89C23.6 86.4 25.6 84.6 28.2 83.8', WHITE, 1.8);
}

/**
 * The detective: a hound in a deerstalker, following a trail of prints. He
 * moves the glass along it, finds nothing — and then one print, large in the
 * glass, and his ear lifts.
 */
const detective: Cover = {
  title: GAME_NAMES.detective,
  loopMs: 6200,
  parts: [
    {
      draw: (dr) => {
        ground(dr, MIST);
        // the trail, leading off the way he is looking
        const trail = tint(MIST, -0.2);
        pawPrint(dr, 9, 112, 0.9, trail, -30);
        pawPrint(dr, 14, 70, 0.9, trail, 14);
        pawPrint(dr, 8, 40, 0.8, trail, -8);
      },
    },
    { draw: houndCoat },
    { draw: houndHead, pivot: [74, 62], keys: [[0, {}], [0.5, {}, 'hold'], [0.56, { r: -3 }, 'out'], [0.84, {}, 'hold'], [0.92, { r: 0 }, 'inOut'], [1, {}, 'hold']] },
    { draw: houndCap, pivot: [74, 62], keys: [[0, {}], [0.5, {}, 'hold'], [0.56, { r: -3 }, 'out'], [0.84, {}, 'hold'], [0.92, { r: 0 }, 'inOut'], [1, {}, 'hold']] },
    {
      draw: houndGlass,
      pivot: [60, 104],
      keys: [[0, {}], [0.06, {}, 'hold'], [0.18, { x: 4, y: -20, r: 8 }, 'inOut'], [0.3, {}, 'hold'], [0.42, { x: 0, y: 0, r: 0 }, 'inOut'], [0.5, { s: 1.07 }, 'out'], [0.58, { s: 1 }, 'inOut'], [1, {}, 'hold']],
    },
  ],
};

// ───────────────────────────────────────────────────────────── the last letter

const GRAPE = '#7c64d4';
/** How big a tile of the chain is, and how far apart two of them stand. */
const LINK = 25;
const STEP = 28;
/**
 * The chain, tile by tile: şêr, a lion; roj, the sun, which starts where
 * şêr ended; jin, which starts where roj did, and runs off the picture. Each
 * with the column and row it stands at, and whether two words share it.
 */
const CHAIN: ReadonlyArray<readonly [string, number, number, boolean]> = [
  ['Ş', 0, 0, false],
  ['Ê', 1, 0, false],
  ['R', 2, 0, true],
  ['O', 2, 1, false],
  ['J', 2, 2, true],
  ['I', 3, 2, false],
  ['N', 4, 2, false],
];
const linkAt = (col: number, row: number): readonly [number, number] => [5 + col * STEP, 10 + row * STEP];
function link(dr: Drawing, i: number): void {
  const [ch, col, row, shared] = CHAIN[i]!;
  const [x, y] = linkAt(col, row);
  tile(dr, x, y, LINK, shared ? tones(GOLD) : CREAM, ch, INK);
}
/** A tile set down at `at`, and a small jump as the chain is read through from its place in it. */
const laid = (i: number): Key[] => {
  const [down, read] = [0.1 + i * 0.07, 0.68 + i * 0.03];
  return [[0, {}], [0.04, {}, 'hold'], [0.07, { s: 0.5, o: 0 }, 'in'], [down, {}, 'hold'], [down + 0.07, { s: 1, o: 1 }, 'back'], [read, {}, 'hold'], [read + 0.04, { y: -3 }, 'out'], [read + 0.09, { y: 0 }, 'in'], [1, {}, 'hold']];
};

/**
 * The last letter: a chain of words laid like a crossword, each beginning on
 * the last letter of the one before, the shared letters in gold. Two birds
 * play it, one word each.
 */
const lastLetter: Cover = {
  title: GAME_NAMES['last-letter'],
  loopMs: 6000,
  parts: [
    {
      draw: (dr) => {
        ground(dr, GRAPE);
        fill(dr, sparkle(101, 20, 5), tint(GRAPE, 0.5));
        fill(dr, sparkle(16, 58, 3.4), tint(GRAPE, 0.5));
      },
    },
    ...CHAIN.map((entry, i): Part => {
      const [x, y] = linkAt(entry[1], entry[2]);
      return { draw: (dr) => link(dr, i), pivot: [Math.min(120, x + LINK / 2), y + LINK / 2], keys: laid(i) };
    }),
    { draw: (dr) => placed(dr, 30, 89, 0, 0.92, () => bird(dr, BLUE, 'looks')), pivot: [30, 108], keys: [[0, {}], ...hops(0.3), [1, {}, 'hold']] },
    { draw: (dr) => placed(dr, 101, 47, 0, -0.8, () => bird(dr, SUN, 'looks'), 0.8), pivot: [101, 64], keys: [[0, {}], ...hops(0.52), [1, {}, 'hold']] },
  ],
};

// ───────────────────────────────────────────────────────────── the impostor

const LILAC = '#c4b3f1';
const FACE = '#f0d2bd';

/** One of the open cards of the hand, standing upright at the foot of the fan: the game's own. */
function openCard(dr: Drawing): void {
  form(dr, rr(46, 86, 28, 42, 6), CREAM, 3.4, 2.2);
  dab(dr, 60, 104, 6, 6, GOLD, 1.8);
}
const FAN = [-38, -13, 13, 38] as const;
const FAN_FOOT = [60, 152] as const;

function stranger(dr: Drawing): void {
  // the coat, and its collar turned up
  form(dr, smooth([[20, 126], [24, 98], [40, 86], [60, 83], [80, 86], [96, 98], [100, 126]]), tones(NIGHT), 0, 2.2);
  fill(dr, smooth([[42, 87, 1], [45, 71, 1], [58, 92, 1]]), tint(NIGHT, 0.16));
  fill(dr, smooth([[78, 87, 1], [75, 71, 1], [62, 92, 1]]), tint(NIGHT, 0.16));
  // the face, what the mask leaves of it
  form(dr, oval(60, 62, 16, 18), tones(FACE), 1, 2);
  line(dr, 'M55 73C58 75 62 75 65 73', tint(FACE, -0.42), 1.6);
}
/** The mask of the game, worn, and the eyes behind it looking to one side. */
function strangerMask(dr: Drawing): void {
  impostorMask(dr, 60, 60, 0.74, GOLD);
  for (const x of [53.8, 66.2]) fill(dr, oval(x, 56.7, 3.2, 2.3), WHITE);
}
function strangerEyes(dr: Drawing): void {
  for (const x of [52.6, 65]) fill(dr, ring(x, 56.8, 1.7), INK);
}
function strangerHat(dr: Drawing): void {
  form(dr, oval(60, 46, 29, 6.4), tones(tint(NIGHT, -0.16)), 1.6, 1.6);
  const crown = smooth([[42, 46], [44, 28], [52, 19], [60, 22], [68, 19], [76, 28], [78, 46], [60, 49]]);
  form(dr, crown, tones(tint(NIGHT, -0.16)), 0, 2);
  inside(dr, crown, () => fill(dr, 'M38 37H82V44.6H38Z', GOLD));
}

/**
 * The impostor: a hand of open cards, every one alike, and behind it a
 * stranger in the game's own mask who does not have the word. His eyes go
 * from one side to the other; the brim comes down; the cards close a little
 * and open again.
 */
const impostor: Cover = {
  title: GAME_NAMES.impostor,
  loopMs: 5600,
  parts: [
    {
      draw: (dr) => {
        ground(dr, LILAC);
        stranger(dr);
        strangerMask(dr);
      },
    },
    {
      draw: strangerEyes,
      keys: [[0, {}], [0.1, {}, 'hold'], [0.13, { x: 2.4 }, 'out'], [0.34, {}, 'hold'], [0.37, { x: 0 }, 'out'], [0.52, {}, 'hold'], [0.55, { x: 2.4 }, 'out'], [0.66, {}, 'hold'], [0.69, { x: 0 }, 'out'], [1, {}, 'hold']],
    },
    { draw: strangerHat, pivot: [60, 48], keys: [[0, {}], [0.7, {}, 'hold'], [0.76, { y: 2.2, r: -3 }, 'out'], [0.86, {}, 'hold'], [0.93, { y: 0, r: 0 }, 'inOut'], [1, {}, 'hold']] },
    ...FAN.map(
      (angle, i): Part => ({
        draw: (dr) => turned(dr, angle, FAN_FOOT[0], FAN_FOOT[1], () => openCard(dr)),
        pivot: [FAN_FOOT[0], 120],
        // the outer cards lean in first, the inner ones after them
        keys: [[0, {}], [0.2 + (i === 0 || i === 3 ? 0 : 0.03), {}, 'hold'], [0.3, { r: -angle * 0.3 }, 'inOut'], [0.44, {}, 'hold'], [0.56, { r: 0 }, 'back'], [1, {}, 'hold']],
      }),
    ),
  ],
};

// ───────────────────────────────────────────────────────────── who am I?

const LEAF = '#cdeed7';
const HIDDEN = '#1f6a50';
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

/** The note on his forehead: a square of yellow paper, a corner of it curling, and the question on it. */
function stickyNote(dr: Drawing): void {
  placed(dr, 60, 50, -5, 1, () => {
    const paper = 'M-15 -15H15V8L8 15H-15Z';
    form(dr, paper, tones(NOTE), 2.4, 1.6);
    fill(dr, 'M15 8L8 15V8Z', tint(NOTE, -0.24));
    write(dr, '?', -letterWidth(17) / 2, -9.4, 17, INK, 3.4);
  });
}

/** One of the two answers the table gives: a round counter with its sign in white. */
function answer(dr: Drawing, cx: number, yes: boolean): void {
  dab(dr, cx, 102, 9.4, 9.4, yes ? GREEN : RED, 2.6);
  line(dr, yes ? `M${n(cx - 4)} 102.4L${n(cx - 1.2)} 105.2L${n(cx + 4.2)} 99` : `M${n(cx - 3.2)} 98.8L${n(cx + 3.2)} 105.2M${n(cx + 3.2)} 98.8L${n(cx - 3.2)} 105.2`, WHITE, 2.4);
}
/** An answer being given: its counter swells and settles. */
const answers = (...at: number[]): Key[] => [[0, {}], ...at.flatMap((t): Key[] => [[t, {}, 'hold'], [t + 0.04, { s: 1.3 }, 'out'], [t + 0.11, { s: 1 }, 'inOut']]), [1, {}, 'hold']];

/**
 * Who am I?: Hevalo as a shadow, with a note on his forehead that everyone
 * can read but him. A draught lifts its corner, and the table answers his
 * questions: yes on one side, no on the other.
 */
const whoAmI: Cover = {
  title: GAME_NAMES['who-am-i'],
  loopMs: 5200,
  parts: [
    {
      draw: (dr) => {
        ground(dr, LEAF);
        hiddenDeer(dr);
      },
    },
    {
      draw: stickyNote,
      // it is stuck along its top edge, and turns about that
      pivot: [60, 35],
      keys: [[0, {}], [0.08, {}, 'hold'], [0.14, { r: 6, sy: 0.96 }, 'out'], [0.22, { r: -3.5, sy: 1 }, 'inOut'], [0.28, { r: 2 }, 'inOut'], [0.34, { r: 0 }, 'inOut'], [1, {}, 'hold']],
    },
    { draw: (dr) => answer(dr, 16, true), pivot: [16, 102], keys: answers(0.44, 0.78) },
    { draw: (dr) => answer(dr, 104, false), pivot: [104, 102], keys: answers(0.6) },
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
