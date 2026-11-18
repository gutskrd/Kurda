import { Link } from 'react-router-dom';
import { ArrowIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import { LeaguePanel } from './LeaguePanel';

/** The whole league this week, opened from the card at the top of Rankings, with the way back to them. */
export function LeaguePage(): React.JSX.Element {
  const t = useT();
  return (
    <div className="container container-narrow rankings-page">
      <Link to="/app/rankings" className="back-link">
        <ArrowIcon size={16} />
        {t('rankings.title')}
      </Link>
      <LeaguePanel />
    </div>
  );
}
