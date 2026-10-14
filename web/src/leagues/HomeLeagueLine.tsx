import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { LeagueView } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { ChevronIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import { LeagueEmblem } from '../ranks/art';
import { leagueName, leagueNamed, withMeaning } from '../ranks/names';
import { GoalRing } from './GoalRing';

/**
 * Home's one line about the week (contract 4 §U): the league you are in and
 * your place, or that you are safe, beside the weekly goal ring — a door to
 * the league, not a second copy of it. Personal mode says "Your week" and the
 * same ring. Nothing for a visitor without an account, and nothing while it
 * loads or if it fails: the wall below is the page.
 */
export function HomeLeagueLine(): React.JSX.Element | null {
  const { client, status } = useAuth();
  const t = useT();
  const [league, setLeague] = useState<LeagueView | null>(null);

  useEffect(() => {
    if (status !== 'signedIn') return;
    let cancelled = false;
    void client.get<LeagueView>('/me/league').then((res) => {
      // an answer without the week's numbers (an older API) shows nothing
      if (!cancelled && res.ok && typeof res.data?.weeklyXp === 'number') setLeague(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [client, status]);

  if (status !== 'signedIn' || !league) return null;
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
