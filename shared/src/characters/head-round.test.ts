import { describe, expect, it } from 'vitest';
import {
  BROW_STATES,
  EYE_STATES,
  HEAD_RIG,
  MOUTH_SHAPES,
  PART_GROUPS,
  PEEK_TURN,
  SKULL,
  characterArt,
  eyesFor,
  headParts,
  headPiece,
  partTransforms,
  pieceTransform,
  placePiece,
  readPiece,
  rigLayer,
  roundLayer,
  roundPoint,
  stepYaw,
  turnStep,
  type RoundLayer,
} from '../index.js';
import { headHalfWidth } from './hevalo.js';

const art = characterArt('hevalo');
const rig = art.rig!;
const FULL: number = PEEK_TURN.steps;
const yaw = stepYaw(FULL);
const near = headPiece(HEAD_RIG.eyes.left, 'eyes');
const far = headPiece(HEAD_RIG.eyes.right, 'eyes');
const muzzle = headPiece(HEAD_RIG.muzzle, 'fur');
/** Every transform a turned layer puts on its pieces. */
const transforms = (markup: string): string[] => [...markup.matchAll(/transform="(matrix\([^)]*\))"/g)].map((m) => m[1]!);

describe('Hevalo’s head turned as a whole', () => {
  it('faces us exactly as drawn at no turn', () => {
    expect(turnStep(0)).toBe(0);
    expect(turnStep(0.004)).toBe(0);
    expect(roundLayer(rig.face, 0, 'fur', 'clip')).toBe(rig.face);
    for (const piece of [SKULL, near, far, muzzle]) {
      expect(placePiece(piece, 0)).toEqual({ wide: 1, tall: 1, x: piece.x, y: piece.y });
      expect(pieceTransform(piece, 0)).toBe('matrix(1 0 0 1 0 0)');
    }
    expect(roundPoint({ x: 123, y: 345 }, 0, 'fur')).toEqual({ x: 123, y: 345 });
  });

  it('turns his whole head about his neck: his outline, ears and antlers all go the way he turns', () => {
    expect(placePiece(SKULL, yaw).x).toBeGreaterThan(HEAD_RIG.centre.x + 20);
    expect(placePiece(SKULL, -yaw).x).toBeLessThan(HEAD_RIG.centre.x - 20);
    const alone = headParts(art, 1, PEEK_TURN.yawDeg);
    const riding = headParts(art, 1, PEEK_TURN.yawDeg, HEAD_RIG.pivot);
    for (const part of ['antlerLeft', 'antlerRight', 'earLeft', 'earRight'] as const) expect(riding[part].x - alone[part].x).toBeGreaterThan(20);
  });

  it('shows the far eye a little smaller and the near eye a little larger, each still an eye', () => {
    const n = placePiece(near, yaw);
    const f = placePiece(far, yaw);
    expect(f.tall).toBeLessThan(0.97);
    expect(f.tall).toBeGreaterThan(0.88);
    expect(f.wide).toBeLessThan(f.tall);
    expect(f.wide).toBeGreaterThan(0.75);
    expect(n.tall).toBeGreaterThan(1);
    expect(n.wide).toBeGreaterThan(1);
    // Both eyes go the way he turns, and stay on either side of each other.
    expect(n.x).toBeGreaterThan(near.x);
    expect(f.x).toBeGreaterThan(far.x);
    expect(f.x - n.x).toBeGreaterThan(100);
  });

  it('brings his muzzle round furthest, so it sticks out past his cheek', () => {
    const m = placePiece(muzzle, yaw);
    expect(m.x - muzzle.x).toBeGreaterThan(placePiece(near, yaw).x - near.x);
    expect(m.x - muzzle.x).toBeGreaterThan(placePiece(far, yaw).x - far.x);
    // The muzzle's side, as drawn 66 across from its middle, against his turned cheek at that height.
    const side = m.x + 66 * m.wide;
    const cheek = roundPoint({ x: HEAD_RIG.centre.x + headHalfWidth(HEAD_RIG.muzzle.y, 'right'), y: HEAD_RIG.muzzle.y }, FULL, 'outline').x;
    expect(side).toBeGreaterThan(cheek);
    // The nose and the mouth ride on the muzzle.
    expect(headPiece({ x: 255, y: 378 }, 'fur')).toEqual(muzzle);
    expect(headPiece({ x: 250, y: 432 }, 'fur')).toEqual(muzzle);
  });

  it('turns the same either way, mirrored', () => {
    for (const piece of [SKULL, muzzle]) {
      const right = placePiece(piece, yaw);
      const left = placePiece(piece, -yaw);
      expect(right.x - HEAD_RIG.centre.x).toBeCloseTo(HEAD_RIG.centre.x - left.x, 6);
      expect(right.wide).toBeCloseTo(left.wide, 6);
    }
    expect(placePiece(near, yaw).tall).toBeCloseTo(placePiece(far, -yaw).tall, 2);
    expect(turnStep(3)).toBe(FULL);
    expect(turnStep(-3)).toBe(-FULL);
  });

  it('keeps every shape as drawn, only moved and scaled with its piece, and keeps each drawing for the next time', () => {
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
      if (!markup) continue;
      const turned = roundLayer(markup, FULL, layer, 'face');
      expect(turned).not.toMatch(/NaN|Infinity/);
      // Each shape is moved and scaled, never bent or skewed.
      for (const t of transforms(turned)) expect(t).toMatch(/^matrix\([\d.-]+ 0 0 [\d.-]+ [\d.-]+ [\d.-]+\)$/);
      // Ellipses stay ellipses, and every id is kept.
      expect((turned.match(/<ellipse/g) ?? []).length).toBe((markup.match(/<ellipse/g) ?? []).length);
      expect((turned.match(/id="[^"]+"/g) ?? []).filter((id) => id !== 'id="face"')).toEqual(markup.match(/id="[^"]+"/g) ?? []);
      expect(roundLayer(markup, FULL, layer, 'face')).toBe(turned);
    }
  });

  it('moves each lid with its own eye, splitting a path drawn over both', () => {
    const lids = roundLayer(rig.look.half, FULL, 'eyes');
    const placed = new Set(transforms(lids));
    expect(placed).toEqual(new Set([pieceTransform(near, yaw), pieceTransform(far, yaw)]));
    expect((lids.replace(/<defs>.*?<\/defs>/g, '').match(/<path/g) ?? []).length).toBe(2);
  });

  it('keeps what lies on his face within his turned outline and lets the muzzle, nose and mouth stand out of it', () => {
    const features = roundLayer(rig.faceLayers!.features, FULL, 'fur', 'face');
    expect(features).toContain(`<clipPath id="face"><path transform="${pieceTransform(SKULL, yaw)}"`);
    // The far eye's socket rides on that eye, within his outline.
    expect(features).toContain(`<g clip-path="url(#face)"><g transform="${pieceTransform(headPiece(HEAD_RIG.eyes.right, 'fur'), yaw)}">`);
    // The muzzle's own piece is not clipped.
    expect(features).toMatch(new RegExp(`(^|[^)]>)<g transform="${pieceTransform(muzzle, yaw).replace(/[()]/g, '\\$&')}">`));
    const mouth = roundLayer(art.mouths.rest, FULL, 'fur', 'face');
    expect(mouth).not.toContain('clip-path="url(#face)"');
    // A whole drawing keeps its root, with the clip inside it.
    const whole = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${rig.look.whites}</svg>`;
    const inside = roundLayer(whole, FULL, 'eyes', 'face');
    expect(inside.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><clipPath id="face">')).toBe(true);
    expect(inside.endsWith('</svg>')).toBe(true);
  });

  it('marks each piece for a player that places them as he turns, the same places as a drawn turn', () => {
    const marked = rigLayer(rig.faceLayers!.features, 'fur', 'face');
    const pieces = [...marked.matchAll(/data-piece="([^"]+)"/g)].map((m) => readPiece(m[1]!));
    expect(pieces.length).toBeGreaterThan(5);
    const baked = transforms(roundLayer(rig.faceLayers!.features, FULL, 'fur')).filter((t) => t !== pieceTransform(SKULL, yaw));
    expect(new Set(pieces.map((p) => pieceTransform(p, yaw)))).toEqual(new Set(baked));
    expect(readPiece('skull')).toEqual(SKULL);
  });

  it('moves the antlers and ears the other way from his face, the far ones narrowing, as transforms a player sets', () => {
    const parts = headParts(art, 1, PEEK_TURN.yawDeg);
    expect(parts.antlerLeft.x).toBeLessThan(0);
    expect(parts.earRight.wide).toBeLessThan(1);
    expect(parts.earLeft.wide).toBeGreaterThan(1);
    const t = partTransforms(parts);
    expect(Object.keys(t).sort()).toEqual([...PART_GROUPS].sort());
    for (const v of Object.values(t)) expect(v).not.toMatch(/NaN|Infinity/);
  });
});
