import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../i18n/I18nProvider';
import { seasonalLogo } from '../brand/season';

/**
 * Whether the deer has made its entrance in this tab. It rises in once, as
 * the site first draws; the bar is drawn again every time one shell gives way
 * to another (a lesson has none, so leaving a lesson draws it afresh), and a
 * logo that rose in after every lesson was movement on the most used path in
 * the app for nobody's benefit.
 */
let arrived = false;

/** The Hevalo wordmark + the deer, in a scarf in December. Links home. */
export function Brand({ to = '/' }: { to?: string }): React.JSX.Element {
  const t = useT();
  // decided as this bar is first drawn, and kept for as long as it stands: the entrance is not cut short by a re-render
  const [arriving] = useState(() => {
    const first = !arrived;
    arrived = true;
    return first;
  });
  return (
    <Link to={to} className={`brand${arriving ? ' is-arriving' : ''}`} aria-label={t('brand.home')}>
      <img className="brand-mark" src={seasonalLogo()} alt="" aria-hidden="true" />
      <span>Hevalo</span>
    </Link>
  );
}
