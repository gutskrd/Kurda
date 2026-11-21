/**
 * The speaking characters, Hevalo the deer, Hamo and Xezo, drawn as layered SVG so only the mouth (and now and then the
 * eyes) is redrawn while a recording plays. `characterSvg` gives a whole standalone drawing; `characterArt` gives the parts
 * for a player that keeps the body and swaps small layers (groups in one inline <svg> on the web, SVG elements on the
 * phone), all in the same units. Drawings are strings, identical on every machine, with no images, fonts, filters or
 * links; gradient and clip ids carry a prefix so several characters can share a page.
 */
import { escapeXml, n, prefixFor } from '../art/svg.js';
import type { BrowState, CharacterBox, CharacterArt, CharacterId, EyeState, MouthShape } from './types.js';
import { BROW_STATES, EYE_STATES, MOUTH_SHAPES } from './types.js';
import { drawHevalo } from './hevalo.js';
import { drawHamo } from './hamo.js';
import { drawXezo } from './xezo.js';

export {
  BROW_STATES,
  CHARACTER_IDS,
  CHARACTER_NAMES,
  EXPRESSION_MOUTHS,
  EYE_STATES,
  MOUTH_SHAPES,
  type BrowState,
  type CharacterBox,
  type CharacterArt,
  type CharacterId,
  type CharacterPoint,
  type CharacterRig,
  type ExpressionMouth,
  type EyeState,
  type MouthShape,
  type RigPart,
  type RigPupil,
} from './types.js';
export {
  ACTS,
  BLINK_STEPS,
  BREATH,
  CHARACTER_HABITS,
  GLANCE_ASIDE,
  HABITS,
  RESTING,
  SWAY,
  TAP_RUN_MS,
  actFor,
  between,
  easeInOut,
  eyesMiddle,
  glanceTarget,
  keySteps,
  lookToward,
  pickAct,
  pupilShift,
  reactionAct,
  sampleHold,
  sampleKeys,
  tapActs,
  type Act,
  type ActName,
  type CharacterReaction,
  type CheekState,
  type Habit,
  type Hold,
  type Keys,
} from './life.js';
export { CHARACTER_GLOW, stageBackdrop, type StageOptions } from './stage.js';
export { LEAN_DEGREES, eyeShift, gazeTargets, leanToward, lookAcross, standTogether, standingSpots, togetherBackdrop, type StandingPlace } from './together.js';
export { BLINK_MS, NOD_DEGREES, eyesAt, speakingFrame, voiceTimeline, type SpeakingFrame, type SpeakingInput } from './speaking.js';
export { WINDOW_PLACE, WINDOW_POP, WINDOW_VIEW, windowArt, type WindowArt, type WindowShare } from './window.js';
export { PEEK_PLACE, PEEK_POP, PEEK_VIEW, peekArt, type PeekArt } from './peek.js';
export {
  PEEK_LEAN,
  PEEK_TURN,
  TURN_SPRING,
  leanFor,
  stepLean,
  swingAngle,
  tiltFromGravity,
  tiltFromOrientation,
  turnFor,
  turnForMotion,
  turnForTilt,
  type LeanState,
  type Spring,
} from './peek-lean.js';
export { HEAD_ROUND, PART_GROUPS, headParts, partTransform, partTransforms, type HeadParts, type PartGroup, type PartTurn } from './head-turn.js';
export {
  HEAD_RIG,
  SKULL,
  headPiece,
  muzzleSide,
  peekParts,
  pieceTransform,
  placePiece,
  projectPoint,
  readPiece,
  rigLayer,
  roundLayer,
  roundPoint,
  shareYaw,
  skullClip,
  stepYaw,
  turnStep,
  turnedHead,
  type HeadPiece,
  type PiecePlace,
  type RoundLayer,
} from './head-round.js';
export {
  COMPANION_DOZE_MS,
  COMPANION_EDGE,
  COMPANION_EYES,
  COMPANION_OVERHANG,
  COMPANION_OUTLINES,
  COMPANION_VIEW,
  COMPANION_WORDS,
  CompanionMotion,
  companionGate,
  companionLook,
  companionSvg,
  companionTransforms,
  type CompanionEmote,
  type CompanionEvent,
  type CompanionField,
  type CompanionFrame,
  type CompanionGate,
  type CompanionInput,
  type CompanionLooks,
  type CompanionStatus,
  type CompanionTone,
  type CompanionTransforms,
  type CompanionWord,
} from './companion.js';

const DRAW: Record<CharacterId, (prefix: string) => CharacterArt> = {
  hevalo: drawHevalo,
  hamo: drawHamo,
  xezo: drawXezo,
};

/** Hevalo is the app's mascot, so he speaks unless someone chose another. */
export const DEFAULT_CHARACTER: CharacterId = 'hevalo';

/** Drawings already made, by prefix, since a player asks for the same parts every frame. */
const made = new Map<string, CharacterArt>();

/**
 * A character's parts with every gradient and clip id starting with `idPrefix` (by default the character's own, so the
 * three never clash; pass another to show one character twice on a page). Drawn on first request, then kept.
 */
export function characterArt(id: CharacterId, idPrefix?: string): CharacterArt {
  const draw = DRAW[id];
  if (!draw) throw new RangeError(`characters: no character called ${String(id)}`);
  const prefix = `${prefixFor(idPrefix ?? `hv${id}`)}-`;
  const key = `${id}|${prefix}`;
  let art = made.get(key);
  if (!art) {
    art = draw(prefix);
    made.set(key, art);
  }
  return art;
}

/** How much of a character a picture shows: the whole figure, head to waist, head and shoulders, or head and neck at a window (`neck`). */
export type CharacterCrop = 'full' | 'half' | 'bust' | 'head';

