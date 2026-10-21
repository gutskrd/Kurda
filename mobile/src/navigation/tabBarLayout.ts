import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from '../theme/tokens';

/**
 * Geometry for the floating glass tab-bar island (KUR-268). Kept in one place so
 * the bar (App.tsx) and the scrollable tab screens agree on how much bottom
 * space to reserve — otherwise the island would cover the last row of content.
 */
export const TAB_BAR_HEIGHT = 62;
/**
 * How far the island sits from the edges of the screen.
 *
 * 21, which is what iOS 26 insets its own tab bars by on the left, right and
 * bottom — the same 21pt band the home indicator lives in. The bar used to be
 * pushed a further 12 above the safe area, so it floated noticeably higher
 * than the system's.
 */
export const TAB_BAR_MARGIN = 21;
/**
 * How far above the island the page fades out under it (GlassTabBar), so
 * content scrolling down dissolves before it reaches the bar.
 */
export const TAB_BAR_FADE = 28;

/** Bottom padding a scrollable tab screen needs so its content clears the island. */
export function useTabBarInset(): number {
  const insets = useSafeAreaInsets();
  // the island is TAB_BAR_MARGIN off the bottom edge, not off the safe area,
  // so content has to clear whichever of the two reaches higher — and the
  // fade above it, so the last row is whole when the list is scrolled to its end
  return Math.max(insets.bottom, TAB_BAR_MARGIN) + TAB_BAR_HEIGHT + TAB_BAR_FADE;
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
