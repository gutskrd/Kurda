import { Link } from 'react-router-dom';
import { toLeagueTier, type ProfileLeague, type ShowcaseBadge } from '@kurda/shared';
import { useT } from '../i18n/I18nProvider';
import { Medal } from '../badges/parts';
import { LeagueEmblem } from '../ranks/art';
import { badgeNamed, leagueName, leagueNamed, withMeaning } from '../ranks/names';

/**
 * A profile's progress: the three chosen badges and the league, translated and labelled. A missing league tier means
 * not taking part, and shows nothing.
 */
export function ProfileProgress({
  badges,
  league,
  own = false,
}: {
  badges?: ShowcaseBadge[];
  league?: ProfileLeague | null;
  own?: boolean;
}): React.JSX.Element | null {
  const t = useT();
  const leagueTier = toLeagueTier(league?.tier ?? null);
  const showcase = badges ?? [];
  if (showcase.length === 0 && !leagueTier && !own) return null;

  return (
    <div className="mkp-showcase-block profile-progress">
      {(showcase.length > 0 || own) && (
        <>
          <div className="mkp-showcase-label profile-progress-head">
            {t('profile.badges')}
            {own && (
              <Link to="/app/badges" className="profile-progress-link">
                {t('profile.allBadges')}
              </Link>
            )}
          </div>
          <div className="mkp-showcase">
            {showcase.length > 0 ? (
              <ul className="profile-badges">
                {showcase.map((b) => {
                  const named = badgeNamed(t, b.key);
                  return (
                    <li key={b.key} className="profile-badge badge-medal">
                      <Medal view={b} size={72} />
                      <span className="profile-badge-name">{named.name}</span>
                      {named.meaning && <span className="profile-badge-meaning">{named.meaning}</span>}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mkp-bio muted">{t('profile.noBadges')}</p>
            )}
          </div>
        </>
      )}

      {leagueTier && (
        <>
          <div className="mkp-showcase-label">{t('profile.stat.league')}</div>
          <ul className="profile-ranks">
            <li className={`profile-rank league-${leagueTier}`}>
              <LeagueEmblem tier={leagueTier} size={56} title={withMeaning(t, leagueNamed(t, leagueTier))} />
              <span className="profile-rank-text">
                <span className="profile-rank-tier">{leagueName(t, leagueTier)}</span>
                {leagueNamed(t, leagueTier).meaning && <span className="profile-rank-best">{leagueNamed(t, leagueTier).meaning}</span>}
              </span>
            </li>
          </ul>
        </>
      )}
    </div>
  );
}
