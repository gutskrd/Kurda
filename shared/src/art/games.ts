/**
 * The games' pictures, as the apps ask for them: one cover for each game on
 * Learn's Games page (drawn in game-covers.ts), still or in its moving parts.
 *
 * A cover is a whole square of its own colour — an illustration, not an icon
 * on a tile — so the apps show it edge to edge and round its corners
 * themselves. Every game also has a colour (`gameEmblemTone`) for the page
 * the game is played on, taken from its cover, and a hue (`gameEmblemHue`)
 * for the stamp it is on the Games page.
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
import { Drawing, checkSize, prefixFor } from './svg.js';
import type { HueName } from '../hues.js';

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
 * The colour of each game's own page: the one its cover is remembered by,
 * bright enough to tint a surface in the light theme and in the dark. No two
 * games share one, so two games' pages are never the same page to the eye.
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

/**
 * The hue each game's stamp is printed in (shared `hues.ts`): the one nearest
 * the colour its own page is tinted with (`TONES`, above), so a game is the
 * same colour on its stamp and at its table, and no two the same, so a page
 * of stamps is told apart by colour before a word is read. A cover has to
 * stand off its paper by night as well, when the paper is deep: the thief's
 * night sky is lost on an indigo paper and stands clear of a gold one.
 */
const HUE_OF: Readonly<Record<GameEmblem, HueName>> = {
  peyvok: 'green',
  rhyme: 'pink',
  race: 'orange',
  'memory-thief': 'gold',
  detective: 'blue',
  'last-letter': 'indigo',
  impostor: 'violet',
  'who-am-i': 'teal',
};

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

/** The hue a game's stamp is printed in. */
export function gameEmblemHue(game: GameEmblem): HueName {
  coverOf(game);
  return HUE_OF[game];
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
