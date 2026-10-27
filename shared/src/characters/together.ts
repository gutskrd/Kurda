/**
 * The people in a conversation on one stage, side by side, looking at each
 * other: where each stands, which way round it is drawn, and where its eyes
 * look while the lines go back and forth.
 *
 * Every character is drawn facing us, so two of them face each other with
 * their eyes: each iris (the deer's pupils) moves toward whoever it looks at,
 * and the head leans a little that way. A face drawn turned a little (Hamo's)
 * is stood the other way round where that would turn it from the others.
 *
 * In the stage's own points, the same on the web and on the phone.
 */
import { n, prefixFor } from '../art/svg.js';
import { pupilShift } from './life.js';
import { CHARACTER_GLOW, type StageOptions } from './stage.js';
import type { CharacterArt, CharacterId, CharacterPoint } from './types.js';

/** How far a head leans toward whoever it looks at, in degrees. */
export const LEAN_DEGREES = 2;

/** Two people stand this near the middle, as shares of the stage's width: near enough to talk, with room for each. */
const PAIR = [0.28, 0.72] as const;

/** Where `count` people stand, as shares of the width from the left: two as a pair, more spread evenly. */
export function standingSpots(count: number): number[] {
  if (count === 2) return [...PAIR];
  return Array.from({ length: Math.max(0, count) }, (_, i) => (i + 0.5) / count);
}

export interface StandingPlace {
  /** the speaker in the conversation it stands for */
  part: number;
  id: CharacterId;
  /** the middle of where it stands, as a share of the stage's width from the left as seen */
  at: number;
  /** drawn the other way round, so that a face drawn turned a little turns toward the others */
  mirrored: boolean;
  /** the whole figure (`viewBox`) in points on the stage: its left edge, its top, and how tall it is drawn */
  left: number;
  top: number;
  height: number;
}

/**
 * Where each character stands on a stage `width` by `height` points: in
 * order from the start side (the right, for a page read right to left), every
 * one at the same size, head to waist as tall as the stage less `headroom`
 * above the heads, or smaller where the widest of them would not fit beside
 * the others; the stage's bottom edge cuts each off at the waist or below it.
 */
export function standTogether(arts: readonly CharacterArt[], width: number, height: number, headroom: number, rtl = false): StandingPlace[] {
  const spots = standingSpots(arts.length);
  // the room each has across: up to halfway to the next one, and no further than the stage's edge
  let room = 1;
  spots.forEach((spot, i) => {
    room = Math.min(room, spot * 2, (1 - spot) * 2);
    const next = spots[i + 1];
    if (next !== undefined) room = Math.min(room, next - spot);
  });
  const tall = Math.max(0, Math.min(height - headroom, ...arts.map((a) => (room * width * a.half.h) / a.half.w)));
  return arts.map((art, part) => {
    const spot = spots[part] ?? 0.5;
    const at = rtl ? 1 - spot : spot;
    const mirrored = art.turned === 'left' ? at < 0.5 : art.turned === 'right' ? at > 0.5 : false;
    const unit = tall / art.half.h;
    // turned round, the half box lies where its mirror image does, about the middle of the whole figure
    const halfX = mirrored ? 2 * art.viewBox.x + art.viewBox.w - art.half.x - art.half.w : art.half.x;
    return {
      part,
      id: art.id,
      at,
      mirrored,
      left: at * width - (art.half.w * unit) / 2 - (halfX - art.viewBox.x) * unit,
      top: headroom - (art.half.y - art.viewBox.y) * unit,
      height: art.viewBox.h * unit,
    };
  });
}

/**
 * Which way one looks to see another, in its own drawing's terms (a figure
 * drawn the other way round looks the other way in them): straight across,
 * -1 to the left and 1 to the right.
 */
export function lookAcross(from: StandingPlace, to: StandingPlace): CharacterPoint {
  if (to.at === from.at) return { x: 0, y: 0 };
  const seen = to.at > from.at ? 1 : -1;
  return { x: from.mirrored ? -seen : seen, y: 0 };
}

