import { Link } from 'react-router-dom';
import { useT } from '../i18n/I18nProvider';
import { seasonalLogo } from '../brand/season';

/** The Hevalo wordmark + the deer, in a scarf in December. Links home. */
export function Brand({ to = '/' }: { to?: string }): React.JSX.Element {
  const t = useT();
  return (
    <Link to={to} className="brand" aria-label={t('brand.home')}>
      <img className="brand-mark" src={seasonalLogo()} alt="" aria-hidden="true" />
      <span>Hevalo</span>
    </Link>
  );
}
