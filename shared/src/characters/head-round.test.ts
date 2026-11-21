import { describe, expect, it } from 'vitest';
import {
  BROW_STATES,
  EYE_STATES,
  HEAD_RIG,
  MOUTH_SHAPES,
  PART_GROUPS,
  PEEK_TURN,
  SKULL,
  bentNeck,
  characterArt,
  eyesFor,
  headParts,
  mapPath,
  headPiece,
  partInDepth,
  partTransforms,
  peekParts,
  pieceTransform,
  placePiece,
  readPiece,
  rigLayer,
  rigNeck,
  roundLayer,
  roundNeck,
  roundPart,
  roundPoint,
  sinkTransform,
  snoutSlices,
  stepYaw,
  turnStep,
  turnedHead,
  turnedNeck,
  type RoundLayer,
} from '../index.js';
import { HEVALO_SILHOUETTE, headHalfWidth } from './hevalo.js';

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
    const riding = headParts(art, 1, PEEK_TURN.yawDeg, { behind: HEAD_RIG.pivot });
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

  it('redraws his outline for the turn: the round of his skull stays, his jaw and chin come round the way he turns', () => {
    expect(turnedHead(0)).toBe(HEVALO_SILHOUETTE.head);
    const points = (d: string): number[][] => (mapPath(d, (x, y) => [x, y]).match(/-?[\d.]+,-?[\d.]+/g) ?? []).map((pair) => pair.split(',').map(Number));
    const turned = points(turnedHead(yaw));
    expect(Math.abs(turned.length - points(HEVALO_SILHOUETTE.head).length)).toBeLessThan(10);
    // The widest point of his skull, at eye height, stays where it was on both sides.
    const atEyes = (side: 1 | -1): number => Math.max(...turned.filter(([, y]) => Math.abs(y! - 288) < 6).map(([x]) => side * (x! - HEAD_RIG.centre.x)));
    expect(atEyes(1)).toBeCloseTo(headHalfWidth(288, 'right'), -1);
    expect(atEyes(-1)).toBeCloseTo(headHalfWidth(288, 'left'), -1);
    // Lower down, his jaw reaches out on the side he turns to.
    const atJaw = (side: 1 | -1): number => Math.max(...turned.filter(([, y]) => Math.abs(y! - 430) < 8).map(([x]) => side * (x! - HEAD_RIG.centre.x)));
    expect(atJaw(1)).toBeGreaterThan(headHalfWidth(430, 'right') + 10);
    expect(turnedHead(yaw)).toBe(turnedHead(yaw));
  });

  it('builds the side of his muzzle out of his face as he turns, in the muzzle’s own light fur', () => {
    expect(snoutSlices(0)).toEqual([]);
    const slices = snoutSlices(yaw);
    expect(slices).toHaveLength(HEAD_RIG.muzzle.slices);
    const placed = slices.map((t) => t.match(/[\d.-]+/g)!.map(Number));
    // From his face to its front, each slice comes further round and narrows toward the muzzle's front as drawn.
    const centre = ([w, , , , e]: number[]): number => e! + w! * HEAD_RIG.muzzle.x;
    for (let i = 1; i < placed.length; i++) {
      expect(centre(placed[i]!)).toBeGreaterThan(centre(placed[i - 1]!));
      expect(placed[i]![0]!).toBeLessThan(placed[i - 1]![0]!);
    }
    expect(centre(placed.at(-1)!)).toBeLessThan(placePiece(muzzle, yaw).x);
    // Mirrored either way, and only a little wider than its front on a small turn, so it grows out of his face.
    expect(centre(snoutSlices(-yaw)[0]!.match(/[\d.-]+/g)!.map(Number))).toBeCloseTo(2 * HEAD_RIG.centre.x - centre(placed[0]!), 0);
    expect(Number(snoutSlices(stepYaw(1))[0]!.match(/[\d.-]+/)![0])).toBeLessThan(1.01);
    // Each slice is the muzzle as drawn, its own fill and all, drawn under its front.
    const turned = roundLayer(rig.faceLayers!.features, FULL, 'fur', 'face');
    const front = rig.faceLayers!.features.match(/<path\b[^>]*fill="url\(#[^)]*muzzle\)"[^>]*\/>/)![0];
    for (const t of slices) expect(turned).toContain(front.replace('<path', `<path transform="${t}"`));
    expect(turned.indexOf(`transform="${slices.at(-1)}"`)).toBeLessThan(turned.indexOf(`<g transform="${pieceTransform(muzzle, yaw)}">`));
  });

  it('shows the depth of his ears and antlers as he turns: an ear’s back and hollow, an antler’s far side', () => {
    const ear = rig.ears.left.art;
    expect(roundPart(ear, 0, 'ear', 'rim')).toBe(ear);
    const deep = roundPart(ear, FULL, 'ear', 'rim');
    expect(deep).toBe(roundPart(ear, FULL, 'ear', 'rim'));
    // Its back, in its own colour, beside its rim; its hollow set back within the rim.
    expect(deep).toContain(`<g transform="${sinkTransform(HEAD_RIG.ear.back, yaw)}"><path d=`);
    expect(deep).toContain(`fill="${HEAD_RIG.ear.colour}"`);
    expect(deep).toMatch(/<clipPath id="rim"><path d="M[^"]+"\/><\/clipPath>/);
    expect(deep).toContain(`<g clip-path="url(#rim)"><g transform="${sinkTransform(HEAD_RIG.ear.hollow, yaw)}">`);
    expect(sinkTransform(10, yaw)).toMatch(/^translate\(-[\d.]+ 0\)$/);
    expect(sinkTransform(10, -yaw)).toMatch(/^translate\([\d.]+ 0\)$/);
    // An antler's far side: copies of its outline stepping back, its highlights left off.
    const antler = roundPart(rig.antlers!.left.art, FULL, 'antler', 'a');
    expect((antler.match(new RegExp(`fill="${HEAD_RIG.antler.colour}"`, 'g')) ?? []).length).toBe(HEAD_RIG.antler.copies * 2);
    expect(antler).toContain(`<g transform="${sinkTransform(HEAD_RIG.antler.far, yaw)}">`);
    // For a player: what sits back marked with how far, what shows only turned hidden facing us.
    const marked = partInDepth(ear, 'ear', 'rim');
    expect(marked).toContain(`<g data-sink="${HEAD_RIG.ear.back}" data-behind display="none">`);
    expect(marked).toContain(`<g clip-path="url(#rim)"><g data-sink="${HEAD_RIG.ear.hollow}">`);
    expect((partInDepth(rig.antlers!.left.art, 'antler', 'a').match(/data-behind display="none"/g) ?? []).length).toBe(HEAD_RIG.antler.copies);
  });

  it('carries his neck round under his turned head, easing into his chest, its shading as drawn', () => {
    const body = art.neck!.body;
    expect(turnedNeck(body, 0)).toBe(body);
    expect(roundNeck(body, 0)).toBe(body);
    const shift = placePiece(SKULL, yaw).x - HEAD_RIG.centre.x;
    const turned = turnedNeck(body, yaw);
    expect(turned).not.toMatch(/NaN|Infinity/);
    // Every gradient stays as drawn, so the shading never tilts.
    expect(turned.match(/<linearGradient\b[^>]*>/g)).toEqual(body.match(/<linearGradient\b[^>]*>/g));
    // The top of his neck rides with his head; down at his chest it is as drawn.
    const fur = (markup: string): number[][] =>
      (mapPath(markup.match(/<path d="([^"]+)" fill="url\(#hvhevalo-fur\)"/)![1]!, (x, y) => [x, y]).match(/-?[\d.]+,-?[\d.]+/g) ?? []).map((p) => p.split(',').map(Number));
    const left = (pts: number[][], from: number, to: number): number => Math.min(...pts.filter(([, y]) => y! > from && y! < to).map(([x]) => x!));
    expect(left(fur(turned), 390, 420) - left(fur(body), 390, 420)).toBeCloseTo(shift, 0);
    expect(left(fur(turned), 640, 720)).toBeCloseTo(left(fur(body), 640, 720), 1);
    // His throat turns a little further, within his outline.
    expect(turned).toMatch(/<g clip-path="url\(#hvhevalo-figure\)"><path d="[^"]+" fill="url\(#hvhevalo-bib\)"\/><\/g>/);
    expect(roundNeck(`<svg viewBox="0 0 1 1">${body}</svg>`, FULL)).toBe(`<svg viewBox="0 0 1 1">${turned}</svg>`);
    // For a player: each shape a path marked to bend, drawn the same as the turned neck.
    const rigged = rigNeck(body);
    expect(rigged).not.toContain('<ellipse');
    expect((rigged.match(/data-neck="throat"/g) ?? []).length).toBe(1);
    const bent = [...rigged.matchAll(/<path data-neck="(neck|throat)" d="([^"]+)"/g)].map((m) => bentNeck(m[2]!, yaw, m[1] === 'throat'));
    expect(bent.length).toBe((turned.match(/<path\b/g) ?? []).length);
    expect(left(fur(rigged.replace(/ data-neck="[a-z]+"/g, '').replace(/d="[^"]+"(?= fill="url\(#hvhevalo-fur\)")/, `d="${bent[2]}"`)), 390, 420)).toBeCloseTo(
      left(fur(turned), 390, 420),
      1,
    );
  });

  it('turns his ears and antlers with him, each on its own: the near ones open out, the far ones narrow', () => {
    const plain = headParts(art, 1, PEEK_TURN.yawDeg);
    const turned = peekParts(art, 1);
    expect(turned.earLeft.wide).toBeGreaterThan(plain.earLeft.wide);
    expect(turned.earRight.wide).toBeLessThan(plain.earRight.wide);
    expect(turned.antlerLeft.wide).toBeGreaterThan(1);
    expect(turned.antlerRight.wide).toBeLessThan(0.8);
    for (const part of Object.values(peekParts(art, 0))) {
      expect(part.wide).toBeCloseTo(1);
      expect(part.x).toBeCloseTo(0);
    }
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
      expect((turned.match(/id="[^"]+"/g) ?? []).filter((id) => !id.startsWith('id="face'))).toEqual(markup.match(/id="[^"]+"/g) ?? []);
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
    expect(marked).toContain('<g data-shape="snout" display="none"><path d=');
    expect((marked.match(/<g data-shape="snout"[^>]*>(<path [^>]*\/>)+<\/g>/)![0].match(/<path/g) ?? []).length).toBe(HEAD_RIG.muzzle.slices);
    expect(rigLayer(rig.faceLayers!.outline, 'outline', 'face')).toContain('data-shape="head"');
    const pieces = [...marked.matchAll(/data-piece="([^"]+)"/g)].map((m) => readPiece(m[1]!));
    expect(pieces.length).toBeGreaterThan(5);
    const baked = transforms(roundLayer(rig.faceLayers!.features, FULL, 'fur')).filter((t) => t !== pieceTransform(SKULL, yaw) && !snoutSlices(yaw).includes(t));
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
