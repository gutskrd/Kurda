/**
 * The learner's tree as it grows and moves: every stage, state and season is a valid picture in every layer, only great
 * trees have the swing, each stage is taller than the last, and no app motion (breeze, rustle, touch, drink, growth)
 * takes any of it outside its picture. The general art rules are in `art.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { TREE_HEALTHS, TREE_SEASONS, TREE_SPECIES, TREE_STAGES, type TreeHealth, type TreeSeason, type TreeSpecies, type TreeStage } from '../tree.js';
import { TREE_DRINK, TREE_GROW, TREE_RUSTLE, TREE_RUSTLE_WAVE, TREE_SHAKE, TREE_SWAY, TREE_SWING, TREE_WAVE, TREE_WAVE_AT, treeGrowFrom, treeHeft, treePhase, treeSwayDeg, treeWave } from './tree-motion.js';
import { TREE_FOOT, TREE_TOP, TREE_WATER_LANDS, treeRig, treeSvg } from './trees.js';

const STAGES = Array.from({ length: TREE_STAGES }, (_, i) => i as TreeStage);
const PARTS = ['whole', 'ground', 'plant', 'crown', 'swing', 'front'] as const;
/** The kinds whose great tree has a long low bough to hang a swing from. */
const SWINGERS: readonly TreeSpecies[] = ['beru', 'behiv', 'tu', 'payiz', 'miraz', 'sev'];
const DRAWN = new Set(['svg', 'title', 'defs', 'g', 'path', 'circle', 'ellipse', 'rect', 'linearGradient', 'radialGradient', 'stop', 'clipPath']);

/** The problems with a drawing as an SVG both phone and browser draw alike; none for a good one. */
function problems(svg: string): string[] {
  const found: string[] = [];
  if (!svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')) found.push('not an svg');
  if (!/viewBox="0 0 120 120"/.test(svg)) found.push('not on the 120 canvas');
  const title = /^<svg[^>]*aria-labelledby="([^"]+)"[^>]*><title id="([^"]+)">([^<]+)<\/title>/.exec(svg);
  if (!title || title[1] !== title[2]) found.push('no title first, named by the drawing');
  for (const [, tag] of svg.matchAll(/<([a-zA-Z]+)/g)) if (!DRAWN.has(tag!)) found.push(`<${tag}>`);
  const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!);
  if (new Set(ids).size !== ids.length) found.push('an id twice');
  for (const [, ref] of svg.matchAll(/url\(([^)]*)\)/g)) if (!ref!.startsWith('#') || !ids.includes(ref!.slice(1))) found.push(`url(${ref})`);
  if (/NaN|Infinity|undefined|https?:|<use|<text|<image|<filter|data:/.test(svg.replace('http://www.w3.org/2000/svg', ''))) found.push('reaches outside the drawing, or is not a number');
  return found;
}

/** How many shapes of a kind a drawing has. */
const count = (svg: string, tag: string): number => svg.split(`<${tag}`).length - 1;

/** Whether a layer has anything drawn in it at all. */
const drawn = (svg: string): boolean => /<(path|ellipse|circle|rect)\s/.test(svg);

/**
 * What a drawing covers in canvas units: every point its outlines pass through (curve handles included, which lie a
 * little outside them) and every ellipse's box. A soft gradient glow is not an edge, and an evenodd cut-out is not drawn
 * outside its clip.
 */
