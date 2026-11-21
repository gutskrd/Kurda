import { describe, expect, it } from 'vitest';
import {
  BROW_STATES,
  EYE_STATES,
  MOUTH_SHAPES,
  PART_GROUPS,
  PEEK_TURN,
  characterArt,
  eyesFor,
  headParts,
  partTransforms,
  roundClipped,
  roundLayer,
  roundMap,
  roundPoint,
  roundShape,
  turnStep,
  turnedFaceMap,
  turnedOutlineMap,
  type RoundLayer,
} from '../index.js';
import { HEVALO_SILHOUETTE, headHalfWidth } from './hevalo.js';

const art = characterArt('hevalo');
const rig = art.rig!;
const FULL: number = PEEK_TURN.steps;
/** Where a point goes across with his head turned `step` steps to our right. */
const across = (x: number, y: number, step = FULL, layer: RoundLayer = 'fur'): number => roundMap(step, layer)(x, y)[0];
/** The middle of each eye's white and its half-width, as drawn. */
const EYE = { left: 177.5, right: 329.5, y: 281, rx: 53.4 } as const;
/** Each side of his outline at a height, as drawn. */
const edge = (side: 'left' | 'right', y: number): number => 255 + (side === 'left' ? -1 : 1) * headHalfWidth(y, side);

