import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { LeagueView } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { ChevronIcon } from '../components/icons';
import { Skeleton } from '../components/Skeleton';
import { useT } from '../i18n/I18nProvider';
import { LeagueEmblem } from '../ranks/art';
import { leagueName, leagueNamed, withMeaning } from '../ranks/names';
import { GoalRing } from './GoalRing';

/**
 * Home's line about the week: the reader's league and place, or that they are safe, beside the goal ring, linking to
 * the league. Personal mode says "Your week". Nothing shows for visitors or on failure, and while loading it holds its
 * height so the wall below does not jump.
 */
export function HomeLeagueLine(): React.JSX.Element | null {
  const { client, status } = useAuth();
  const t = useT();
  const [league, setLeague] = useState<LeagueView | null>(null);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (status !== 'signedIn') return;
    let cancelled = false;
    void client.get<LeagueView>('/me/league').then((res) => {
      if (cancelled) return;
      // An answer without the week's numbers shows nothing.
      if (res.ok && typeof res.data?.weeklyXp === 'number') setLeague(res.data);
      setSettled(true);
    });
    return () => {
      cancelled = true;
    };
  }, [client, status]);

  if (status !== 'signedIn') return null;
  if (!league) {
    if (settled) return null;
    // The line's box, emblem and ring while the words load.
    return (
      <div className="home-league skeleton-late" aria-hidden="true">
        <Skeleton size={44} circle />
        <span className="home-league-text">
          <span className="home-league-title">
            <Skeleton line w={96} />
          </span>
          <span className="home-league-detail">
            <Skeleton line w={168} />
          </span>
        </span>
        <Skeleton size={44} circle />
        <span className="home-league-go" style={{ width: 16 }} />
      </div>
    );
  }
  const personal = league.mode === 'personal' || league.optedOut;
  const tier = !personal ? league.tier : null;

  let title: string;
  let detail: string;
  if (personal) {
    title = t('leagues.personal.title');
    detail = league.goalMet ? t('leagues.personal.met') : t('home.league.goal', { xp: league.weeklyXp.toLocaleString(), goal: league.goalXp.toLocaleString() });
  } else if (!league.joined || !tier) {
    title = tier ? leagueName(t, tier) : t('home.league.title');
    detail = t('home.league.join');
  } else {
    title = leagueName(t, tier);
    detail = league.safe || league.goalMet
      ? t('leagues.safe')
      : t('home.league.place', { rank: league.rank, size: league.groupSize, xp: league.weeklyXp.toLocaleString(), goal: league.goalXp.toLocaleString() });
  }

  return (
    <Link to="/app/rankings" className={`home-league${league.safe || league.goalMet ? ' is-safe' : ''}`}>
      {tier ? (
        <LeagueEmblem tier={tier} size={44} title={withMeaning(t, leagueNamed(t, tier))} />
      ) : null}
      <span className="home-league-text">
        <span className="home-league-title">{title}</span>
        <span className="home-league-detail">{detail}</span>
      </span>
      <GoalRing xp={league.weeklyXp} goal={league.goalXp} size={44} label={false} />
      <ChevronIcon size={16} className="home-league-go" />
    </Link>
  );
}
