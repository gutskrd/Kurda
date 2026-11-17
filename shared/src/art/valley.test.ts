/**
 * The painted valley (art/valley.ts) and its landmarks hold together. Every
 * tree's limbs run into the crown they carry and every trunk into its
 * leaves, so no picture of the road shows a branch stopping short in the
 * air: the trees drawn limb by limb (`grownTree`) refuse to be drawn
 * otherwise, and the older round trees and poplars, which the lesson path
 * still plants, are measured from what they draw. The Newroz fire burns on
 * its ring of stones on a green mound, its flame at rest in the box the apps
 * make it flicker in. The school flies the flag of Kurdistan, true to the
 * flag, and the apps make the very same cloth stir over it, while the
 * castle keeps its own pennant. And a landmark laid on a page of its own
 * colour casts that page's shade, not the meadow's.
 */
import { describe, expect, it } from 'vitest';
import { PATH_LANDMARKS } from '../path-world.js';
import { BOOK_SPOTS, bookSpotSvg } from './book.js';
import { PATH_LANDMARK_LOOP, pathLandmarkSvg, pathLoopSvg } from './path-landmark.js';
import { seeded } from './svg.js';
import { KURDISTAN_FLAG, VALLEY, bark, foliage, grownTree, kurdistanFlag, kurdistanSun, limbsReachCrown, orchardTree, poplar, poplarLeaves, roundTree, type TreeShape } from './valley.js';

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
  it('burns tall on a ring of eleven fieldstones on its green mound, two almonds in blossom on its slopes', () => {
    const still = pathLandmarkSvg({ landmark: 'newroz' });
    const fills = [...still.matchAll(/ fill="(#[0-9a-f]{6})"/g)].map((m) => m[1]!);
    const count = (colour: string): number => fills.filter((c) => c === colour).length;
    expect(count(VALLEY.stone)).toBe(11);
    expect(count(VALLEY.blossom)).toBe(2);
    expect(count(VALLEY.green)).toBe(1);
    expect(fills).toContain(VALLEY.fire);
    // its flame at rest fills the box the apps make it flicker in, drawn on the moving flame's own canvas
    const loop = PATH_LANDMARK_LOOP.newroz;
    expect(loop).toEqual({ kind: 'flame', x: 45, y: 31, w: 30, h: 46 });
    expect(still).toContain(`<g transform="translate(${loop.x} ${loop.y}) scale(1.2)">`);
    const moving = pathLoopSvg({ kind: 'flame' });
    expect(moving).toContain('viewBox="0 0 26 40"');
    expect(loop.w / loop.h).toBeCloseTo(26 / 40, 2);
  });
});

/** A colour's red, green and blue. */
const rgb = (hex: string): [number, number, number] => [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16)) as [number, number, number];

describe('the school’s flag', () => {
  it('flies the flag of Kurdistan: red over white over green, two deep for three long, by day and by evening', () => {
    for (const dark of [false, true]) {
      const [red, white, green] = [...kurdistanFlag(dark).matchAll(/<path d="([^"]+)" fill="(#[0-9a-f]{6})"/g)].slice(0, 3).map((m) => ({ d: m[1]!, colour: rgb(m[2]!) }));
      // the colours read as the flag's own: a red, a white and a green
      const [r1, g1, b1] = red!.colour;
      expect(r1).toBeGreaterThan(1.8 * Math.max(g1, b1));
      const [r2, g2, b2] = white!.colour;
      expect(Math.min(r2, g2, b2)).toBeGreaterThan(170);
      expect(Math.min(r2, g2, b2)).toBeGreaterThan(0.85 * Math.max(r2, g2, b2));
      const [r3, g3, b3] = green!.colour;
      expect(g3).toBeGreaterThan(1.4 * Math.max(r3, b3));
      // the bands are of one depth and stand in that order, each starting where the one above it ends
      const third = KURDISTAN_FLAG.depth / 3;
      const tops = [red, white, green].map((band) => points(band!.d)[0]!);
      expect(tops[1]![1] - tops[0]![1]).toBeCloseTo(third, 0);
      expect(tops[2]![1] - tops[1]![1]).toBeCloseTo(third, 0);
      // the cloth is three long for every two deep, from the pole to its free end and from the top of the red to the foot of the green
      const all = [red, white, green].flatMap((band) => points(band!.d));
      const long = Math.max(...all.map(([x]) => x)) - Math.min(...all.map(([x]) => x));
      const deep = points(green!.d).at(-1)![1] - tops[0]![1];
      expect(long / deep).toBeCloseTo(1.5, 1);
    }
  });

  it('has the golden sun of twenty-one rays in the middle of the white, one ray standing straight up', () => {
    for (const dark of [false, true]) {
      const flag = kurdistanFlag(dark);
      const sun = /<g transform="translate\(([\d.]+) ([\d.]+)\) scale\(0\.1\)"><path d="([^"]+)" fill="(#[0-9a-f]{6})"\/><\/g>/.exec(flag);
      expect(sun).not.toBeNull();
      const [r, g, b] = rgb(sun![4]!);
      expect(r).toBeGreaterThan(g);
      expect(g).toBeGreaterThan(2 * b);
      // its points go out to a ray's tip and back in to the disc between two rays, twenty-one times round
      const pts = points(sun![3]!);
      const far = pts.map(([x, y]) => Math.hypot(x, y));
      const tips = far.filter((d) => d > 15);
      expect(pts).toHaveLength(42);
      expect(tips).toHaveLength(KURDISTAN_FLAG.rays);
      expect(Math.max(...far.filter((d) => d <= 15))).toBeLessThan(Math.min(...tips) * 0.7);
      expect(pts[0]![0]).toBeCloseTo(0, 0);
      expect(pts[0]![1]).toBeLessThan(0);
      // it sits halfway along the cloth and in the middle of the white, its rays clear of the red and the green
      const middle = kurdistanSun();
      expect(Number(sun![1])).toBeCloseTo((KURDISTAN_FLAG.top[0][0] + KURDISTAN_FLAG.top[3][0]) / 2, 0);
      expect(2 * middle.r).toBeLessThan(KURDISTAN_FLAG.depth / 3);
      expect(2 * middle.r).toBeGreaterThan(0.8 * (KURDISTAN_FLAG.depth / 3));
    }
  });

  it('draws the very cloth at rest that the apps make stir over it, in the box they stir it in', () => {
    const loop = PATH_LANDMARK_LOOP.school;
    expect(loop.kind).toBe('colours');
    expect(loop.w / loop.h).toBeCloseTo(KURDISTAN_FLAG.w / KURDISTAN_FLAG.h, 2);
    for (const dark of [false, true]) {
      const cloth = kurdistanFlag(dark);
      expect(pathLandmarkSvg({ landmark: 'school', dark })).toContain(`<g transform="translate(${loop.x} ${loop.y}) scale(${loop.w / KURDISTAN_FLAG.w})">${cloth}</g>`);
      const moving = pathLoopSvg({ kind: 'colours', dark });
      expect(moving).toContain(`viewBox="0 0 ${KURDISTAN_FLAG.w} ${KURDISTAN_FLAG.h}"`);
      expect(moving).toContain(cloth);
    }
    expect(kurdistanFlag(true)).not.toBe(kurdistanFlag(false));
  });

  it('leaves the castle’s pennant on its tower as it was, madder with a cream band', () => {
    expect(PATH_LANDMARK_LOOP.citywall.kind).toBe('flag');
    const pennant = pathLoopSvg({ kind: 'flag' });
    expect(pennant).toContain(`fill="${VALLEY.red}"`);
    expect(pennant).not.toContain(kurdistanFlag(false));
  });
});
