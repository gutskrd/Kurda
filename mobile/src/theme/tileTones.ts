/**
 * A chunky tile's colours by state (lesson answer cards, options, word tiles, Check), derived from the palette for
 * both themes. Pure, so every state's contrast is testable. A tile is a face on a darker lip it sinks onto when
 * pressed; every face is opaque because the lip runs under it, so translucent palette fills are blended over their
 * surface first.
 */
import { AA_NORMAL, hexToRgb } from '../a11y/contrast';
import { ensureContrast } from '../a11y/ensureContrast';
import type { Palette } from './palette';

/**
 * idle      waiting to be chosen
 * picked    chosen, waiting (a card for its partner, an option for Check)
 * right     answered right
 * wrong     answered wrong
 * spent     used up (a pair already made): no lip, faded, not tappable
 * disabled  not answerable now: the lesson has moved on to the verdict
 */
export type TileState = 'idle' | 'picked' | 'right' | 'wrong' | 'spent' | 'disabled';

export interface TileTone {
  face: string;
  edge: string;
  /** Null for a tile with no lip, one that can no longer be pressed. */
  lip: string | null;
  ink: string;
}

/** How far a tile's face stands above its lip in points, which is what it sinks by. */
export const LIP = 4;

/** The tile's edge, all round its face. */
export const TILE_EDGE = 2;

/** What a lesson button can mean: the brand's Check, and the two verdicts' Continue. */
export type TileButtonTone = 'primary' | 'success' | 'danger';

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parse(colour: string): Rgba {
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(colour.trim());
  if (m) return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] === undefined ? 1 : Number(m[4]) };
  return { ...hexToRgb(colour), a: 1 };
}

function hex({ r, g, b }: { r: number; g: number; b: number }): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** `top` over `bottom` with `amount` of `top` showing (times its own alpha), as one opaque colour. */
export function blend(top: string, bottom: string, amount = 1): string {
  const t = parse(top);
  const b = parse(bottom);
  const a = t.a * amount;
  return hex({ r: t.r * a + b.r * (1 - a), g: t.g * a + b.g * (1 - a), b: t.b * a + b.b * (1 - a) });
}

/** `ink`, darkened or lightened just enough to read on `face` at 4.5:1. */
function readableOn(ink: string, face: string): string {
  return ensureContrast(ink, face, AA_NORMAL);
}

/** A lip a step darker than the edge above it (join code tiles use it too). */
export function lipOf(edge: string, colors: Palette): string {
  return blend('#000000', edge, colors.scheme === 'dark' ? 0.3 : 0.15);
}

/** A tile's colours in `state`. */
export function tileTone(colors: Palette, state: TileState): TileTone {
  const ground = colors.surface;
  // The quiet edge of an idle tile: a step off the surface, like a card's hairline.
  const quiet = blend(colors.textPrimary, ground, colors.scheme === 'dark' ? 0.16 : 0.13);
  switch (state) {
    case 'picked': {
      const face = blend(colors.primary, ground, 0.07);
      return { face, edge: colors.primary, lip: lipOf(colors.primary, colors), ink: readableOn(colors.primary, face) };
    }
    case 'right': {
      const face = blend(colors.successFill, ground);
      return { face, edge: colors.success, lip: lipOf(colors.success, colors), ink: readableOn(colors.success, face) };
    }
    case 'wrong': {
      const face = blend(colors.dangerFill, ground);
      return { face, edge: colors.danger, lip: lipOf(colors.danger, colors), ink: readableOn(colors.danger, face) };
    }
    case 'spent':
      return { face: ground, edge: quiet, lip: null, ink: colors.textSecondary };
    case 'idle':
    case 'disabled':
      return { face: ground, edge: quiet, lip: lipOf(quiet, colors), ink: colors.textPrimary };
  }
}

/**
 * A lesson button's colours: Check, the lesson's main button, in the one accent on its own darker lip, a verdict's
 * Continue in its own colour; the flat slate of what is not open while there is nothing to press.
 */
export function tileButtonTone(colors: Palette, tone: TileButtonTone, enabled: boolean): TileTone {
  if (!enabled) {
    const face = colors.locked;
    return { face, edge: face, lip: null, ink: readableOn(colors.textSecondary, face) };
  }
  if (tone === 'primary') return { face: colors.accent, edge: colors.accent, lip: colors.accentLip, ink: readableOn(colors.textOnAccent, colors.accent) };
  const fill = tone === 'success' ? colors.success : colors.danger;
  return { face: fill, edge: fill, lip: lipOf(fill, colors), ink: readableOn(colors.textOnPrimary, fill) };
}

