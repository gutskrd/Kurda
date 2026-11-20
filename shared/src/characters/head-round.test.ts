import { describe, expect, it } from 'vitest';
import { BROW_STATES, EYE_STATES, MOUTH_SHAPES, PART_GROUPS, PEEK_TURN, characterArt, eyesFor, headParts, partTransforms, roundLayer, roundMap, roundPoint, turnStep, turnedHeadMap } from '../index.js';
import { headHalfWidth } from './hevalo.js';

const art = characterArt('hevalo');
const rig = art.rig!;
const FULL: number = PEEK_TURN.steps;
/** Where a point goes across with his head turned `step` steps to our right. */
const across = (x: number, y: number, step = FULL, layer: 'fur' | 'eyes' = 'fur'): number => roundMap(step, layer)(x, y)[0];
/** The middle of each eye's white and its half-width, as drawn. */
const EYE = { left: 177.5, right: 329.5, y: 281, rx: 53.4 } as const;

describe('Hevalo’s head turned in the round', () => {
  it('faces us untouched at no turn', () => {
    expect(turnStep(0)).toBe(0);
    expect(turnStep(0.004)).toBe(0);
    expect(roundLayer(rig.face, 0, 'fur')).toBe(rig.face);
    expect(turnedHeadMap(0)(123, 456)).toEqual([123, 456]);
    const parts = headParts(art, 0, PEEK_TURN.yawDeg);
    for (const part of Object.values(parts)) {
      expect(part.x).toBeCloseTo(0);
      expect(part.wide).toBeCloseTo(1);
    }
  });

  it('turns as a solid head does: the near eye comes round to face us, the far eye closes up, the snout swings furthest', () => {
    const wide = (side: 'left' | 'right'): number => across(EYE[side] + EYE.rx, EYE.y, FULL, 'eyes') - across(EYE[side] - EYE.rx, EYE.y, FULL, 'eyes');
    // Turning to our right, his left eye (on our left) comes round toward us and his right eye goes round away.
    expect(wide('left') / (2 * EYE.rx)).toBeGreaterThan(1.05);
    expect(wide('right') / (2 * EYE.rx)).toBeLessThan(0.75);
    const nose = roundPoint(rig.sniff, FULL, 'fur').x - rig.sniff.x;
    const eyes = Math.max(across(EYE.left, EYE.y) - EYE.left, across(EYE.right, EYE.y) - EYE.right);
    expect(eyes).toBeGreaterThan(30);
    expect(nose).toBeGreaterThan(eyes);
    // Nothing moves up or down.
    expect(roundMap(FULL, 'fur')(300, 400)[1]).toBe(400);
  });

  it('keeps the round of his skull where it is, and brings his snout and jaw out past it on the side he turns to', () => {
    for (const y of [200, 260, 300, 340]) {
      for (const side of ['left', 'right'] as const) {
        const edge = 255 + (side === 'left' ? -1 : 1) * headHalfWidth(y, side);
        expect(across(edge, y), `${side} ${y}`).toBeCloseTo(edge, 0);
      }
    }
    const jaw = 255 + headHalfWidth(440, 'right');
    expect(across(jaw - 1, 440)).toBeGreaterThan(jaw + 15);
  });

  it('never folds the face over itself, at any step either way, past the snout hiding a hair of the far cheek', () => {
    for (const step of [-FULL, -FULL / 2, -1, 1, FULL / 3, FULL]) {
      for (const y of [180, 281, 330, 404, 450]) {
        let last = -Infinity;
        // Across his head, from one side of his outline to the other.
        for (let x = 256 - headHalfWidth(y, 'left'); x <= 254 + headHalfWidth(y, 'right'); x += 3) {
          const now = across(x, y, step);
          expect(now, `${step} ${x},${y}`).toBeGreaterThanOrEqual(last - 2);
          last = now;
        }
      }
    }
  });

  it('turns the same either way, mirrored', () => {
    for (const [x, y] of [
      [200, 281],
      [255, 392],
      [300, 440],
    ] as const) {
      expect(across(x, y, FULL / 2) - 255).toBeCloseTo(255 - across(510 - x, y, -FULL / 2), -1);
    }
    expect(turnStep(3)).toBe(FULL);
    expect(turnStep(-3)).toBe(-FULL);
  });

  it('draws every layer of his head turned, each shape kept and well-formed, and keeps each drawing for the next time', () => {
    const layers = [
      rig.face,
      rig.look.whites,
      rig.look.left.art,
      rig.look.right.art,
      rig.look.half,
      art.overlay,
      ...EYE_STATES.map((e) => eyesFor(art, e)),
      ...BROW_STATES.map((b) => art.brows?.states[b] ?? ''),
      ...MOUTH_SHAPES.map((m) => art.mouths[m]),
    ];
    for (const markup of layers) {
      const turned = roundLayer(markup, 30, 'eyes');
      expect(turned).not.toMatch(/NaN|Infinity|<ellipse|<circle/);
      expect((turned.match(/<path/g) ?? []).length).toBe((markup.match(/<(path|ellipse|circle)\b/g) ?? []).length);
      expect(turned.match(/id="[^"]+"/g)).toEqual(markup.match(/id="[^"]+"/g));
      expect(roundLayer(markup, 30, 'eyes')).toBe(turned);
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