/**
 * How far each eye's pupil moves from where it is drawn, in drawing units,
 * to look `look` (each way from -1 to 1): the deer's pupils within their
 * whites (`pupilShift`), a person's irises within their eyes (`irisReach`).
 */
export function eyeShift(art: CharacterArt, look: CharacterPoint): { left: CharacterPoint; right: CharacterPoint } {
  if (art.rig) return pupilShift(art, look, 1);
  const reach = art.irisReach ?? 0;
  const length = Math.hypot(look.x, look.y);
  const k = length > 1 ? 1 / length : 1;
  const shift = { x: look.x * k * reach, y: look.y * k * reach };
  return { left: shift, right: { ...shift } };
}

/** How far the head leans to look `look`, in degrees, clockwise as drawn: its top toward whoever it looks at. */
export function leanToward(look: CharacterPoint): number {
  return Math.max(-1, Math.min(1, look.x)) * LEAN_DEGREES;
}

/**
 * Whom each speaker looks at while line `at` is said (the line heard last,
 * or the first before any is): everyone at the one saying it, and they at
 * whoever spoke before them, or else whoever answers them.
 */
export function gazeTargets(count: number, lines: readonly { speaker: number }[], at: number | null): number[] {
  const now = Math.min(Math.max(0, at ?? 0), Math.max(0, lines.length - 1));
  const saying = lines[now]?.speaker ?? 0;
  const other = (l: { speaker: number } | undefined): boolean => l !== undefined && l.speaker !== saying && l.speaker < count;
  let to: number | null = null;
  for (let i = now - 1; i >= 0 && to === null; i--) if (other(lines[i])) to = lines[i]!.speaker;
  for (let i = now + 1; i < lines.length && to === null; i++) if (other(lines[i])) to = lines[i]!.speaker;
  const addressed = to ?? (saying + 1) % Math.max(1, count);
  return Array.from({ length: count }, (_, part) => (part === saying ? addressed : saying));
}

/**
 * What the people in a conversation stand in front of: each one's own light
 * (shared `CHARACTER_GLOW`) behind it, run together across the stage in
 * between, as `stageBackdrop` is for one.
 */
export function togetherBackdrop(places: readonly { id: CharacterId; at: number }[], width: number, height: number, options: StageOptions = {}): string {
  const p = `${prefixFor(options.idPrefix ?? `stage2${places.map((s) => s.id).join('')}`)}-`;
  const dark = options.dark === true;
  const w = width;
  const h = height;
  const sorted = [...places].sort((a, b) => a.at - b.at);
  const wash = dark ? 0.24 : 0.2;
  const stops = sorted.map((s) => `<stop offset="${n(s.at)}" stop-color="${CHARACTER_GLOW[s.id].light}" stop-opacity="${wash}"/>`).join('');
  const glows = sorted
    .map(
      (s, i) =>
        `<radialGradient id="${p}glow${i}" gradientUnits="userSpaceOnUse" cx="${n(s.at * w)}" cy="${n(h * 0.36)}" r="${n(Math.max(w / sorted.length, h) * 0.7)}">` +
        `<stop offset="0" stop-color="${CHARACTER_GLOW[s.id].light}" stop-opacity="${dark ? 0.38 : 0.34}"/><stop offset="1" stop-color="${CHARACTER_GLOW[s.id].light}" stop-opacity="0"/></radialGradient>`,
    )
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(w)} ${n(h)}" width="${n(w)}" height="${n(h)}" preserveAspectRatio="none" aria-hidden="true">` +
    `<defs><linearGradient id="${p}wash" x1="0" y1="0" x2="1" y2="0">${stops}</linearGradient>${glows}</defs>` +
    `<rect width="${n(w)}" height="${n(h)}" fill="url(#${p}wash)"/>` +
    sorted.map((_, i) => `<rect width="${n(w)}" height="${n(h)}" fill="url(#${p}glow${i})"/>`).join('') +
    '</svg>'
  );
}
