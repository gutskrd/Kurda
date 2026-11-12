/**
 * The random draws a solo round is made with, cheap enough to run for every
 * item of every round.
 *
 * `seededShuffle` (content/exercises.ts) keys one HMAC per element, which is
 * right for a lesson's few options but not for a round that draws decoys from
 * a pool of tens of thousands of words, item after item, on the request
 * thread. Here one keyed digest of the seed (`keyedDigest`, under the same
 * server secret, so a draw still cannot be reproduced outside the server)
 * starts a small generator (sfc32), and every number the item needs comes
 * from it. The same seed gives the same draws on every instance.
 *
 * `order` hands out a list's items in a random order one at a time without
 * shuffling the rest first, so a draw that stops after a few — the decoys an
 * item needs — costs a few steps, not the pool's length.
 */
import { keyedDigest } from '../content/exercises.js';

export interface Draw {
  /** a number in [0, 1) */
  next(): number;
  /** a whole number in [0, n) */
  below(n: number): number;
  /** a copy of `items` in a random order */
  shuffle<T>(items: readonly T[]): T[];
  /** `items` in a random order, one at a time, touching only what is handed out */
  order<T>(items: readonly T[]): Generator<T, void, undefined>;
  /** at most `n` of `items`, drawn at random (all of them, shuffled, when there are no more) */
  sample<T>(items: readonly T[], n: number): T[];
}

/** sfc32: four 32-bit words of state, a few additions and shifts a number. */
function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/** The draws for one seed: one keyed digest, then the generator. */
export function drawFor(seed: string): Draw {
  const digest = keyedDigest(seed);
  const next = sfc32(digest.readUInt32LE(0), digest.readUInt32LE(4), digest.readUInt32LE(8), digest.readUInt32LE(12));
  // the first numbers of a fresh state are the least mixed: they are passed over
  for (let i = 0; i < 12; i++) next();
  const below = (n: number): number => Math.floor(next() * n);
  function* order<T>(items: readonly T[]): Generator<T, void, undefined> {
    // Fisher–Yates over the indices, with only the places moved so far remembered
    const moved = new Map<number, number>();
    for (let i = 0; i < items.length; i++) {
      const j = i + below(items.length - i);
      const pick = moved.get(j) ?? j;
      moved.set(j, moved.get(i) ?? i);
      yield items[pick]!;
    }
  }
  return {
    next,
    below,
    order,
    shuffle: <T>(items: readonly T[]): T[] => [...order(items)],
    sample: <T>(items: readonly T[], n: number): T[] => {
      const out: T[] = [];
      if (n <= 0) return out;
      for (const item of order(items)) {
        out.push(item);
        if (out.length >= n) break;
      }
      return out;
    },
  };
}

/**
 * A number from 0 to 1 for each label under one seed, from a keyed digest of
 * the two: the same number on every replica, and none of them to be worked
 * out from the others. Who Am I? orders its tiles, its questions and its
 * hidden identities by these; a plain hash of the seed there let a client
 * that saw one order compute the rest, the hidden identity among them.
 */
export function unitFor(seed: string): (label: string) => number {
  return (label) => keyedDigest(`${seed}\u0000${label}`).readUInt32LE(0) / 4294967296;
}
