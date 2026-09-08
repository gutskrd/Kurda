import { fitWithin } from './photoText';
import { drawLayers, type Layer } from './layers';
import { ASPECTS, WHOLE_PICTURE, cropRect, ratioFor, widestCrop, type Frame } from './frame';

/**
 * Everything a person decided about a picture.
 *
 * The shape it is cropped to, where the crop sits, and what has been put on
 * top. One value rather than three pieces of state, because undo has to move
 * all of it together: re-framing and then adding a sticker and then pressing
 * undo should take back the sticker and leave the framing alone, and that only
 * works if every step is a snapshot of the whole decision.
 */
export interface Composition {
  /** which of `ASPECTS`; kept as the key so it survives a reload of the list */
  aspectKey: string;
  frame: Frame;
  layers: Layer[];
}

export const UNTOUCHED: Composition = {
  aspectKey: 'original',
  frame: WHOLE_PICTURE,
  layers: [],
};

/** The ratio a composition is framed to, given the picture it is framing. */
export function aspectOf(doc: Composition, iw: number, ih: number): number {
  const choice = ASPECTS.find((a) => a.key === doc.aspectKey) ?? ASPECTS[0]!;
  return ratioFor(choice.ratio, iw, ih);
}

/**
 * How big the exported picture is.
 *
 * Derived from the shape rather than from the zoom, so that closing in does not
 * quietly change the size of the file. Zooming samples a smaller part of the
 * source into the same output — which is what zooming is, and why it goes soft
 * eventually — instead of producing a different picture each notch.
 *
 * Capped by `fitWithin`: the server resizes to its own maximum anyway, so a
 * larger export is only a bigger upload for it to throw away.
 */
export function outputSize(iw: number, ih: number, aspect: number): { width: number; height: number } {
  const widest = widestCrop(iw, ih, aspect);
  return fitWithin(Math.max(1, Math.round(widest.w)), Math.max(1, Math.round(widest.h)));
}

/**
 * Draw a composition onto a canvas.
 *
 * The preview and the export both come through here, so what is arranged is
 * what is stored. The MyKurda mark is not drawn: the server adds it last, so
 * that nothing added here can end up on top of it.
 */
export function compose(
  canvas: HTMLCanvasElement,
  image: CanvasImageSource,
  iw: number,
  ih: number,
  doc: Composition,
): { width: number; height: number } {
  const aspect = aspectOf(doc, iw, ih);
  const size = outputSize(iw, ih, aspect);
  drawLayers(canvas, image, size.width, size.height, doc.layers, cropRect(iw, ih, aspect, doc.frame));
  return size;
}
