/**
 * The painted valley (art/valley.ts) and its landmarks hold together. Every
 * tree's limbs run into the crown they carry and every trunk into its
 * leaves, so no picture of the road shows a branch stopping short in the
 * air: the trees drawn limb by limb (`grownTree`) refuse to be drawn
 * otherwise, and the older round trees and poplars, which the lesson path
 * still plants, are measured from what they draw. The Newroz fire's flames at
 * rest are the very flames the apps make flicker over them. And a landmark
 * laid on a page of its own colour casts that page's shade, not the meadow's.
 */
import { describe, expect, it } from 'vitest';
import { PATH_LANDMARKS } from '../path-world.js';
import { BOOK_SPOTS, bookSpotSvg } from './book.js';
import { PATH_LANDMARK_LOOP, pathLandmarkSvg, pathLoopSvg } from './path-landmark.js';
import { seeded } from './svg.js';
import { FLAME, bark, foliage, grownTree, limbsReachCrown, orchardTree, poplar, poplarLeaves, roundTree, type TreeShape } from './valley.js';

/** Every point a path's absolute commands pass through or pull toward, in order. */
function points(d: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const m of d.matchAll(/[MLC]([^A-Za-z]+)/g)) {
    const nums = m[1]!.trim().split(/[\s,]+/).map(Number);
    for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i]!, nums[i + 1]!]);
  }
  return out;
}

const paths = (svg: string): string[] => [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]!);

describe('the valley’s trees', () => {
  it('runs every limb of an orchard tree into its crown, whatever its size, its lean and its hand', () => {
    for (const s of [0.4, 0.62, 0.9, 1.3]) {
      for (const lean of [-1.2, -0.4, 0, 0.6, 1.2]) {
        for (const seed of ['a', 'b', 'c', 'd']) {
          const tree = orchardTree(60, 100, s, lean, seeded(seed));
          expect(limbsReachCrown(tree), `${s} ${lean} ${seed}`).toBe(true);
          expect(() => grownTree(tree, foliage(false, '#f0a346'), bark(false), '#bfd291', seeded(seed))).not.toThrow();
        }
      }
    }
  });

  it('refuses to draw a tree whose limb stops short of its crown, or that has no crown at all', () => {
    const good = orchardTree(60, 100, 1, 0, seeded('x'));
    const short: TreeShape = { ...good, limbs: [...good.limbs.slice(1), { from: good.fork, bend: [40, 88], to: [30, 86], width: 1.6 }] };
    expect(limbsReachCrown(short)).toBe(false);
    expect(() => grownTree(short, foliage(false), bark(false), '#bfd291', seeded('x'))).toThrow(RangeError);
    expect(limbsReachCrown({ ...good, lobes: [] })).toBe(false);
    // a trunk with no limbs of its own has to fork inside its crown
    expect(limbsReachCrown({ ...good, limbs: [], fork: [good.lobes[1]!.x, good.lobes[1]!.y] })).toBe(true);
    expect(limbsReachCrown({ ...good, limbs: [], fork: [60, 96] })).toBe(false);
  });

  it('draws the limbs between the crown’s shade and its face, so each one disappears into the leaves', () => {
    const svg = grownTree(orchardTree(60, 100, 1, 0, seeded('y')), foliage(false), bark(false), '#bfd291', seeded('y'));
    const fills = [...svg.matchAll(/ fill="(#[0-9a-f]{6})"/g)].map((m) => m[1]!);
    const leaf = foliage(false);
    expect(fills.indexOf(leaf.shade)).toBeLessThan(fills.lastIndexOf(bark(false).face));
    expect(fills.lastIndexOf(bark(false).face)).toBeLessThan(fills.indexOf(leaf.face));
  });

  it('grows the round trees’ and the poplars’ trunks up into their crowns, as the lesson path plants them', () => {
    for (const s of [0.5, 0.72, 1, 1.4]) {
      for (const seed of ['p', 'q', 'r']) {
        // a round tree: its shadow, its trunk, then its crown; the trunk's top is well inside the crown
        const [, trunk, crown] = paths(roundTree(60, 100, s, foliage(false), '#bfd291', seeded(seed)));
        const top = Math.min(...points(trunk!).map(([, y]) => y));
        const ys = points(crown!).map(([, y]) => y);
        const xs = points(crown!).map(([x]) => x);
        expect(top, `round ${s} ${seed}`).toBeLessThan(Math.max(...ys) - 2 * s);
        expect(Math.min(...xs)).toBeLessThan(60);
        expect(Math.max(...xs)).toBeGreaterThan(60);
      }
      // a poplar: its shadow, its stem, then its leaves, whose foot comes down past the top of the stem
      const [, stem, leaves] = paths(poplar(60, 100, s, poplarLeaves(false), '#bfd291'));
      const stemTop = Math.min(...points(stem!).map(([, y]) => y));
      expect(stemTop, `poplar ${s}`).toBeLessThan(Math.max(...points(leaves!).map(([, y]) => y)));
    }
  });

  it('draws every landmark of the road and every one of the book’s small things with its trees joined up', () => {
    for (const landmark of PATH_LANDMARKS) for (const dark of [false, true]) expect(() => pathLandmarkSvg({ landmark, dark })).not.toThrow();
    for (const spot of BOOK_SPOTS) expect(() => bookSpotSvg({ spot })).not.toThrow();
  });
});

describe('a landmark on a page of its own colour', () => {
  it('casts the shade it is given instead of the meadow’s green, and refuses one that is not a colour', () => {
    // every landmark that stands on the meadow's shade (the snowbound hearth stands on snow)
    const onGrass = PATH_LANDMARKS.filter((landmark) => pathLandmarkSvg({ landmark }).includes('fill="#bfd291"'));
    expect(onGrass.length).toBeGreaterThanOrEqual(PATH_LANDMARKS.length - 1);
    for (const landmark of onGrass) {
      const page = pathLandmarkSvg({ landmark, shade: '#e9c9b0' });
      expect(page, landmark).not.toContain('fill="#bfd291"');
      expect(page, landmark).toContain('fill="#e9c9b0"');
    }
    for (const shade of ['green', '#FFF', 'url(#a)']) expect(() => pathLandmarkSvg({ landmark: 'gate', shade }), shade).toThrow(RangeError);
  });
});

describe('the Newroz fire', () => {
  it('draws its flames at rest as the very flames the apps make flicker over them, in the box they flicker in', () => {
    const still = pathLandmarkSvg({ landmark: 'newroz' });
    const moving = pathLoopSvg({ kind: 'flame' });
    for (const d of [FLAME.outer, FLAME.face, FLAME.core]) {
      expect(still).toContain(d);
      expect(moving).toContain(d);
    }
    const loop = PATH_LANDMARK_LOOP.newroz;
    expect(loop.kind).toBe('flame');
    expect(loop.w / loop.h).toBeCloseTo(FLAME.w / FLAME.h, 2);
    expect(still).toContain(`translate(${loop.x} ${loop.y}) scale(${loop.w / FLAME.w})`);
  });
});
