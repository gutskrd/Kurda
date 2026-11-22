import { Dimensions, useWindowDimensions } from 'react-native';
import { layout } from './tokens';

/**
 * The width the app's pages are laid out in: the window's on a phone, and the centred column's (`layout.page`) on an
 * unfolded phone or a tablet, where App.tsx stands the app in that column. Anything sized from the screen's width reads
 * this instead of the window, so it fits the column it is drawn in.
 */
export function usePageWidth(): number {
  return Math.min(useWindowDimensions().width, layout.page);
}

/** The same width, read once outside a component's render. */
export function pageWidth(): number {
  return Math.min(Dimensions.get('window').width, layout.page);
}

/** The narrowest phones, folded phones' cover screens among them, where a row keeps only what it cannot do without. */
export const NARROW_PAGE = 320;

/** Whether the page is that narrow; a window not yet measured (width 0) is not. */
export function useNarrowPage(): boolean {
  const width = usePageWidth();
  return width > 0 && width < NARROW_PAGE;
}
