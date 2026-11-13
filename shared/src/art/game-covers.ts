/**
 * The games' covers: one picture for each game on Learn's Games page.
 *
 * They are cut-outs (cutout.ts), the family the cards of Letters and words,
 * Impostor's categories and the emails' pictures are drawn in, so a game's
 * cover sits beside the rest of Hevalo as one of its own: a few objects a
 * child would know — letter tiles, two songbirds, a stopwatch, an open book,
 * a magnifying glass, a hand of cards — in flat colour, lit from the upper
 * left, each with a sliver of light along its upper rim and its thickness
 * showing as a darker band below it. Nothing is outlined; a line is only ever
 * a letter, a stalk or a leg. The few eyes there are, are dots.
 *
 * One idea a cover, on a ground of the game's own colour with a paler disc
 * behind what matters, and as few things as tell the game: Peyvok's board
 * scored by the real rules, two birds whose words end alike, the stopwatch a
 * race is run against, words lifted off a page at night, the clue under the
 * glass, a chain of words that each begin on the last letter of the one
 * before, the masked card in a hand of open ones, and Hevalo as a shadow with
 * a word on his forehead. What is written is Kurdish from the first lessons,
 * so a cover is the same picture in every language the app speaks.
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
import { songbird } from './songbird.js';
import { letter, letterWidth, oval } from './ink.js';
import { Drawing, n, tint } from './svg.js';

// ───────────────────────────────────────────────────────────── the colours

/** The deep tone letters, eyes and legs are drawn in, as on Impostor's pictures: never black. */
const INK = '#3a2b4d';
const WHITE = '#ffffff';
const RED = '#d8493b';
const GOLD = '#f2b632';
const GREEN = '#3fa45b';
const BLUE = '#3d8bd9';
const STEEL = '#9aa5b4';
const NIGHT = '#3b2f63';
const BROWN = '#a8683a';
const CREAM: Tones = { light: '#fffaf1', base: '#f6ead6', shade: '#cdb898' };
const WOOD: Tones = { light: '#f3cf9c', base: '#dba869', shade: '#a2733c' };
/** The grey of a line of writing on cream paper. */
const WRITING = '#d9c8aa';

/** A colour as a form's three tones. */
const tones = (hex: string): Tones => ({ light: tint(hex, 0.32), base: hex, shade: tint(hex, -0.32) });

// ───────────────────────────────────────────────────────────── the pen

