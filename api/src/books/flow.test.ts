/**
 * How the book breaks into pages (flow.ts), as arithmetic on heights: blocks stack until a page is full; a heading is
 * never left at a page foot; a list never leaves one line behind unless that would leave a page badly short; a section
 * always opens a page; space above a block is dropped at a page top; and a nearly full page is spread to its foot.
 */
import { describe, expect, it } from 'vitest';
import { HOLD_SHARE, SETTLE_SHARE, keepList, paginate, settle, type FlowItem } from './flow.js';

const block = (height: number, gap = 0, keep = false): FlowItem => ({ height, gap, keep });
const held = (height: number, gap = 0): FlowItem => ({ height, gap, hold: true });
const fresh = (height: number, gap = 0): FlowItem => ({ height, gap, fresh: true });
const spans = (items: readonly FlowItem[], room: number, firstRoom?: number): Array<[number, number]> => paginate(items, room, firstRoom).map((p) => [p.from, p.to]);

describe('how the book breaks into pages', () => {
  it('sets blocks one under another, with their spaces, until the page is full', () => {
    const items = [block(30), block(30, 10), block(30, 10), block(30, 10)];
    // two fill 70 of 100 points; a third would need 110
    expect(paginate(items, 100)).toEqual([
      { from: 0, to: 2, used: 70 },
      { from: 2, to: 4, used: 70 },
    ]);
    // a page that is exactly full is full, not over
    expect(spans([block(50), block(40, 10)], 100)).toEqual([[0, 2]]);
    expect(paginate([], 100)).toEqual([]);
  });

  it('drops the space above a block at the top of a page, and of the run', () => {
    const items = [block(60, 40), block(60, 40)];
    const pages = paginate(items, 100);
    // neither block's 40 points of space counts: each stands at the top of its page
    expect(pages.map((p) => p.used)).toEqual([60, 60]);
    // with it, the first could not even have stood on its own page
    expect(spans([block(100, 40)], 100)).toEqual([[0, 1]]);
  });

  it('starts on a page that is already partly used', () => {
    const items = [block(30), block(30, 10), block(30, 10)];
    expect(spans(items, 100, 40)).toEqual([
      [0, 1],
      [1, 3],
    ]);
    expect(spans(items, 100)).toEqual([[0, 2], [2, 3]]);
  });

  it('never leaves a heading at the foot of a page: it goes over with what it heads', () => {
    const items = [block(60), block(20, 10, true), block(30, 5)];
    // the heading would fit under the first block, but what it heads would not
    expect(spans(items, 100)).toEqual([
      [0, 1],
      [1, 3],
    ]);
    // and with room for all three, nothing moves
    expect(spans(items, 130)).toEqual([[0, 3]]);
  });

  it('keeps a run of kept blocks together: a part’s heading, its note’s heading, and the first of the note', () => {
    const items = [block(50), block(15, 10, true), block(10, 4, true), block(40, 4)];
    expect(spans(items, 100)).toEqual([
      [0, 1],
      [1, 4],
    ]);
  });

  it('breaks where it must when kept blocks fill a page by themselves', () => {
    // a heading and a block too tall to stand under it: the heading keeps its page, and the block gets the next
    expect(spans([block(50, 0, true), block(80)], 100)).toEqual([
      [0, 1],
      [1, 2],
    ]);
    // every block kept: the run still ends, and no block is lost or set twice
    const all = Array.from({ length: 7 }, () => block(40, 5, true));
    const pages = paginate(all, 100);
    expect(pages.map((p) => p.to - p.from)).toEqual([2, 2, 2, 1]);
  });

  it('gives a block taller than a page a page to itself rather than lose it', () => {
    expect(paginate([block(20), block(150, 10), block(20, 10)], 100)).toEqual([
      { from: 0, to: 1, used: 20 },
      { from: 1, to: 2, used: 150 },
      { from: 2, to: 3, used: 20 },
    ]);
  });

  it('never leaves one line of a list behind: its first two stay together, and its last two', () => {
    const rows = (n: number): FlowItem[] => keepList(Array.from({ length: n }, () => block(20)));
    expect(rows(5).map((r) => r.hold ?? false)).toEqual([true, false, false, true, false]);
    // room for one row under what is already there: the list starts on the next page instead
    expect(spans([block(78), ...rows(5)], 100)).toEqual([
      [0, 1],
      [1, 6],
    ]);
    // room for all but the last row: the one before it goes over with it
    expect(spans([block(18), ...rows(5)], 100)).toEqual([
      [0, 4],
      [4, 6],
    ]);
    // unmarked, the same rows would have left one behind, and then one over
    const loose = (n: number): FlowItem[] => Array.from({ length: n }, () => block(20));
    expect(spans([block(78), ...loose(5)], 100)).toEqual([[0, 2], [2, 6]]);
    expect(spans([block(18), ...loose(5)], 100)).toEqual([[0, 5], [5, 6]]);
  });

  it('lets a hold give way rather than leave a page more than its share empty', () => {
    // the held row would go over with the row after it, and leave its page 70 points full of 100: too short, so the hold gives way
    expect(1 - 70 / 100).toBeGreaterThan(HOLD_SHARE);
    expect(spans([block(50), held(20), block(20), block(20)], 100)).toEqual([
      [0, 3],
      [3, 4],
    ]);
    expect(spans([block(50), block(20), held(20), block(20)], 100)).toEqual([
      [0, 3],
      [3, 4],
    ]);
    // the same with room enough to spare: the held row goes over
    expect(spans([block(78), held(10), block(20)], 100)).toEqual([
      [0, 1],
      [1, 3],
    ]);
    // a heading before a held row goes with it, and counts against the page it leaves
    expect(spans([block(70), block(8, 0, true), held(10), block(20)], 100)).toEqual([
      [0, 3],
      [3, 4],
    ]);
    expect(spans([block(78), block(4, 0, true), held(10), block(20)], 100)).toEqual([
      [0, 1],
      [1, 4],
    ]);
    // and a kept block is kept whatever it costs
    expect(spans([block(30), block(20, 0, true), block(60)], 100)).toEqual([
      [0, 1],
      [1, 3],
    ]);
  });

  it('opens a page with a fresh block, wherever the page before it ends', () => {
    expect(spans([block(20), block(20), fresh(20), block(20)], 100)).toEqual([
      [0, 2],
      [2, 4],
    ]);
    // a fresh block at the head of a run, or of a page, is where a page starts anyway
    expect(spans([fresh(20), block(20)], 100)).toEqual([[0, 2]]);
    expect(spans([block(90), fresh(20), block(20)], 100)).toEqual([
      [0, 1],
      [1, 3],
    ]);
    // the page it ends is left as it is, its space at the foot
    const items = [block(20), block(20, 10), fresh(20), block(20)];
    const [first] = paginate(items, 100);
    expect(first!.used).toBe(50);
    expect(settle(items, first!, 100, false)).toEqual([0, 30]);
  });

  it('keeps a list of three or fewer whole', () => {
    expect(keepList([block(20), block(20), block(20)]).map((r) => r.hold ?? false)).toEqual([true, true, false]);
    expect(keepList([block(20), block(20)]).map((r) => r.hold ?? false)).toEqual([true, false]);
    expect(keepList([block(20)]).map((r) => r.hold ?? false)).toEqual([false]);
    expect(keepList([])).toEqual([]);
    const three = keepList([block(10), block(10), block(10)]);
    expect(spans([block(80), ...three], 100)).toEqual([
      [0, 1],
      [1, 4],
    ]);
    // it marks the items it is given, and hands the same ones back
    const given = [block(1), block(2)];
    expect(keepList(given)).toBe(given);
  });

  it('holds every block once and in order, fits every page it can, and ends none on a heading it could move', () => {
    // a fixed run of numbers that looks random, so the same lists are tried every time
    let seed = 20261116;
    const next = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let trial = 0; trial < 300; trial++) {
      const room = 200 + Math.floor(next() * 400);
      const items = Array.from({ length: 1 + Math.floor(next() * 40) }, (): FlowItem => {
        const made = block(4 + Math.floor(next() * room * 0.45), Math.floor(next() * 24), next() < 0.3);
        const roll = next();
        return roll < 0.15 ? { ...made, hold: true } : roll < 0.2 ? { ...made, fresh: true } : made;
      });
      const firstRoom = next() < 0.5 ? room : Math.floor(room * next());
      const pages = paginate(items, room, firstRoom);
      // every block once, in order
      expect(pages[0]!.from).toBe(0);
      expect(pages.at(-1)!.to).toBe(items.length);
      pages.forEach((p, k) => {
        expect(p.to).toBeGreaterThan(p.from);
        if (k > 0) expect(p.from).toBe(pages[k - 1]!.to);
        let used = 0;
        for (let i = p.from; i < p.to; i++) used += (i === p.from ? 0 : items[i]!.gap) + items[i]!.height;
        expect(p.used).toBeCloseTo(used, 6);
        // more than one block on a page always fits it
        if (p.to - p.from > 1) expect(p.used).toBeLessThanOrEqual((k === 0 ? firstRoom : room) + 1e-6);
        // a page ends on a kept block only when it holds nothing but kept blocks, or a fresh block opens the next
        if (k < pages.length - 1 && items[p.to - 1]!.keep && !items[p.to]!.fresh) expect(items.slice(p.from, p.to).every((it) => it.keep)).toBe(true);
        // and a fresh block is always the first on its page
        for (let i = p.from + 1; i < p.to; i++) expect(items[i]!.fresh ?? false).toBe(false);
      });
    }
  });

  it('spreads a nearly full page to its foot, opening wide spaces more than narrow ones', () => {
    const items = [block(40), block(30, 10), block(20, 20)];
    const [page] = paginate(items, 130);
    expect(page!.used).toBe(120);
    const at = settle(items, page!, 130, false);
    // the 10 points left over are shared 1 : 2 between the spaces of 10 and 20
    expect(at[0]).toBe(0);
    expect(at[1]).toBeCloseTo(40 + 10 + 10 / 3, 6);
    expect(at[2]).toBeCloseTo(130 - 20, 6);
  });

  it('leaves a page as it is when it is the last of its run, too short to spread, or has no space to open', () => {
    const items = [block(40), block(30, 10), block(20, 20)];
    const [page] = paginate(items, 400);
    const plain = [0, 50, 100];
    expect(settle(items, page!, 130, true)).toEqual(plain);
    // more than the share of a page that may be spread
    const room = Math.ceil(120 / (1 - SETTLE_SHARE)) + 2;
    expect(settle(items, page!, room, false)).toEqual(plain);
    expect(settle(items, page!, 120, false)).toEqual(plain);
    const tight = [block(40), block(30), block(20)];
    expect(settle(tight, paginate(tight, 400)[0]!, 95, false)).toEqual([0, 40, 70]);
    // a page of the middle of a run is placed from its own top
    const run = [block(100), block(40, 10), block(30, 10), block(20, 20), block(100, 10)];
    const pages = paginate(run, 130);
    expect(pages.map((p) => [p.from, p.to])).toEqual([[0, 1], [1, 4], [4, 5]]);
    expect(settle(run, pages[1]!, 130, false)[2]).toBeCloseTo(110, 6);
  });
});
