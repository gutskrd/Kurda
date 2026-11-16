import { StyleSheet } from 'react-native';

/**
 * How the things that float over a page are lifted off it.
 *
 * The bar of tabs, the way back and the actions at a page's top are solid
 * shapes in the bar's own fill, clear of the screen's edges. On a near-white
 * page a white shape is told from the page by very little, so each has a
 * soft shadow under it: wide, faint and low, enough to say "this is over the
 * page" and no more. The colour comes from the palette (`softShadow`), since
 * a shadow is a colour like any other and has to be right in both schemes.
 *
 * Two weights, by how far off the page the thing is: a control at the top
 * of a page rests on it, and the bar of tabs rides over whatever scrolls
 * beneath.
 */
export const floating = StyleSheet.create({
  /** a control at a page's top: the way back, a single action, the pill of actions */
  control: { shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  /** the bar of tabs, over whatever scrolls beneath it */
  raised: { shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 12 },
});
