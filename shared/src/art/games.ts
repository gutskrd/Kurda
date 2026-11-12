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
 */
import { dab, form, ring, rr, type Tones } from './cutout.js';
import { impostorEmblemSvg } from './impostor.js';
import { Drawing, checkSize, n, prefixFor, tint } from './svg.js';

/** The games that have an emblem, by the name each goes by on the Games page. */
export const GAME_EMBLEMS = ['peyvok', 'rhyme', 'race', 'memory-thief', 'what-would-you-say', 'detective', 'last-letter', 'impostor', 'who-am-i'] as const;
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
const TEAL = '#2fa7a0';
const STEEL = '#9aa5b4';
const NIGHT = '#3b2f63';
/** The deep tone lines are drawn in: never black. */
const INK = '#3a2b4d';
const CREAM: Tones = { light: '#fffaf1', base: '#f6ead6', shade: '#cdb898' };
const WHITE: Tones = { light: '#ffffff', base: '#eef2f7', shade: '#bcc6d4' };
const WOOD: Tones = { light: '#f3cf9c', base: '#dba869', shade: '#a2733c' };
const SKIN: Tones = { light: '#fbe3c8', base: '#f0c9a0', shade: '#c79a6c' };

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

// ───────────────────────────────────────────────────────────── the emblems

/** Peyvok: three guesses of four tiles, each closer than the last — grey, then gold where a letter is somewhere else, then green all along. */
const peyvok: Draw = (dr) => {
  const rows = [
    [STEEL, GOLD, STEEL, STEEL],
    [GREEN, STEEL, GOLD, GREEN],
    [GREEN, GREEN, GREEN, GREEN],
  ];
  rows.forEach((row, r) => {
    row.forEach((hex, c) => form(dr, rr(9 + c * 26.5, 15 + r * 31, 22, 24, 6), tones(hex), 3.4, 2));
  });
};

/** Rhyming Words: two things said, one after the other, that end the same way. */
const rhyme: Draw = (dr) => {
  form(dr, `${rr(8, 14, 78, 38, 15)}M24 46L42 50L20 64Z`, CREAM, 4.5, 2.4);
  line(dr, 'M24 33H42', STEEL, 7);
  line(dr, 'M54 33H72', PINK, 7);
  form(dr, `${rr(34, 62, 78, 38, 15)}M96 94L100 112L78 98Z`, tones(tint(PINK, 0.55)), 4.5, 2.4);
  line(dr, 'M48 81H68', tint(PINK, -0.3), 7);
  line(dr, 'M80 81H98', PINK, 7);
};

/** Typing Race: a stopwatch running, and the key that is being pressed. */
const race: Draw = (dr) => {
  form(dr, rr(48, 8, 16, 14, 4), tones(STEEL), 2.4, 1.6);
  turned(dr, 42, 56, 62, () => form(dr, rr(51, 14, 10, 10, 3), tones(STEEL), 2, 1.4));
  form(dr, ring(56, 62, 42), tones(ORANGE), 5, 3);
  form(dr, ring(56, 62, 31), CREAM, 0, 2.4);
  for (const [x, y] of [[56, 38], [80, 62], [56, 86], [32, 62]] as const) fill(dr, ring(x, y, 2.6), tint(INK, 0.45));
  line(dr, 'M56 62L70 45', INK, 5);
  fill(dr, ring(56, 62, 5), INK);
  form(dr, rr(78, 78, 34, 32, 8), WHITE, 4.5, 2.4);
  line(dr, 'M88 94H102', STEEL, 5);
};

/** The Memory Thief: a page of writing, and one of its words lifted clean off it — the gap it left still showing. */
const memoryThief: Draw = (dr) => {
  form(dr, rr(16, 14, 78, 96, 9), CREAM, 5, 2.6);
  const ink = tint(INK, 0.5);
  line(dr, 'M30 36H58', ink, 6);
  line(dr, 'M68 36H80', ink, 6);
  line(dr, 'M30 56H42', ink, 6);
  line(dr, rr(51, 48, 30, 16, 6), tint(GOLD, -0.12), 2.6, ' stroke-dasharray="5 4.5"');
  line(dr, 'M30 76H72', ink, 6);
  line(dr, 'M30 94H54', ink, 6);
  turned(dr, -16, 88, 26, () => {
    form(dr, rr(68, 14, 40, 22, 8), tones(GOLD), 4, 2.2);
    line(dr, 'M79 25H97', tint(GOLD, -0.42), 6);
  });
  fill(dr, sparkle(100, 52, 9), tint(GOLD, 0.25));
  fill(dr, sparkle(60, 18, 6), tint(GOLD, 0.25));
};

