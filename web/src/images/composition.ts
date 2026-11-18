import { fitWithin } from './photoText';
import { drawLayers, type Layer } from './layers';
import { ASPECTS, WHOLE_PICTURE, cropRect, ratioFor, type CropRect, type Frame } from './frame';
import {
  ADJUSTMENT_KEYS,
  NEUTRAL,
  applyAdjustments,
  blockSizeFor,
  pixelate,
  type Adjustments,
} from './adjust';
import { NO_FILTER, gradeOf, type Grade, type Overlay } from './filters';
import { stickerImage } from './stickers';

/** Everything decided about a picture: crop shape and position, grade and layers, as one value so undo moves it all together. */
export interface Composition {
  /** Which of `ASPECTS`, by key so it survives a change to the list. */
  aspectKey: string;
  frame: Frame;
  layers: Layer[];
  /** Which of `FILTERS`. */
  filterKey: string;
  /** How much of that filter, 0 to 1. */
  strength: number;
  /** Changes made by hand on top of the filter. */
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

/** Everything done to this picture: the filter at its strength plus the person's own changes, which add. */
function effectiveGrade(doc: Composition): Grade {
  return gradeOf(doc.filterKey, doc.strength, doc.adjustments);
}

/** Whether there is colour work to do, apart from pixelation, which is its own pass. */
function gradesColour(grade: Grade): boolean {
  if (grade.tone && grade.tone.amount > 0) return true;
  return ADJUSTMENT_KEYS.some((k) => k !== 'pixelate' && grade.adjustments[k] !== 0);
}

/** Whether this picture will be changed at all. */
export function gradeDoesNothing(grade: Grade): boolean {
  return !gradesColour(grade) && grade.adjustments.pixelate <= 0 && !grade.overlay;
}

/**
 * Every pixel pass, in order; pixelation first so the grading colours the blocks. Shared by the preview, the export and
 * the filter thumbnails so none can drift.
 */
export function applyGrade(data: Uint8ClampedArray, width: number, height: number, grade: Grade): void {
  if (grade.adjustments.pixelate > 0) {
    pixelate(data, width, height, blockSizeFor(grade.adjustments.pixelate, width, height));
  }
  if (gradesColour(grade)) applyAdjustments(data, width, height, grade.adjustments, grade.tone);
}

/**
 * Lays the overlay artwork over the top-right corner of the photograph, under the layers, keeping its proportions.
 * Returns whether it drew: the graded picture is cached, and caching one drawn before the artwork arrived would freeze
 * the gap.
 */
export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  overlay: Overlay,
): boolean {
  const art = stickerImage(overlay.src);
  if (!art || art.naturalWidth === 0 || art.naturalHeight === 0) return false;
  // A fully transparent overlay draws nothing but is not unfinished.
  if (overlay.opacity <= 0) return true;
  const ratio = art.naturalHeight / art.naturalWidth;
  let w = width * overlay.widthShare;
  let h = w * ratio;
  // Sized by width alone, a nearly square artwork hangs off a landscape crop, and the canvas clips it silently.
  const maxH = height * overlay.maxHeightShare;
  if (h > maxH) {
    h = maxH;
    w = h / ratio;
  }
  ctx.save();
  ctx.globalAlpha = Math.min(1, overlay.opacity);
  ctx.drawImage(art, width - w, 0, w, h);
  ctx.restore();
  return true;
}

/**
 * The exported size: exactly the crop's own pixels, so zooming in gives a smaller picture rather than an upscaled one
 * (`fitWithin` only shrinks; `maxZoomFor` stops the crop getting too small). `maxEdge` lowers the cap for pictures shown
 * small, such as avatars and previews.
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

/** The preview's largest edge: grading touches every pixel, so this sets the cost of dragging a slider. CSS scales it down. */
export const PREVIEW_MAX_EDGE = 720;

/* --- the graded photograph, kept between draws ---------------------------- */

/**
 * The graded photograph, kept between draws so dragging a sticker does not re-grade every pixel on every pointer event.
 * One entry, since the editor has one picture open.
 */
let graded: { key: string; canvas: HTMLCanvasElement } | null = null;

/** An id per image source, so two photos cannot share an entry. */
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

/** Forgets the cached photograph, for when another picture is opened. */
export function forgetGraded(): void {
  graded = null;
}

function gradedPhoto(
  image: CanvasImageSource,
  width: number,
  height: number,
  crop: CropRect,
  grade: Grade,
): CanvasImageSource | null {
  const key = `${idOf(image)}|${width}x${height}|${crop.sx},${crop.sy},${crop.sw},${crop.sh}|${grade.signature}`;
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

  let complete = true;
  try {
    const pixels = ctx.getImageData(0, 0, width, height);
    applyGrade(pixels.data, width, height, grade);
    ctx.putImageData(pixels, 0, 0);
    if (grade.overlay) complete = drawOverlay(ctx, width, height, grade.overlay);
  } catch {
    // Reading pixels fails on a tainted canvas. The source is the person's own file so it should not happen, but an
    // ungraded picture beats an exception on the way to posting.
    graded = null;
    return null;
  }

  // Only a finished picture is kept; an unfinished one is shown now and redrawn when its artwork arrives.
  graded = complete ? { key, canvas } : null;
  return canvas;
}

/**
 * Draws a composition onto a canvas, for both preview and export. The Hevalo mark is added later by the server. With no
 * grading, the crop goes straight onto the target without a second canvas.
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
  const grade = effectiveGrade(doc);

  if (gradeDoesNothing(grade)) {
    drawLayers(canvas, image, size.width, size.height, doc.layers, crop);
    return size;
  }

  const photo = gradedPhoto(image, size.width, size.height, crop, grade);
  // The graded copy is already cropped and sized; if grading was refused, fall back to the plain crop.
  if (photo) drawLayers(canvas, photo, size.width, size.height, doc.layers);
  else drawLayers(canvas, image, size.width, size.height, doc.layers, crop);
  return size;
}
