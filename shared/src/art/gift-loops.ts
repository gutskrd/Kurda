/**
 * Every gift's living round (gift-loop.ts), gathered from each shelf's own file, and where the apps find the pictures
 * of its parts: beside the still picture, in a folder named for the gift and the shape of its round, so an app that
 * knows an older round never stacks a newer one's parts, and simply keeps the still.
 */
import { hashOf } from './svg.js';
import { GIFT_LOOP_SCALE, type GiftLoop, type GiftLoopLayer } from './gift-loop.js';
import type { GiftArtId } from './gift-art.js';
import { SKY_LOOPS } from './gift-loop-sky.js';
import { WARM_LOOPS } from './gift-loop-warm.js';

export const GIFT_LOOPS: Readonly<Partial<Record<GiftArtId, GiftLoop>>> = { ...SKY_LOOPS, ...WARM_LOOPS };

export function giftLoopOf(id: string): GiftLoop | null {
  return (GIFT_LOOPS as Readonly<Record<string, GiftLoop | undefined>>)[id] ?? null;
}

/** A part's file under /cosmetics: `gift-loops/heyv-1x2y3z/halo.png`, the base being `base`. */
export function giftLoopKey(id: GiftArtId, part: string): string {
  const loop = giftLoopOf(id);
  if (!loop) throw new RangeError(`art: gift ${id} has no round`);
  const shape = JSON.stringify([GIFT_LOOP_SCALE, loop.base, loop.layers.map((l) => [l.name, l.box])]);
  return `gift-loops/${id}-${hashOf(shape)}/${part}.png`;
}

/** A gift's round as an app stacks it: the base under everything (null for none), then each layer and its picture. */
export interface GiftLoopPicture {
  id: GiftArtId;
  loop: GiftLoop;
  base: string | null;
  layers: ReadonlyArray<{ layer: GiftLoopLayer; src: string }>;
}

const STILL = /^(.*\/)gifts\/made-\d+-([a-z][a-z-]*)\.png(?:[?#].*)?$/;

/**
 * The round of the gift whose still picture is at `still` (the shop's `/cosmetics/gifts/made-07-heyv.png`, or the
 * same under a site's address), with its parts' addresses beside it; null for any other picture.
 */
export function giftLoopPicture(still: string | null | undefined): GiftLoopPicture | null {
  const m = still ? STILL.exec(still) : null;
  if (!m) return null;
  const [, root, id] = m as unknown as [string, string, GiftArtId];
  const loop = giftLoopOf(id);
  if (!loop) return null;
  return {
    id,
    loop,
    base: loop.base === 'own' ? root + giftLoopKey(id, 'base') : loop.base === 'still' ? still! : null,
    layers: loop.layers.map((layer) => ({ layer, src: root + giftLoopKey(id, layer.name) })),
  };
}
