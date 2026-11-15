'use no memo';
import { requestWidgetUpdate, type WidgetInfo, type WidgetTaskHandlerProps } from 'react-native-android-widget';
import { isRTL } from '../../i18n/format';
import { deviceLocale, getSavedLocale } from '../../i18n/localePref';
import { LOCALES, type Locale } from '../../i18n/translations';
import { WIDGET_KIND } from '../contract';
import { LetterWidget } from './LetterWidget';
import { loadLetterWidget } from './load';

/**
 * Where Android's widget updates arrive, and where the app asks for one.
 *
 * Android wakes this in the background (a headless task the widget library
 * registers, index.ts) when the widget is added, resized, and every half hour
 * after; the app calls `reloadAndroidWidget` when a letter comes or a setting
 * changes. Either way every letter widget on the home screen is drawn for its
 * own size, in light and dark — a letter is its paper in both, the plain
 * states follow the phone.
 */

const asLocale = (v: string | null): Locale | null => (v && (LOCALES as readonly string[]).includes(v) ? (v as Locale) : null);

async function draw(info: WidgetInfo, fresh: boolean) {
  const { shows, locale: left } = await loadLetterWidget({ width: info.width, height: info.height, density: info.screenInfo.density }, { fresh });
  // signed out there is no language left for the widget, so it is the one the app was last in
  const locale = asLocale(left) ?? (await getSavedLocale()) ?? deviceLocale();
  const props = { shows, width: info.width, height: info.height, locale, rtlLocale: isRTL(locale) };
  return { light: <LetterWidget {...props} />, dark: <LetterWidget {...props} dark /> };
}

/** Android's own updates: added, resized, the half-hourly one. A tap is the system's to follow (an address), and a removed widget has nothing to draw. */
export async function letterWidgetTask({ widgetInfo, widgetAction, renderWidget }: WidgetTaskHandlerProps): Promise<void> {
  if (widgetAction === 'WIDGET_DELETED' || widgetAction === 'WIDGET_CLICK') return;
  if (widgetInfo.widgetName !== WIDGET_KIND) return;
  renderWidget(await draw(widgetInfo, widgetAction === 'WIDGET_ADDED'));
}

/** The app's request: ask the server now and draw every letter widget on the home screen again. */
export async function reloadAndroidWidget(): Promise<void> {
  await requestWidgetUpdate({ widgetName: WIDGET_KIND, renderWidget: (info) => draw(info, true) });
}
