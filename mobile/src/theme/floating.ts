import { StyleSheet } from 'react-native';

/**
 * Shadows that lift floating things off the page (the tab bar, the back button, top actions): on a near-white page a
 * white shape needs a wide, faint, low shadow to read as over the page. The colour comes from the palette
 * (`softShadow`). A top control rests on the page; the tab bar rides higher over what scrolls beneath.
 */
export const floating = StyleSheet.create({
  /** A control at a page's top: the back button, a single action, the pill of actions. */
  control: { shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  /** The tab bar, over whatever scrolls beneath it. */
  raised: { shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 12 },
});
