import { fitWithin } from './photoText';
import { drawLayers, type Layer } from './layers';
import { ASPECTS, WHOLE_PICTURE, cropRect, ratioFor, type CropRect, type Frame } from './frame';
import { NEUTRAL, applyAdjustments, combine, isNeutral, scale, type Adjustments } from './adjust';
import { NO_FILTER, presetByKey } from './filters';

/**
 * Everything a person decided about a picture.
 *
 * The shape it is cropped to, where the crop sits, how it is graded, and what
 * has been put on top. One value rather than four pieces of state, because undo
 * has to move all of it together: choosing a filter and then adding a sticker
 * and then pressing undo should take back the sticker and leave the filter
 * alone, and that only works if every step is a snapshot of the whole decision.
 */
export interface Composition {
  /** which of `ASPECTS`; kept as the key so it survives a reload of the list */
  aspectKey: string;
  frame: Frame;
  layers: Layer[];
  /** which of `FILTERS` */
  filterKey: string;
  /** how much of that filter, 0 to 1 */
  strength: number;
  /** what the person changed by hand, on top of the filter */
  adjustments: Adjustments;
}

export const UNTOUCHED: Composition = {
  aspectKey: 'original',
  frame: WHOLE_PICTURE,
  layers: [],
  filterKey: NO_FILTER,
  strength: 1,
  adjustments: NEUTRAL,
};

/** The ratio a composition is framed to, given the picture it is framing. */
export function aspectOf(doc: Composition, iw: number, ih: number): number {
  const choice = ASPECTS.find((a) => a.key === doc.aspectKey) ?? ASPECTS[0]!;
  return ratioFor(choice.ratio, iw, ih);
}

/**
 * The grading that actually gets applied: the filter, turned down to its
 * strength, plus whatever the person moved by hand.
 *
 * They add rather than override because both are expressed the same way, as
 * distances from "unchanged". A filter that warms by 30 and a warmth slider
 * pulled 10 the other way leave 20 — which is what someone dragging that slider
 * while a filter is on expects to happen.
 */
export function effectiveAdjustments(doc: Composition): Adjustments {
  return combine(scale(presetByKey(doc.filterKey).adjustments, doc.strength), doc.adjustments);
}

/**
 * How big the exported picture is: exactly the pixels the crop actually has.
 *
 * This used to be derived from the shape alone and held constant through the
 * zoom, which meant closing in sampled fewer and fewer source pixels and then
 * stretched them back up to the same output. That is how zooming wrecked a
 * photograph — by the top of the range it was a five-fold upscale of a fifth of
 * the picture.
 *
 * Taking the crop's own size instead means the export never enlarges anything:
 * zoom in and you get a smaller picture, not a mushier one. `fitWithin` only
 * ever shrinks, so under the cap this is a 1:1 copy of the pixels that were
 * chosen. The zoom itself stops before the crop gets too small to be worth
 * posting — see `maxZoomFor`.
 *
 * `maxEdge` lowers the ceiling for a picture known to be shown small: an avatar
 * rendered at 32px in a nav bar does not need a feed photo's resolution, and a
 * preview does not need the export's.
 */
export function outputSize(
  iw: number,
  ih: number,
  aspect: number,
  frame: Frame,
  maxEdge?: number,
): { width: number; height: number } {
  const crop = cropRect(iw, ih, aspect, frame);
  return fitWithin(Math.max(1, Math.round(crop.sw)), Math.max(1, Math.round(crop.sh)), maxEdge);
}

/**
 * The preview is drawn no larger than this.
 *
 * Grading is a pass over every pixel, so the size of the preview is the cost of
 * dragging a slider. At 720 that is half a million pixels, which lands inside a
 * frame; at the export's 1280 it would be three times that and the slider would
 * stutter. The preview is scaled down by CSS anyway — nobody is looking at a
 * 1280px canvas in a 500px column.
 */
export const PREVIEW_MAX_EDGE = 720;

/* --- the graded photograph, kept between draws ---------------------------- */

/**
 * Grading costs a pass over every pixel, and dragging a sticker redraws on
 * every pointer event. Without this, moving one sticker across a 720px preview
 * would re-grade half a million pixels a few hundred times over — for nothing,
 * because the photograph underneath did not change.
 *
 * One entry, because the editor only ever has one picture open.
 */
let graded: { key: string; canvas: HTMLCanvasElement } | null = null;

/** Identity for an image source, so two different photos cannot share an entry. */
const sourceIds = new WeakMap<object, number>();
let nextSourceId = 1;
function idOf(image: CanvasImageSource): number {
  const key = image as unknown as object;
  const seen = sourceIds.get(key);
  if (seen !== undefined) return seen;
  const id = nextSourceId++;
  sourceIds.set(key, id);
  return id;
}

/** Forget the cached photograph — for when a different picture is opened. */
export function forgetGraded(): void {
  graded = null;
}

function gradedPhoto(
  image: CanvasImageSource,
  width: number,
  height: number,
  crop: CropRect,
  adj: Adjustments,
): CanvasImageSource | null {
  const key = JSON.stringify([idOf(image), width, height, crop, adj]);
  if (graded && graded.key === key) return graded.canvas;

  const canvas = graded?.canvas ?? document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height);

  try {
    const pixels = ctx.getImageData(0, 0, width, height);
    applyAdjustments(pixels.data, width, height, adj);
    ctx.putImageData(pixels, 0, 0);
  } catch {
    // reading pixels back is refused on a tainted canvas. Our source is the
    // person's own file so this should not happen, but an ungraded picture
    // beats no picture, and beats an exception on the way to posting.
    graded = null;
    return null;
  }

  graded = { key, canvas };
  return canvas;
}

/**
 * Draw a composition onto a canvas.
 *
 * The preview and the export both come through here, so what is arranged is
 * what is stored. The MyKurda mark is not drawn: the server adds it last, so
 * that nothing added here can end up on top of it.
 *
 * With no grading to do there is no second canvas and no pixel pass — the crop
 * goes straight onto the target, exactly as it did before filters existed.
 */
export function compose(
  canvas: HTMLCanvasElement,
  image: CanvasImageSource,
  iw: number,
  ih: number,
  doc: Composition,
  maxEdge?: number,
): { width: number; height: number } {
  const aspect = aspectOf(doc, iw, ih);
  const size = outputSize(iw, ih, aspect, doc.frame, maxEdge);
  const crop = cropRect(iw, ih, aspect, doc.frame);
  const adj = effectiveAdjustments(doc);

  if (isNeutral(adj)) {
    drawLayers(canvas, image, size.width, size.height, doc.layers, crop);
    return size;
  }

  const photo = gradedPhoto(image, size.width, size.height, crop, adj);
  // the graded copy is already cropped and already the right size, so it goes
  // on whole; if grading was refused, fall back to the plain crop
  if (photo) drawLayers(canvas, photo, size.width, size.height, doc.layers);
  else drawLayers(canvas, image, size.width, size.height, doc.layers, crop);
  return size;
}
