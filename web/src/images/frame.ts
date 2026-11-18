import type { MessageKey } from '../i18n/en';

/**
 * Framing in the source image's own terms: a zoom and a centre as shares of width and height, so it lands the same in
 * the preview and the export. Zoom 1 is the largest crop of the shape that fits, so the frame is always covered.
 */

export interface Frame {
  /** ≥ 1. 1 is the largest crop of this shape that fits inside the picture. */
  zoom: number;
  /** The crop's centre, as a share of the picture's width and height. */
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

/**
 * The smallest worthwhile export, on its longer edge. The export takes the crop's own pixels, so zoom stops where the
 * crop would fall below this rather than upscaling into mush.
 */
export const MIN_EXPORT_EDGE = 512;

/** How far this picture can zoom before the crop falls below `minEdge`; a small, recompressed photo stops early. */
export function maxZoomFor(iw: number, ih: number, aspect: number, minEdge = MIN_EXPORT_EDGE): number {
  const widest = widestCrop(iw, ih, aspect);
  const longest = Math.max(widest.w, widest.h);
  if (minEdge <= 0) return ZOOM_RANGE.max;
  return clamp(longest / minEdge, ZOOM_RANGE.min, ZOOM_RANGE.max);
}

export const WHOLE_PICTURE: Frame = { zoom: 1, cx: 0.5, cy: 0.5 };

/** Whether the frame is untouched: the whole picture, centred. */
export function isWholePicture(frame: Frame): boolean {
  return frame.zoom === 1 && frame.cx === 0.5 && frame.cy === 0.5;
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** The largest rectangle of the shape inside the picture: the zoom-1 crop, which every other crop divides. */
export function widestCrop(iw: number, ih: number, aspect: number): { w: number; h: number } {
  const w = Math.min(iw, ih * aspect);
  return { w, h: w / aspect };
}

/** Holds a frame in range, zoom up to the picture's own `maxZoomFor` and crop inside; every gesture goes through here. */
export function clampFrame(iw: number, ih: number, aspect: number, frame: Frame): Frame {
  const zoom = clamp(frame.zoom, ZOOM_RANGE.min, maxZoomFor(iw, ih, aspect));
  const widest = widestCrop(iw, ih, aspect);
  const sw = widest.w / zoom;
  const sh = widest.h / zoom;
  // The centre stays half a crop from each edge.
  const halfX = sw / 2 / iw;
  const halfY = sh / 2 / ih;
  return {
    zoom,
    // A crop as wide as the picture can only be centred.
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
 * Drags the picture under the frame. Screen pixels are converted through the crop's width, so half the box moves half
 * a crop; dragging right moves the frame left.
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
 * Zooms keeping the picture point under (`ax`, `ay`), shares of the box, in place; a slider passes the middle
 * (0.5, 0.5).
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
  // The picture point under the anchor, as shares of the picture.
  const px = (before.sx + ax * before.sw) / iw;
  const py = (before.sy + ay * before.sh) / ih;
  const widest = widestCrop(iw, ih, aspect);
  const sw = widest.w / zoom;
  const sh = widest.h / zoom;
  // Put that point back under the anchor at the new size.
  return clampFrame(iw, ih, aspect, {
    zoom,
    cx: px + (0.5 - ax) * (sw / iw),
    cy: py + (0.5 - ay) * (sh / ih),
  });
}

/** The shapes a picture can be posted in. `null` keeps the picture's own. */
export interface AspectChoice {
  key: string;
  /** A catalogue key; this module has no React to translate with. */
  labelKey: MessageKey;
  ratio: number | null;
}

export const ASPECTS: readonly AspectChoice[] = [
  { key: 'original', labelKey: 'photo.frame.original', ratio: null },
  { key: 'square', labelKey: 'photo.frame.square', ratio: 1 },
  { key: 'portrait', labelKey: 'photo.frame.portrait', ratio: 4 / 5 },
  { key: 'wide', labelKey: 'photo.frame.wide', ratio: 16 / 9 },
];

/** The ratio to frame at: the chosen shape, or the picture's own. */
export function ratioFor(choice: number | null, iw: number, ih: number): number {
  return choice ?? (ih === 0 ? 1 : iw / ih);
}