function extent(svg: string): { top: number; bottom: number; left: number; right: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  const take = (x: number, y: number): void => {
    xs.push(x);
    ys.push(y);
  };
  const body = svg.replace(/<defs>.*?<\/defs>/gs, '');
  for (const [, tag, attrs] of body.matchAll(/<(path|ellipse|circle)([^>]*)\/>/g)) {
    if (/fill="url\(/.test(attrs!) || /fill-rule="evenodd"/.test(attrs!)) continue;
    const at = (name: string): number => Number(new RegExp(`\\s${name}="([^"]+)"`).exec(attrs!)?.[1] ?? 0);
    if (tag !== 'path') {
      const [rx, ry] = tag === 'circle' ? [at('r'), at('r')] : [at('rx'), at('ry')];
      take(at('cx') - rx, at('cy') - ry);
      take(at('cx') + rx, at('cy') + ry);
      continue;
    }
    const tokens = /\sd="([^"]+)"/.exec(attrs!)![1]!.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)/g) ?? [];
    let [cmd, x, y, i] = ['', 0, 0, 0];
    while (i < tokens.length) {
      if (/[A-Za-z]/.test(tokens[i]!)) {
        cmd = tokens[i++]!;
        continue;
      }
      const v = (k: number): number => Number(tokens[i + k]);
      if (cmd === 'M' || cmd === 'L') [x, y, i] = [v(0), v(1), i + 2];
      else if (cmd === 'H') [x, i] = [v(0), i + 1];
      else if (cmd === 'V') [y, i] = [v(0), i + 1];
      else if (cmd === 'C') {
        take(v(0), v(1));
        take(v(2), v(3));
        [x, y, i] = [v(4), v(5), i + 6];
      } else if (cmd === 'Q') {
        take(v(0), v(1));
        [x, y, i] = [v(2), v(3), i + 4];
      } else if (cmd === 'A') [x, y, i] = [v(5), v(6), i + 7];
      else if (cmd === 'a') {
        // A petal: a whole round, there and back, its radius wide each way.
        take(x + v(5) / 2, y - v(0));
        take(x + v(5) / 2, y + v(0));
        [x, y, i] = [x + v(5), y + v(6), i + 7];
      } else throw new Error(`a path command the tree does not draw: ${cmd}`);
      take(x, y);
    }
  }
  return { top: Math.min(...ys), bottom: Math.max(...ys), left: Math.min(...xs), right: Math.max(...xs) };
}

/** All that grows: the plant and the crown over it, which move together. */
const plantOf = (species: TreeSpecies, stage: TreeStage, health: TreeHealth = 'fresh', season?: TreeSeason): string =>
  (['plant', 'crown'] as const).map((part) => treeSvg({ species, stage, health, ...(season ? { season } : {}), part, title: 'A tree' })).join('');

