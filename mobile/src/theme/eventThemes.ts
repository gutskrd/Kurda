/**
 * Limited-time event theme packs, without React Native. Packs are bundled (colours and a glyph, no remote assets),
 * so applying one is synchronous with no flash of the default theme. A pack is keyed by an event's `theme` string;
 * the active event's pack applies while it runs and reverts to null when no event is live.
 */
import type { IconName } from './icon-paths';

export interface EventThemePack {
  /** Matches `event.theme`. */
  key: string;
  label: string;
  /** Festive accent for highlighted surfaces. */
  accent: string;
  /** Home banner background (start, end); the banner is filled with the first. */
  bannerColors: [string, string];
  /**
   * The text and glyph colour on the banner's fill. Each pack names its own, since no single ink suits them all (a
   * button label's white is 1.8:1 on Newroz's gold, its evening near-black 2.1:1 on Yalda's violet). Held to 4.5:1 by
   * `eventThemes.test.ts`.
   */
  ink: string;
  /** Streak-flame skin. */
  flame: string;
  /** The banner's glyph, from the app's own icons so it is drawn in the pack's ink. */
  icon: IconName;
}

export const EVENT_THEME_PACKS: Record<string, EventThemePack> = {
  newroz: {
    key: 'newroz',
    label: 'Newroz',
    accent: '#E8B923', // Newroz gold.
    bannerColors: ['#E8B923', '#C81E4A'],
    ink: '#3A2A00', // The deep brown the app writes on gold: 7.5:1.
    flame: '🔥',
    icon: 'flame',
  },
  yalda: {
    key: 'yalda',
    label: 'Yalda',
    accent: '#8E2DE2', // Long-night violet.
    bannerColors: ['#4A00E0', '#8E2DE2'],
    ink: '#FFFFFF', // 8.9:1.
    flame: '🕯️',
    icon: 'moon',
  },
};

export interface ActiveEventLite {
  /** Null for events with no theme. */
  theme: string | null;
}

/**
 * The pack to apply given the live events (already in priority order from the API) and the user's opt-out: the
 * first live event with a known pack, or null. Reverting is just resolving again, with no state to unwind.
 */
export function resolveEventTheme(
  active: readonly ActiveEventLite[],
  optedOut: boolean,
): EventThemePack | null {
  if (optedOut) return null;
  for (const e of active) {
    const pack = e.theme ? EVENT_THEME_PACKS[e.theme] : undefined;
    if (pack) return pack;
  }
  return null;
}
