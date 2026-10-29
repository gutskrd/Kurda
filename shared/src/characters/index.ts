/**
 * The speaking characters: Hevalo the deer, Hamo and Xezo, drawn as layered
 * SVG so that while a recording plays only the mouth (and now and then the
 * eyes) is redrawn.
 *
 * Two ways in. `characterSvg` gives a whole, standalone drawing — for a still
 * picture, or for a page that simply swaps the string. `characterArt` gives
 * the parts, for a player that keeps the body drawn and changes one small
 * layer at a time: the web puts them in groups of one inline <svg>, the phone
 * in react-native-svg, and they line up either way because every part is in
 * the same units.
 *
 * Like the rest of the app's art, a drawing is a string, the same on every
 * machine, with no images, fonts, filters or links; gradient and clip ids
 * carry a prefix so several characters can share a page.
 */
import { VISEMES, type Viseme } from '../lipsync/visemes.js';
import { escapeXml, n, prefixFor } from '../art/svg.js';
import type { CharacterBox, CharacterArt, CharacterId, EyeState } from './types.js';
import { CHARACTER_IDS, CHARACTER_NAMES } from './types.js';
import { drawHevalo } from './hevalo.js';
import { drawHamo } from './hamo.js';
import { drawXezo } from './xezo.js';

export {
  CHARACTER_IDS,
  CHARACTER_NAMES,
  isCharacterId,
  type CharacterBox,
  type CharacterArt,
  type CharacterId,
  type CharacterPoint,
  type CharacterRig,
  type EyeState,
  type RigPart,
  type RigPupil,
} from './types.js';
export {
  ACTS,
  BLINK_STEPS,
  BREATH,
  HABITS,
  RESTING,
  SWAY,
  between,
  easeInOut,
  eyesMiddle,
  glanceTarget,
  hasRig,
  keySteps,
  lookToward,
  pupilShift,
  sampleHold,
  sampleKeys,
  type Act,
  type ActName,
  type Hold,
  type Keys,
} from './life.js';
export { CHARACTER_GLOW, stageBackdrop, type StageOptions } from './stage.js';
export { LEAN_DEGREES, eyeShift, gazeTargets, leanToward, lookAcross, standTogether, standingSpots, togetherBackdrop, type StandingPlace } from './together.js';
export { BLINK_MS, NOD_DEGREES, eyesAt, speakingFrame, voiceTimeline, type SpeakingFrame, type SpeakingInput } from './speaking.js';
export { WINDOW_PLACE, WINDOW_POP, WINDOW_VIEW, windowArt, type WindowArt, type WindowShare } from './window.js';
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

const EYE_STATES: readonly EyeState[] = ['open', 'half', 'closed', 'happy'];

/** Hevalo is the app's own mascot, so he speaks unless someone has chosen another. */
export const DEFAULT_CHARACTER: CharacterId = 'hevalo';

/** Who can speak, in the order a picker shows them. */
export const CHARACTERS: readonly { id: CharacterId; name: string }[] = CHARACTER_IDS.map((id) => ({ id, name: CHARACTER_NAMES[id] }));

/** Drawings already made, by prefix: a player asks for the same parts on every frame. */
const made = new Map<string, CharacterArt>();

/**
 * A character's parts, with every gradient and clip id starting with
 * `idPrefix` (by default one of the character's own, so the three never clash
 * with each other; pass another to show the same character twice on a page).
 * Drawn the first time it is asked for, then kept.
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

/**
 * How much of a character a picture shows: the whole figure, head to waist,
 * head and shoulders, or head and neck (put in at a window, `neck`).
 */
export type CharacterCrop = 'full' | 'half' | 'bust' | 'head';

/** The box a crop shows; a character drawn without a neck to put in at a window shows its head and shoulders for `head`. */
export function cropBox(art: CharacterArt, crop: CharacterCrop): CharacterBox {
  if (crop === 'head') return art.neck?.box ?? art.bust;
  return crop === 'bust' ? art.bust : crop === 'half' ? art.half : art.viewBox;
}

/** The body a crop draws: for head and neck, the neck cut off under the chest, out of sight under the sill; otherwise all of it. */
export function cropBody(art: CharacterArt, crop: CharacterCrop): string {
  return crop === 'head' && art.neck ? art.neck.body : art.body;
}

/** The most of a stage's width its character takes: the rest is for the buttons or the words beside it. */
export const STAGE_FIGURE_SHARE = 0.58;

/**
 * How big a stage shows its character's head to waist (`half`), in points: as
 * tall as the stage less `headroom` above the head, unless that would take
 * more than `STAGE_FIGURE_SHARE` of its width, as a character with its elbows
 * out would; then smaller, and the stage shows it on down past the waist.
 */
export function stageFigure(id: CharacterId, stageWidth: number, stageHeight: number, headroom: number): { width: number; height: number } {
  const half = characterArt(id).half;
  const height = Math.max(0, Math.min(stageHeight - headroom, (stageWidth * STAGE_FIGURE_SHARE * half.h) / half.w));
  return { width: (height * half.w) / half.h, height };
}

/** The eyes drawn whole for a state; a character drawn without half-shut eyes shuts them instead. */
export function eyesFor(art: CharacterArt, state: EyeState): string {
  if (state === 'half') return art.eyes.half ?? art.eyes.closed;
  return art.eyes[state];
}

export interface CharacterSvgOptions {
  /** the mouth shape to show; at rest by default */
  mouth?: Viseme;
  eyes?: EyeState;
  /** the whole figure, head to waist, head and shoulders, or head and neck */
  crop?: CharacterCrop;
  /** how wide the drawing is shown, in pixels; by default the crop's own width in drawing units */
  width?: number;
  idPrefix?: string;
  /** the drawing's text label for screen readers; the character's name by default */
  title?: string;
}

const box = (b: CharacterBox): string => `${n(b.x)} ${n(b.y)} ${n(b.w)} ${n(b.h)}`;

/** The group the head is drawn in: turned by `nod` degrees about the neck for a small nod. */
export function headGroup(art: CharacterArt, mouth: Viseme = 'rest', eyes: EyeState = 'open', nod = 0): string {
  const turn = nod === 0 ? '' : ` transform="rotate(${n(nod)} ${n(art.headPivot.x)} ${n(art.headPivot.y)})"`;
  return `<g${turn}>${art.head}${eyesFor(art, eyes)}${art.mouths[mouth]}${art.overlay}</g>`;
}

/** A complete, standalone SVG of a character. */
export function characterSvg(id: CharacterId, options: CharacterSvgOptions = {}): string {
  const { mouth = 'rest', eyes = 'open', crop = 'full' } = options;
  if (!VISEMES.includes(mouth)) throw new RangeError(`characters: no mouth shape called ${String(mouth)}`);
  if (!EYE_STATES.includes(eyes)) throw new RangeError(`characters: eyes are open, half, closed or happy, not ${String(eyes)}`);
  const art = characterArt(id, options.idPrefix);
  const frame = cropBox(art, crop);
  const width = options.width ?? frame.w;
  if (!Number.isFinite(width) || width <= 0) throw new RangeError(`characters: width must be a positive number, got ${String(options.width)}`);
  const height = (width * frame.h) / frame.w;
  const t = `${prefixFor(options.idPrefix ?? `hv${id}`)}-title`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width)}" height="${n(height)}" viewBox="${box(frame)}" role="img" aria-labelledby="${t}">` +
    `<title id="${t}">${escapeXml(options.title ?? art.name)}</title>` +
    cropBody(art, crop) +
    headGroup(art, mouth, eyes) +
    '</svg>'
  );
}
