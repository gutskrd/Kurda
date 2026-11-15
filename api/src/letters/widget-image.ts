import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { DEFAULT_PAPER, LETTER_BIRD_FEET, LETTER_SILL, WIDGET_IMAGE, letterBirdSvg, letterPaperSvg, letterWindowSvg, type WidgetSky } from '@kurda/shared';
import type { WidgetPicture } from './widget.js';

/**
 * The letter widget's picture (letters/widget.ts): the letter's paper with
 * what was drawn on it and its writer's pigeon in a lower corner, or, before
 * any letter has come, your own pigeon waiting on the windowsill. No text:
 * the widget sets the writer's name and the letter's opening over it in the
 * phone's own type, so Kurdish in either script shapes as it should.
 *
 * Drawn from the same art as every app (`letterPaperSvg`, `letterBirdSvg`,
 * `letterWindowSvg`), the pieces set into one SVG and rendered once with
 * sharp, at the widget's own size in pixels. A rendering is kept in memory by
 * what it shows and its size, so a widget asking again, or a family's phones
 * all showing the same size, costs a lookup; the ETag lets a widget that has
 * it already hear 304.
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

/**
 * How much of its square a standing pigeon reaches, either way round
 * (measured in a browser, the same reach the art's own tests keep to): the
 * corner it stands in leaves this much clear round it.
 */
const REACH = { x0: 0.24, x1: 0.88, y1: 0.86 } as const;

/** The letter on its paper, the top of it filling the picture, its writer's pigeon in the corner away from where the writing starts. */
function letterSvg(picture: Extract<WidgetPicture, { kind: 'letter' }>, width: number, height: number): string {
  const paper = letterPaperSvg({ paper: picture.decor?.paper ?? DEFAULT_PAPER, strokes: picture.decor?.strokes ?? [], width, height, idPrefix: 'wp' });
  const short = Math.min(width, height);
  const side = short * 0.5;
  const margin = short * 0.035;
  // writing that runs left to right ends on the right: the pigeon stands bottom right, facing back into the page; right to left, the other way about
  const facingLeft = !picture.rtl;
  const bird = letterBirdSvg({ bird: picture.bird, facingLeft, size: side, idPrefix: 'wb' });
  const left = facingLeft ? width - margin - (1 - REACH.x0) * side : margin - REACH.x0 * side;
  const top = height - margin - REACH.y1 * side;
  return wrap(width, height, placed(paper, 0, 0, width, height) + placed(bird, left, top, side, side));
}

/** How far down the window's square the picture reaches: just under the sill's front edge, so the pigeon has the room and not the wall below. */
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
  // the window is square: a wide widget shows a band of it ending just under the sill, a tall one its middle
  const side = Math.max(width, height / UNDER_SILL);
  const x = (width - side) / 2;
  const y = Math.min(0, height - side * UNDER_SILL);
  return wrap(width, height, placed(window, x, y, side, side));
}

const wrap = (width: number, height: number, inner: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${inner}</svg>`;

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
