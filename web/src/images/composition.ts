import { fitWithin } from './photoText';
import { drawLayers, type Layer } from './layers';
import { ASPECTS, WHOLE_PICTURE, cropRect, ratioFor, type Frame } from './frame';

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
 * rendered at 32px in a nav bar does not need a feed photo's resolution.
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
  maxEdge?: number,
): { width: number; height: number } {
  const aspect = aspectOf(doc, iw, ih);
  const size = outputSize(iw, ih, aspect, doc.frame, maxEdge);
  drawLayers(canvas, image, size.width, size.height, doc.layers, cropRect(iw, ih, aspect, doc.frame));
  return size;
}
