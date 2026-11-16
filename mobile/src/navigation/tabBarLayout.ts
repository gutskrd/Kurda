import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from '../theme/tokens';

/**
 * Geometry for the tab bar, kept in one place so the bar (TabBar) and the
 * scrollable tab screens agree on how much bottom space to reserve —
 * otherwise the bar would cover the last row of content.
 */
/** The bar's own height: an icon with its word under it, and room round both for the capsule behind the tab you are on. */
export const TAB_BAR_HEIGHT = 64;

/** How far in from the screen's sides the bar floats: the page's own gutter, so it lines up with the cards above it. */
export const TAB_BAR_SIDE = 16;

/**
 * How far above the screen's bottom edge the bar floats.
 *
 * Just over the home indicator on a phone that has one (most of its 34
 * points are empty band, and the bar may sit in them), and a small margin
 * up from the edge on a phone that has none.
 */
export function tabBarLift(bottomInset: number): number {
  return Math.max(bottomInset - 8, 12);
}

/** Bottom padding a scrollable tab screen needs so its last row clears the floating bar, with a little air over it. */
export function useTabBarInset(): number {
  const insets = useSafeAreaInsets();
  return tabBarLift(insets.bottom) + TAB_BAR_HEIGHT + spacing.md;
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
