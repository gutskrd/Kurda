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
 *    and so do its last two (`keepList` marks them so);
 *  - the space above a block is dropped at the top of a page.
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
    if (y + h > cap + 1e-6 && i > start) {
      // the break falls before this block, or before the first of the kept blocks that lead up to it
      let cut = i;
      while (cut - 1 > start && items[cut - 1]!.keep) cut -= 1;
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
 * the first stays with the second and the last with the one before it; a
 * list of three or fewer stays whole. Returns the same items, marked.
 */
export function keepList<T extends { keep?: boolean }>(items: T[]): T[] {
  const n = items.length;
  if (n <= 3) {
    for (let i = 0; i < n - 1; i++) items[i]!.keep = true;
    return items;
  }
  items[0]!.keep = true;
  items[n - 2]!.keep = true;
  return items;
}

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
