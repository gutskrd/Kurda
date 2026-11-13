/**
 * The games' covers: one picture for each game on Learn's Games page.
 *
 * They are drawn as a poster is: one idea a cover, a few large forms in flat
 * colour on a ground of the game's own, one step of shade on a form and no
 * more, and what makes somebody somebody — an eye, a brow, a wing — put in
 * with a line of ink. Everybody on them has the same eyes, the letters are
 * all cut the same way, and no cover has more than a few colours, so the
 * eight read as one set.
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
import { at, form, ring, rr, type Tones } from './cutout.js';
import type { Cover, Key, Part } from './game-acting.js';
import { letter, letterWidth, oval } from './ink.js';
import { Drawing, n, tint } from './svg.js';

// ───────────────────────────────────────────────────────────── the colours

/** The deep tone every line, pupil and letter is drawn in: never black. */
const INK = '#2b2142';
const PAPER = '#fff6e4';
const WHITE = '#ffffff';
const GOLD = '#f5b82e';
const CORAL = '#ee5a3d';
const GREEN = '#43b565';
const STEEL = '#8d97ac';
const BLUE = '#3f86e6';
const ORANGE = '#f6892f';
const CREAM: Tones = { light: '#fffaf0', base: '#fbeed6', shade: '#d2b98f' };

/** A colour as a tile's three tones. */
const tones = (hex: string): Tones => ({ light: tint(hex, 0.3), base: hex, shade: tint(hex, -0.3) });

// ───────────────────────────────────────────────────────────── the pen

