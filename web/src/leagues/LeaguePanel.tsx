import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useT } from '../i18n/I18nProvider';
import { countdown, zoneDestination, zoneFor, type Zone } from './format';
import { LeagueLadder, leagueName } from '../ui/LeagueLadder';
import { RankList, RankRow } from '../ui/RankRow';
import { Button } from '../components/Button';

interface StandingRow {
  userId: string;
  username: string;
  weeklyXp: number;
  rank: number;
  isSelf: boolean;
}

interface LeagueView {
  /** not taking part — their choice, or a minor who has not chosen; absent on older responses */
  optedOut?: boolean;
  tier: string;
  weekKey: string;
  rank: number;
  promoteCount: number;
  demoteCount: number;
  standings: StandingRow[];
}

/**
 * This week's league cohort (KUR-062), which the browser has never shown.
 *
 * Rankings has had the global leaderboards from the start and `GET /me/league`
 * went uncalled, so XP earned in the browser counted towards a promotion only
 * the phone could tell you about. The cohort is thirty people and the weekly
 * question is which of them move up and which drop — a different question from
 * the boards below, which is why it sits above them rather than as another tab.
 *
 * Fetched once. A cohort settles when the week closes, not while somebody is
 * reading it, so there is nothing here worth re-reading on an interval.
 */
export function LeaguePanel(): React.JSX.Element | null {
  const { client, refreshUser } = useAuth();
  const t = useT();
  const [league, setLeague] = useState<LeagueView | null>(null);
  const [failed, setFailed] = useState(false);
  const [joining, setJoining] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    void client.get<LeagueView>('/me/league').then((res) => {
      if (res.ok) setLeague(res.data);
      else setFailed(true);
    });
  }, [client, reloadKey]);

  /** The way back in, one tap from where the table would be (Settings has the other). */
  async function join(): Promise<void> {
    setJoining(true);
    const res = await client.request('PATCH', '/me', { body: { leaguesEnabled: true } });
    setJoining(false);
    if (res.ok) {
      await refreshUser();
      setReloadKey((n) => n + 1);
    }
  }

  /*
   * Nothing at all while it loads or if it fails. This is an extra panel above
   * a page that works without it, so a skeleton or an error box here would
   * push the leaderboards down to announce something the reader did not ask
   * for — `leagues.noLeague` is for the real answer "you are not in one yet".
   */
  if (failed) return null;
  if (!league) return null;

  /*
   * Out of the leagues: no ladder, no table, and nothing that reads as missing
   * out. Said once, with the way in, and the boards below are untouched.
   */
  if (league.optedOut) {
    return (
      <section className="league-card" aria-labelledby="league-heading">
        <h2 id="league-heading" className="league-card-title">
          {t('leagues.optedOut.title')}
        </h2>
        <p className="muted">{t('leagues.optedOut.body')}</p>
        <Button variant="secondary" size="sm" disabled={joining} onClick={() => void join()}>
          {t('leagues.optedOut.join')}
        </Button>
      </section>
    );
  }

  const endsIn = countdown(league.weekKey);
  const total = league.standings.length;

  /*
   * The front page's picture of a league, made real: when it ends, which league
   * it is, the ladder around it, and the table. Each row is the same row every
   * leaderboard in the app uses; a row about to move gets a thin edge and the
   * name of the league it is heading for.
   */
  return (
    <section className="league-card" aria-labelledby="league-heading">
      <div className="league-card-head">
        {/* nothing once the week is over: see `countdown` */}
        {endsIn ? <span className="lp-float-kicker">{t('leagues.endsIn', { time: endsIn })}</span> : null}
        <h2 id="league-heading" className="league-card-title">
          {leagueName(t, league.tier)}
        </h2>
      </div>

      <LeagueLadder tier={league.tier} />

      {total === 0 ? (
        <p className="muted">{t('leagues.noLeague')}</p>
      ) : (
        <RankList>
          {league.standings.map((row) => {
            const zone = zoneFor(row.rank, total, league.promoteCount, league.demoteCount);
            return (
              <RankRow
                key={row.userId}
                rank={row.rank}
                name={row.isSelf ? t('games.you') : row.username}
                score={`${row.weeklyXp.toLocaleString()} ${t('rankings.unit.xp')}`}
                me={row.isSelf}
                zone={zone === 'safe' ? undefined : zone}
                trailing={<Destination tier={league.tier} zone={zone} />}
              />
            );
          })}
        </RankList>
      )}
    </section>
  );
}

/**
 * Where this row is heading, named rather than coloured.
 *
 * The phone marks the zones with a coloured edge and nothing else, which tells
 * a screen reader — and anyone who cannot separate its red from its green —
 * nothing at all. Naming the destination tier says what the colour was for, in
 * a language the reader chose, using the ten tier names that were already
 * translated. The arrow is decorative and marked as such.
 */
function Destination({ tier, zone }: { tier: string; zone: Zone }): React.JSX.Element | null {
  const t = useT();
  const dest = zoneDestination(tier, zone);
  if (!dest) return null;
  return (
    <span className="badge rank-dest">
      <span aria-hidden="true">{zone === 'promotion' ? '↑' : '↓'}</span>
      {leagueName(t, dest)}
    </span>
  );
}
