import { useMemo } from 'react';
import { I18nManager, type TextStyle, type ViewStyle } from 'react-native';
import { useI18n } from '../i18n/I18nContext';

export interface Direction {
  rtl: boolean;
  /** A row that starts on the reading side. */
  row: ViewStyle['flexDirection'];
  /** Text that reads, and lines up, the way the language does. */
  text: TextStyle;
  /**
   * Words someone else wrote (a moderator's reasons, a name): lined up with the screen, but read in their own
   * direction, so an English sentence on a Soranî screen does not put its full stop first.
   */
  free: TextStyle;
  /** A chevron or an arrow that should point the way the reader reads. */
  flip: ViewStyle | null;
}

/**
 * Right to left for Soranî and Arabic. The app does not flip its layout as a whole (nothing calls
 * I18nManager), so screens using this mirror themselves: rows start on the right, text is aligned and
 * directed right to left, chevrons point the other way. If I18nManager is ever turned on, the platform mirrors
 * everything and this steps aside rather than mirroring twice.
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
    free: rtl ? { writingDirection: 'auto', textAlign: mirror ? 'right' : 'left' } : { writingDirection: 'auto' },
    flip: rtl ? { transform: [{ scaleX: -1 }] } : null,
  };
}
