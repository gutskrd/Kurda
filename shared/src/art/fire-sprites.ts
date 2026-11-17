/**
 * Layout shared by both apps and the sprite painter (`scripts/generate-fire-sprites.mjs`) for the streak fire's
 * flame: each burning stage is a loop of pre-painted frames on one sheet, played frame by frame. This module says how
 * frames lie on a sheet, how fast they play, and where the flame stands in the fire's box (`FIRE_VIEW`).
 */
import type { FireStage } from '../fire-stages.js';
import type { Box } from './fire-shapes.js';
import type { Pt } from './svg.js';

/** A stage that burns: every stage but cold logs. */
type LitStage = Exclude<FireStage, 'cold'>;

/** Frames in one loop: about 20 a second, a whole number of loops per fire clock (`FIRE_CYCLE_MS`). */
export const FIRE_SPRITE_FRAMES = 20;
export const FIRE_SPRITE_MS = 960;
/** How the frames lie on a sheet: left to right, then the next row down. */
export const FIRE_SPRITE_COLS = 5;
export const FIRE_SPRITE_ROWS = 4;

/** Where the flame stands: the middle of the logs, behind them. Every stage grows up and out from here. */
export const FIRE_ROOT: Pt = [100, 228];

/**
 * Each stage's flame width and height above its root, on the day the stage is reached and the day before the next.
 * Screens are laid out round these values.
 */
export const FIRE_FLAME_REACH: Readonly<Record<LitStage, { from: { w: number; h: number }; to: { w: number; h: number } }>> = {
  spark: { from: { w: 39, h: 46 }, to: { w: 41, h: 51 } },
  kindling: { from: { w: 68, h: 80 }, to: { w: 72, h: 90 } },
  campfire: { from: { w: 95, h: 118 }, to: { w: 99, h: 130 } },
  bigfire: { from: { w: 112, h: 147 }, to: { w: 117, h: 162 } },
  bonfire: { from: { w: 120, h: 169 }, to: { w: 125, h: 182 } },
  blaze: { from: { w: 126, h: 185 }, to: { w: 131, h: 200 } },
  newroz: { from: { w: 131, h: 204 }, to: { w: 136, h: 220 } },
};

/** Room a frame keeps past the flame: across for its sway, up for the drop pinching off its tip, down for its foot behind the logs. */
const SIDE_ROOM = 0.22;
const TOP_ROOM = 0.15;
const FOOT_ROOM = 6;

/** Sheet pixels per unit of the fire's box: about twice the usual display size, more for the young flames shown closer. */
const SHARPNESS: Readonly<Record<LitStage, number>> = { spark: 2.4, kindling: 2, campfire: 1.6, bigfire: 1.4, bonfire: 1.3, blaze: 1.3, newroz: 1.3 };

/** One stage's sheet. */
export interface FireSprite {
  stage: LitStage;
  /** The file name, the same in both apps' fire folder. */
  file: string;
  /** What each frame holds, in the fire's box: the flame at its fullest, standing on its root. */
  box: Box;
  /** One frame and the whole sheet, in pixels. */
  frame: { w: number; h: number };
  sheet: { w: number; h: number };
}

function sprite(stage: LitStage): FireSprite {
  const { w, h } = FIRE_FLAME_REACH[stage].to;
  const half = Math.ceil((w / 2) * (1 + SIDE_ROOM));
  const top = Math.max(0, Math.floor(FIRE_ROOT[1] - h * (1 + TOP_ROOM)));
  const box = { x: FIRE_ROOT[0] - half, y: top, w: half * 2, h: FIRE_ROOT[1] + FOOT_ROOM - top };
  const frame = { w: Math.round(box.w * SHARPNESS[stage]), h: Math.round(box.h * SHARPNESS[stage]) };
  return { stage, file: `${stage}.webp`, box, frame, sheet: { w: frame.w * FIRE_SPRITE_COLS, h: frame.h * FIRE_SPRITE_ROWS } };
}

export const FIRE_SPRITES: Readonly<Record<LitStage, FireSprite>> = {
  spark: sprite('spark'),
  kindling: sprite('kindling'),
  campfire: sprite('campfire'),
  bigfire: sprite('bigfire'),
  bonfire: sprite('bonfire'),
  blaze: sprite('blaze'),
  newroz: sprite('newroz'),
};

/** Where frame `i` of a loop lies on its sheet, in frames across and down. */
export function fireSpriteCell(i: number): { col: number; row: number } {
  const at = ((Math.floor(i) % FIRE_SPRITE_FRAMES) + FIRE_SPRITE_FRAMES) % FIRE_SPRITE_FRAMES;
  return { col: at % FIRE_SPRITE_COLS, row: Math.floor(at / FIRE_SPRITE_COLS) };
}
