/**
 * What part of a picture ends up in the picture.
 *
 * The framing is kept in the source image's own terms — a zoom, and a centre as
 * a share of the width and height — rather than as pixels on screen. The
 * preview is whatever size the window allows and the export is whatever size
 * the server accepts, so anything measured against the on-screen box would land
 * somewhere else in the file. A share of the image is the same share at any
 * size.
 *
 * Zoom starts at 1, which is not "actual size" but "the largest crop of this
 * shape that fits". At 1 you see as much of the picture as the shape allows;
 * above 1 you are closing in. That is the useful floor, because it is the point
 * where the frame is still completely covered — there is no arrangement that
 * leaves a strip of background showing, so the composer never has to draw one.
 */

export interface Frame {
  /** ≥ 1. 1 is the largest crop of this shape that fits inside the picture. */
  zoom: number;
  /** the centre of the crop, as a share of the picture's width and height */
  cx: number;
  cy: number;
}

/** A rectangle in the source picture's own pixels, ready for `drawImage`. */
export interface CropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export const ZOOM_RANGE = { min: 1, max: 5 } as const;

export const WHOLE_PICTURE: Frame = { zoom: 1, cx: 0.5, cy: 0.5 };

/** Is this frame untouched — the whole picture, centred? */
export function isWholePicture(frame: Frame): boolean {
  return frame.zoom === 1 && frame.cx === 0.5 && frame.cy === 0.5;
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/**
 * The biggest rectangle of the wanted shape that fits inside the picture.
 *
 * This is the zoom-1 crop, and every other crop is this one divided by the
 * zoom, which is what keeps the frame covered at every setting.
 */
export function widestCrop(iw: number, ih: number, aspect: number): { w: number; h: number } {
  const w = Math.min(iw, ih * aspect);
  return { w, h: w / aspect };
}

/** Hold a frame where it can actually go: zoom in range, crop inside the picture. */
export function clampFrame(iw: number, ih: number, aspect: number, frame: Frame): Frame {
  const zoom = clamp(frame.zoom, ZOOM_RANGE.min, ZOOM_RANGE.max);
  const widest = widestCrop(iw, ih, aspect);
  const sw = widest.w / zoom;
  const sh = widest.h / zoom;
  // half a crop from each edge — the centre cannot go closer than that or the
  // crop would hang off the picture
  const halfX = sw / 2 / iw;
  const halfY = sh / 2 / ih;
  return {
    zoom,
    // a crop as wide as the picture can only be centred, so lo > hi is possible
    cx: halfX * 2 >= 1 ? 0.5 : clamp(frame.cx, halfX, 1 - halfX),
    cy: halfY * 2 >= 1 ? 0.5 : clamp(frame.cy, halfY, 1 - halfY),
  };
}

/** The frame as a rectangle of source pixels. */
export function cropRect(iw: number, ih: number, aspect: number, frame: Frame): CropRect {
  const f = clampFrame(iw, ih, aspect, frame);
  const widest = widestCrop(iw, ih, aspect);
  const sw = widest.w / f.zoom;
  const sh = widest.h / f.zoom;
  return { sx: f.cx * iw - sw / 2, sy: f.cy * ih - sh / 2, sw, sh };
}

/**
 * Drag the picture under the frame.
 *
 * The movement arrives in the pixels of whatever box is on screen, so it is
 * converted through the crop's own width: dragging half way across the box
 * moves the picture by half a crop, whatever the box happens to measure.
 * Dragging the picture right moves the frame left, hence the negation.
 */
export function panFrame(
  iw: number,
  ih: number,
  aspect: number,
  frame: Frame,
  dxPx: number,
  dyPx: number,
  boxW: number,
  boxH: number,
): Frame {
  if (boxW <= 0 || boxH <= 0) return frame;
  const { sw, sh } = cropRect(iw, ih, aspect, frame);
  return clampFrame(iw, ih, aspect, {
    zoom: frame.zoom,
    cx: frame.cx - (dxPx / boxW) * (sw / iw),
    cy: frame.cy - (dyPx / boxH) * (sh / ih),
  });
}

/**
 * Zoom, keeping a point of the picture under the same place on screen.
 *
 * Zooming about the centre is the wrong behaviour for a wheel or a pinch: what
 * you are pointing at is what you want to keep. `ax`/`ay` are that point as a
 * share of the box (0.5, 0.5 being its middle), which is what a slider passes
 * when it has no anchor to offer.
 */
export function zoomFrame(
  iw: number,
  ih: number,
  aspect: number,
  frame: Frame,
  nextZoom: number,
  ax = 0.5,
  ay = 0.5,
): Frame {
  const zoom = clamp(nextZoom, ZOOM_RANGE.min, ZOOM_RANGE.max);
  const before = cropRect(iw, ih, aspect, frame);
  // the picture point under the anchor, in shares of the picture
  const px = (before.sx + ax * before.sw) / iw;
  const py = (before.sy + ay * before.sh) / ih;
  const widest = widestCrop(iw, ih, aspect);
  const sw = widest.w / zoom;
  const sh = widest.h / zoom;
  // put that same point back under the same anchor at the new size
  return clampFrame(iw, ih, aspect, {
    zoom,
    cx: px + (0.5 - ax) * (sw / iw),
    cy: py + (0.5 - ay) * (sh / ih),
  });
}

/** The shapes a picture can be posted in. `null` keeps the picture's own. */
export interface AspectChoice {
  key: string;
  label: string;
  ratio: number | null;
}

export const ASPECTS: readonly AspectChoice[] = [
  { key: 'original', label: 'Original', ratio: null },
  { key: 'square', label: 'Square', ratio: 1 },
  { key: 'portrait', label: 'Portrait', ratio: 4 / 5 },
  { key: 'wide', label: 'Wide', ratio: 16 / 9 },
];

/** The ratio to frame at: the chosen shape, or the picture's own. */
export function ratioFor(choice: number | null, iw: number, ih: number): number {
  return choice ?? (ih === 0 ? 1 : iw / ih);
}