describe('Hevalo’s head turned in the round', () => {
  it('faces us untouched at no turn', () => {
    expect(turnStep(0)).toBe(0);
    expect(turnStep(0.004)).toBe(0);
    expect(roundLayer(rig.face, 0, 'fur')).toBe(rig.face);
    expect(roundClipped(rig.look.whites, 0, 'eyes', 'c')).toBe(rig.look.whites);
    expect(roundShape(0)).toBe(HEVALO_SILHOUETTE.head);
    expect(turnedFaceMap(0)(123, 456)).toEqual([123, 456]);
    expect(turnedOutlineMap(0)(123, 456)).toEqual([123, 456]);
    const parts = headParts(art, 0, PEEK_TURN.yawDeg);
    for (const part of Object.values(parts)) {
      expect(part.x).toBeCloseTo(0);
      expect(part.wide).toBeCloseTo(1);
    }
  });

  it('turns as a solid head does: the near eye comes round to face us, the far eye closes up but stays an eye, the snout swings furthest', () => {
    const wide = (side: 'left' | 'right'): number => across(EYE[side] + EYE.rx, EYE.y, FULL, 'eyes') - across(EYE[side] - EYE.rx, EYE.y, FULL, 'eyes');
    // Turning to our right, his left eye (on our left) comes round toward us and his right eye goes round away.
    expect(wide('left') / (2 * EYE.rx)).toBeGreaterThan(1.1);
    expect(wide('right') / (2 * EYE.rx)).toBeLessThan(0.75);
    expect(wide('right') / (2 * EYE.rx)).toBeGreaterThan(0.55);
    const nose = roundPoint(rig.sniff, FULL, 'fur').x - rig.sniff.x;
    const eyes = Math.max(across(EYE.left, EYE.y) - EYE.left, across(EYE.right, EYE.y) - EYE.right);
    expect(eyes).toBeGreaterThan(30);
    expect(nose).toBeGreaterThanOrEqual(eyes);
    // Nothing moves up or down.
    expect(roundMap(FULL, 'fur')(300, 400)[1]).toBe(400);
  });

  it('keeps the round of his skull where it is, and brings his snout and chin out on the side he turns to', () => {
    for (const step of [FULL, -FULL, FULL / 2]) {
      for (const y of [200, 260, 300, 340]) {
        for (const side of ['left', 'right'] as const) expect(across(edge(side, y), y, step, 'outline'), `${step} ${side} ${y}`).toBeCloseTo(edge(side, y), 0);
      }
    }
    expect(across(edge('right', 440), 440, FULL, 'outline')).toBeGreaterThan(edge('right', 440) + 15);
    expect(across(255, 461, FULL, 'outline')).toBeGreaterThan(265);
    expect(across(edge('left', 440), 440, FULL, 'outline')).toBeCloseTo(edge('left', 440), 0);
  });

  it('carries what lies on his face round within the turned outline, the far side going out of sight past the edge', () => {
    const shape = roundShape(FULL);
    expect(shape).toBe(roundShape(FULL));
    expect(shape).not.toMatch(/NaN|Infinity/);
    // The far eye's edge reaches the turned outline and no further.
    expect(across(EYE.right + EYE.rx, EYE.y, FULL, 'eyes')).toBeLessThanOrEqual(across(edge('right', EYE.y), EYE.y, FULL, 'outline') + 0.5);
    const clipped = roundClipped(rig.look.whites, FULL, 'eyes', 'turnface');
    expect(clipped).toContain(`<clipPath id="turnface"><path d="${shape}"/></clipPath>`);
    expect(clipped).toContain('clip-path="url(#turnface)"');
    expect(clipped).toContain(roundLayer(rig.look.whites, FULL, 'eyes'));
    // A whole drawing keeps its root, with the clip inside it.
    const whole = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${rig.look.whites}</svg>`;
    const inside = roundClipped(whole, FULL, 'eyes', 'turnface');
    expect(inside.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><clipPath id="turnface">')).toBe(true);
    expect(inside.endsWith('</g></svg>')).toBe(true);
  });

  it('never folds the face over itself, at any step either way', () => {
    for (const step of [-FULL, -FULL / 2, -1, 1, FULL / 3, FULL]) {
      for (const layer of ['fur', 'eyes', 'outline'] as const) {
        for (const y of [180, 281, 330, 404, 450]) {
          let last = -Infinity;
          // Across his head, from one side of his outline to the other.
          for (let x = 256 - headHalfWidth(y, 'left'); x <= 254 + headHalfWidth(y, 'right'); x += 3) {
            const now = across(x, y, step, layer);
            expect(now, `${layer} ${step} ${x},${y}`).toBeGreaterThanOrEqual(last - 0.5);
            last = now;
          }
        }
      }
    }
  });

  it('turns the same either way, mirrored', () => {
    for (const layer of ['fur', 'outline'] as const) {
      for (const [x, y] of [
        [200, 281],
        [255, 392],
        [300, 440],
      ] as const) {
        expect(across(x, y, FULL / 2, layer) - 255).toBeCloseTo(255 - across(510 - x, y, -FULL / 2, layer), -1);
      }
    }
    expect(turnStep(3)).toBe(FULL);
    expect(turnStep(-3)).toBe(-FULL);
  });

  it('draws every layer of his head turned, each shape kept and well-formed, and keeps each drawing for the next time', () => {
    const layers: [string, RoundLayer][] = [
      [rig.faceLayers!.outline, 'outline'],
      [rig.faceLayers!.features, 'fur'],
      [rig.look.whites, 'eyes'],
      [rig.look.left.art, 'eyes'],
      [rig.look.right.art, 'eyes'],
      [rig.look.half, 'eyes'],
      [art.overlay, 'fur'],
      ...EYE_STATES.map((e): [string, RoundLayer] => [eyesFor(art, e), 'eyes']),
      ...BROW_STATES.map((b): [string, RoundLayer] => [art.brows?.states[b] ?? '', 'eyes']),
      ...MOUTH_SHAPES.map((m): [string, RoundLayer] => [art.mouths[m], 'fur']),
    ];
    for (const [markup, layer] of layers) {
      const turned = roundLayer(markup, 30, layer);
      expect(turned).not.toMatch(/NaN|Infinity|<ellipse|<circle/);
      expect((turned.match(/<path/g) ?? []).length).toBe((markup.match(/<(path|ellipse|circle)\b/g) ?? []).length);
      expect(turned.match(/id="[^"]+"/g)).toEqual(markup.match(/id="[^"]+"/g));
      expect(roundLayer(markup, 30, layer)).toBe(turned);
    }
  });

  it('moves the antlers and ears the other way from his face, the far ones narrowing, as transforms a player sets', () => {
    const parts = headParts(art, 1, PEEK_TURN.yawDeg);
    expect(parts.antlerLeft.x).toBeLessThan(0);
    expect(parts.earRight.wide).toBeLessThan(1);
    expect(parts.earLeft.wide).toBeGreaterThan(1);
    const transforms = partTransforms(parts);
    expect(Object.keys(transforms).sort()).toEqual([...PART_GROUPS].sort());
    for (const v of Object.values(transforms)) expect(v).not.toMatch(/NaN|Infinity/);
  });
});
