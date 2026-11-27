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
import { HOMES_LOOPS } from './gift-loop-homes.js';
import { LORE_LOOPS } from './gift-loop-lore.js';

export const GIFT_LOOPS: Readonly<Partial<Record<GiftArtId, GiftLoop>>> = { ...SKY_LOOPS, ...WARM_LOOPS, ...HOMES_LOOPS, ...LORE_LOOPS };

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

// ─────────────────────────────────────────────────────────────── how many play at once

/** How many gift loops a page plays at once: the most visible; the rest show their still. */
export const GIFT_LOOP_LIMIT = 3;

/** A loop's place on the stage: its standing can change, and it leaves when it no longer wants to play. */
export interface GiftLoopTurn {
  update(score: number): void;
  leave(): void;
}

/**
 * The loops that want to play on one page, of which only the `limit` with the highest score do (the most visible), the
 * earliest to ask first among equals. Each hears through `onTurn` whenever its turn starts or ends.
 */
export function giftLoopStage(limit = GIFT_LOOP_LIMIT): { join(score: number, onTurn: (playing: boolean) => void): GiftLoopTurn; playing(): number } {
  const entries = new Map<number, { score: number; onTurn: (playing: boolean) => void; playing: boolean }>();
  let next = 0;
  const settle = (): void => {
    const ranked = [...entries.entries()].sort(([a, x], [b, y]) => y.score - x.score || a - b);
    ranked.forEach(([, e], i) => {
      const playing = i < limit;
      if (playing === e.playing) return;
      e.playing = playing;
      e.onTurn(playing);
    });
  };
  return {
    join(score, onTurn) {
      const id = next++;
      entries.set(id, { score, onTurn, playing: false });
      settle();
      return {
        update(s) {
          const e = entries.get(id);
          if (!e || e.score === s) return;
          e.score = s;
          settle();
        },
        leave() {
          const e = entries.get(id);
          if (!e) return;
          entries.delete(id);
          if (e.playing) e.onTurn(false);
          settle();
        },
      };
    },
    playing: () => [...entries.values()].filter((e) => e.playing).length,
  };
}
