import { Link } from 'react-router-dom';
import { useT } from '../i18n/I18nProvider';

/** The MyKurda wordmark + the real K/sun logo. Links home. */
export function Brand({ to = '/' }: { to?: string }): React.JSX.Element {
  const t = useT();
  return (
    <Link to={to} className="brand" aria-label={t('brand.home')}>
      <img className="brand-mark" src="/logo.png" alt="" aria-hidden="true" />
      <span>MyKurda</span>
    </Link>
  );
}
