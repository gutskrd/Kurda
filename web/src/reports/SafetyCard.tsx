import { Link } from 'react-router-dom';
import { ChevronIcon, FlagIcon, LockIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import { MY_REPORTS_PATH, STANDING_PATH } from './restriction';

/**
 * Settings → Safety: the two pages about reports and decisions.
 *
 * Next to Blocked people because they answer the same worry from the other
 * side — what happened to what I reported, and is anything wrong with my
 * account — and because every "you can't send this" notice links to one of
 * them, so they need a door that is not an error message.
 */
export function SafetyCard(): React.JSX.Element {
  const t = useT();
  return (
    <section className="card" style={{ marginTop: 20 }}>
      <h2 className="friend-heading" style={{ marginTop: 0 }}>
        {t('settings.safety.title')}
      </h2>
      <p className="muted" style={{ fontSize: '0.92rem', marginBottom: 10 }}>
        {t('settings.safety.help')}
      </p>
      <nav className="safety-links" aria-label={t('settings.safety.title')}>
        <Link to={MY_REPORTS_PATH} className="safety-link">
          <FlagIcon size={18} />
          <span>{t('reports.mine.title')}</span>
          <ChevronIcon size={16} className="safety-link-go" />
        </Link>
        <Link to={STANDING_PATH} className="safety-link">
          <LockIcon size={18} />
          <span>{t('standing.title')}</span>
          <ChevronIcon size={16} className="safety-link-go" />
        </Link>
      </nav>
    </section>
  );
}
