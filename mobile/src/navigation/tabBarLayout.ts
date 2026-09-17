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

/** Bottom padding a scrollable tab screen needs so its content clears the island. */
export function useTabBarInset(): number {
  const insets = useSafeAreaInsets();
  // the island is TAB_BAR_MARGIN off the bottom edge, not off the safe area,
  // so content has to clear whichever of the two reaches higher
  return Math.max(insets.bottom, TAB_BAR_MARGIN) + TAB_BAR_HEIGHT + 16;
}

/**
 * Top padding a custom-header stack/modal screen needs so its header (back /
 * close button, title) clears the status bar and notch / Dynamic Island (KUR-269).
 */
export function useScreenTopInset(): number {
  const insets = useSafeAreaInsets();
  return insets.top + spacing.md;
}
