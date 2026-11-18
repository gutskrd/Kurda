/**
 * Game covers as the apps request them (drawn in game-covers.ts): one per game on the Games page, still or in moving
 * parts. A cover fills its square edge to edge; the apps round the corners. Each game also has a page tint
 * (`gameEmblemTone`) and a stamp hue (`gameEmblemHue`). The moving version is split into parts (`gameEmblemLayers`)
 * that the apps animate with transforms and opacity only, so nothing is redrawn; under reduced motion they show the
 * still cover.
 */
import { GAME_EMBLEM_SAMPLES, sample, type Cover, type GamePose } from './game-acting.js';
import { COVERS } from './game-covers.js';
import { Drawing, checkSize, prefixFor } from './svg.js';
import type { HueName } from '../hues.js';
import type { PlayGame } from '../play.js';

export { GAME_EMBLEM_SAMPLES, type GamePose };

/** The games that have a cover, by their Games page names. */
export const GAME_EMBLEMS = ['peyvok', 'rhyme', 'race', 'memory-thief', 'detective', 'last-letter', 'impostor', 'who-am-i'] as const;
export type GameEmblem = (typeof GAME_EMBLEMS)[number];

export interface GameArtOptions {
  /** Size in pixels; the drawing is square. */
  size?: number;
  /** The accessible label; the apps print the game's name beside it and hide the picture from screen readers. */
  title?: string;
  idPrefix?: string;
}

/** Each game's page tint, taken from its cover, bright enough for light and dark themes. No two games share one. */
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
 * Each game's stamp hue (shared `hues.ts`): the one nearest its page tint, so a game has one colour on its stamp and its
 * page, and no two games share one. The cover must also stand out on the deep night paper, which rules out some pairs
 * (the thief's night sky is lost on indigo).
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

/** The stamp each multiplayer game uses, so its invites and join pages wear the same picture and colour. Story games have none. */
export const PLAY_GAME_EMBLEM: Readonly<Partial<Record<PlayGame, GameEmblem>>> = {
  'wordle-battle': 'peyvok',
  'rhyme-match': 'rhyme',
  'last-letter': 'last-letter',
  impostor: 'impostor',
  'who-am-i': 'who-am-i',
};

/** A game's stamp hue; null for a story game, which has none and uses the page's violet. */
export function playGameHue(game: PlayGame): HueName | null {
  const emblem = PLAY_GAME_EMBLEM[game];
  return emblem ? HUE_OF[emblem] : null;
}

/** A game's cover, still: every part where it is drawn. */
export function gameEmblemSvg(opts: GameArtOptions & { game: GameEmblem }): string {
  const cover = coverOf(opts.game);
  const size = checkSize(opts.size, 120);
  const dr = new Drawing(prefixFor(opts.idPrefix, 'game-emblem', opts.game));
  for (const part of cover.parts) part.draw(dr);
  return dr.svg(size, opts.title ?? cover.title);
}

/** One part of a moving cover: its picture, its pivot, and its pose at every sample of the loop. */
export interface GameEmblemLayer {
  svg: string;
  /** In picture units, 0 to 120 from the upper left. */
  pivot: readonly [number, number];
  /** GAME_EMBLEM_SAMPLES + 1 poses, evenly spaced over the loop; null for a part that never moves. */
  poses: GamePose[] | null;
}

/** How long a game's cover takes to play once. */
export function gameEmblemLoopMs(game: GameEmblem): number {
  return coverOf(game).loopMs;
}

/** A game's cover in moving parts, back to front; each part is a full-size picture, so the apps stack and move them. */
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
