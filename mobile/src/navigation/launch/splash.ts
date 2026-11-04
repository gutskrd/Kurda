import type { ColorScheme } from '../../theme/appearance';
import { DARK, LIGHT } from '../../theme/palette';

/**
 * What the native splash shows, so the launch screen can open on exactly that.
 *
 * The native splash is a flat colour with the deer from the app icon in the
 * middle of the window; the first frame the app draws for itself has to be
 * the same picture, or the hand-off from one to the other is a jump — a
 * purple screen cutting to a grey one, the deer leaping to another place.
 * app.json names the colour and the picture for the splash; this names the
 * same for the launch screen, and a test holds the two together.
 *
 * On the current Expo release the splash is drawn only by the splash-screen
 * package's own config plugin, from its `imageWidth`: the picture is that
 * many points wide, centred in the window, on the colour. The launch screen
 * draws the picture the same way, so `SPLASH_IMAGE_WIDTH` is the number to
 * give the plugin.
 */

/** The splash's colour: the first stop of the page's gradient, so the gradient can fade in over it with no seam. */
export const SPLASH_BACKGROUND: Record<ColorScheme, string> = { light: LIGHT.gradient[0], dark: DARK.gradient[0] };

/** How wide the splash picture is drawn, in points, centred in the window. */
export const SPLASH_IMAGE_WIDTH = 280;

/**
 * Where the deer is in the splash picture, as shares of the picture's side:
 * the picture is square with the deer's head and shoulders in the middle of
 * it, this wide, with its eyes this far down. Measured from the picture's
 * own pixels, so the living Hevalo can arrive with his eyes where the
 * picture's were.
 */
export const SPLASH_DEER = { width: 0.42, eyes: 0.53 } as const;

/** The launch's beats, in milliseconds from the first frame. */
export const LAUNCH = {
  /** the gradient starts to come in over the flat colour */
  groundMs: 60,
  /** the picture's deer starts to give way to the living one */
  heroMs: 120,
  /** how long the picture takes to go */
  pictureMs: 260,
  /** the name and the line under it rise */
  wordsMs: 280,
  /** one pass of the light across the page, there and back */
  washMs: 7000,
} as const;

/** The light that drifts across the launch page: white, faint enough to be felt rather than seen. */
export const WASH: Record<ColorScheme, string> = { light: 'rgba(255,255,255,0.6)', dark: 'rgba(255,255,255,0.05)' };

/**
 * Where the living Hevalo is drawn in the splash picture's box (`box` points
 * square), as the same deer the picture shows: as wide as the picture's deer,
 * with his eyes on the picture's eyes. `figure` is his drawing's frame and
 * `eyes` where its eyes are, as shares of that frame.
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
