import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LEAGUE_TIERS, NO_DEMOTION_TIERS, type LeagueView } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { ChevronIcon, DownIcon, ShieldIcon, TimerIcon, UpIcon } from '../components/icons';
import { Skeleton } from '../components/Skeleton';
import { ErrorState } from '../components/states';
import { useLocale, useT, type Translate } from '../i18n/I18nProvider';
import { LeagueEmblem } from '../ranks/art';
import { leagueName, leagueNamed, withMeaning } from '../ranks/names';
import { LeagueMoment } from './LeagueMoment';
import { weekLeft } from './LeaguePanel';

/** Where the whole league opens: its table, ladder and goal ring. */
export const LEAGUE_PATH = '/app/rankings/league';

/**
 * Your league this week as one compact card at the top of Rankings: the tier, your place, the days left and the lines
 * to move up or down, opening the whole league. Before the week's first lesson it says the week starts with one; out
 * of the leagues it shows your own week. Moving up last week is celebrated once, from here as from the league.
 */
export function LeagueCard(): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const locale = useLocale();
  const [league, setLeague] = useState<LeagueView | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    void client.get<LeagueView>('/me/league').then((res) => {
      if (cancelled) return;
      // An answer without the week's numbers is not shown.
      if (res.ok && typeof res.data?.weeklyXp === 'number' && Array.isArray(res.data.standings)) setLeague(res.data);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [client, reloadKey]);

  if (failed) {
    return (
      <div className="league-card-mini is-failed">
        <ErrorState message={t('error.generic')} onRetry={() => setReloadKey((n) => n + 1)} />
      </div>
    );
  }
  if (!league) {
    return (
      <div className="league-card-mini is-loading" aria-hidden="true">
        <Skeleton circle className="league-card-mini-skel" />
        <span className="league-card-mini-text">
          <span className="league-card-mini-title">
            <Skeleton line w={112} />
          </span>
          <span className="league-card-mini-meta">
            <Skeleton line w={176} />
            <span className="league-card-mini-left">
              <Skeleton line w={148} />
            </span>
          </span>
        </span>
      </div>
    );
  }

  const personal = league.mode === 'personal' || league.optedOut;
  const tier = league.tier ?? 'dilop';
  return (
    <>
      <Link to={LEAGUE_PATH} className={`league-card-mini league-${personal ? 'personal' : tier}`}>
        {!personal && <LeagueEmblem tier={tier} size={52} title={withMeaning(t, leagueNamed(t, tier))} />}
        <span className="league-card-mini-text">
          <span className="league-card-mini-title">{personal ? t('leagues.personal.title') : leagueName(t, tier)}</span>
          <span className="league-card-mini-meta">
            {personal ? (
              <span>{league.goalMet ? t('leagues.personal.met') : t('leagues.goalToGo', { xp: Math.max(0, league.goalXp - league.weeklyXp), goal: league.goalXp })}</span>
            ) : league.joined && league.groupSize > 0 ? (
              <span>{t('leagues.result.place', { rank: league.rank, size: league.groupSize, xp: league.weeklyXp.toLocaleString(locale) })}</span>
            ) : (
              <span>{t('leagues.resting.title')}</span>
            )}
            <span className="league-card-mini-left">
              <TimerIcon size={14} />
              {weekLeft(t, league.endsAt, locale)}
            </span>
          </span>
          {!personal && league.joined && <ZoneLines league={league} t={t} />}
        </span>
        <ChevronIcon size={18} className="league-card-mini-go flip-rtl" />
        <span className="sr-only">{t('leagues.card.open')}</span>
      </Link>
      <LeagueMoment week={league.lastWeek} />
    </>
  );
}

/** The lines this week turns on: safe once the goal is met, else how many move up and how many may move down. */
function ZoneLines({ league, t }: { league: LeagueView; t: Translate }): React.JSX.Element {
  const tier = league.tier ?? 'dilop';
  if (league.safe || league.goalMet) {
    return (
      <span className="league-card-mini-zones">
        <span className="league-card-mini-zone is-safe">
          <ShieldIcon size={13} />
          {t('leagues.safe')}
        </span>
      </span>
    );
  }
  const top = tier === LEAGUE_TIERS[LEAGUE_TIERS.length - 1];
  const noDemotion = NO_DEMOTION_TIERS.includes(tier);
  return (
    <span className="league-card-mini-zones">
      {!top && league.promoteCount > 0 && (
        <span className="league-card-mini-zone is-up">
          <UpIcon size={13} />
          {t('leagues.card.up', { count: league.promoteCount })}
        </span>
      )}
      {noDemotion ? (
        <span className="league-card-mini-zone">{t('leagues.noDemotion', { tier: leagueName(t, tier) })}</span>
      ) : (
        league.demoteCount > 0 && (
          <span className="league-card-mini-zone is-down">
            <DownIcon size={13} />
            {t('leagues.card.down', { count: league.demoteCount })}
          </span>
        )
      )}
    </span>
  );
}
