import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MyRanks } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { MedalIcon } from '../components/icons';
import { useLocale, useT } from '../i18n/I18nProvider';
import { RankCard } from './RankCard';
import { seasonNamed } from './names';

/**
 * "Your ranks" on the Games page: one card per game with opponents (Wordle
 * Battle, Rhyme Match, Stories), the season they are in, and the way to the
 * season's rewards and the badges.
 *
 * Signed-in only, and quiet when it cannot load: the games below work without
 * it, so a failure here hides the section rather than putting an error above
 * the games.
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
      // an answer without the shape (an API from before Game Ranks) shows nothing
      if (!cancelled && res.ok && Array.isArray(res.data?.ranks) && res.data.season) setRanks(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [client, status]);

  if (status !== 'signedIn' || !ranks) return null;
  const season = seasonNamed(t, ranks.season);
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
              {ranks.season.daysLeft > 0 ? t('seasons.daysLeft', { days: ranks.season.daysLeft }) : t('seasons.lastDay')}
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
      <div className="ranks-grid">
        {ranks.ranks.map((r) => (
          <RankCard key={r.game} rank={r} />
        ))}
      </div>
    </section>
  );
}
