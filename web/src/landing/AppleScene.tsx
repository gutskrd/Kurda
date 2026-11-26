import { useState } from 'react';
import { PATH_SCENES, localeDir } from '@kurda/shared';
import { PathScene } from '../learn/PathScene';
import { useLocale } from '../i18n/I18nProvider';
import { prefersReducedMotion } from '../lib/motion';
import { useDarkPage } from '../theme/useDarkPage';
import '../learn/path.css';

/**
 * The road's apple scene, as it is on the road: Hevalo leans in from the page's edge under an apple bough and eats,
 * bite by bite, until a new apple grows. It is the road's own component and drawing; the front page only sets it at its
 * start edge, mirrored in a right-to-left language. It plays only while seen and holds still under Reduce Motion.
 */
export function AppleScene(): React.JSX.Element {
  const dark = useDarkPage();
  const rtl = localeDir(useLocale()) === 'rtl';
  const [reduce] = useState(prefersReducedMotion);
  return (
    // Cut off at the edge and its foot as on the road, but for the way his body runs on below to leave by the edge.
    <span className="fp-apple-edge" aria-hidden="true" style={{ clipPath: `inset(0 0 -${PATH_SCENES.apple.below}px 0)` }}>
      {/* Drawn for the left edge; at the right one it is mirrored, so it always leans in toward the page. */}
      <PathScene scene="apple" flip={rtl} dark={dark} reduce={reduce} />
    </span>
  );
}
