import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
