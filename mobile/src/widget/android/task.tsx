'use no memo';
import { requestWidgetUpdate, type WidgetInfo, type WidgetTaskHandlerProps } from 'react-native-android-widget';
import { isRTL } from '../../i18n/format';
import { deviceLocale, getSavedLocale } from '../../i18n/localePref';
import { LOCALES, type Locale } from '../../i18n/translations';
import { WIDGET_KIND } from '../contract';
import { LetterWidget } from './LetterWidget';
import { loadLetterWidget } from './load';

/**
 * Where Android's widget updates arrive and where the app requests one. Android wakes this in the background (a
 * headless task the widget library registers, index.ts) when the widget is added or resized and every half hour;
 * the app calls `reloadAndroidWidget` when a letter arrives or a setting changes. Each letter widget is drawn for
 * its own size in light and dark: a letter is its paper in both, and the plain states follow the system theme.
 */

const asLocale = (v: string | null): Locale | null => (v && (LOCALES as readonly string[]).includes(v) ? (v as Locale) : null);

async function draw(info: WidgetInfo, fresh: boolean) {
  const { shows, locale: left } = await loadLetterWidget({ width: info.width, height: info.height, density: info.screenInfo.density }, { fresh });
  // Signed out, the widget has no language stored, so it uses the one the app was last in.
  const locale = asLocale(left) ?? (await getSavedLocale()) ?? deviceLocale();
  const props = { shows, width: info.width, height: info.height, locale, rtlLocale: isRTL(locale) };
  return { light: <LetterWidget {...props} />, dark: <LetterWidget {...props} dark /> };
}

/**
 * Android's own updates: added, resized, half-hourly. A tap is the system's to follow (a link), and a removed
 * widget has nothing to draw.
 */
export async function letterWidgetTask({ widgetInfo, widgetAction, renderWidget }: WidgetTaskHandlerProps): Promise<void> {
  if (widgetAction === 'WIDGET_DELETED' || widgetAction === 'WIDGET_CLICK') return;
  if (widgetInfo.widgetName !== WIDGET_KIND) return;
  renderWidget(await draw(widgetInfo, widgetAction === 'WIDGET_ADDED'));
}

/** The app's request: fetch now and redraw every letter widget on the home screen. */
export async function reloadAndroidWidget(): Promise<void> {
  await requestWidgetUpdate({ widgetName: WIDGET_KIND, renderWidget: (info) => draw(info, true) });
}
