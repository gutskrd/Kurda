import type { MessageKey } from '../i18n/en';

/**
 * Spans of time in words, for sentences rather than for a narrow column:
 * "2 hours ago" under a signed-in device, "about 15 minutes" in a lockout.
 * (The rail's compact "2h ago" is social/time.ts.)
 *
 * The browser's `Intl` has these, plurals and all — Arabic alone has six forms
 * for a number of hours — so it says them wherever it has the language. It
 * does not have Kurdish: Chromium answers in English, and full ICU data gives
 * "-2 h". Kurmancî and Soranî never change the noun after a number, so the
 * catalogue's "{count} saet berê" is right for every count, and it is what any
 * language the browser lacks falls back to.
 */
type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

const OWN_WORDS = new Set(['ku', 'ckb']);

function browserSpeaks(locale: string): boolean {
  if (OWN_WORDS.has(locale.split('-')[0]!)) return false;
  try {
    return Intl.RelativeTimeFormat.supportedLocalesOf([locale]).length > 0;
  } catch {
    return false;
  }
}

type Unit = 'minute' | 'hour' | 'day';

const AGO: Record<Unit, MessageKey> = {
  minute: 'time.words.minutesAgo',
  hour: 'time.words.hoursAgo',
  day: 'time.words.daysAgo',
};

/**
 * How long ago, in whole minutes, hours or days: "5 minutes ago",
 * "2 hours ago", "yesterday". Under a minute is the caller's to say (it is
 * usually "now" of some kind), so this starts at one minute.
 */
export function agoInWords(iso: string, t: Translate, locale: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  const minutes = Number.isNaN(then) ? 1 : Math.max(1, Math.floor((now - then) / 60_000));
  const [count, unit]: [number, Unit] =
    minutes < 60 ? [minutes, 'minute'] : minutes < 24 * 60 ? [Math.floor(minutes / 60), 'hour'] : [Math.floor(minutes / (24 * 60)), 'day'];
  if (browserSpeaks(locale)) return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-count, unit);
  return t(AGO[unit], { count });
}

/**
 * A wait, rounded the way a person would say it: whole minutes under an hour,
 * whole hours after that. The sentence it goes into says "about".
 */
export function durationInWords(seconds: number, t: Translate, locale: string): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  const [count, unit]: [number, 'minute' | 'hour'] = minutes < 60 ? [minutes, 'minute'] : [Math.round(minutes / 60), 'hour'];
  if (browserSpeaks(locale)) return new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'long' }).format(count);
  return t(unit === 'minute' ? 'time.words.minutes' : 'time.words.hours', { count });
}