/** What Would You Say?: something said to you, and under it the answer that fits. */
const whatWouldYouSay: Draw = (dr) => {
  form(dr, `${rr(8, 14, 74, 40, 15)}M22 48L40 52L16 68Z`, tones(TEAL), 4.5, 2.4);
  line(dr, 'M24 29H64', tint(TEAL, 0.62), 6);
  line(dr, 'M24 42H48', tint(TEAL, 0.62), 6);
  form(dr, `${rr(38, 62, 74, 40, 15)}M98 96L104 114L80 100Z`, tones(GOLD), 4.5, 2.4);
  line(dr, 'M60 82L70 92L90 72', '#fffaf1', 8);
};

/** Kurdish Detective: two cards of evidence, and a glass held over the one thing that matters in them. */
const detective: Draw = (dr) => {
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
  line(dr, 'M88 92L106 110', WOOD.shade, 13);
  line(dr, 'M88 91L105 108', WOOD.base, 8);
  form(dr, ring(68, 72, 30), tones(NIGHT), 4.5, 2.6);
  form(dr, ring(68, 72, 22), tones(SKY), 0, 2.6);
  form(dr, star(68, 73, 12), tones(GOLD), 2, 1.6);
};

/** The Last Letter: three words in a chain, each beginning with what the one before ended on. */
const lastLetter: Draw = (dr) => {
  const word = (x: number, y: number, letters: readonly string[]): void => {
    form(dr, rr(x, y, letters.length * 18 + 10, 28, 9), CREAM, 4, 2.4);
    letters.forEach((hex, i) => form(dr, rr(x + 7 + i * 18, y + 7, 14, 14, 4.5), tones(hex), 1.8, 1.4));
  };
  const quiet = tint(STEEL, 0.1);
  word(6, 12, [quiet, quiet, GREEN]);
  word(18, 46, [GREEN, quiet, quiet, ORANGE]);
  word(50, 80, [ORANGE, quiet, quiet]);
};

/** Who Am I?: someone wearing a card they cannot see, and the two answers they will hear — yes and no. */
const whoAmI: Draw = (dr) => {
  form(dr, rr(27, 72, 66, 40, 20), tones(TEAL), 4, 2.4);
  form(dr, ring(60, 56, 19), SKIN, 3, 2);
  turned(dr, -7, 60, 26, () => {
    form(dr, rr(39, 8, 42, 34, 8), CREAM, 4, 2.4);
    form(dr, star(60, 26, 10.5), tones(GOLD), 1.8, 1.4);
  });
  bead(dr, 17, 60, 10, GREEN, 3);
  bead(dr, 103, 60, 10, RED, 3);
};

const EMBLEMS: Readonly<Record<Exclude<GameEmblem, 'impostor'>, { draw: Draw; title: string }>> = {
  peyvok: { draw: peyvok, title: 'Peyvok' },
  rhyme: { draw: rhyme, title: 'Rhyming Words' },
  race: { draw: race, title: 'Typing Race' },
  'memory-thief': { draw: memoryThief, title: 'The Memory Thief' },
  'what-would-you-say': { draw: whatWouldYouSay, title: 'What Would You Say?' },
  detective: { draw: detective, title: 'Kurdish Detective' },
  'last-letter': { draw: lastLetter, title: 'The Last Letter' },
  'who-am-i': { draw: whoAmI, title: 'Who Am I?' },
};

const TONES: Readonly<Record<GameEmblem, string>> = {
  peyvok: GREEN,
  rhyme: PINK,
  race: ORANGE,
  'memory-thief': GOLD,
  'what-would-you-say': TEAL,
  detective: SKY,
  'last-letter': ORANGE,
  impostor: PURPLE,
  'who-am-i': TEAL,
};

export function isGameEmblem(v: unknown): v is GameEmblem {
  return (GAME_EMBLEMS as readonly unknown[]).includes(v);
}

/** The colour a game's card is tinted with. */
export function gameEmblemTone(game: GameEmblem): string {
  if (!isGameEmblem(game)) throw new RangeError(`art: no game called ${String(game)}`);
  return TONES[game];
}

/** A game's emblem. */
export function gameEmblemSvg(opts: GameArtOptions & { game: GameEmblem }): string {
  if (!isGameEmblem(opts.game)) throw new RangeError(`art: no game called ${String(opts.game)}`);
  const size = checkSize(opts.size, 120);
  if (opts.game === 'impostor') return impostorEmblemSvg({ emblem: 'cards', size, title: opts.title, idPrefix: opts.idPrefix });
  const dr = new Drawing(prefixFor(opts.idPrefix, 'game-emblem', opts.game));
  EMBLEMS[opts.game].draw(dr);
  return dr.svg(size, opts.title ?? EMBLEMS[opts.game].title);
}