const fill = (dr: Drawing, d: string, hex: string, more = ''): void => {
  dr.add(`<path d="${d}" fill="${hex}"${more}/>`);
};
const line = (dr: Drawing, d: string, hex: string, width: number, more = ''): void => {
  dr.add(`<path d="${d}" fill="none" stroke="${hex}" stroke-width="${n(width)}" stroke-linecap="round" stroke-linejoin="round"${more}/>`);
};
const dot = (dr: Drawing, cx: number, cy: number, r: number, hex: string): void => {
  dr.add(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${hex}"/>`);
};
/**
 * Every cover's first part: the whole square in the game's colour, a paler
 * disc behind what matters, and the soft shadow the picture stands on.
 */
function ground(dr: Drawing, hex: string, disc: readonly [number, number, number], floor?: readonly [number, number, number, number]): void {
  fill(dr, 'M0 0H120V120H0Z', hex);
  fill(dr, ring(...disc), tint(hex, 0.24));
  if (floor) dr.add(`<ellipse cx="${n(floor[0])}" cy="${n(floor[1])}" rx="${n(floor[2])}" ry="${n(floor[3])}" fill="${tint(hex, -0.14)}"/>`);
}
/** A letter, drawn with an even line. */
const write = (dr: Drawing, ch: string, x: number, y: number, height: number, hex: string, weight: number): void => dr.add(letter(ch, x, y, height, hex, weight));

/** What `draw` adds, moved to (x, y), turned by `angle` degrees and scaled by (kx, ky) about its own origin. */
function placed(dr: Drawing, x: number, y: number, angle: number, kx: number, draw: () => void, ky = Math.abs(kx)): void {
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

/** A four-pointed glint about a point, its arms `r` long. */
function glint(dr: Drawing, cx: number, cy: number, r: number, hex: string): void {
  const k = r * 0.16;
  fill(
    dr,
    `M${n(cx)} ${n(cy - r)}C${n(cx + k)} ${n(cy - k * 2.6)} ${n(cx + k * 2.6)} ${n(cy - k)} ${n(cx + r)} ${n(cy)}` +
      `C${n(cx + k * 2.6)} ${n(cy + k)} ${n(cx + k)} ${n(cy + k * 2.6)} ${n(cx)} ${n(cy + r)}` +
      `C${n(cx - k)} ${n(cy + k * 2.6)} ${n(cx - k * 2.6)} ${n(cy + k)} ${n(cx - r)} ${n(cy)}` +
      `C${n(cx - k * 2.6)} ${n(cy - k)} ${n(cx - k)} ${n(cy - k * 2.6)} ${n(cx)} ${n(cy - r)}Z`,
    hex,
  );
}

/** The letters with a hat stand a little low on a tile and the ones with a tail a little high, so that each sits in the middle of its tile to the eye. */
const HATTED = 'ÊÎÛ';
const TAILED = 'ÇŞ';
const nudge = (ch: string, height: number): number => (HATTED.includes(ch) ? height * 0.17 : TAILED.includes(ch) ? -height * 0.16 : 0);

/**
 * A letter tile, as the alphabet's blocks are: a rounded square standing on
 * its edge, its letter in the middle of its face. `ink` is the letter's colour.
 */
function tile(dr: Drawing, x: number, y: number, size: number, face: Tones, ch: string | null, ink: string, drop = size * 0.13): void {
  form(dr, rr(x, y, size, size, size * 0.24), face, drop, size * 0.06);
  if (ch === null) return;
  const h = size * 0.52;
  write(dr, ch, x + (size - letterWidth(h)) / 2, y + (size - h) / 2 + nudge(ch, h), h, ink, size * 0.115);
}

/** A part popping in at `start` from nothing, after leaving soon after the loop begins. */
const popsIn = (start: number, gone = 0.04): Key[] => [[0, {}], [gone, {}, 'hold'], [gone + 0.04, { s: 0.6, o: 0 }, 'in'], [start, {}, 'hold'], [start + 0.08, { s: 1, o: 1 }, 'back'], [1, {}, 'hold']];

// ───────────────────────────────────────────────────────────── Peyvok

const MEADOW = '#8fd6a6';
const MARK = { gray: STEEL, yellow: GOLD, green: GREEN } as const;
/** A game that ends on `heval`, friend, scored by the real rules: the guesses the app's front page shows. */
const GUESSES: ReadonlyArray<readonly [string, ReadonlyArray<keyof typeof MARK>]> = [
  ['DAYIK', ['gray', 'yellow', 'gray', 'gray', 'gray']],
  ['SILAV', ['gray', 'gray', 'yellow', 'green', 'yellow']],
  ['HEVAL', ['green', 'green', 'green', 'green', 'green']],
];
/** A square of the board, and where each one is on the card. */
const SQUARE = 16.4;
const squareAt = (c: number, r: number): readonly [number, number] => [15 + c * 18.6, 32 + r * 18.6];

/** One square of a guess: its mark's colour, its letter in white. */
function guessed(dr: Drawing, c: number, r: number): void {
  const [x, y] = squareAt(c, r);
  const [word, marks] = GUESSES[r]!;
  tile(dr, x, y, SQUARE, tones(MARK[marks[c]!]), word[c]!, WHITE, 2);
}

/** When each square of the last guess turns over. */
const turnsAt = (c: number): number => 0.2 + c * 0.075;

/**
 * Peyvok: the board on a card of cream paper, three guesses on it. The first
 * two are scored grey and yellow and green; the third turns over square by
 * square, every one of them green: heval, friend. Then the row bows.
 */
const peyvok: Cover = {
  title: GAME_NAMES.peyvok,
  loopMs: 5600,
  parts: [
    {
      draw: (dr) => {
        ground(dr, MEADOW, [60, 60, 52], [60, 102, 46, 5]);
        form(dr, rr(8, 24, 104, 74, 13), CREAM, 4.4, 2.4);
        for (let r = 0; r < 2; r++) for (let c = 0; c < 5; c++) guessed(dr, c, r);
        // where the last guess lies before it turns over: the squares still to be filled
        for (let c = 0; c < 5; c++) fill(dr, rr(...squareAt(c, 2), SQUARE, SQUARE, SQUARE * 0.24), tint(CREAM.shade, 0.42));
      },
    },
    ...[0, 1, 2, 3, 4].map((c): Part => {
      const [x, y] = squareAt(c, 2);
      const bows = 0.7 + c * 0.035;
      return {
        draw: (dr) => guessed(dr, c, 2),
        pivot: [x + SQUARE / 2, y + SQUARE / 2],
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
  ],
};

// ───────────────────────────────────────────────────────────── the rhyme

const ROSE = '#f6a6c1';
/** The colour of the ending the two words share. */
const RHYME = '#c4417a';
/** Where the bough is under each bird's feet. */
const PERCH = 90;

/** A bubble's outline: a rounded card with a short tail that leaves its foot at `from` and points at (toX, toY). */
function bubble(x: number, y: number, w: number, h: number, from: number, toX: number, toY: number): string {
  const [r, b, k] = [x + w, y + h, 9];
  return (
    `M${n(x + k)} ${n(y)}H${n(r - k)}A${k} ${k} 0 0 1 ${n(r)} ${n(y + k)}V${n(b - k)}A${k} ${k} 0 0 1 ${n(r - k)} ${n(b)}` +
    `H${n(from + 4.4)}L${n(toX)} ${n(toY)}L${n(from - 4.4)} ${n(b)}H${n(x + k)}A${k} ${k} 0 0 1 ${n(x)} ${n(b - k)}V${n(y + k)}A${k} ${k} 0 0 1 ${n(x + k)} ${n(y)}Z`
  );
}

/** What a bird sings, on a card of paper: the word's own first letter, and the ending in the rhyme's colour. */
function sung(dr: Drawing, x: number, y: number, word: string, from: number, toX: number, toY: number): void {
  const [w, h] = [40, 23];
  form(dr, bubble(x, y, w, h, from, toX, toY), CREAM, 2.6, 1.8);
  const size = 11.6;
  const step = letterWidth(size) + 2.8;
  const left = x + (w - (step * word.length - 2.8)) / 2;
  [...word].forEach((ch, i) => write(dr, ch, left + i * step, y + (h - size) / 2, size, i === 0 ? INK : RHYME, 2.6));
}

/** A bird singing at `start`: it crouches, lifts as the note goes out, and settles. */
const sings = (start: number): Key[] => [[start, {}, 'hold'], [start + 0.03, { sy: 0.92, sx: 1.05 }, 'in'], [start + 0.08, { y: -3.6, sy: 1.05, sx: 0.97, r: -4 }, 'out'], [start + 0.16, { y: 0, s: 1, r: 0 }, 'in']];

/**
 * Rhyme: two songbirds on a bough. One sings dar, a tree; the other answers
 * kar, work — and the ending the two words share is written in one colour.
 */
const rhyme: Cover = {
  title: GAME_NAMES.rhyme,
  loopMs: 5600,
  parts: [
    {
      draw: (dr) => {
        ground(dr, ROSE, [60, 62, 50]);
        // the bough, from edge to edge, and its leaves
        form(dr, 'M-4 90C24 85 44 88 62 89.5C82 91 100 86 124 82V91C100 95 82 98.6 62 97.6C42 96.6 22 94 -4 98Z', WOOD, 2.6, 1.4);
        form(dr, 'M14 95C10 102 12 108 18 111C22 106 21 99 14 95Z', tones(GREEN), 1.6, 1.2);
        form(dr, 'M104 88C108 95 114 97 119 95C117 89 111 86 104 88Z', tones(GREEN), 1.6, 1.2);
        form(dr, 'M52 97C50 103 53 107 58 108C60 103 57 99 52 97Z', tones(tint(GREEN, 0.12)), 1.4, 1);
      },
    },
    { draw: (dr) => placed(dr, 30, PERCH, 0, 1.05, () => songbird(dr, BLUE, 1)), pivot: [30, PERCH], keys: [[0, {}], ...sings(0.1), [1, {}, 'hold']] },
    { draw: (dr) => placed(dr, 90, PERCH - 0.8, 0, -1.05, () => songbird(dr, GOLD, -1)), pivot: [90, PERCH], keys: [[0, {}], ...sings(0.42), [1, {}, 'hold']] },
    { draw: (dr) => sung(dr, 10, 20, 'DAR', 36, 42, 50), pivot: [38, 48], keys: popsIn(0.12) },
    { draw: (dr) => sung(dr, 70, 28, 'KAR', 86, 80, 58), pivot: [84, 56], keys: popsIn(0.44) },
  ],
};

// ───────────────────────────────────────────────────────────── the typing race

const APRICOT = '#f7a35c';
/** The stopwatch's middle, and how big its face is. */
const WATCH = [64, 62] as const;
const FACE = 26;

/** A key off a keyboard, its upper left at (x, y): a cap on a deep side, and its letter. */
function keycap(dr: Drawing, x: number, y: number, size: number, ch: string): void {
  form(dr, rr(x, y, size, size * 0.94, size * 0.22), CREAM, size * 0.2, size * 0.06);
  const h = size * 0.5;
  write(dr, ch, x + (size - letterWidth(h)) / 2, y + (size * 0.94 - h) / 2 + nudge(ch, h), h, INK, size * 0.105);
}

/** The stopwatch without its hand: its crown and side button, its case, its face and the marks round it. */
function stopwatch(dr: Drawing): void {
  const [cx, cy] = WATCH;
  form(dr, rr(cx - 4, cy - FACE - 15, 8, 9, 2), tones(STEEL), 0, 1);
  form(dr, rr(cx - 8, cy - FACE - 19, 16, 7, 3.4), tones(RED), 1.6, 1.2);
  turned(dr, 45, cx, cy, () => form(dr, rr(cx - 3.4, cy - FACE - 12, 6.8, 8, 2.4), tones(STEEL), 1.2, 1));
  form(dr, ring(cx, cy, FACE + 6), tones(RED), 4, 2.2);
  fill(dr, ring(cx, cy, FACE), CREAM.light);
  // the face's own shade, along its upper left: it sits a little below the case
  inside(dr, ring(cx, cy, FACE), () => fill(dr, ring(cx + 2.6, cy + 2.6, FACE), CREAM.base));
  for (let k = 0; k < 12; k++) {
    const a = (k * Math.PI) / 6;
    const [r0, r1] = k % 3 === 0 ? [FACE - 7, FACE - 2.6] : [FACE - 4.6, FACE - 2.6];
    line(dr, `M${n(cx + Math.sin(a) * r0)} ${n(cy - Math.cos(a) * r0)}L${n(cx + Math.sin(a) * r1)} ${n(cy - Math.cos(a) * r1)}`, k % 3 === 0 ? INK : CREAM.shade, k % 3 === 0 ? 2.2 : 1.6);
  }
}

/** The hand, pointing at the top, and the pin it turns on. */
function watchHand(dr: Drawing): void {
  const [cx, cy] = WATCH;
  line(dr, `M${n(cx)} ${n(cy + 4)}V${n(cy - FACE + 6)}`, RED, 2.6);
  dot(dr, cx, cy, 3.4, RED);
  dot(dr, cx, cy, 1.3, CREAM.light);
}

/** A key typed `times` times, quickly, from `start` on. */
const typed = (start: number, times: number, gap: number): Key[] =>
  Array.from({ length: times }, (_, k): Key[] => {
    const t = start + k * gap;
    return [[t, {}, 'hold'], [t + 0.025, { y: 2.6, sy: 0.9 }, 'in'], [t + 0.07, { y: 0, sy: 1 }, 'back']];
  }).flat();

/**
 * The typing race: a stopwatch, and two keys either side of it. The watch
 * runs and the keys are typed as fast as they will go; when the race is
 * done the hand flies back to the top for the next one.
 */
const race: Cover = {
  title: GAME_NAMES.race,
  loopMs: 5200,
  parts: [
    {
      draw: (dr) => {
        ground(dr, APRICOT, [64, 60, 50], [62, 103, 44, 5]);
        stopwatch(dr);
      },
    },
    {
      draw: watchHand,
      pivot: WATCH,
      // the hand runs once nearly round, stops on the last key, and is reset
      keys: [[0, {}], [0.06, {}, 'hold'], [0.74, { r: 300 }, 'linear'], [0.8, {}, 'hold'], [0.88, { r: 0 }, 'back'], [1, {}, 'hold']],
    },
    { draw: (dr) => keycap(dr, 6, 72, 28, 'Ê'), pivot: [20, 100], keys: [[0, {}], ...typed(0.1, 4, 0.16), [1, {}, 'hold']] },
    { draw: (dr) => keycap(dr, 88, 80, 25, 'R'), pivot: [100, 106], keys: [[0, {}], ...typed(0.18, 4, 0.16), [1, {}, 'hold']] },
  ],
};

// ───────────────────────────────────────────────────────────── the memory thief

const DARK = '#2e3168';
const MOON = '#f6d36b';
const SACK: Tones = { light: '#e8c896', base: '#c99a62', shade: '#8f6638' };

/** An open book lying on the ground, its pages lined with writing; one word on the right page is gone, leaving its gap. */
function openBook(dr: Drawing): void {
  form(dr, 'M38 103C28 98 14 97 2 99V66C14 64 28 65 38 70C48 65 62 64 74 66V99C62 97 48 98 38 103Z', tones(RED), 3, 0);
  form(dr, 'M38 98C29 93 16 92 5 93.6V63C16 61 29 62 38 67Z', CREAM, 0, 1.8);
  form(dr, 'M38 98C47 93 60 92 71 93.6V63C60 61 47 62 38 67Z', CREAM, 0, 1.8);
  fill(dr, 'M37.4 67V98H38.6V67Z', CREAM.shade);
  for (let k = 0; k < 4; k++) {
    const y = 71 + k * 6.4;
    line(dr, `M9 ${n(y - 1)}L${k === 3 ? 24 : 33} ${n(y + 1.2)}`, WRITING, 2.4);
    // the second line of the right page has lost its middle word
    if (k === 1) line(dr, `M43 ${n(y + 1.2)}L46 ${n(y + 0.6)}M60 ${n(y - 0.6)}L67 ${n(y - 1.4)}`, WRITING, 2.4);
    else line(dr, `M43 ${n(y + 1.2)}L${k === 3 ? 56 : 67} ${n(y - 1.4)}`, WRITING, 2.4);
  }
}

/** The thief's sack: a heavy bag tied at the neck, its cloth flaring open above the cord, and a letter it has already taken showing out of it. */
function sack(dr: Drawing): void {
  dr.add(`<ellipse cx="92" cy="104" rx="22" ry="3.6" fill="${tint(DARK, -0.16)}"/>`);
  form(dr, 'M92 105C76 105 70 99 71 89C72 79 79 73 85.6 69.4H98.4C105 73 112 79 113 89C114 99 108 105 92 105Z', SACK, 0, 2.2);
  // the cloth above the cord, gathered and open: the dark of the mouth, the letter in it, and the near side of the cloth over its foot
  form(dr, 'M86 70C82 66 78 60 79.6 55.6C84 57.4 88 56.8 92 55.4C96 56.8 100 57.4 104.4 55.6C106 60 102 66 98 70Z', SACK, 0, 1.6);
  fill(dr, oval(92, 56.4, 11.4, 2.6), tint(SACK.shade, -0.4));
  placed(dr, 91, 49, -12, 1, () => tile(dr, -7.5, -7.5, 15, tones(GOLD), 'Û', INK, 1.8));
  fill(dr, 'M80.4 56.6C84.4 59.6 88.2 60.2 92 59C95.8 60.2 99.6 59.6 103.6 56.6C102 62 97 64 92 63C87 64 82 62 80.4 56.6Z', SACK.light);
  line(dr, 'M85.4 70.2C89 71.6 95 71.6 98.6 70.2', tint(SACK.shade, -0.2), 2.8);
}

/**
 * The memory thief: night, a crescent moon, and an open book on the grass
 * with a word missing from its page. The word is in the air, on its way into
 * the thief's sack; it goes in, and the next one is lifted off the page.
 */
const thief: Cover = {
  title: GAME_NAMES['memory-thief'],
  loopMs: 5800,
  parts: [
    {
      draw: (dr) => {
        ground(dr, DARK, [60, 64, 52]);
        form(dr, 'M30 12C20 14 14 23 16 33C18 42 27 48 37 46C33 51 26 53 19 51C10 48 4 39 6 29C8 19 18 11 30 12Z', tones(MOON), 0, 1.6);
        glint(dr, 58, 18, 4.6, MOON);
        glint(dr, 108, 30, 3.4, MOON);
        dot(dr, 80, 14, 1.3, MOON);
        dot(dr, 44, 32, 1, MOON);
        openBook(dr);
      },
    },
    { draw: sack, pivot: [92, 105], keys: [[0, {}], [0.46, {}, 'hold'], [0.5, { sy: 0.94, sx: 1.04 }, 'in'], [0.58, { s: 1 }, 'back'], [1, {}, 'hold']] },
    {
      draw: (dr) => placed(dr, 66, 38, 14, 1, () => tile(dr, -8.5, -8.5, 17, CREAM, 'J', INK, 2.2)),
      pivot: [66, 38],
      keys: [
        [0, {}],
        [0.12, {}, 'hold'],
        // into the sack
        [0.3, { x: 25, y: 14, r: 30, s: 0.55, o: 0 }, 'in'],
        // and the next word off the page, from where the gap is
        [0.31, { x: -12, y: 32, r: -14, s: 0.6, o: 0 }, 'hold'],
        [0.58, { x: 0, y: 0, r: 0, s: 1, o: 1 }, 'out'],
        [0.66, { y: -2 }, 'inOut'],
        [0.74, { y: 0 }, 'inOut'],
        [1, {}, 'hold'],
      ],
    },
  ],
};

// ───────────────────────────────────────────────────────────── the detective

const SKY = '#8fcdf0';
const LENS = [66, 60] as const;
const LENS_R = 19;

/** The paper the evidence is on: a few lines of writing, and a paw print where somebody walked over it. */
function evidence(dr: Drawing): void {
  turned(dr, -7, 50, 66, () => {
    form(dr, rr(16, 26, 66, 80, 7), CREAM, 3.6, 2);
    for (let k = 0; k < 3; k++) line(dr, `M24 ${n(36 + k * 7)}H${k === 2 ? 50 : 72}`, WRITING, 2.6);
    line(dr, 'M24 90H50M24 97H40', WRITING, 2.6);
    // the paw, under the glass: four toes and the pad, in the cut-out's own round dabs
    const [px, py] = [66, 70];
    dab(dr, px, py, 8, 6.8, BROWN, 1.4);
    for (const [dx, dy, r] of [[-9.4, -7.8, 3.1], [-3.4, -12.4, 3.4], [3.4, -12.4, 3.4], [9.4, -7.8, 3.1]] as const) dab(dr, px + dx, py + dy, r, r * 1.2, BROWN, 1);
  });
}

/** The magnifying glass: a brass ring with its glass, a glint on it, and a wooden handle running down to the right. */
function magnifier(dr: Drawing): void {
  const [cx, cy] = LENS;
  placed(dr, cx, cy, 45, 1, () => {
    form(dr, rr(LENS_R - 1, -5, 31, 10, 5), WOOD, 2.4, 1.4);
    form(dr, rr(LENS_R - 2, -6.2, 7, 12.4, 2), tones(STEEL), 1.2, 1);
  });
  // the glass lets the paper show through, a little paler
  dr.add(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(LENS_R)}" fill="#ffffff" fill-opacity="0.32"/>`);
  line(dr, `M${n(cx - 11)} ${n(cy - 4)}A12 12 0 0 1 ${n(cx - 4)} ${n(cy - 11)}`, WHITE, 2.6);
  form(dr, `${ring(cx, cy, LENS_R + 4.6)}${ring(cx, cy, LENS_R)}`, tones(GOLD), 2.4, 1.6, true);
}

/**
 * The detective: a page of evidence with a paw print on it, and the glass
 * going over it. It looks along the writing, comes back to the paw, and
 * something glints: found.
 */
const detective: Cover = {
  title: GAME_NAMES.detective,
  loopMs: 5600,
  parts: [
    {
      draw: (dr) => {
        ground(dr, SKY, [56, 60, 52], [52, 106, 40, 4.6]);
        evidence(dr);
      },
    },
    {
      draw: magnifier,
      pivot: LENS,
      keys: [[0, {}], [0.08, {}, 'hold'], [0.24, { x: -30, y: -10, r: -6 }, 'inOut'], [0.36, {}, 'hold'], [0.5, { x: 0, y: 0, r: 0 }, 'back'], [0.58, { s: 1.06 }, 'out'], [0.66, { s: 1 }, 'inOut'], [1, {}, 'hold']],
    },
    { draw: (dr) => glint(dr, 92, 30, 7, WHITE), pivot: [92, 30], keys: [[0, {}], [0.04, { s: 0, o: 0 }, 'in'], [0.56, {}, 'hold'], [0.62, { s: 1.25, o: 1, r: 45 }, 'out'], [0.7, { s: 1, r: 0 }, 'inOut'], [1, {}, 'hold']] },
  ],
};

// ───────────────────────────────────────────────────────────── the last letter

const PERIWINKLE = '#9ba8ee';
const CHAIN_TILE = 20;
const CHAIN_STEP = 22.4;
/**
 * Şêr, roj, jin — a lion, the day, a woman: across, down and across again,
 * each word beginning on the letter the one before ends with, which is
 * written once, where the two meet. `laid` is when a tile is put down; the
 * first word is there from the start.
 */
const CHAIN: ReadonlyArray<{ ch: string; c: number; r: number; meets: boolean; laid?: number }> = [
  { ch: 'Ş', c: 0, r: 0, meets: false },
  { ch: 'Ê', c: 1, r: 0, meets: false },
  { ch: 'R', c: 2, r: 0, meets: true },
  { ch: 'O', c: 2, r: 1, meets: false, laid: 0.26 },
  { ch: 'J', c: 2, r: 2, meets: true, laid: 0.34 },
  { ch: 'I', c: 3, r: 2, meets: false, laid: 0.56 },
  { ch: 'N', c: 4, r: 2, meets: false, laid: 0.64 },
];
const chainAt = (c: number, r: number): readonly [number, number] => [5.2 + c * CHAIN_STEP, 27.6 + r * CHAIN_STEP];

/** A corner nodding at `t`, as the word that begins on it is laid. */
const nods = (t: number): Key[] => [[t, {}, 'hold'], [t + 0.05, { s: 1.16, r: -6 }, 'out'], [t + 0.12, { s: 1, r: 0 }, 'back']];

/**
 * The last letter: a chain of words that turns its corners on the letters
 * two words share. The chain is laid tile by tile — şêr, then roj from its
 * r, then jin from its j — and each corner nods as the next word leaves it.
 */
const lastLetter: Cover = {
  title: GAME_NAMES['last-letter'],
  loopMs: 6000,
  parts: [
    { draw: (dr) => ground(dr, PERIWINKLE, [60, 58, 50]) },
    ...CHAIN.map(({ ch, c, r, meets, laid }): Part => {
      const [x, y] = chainAt(c, r);
      const draw = (dr: Drawing): void => tile(dr, x, y, CHAIN_TILE, meets ? tones(GOLD) : CREAM, ch, INK);
      const pivot = [x + CHAIN_TILE / 2, y + CHAIN_TILE / 2] as const;
      if (laid === undefined) return meets ? { draw, pivot, keys: [[0, {}], ...nods(0.16), [1, {}, 'hold']] } : { draw };
      // a corner laid in the chain nods in its turn, once the tile after it is down
      const keys = popsIn(laid, 0.06);
      return { draw, pivot, keys: meets ? [...keys.slice(0, -1), ...nods(0.48), [1, {}, 'hold']] : keys };
    }),
  ],
};

// ───────────────────────────────────────────────────────────── the impostor

const MUSTARD = '#f5c451';
/** The foot of the fan the cards are held in. */
const FAN = [60, 118] as const;

/** The mask the impostor wears: two eyes cut out of it. */
const MASK = 'M-22 -7C-14 -14 -6 -10 0 -6C6 -10 14 -14 22 -7C24 4 16 12 8 8C4 6 2 2 0 2C-2 2 -4 6 -8 8C-16 12 -24 4 -22 -7Z';
const MASK_EYES = 'M-13 -4.5A4.6 3.4 0 1 0 -3.8 -4.5A4.6 3.4 0 1 0 -13 -4.5ZM3.8 -4.5A4.6 3.4 0 1 0 13 -4.5A4.6 3.4 0 1 0 3.8 -4.5Z';

/** One card of the hand, standing in the fan, turned by `angle` about its foot. */
function card(dr: Drawing, angle: number, face: Tones, mark: () => void): void {
  turned(dr, angle, FAN[0], FAN[1], () => {
    form(dr, rr(39, 26, 42, 62, 8), face, 4.4, 2.4);
    mark();
  });
}
/** An open card: the word everybody holds, drawn as the impostor's pictures draw it, a round gold bead. */
const openCard = (dr: Drawing, angle: number): void => card(dr, angle, CREAM, () => dab(dr, 60, 55, 10, 10, GOLD, 2.4));

/**
 * The impostor: a hand of three cards, as the game's own pictures show it.
 * Two are open and alike; the one in the middle is dark, with a mask on it.
 * It rises out of the hand, looks one way and the other, and slips back in.
 */
const impostor: Cover = {
  title: GAME_NAMES.impostor,
  loopMs: 5400,
  parts: [
    { draw: (dr) => ground(dr, MUSTARD, [60, 58, 50], [60, 104, 42, 5]) },
    { draw: (dr) => openCard(dr, -24), pivot: FAN, keys: [[0, {}], [0.14, {}, 'hold'], [0.22, { r: -5 }, 'out'], [0.62, {}, 'hold'], [0.7, { r: 0 }, 'inOut'], [1, {}, 'hold']] },
    { draw: (dr) => openCard(dr, 24), pivot: FAN, keys: [[0, {}], [0.14, {}, 'hold'], [0.22, { r: 5 }, 'out'], [0.62, {}, 'hold'], [0.7, { r: 0 }, 'inOut'], [1, {}, 'hold']] },
    {
      draw: (dr) =>
        card(dr, 0, tones(NIGHT), () => {
          dr.add(`<g transform="translate(60 54) scale(0.78)"><path d="${MASK}${MASK_EYES}" fill="${GOLD}" fill-rule="evenodd"/></g>`);
        }),
      pivot: [60, 88],
      keys: [[0, {}], [0.16, {}, 'hold'], [0.24, { y: -9 }, 'out'], [0.32, { r: -5 }, 'inOut'], [0.42, { r: 5 }, 'inOut'], [0.5, { r: 0 }, 'inOut'], [0.6, { y: 0 }, 'back'], [1, {}, 'hold']],
    },
  ],
};

// ───────────────────────────────────────────────────────────── who am I?

const MINT = '#bde6dc';
const HIDDEN = '#1d6a5f';
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

/** The note on his forehead: a square of yellow paper with its corner turned, and the question on it. */
function stickyNote(dr: Drawing): void {
  placed(dr, 60, 51, -6, 1, () => {
    form(dr, 'M-17 -17H17V9L9 17H-17Z', tones(NOTE), 2.4, 1.6);
    fill(dr, 'M17 9L9 17V11C9 9.9 9.9 9 11 9Z', tint(NOTE, -0.22));
    write(dr, '?', -letterWidth(19) / 2, -8.4, 19, INK, 4.2);
  });
}

/** One of the two answers the table gives, on a card of its own colour: erê, yes; na, no. Whoever says it is below the picture, where its tail points. */
function answer(dr: Drawing, x: number, w: number, word: string, hex: string, from: number, toX: number): void {
  const [y, h] = [82, 20];
  form(dr, bubble(x, y, w, h, from, toX, y + h + 8), tones(hex), 2.6, 1.6);
  const size = 8.4;
  const step = letterWidth(size) + 2.2;
  const left = x + (w - (step * word.length - 2.2)) / 2;
  // the word is set a little low, to leave ê its hat
  [...word].forEach((ch, i) => write(dr, ch, left + i * step, y + (h - size) / 2 + 1.2, size, WHITE, 2));
}
/** An answer being given: its card swells and settles. */
const answers = (...starts: number[]): Key[] => [[0, {}], ...starts.flatMap((t): Key[] => [[t, {}, 'hold'], [t + 0.04, { s: 1.2 }, 'out'], [t + 0.11, { s: 1 }, 'inOut']]), [1, {}, 'hold']];

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
        ground(dr, MINT, [60, 52, 46]);
        hiddenDeer(dr);
      },
    },
    {
      draw: stickyNote,
      // it is stuck along its top edge, and turns about that
      pivot: [60, 34],
      keys: [[0, {}], [0.08, {}, 'hold'], [0.14, { r: 6, sy: 0.96 }, 'out'], [0.22, { r: -3.5, sy: 1 }, 'inOut'], [0.28, { r: 2 }, 'inOut'], [0.34, { r: 0 }, 'inOut'], [1, {}, 'hold']],
    },
    { draw: (dr) => answer(dr, 3, 36, 'ERÊ', GREEN, 14, 8), pivot: [21, 92], keys: answers(0.44, 0.78) },
    { draw: (dr) => answer(dr, 87, 30, 'NA', RED, 107, 113), pivot: [102, 92], keys: answers(0.6) },
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
