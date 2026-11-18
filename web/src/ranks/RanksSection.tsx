import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { isRankedGame, type MyRanks } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { MedalIcon } from '../components/icons';
import { useLocale, useT } from '../i18n/I18nProvider';
import { RankCard } from './RankCard';
import { gameName, seasonDaysLeft, seasonNamed } from './names';

/**
 * "Your ranks" on the Games page: a card per ranked game the player has begun, the current season, and links to the
 * season's rewards and the badges; games not begun share one quiet line of links. Signed-in only, and a load failure
 * hides the section rather than showing an error above the games.
 */
export function RanksSection(): React.JSX.Element | null {
  const { client, status } = useAuth();
  const t = useT();
  const locale = useLocale();
  const [ranks, setRanks] = useState<MyRanks | null>(null);

  useEffect(() => {
    if (status !== 'signedIn') return;
    let cancelled = false;
    void client.get<MyRanks>('/ranks/me').then((res) => {
      // An answer without the expected shape shows nothing, and ranks in retired games are dropped.
      if (!cancelled && res.ok && Array.isArray(res.data?.ranks) && res.data.season) setRanks({ ...res.data, ranks: res.data.ranks.filter((r) => isRankedGame(r.game)) });
    });
    return () => {
      cancelled = true;
    };
  }, [client, status]);

  if (status !== 'signedIn' || !ranks) return null;
  const season = seasonNamed(t, ranks.season);
  // A game is begun once one rated game has been played or a rank found.
  const begun = ranks.ranks.filter((r) => r.tier !== null || (r.placement?.played ?? 0) > 0);
  const untouched = ranks.ranks.filter((r) => !begun.includes(r));
  const cooldown = ranks.cooldownUntil ? new Date(ranks.cooldownUntil) : null;

  return (
    <section className="ranks-section" aria-labelledby="ranks-heading">
      <div className="ranks-section-head">
        <div>
          <h2 id="ranks-heading" className="ranks-section-title">
            {t('ranks.title')}
          </h2>
          <p className="ranks-section-sub">{t('ranks.sub')}</p>
        </div>
        <div className="ranks-section-links">
          <Link to="/app/season" className="ranks-season-link">
            <span className="ranks-season-name">{season.name}</span>
            <span className="ranks-season-days">
              {seasonDaysLeft(t, ranks.season.daysLeft)}
            </span>
          </Link>
          <Link to="/app/badges" className="btn btn-secondary btn-sm">
            <MedalIcon size={16} />
            {t('badges.title')}
          </Link>
        </div>
      </div>
      {cooldown && (
        <p className="ranks-note" role="status">
          {t('ranks.cooldown', { time: cooldown.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) })}
        </p>
      )}
      {begun.length > 0 && (
        <div className="ranks-grid">
          {begun.map((r) => (
            <RankCard key={r.game} rank={r} href={`/app/ranks/${r.game}`} />
          ))}
        </div>
      )}
      {untouched.length > 0 && (
        <div className="ranks-untouched">
          <p className="ranks-untouched-names">
            <span className="ranks-untouched-label">{t('ranks.unplaced')}</span>
            {untouched.map((r) => (
              <Link key={r.game} to={`/app/ranks/${r.game}`} className="ranks-untouched-game">
                {gameName(t, r.game)}
              </Link>
            ))}
          </p>
          <p className="ranks-untouched-hint">{t('ranks.placingHint', { of: untouched[0]!.placement?.of ?? 5 })}</p>
        </div>
      )}
    </section>
  );
}
