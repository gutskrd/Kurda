import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from '../theme/tokens';

/**
 * Geometry for the tab bar, kept in one place so the bar (TabBar) and the
 * scrollable tab screens agree on how much bottom space to reserve —
 * otherwise the bar would cover the last row of content.
 */
/** The bar's own height, above the home indicator: the 49 points the system's tab bar is. */
export const TAB_BAR_HEIGHT = 49;

/** Bottom padding a scrollable tab screen needs so its content clears the bar. */
export function useTabBarInset(): number {
  const insets = useSafeAreaInsets();
  // the bar is docked: its icons, and below them the home indicator's band
  return insets.bottom + TAB_BAR_HEIGHT;
}

/**
 * Top padding a custom-header stack/modal screen needs so its header (back /
 * close button, title) clears the status bar and notch / Dynamic Island (KUR-269).
 */
export function useScreenTopInset(): number {
  const insets = useSafeAreaInsets();
  return insets.top + spacing.md;
}

/**
 * Bottom padding for the last thing on a screen the tab bar is not over — a
 * lesson's Check button, a chat's composer — so it clears the home indicator
 * instead of sitting on it. Never less than `min`, the room the screen gives
 * it anyway on a phone with no indicator.
 *
 * While the keyboard is up the keyboard is what is under it, and the home
 * indicator is under the keyboard: keeping the inset then would leave a band
 * of empty page between what is being typed and the keys.
 */
export function useScreenBottomInset(min: number): number {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardShown();
  return keyboard ? min : Math.max(insets.bottom, min);
}

/** Whether the on-screen keyboard is up — from the moment it starts to rise on iOS, once it is up on Android. */
export function useKeyboardShown(): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => setShown(true));
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setShown(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return shown;
}
