import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from '../theme/tokens';

/**
 * Tab bar geometry, in one place so the bar and the scrollable tab screens agree on how much bottom space to reserve.
 */
/** The bar's own height: an icon alone, with room round it for the capsule behind the tab you are on. */
export const TAB_BAR_HEIGHT = 60;

/** How far in from the screen's sides the bar floats: the page's own gutter, so it lines up with the cards above it. */
export const TAB_BAR_SIDE = 16;

/**
 * How far above the screen's bottom edge the bar floats: just over the home indicator where there is one (most of its
 * 34pt is empty and the bar may sit in it), and a small margin up from the edge where there is none.
 */
export function tabBarLift(bottomInset: number): number {
  return Math.max(bottomInset - 8, 12);
}

/** Bottom padding a scrollable tab screen needs so its last row clears the floating bar, with a little air over it. */
export function useTabBarInset(): number {
  const insets = useSafeAreaInsets();
  return tabBarLift(insets.bottom) + TAB_BAR_HEIGHT + spacing.md;
}

/** Top padding a custom-header screen needs so its header clears the status bar and the notch or Dynamic Island. */
export function useScreenTopInset(): number {
  const insets = useSafeAreaInsets();
  return insets.top + spacing.md;
}

/**
 * Bottom padding for the last thing on a screen the tab bar is not over (a lesson's Check button, a chat's composer),
 * so it clears the home indicator; never less than `min`. While the keyboard is up there is no inset, since the
 * indicator is under the keyboard.
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
