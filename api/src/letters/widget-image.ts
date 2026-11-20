import { createHash } from 'node:crypto';
import sharp from 'sharp';
import {
  DEFAULT_PAPER,
  LETTER_BIRD_FEET,
  LETTER_SILL,
  PAPER_H,
  PAPER_PAGES,
  WIDGET_IMAGE,
  letterBirdSvg,
  letterPaperSvg,
  letterWindowSvg,
  type LetterDecor,
  type WidgetSky,
} from '@kurda/shared';
import type { WidgetPicture } from './widget.js';

/**
 * The letter widget's picture: the letter's paper with its drawing and the writer's pigeon in a lower corner, or,
 * before any letter, your own pigeon on the windowsill. No text: the widget sets the name and opening in the phone's
 * own type, so Kurdish shapes correctly in either script. Drawn from the shared art into one SVG and rendered with
 * sharp at the widget's pixel size; renderings are cached by content and size, and the ETag lets a widget hear 304.
 */

export interface WidgetImageSize {
  /** points, as the widget is laid out */
  w: number;
  h: number;
  /** the screen's pixels per point */
  scale: number;
}

/** The picture's size in pixels: the points times the density, no side past `WIDGET_IMAGE.maxPixels`. */
export function widgetPixels(size: WidgetImageSize): { width: number; height: number } {
  let [width, height] = [size.w * size.scale, size.h * size.scale];
  const over = Math.max(width, height) / WIDGET_IMAGE.maxPixels;
  if (over > 1) [width, height] = [width / over, height / over];
  return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
}

/** A drawing set into another at a place and size: its own `<svg>` opened there, keeping its viewBox. */
function placed(svg: string, x: number, y: number, width: number, height: number): string {
  const r = (v: number): string => String(Math.round(v * 10) / 10);
  return svg.replace(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="[^"]*" height="[^"]*"/, `<svg x="${r(x)}" y="${r(y)}" width="${r(width)}" height="${r(height)}"`);
}

/** How far a standing pigeon reaches within its square, either way round, so its corner leaves this much clear. */
const REACH = { x0: 0.24, x1: 0.88, y1: 0.86 } as const;

/** The letter on its paper, the top of it filling the picture, its writer's pigeon in the corner away from where the writing starts. */
function letterSvg(picture: Extract<WidgetPicture, { kind: 'letter' }>, width: number, height: number): string {
  const paper = letterPaperSvg({ paper: picture.decor?.paper ?? DEFAULT_PAPER, strokes: picture.decor?.strokes ?? [], width, height, idPrefix: 'wp' });
  const short = Math.min(width, height);
  const side = short * 0.5;
  const margin = short * 0.035;
  // Left-to-right writing ends on the right, so the pigeon stands bottom right facing into the page; mirrored for RTL.
  const facingLeft = !picture.rtl;
  const bird = letterBirdSvg({ bird: picture.bird, facingLeft, size: side, idPrefix: 'wb' });
  const left = facingLeft ? width - margin - (1 - REACH.x0) * side : margin - REACH.x0 * side;
  const top = height - margin - REACH.y1 * side;
  return wrap(width, height, placed(paper, 0, 0, width, height) + placed(bird, left, top, side, side));
}

/** How far down the window's square the picture reaches: just under the sill's front edge, keeping the pigeon in view. */
const UNDER_SILL = 0.9;

/** Your window with your own pigeon waiting on the sill, filling the picture, the sill and the pigeon always in it. */
function emptySvg(bird: number, sky: WidgetSky, width: number, height: number): string {
  const share = LETTER_SILL.birdShare * 120;
  const pigeon = placed(
    letterBirdSvg({ bird, size: share, idPrefix: 'eb' }),
    LETTER_SILL.x - (LETTER_BIRD_FEET.x / 120) * share,
    LETTER_SILL.y - (LETTER_BIRD_FEET.y / 120) * share,
    share,
    share,
  );
  const window = letterWindowSvg({ sky, size: 120, idPrefix: 'ew' }).replace(/<\/svg>$/, `${pigeon}</svg>`);
  // The window is square: a wide widget shows a band ending under the sill, a tall one its middle.
  const side = Math.max(width, height / UNDER_SILL);
  const x = (width - side) / 2;
  const y = Math.min(0, height - side * UNDER_SILL);
  return wrap(width, height, placed(window, x, y, side, side));
}

const wrap = (width: number, height: number, inner: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${inner}</svg>`;

/** How wide a letter's drawing is rendered for the picture check, in pixels; its length follows the sheet. */
const DRAWING_CHECK_WIDTH = 600;

/**
 * A letter's drawing as one picture, for the picture check before it is delivered: the paper with what is drawn on it
 * and no words (the letter's words are screened as text), as long as the drawing reaches, one page at least.
 */
export async function letterDrawingPng(decor: Pick<LetterDecor, 'paper' | 'strokes'>): Promise<Buffer> {
  let lowest = 0;
  for (const stroke of decor.strokes) for (let i = 1; i < stroke.points.length; i += 2) lowest = Math.max(lowest, stroke.points[i]!);
  const length = Math.min(PAPER_H * PAPER_PAGES, Math.max(PAPER_H, Math.ceil(lowest + 40)));
  const svg = letterPaperSvg({ paper: decor.paper, strokes: decor.strokes, length, width: DRAWING_CHECK_WIDTH, texture: false, idPrefix: 'lc' });
  return sharp(Buffer.from(svg)).png({ compressionLevel: 8 }).toBuffer();
}

/** What a rendering is kept under: everything it shows, and its size. */
export function widgetImageKey(picture: WidgetPicture, sky: WidgetSky, width: number, height: number): string {
  if (picture.kind === 'empty') return `empty:${picture.bird}:${sky}:${width}x${height}`;
  // a letter never changes once sent, but its writer may choose another pigeon
  return `letter:${picture.letterId}:${picture.bird}:${picture.rtl ? 'rtl' : 'ltr'}:${width}x${height}`;
}

/** The ETag of a rendering: its key, hashed, so it says nothing of the letter. */
export const widgetImageEtag = (key: string): string => `"${createHash('sha256').update(`letter-widget:${key}`).digest('base64url').slice(0, 27)}"`;

/** Renderings kept, the most recently used last; a few hundred kilobytes each at most. */
const KEPT = 64;
const kept = new Map<string, Buffer>();

/** The widget's picture as a PNG, rendered or kept. */
export async function widgetImage(picture: WidgetPicture, sky: WidgetSky, size: WidgetImageSize): Promise<{ png: Buffer; key: string }> {
  const { width, height } = widgetPixels(size);
  const key = widgetImageKey(picture, sky, width, height);
  const hit = kept.get(key);
  if (hit) {
    kept.delete(key);
    kept.set(key, hit);
    return { png: hit, key };
  }
  const svg = picture.kind === 'letter' ? letterSvg(picture, width, height) : emptySvg(picture.bird, sky, width, height);
  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 8 }).toBuffer();
  kept.set(key, png);
  if (kept.size > KEPT) kept.delete(kept.keys().next().value as string);
  return { png, key };
}
