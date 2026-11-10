/**
 * Limited-time event theme packs (KUR-092) — pure, no React Native. Packs are
 * bundled with the app (colours and a glyph, no remote assets), so applying one
 * is synchronous and there is never a flash of the default theme. A pack is keyed
 * by an event's `theme` string (KUR-089); the active event's pack dresses up the
 * app while the event runs and reverts to null the moment no event is live.
 */
import type { IconName } from './icon-paths';

export interface EventThemePack {
  /** Matches `event.theme`. */
  key: string;
  label: string;
  /** Festive accent applied to highlighted surfaces. */
  accent: string;
  /** Home-banner background (start, end). The banner is filled with the first. */
  bannerColors: [string, string];
  /**
   * What is written and drawn on the banner's fill: the event's name, the
   * line under it, the glyph and the chevron.
   *
   * Each pack names its own because no one ink suits them all: the label
   * colour of a button is white by day, 1.8:1 on Newroz's gold, and near-black
   * by evening, 2.1:1 on Yalda's violet. Held to 4.5:1 on the fill by
   * `eventThemes.test.ts`.
   */
  ink: string;
  /** Streak-flame skin. */
  flame: string;
  /** The glyph on the banner, from the app's own icons so it is drawn in the pack's ink. */
  icon: IconName;
}

export const EVENT_THEME_PACKS: Record<string, EventThemePack> = {
  newroz: {
    key: 'newroz',
    label: 'Newroz',
    accent: '#E8B923', // Newroz gold/fire
    bannerColors: ['#E8B923', '#C81E4A'],
    ink: '#3A2A00', // the deep brown the app writes on gold: 7.5:1
    flame: '🔥',
    icon: 'flame',
  },
  yalda: {
    key: 'yalda',
    label: 'Yalda',
    accent: '#8E2DE2', // long-night violet
    bannerColors: ['#4A00E0', '#8E2DE2'],
    ink: '#FFFFFF', // 8.9:1
    flame: '🕯️',
    icon: 'moon',
  },
};

export interface ActiveEventLite {
  /** Null for events with no theme ref. */
  theme: string | null;
}

/**
 * The pack to apply given the live events (already priority-ordered by the API)
 * and the user's opt-out. Returns the first live event that has a known pack, or
 * null when the user opted out or nothing themed is live — so reverting is just
 * "resolve again", with no state to unwind.
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

/** Streak-flame emoji for the active pack, falling back to the default flame. */
export function flameSkin(pack: EventThemePack | null, fallback = '🔥'): string {
  return pack?.flame ?? fallback;
}

/** Accent color for the active pack, falling back to the base accent. */
export function themeAccent(pack: EventThemePack | null, fallback: string): string {
  return pack?.accent ?? fallback;
}
