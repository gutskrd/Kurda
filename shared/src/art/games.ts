/**
 * The games' pictures, as the apps ask for them: one cover for each game on
 * Learn's Games page (drawn in game-covers.ts), still or in its moving parts.
 *
 * A cover is a whole square of its own colour — an illustration, not an icon
 * on a tile — so the apps show it edge to edge and round its corners
 * themselves. Every game also has a colour (`gameEmblemTone`) for the page
 * the game is played on, taken from its cover.
 *
 * A cover also moves. It is drawn in parts (`gameEmblemLayers`), each with
 * its own acting (game-acting.ts): the apps lay the parts over one another
 * and play each with transforms and opacity only (the website with the
 * browser's animations, the phone on the native driver), so nothing is drawn
 * again while it moves. Where a reader has asked for less motion the still
 * cover is shown instead.
 */
import { GAME_EMBLEM_SAMPLES, sample, type Cover, type GamePose } from './game-acting.js';
import { COVERS } from './game-covers.js';
import { Drawing, checkSize, prefixFor, tint } from './svg.js';

export { GAME_EMBLEM_SAMPLES, type GamePose };

/** The games that have a cover, by the name each goes by on the Games page. */
export const GAME_EMBLEMS = ['peyvok', 'rhyme', 'race', 'memory-thief', 'detective', 'last-letter', 'impostor', 'who-am-i'] as const;
export type GameEmblem = (typeof GAME_EMBLEMS)[number];

export interface GameArtOptions {
  /** how big it is drawn, in pixels (it is square) */
  size?: number;
  /** its text label; the apps say the game's name beside it and hide the picture from screen readers */
  title?: string;
  idPrefix?: string;
}

/**
 * The colour of each game's own page and of its Play button: the one its
 * cover is remembered by, bright enough to tint a surface in the light theme
 * and in the dark. No two games share one, so a shelf of their buttons is a
 * shelf of eight colours, each the colour of the cover beside it.
 */
const TONES: Readonly<Record<GameEmblem, string>> = {
  peyvok: '#3fa45b',
  rhyme: '#e96a9c',
  race: '#f08a34',
  'memory-thief': '#f2b632',
  detective: '#74bdea',
  'last-letter': '#5468d4',
  impostor: '#8a5bd6',
  'who-am-i': '#2fa7a0',
};

/** The deep ink a word is written in on a light game colour: the art's own, never black. */
const DEEP_INK = '#21182e';
const WHITE_INK = '#ffffff';

/** How light a colour is to the eye (WCAG's relative luminance). */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** How far apart two colours stand for reading, from 1 (the same) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** A game's Play button: its face in the game's colour, the darker lip it stands on, and the ink its word is written in. */
export interface GamePlayColours {
  face: string;
  lip: string;
  ink: string;
}

/**
 * The colours of a game's Play button. The face is the game's own colour;
 * the word on it is white where white reads best and the deep ink where that
 * does (the gold and the sky are too light for white), which for every game
 * clears the 4.5 to 1 that ordinary text needs.
 */
export function gamePlayColours(game: GameEmblem): GamePlayColours {
  const face = gameEmblemTone(game);
  const ink = contrastRatio(face, WHITE_INK) >= contrastRatio(face, DEEP_INK) ? WHITE_INK : DEEP_INK;
  return { face, lip: tint(face, -0.32), ink };
}

export function isGameEmblem(v: unknown): v is GameEmblem {
  return (GAME_EMBLEMS as readonly unknown[]).includes(v);
}

function coverOf(game: GameEmblem): Cover {
  if (!isGameEmblem(game)) throw new RangeError(`art: no game called ${String(game)}`);
  return COVERS[game];
}

/** The colour a game's own page is tinted with. */
export function gameEmblemTone(game: GameEmblem): string {
  coverOf(game);
  return TONES[game];
}

/** A game's cover, still: every part where it is drawn. */
export function gameEmblemSvg(opts: GameArtOptions & { game: GameEmblem }): string {
  const cover = coverOf(opts.game);
  const size = checkSize(opts.size, 120);
  const dr = new Drawing(prefixFor(opts.idPrefix, 'game-emblem', opts.game));
  for (const part of cover.parts) part.draw(dr);
  return dr.svg(size, opts.title ?? cover.title);
}

/** One part of a moving cover: its own picture, the point it turns about, and where it is at every sample of the loop. */
export interface GameEmblemLayer {
  svg: string;
  /** in the picture's units, 0 to 120 from its upper left */
  pivot: readonly [number, number];
  /** GAME_EMBLEM_SAMPLES + 1 poses, evenly spaced over the loop; null for a part that never moves */
  poses: GamePose[] | null;
}

/** How long a game's cover takes to play once. */
export function gameEmblemLoopMs(game: GameEmblem): number {
  return coverOf(game).loopMs;
}

/**
 * A game's cover in its moving parts, back to front. Each is a whole picture
 * of the cover's size holding one part of it, so the apps lay them over one
 * another and move each by its poses.
 */
export function gameEmblemLayers(opts: GameArtOptions & { game: GameEmblem }): GameEmblemLayer[] {
  const cover = coverOf(opts.game);
  const size = checkSize(opts.size, 120);
  const prefix = prefixFor(opts.idPrefix, 'game-emblem-layers', opts.game);
  return cover.parts.map((part, i) => {
    const dr = new Drawing(`${prefix}l${i}`);
    part.draw(dr);
    return { svg: dr.svg(size, opts.title ?? cover.title), pivot: part.pivot ?? [60, 60], poses: part.keys ? sample(part.keys) : null };
  });
}