/** The box a crop shows; a character drawn without a window neck shows head and shoulders for `head`. */
export function cropBox(art: CharacterArt, crop: CharacterCrop): CharacterBox {
  if (crop === 'head') return art.neck?.box ?? art.bust;
  return crop === 'bust' ? art.bust : crop === 'half' ? art.half : art.viewBox;
}

/** The body a crop draws: for head and neck, the neck cut off under the chest out of sight below the sill; otherwise all of it. */
export function cropBody(art: CharacterArt, crop: CharacterCrop): string {
  return crop === 'head' && art.neck ? art.neck.body : art.body;
}

/** The most of a stage's width its character takes; the rest is for the buttons or words beside it. */
export const STAGE_FIGURE_SHARE = 0.58;

/**
 * How big a stage shows its character head to waist (`half`), in points: as tall as the stage less `headroom`, unless that
 * would take more than `STAGE_FIGURE_SHARE` of its width (a character with elbows out); then smaller, showing on below the
 * waist.
 */
export function stageFigure(id: CharacterId, stageWidth: number, stageHeight: number, headroom: number): { width: number; height: number } {
  const half = characterArt(id).half;
  const height = Math.max(0, Math.min(stageHeight - headroom, (stageWidth * STAGE_FIGURE_SHARE * half.h) / half.w));
  return { width: (height * half.w) / half.h, height };
}

/** The eyes drawn whole for a state; a character without half-shut eyes shuts them instead. */
export function eyesFor(art: CharacterArt, state: EyeState): string {
  if (state === 'half') return art.eyes.half ?? art.eyes.closed;
  return art.eyes[state];
}

/** What a face wears beyond eyes and mouth: how the brows sit, and whether the cheeks blush. */
export interface FaceOptions {
  brows?: BrowState;
  blush?: boolean;
}

/** The head to draw a face on: whole, with brows at rest and any loose hair, unless `moving`, for a player that draws those as layers (`faceLayers`). */
export function headFor(art: CharacterArt, moving: boolean): string {
  return moving && art.brows ? art.brows.bare : art.head;
}

/**
 * The face layers a player moves or swaps over `headFor(art, true)` and the eyes: the loose hair, the brows, and the
 * cheeks if blushing; nothing for parts a character lacks.
 */
export function faceLayers(art: CharacterArt, face: FaceOptions = {}): string {
  return (art.hair?.art ?? '') + (art.brows?.states[face.brows ?? 'neutral'] ?? '') + (face.blush && art.cheeks ? art.cheeks.blush : '');
}

export interface CharacterSvgOptions {
  /** the mouth shape to show; at rest by default */
  mouth?: MouthShape;
  eyes?: EyeState;
  /** how the brows sit; at rest by default */
  brows?: BrowState;
  /** the cheeks blushing, on a character drawn with a blush */
  blush?: boolean;
  /** the whole figure, head to waist, head and shoulders, or head and neck */
  crop?: CharacterCrop;
  /** the shown width in pixels; by default the crop's own width in drawing units */
  width?: number;
  idPrefix?: string;
  /** the drawing's label for screen readers; the character's name by default */
  title?: string;
}

const box = (b: CharacterBox): string => `${n(b.x)} ${n(b.y)} ${n(b.w)} ${n(b.h)}`;

/**
 * The group the head is drawn in, turned `nod` degrees about the neck. With a `face`, the brows and cheeks are drawn as
 * asked as layers over the bare head; without one, the head is drawn whole.
 */
export function headGroup(art: CharacterArt, mouth: MouthShape = 'rest', eyes: EyeState = 'open', nod = 0, face?: FaceOptions): string {
  const turn = nod === 0 ? '' : ` transform="rotate(${n(nod)} ${n(art.headPivot.x)} ${n(art.headPivot.y)})"`;
  const head = face ? headFor(art, true) + eyesFor(art, eyes) + faceLayers(art, face) : art.head + eyesFor(art, eyes);
  return `<g${turn}>${head}${art.mouths[mouth]}${art.overlay}</g>`;
}

/** A complete, standalone SVG of a character. */
export function characterSvg(id: CharacterId, options: CharacterSvgOptions = {}): string {
  const { mouth = 'rest', eyes = 'open', crop = 'full' } = options;
  if (!MOUTH_SHAPES.includes(mouth)) throw new RangeError(`characters: no mouth shape called ${String(mouth)}`);
  if (!EYE_STATES.includes(eyes)) throw new RangeError(`characters: eyes are ${EYE_STATES.join(', ')}, not ${String(eyes)}`);
  if (options.brows !== undefined && !BROW_STATES.includes(options.brows)) throw new RangeError(`characters: brows are ${BROW_STATES.join(', ')}, not ${String(options.brows)}`);
  const art = characterArt(id, options.idPrefix);
  const frame = cropBox(art, crop);
  const width = options.width ?? frame.w;
  if (!Number.isFinite(width) || width <= 0) throw new RangeError(`characters: width must be a positive number, got ${String(options.width)}`);
  const height = (width * frame.h) / frame.w;
  const t = `${prefixFor(options.idPrefix ?? `hv${id}`)}-title`;
  const face = options.brows !== undefined || options.blush !== undefined ? { brows: options.brows, blush: options.blush } : undefined;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width)}" height="${n(height)}" viewBox="${box(frame)}" role="img" aria-labelledby="${t}">` +
    `<title id="${t}">${escapeXml(options.title ?? art.name)}</title>` +
    cropBody(art, crop) +
    headGroup(art, mouth, eyes, 0, face) +
    '</svg>'
  );
}
