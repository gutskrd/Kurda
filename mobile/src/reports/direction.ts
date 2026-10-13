import { useMemo } from 'react';
import { I18nManager, type TextStyle, type ViewStyle } from 'react-native';
import { useI18n } from '../i18n/I18nContext';

export interface Direction {
  rtl: boolean;
  /** a row that starts on the reading side */
  row: ViewStyle['flexDirection'];
  /** text that reads, and lines up, the way the language does */
  text: TextStyle;
  /** a chevron or an arrow that should point the way the reader reads */
  flip: ViewStyle | null;
}

/**
 * Right to left for Soranî and Arabic, in the screens this folder (and
 * gifts/) draws.
 *
 * The app does not flip its layout as a whole — nothing calls I18nManager, and
 * `tokens.rtlReady` is still false — so a Soranî reader got every row laid out
 * left to right with right-aligned script running into the wrong edge. These
 * screens mirror themselves instead: rows start on the right, text is aligned
 * and directed right to left, chevrons point the other way. When the app does
 * turn I18nManager on, the platform mirrors everything and this steps aside
 * rather than mirroring a second time.
 */
export function useDirection(): Direction {
  const { rtl } = useI18n();
  return useMemo(() => directionFor(rtl, I18nManager.isRTL), [rtl]);
}

/** Pure, for the tests: `rtl` the language, `platformRtl` whether the platform already mirrors. */
export function directionFor(rtl: boolean, platformRtl: boolean): Direction {
  const mirror = rtl && !platformRtl;
  return {
    rtl,
    row: mirror ? 'row-reverse' : 'row',
    text: rtl ? { writingDirection: 'rtl', textAlign: mirror ? 'right' : 'left' } : { writingDirection: 'ltr' },
    flip: rtl ? { transform: [{ scaleX: -1 }] } : null,
  };
}