const fill = (dr: Drawing, d: string, hex: string, more = ''): void => {
  dr.add(`<path d="${d}" fill="${hex}"${more}/>`);
};
const line = (dr: Drawing, d: string, hex: string, width: number, more = ''): void => {
  dr.add(`<path d="${d}" fill="none" stroke="${hex}" stroke-width="${n(width)}" stroke-linecap="round" stroke-linejoin="round"${more}/>`);
};
/** A flat shape with a line of ink round it: a beak, a fist, an eye. */
const inked = (dr: Drawing, d: string, hex: string, width = 1.5): void => {
  dr.add(`<path d="${d}" fill="${hex}" stroke="${INK}" stroke-width="${n(width)}" stroke-linejoin="round"/>`);
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

/**
 * A form with its one step of shade. The light is at the upper left on every
 * cover, so the shape is laid down in its darker tone and then again in its
 * own colour, moved up and left inside itself: what is left of the darker
 * tone is a crescent along the lower right, where a round thing turns away.
 */
function lit(dr: Drawing, d: string, hex: string, by = 2.6, deep = 0.18): void {
  fill(dr, d, tint(hex, -deep));
  inside(dr, d, () => fill(dr, d, hex, at(-by, -by)));
}

/** What a lid does to an eye: the colour of whoever wears it, how far down the eye it has come (0 to 1), and how it slopes. */
interface Lid {
  colour: string;
  down: number;
  slope: number;
}

/**
 * An eye, the same on every cover: a white round with a line of ink about
 * it, and a pupil pushed toward what it is looking at (`look`, each way -1 to
 * 1). A lid makes the mood: half down and level it is unimpressed, sloping
 * toward the nose it is cross or intent.
 */
function eye(dr: Drawing, cx: number, cy: number, r: number, look: readonly [number, number], lid?: Lid): void {
  const round = ring(cx, cy, r);
  fill(dr, round, WHITE);
  const [px, py] = [cx + look[0] * r * 0.4, cy + look[1] * r * 0.4];
  fill(dr, ring(px, py, r * 0.46), INK);
  fill(dr, ring(px + r * 0.14, py - r * 0.18, r * 0.14), WHITE);
  if (lid) eyelid(dr, cx, cy, r, lid);
  line(dr, round, INK, 1.5);
}
/** A lid over an eye: the wearer's colour down to where the lid has come, and the line of its edge. */
function eyelid(dr: Drawing, cx: number, cy: number, r: number, lid: Lid): void {
  const y = cy - r + lid.down * 2 * r;
  const rise = Math.tan((lid.slope * Math.PI) / 180) * r;
  inside(dr, ring(cx, cy, r), () => fill(dr, `M${n(cx - r - 1)} ${n(cy - r - 1)}H${n(cx + r + 1)}V${n(y + rise)}L${n(cx - r - 1)} ${n(y - rise)}Z`, lid.colour));
  inside(dr, ring(cx, cy, r + 0.9), () => line(dr, `M${n(cx - r - 2)} ${n(y - rise * 1.2)}L${n(cx + r + 2)} ${n(y + rise * 1.2)}`, INK, 1.7));
}

/** The letters with a hat stand a little low on a tile and the ones with a tail a little high, so that each sits in the middle of its tile to the eye. */
const HATTED = 'ÊÎÛ';
const TAILED = 'ÇŞ';
const nudge = (ch: string, height: number): number => (HATTED.includes(ch) ? height * 0.17 : TAILED.includes(ch) ? -height * 0.16 : 0);

/**
 * A letter tile, as the games' own are: a rounded square standing on its
 * edge, its letter in the middle of its face. `ink` is the letter's colour.
 */
function tile(dr: Drawing, x: number, y: number, size: number, face: Tones, ch: string | null, ink: string, drop = size * 0.14): void {
  form(dr, rr(x, y, size, size, size * 0.22), face, drop, size * 0.07);
  if (ch === null) return;
  const h = size * 0.54;
  write(dr, ch, x + (size - letterWidth(h)) / 2, y + (size - h) / 2 + nudge(ch, h), h, ink, size * 0.118);
}

// ───────────────────────────────────────────────────────────── Peyvok

const MEADOW = '#86d6a4';
const PHONE = '#3b2f63';
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
/** A square of the board, and where each one is on the phone's screen. */
const SQUARE = 12.4;
const squareAt = (c: number, r: number): readonly [number, number] => [24.6 + c * 14.6, 27 + r * 14.8];
const leaning = (dr: Drawing, draw: () => void): void => turned(dr, LEAN, LEAN_AT[0], LEAN_AT[1], draw);

/** One square of a guess: its mark's colour, its letter in white. */
function guessed(dr: Drawing, c: number, r: number): void {
  const [x, y] = squareAt(c, r);
  const [word, marks] = GUESSES[r]!;
  tile(dr, x, y, SQUARE, tones(MARK[marks[c]!]), word[c]!, WHITE, 1.5);
}

function peyvokPhone(dr: Drawing): void {
  leaning(dr, () => {
    // the phone, taller than the picture: its foot runs off the bottom edge
    form(dr, rr(17, 6, 86, 150, 13), tones(PHONE), 4, 2.4);
    fill(dr, rr(21.6, 11, 76.8, 140, 8.6), '#fffdf8');
    fill(dr, rr(51, 14.4, 18, 4.4, 2.2), PHONE);
    // the rows still to be guessed
    for (let r = 2; r < 7; r++) for (let c = 0; c < 5; c++) line(dr, rr(...squareAt(c, r), SQUARE, SQUARE, 2.7), '#e6dece', 1.3);
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
        ground(dr, MEADOW);
        fill(dr, ring(60, 62, 50), tint(MEADOW, 0.22));
      },
    },
    { draw: peyvokPhone },
    ...[0, 1, 2, 3, 4].map((c): Part => {
      const [x, y] = squareAt(c, 2);
      const bows = 0.7 + c * 0.035;
      return {
        draw: (dr) => leaning(dr, () => guessed(dr, c, 2)),
        pivot: turnedPoint(x + SQUARE / 2, y + SQUARE / 2, LEAN, LEAN_AT[0], LEAN_AT[1]),
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

const ROSE = '#f59ab5';
const SUN = '#f8c63d';
/** Where the wire is: the birds stand on it. */
const WIRE = 95;

/** A bird of the rhyme: how wide and how tall it is, its colour, and what its face is doing. */
interface Singer {
  w: number;
  h: number;
  colour: string;
  /** singing out, eyes wide; or answering, one lid down, sure of itself */
  face: 'sings' | 'answers';
}
const FIRST: Singer = { w: 16.5, h: 37, colour: BLUE, face: 'sings' };
const SECOND: Singer = { w: 13.5, h: 49, colour: SUN, face: 'answers' };

/**
 * A singer's tail, hanging below the wire it stands on at 0,0. Both birds'
 * tails are the colour of the ending their words share: they are different
 * birds that end the same way.
 */
function singerTail(dr: Drawing, { w }: Singer): void {
  // two long feathers, fanning out behind and below it
  fill(dr, `M${n(-w * 0.92)} -9L${n(-w * 0.08)} -3L${n(-w * 0.66)} 22L${n(-w * 1.02)} 16.6L${n(-w * 1.52)} 19Z`, CORAL);
  line(dr, `M${n(-w * 0.6)} -1L${n(-w * 1.02)} 16.6`, tint(CORAL, -0.26), 1.5);
}

/** A singer standing on the wire at 0,0, facing right: one rounded form, and a face, a wing and feet in ink. */
function singer(dr: Drawing, { w, h, colour, face }: Singer): void {
  lit(dr, `M${n(-w * 0.86)} 1C${n(-w * 1.22)} ${n(-h * 0.4)} ${n(-w)} ${n(-h)} 0 ${n(-h)}C${n(w)} ${n(-h)} ${n(w * 1.22)} ${n(-h * 0.4)} ${n(w * 0.86)} 1Q0 4.6 ${n(-w * 0.86)} 1Z`, colour, 2.4, 0.16);
  // the wing folded at its side, and the tips of its feathers
  const wing = `M${n(-w * 0.6)} ${n(-h * 0.6)}C${n(-w * 0.98)} ${n(-h * 0.38)} ${n(-w * 0.86)} ${n(-h * 0.12)} ${n(-w * 0.4)} ${n(-h * 0.13)}C${n(-w * 0.08)} ${n(-h * 0.14)} ${n(w * 0.04)} ${n(-h * 0.36)} ${n(-w * 0.1)} ${n(-h * 0.56)}`;
  fill(dr, wing, tint(colour, -0.13));
  line(dr, wing, INK, 1.8);
  // the crest
  line(dr, `M-2.4 ${n(-h + 0.4)}C-4.6 ${n(-h - 4)} -2.6 ${n(-h - 7)} 0 ${n(-h - 5.4)}M2 ${n(-h + 0.2)}C2.2 ${n(-h - 3.4)} 4.6 ${n(-h - 5.6)} 6.6 ${n(-h - 3.6)}`, INK, 1.8);
  const ey = -h + 12.4;
  const ex = w * 0.3;
  if (face === 'sings') {
    eye(dr, ex, ey, 4.7, [0.7, -0.1]);
    eye(dr, ex + 9.4, ey + 0.8, 4.2, [0.7, -0.1]);
    // the beak, wide open on the word
    inked(dr, `M${n(ex + 3.4)} ${n(ey + 5)}L${n(ex + 17.4)} ${n(ey + 3.6)}L${n(ex + 5)} ${n(ey + 9.6)}Z`, ORANGE);
    inked(dr, `M${n(ex + 5)} ${n(ey + 9.6)}L${n(ex + 14)} ${n(ey + 13.4)}L${n(ex + 3)} ${n(ey + 13)}Z`, tint(ORANGE, -0.14));
  } else {
    const lid: Lid = { colour, down: 0.42, slope: 0 };
    eye(dr, ex, ey, 4.7, [0.75, 0.3], lid);
    eye(dr, ex + 9.4, ey + 0.8, 4.2, [0.75, 0.3], lid);
    // the beak, open just enough to say it
    inked(dr, `M${n(ex + 3)} ${n(ey + 5.6)}L${n(ex + 16.6)} ${n(ey + 7.6)}L${n(ex + 4.4)} ${n(ey + 10.4)}Z`, ORANGE);
    inked(dr, `M${n(ex + 4.4)} ${n(ey + 10.4)}L${n(ex + 11.6)} ${n(ey + 11.4)}L${n(ex + 3.2)} ${n(ey + 13.2)}Z`, tint(ORANGE, -0.14));
  }
  // its toes over the wire
  for (const x of [-w * 0.36, w * 0.28]) {
    inked(dr, rr(x - 3.4, -2.2, 6.8, 4.6, 2), ORANGE, 1.2);
    line(dr, `M${n(x - 1.1)} -1.4V1.6M${n(x + 1.1)} -1.4V1.6`, INK, 1);
  }
}

/**
 * What a bird says, in a bubble: its tail leaves the bubble's foot at `from`
 * and points at (toX, toY). The first letter is the word's own; what follows
 * is the rhyme, in the colour both endings and both tails share.
 */
function saying(dr: Drawing, x: number, y: number, w: number, h: number, word: string, from: number, toX: number, toY: number): void {
  const [r, b, k] = [x + w, y + h, 11];
  const outline =
    `M${n(x + k)} ${n(y)}H${n(r - k)}A${k} ${k} 0 0 1 ${n(r)} ${n(y + k)}V${n(b - k)}A${k} ${k} 0 0 1 ${n(r - k)} ${n(b)}` +
    `H${n(from + 5)}L${n(toX)} ${n(toY)}L${n(from - 4)} ${n(b)}H${n(x + k)}A${k} ${k} 0 0 1 ${n(x)} ${n(b - k)}V${n(y + k)}A${k} ${k} 0 0 1 ${n(x + k)} ${n(y)}Z`;
  // a bubble is paper: it throws a flat shadow on the wall behind it
  fill(dr, outline, tint(ROSE, -0.2), at(2.2, 2.8));
  fill(dr, outline, PAPER);
  const size = 11.4;
  const step = letterWidth(size) + 2.8;
  const left = x + (w - (step * word.length - 2.8)) / 2;
  [...word].forEach((ch, i) => write(dr, ch, left + i * step, y + (h - size) / 2, size, i === 0 ? INK : CORAL, 2.5));
}

/** A bird hopping as it speaks, at `start`. */
const hops = (start: number): Key[] => [[start, {}, 'hold'], [start + 0.03, { sy: 0.93, sx: 1.05 }, 'in'], [start + 0.08, { y: -4, sy: 1.05, sx: 0.97 }, 'out'], [start + 0.15, { y: 0, s: 1 }, 'in']];
/** A bubble gone, and back at `start` when its bird speaks. */
const spoken = (start: number): Key[] => [[0, {}], [0.04, {}, 'hold'], [0.08, { s: 0.6, o: 0 }, 'in'], [start, {}, 'hold'], [start + 0.08, { s: 1, o: 1 }, 'back'], [1, {}, 'hold']];

/**
 * Rhyme: two birds on a wire, a round one and a tall one. One sings dar, a
 * tree; the other answers kar, work — and the ending they share is one
 * colour, in both words and in both their tails.
 */
const rhyme: Cover = {
  title: GAME_NAMES.rhyme,
  loopMs: 5600,
  parts: [
    {
      draw: (dr) => {
        ground(dr, ROSE);
        fill(dr, ring(62, 70, 43), tint(ROSE, 0.2));
      },
    },
    { draw: (dr) => placed(dr, 36, WIRE, 0, 1, () => singerTail(dr, FIRST)), pivot: [36, WIRE], keys: [[0, {}], ...hops(0.1), [1, {}, 'hold']] },
    { draw: (dr) => placed(dr, 87, WIRE, 0, -1, () => singerTail(dr, SECOND), 1), pivot: [87, WIRE], keys: [[0, {}], ...hops(0.42), [1, {}, 'hold']] },
    { draw: (dr) => line(dr, `M-4 ${WIRE - 0.6}C30 ${WIRE + 1.4} 90 ${WIRE + 1.4} 124 ${WIRE - 0.6}`, INK, 2.2) },
    { draw: (dr) => placed(dr, 36, WIRE, 0, 1, () => singer(dr, FIRST)), pivot: [36, WIRE], keys: [[0, {}], ...hops(0.1), [1, {}, 'hold']] },
    { draw: (dr) => placed(dr, 87, WIRE, 0, -1, () => singer(dr, SECOND), 1), pivot: [87, WIRE], keys: [[0, {}], ...hops(0.42), [1, {}, 'hold']] },
    { draw: (dr) => saying(dr, 5, 15, 47, 25, 'DAR', 40, 49, 52), pivot: [46, 46], keys: spoken(0.12) },
    { draw: (dr) => saying(dr, 66, 6, 48, 25, 'KAR', 78, 71, 41), pivot: [74, 36], keys: spoken(0.44) },
  ],
};

// ───────────────────────────────────────────────────────────── the typing race

const TRACK = '#de5f2a';

/** A key off a keyboard about its own middle: its cap, the side below it, and its letter. */
function keycap(dr: Drawing, size: number, cap: Tones, ch: string): void {
  form(dr, rr(-size / 2, -size / 2, size, size * 0.92, size * 0.2), cap, size * 0.16, size * 0.055);
  const h = size * 0.48;
  write(dr, ch, -letterWidth(h) / 2, -size / 2 + (size * 0.92 - h) / 2 + nudge(ch, h), h, INK, size * 0.1);
}

/** A running shoe, its toe pointing right from the ankle at the origin: a red upper on a thick white sole. */
function shoe(dr: Drawing): void {
  fill(dr, 'M-3.6 -3.2C-1 -5.6 3 -5 5.4 -2.2C8.6 -1.8 11.4 -0.4 11.8 2.4H-4.4C-4.8 0.2 -4.6 -1.8 -3.6 -3.2Z', CORAL);
  line(dr, 'M1.4 -3.6L3.6 0.4', WHITE, 1.3);
  fill(dr, rr(-5, 2.2, 17.6, 3.6, 1.8), WHITE);
}

/** A leg as one bent line, ending in a shoe: where its hip, knee and ankle are, and how the shoe is turned. */
type Leg = readonly [hip: readonly [number, number], knee: readonly [number, number], ankle: readonly [number, number], turn: number];
function leg(dr: Drawing, [hip, knee, ankle, turn]: Leg, width: number): void {
  line(dr, `M${n(hip[0])} ${n(hip[1])}L${n(knee[0])} ${n(knee[1])}L${n(ankle[0])} ${n(ankle[1])}`, INK, width);
  placed(dr, ankle[0], ankle[1], turn, width / 3.9, () => shoe(dr));
}
/** An arm as one bent line, ending in a gloved fist. */
function arm(dr: Drawing, shoulder: readonly [number, number], elbow: readonly [number, number], hand: readonly [number, number], width: number): void {
  line(dr, `M${n(shoulder[0])} ${n(shoulder[1])}L${n(elbow[0])} ${n(elbow[1])}L${n(hand[0])} ${n(hand[1])}`, INK, width);
  inked(dr, ring(hand[0], hand[1], width * 0.95), PAPER, width * 0.36);
}

/** How many strides the runners take in one loop. */
const STRIDES = 6;
/** Something done once every stride: `keys` are written for one stride, their moments 0 to 1 of it. */
const everyStride = (keys: readonly Key[]): Key[] => Array.from({ length: STRIDES }, (_, k) => keys.map(([t, to, ease]): Key => [(k + t) / STRIDES, to, ease])).flat();

/**
 * The typing race: two keys off a keyboard, running for the line. The one in
 * front wears a runner's band and is in the air for half of every stride; the
 * one behind gains a little, loses it, and never stops trying.
 */
const race: Cover = {
  title: GAME_NAMES.race,
  loopMs: 4800,
  parts: [
    {
      draw: (dr) => {
        ground(dr, ORANGE);
        fill(dr, ring(83, 46, 40), tint(ORANGE, 0.16));
        // the track they run on, its lane line, and where each of them is over it
        fill(dr, 'M0 101H120V120H0Z', TRACK);
        line(dr, 'M-4 111H124', tint(TRACK, 0.3), 1.6);
        fill(dr, oval(22, 103.4, 13, 2.2), tint(TRACK, -0.22));
        fill(dr, oval(84, 103.6, 24, 2.8), tint(TRACK, -0.22));
      },
    },
    {
      // the air going by
      draw: (dr) => line(dr, 'M28 17H48M20 28H36M31 39H42', WHITE, 2.8),
      keys: [[0, {}], ...everyStride([[0.5, { x: -7, o: 0.3 }, 'in'], [1, { x: 0, o: 1 }, 'out']])],
    },
    {
      // the one behind, giving it everything
      draw: (dr) => {
        leg(dr, [[19, 84], [13, 91], [7, 88], 116], 2.8);
        leg(dr, [[28, 85], [34, 91], [32, 98], 6], 2.8);
        arm(dr, [33, 71], [39, 76], [40, 69], 2.6);
        arm(dr, [11, 73], [6, 79], [10, 84], 2.6);
        placed(dr, 22.6, 72, 10, 1, () => keycap(dr, 25, tones('#7cc4f2'), 'Ê'));
        // what it costs him
        fill(dr, 'M7 46C9.4 49.4 10.4 51 10.4 52.6A3.4 3.4 0 0 1 3.6 52.6C3.6 51 4.6 49.4 7 46Z', WHITE);
        fill(dr, 'M16 40C17.6 42.4 18.4 43.6 18.4 44.8A2.4 2.4 0 0 1 13.6 44.8C13.6 43.6 14.4 42.4 16 40Z', WHITE);
      },
      pivot: [23, 86],
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
      draw: (dr) => leg(dr, [[74, 69], [66, 83], [53, 80], 112], 4.2),
      pivot: [74, 68],
      keys: [[0, {}], ...everyStride([[0.5, { r: -50, y: -3 }, 'inOut'], [1, { r: 0, y: 0 }, 'inOut']])],
    },
    {
      // the leg reaching for the ground ahead
      draw: (dr) => leg(dr, [[91, 70], [102, 77], [104, 92], -10], 4.2),
      pivot: [91, 69],
      keys: [[0, {}], ...everyStride([[0.5, { r: 46, y: -3 }, 'inOut'], [1, { r: 0, y: 0 }, 'inOut']])],
    },
    {
      draw: (dr) => {
        arm(dr, [63, 48], [55, 56], [61, 64], 3.6);
        arm(dr, [103, 46], [111, 53], [114, 42], 3.6);
        placed(dr, 83, 45, 7, 1, () => {
          // the ends of his band, flying out behind him
          line(dr, 'M-20 -13C-26 -16 -30 -12.4 -35.6 -15.6', CORAL, 3);
          line(dr, 'M-20 -11.6C-25 -9.4 -28.6 -9.2 -32.6 -6', tint(CORAL, -0.16), 3);
          keycap(dr, 42, CREAM, 'Ç');
          inside(dr, rr(-21, -21, 42, 38.6, 8.4), () => fill(dr, 'M-22 -16.6H22V-11H-22Z', CORAL));
        });
      },
      pivot: [83, 50],
      keys: [[0, {}], ...everyStride([[0.5, { y: -3, r: 2.5 }, 'out'], [1, { y: 0, r: 0 }, 'in']])],
    },
  ],
};

// ───────────────────────────────────────────────────────────── the memory thief

const NIGHT = '#1b2050';
const FOX = '#f07f2e';
const FUR = '#fdecd2';
const SACK = '#d8ae78';
const CAP = '#6170dc';

const FOX_HEAD = 'M51 40C51 28 60 21 71 21C81 21 88 27 90 35L101 46C103.6 49 102 53.4 98 53.6C90 57 81 59 71 59C59 59 51 51 51 40Z';
/** His jersey, drawn upright; he wears it leaning into his step. */
const FOX_CHEST = rr(48.5, 53, 27, 34, 13.5);
const leansIn = (dr: Drawing, draw: () => void): void => turned(dr, 22, 62, 70, draw);

/** The sack on his back, and two of the words he took, looking out of the top of it. */
function sack(dr: Drawing): void {
  placed(dr, 40.6, 25, 14, 1, () => tile(dr, -8, -8, 16, CREAM, 'J', INK, 1.8));
  placed(dr, 25, 27.6, -16, 1, () => tile(dr, -9.5, -9.5, 19, tones(GOLD), 'Û', INK, 2));
  lit(dr, 'M15 55C13 43 21 33 34 33C45 33 52 38 55 46C58 55 56 67 48 72C38 77 23 75 18 67C16 63 15.6 59 15 55Z', SACK, 3.2, 0.2);
  // the cord its neck is drawn in with
  line(dr, 'M19 44C28 39.6 40 39.6 50.6 44.6', tint(SACK, -0.36), 1.8);
}

/** His brush, low behind him: red, with the white tip every fox has. */
function foxTail(dr: Drawing): void {
  const tail = 'M58 79C46 73 28 78 14 92C9.6 96.4 10 103 16 104.6C32 108 48 100 60 90Z';
  // it is behind him, so a tone darker than the leg that crosses it
  lit(dr, tail, tint(FOX, -0.1), 2.4, 0.16);
  inside(dr, tail, () => fill(dr, 'M4 84H27C25 93 28 101 35 107L8 114Z', FUR));
}

/** A leg: the thigh, the thinner shin below the knee, and a white-socked paw on the tips of its toes. */
type FoxLeg = readonly [hip: readonly [number, number], knee: readonly [number, number], ankle: readonly [number, number], toe: readonly [number, number]];
function foxLeg(dr: Drawing, [hip, knee, ankle, toe]: FoxLeg, hex: string): void {
  line(dr, `M${n(hip[0])} ${n(hip[1])}L${n(knee[0])} ${n(knee[1])}`, hex, 9.4);
  line(dr, `M${n(knee[0])} ${n(knee[1])}L${n(ankle[0])} ${n(ankle[1])}`, hex, 6.8);
  const turn = (Math.atan2(toe[1] - ankle[1], toe[0] - ankle[0]) * 180) / Math.PI;
  placed(dr, (ankle[0] + toe[0]) / 2, (ankle[1] + toe[1]) / 2, turn, 1, () => fill(dr, oval(0.6, 0, 5, 3.3), FUR));
}

function foxBody(dr: Drawing): void {
  // the leg he stands on, a tone darker for being the far one, and the leg lifted for the next step
  foxLeg(dr, [[56, 85], [60.6, 95.6], [54, 104], [59.6, 107.4]], tint(FOX, -0.22));
  foxLeg(dr, [[59, 85], [74.6, 89.6], [77.6, 100], [84, 103.4]], FOX);
  leansIn(dr, () => {
    lit(dr, FOX_CHEST, PAPER, 2.4, 0.14);
    inside(dr, FOX_CHEST, () => {
      for (let y = 56.4; y < 88; y += 8.6) fill(dr, `M42 ${n(y)}H82V${n(y + 4.3)}H42Z`, INK);
    });
  });
}

function foxHead(dr: Drawing): void {
  // the ears, and the dark of them
  fill(dr, 'M54 31L51.4 8.6L67 23Z', FOX);
  fill(dr, 'M72 22L83.6 5.6L90 31Z', FOX);
  fill(dr, 'M57 27L56 17.4L62.4 23Z', INK);
  fill(dr, 'M78 22L83 13.6L85.6 26Z', INK);
  // the two ends of the band he has tied across his eyes, flying out behind his head
  fill(dr, 'M54 36.6C48 33.6 44 34.6 38.6 29.6C40.6 37 46 39.6 53 40Z', INK);
  fill(dr, 'M53 39C47.6 40.6 44.6 45 39.6 46C44 49.6 50 46.4 54.6 42Z', INK);
  lit(dr, FOX_HEAD, FOX, 2.4, 0.16);
  inside(dr, FOX_HEAD, () => {
    // the pale of his cheek and muzzle, and the band: narrow, level, and going right round his head
    fill(dr, 'M50 48C59 44 69 47 77 45C84 43.4 88 40 91 37L108 48V64H50Z', FUR);
    fill(dr, 'M48 34.8C62 31.4 78 31.6 93 35.8L97 43C84 39.8 72 39.8 62 40.8C57 41.4 52.6 41.8 48 41.8Z', INK);
  });
  fill(dr, oval(100, 49.2, 3.3, 2.9), INK);
  line(dr, 'M86.6 55C90 55.6 93.6 54.6 96 52.8', INK, 1.4);
  // the eye that keeps watch through the band, looking back the way he came
  fill(dr, 'M74.4 37.2C77 33.6 82.8 33.4 85.6 36.6C82.8 39.6 77.4 39.8 74.4 37.2Z', WHITE);
  fill(dr, ring(78.4, 36.6, 1.8), INK);
  // the cap, on the top of his head and clear of the band
  lit(dr, 'M55 29C56.6 20 63 14.6 71 14.6C79 14.6 85.6 19.6 87.6 28C77 24 65 24.4 55 29Z', CAP, 1.8, 0.18);
  line(dr, 'M55.6 28.4C65 24.2 77 24 87 27.4', tint(CAP, 0.36), 3);
}

function foxTorch(dr: Drawing): void {
  // the arm he holds it out on, and the torch in his paw
  line(dr, 'M70 58L79.6 68.4L88 73', FOX, 6.4);
  turned(dr, 10, 90, 74, () => {
    fill(dr, rr(85, 70, 14, 8, 2.6), STEEL);
    fill(dr, rr(97, 68, 5, 12, 1.8), tint(STEEL, 0.34));
  });
  inked(dr, ring(88.4, 73.6, 3.7), FUR, 1.3);
}

/**
 * Three creeping steps: at each, everything sinks onto the foot and comes up
 * again. What is carried arrives `late` and sinks `deep`er, as a sack does;
 * `then` is what this part does once the creeping stops.
 */
const creeps = (late: number, deep: number, then: readonly Key[] = []): Key[] => [
  [0, {}],
  ...[0.06, 0.24, 0.42].flatMap((start): Key[] => [[start + late, {}, 'hold'], [start + late + 0.06, { y: deep }, 'out'], [start + late + 0.15, { y: 0 }, 'inOut']]),
  ...then,
  [1, {}, 'hold'],
];

/**
 * The memory thief: a fox in a striped jersey creeping off with the words in
 * his sack, three careful steps under the moon — and then he stops, lifts his
 * head, and swings the torch round at a noise that was nothing.
 */
const thief: Cover = {
  title: GAME_NAMES['memory-thief'],
  loopMs: 6400,
  parts: [
    {
      draw: (dr) => {
        ground(dr, NIGHT);
        // the moon, a few stars, and the rise he creeps along
        fill(dr, ring(104, 19, 10), '#ffe9a6');
        fill(dr, ring(108, 16.4, 8), NIGHT);
        for (const [x, y, r] of [[8, 12, 1.3], [58, 7, 1], [112, 50, 1.2]] as const) fill(dr, ring(x, y, r), '#aeb6ee');
        fill(dr, 'M0 104C30 96 80 98 120 106V120H0Z', tint(NIGHT, -0.3));
      },
    },
    {
      // the light of the torch, thrown ahead of him
      draw: (dr) => {
        fill(dr, 'M101.6 72.4L124 57V108L100.4 81Z', '#ffe27a', ' fill-opacity="0.86"');
        fill(dr, 'M101.6 74.6L124 68.6V95L100.8 79.4Z', '#fff5cc');
      },
      pivot: [100, 77],
      keys: creeps(0, 2.2, [[0.66, {}, 'hold'], [0.72, { r: -12 }, 'out'], [0.84, {}, 'hold'], [0.92, { r: 0 }, 'inOut']]),
    },
    { draw: foxTail, pivot: [58, 85], keys: creeps(0.04, 2.6, [[0.66, {}, 'hold'], [0.72, { r: 6 }, 'out'], [0.84, {}, 'hold'], [0.92, { r: 0 }, 'inOut']]) },
    { draw: sack, pivot: [50, 52], keys: creeps(0.03, 3.4) },
    { draw: foxBody, keys: creeps(0, 2.2) },
    { draw: foxTorch, pivot: [70, 58], keys: creeps(0, 2.2) },
    { draw: foxHead, pivot: [68, 54], keys: creeps(0.015, 2.6, [[0.64, {}, 'hold'], [0.69, { y: -2.4, r: -4 }, 'out'], [0.84, {}, 'hold'], [0.92, { y: 0, r: 0 }, 'inOut']]) },
  ],
};

// ───────────────────────────────────────────────────────────── the detective

const SKY = '#84c9f0';
const HOUND = '#d79c5c';
const MUZZLE = '#f6e2c4';
const EAR = '#7c4a2b';
const TWEED = '#3f7d5f';

/** The check of his tweed over a shape: the dark lines of it, and a fine gold one beside each. */
function check(dr: Drawing, d: string, xs: readonly number[], ys: readonly number[]): void {
  inside(dr, d, () => {
    for (const x of xs) {
      line(dr, `M${n(x)} -130V130`, tint(TWEED, -0.3), 2);
      line(dr, `M${n(x + 3)} -130V130`, GOLD, 0.8);
    }
    for (const y of ys) {
      line(dr, `M-130 ${n(y)}H130`, tint(TWEED, -0.3), 2);
      line(dr, `M-130 ${n(y + 3)}H130`, GOLD, 0.8);
    }
  });
}

/** A paw print about a point: the pad and its four toes. */
function pawPrint(dr: Drawing, cx: number, cy: number, k: number, hex: string, turn = 0): void {
  placed(dr, cx, cy, turn, k, () => {
    fill(dr, 'M0 -1.8C2.4 -1.8 4 0.4 4 2.6C4 4.6 2.2 5.4 0 5.4C-2.2 5.4 -4 4.6 -4 2.6C-4 0.4 -2.4 -1.8 0 -1.8Z', hex);
    for (const [x, y] of [[-4.4, -3], [-1.6, -5.6], [1.6, -5.6], [4.4, -3]] as const) fill(dr, oval(x, y, 1.35, 1.7), hex);
  });
}

function houndTail(dr: Drawing): void {
  line(dr, 'M93 85C100 83.6 105.4 78 106 70.6', tint(HOUND, -0.1), 5.6);
}

/** Everything of him below the neck: his feet, his long coat, and the short cape over its shoulders. */
function houndBody(dr: Drawing): void {
  // his feet under the hem of the coat, the far one a tone darker
  fill(dr, 'M74 104.6C74 99 78.4 96 84.6 96.4C89.4 96.8 92 99.6 92 104.6Z', tint(HOUND, -0.14));
  lit(dr, 'M54 104.6C54 98.4 59 95.2 66.4 95.8C72 96.2 75 99.4 75 104.6Z', HOUND, 1.6, 0.14);
  line(dr, 'M59.6 100.4V104M64.6 100V104', tint(HOUND, -0.4), 1.2);
  // what shows of his neck, in the shade of his head
  fill(dr, 'M68 46H85V62H68Z', tint(HOUND, -0.12));
  const coat = 'M63 57C58.6 70 56 84 55.4 96.6H97C96.4 83 94 69 90 57Z';
  fill(dr, coat, tint(TWEED, -0.12));
  check(dr, coat, [63, 76, 89], [88]);
  // the cape, and the shade it throws on the coat below it
  const cape = 'M62 53C54.6 59 49.6 69 48 79C60 84.6 88 84.6 100.4 77.6C98.6 67.6 95.4 59.4 90.6 53Z';
  inside(dr, coat, () => fill(dr, cape, tint(TWEED, -0.42), at(0, 2.6)));
  fill(dr, cape, TWEED);
  check(dr, cape, [56, 69, 82, 95], [66]);
  // the collar, turned down round his neck
  fill(dr, 'M65 54.6C71 60 86 60 92.6 53.6C87 50 72 50 65 54.6Z', tint(TWEED, -0.24));
}

/** His head about the middle of his skull, looking left: the muzzle, the long ear, the eye, and the deerstalker on top. */
function houndHead(dr: Drawing): void {
  lit(dr, oval(0, 0, 17, 16.4), HOUND, 2.2, 0.14);
  // the muzzle, his nose at the end of it, and his mouth shut on a thought
  lit(dr, rr(-33, -2.4, 35, 17.6, 8.8), MUZZLE, 2, 0.12);
  fill(dr, 'M-33 3.2C-33 -1 -29.8 -3 -26 -3C-22.6 -3 -20.6 -0.8 -21.2 2.2C-21.8 5.4 -25 7.6 -28.6 7.6C-31.2 7.6 -33 5.8 -33 3.2Z', INK);
  line(dr, 'M-26.6 7.6V10.6C-21 14.4 -13 14.4 -7 11', INK, 1.5);
  // the long ear, hanging down past his jaw
  lit(dr, 'M6 -13C15 -14 21 -5 21 7C21 17 18.4 25 14 28.4C9.6 31 6 27.4 5 20.6C3.6 10 3 -3 6 -13Z', EAR, 1.8, 0.2);
  // the eye, on what is in the glass
  eye(dr, -9.4, -4.6, 4.3, [-0.5, 0.6], { colour: HOUND, down: 0.24, slope: 8 });
  // the deerstalker: a peak before and behind, the crown, and the flaps tied in a bow on top
  fill(dr, 'M-16 -7.4C-21 -10.4 -29 -9.2 -33.4 -4.6C-27.4 -2.8 -20.6 -3.2 -14.6 -5.2Z', tint(TWEED, -0.2));
  fill(dr, 'M16 -8C21.4 -7 26.6 -3.4 27.8 1.6C22.6 1.2 17.4 -1.2 14.6 -4.4Z', tint(TWEED, -0.2));
  const crown = 'M-18 -5.6C-17 -17.6 -10 -24.6 0 -24.6C10 -24.6 17 -17.6 18 -5.6C7 -10.4 -7 -10.4 -18 -5.6Z';
  fill(dr, crown, TWEED);
  check(dr, crown, [-12, -1, 10], [-18]);
  fill(dr, 'M-0.6 -24.4C-4 -28.8 -8.2 -28 -7.8 -25C-7.4 -22.8 -3.6 -22.4 -0.6 -24.4Z', tint(TWEED, -0.2));
  fill(dr, 'M0.6 -24.4C4 -28.8 8.2 -28 7.8 -25C7.4 -22.8 3.6 -22.4 0.6 -24.4Z', tint(TWEED, -0.2));
  fill(dr, ring(0, -24.6, 1.9), tint(TWEED, -0.42));
}
/** Where the middle of his skull is, and how far his head is bent to the glass. */
const HOUND_HEAD = [66, 40] as const;
const HOUND_BENT = -13;
/** He is drawn at one size and shown a little larger, grown from the floor between his feet. */
const HOUND_GROWN = 1.1;
const HOUND_STANDS = [64, 106] as const;
const grown = (dr: Drawing, draw: () => void): void => placed(dr, HOUND_STANDS[0] * (1 - HOUND_GROWN), HOUND_STANDS[1] * (1 - HOUND_GROWN), 0, HOUND_GROWN, draw);
const grownPoint = (x: number, y: number): readonly [number, number] => [HOUND_STANDS[0] + (x - HOUND_STANDS[0]) * HOUND_GROWN, HOUND_STANDS[1] + (y - HOUND_STANDS[1]) * HOUND_GROWN];

/** The glass he holds out, the print it has found large in it, and the arm that holds it. */
function houndGlass(dr: Drawing): void {
  line(dr, 'M36.6 83.4L48.6 79.6', '#b4602c', 5.2);
  fill(dr, ring(24, 88, 14.6), '#eaf6fe');
  pawPrint(dr, 24, 89, 1.5, EAR, -16);
  line(dr, ring(24, 88, 14.6), INK, 4);
  line(dr, 'M15.6 82.4C16.8 79.6 19 77.6 21.8 76.8', WHITE, 1.8);
  // the sleeve his arm comes out of the cape in, and the paw on the handle
  line(dr, 'M62 72.6L53 78', tint(TWEED, -0.24), 9.6);
  lit(dr, 'M43.6 77.6C45.4 74.4 50 74 53.4 76C56.4 77.8 57 82 54.6 84.8C52 87.6 46.8 87.2 44.4 84.6C42.6 82.6 42.4 79.8 43.6 77.6Z', HOUND, 1.4, 0.16);
  line(dr, 'M47 76.6L46.2 79.8M50.6 76.2L50 79.4', tint(HOUND, -0.42), 1.2);
}

/** The head bends to the glass at the find, and comes up again. */
const bends: Key[] = [[0, {}], [0.5, {}, 'hold'], [0.56, { r: -5 }, 'out'], [0.84, {}, 'hold'], [0.92, { r: 0 }, 'inOut'], [1, {}, 'hold']];

/**
 * The detective: a hound in a deerstalker and a cape, on his feet and bent
 * over his glass. He lifts it, sets it down again — and there is a print,
 * large in it: his head comes down to look, and his tail gives him away.
 */
const detective: Cover = {
  title: GAME_NAMES.detective,
  loopMs: 6200,
  parts: [
    {
      draw: (dr) => {
        ground(dr, SKY);
        fill(dr, ring(64, 54, 45), tint(SKY, 0.24));
        // the floor he stands on, and his shadow on it
        fill(dr, 'M0 99H120V120H0Z', tint(SKY, -0.1));
        fill(dr, oval(74, 105, 31, 3), tint(SKY, -0.24));
      },
    },
    {
      draw: (dr) => grown(dr, () => houndTail(dr)),
      pivot: grownPoint(93, 85),
      keys: [[0, {}], [0.56, {}, 'hold'], [0.6, { r: 14 }, 'out'], [0.65, { r: -10 }, 'inOut'], [0.7, { r: 12 }, 'inOut'], [0.75, { r: -8 }, 'inOut'], [0.8, { r: 0 }, 'inOut'], [1, {}, 'hold']],
    },
    { draw: (dr) => grown(dr, () => houndBody(dr)) },
    { draw: (dr) => grown(dr, () => placed(dr, HOUND_HEAD[0], HOUND_HEAD[1], HOUND_BENT, 1, () => houndHead(dr))), pivot: grownPoint(78, 52), keys: bends },
    {
      draw: (dr) => grown(dr, () => houndGlass(dr)),
      pivot: grownPoint(58, 76),
      keys: [[0, {}], [0.06, {}, 'hold'], [0.18, { x: 2, y: -7, r: 6 }, 'inOut'], [0.3, {}, 'hold'], [0.42, { x: 0, y: 0, r: 0 }, 'inOut'], [0.5, { s: 1.05 }, 'out'], [0.58, { s: 1 }, 'inOut'], [1, {}, 'hold']],
    },
  ],
};

// ───────────────────────────────────────────────────────────── the last letter

const GRAPE = '#6a4fd3';
/** How big a tile of the two words is, and how far apart two of them stand. */
const LINK = 30;
const STEP = 35;
/**
 * The two words, tile by tile: şêr, a lion, and roj, the sun, which begins
 * on the letter şêr ended on. Each with the row and place it stands at, how
 * it is turned (they were set down by hand), and whether it is that letter.
 */
const CHAIN: ReadonlyArray<readonly [string, number, number, number, boolean]> = [
  ['Ş', 0, 0, -3, false],
  ['Ê', 0, 1, 2, false],
  ['R', 0, 2, -1.5, true],
  ['R', 1, 0, 1.5, true],
  ['O', 1, 1, -2.5, false],
  ['J', 1, 2, 3, false],
];
const linkAt = (row: number, place: number): readonly [number, number] => [10 + place * STEP, 8 + row * 69];
function link(dr: Drawing, i: number): void {
  const [ch, row, place, turn, shared] = CHAIN[i]!;
  const [x, y] = linkAt(row, place);
  turned(dr, turn, x + LINK / 2, y + LINK / 2, () => tile(dr, x, y, LINK, shared ? tones(GOLD) : CREAM, ch, INK));
}
/**
 * A tile's acting. The first word stays where it is, so the cover is never
 * bare; the second is taken away and set down again tile by tile, once the
 * arrow has shown where it must begin. Then both words are read through, each
 * tile with a small jump in its turn.
 */
const laid = (i: number): Key[] => {
  const read: Key[] = [[0.72 + i * 0.03, {}, 'hold'], [0.76 + i * 0.03, { y: -3 }, 'out'], [0.81 + i * 0.03, { y: 0 }, 'in'], [1, {}, 'hold']];
  if (i < 3) return [[0, {}], ...read];
  const down = 0.34 + (i - 3) * 0.09;
  return [[0, {}], [0.05, {}, 'hold'], [0.09, { s: 0.5, o: 0 }, 'in'], [down, {}, 'hold'], [down + 0.07, { s: 1, o: 1 }, 'back'], ...read];
};

/**
 * The last letter: two words in tiles, and the rule of the game drawn between
 * them — the letter one word ends on is the letter the next begins with. Both
 * are gold, and a white arrow goes from the one to the other.
 */
const lastLetter: Cover = {
  title: GAME_NAMES['last-letter'],
  loopMs: 6000,
  parts: [
    {
      draw: (dr) => {
        ground(dr, GRAPE);
        fill(dr, ring(60, 60, 51), tint(GRAPE, 0.09));
      },
    },
    {
      // from the end of the first word round to the start of the second
      draw: (dr) => {
        // it stops short of the tile it points at, so its head is seen whole
        line(dr, 'M95 47.6V49.6C95 54 91.4 57.6 87 57.6H33C28.6 57.6 25 61.2 25 65.6V66', PAPER, 4.6);
        dr.add(`<path d="M17.4 64.4H32.6L25 73Z" fill="${PAPER}" stroke="${PAPER}" stroke-width="2.4" stroke-linejoin="round"/>`);
      },
      pivot: [95, 50],
      keys: [[0, {}], [0.05, {}, 'hold'], [0.09, { o: 0 }, 'in'], [0.2, {}, 'hold'], [0.3, { o: 1 }, 'out'], [1, {}, 'hold']],
    },
    ...CHAIN.map((entry, i): Part => {
      const [x, y] = linkAt(entry[1], entry[2]);
      return { draw: (dr) => link(dr, i), pivot: [x + LINK / 2, y + LINK / 2], keys: laid(i) };
    }),
  ],
};

// ───────────────────────────────────────────────────────────── the impostor

const MUSTARD = '#f4b73b';
/** The dark he is cut out of: a keyhole, and all of him that is in shadow. */
const DARK = '#2a1f47';
const TRENCH = '#fff1d8';
const FELT = '#a98bf2';
/**
 * A keyhole: a round hole over a slot that widens to its foot. It is the
 * shape of somebody in a hat and a long coat, seen from where nobody should
 * be looking — which is who the impostor is.
 */
const KEYHOLE = `${ring(60, 47, 35)}M38.4 73L12.6 109.4C10.6 112.6 12.6 116.6 16.4 116.6H103.6C107.4 116.6 109.4 112.6 107.4 109.4L81.6 73Z`;
/** His eyes: where each is, and the lid that makes it sly. The near one is the narrower. */
const EYES: ReadonlyArray<readonly [number, number, number, Lid]> = [
  [49.2, 57.6, 7, { colour: DARK, down: 0.44, slope: 9 }],
  [70.8, 57.6, 7, { colour: DARK, down: 0.32, slope: -9 }],
];

function stranger(dr: Drawing): void {
  // the keyhole, standing a little off the wall
  fill(dr, KEYHOLE, tint(MUSTARD, -0.2), at(0, 3.4));
  fill(dr, KEYHOLE, DARK);
  // his coat in the slot of it, in two halves: each with its collar turned up in a round wing beside his face
  fill(dr, 'M19.6 111.6C17.4 111.6 16.4 109.6 17.6 107.8L38.6 81C37.4 76.6 37.6 72.6 40 69.8C42.6 67 46.8 67.6 48.4 70.8L58.2 91.6V111.6Z', TRENCH);
  fill(dr, 'M100.4 111.6C102.6 111.6 103.6 109.6 102.4 107.8L81.4 81C82.6 76.6 82.4 72.6 80 69.8C77.4 67 73.2 67.6 71.6 70.8L61.8 91.6V111.6Z', TRENCH);
  for (const [x, y] of [[69.6, 98.4], [70.6, 106]] as const) fill(dr, ring(x, y, 2.2), DARK);
  for (const [x, y, r] of EYES) fill(dr, ring(x, y, r), WHITE);
}
/** He is drawn about the middle of the keyhole's round and shown a little higher, so the whole keyhole sits in the middle of the cover. */
const raised = (dr: Drawing, draw: () => void): void => placed(dr, 0, -2.4, 0, 1, draw);

function strangerEyes(dr: Drawing): void {
  for (const [x, y, r] of EYES) {
    fill(dr, ring(x - 2.4, y + 0.8, r * 0.46), INK);
    fill(dr, ring(x - 1.6, y - 0.2, r * 0.13), WHITE);
  }
}
function strangerLids(dr: Drawing): void {
  for (const [x, y, r, lid] of EYES) eyelid(dr, x, y, r, lid);
}
function strangerHat(dr: Drawing): void {
  turned(dr, -5, 60, 40, () => {
    fill(dr, 'M27.6 41C39 36 81 36 92.4 41C92.4 45 79 48 60 48C41 48 27.6 45 27.6 41Z', FELT);
    const crown = 'M40.6 40C39.6 30 43 19.4 51 17.6C55.2 16.8 57.4 20.6 60 20.6C62.6 20.6 64.8 16.8 69 17.6C77 19.4 80.4 30 79.4 40C69 43 51 43 40.6 40Z';
    fill(dr, crown, FELT);
    inside(dr, crown, () => fill(dr, 'M34 31.4H86V39.6H34Z', tint(FELT, -0.42)));
    line(dr, 'M30.4 42.8C41 47 79 47 89.6 42.8', tint(FELT, -0.3), 1.3);
  });
}

/**
 * The impostor: a keyhole with somebody in it. A hat, a coat with its collar
 * up, and between them nothing but two eyes — which go from one side to the
 * other under their lids, because he is the one who does not have the word.
 */
const impostor: Cover = {
  title: GAME_NAMES.impostor,
  loopMs: 5600,
  parts: [
    {
      draw: (dr) => {
        ground(dr, MUSTARD);
        raised(dr, () => stranger(dr));
      },
    },
    {
      draw: (dr) => raised(dr, () => strangerEyes(dr)),
      keys: [[0, {}], [0.1, {}, 'hold'], [0.13, { x: 4.6 }, 'out'], [0.34, {}, 'hold'], [0.37, { x: 0 }, 'out'], [0.52, {}, 'hold'], [0.55, { x: 4.6 }, 'out'], [0.66, {}, 'hold'], [0.69, { x: 0 }, 'out'], [1, {}, 'hold']],
    },
    { draw: (dr) => raised(dr, () => strangerLids(dr)) },
    { draw: (dr) => raised(dr, () => strangerHat(dr)), pivot: [60, 40], keys: [[0, {}], [0.7, {}, 'hold'], [0.76, { y: 2, r: -3 }, 'out'], [0.86, {}, 'hold'], [0.93, { y: 0, r: 0 }, 'inOut'], [1, {}, 'hold']] },
  ],
};

// ───────────────────────────────────────────────────────────── who am I?

const MINT = '#bfe8cf';
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
  placed(dr, 60, 51, -6, 1, () => {
    const paper = 'M-17 -17H17V9L9 17H-17Z';
    fill(dr, paper, tint(HIDDEN, -0.3), at(1.6, 2.4));
    fill(dr, paper, NOTE);
    fill(dr, 'M17 9L9 17V11C9 9.9 9.9 9 11 9Z', tint(NOTE, -0.2));
    fill(dr, 'M-17 -17H17V-11.4H-17Z', tint(NOTE, 0.34));
    write(dr, '?', -letterWidth(19) / 2, -8.4, 19, INK, 4.2);
  });
}

/** One of the two answers the table gives, in a bubble of its own colour: erê, yes; na, no. */
function answer(dr: Drawing, x: number, w: number, word: string, hex: string, from: number, toX: number): void {
  const [y, h, k] = [82, 20, 10];
  const [r, b] = [x + w, y + h];
  // whoever says it is out of the picture, below: the bubble's tail goes down to them
  const outline =
    `M${n(x + k)} ${n(y)}H${n(r - k)}A${k} ${k} 0 0 1 ${n(r)} ${n(y + k)}A${k} ${k} 0 0 1 ${n(r - k)} ${n(b)}` +
    `H${n(from + 4.6)}L${n(toX)} ${n(b + 9)}L${n(from - 4.6)} ${n(b)}H${n(x + k)}A${k} ${k} 0 0 1 ${n(x)} ${n(y + k)}A${k} ${k} 0 0 1 ${n(x + k)} ${n(y)}Z`;
  fill(dr, outline, tint(hex, -0.3), at(0, 2.6));
  fill(dr, outline, hex);
  const size = 8.4;
  const step = letterWidth(size) + 2.2;
  const left = x + (w - (step * word.length - 2.2)) / 2;
  // the word is set a little low, to leave ê its hat
  [...word].forEach((ch, i) => write(dr, ch, left + i * step, y + (h - size) / 2 + 1.2, size, WHITE, 2));
}
/** An answer being given: its bubble swells and settles. */
const answers = (...starts: number[]): Key[] => [[0, {}], ...starts.flatMap((t): Key[] => [[t, {}, 'hold'], [t + 0.04, { s: 1.22 }, 'out'], [t + 0.11, { s: 1 }, 'inOut']]), [1, {}, 'hold']];

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
        ground(dr, MINT);
        fill(dr, ring(60, 52, 46), tint(MINT, 0.42));
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
    { draw: (dr) => answer(dr, 87, 30, 'NA', CORAL, 107, 113), pivot: [102, 92], keys: answers(0.6) },
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
