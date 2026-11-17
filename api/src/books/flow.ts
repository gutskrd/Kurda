/**
 * How the Hevalo book breaks into pages: the rules a typesetter keeps, as
 * arithmetic on heights, so they can be tested without drawing a page.
 *
 * A chapter is a run of blocks, each of a known height with a known space
 * above it. They are set one under another until the page is full, and a
 * break never falls where it would leave something stranded:
 *
 *  - a block marked `keep` is never the last thing on a page: a heading
 *    stays with what it heads, a picture with its caption;
 *  - a list never leaves one line behind: its first two items stay together
 *    and so do its last two (`keepList` marks them `hold`). A hold is the
 *    softer rule: it is kept unless keeping it would leave the page more
 *    than `HOLD_SHARE` empty, where a line on its own is the lesser harm;
 *  - the space above a block is dropped at the top of a page;
 *  - a block marked `fresh` always opens a page of its own, wherever the
 *    one before it ends: a section the reader is sent to by its page.
 *
 * A page that is nearly full is then spread to the foot (`settle`): the
 * little that is left over is shared out among the spaces between its
 * blocks, so pages end on one line as a set book's do. A page left more
 * than that short is left as it is, with its space at the bottom.
 */

export interface FlowItem {
  /** how tall it is */
  height: number;
  /** the space above it, which the top of a page takes away */
  gap: number;
  /** never the last thing on a page: it stays with what follows it */
  keep?: boolean;
  /** stays with what follows it as `keep` does, unless that would leave its page more than `HOLD_SHARE` empty */
  hold?: boolean;
  /** always the first thing on a page: the page before it ends where it is */
  fresh?: boolean;
}

/** One page of a run: the blocks it holds, from `from` up to but not including `to`, and how much of the page they take. */
export interface FlowPage {
  from: number;
  to: number;
  used: number;
}

/**
 * Break a run of blocks into pages of `room` points (the first may have less
 * room left, `firstRoom`). A block taller than a page still gets a page to
 * itself rather than being lost.
 */
export function paginate(items: readonly FlowItem[], room: number, firstRoom = room): FlowPage[] {
  const pages: FlowPage[] = [];
  const used = (from: number, to: number): number => {
    let y = 0;
    for (let k = from; k < to; k++) y += (k === from ? 0 : items[k]!.gap) + items[k]!.height;
    return y;
  };
  let start = 0;
  let y = 0;
  let cap = firstRoom;
  let i = 0;
  while (i < items.length) {
    const h = (i === start ? 0 : items[i]!.gap) + items[i]!.height;
    if (items[i]!.fresh && i > start) {
      // a block that opens a page: the page ends before it, whatever it ends on
      pages.push({ from: start, to: i, used: used(start, i) });
      start = i;
      y = 0;
      cap = room;
      continue;
    }
    if (y + h > cap + 1e-6 && i > start) {
      // the break falls before this block, or before the first of the kept blocks that lead up to it
      let cut = i;
      for (;;) {
        while (cut - 1 > start && items[cut - 1]!.keep) cut -= 1;
        if (!(cut - 1 > start && items[cut - 1]!.hold)) break;
        // a held block goes over too, with the kept ones before it, while the page it leaves is still full enough
        let next = cut - 1;
        while (next - 1 > start && items[next - 1]!.keep) next -= 1;
        if (used(start, next) < cap * (1 - HOLD_SHARE)) break;
        cut = next;
      }
      // a page that would be left holding only kept blocks keeps them all, and breaks where it must
      if (cut - 1 === start && items[start]!.keep) cut = i;
      pages.push({ from: start, to: cut, used: used(start, cut) });
      start = cut;
      i = cut;
      y = 0;
      cap = room;
      continue;
    }
    y += h;
    i += 1;
  }
  if (items.length > start) pages.push({ from: start, to: items.length, used: used(start, items.length) });
  return pages;
}

/**
 * Mark a list's items so that a page break never leaves one of them alone:
 * the first holds to the second and the one before the last to the last; a
 * list of three or fewer holds together whole. Returns the same items,
 * marked.
 */
export function keepList<T extends { hold?: boolean }>(items: T[]): T[] {
  const n = items.length;
  if (n <= 3) {
    for (let i = 0; i < n - 1; i++) items[i]!.hold = true;
    return items;
  }
  items[0]!.hold = true;
  items[n - 2]!.hold = true;
  return items;
}

/** How much of a page may be left empty to keep a held block with what follows it: more than this, and the hold gives way. */
export const HOLD_SHARE = 0.25;

/** How much of a page's height may be shared out to bring its last block to the foot: more than this and the page is left short. */
export const SETTLE_SHARE = 0.13;

/**
 * Where each block of a page sits, from the top of its room: one under
 * another with their spaces, and, when the page is nearly full and is not
 * the last of its run, spread so that the last block ends at the foot. The
 * space left over is shared among the gaps in proportion to their size, so
 * the wide space above a heading opens more than the hair between two lines.
 */
export function settle(items: readonly FlowItem[], page: FlowPage, room: number, last: boolean): number[] {
  const slack = room - page.used;
  let gaps = 0;
  for (let k = page.from + 1; k < page.to; k++) gaps += items[k]!.gap;
  const share = !last && slack > 0 && slack <= room * SETTLE_SHARE && gaps > 0 ? slack / gaps : 0;
  const at: number[] = [];
  let y = 0;
  for (let k = page.from; k < page.to; k++) {
    if (k > page.from) y += items[k]!.gap * (1 + share);
    at.push(y);
    y += items[k]!.height;
  }
  return at;
}
