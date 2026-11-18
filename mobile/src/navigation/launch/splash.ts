import type { ColorScheme } from '../../theme/appearance';
import { DARK, LIGHT } from '../../theme/palette';

/**
 * What the native splash shows, so the launch screen can open on exactly the same picture and the hand-off does not
 * jump. app.json names the splash's colour and picture and a test keeps them in step with these. The splash-screen
 * config plugin draws the picture `imageWidth` points wide, centred, which is what `SPLASH_IMAGE_WIDTH` is.
 */

/** The splash's colour: the first stop of the page's gradient, so the gradient can fade in over it with no seam. */
export const SPLASH_BACKGROUND: Record<ColorScheme, string> = { light: LIGHT.gradient[0], dark: DARK.gradient[0] };

/** How wide the splash picture is drawn, in points, centred in the window. */
export const SPLASH_IMAGE_WIDTH = 280;

/**
 * Where the deer is in the splash picture, as shares of its side: the picture is square with the deer's head and
 * shoulders centred, this wide, eyes this far down. Measured from its pixels so Hevalo arrives with his eyes on the
 * picture's.
 */
export const SPLASH_DEER = { width: 0.42, eyes: 0.53 } as const;

/** The launch's beats, in milliseconds from the first frame. */
export const LAUNCH = {
  /** The gradient starts to come in over the flat colour. */
  groundMs: 60,
  /** The splash deer starts to give way to Hevalo. */
  heroMs: 120,
  /** How long the picture takes to go. */
  pictureMs: 260,
  /** The name and the line under it rise. */
  wordsMs: 280,
  /** One pass of the light across the page, there and back. */
  washMs: 7000,
} as const;

/** The light drifting across the launch page: faint enough to be felt rather than seen. */
export const WASH: Record<ColorScheme, string> = { light: 'rgba(255,255,255,0.6)', dark: 'rgba(255,255,255,0.05)' };

/**
 * Where Hevalo is drawn in the splash picture's `box`-point square, matching the picture's deer: as wide, eyes on its
 * eyes. `figure` is his drawing's frame and `eyes` its eye position, as shares of that frame.
 */
export function heroPlace(
  box: number,
  figure: { w: number; h: number },
  eyes: { x: number; y: number },
): { width: number; height: number; left: number; top: number } {
  const width = box * SPLASH_DEER.width;
  const height = (width * figure.h) / figure.w;
  return { width, height, left: box / 2 - eyes.x * width, top: box * SPLASH_DEER.eyes - eyes.y * height };
}