describe('the tree in every stage, state and season', () => {
  it('draws every kind at every stage, in every state and season, as a valid picture of a reasonable size', () => {
    for (const species of TREE_SPECIES) {
      for (const stage of STAGES) {
        for (const health of TREE_HEALTHS) {
          for (const season of [undefined, ...TREE_SEASONS]) {
            const svg = treeSvg({ species, stage, health, ...(season ? { season } : {}), size: 120, title: 'A tree' });
            expect(problems(svg), `${species} ${stage} ${health} ${season}`).toEqual([]);
            expect(svg.length, `${species} ${stage} ${health} ${season}`).toBeLessThan(80_000);
          }
        }
      }
    }
  });

  it('draws each layer as a picture of its own, the four of them together the whole, with ids that never meet', () => {
    for (const species of TREE_SPECIES) {
      for (const stage of STAGES) {
        for (const health of ['fresh', 'withered'] as const) {
          const layers = PARTS.map((part) => treeSvg({ species, stage, health, season: 'summer', part, title: 'A tree' }));
          for (const svg of layers) expect(problems(svg), `${species} ${stage} ${health}`).toEqual([]);
          const [whole, ...parts] = layers as [string, ...string[]];
          for (const tag of ['path', 'ellipse', 'clipPath']) expect(parts.reduce((a, p) => a + count(p, tag), 0), `${species} ${stage} ${health} ${tag}`).toBe(count(whole, tag));
          const ids = parts.flatMap((p) => [...p.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
          expect(new Set(ids).size).toBe(ids.length);
        }
      }
    }
  });

  it('has a front over its foot at every stage but the sapling’s, and draws one only where it says so', () => {
    for (const species of TREE_SPECIES) {
      for (const stage of STAGES) {
        expect(treeRig({ species, stage }).front, `${species} ${stage}`).toBe(stage !== 2);
        expect(drawn(treeSvg({ species, stage, season: 'autumn', part: 'front', title: 'x' })), `${species} ${stage}`).toBe(stage !== 2);
      }
    }
  });

  it('has a crown of its own once grown, while it has leaves left, and draws one only where it says so', () => {
    for (const species of TREE_SPECIES) {
      for (const stage of STAGES) {
        for (const health of TREE_HEALTHS) {
          const rig = treeRig({ species, stage, health });
          const crown = treeSvg({ species, stage, health, season: 'summer', part: 'crown', title: 'x' });
          expect(drawn(crown), `${species} ${stage} ${health}`).toBe(rig.crown !== null);
          if (stage >= 3 && health !== 'withered') expect(rig.crown, `${species} ${stage} ${health}`).not.toBeNull();
          if (!rig.crown) continue;
          // It stirs about a point in the crown, above the foot and inside the picture.
          expect(rig.crown.y, `${species} ${stage}`).toBeLessThan(TREE_FOOT.y);
          expect(rig.crown.y, `${species} ${stage}`).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('the swing', () => {
  it('hangs only from a great broad-crowned tree that is well enough to be played under', () => {
    for (const species of TREE_SPECIES) {
      for (const stage of STAGES) {
        for (const health of TREE_HEALTHS) {
          const meant = SWINGERS.includes(species) && stage === 6 && (health === 'fresh' || health === 'thirsty');
          const rig = treeRig({ species, stage, health });
          expect(rig.swing !== null, `${species} ${stage} ${health}`).toBe(meant);
          for (const season of [undefined, 'winter'] as const) {
            const swing = treeSvg({ species, stage, health, ...(season ? { season } : {}), part: 'swing', title: 'x' });
            expect(drawn(swing), `${species} ${stage} ${health} ${season}`).toBe(meant);
          }
        }
      }
    }
    // The pine, poplar, willow and pomegranate have nothing to hang a swing from.
    for (const species of TREE_SPECIES.filter((s) => !SWINGERS.includes(s))) expect(treeRig({ species, stage: 6 }).swing).toBeNull();
  });

  it('is tied on a level line out to the side of the trunk, and its seat hangs below it, clear of the ground and the crown’s edge', () => {
    for (const species of SWINGERS) {
      const hang = treeRig({ species, stage: 6 }).swing!;
      const [x, y] = [hang.x * 120, hang.y * 120];
      // Out past the trunk, under the crown, well inside the picture.
      expect(x, species).toBeGreaterThan(75);
      expect(x, species).toBeLessThan(110);
      expect(y, species).toBeGreaterThan(55);
      expect(y, species).toBeLessThan(85);
      const seat = extent(treeSvg({ species, stage: 6, part: 'swing', title: 'x' }));
      // The ropes start at the line it leans about, and the seat is its lowest point, above the grass.
      expect(Math.abs(seat.top - y), species).toBeLessThan(2.5);
      expect(seat.bottom, species).toBeLessThan(TREE_FOOT.y * 120 - 4);
      expect(Math.abs((seat.left + seat.right) / 2 - x), species).toBeLessThan(1.5);
      // And at its furthest lean the seat stays in the picture.
      const reach = (seat.bottom - y) * Math.tan((TREE_SWING.deg * Math.PI) / 180);
      expect(seat.right + reach, species).toBeLessThan(118);
    }
  });

  it('has snow on its seat in winter', () => {
    expect(treeSvg({ species: 'beru', stage: 6, season: 'winter', part: 'swing', title: 'x' })).toContain('#ffffff');
    expect(treeSvg({ species: 'beru', stage: 6, season: 'summer', part: 'swing', title: 'x' })).not.toContain('#ffffff');
  });
});

describe('the stages, one after another', () => {
  it('stands taller at every stage than at the last, for every kind and in every season', () => {
    for (const species of TREE_SPECIES) {
      for (const season of [undefined, 'spring', 'winter'] as const) {
        const tops = STAGES.map((stage) => extent(plantOf(species, stage, 'fresh', season)).top);
        for (let stage = 1; stage < TREE_STAGES; stage++) expect(tops[stage]!, `${species} ${stage} ${season}: ${tops.join(', ')}`).toBeLessThan(tops[stage - 1]! - 2);
      }
    }
  });

  it('spreads wider at every stage from the young tree on', () => {
    for (const species of TREE_SPECIES) {
      const wide = STAGES.map((stage) => {
        const e = extent(plantOf(species, stage));
        return e.right - e.left;
      });
      for (let stage = 4; stage < TREE_STAGES; stage++) expect(wide[stage]!, `${species} ${stage}: ${wide.join(', ')}`).toBeGreaterThan(wide[stage - 1]!);
    }
  });

  it('knows where each stage’s top is, to within a little, for every kind', () => {
    for (const stage of STAGES) {
      for (const species of TREE_SPECIES) expect(Math.abs(extent(plantOf(species, stage)).top / 120 - TREE_TOP[stage]), `${species} ${stage}`).toBeLessThan(0.07);
      // The water lands on the plant: below its top and above its foot.
      expect(TREE_WATER_LANDS[stage]).toBeGreaterThan(TREE_TOP[stage]);
      expect(TREE_WATER_LANDS[stage]).toBeLessThan(TREE_FOOT.y);
    }
  });

  it('comes up out of the seed where it lay: the sprout’s seed is the seed’s own, in the same place', () => {
    for (const species of TREE_SPECIES) {
      // A seed's outline is the first thing drawn of its plant.
      const outline = (stage: TreeStage): string => /<path d="([^"]+)"/.exec(plantOf(species, stage))![1]!;
      expect(outline(1), species).toBe(outline(0));
    }
  });

  it('grows out of the last stage’s size: the same seed, and each new tree from where the last one’s top was', () => {
    expect(treeGrowFrom(0, 1)).toBe(1);
    for (let stage = 2; stage < TREE_STAGES; stage++) {
      const from = treeGrowFrom((stage - 1) as TreeStage, stage as TreeStage);
      expect(from).toBeGreaterThan(0.6);
      expect(from).toBeLessThan(1);
      // Scaled about the foot, the new top is where the old one was.
      expect(TREE_FOOT.y - (TREE_FOOT.y - TREE_TOP[stage as TreeStage]) * from).toBeCloseTo(TREE_TOP[(stage - 1) as TreeStage], 2);
    }
  });
});

describe('the tree as it moves', () => {
  it('turns about its own foot: the plant stands at the foot the apps turn it about, and the ground lies round it', () => {
    for (const species of TREE_SPECIES) {
      for (const stage of STAGES) {
        const plant = extent(plantOf(species, stage, 'fresh', 'summer'));
        const ground = extent(treeSvg({ species, stage, season: 'summer', part: 'ground', title: 'x' }));
        // What grows reaches down to the ground line at its foot, and no further than its own earth.
        expect(plant.bottom, `${species} ${stage}`).toBeGreaterThan(TREE_FOOT.y * 120 - 1.5);
        expect(plant.bottom, `${species} ${stage}`).toBeLessThan(TREE_FOOT.y * 120 + 6);
        expect(Math.abs((ground.left + ground.right) / 2 - TREE_FOOT.x * 120), `${species} ${stage}`).toBeLessThan(18);
        expect(ground.top, `${species} ${stage}`).toBeLessThan(TREE_FOOT.y * 120);
      }
    }
  });

  it('keeps the whole plant in its picture through the breeze, a touch, a drink and the swell of growing', () => {
    const [fx, fy] = [TREE_FOOT.x * 120, TREE_FOOT.y * 120];
    for (const species of TREE_SPECIES) {
      for (const stage of STAGES) {
        for (const health of TREE_HEALTHS) {
          const e = extent(plantOf(species, stage, health, 'summer'));
          const heft = treeHeft(stage);
          const sway = treeSwayDeg(stage);
          // A touch comes only while still, and a drink or growth only while untouched; the breeze runs under all of them.
          // The crown's own stir is added as if about the foot, which moves it further than about its own foot does.
          const stir = TREE_RUSTLE.deg;
          const moves: readonly (readonly [turn: number, sx: number, sy: number])[] = [
            [sway + stir + Math.max(...TREE_SHAKE.turns.map(Math.abs)) * heft, 1, 1],
            [sway + stir, 1 + (Math.max(...TREE_DRINK.sx) - 1) * heft, 1 + (Math.max(...TREE_DRINK.sy) - 1) * heft],
            [sway + stir, TREE_GROW.past, TREE_GROW.past],
          ];
          for (const [deg, sx, sy] of moves) {
            for (const [x, y] of [
              [e.left, e.top],
              [e.right, e.top],
              [e.left, e.bottom],
              [e.right, e.bottom],
            ] as const) {
              const [dx, dy] = [(x - fx) * sx, (y - fy) * sy];
              for (const a of [deg, -deg].map((d) => (d * Math.PI) / 180)) {
                const [px, py] = [fx + dx * Math.cos(a) - dy * Math.sin(a), fy + dx * Math.sin(a) + dy * Math.cos(a)];
                const where = `${species} ${stage} ${health} at ${deg}° ${sx}×${sy}`;
                expect(px, where).toBeGreaterThan(0);
                expect(px, where).toBeLessThan(120);
                expect(py, where).toBeGreaterThan(0);
              }
            }
          }
        }
      }
    }
  });

  it('sways a sprout further than a great tree, and a seed not at all', () => {
    expect(treeSwayDeg(0)).toBe(0);
    for (let stage = 2; stage < TREE_STAGES; stage++) {
      expect(treeSwayDeg(stage as TreeStage)).toBeLessThan(treeSwayDeg((stage - 1) as TreeStage));
      expect(treeHeft(stage as TreeStage)).toBeLessThan(treeHeft((stage - 1) as TreeStage));
    }
    expect(treeSwayDeg(1)).toBeLessThanOrEqual(TREE_SWAY.deg);
    for (const stage of STAGES) expect(treeHeft(stage)).toBeGreaterThan(0);
  });

  it('keeps every tree on one breeze, and the swing a little behind it', () => {
    // The same moment is the same point in the breeze whenever asked, and it wraps round.
    expect(treePhase(0)).toBe(0);
    expect(treePhase(TREE_SWAY.ms * 3 + TREE_SWAY.ms / 4)).toBeCloseTo(0.25);
    expect(treePhase(-TREE_SWAY.ms / 4)).toBeCloseTo(0.75);
    // The wave is furthest one way at its start and the other halfway, and ends where it began, so the loop has no seam.
    expect(TREE_WAVE[0]).toBe(-1);
    expect(TREE_WAVE[8]).toBe(1);
    expect(TREE_WAVE[16]).toBe(-1);
    expect(TREE_WAVE_AT).toHaveLength(TREE_WAVE.length);
    // The swing's is the same wave later: its peak comes after the crown's.
    const swing = treeWave(TREE_SWING.lag);
    expect(swing[0]).toBe(swing[16]);
    expect(swing.indexOf(Math.max(...swing))).toBeGreaterThan(8);
    expect(TREE_SWING.ms).toBe(TREE_SWAY.ms);
    // The crown stirs twice to each breeze, a little late, and its loop has no seam either.
    expect(TREE_SWAY.ms / TREE_RUSTLE.ms).toBe(2);
    expect(TREE_RUSTLE_WAVE).toHaveLength(TREE_WAVE_AT.length);
    expect(TREE_RUSTLE_WAVE[0]).toBe(TREE_RUSTLE_WAVE[16]);
    expect(TREE_RUSTLE_WAVE.slice(0, 9).indexOf(Math.max(...TREE_RUSTLE_WAVE.slice(0, 9)))).toBeGreaterThan(4);
    expect(TREE_RUSTLE.deg).toBeLessThan(TREE_SWAY.deg);
  });

  it('starts as it is watered and is still again before the pour is over', () => {
    expect(TREE_DRINK.sx[0]).toBe(1);
    expect(TREE_DRINK.sx[TREE_DRINK.sx.length - 1]).toBe(1);
    expect(TREE_DRINK.sy[TREE_DRINK.sy.length - 1]).toBe(1);
    expect(TREE_DRINK.stops).toHaveLength(TREE_DRINK.sx.length);
    // The apps pour for a second and a half.
    expect(TREE_DRINK.delayMs + TREE_DRINK.ms).toBeLessThanOrEqual(1500);
    expect(TREE_SHAKE.turns[0]).toBe(0);
    expect(TREE_SHAKE.turns[TREE_SHAKE.turns.length - 1]).toBe(0);
  });
});
