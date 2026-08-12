import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from '../theme/tokens';

/**
 * Geometry for the floating glass tab-bar island (KUR-268). Kept in one place so
 * the bar (App.tsx) and the scrollable tab screens agree on how much bottom
 * space to reserve — otherwise the island would cover the last row of content.
 */
export const TAB_BAR_HEIGHT = 62;
export const TAB_BAR_MARGIN = 12; // gap between the island and the screen edges

/** Bottom padding a scrollable tab screen needs so its content clears the island. */
export function useTabBarInset(): number {
  const insets = useSafeAreaInsets();
  return insets.bottom + TAB_BAR_MARGIN + TAB_BAR_HEIGHT + 16;
}

/**
 * Top padding a custom-header stack/modal screen needs so its header (back /
 * close button, title) clears the status bar and notch / Dynamic Island (KUR-269).
 */
export function useScreenTopInset(): number {
  const insets = useSafeAreaInsets();
  return insets.top + spacing.md;
}
