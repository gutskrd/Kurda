import type { MessageKey } from '../i18n/en';

/**
 * Spans of time in words for sentences ("2 hours ago", "about 15 minutes"); the rail's compact "2h ago" is
 * social/time.ts. `Intl` handles plurals where it knows the language. It has no Kurdish, so Kurdish and any other
 * missing language use the catalogue's phrase, which works for every count since Kurdish nouns do not change after a
 * number.
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

/** How long ago in whole minutes, hours or days ("5 minutes ago", "yesterday"); under a minute is the caller's to say. */
export function agoInWords(iso: string, t: Translate, locale: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  const minutes = Number.isNaN(then) ? 1 : Math.max(1, Math.floor((now - then) / 60_000));
  const [count, unit]: [number, Unit] =
    minutes < 60 ? [minutes, 'minute'] : minutes < 24 * 60 ? [Math.floor(minutes / 60), 'hour'] : [Math.floor(minutes / (24 * 60)), 'day'];
  if (browserSpeaks(locale)) return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-count, unit);
  return t(AGO[unit], { count });
}

/** A wait rounded as a person would say it: whole minutes under an hour, whole hours after; the sentence says "about". */
export function durationInWords(seconds: number, t: Translate, locale: string): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  const [count, unit]: [number, 'minute' | 'hour'] = minutes < 60 ? [minutes, 'minute'] : [Math.round(minutes / 60), 'hour'];
  if (browserSpeaks(locale)) return new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'long' }).format(count);
  return t(unit === 'minute' ? 'time.words.minutes' : 'time.words.hours', { count });
}
