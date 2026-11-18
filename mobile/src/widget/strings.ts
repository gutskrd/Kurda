import { interpolate } from '../i18n/format';
import WIDGET_STRINGS from './widget-strings.json';

/**
 * The widget's own few words in the app's nine languages, kept apart from the app catalogue
 * (i18n/translations.ts) because the widget says them, and two are not said by this code at all: the widget's
 * name and description in the system widget gallery, which iPhone reads from the extension's Localizable.strings
 * (targets/letter-widget/ <lang>.lproj) and Android from resources a config plugin writes at build time
 * (plugins/withLetterWidgetStrings.cjs). This file is the source of all three; widget.test.ts checks the iPhone
 * files against it word for word.
 */

export type WidgetStringKey = keyof (typeof WIDGET_STRINGS)['en'];
export type WidgetLocale = keyof typeof WIDGET_STRINGS;

export const WIDGET_LOCALES = Object.keys(WIDGET_STRINGS) as WidgetLocale[];

const isWidgetLocale = (v: string): v is WidgetLocale => (WIDGET_LOCALES as string[]).includes(v);

/** One of the widget's words in a language, English when the language is not one of the nine. */
export function widgetText(locale: string, key: WidgetStringKey, vars?: Record<string, string>): string {
  const table = WIDGET_STRINGS[isWidgetLocale(locale) ? locale : 'en'];
  return interpolate(table[key] ?? WIDGET_STRINGS.en[key], vars);
}

/** A letter's date as the widget shows it: day and month, plus the year when it is not this one. */
export function widgetDate(iso: string, locale: string, now: Date = new Date()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', ...(at.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) };
  try {
    return new Intl.DateTimeFormat(locale, options).format(at);
  } catch {
    // A language the phone has no dates for falls back to the phone's own.
    return new Intl.DateTimeFormat(undefined, options).format(at);
  }
}

export { WIDGET_STRINGS };
