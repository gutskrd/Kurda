import { WIDGET_IMAGE, WIDGET_SKIES, type WidgetFeed, type WidgetLetter, type WidgetSky } from '@kurda/shared';

/**
 * What the app and its home-screen letter widget agree on.
 *
 * The widget is two small programs the app never runs itself: a WidgetKit
 * extension on iPhone (mobile/targets/letter-widget, Swift) and an Android
 * app widget drawn by this app's own code in the background
 * (src/widget/android). Both read the same three things the app leaves for
 * them — the widget's own token, the server it belongs to and the language
 * the app is in — under the names below, and both ask the server the same
 * two questions: the feed, and the picture of the letter's paper. The Swift
 * side repeats these names and rules by hand, so widget.test.ts reads the
 * Swift files and holds the two to each other.
 */

/** The App Group the app and its iPhone widget share: the one place both can read and write. */
export const APP_GROUP = 'group.app.hevalo.mobile';

/** The widget's kind on iPhone and its name on Android: what a reload names. */
export const WIDGET_KIND = 'LetterWidget';

/** Where the app leaves what the widget reads (UserDefaults in the App Group on iPhone). */
export const WIDGET_KEYS = {
  token: 'letterWidget.token',
  apiBase: 'letterWidget.apiBase',
  locale: 'letterWidget.locale',
  /** set by the widget when the server refused its token, so the app makes a new one next time it is open */
  rejected: 'letterWidget.rejected',
} as const;

/** What the widget needs to ask for its letter, as the app leaves it. */
export interface WidgetConfig {
  token: string;
  apiBase: string;
  locale: string;
}

/** The feed, asked with the widget's own token. */
export const WIDGET_FEED_PATH = '/letters/widget/feed';
/** The picture of the letter's paper and drawing, or of the empty windowsill. */
export const WIDGET_IMAGE_PATH = '/letters/widget/image';
/** Making this phone's widget token (the account's session), and taking it away again (the token itself). */
export const WIDGET_TOKENS_PATH = '/letters/widget/tokens';
export const WIDGET_TOKEN_CURRENT_PATH = '/letters/widget/tokens/current';
/** What the account chooses for its widgets. */
export const WIDGET_PREFS_PATH = '/letters/widget/prefs';

/** The header the widget's routes read; the token is never sent anywhere else. */
export function widgetAuthorization(token: string): string {
  return `Widget ${token}`;
}

/**
 * Never ask again sooner than this, whatever a feed says, and never wait
 * longer than this either: a widget that asked every minute would use up its
 * hour's allowance by lunchtime, and one that waited a day would show
 * yesterday's letter all day.
 */
export const REFRESH_MIN_SECONDS = 5 * 60;
export const REFRESH_MAX_SECONDS = 12 * 60 * 60;
/** How long to wait before trying again after the server could not be reached. */
export const RETRY_OFFLINE_SECONDS = 15 * 60;

export function refreshSeconds(refreshAfter: number): number {
  if (!Number.isFinite(refreshAfter)) return RETRY_OFFLINE_SECONDS;
  return Math.min(REFRESH_MAX_SECONDS, Math.max(REFRESH_MIN_SECONDS, Math.round(refreshAfter)));
}

/** The app's address for one correspondence: what tapping the widget opens (App.tsx `linking`). */
export function letterThreadLink(threadId: string): string {
  return `hevalo://app/letters/${encodeURIComponent(threadId)}`;
}

/** The letters, for a widget with no letter on it yet. */
export const LETTERS_LINK = 'hevalo://app/letters';
/** The app itself, for a widget that is signed out. */
export const APP_LINK = 'hevalo://';

/** The sky the empty windowsill shows at an hour of the phone's own clock, as the letters' window does (shared treeSkyAt). */
export function widgetSkyAt(hour: number): WidgetSky {
  if (hour >= 5 && hour < 8) return 'dawn';
  if (hour >= 8 && hour < 17) return 'day';
  if (hour >= 17 && hour < 20) return 'dusk';
  return 'night';
}

/** The next hour of the clock at which the sky changes: an empty widget asks again then, so its window keeps time. */
export function nextSkyChange(now: Date): Date {
  const turns = [5, 8, 17, 20];
  const at = new Date(now);
  at.setMinutes(0, 0, 0);
  const next = turns.find((h) => h > now.getHours());
  if (next === undefined) {
    at.setDate(at.getDate() + 1);
    at.setHours(turns[0]!);
  } else {
    at.setHours(next);
  }
  return at;
}

/**
 * The picture's size as the server takes it: whole points, each side within
 * its bounds, and a density no higher than keeps the longer side inside the
 * pixels it will draw.
 */
export function widgetImageSize(width: number, height: number, scale: number): { w: number; h: number; scale: number } {
  const side = (v: number): number => Math.min(WIDGET_IMAGE.maxSide, Math.max(WIDGET_IMAGE.minSide, Math.round(v)));
  const [w, h] = [side(width), side(height)];
  const room = WIDGET_IMAGE.maxPixels / Math.max(w, h);
  const s = Math.min(WIDGET_IMAGE.maxScale, room, Number.isFinite(scale) && scale > 0 ? scale : 2);
  return { w, h, scale: Math.max(1, Math.floor(s * 100) / 100) };
}

/** The picture's address for a widget of this size (in points) at this density, with the sky of the phone's hour for an empty sill. */
export function widgetImageUrl(apiBase: string, size: { w: number; h: number; scale: number }, sky: WidgetSky): string {
  return `${apiBase}${WIDGET_IMAGE_PATH}?w=${size.w}&h=${size.h}&scale=${size.scale}&sky=${sky}`;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function isWidgetLetter(v: unknown): v is WidgetLetter {
  if (!isRecord(v) || !isRecord(v.from) || !isRecord(v.paper)) return false;
  return (
    typeof v.id === 'string' &&
    typeof v.threadId === 'string' &&
    typeof v.from.name === 'string' &&
    typeof v.excerpt === 'string' &&
    typeof v.sentAt === 'string' &&
    typeof v.rtl === 'boolean'
  );
}

/** Whether an answer is a feed the widget can show: anything else is treated as the server not answering. */
export function isWidgetFeed(v: unknown): v is WidgetFeed {
  if (!isRecord(v)) return false;
  return (v.letter === null || isWidgetLetter(v.letter)) && typeof v.pinned === 'boolean' && typeof v.showWords === 'boolean' && typeof v.refreshAfter === 'number';
}

export { WIDGET_SKIES };
export type { WidgetFeed, WidgetLetter, WidgetSky };
