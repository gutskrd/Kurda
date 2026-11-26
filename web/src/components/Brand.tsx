import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../i18n/I18nProvider';

/** Whether the deer has risen in this tab already; the bar redraws after every lesson, and should not animate each time. */
let arrived = false;

/** The Hevalo wordmark and the deer, linking home. */
export function Brand({ to = '/' }: { to?: string }): React.JSX.Element {
  const t = useT();
  // Decided on the first draw and kept, so a re-render does not cut the entrance short.
  const [arriving] = useState(() => {
    const first = !arrived;
    arrived = true;
    return first;
  });
  return (
    <Link to={to} className={`brand${arriving ? ' is-arriving' : ''}`} aria-label={t('brand.home')}>
      <img className="brand-mark" src="/logo-mark.png" alt="" aria-hidden="true" />
      <span>Hevalo</span>
    </Link>
  );
}
