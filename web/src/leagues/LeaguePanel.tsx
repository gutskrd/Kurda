import { Fragment, useEffect, useRef, useState } from 'react';
import {
  LEAGUE_TIERS,
  NO_DEMOTION_TIERS,
  TROPHY_PLACES,
  tierAbove,
  tierBelow,
  type LeagueStandingRow,
  type LeagueTier,
  type LeagueView,
  type LeagueWeekResult,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Button, LinkButton } from '../components/Button';
import { Modal } from '../components/Modal';
import { LeagueCardSkeleton } from '../components/skeletons';
import { ErrorState } from '../components/states';
import { BookIcon, DownIcon, PersonGlyph, ShieldIcon, SignOutIcon, SparkleIcon, TimerIcon, UpIcon } from '../components/icons';
import { SpeakingCharacter } from '../characters/SpeakingCharacter';
import { useLocale, useT } from '../i18n/I18nProvider';
import { LeagueEmblem } from '../ranks/art';
import { leagueName, leagueNamed, withMeaning, type Translate } from '../ranks/names';
import { colourFor, initialsOf } from '../lib/initials';
import { RankList, RankRow } from '../ui/RankRow';
import { GoalRing } from './GoalRing';
import { LeagueMoment } from './LeagueMoment';

/**
 * This week's Learning League (contract 4 §L, §U), rebuilt.
 *
 * A group of up to twenty who earned learning XP this week, in one of six
 * tiers named for water — a drop to the ocean. The top quarter move up if they
 * also met the weekly goal; the bottom 15% move down only if they missed it,
 * and never from Dilop or Kanî.
 *
 * It reads from the top: the league's name and how many days the week has
 * left (whole days, never a clock running down), the six leagues in a row with
 * yours the biggest, those behind you in their colours and those ahead still
 * locked, and under a line, the week — the goal ring and "Safe this week ✓"
 * the moment it is met, then the table. Before the first lesson of the week
 * there is no table yet, and Hevalo is asleep beside the way in. At the end,
 * the way out of the leagues, asked once, plainly.
 *
 * It is the page itself, the League tab of Rankings: nothing round it but the
 * page, the line across under the ladder running from edge to edge.
 *
 * The zones are drawn with an arrow, a word and a line across the table —
 * never colour alone. Personal mode (someone not taking part, and teens by
 * default) keeps the same ring and compares this week with the last ones,
 * with no group and no table.
 */
export function LeaguePanel(): React.JSX.Element | null {
  const { client, refreshUser } = useAuth();
  const t = useT();
  const [league, setLeague] = useState<LeagueView | null>(null);
  const [failed, setFailed] = useState(false);
  const [joining, setJoining] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    void client.get<LeagueView>('/me/league').then((res) => {
      if (cancelled) return;
      // an answer without the week's numbers (an API from before the rebuilt leagues) is not shown
      if (res.ok && typeof res.data?.weeklyXp === 'number' && Array.isArray(res.data.standings)) setLeague(res.data);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [client, reloadKey]);

  /** In or out of the leagues, from here (Settings has the other switch): saved, then the week read again. */
  async function choose(leaguesEnabled: boolean): Promise<boolean> {
    setJoining(true);
    const res = await client.request('PATCH', '/me', { body: { leaguesEnabled } });
    setJoining(false);
    if (res.ok) {
      await refreshUser();
      setReloadKey((n) => n + 1);
    }
    return res.ok;
  }
  const join = (): Promise<boolean> => choose(true);

  // the tab's whole content: said when it cannot be read, with the way to try again
  if (failed) return <ErrorState message={t('error.generic')} onRetry={() => setReloadKey((n) => n + 1)} />;
  if (!league) return <LeagueCardSkeleton />;

  if (league.mode === 'personal' || league.optedOut) {
    return <PersonalWeek league={league} onJoin={() => void join()} joining={joining} />;
  }

  return (
    <section className={`league-page league-now league-${league.tier ?? 'none'}`} aria-labelledby="league-heading">
      <LeagueHead league={league} />
      <Ladder tier={league.tier ?? 'dilop'} />
      <hr className="league-week-rule" />
      {league.joined ? (
        <>
          <GoalRow league={league} />
          {league.standings.length > 0 && <Standings league={league} />}
        </>
      ) : (
        <Resting />
      )}
      {league.lastWeek && <LastWeek result={league.lastWeek} />}
      {/* moved up last week: celebrated once, the first time the league is opened after */}
      <LeagueMoment week={league.lastWeek} />
      <LeaveLeagues busy={joining} onLeave={() => choose(false)} />
    </section>
  );
}

/**
 * How long the week has left, in whole days and said calmly — "3 days left",
 * "1 day left" — and on its last day the local day and time it closes. Never
 * hours and minutes running down: a week is something to plan, not to race.
 */
export function weekLeft(t: Translate, endsAt: string, locale: string, now: number = Date.now()): string {
  const at = new Date(endsAt).getTime();
  if (Number.isNaN(at)) return '';
  const days = Math.floor((at - now) / 86_400_000);
  if (days >= 2) return t('leagues.daysLeft', { count: days });
  if (days === 1) return t('leagues.dayLeft');
  return t('leagues.weekEnds', { when: weekEnds(endsAt, locale) });
}

/** "Monday 02:00": when the week closes, in the reader's own clock and words. */
export function weekEnds(endsAt: string, locale: string): string {
  const d = new Date(endsAt);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(locale, { weekday: 'long', hour: '2-digit', minute: '2-digit' });
}

/** The league's name, what it means, and how many days the week has left. */
function LeagueHead({ league }: { league: LeagueView }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const tier = league.tier ?? 'dilop';
  const named = leagueNamed(t, tier);
  return (
    <header className="league-week-head">
      <h2 id="league-heading" className="league-week-title">
        {leagueName(t, tier)}
      </h2>
      {named.meaning && <p className="league-week-meaning">{named.meaning}</p>}
      <p className="league-week-left">
        <TimerIcon size={16} />
        <span>{weekLeft(t, league.endsAt, locale)}</span>
      </p>
    </header>
  );
}

/**
 * The six leagues in a row, a drop to the ocean: those you have come through
 * in their colours, yours bigger than the rest, and those still ahead as their
 * own shapes in grey with a keyhole. Each is named for a screen reader with
 * where it stands for you. Too wide for a phone, it scrolls sideways, and it
 * opens with yours in the middle of it.
 */
function Ladder({ tier }: { tier: LeagueTier }): React.JSX.Element {
  const t = useT();
  const here = LEAGUE_TIERS.indexOf(tier);
  const strip = useRef<HTMLOListElement>(null);
  const mine = useRef<HTMLLIElement>(null);
  useEffect(() => {
    const row = strip.current;
    const item = mine.current;
    if (!row || !item || typeof row.scrollBy !== 'function') return;
    // only sideways: the page itself does not move
    const a = row.getBoundingClientRect();
    const b = item.getBoundingClientRect();
    row.scrollBy({ left: b.left + b.width / 2 - (a.left + a.width / 2) });
  }, [tier]);
  return (
    <ol className="league-ladder" ref={strip}>
      {LEAGUE_TIERS.map((each, i) => {
        const where = i < here ? 'reached' : i === here ? 'here' : 'ahead';
        const league = withMeaning(t, leagueNamed(t, each));
        return (
          <li key={each} ref={i === here ? mine : undefined} className={`league-ladder-step is-${where}`} aria-current={i === here ? 'true' : undefined}>
            <LeagueEmblem tier={each} size={i === here ? 88 : 56} locked={i > here} title={t(LADDER_SAYS[where], { league })} />
          </li>
        );
      })}
    </ol>
  );
}

const LADDER_SAYS = { reached: 'leagues.ladder.reached', here: 'leagues.ladder.here', ahead: 'leagues.ladder.ahead' } as const;

/** Joined this week: the goal ring, where the week stands, and the group's size. */
function GoalRow({ league }: { league: LeagueView }): React.JSX.Element {
  const t = useT();
  return (
    <div className="league-goal-row">
      <GoalRing xp={league.weeklyXp} goal={league.goalXp} size={84} />
      <div className="league-goal-text">
        <GoalLine league={league} />
        {league.groupSize > 0 && <p className="league-goal-group">{t('leagues.groupOf', { count: league.groupSize })}</p>}
      </div>
    </div>
  );
}

/**
 * Not in a group yet this week: there is no table to show, so none is — Hevalo
 * asleep, and the one thing that starts the week, said as an invitation.
 */
function Resting(): React.JSX.Element {
  const t = useT();
  return (
    <div className="league-resting">
      <SpeakingCharacter speaker="hevalo" audio={null} crop="full" size={150} resting className="league-resting-figure" />
      <h3 className="league-resting-title">{t('leagues.resting.title')}</h3>
      <p className="league-resting-body">{t('leagues.joinHint')}</p>
      <LinkButton to="/app/learn" block className="league-resting-go">
        <BookIcon size={20} />
        {t('leagues.notJoined.start')}
      </LinkButton>
    </div>
  );
}

/**
 * The way out of the weekly leagues: a button of its own at the end of the
 * week, drawn as plainly as any other, where it is found when it is looked
 * for. Asked once, in plain words that say what stays — no "are you sure you
 * want to give up", and Leave is not drawn as a danger: nothing is lost, and
 * the way back in is on the page that follows.
 */
function LeaveLeagues({ busy, onLeave }: { busy: boolean; onLeave: () => Promise<boolean> }): React.JSX.Element {
  const t = useT();
  const [asking, setAsking] = useState(false);
  return (
    <div className="league-leave">
      <Button variant="secondary" onClick={() => setAsking(true)}>
        <SignOutIcon size={18} />
        {t('leagues.leave')}
      </Button>
      <Modal open={asking} onClose={() => setAsking(false)} label={t('leagues.leave.title')}>
        <div className="league-leave-dialog">
          <h2 className="league-leave-title">{t('leagues.leave.title')}</h2>
          <p className="league-leave-body">{t('leagues.leave.body')}</p>
          <div className="league-leave-actions">
            <Button variant="secondary" onClick={() => setAsking(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                void onLeave().then((ok) => {
                  if (ok) setAsking(false);
                });
              }}
            >
              {t('leagues.leave.confirm')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/** The one line under the head that says where the week stands, kindly. */
function GoalLine({ league }: { league: LeagueView }): React.JSX.Element | null {
  const t = useT();
  const tier = league.tier ?? 'dilop';
  const me = league.standings.find((r) => r.isSelf);
  const top = tier === LEAGUE_TIERS[LEAGUE_TIERS.length - 1];
  if (league.safe || league.goalMet) {
    return (
      <p className="league-status is-safe" role="status">
        <ShieldIcon size={16} />
        <span>
          <strong>{t('leagues.safe')}</strong> {t('leagues.safeBody')}
        </span>
      </p>
    );
  }
  if (me?.zone === 'promotion' && !top) {
    return (
      <p className="league-status is-up">
        <UpIcon size={15} />
        <span>{t('leagues.inZoneNeedGoal', { count: league.promoteCount, goal: league.goalXp, tier: leagueName(t, tierAbove(tier)) })}</span>
      </p>
    );
  }
  return (
    <p className="league-status is-plain">
      <span>{t('leagues.goalToGo', { xp: Math.max(0, league.goalXp - league.weeklyXp), goal: league.goalXp })}</span>
      {NO_DEMOTION_TIERS.includes(tier) && <span className="league-status-aside">{t('leagues.noDemotion', { tier: leagueName(t, tier) })}</span>}
    </p>
  );
}

function Standings({ league }: { league: LeagueView }): React.JSX.Element {
  const t = useT();
  const tier = league.tier ?? 'dilop';
  const top = tier === LEAGUE_TIERS[LEAGUE_TIERS.length - 1];
  const rows = league.standings;
  const lastUp = top ? -1 : findLastIndex(rows, (r) => r.zone === 'promotion');
  const firstDown = rows.findIndex((r) => r.zone === 'demotion');
  const merged = new Set(rows.map((r) => r.tier)).size > 1;
  return (
    <RankList label={leagueName(t, tier)}>
      {rows.map((row, i) => (
        <Fragment key={row.userId ?? `row-${row.rank}`}>
          {i === firstDown && firstDown > 0 && (
            <li className="league-divider is-down" aria-hidden="true">
              <DownIcon size={13} />
              {t('leagues.zoneLine.down', { tier: leagueName(t, tierBelow(tier)) })}
            </li>
          )}
          <RankRow
            rank={row.rank}
            name={row.isSelf ? t('games.you') : (row.username ?? t('leagues.unnamed'))}
            href={row.userId && !row.isSelf ? `/app/users/${row.userId}` : undefined}
            score={`${row.weeklyXp.toLocaleString()} ${t('rankings.unit.xp')}`}
            face={<Face row={row} />}
            me={row.isSelf}
            zone={row.zone === 'stay' ? undefined : row.zone}
            marker={merged && row.tier !== tier ? <span className="league-row-tier">{leagueName(t, row.tier)}</span> : undefined}
            trailing={<ZoneTag row={row} top={top} goal={league.goalXp} t={t} />}
          />
          {i === lastUp && i < rows.length - 1 && (
            <li className="league-divider is-up" aria-hidden="true">
              <UpIcon size={13} />
              {t('leagues.zoneLine.up', { count: league.promoteCount, tier: leagueName(t, tierAbove(tier)) })}
            </li>
          )}
        </Fragment>
      ))}
    </RankList>
  );
}

/**
 * A row's face: the learner's initials on their own colour, the same as on
 * the phone. Somebody the table may not name gets a quiet silhouette, not
 * letters made up from "A learner".
 */
function Face({ row }: { row: LeagueStandingRow }): React.JSX.Element {
  if (!row.username) return <PersonGlyph size={16} />;
  return (
    <span className="rank-initials" style={{ background: colourFor(row.userId ?? `row-${row.rank}`) }}>
      {initialsOf(row.username)}
    </span>
  );
}

function findLastIndex<T>(list: readonly T[], test: (v: T) => boolean): number {
  for (let i = list.length - 1; i >= 0; i--) if (test(list[i]!)) return i;
  return -1;
}

/**
 * Where a row is heading, in a word and an arrow. In Okyanûs nobody moves up:
 * the top three who met the goal are on course for the Pêla trophy instead.
 */
function ZoneTag({ row, top, goal, t }: { row: LeagueStandingRow; top: boolean; goal: number; t: Translate }): React.JSX.Element | null {
  if (top && row.rank <= TROPHY_PLACES && row.weeklyXp >= goal) {
    return (
      <span className="zone-tag is-trophy">
        <SparkleIcon size={12} />
        {t('leagues.zone.trophy')}
      </span>
    );
  }
  if (row.zone === 'promotion') {
    return (
      <span className="zone-tag is-up">
        <UpIcon size={12} />
        {t('leagues.zone.up')}
      </span>
    );
  }
  if (row.zone === 'demotion') {
    return (
      <span className="zone-tag is-down">
        <DownIcon size={12} />
        {t('leagues.zone.down')}
      </span>
    );
  }
  return null;
}

/** Last week, as a card of its own: where you finished and what it meant. */
function LastWeek({ result }: { result: LeagueWeekResult }): React.JSX.Element {
  const t = useT();
  const after = result.tierAfter ?? result.tier;
  return (
    <section className="league-last" aria-labelledby="league-last-title">
      {after && <LeagueEmblem tier={after} size={56} title={withMeaning(t, leagueNamed(t, after))} />}
      <div className="league-last-text">
        <h3 id="league-last-title" className="league-last-title">
          {t('leagues.lastWeek')}
        </h3>
        <p className="league-last-outcome">{outcomeLine(t, result)}</p>
        <p className="league-last-meta">
          {result.mode === 'league' && result.rank !== null && result.groupSize !== null
            ? t('leagues.result.place', { rank: result.rank, size: result.groupSize, xp: result.weeklyXp.toLocaleString() })
            : t('leagues.result.xp', { xp: result.weeklyXp.toLocaleString() })}
          {result.goalMet && <span className="league-last-chip">{t('leagues.result.goalMet')}</span>}
          {result.gems > 0 && <span className="league-last-chip">{t('leagues.result.gems', { gems: result.gems })}</span>}
          {result.trophy && <span className="league-last-chip">{t('leagues.result.trophy')}</span>}
        </p>
      </div>
    </section>
  );
}

function outcomeLine(t: Translate, r: LeagueWeekResult): string {
  if (r.mode === 'personal' || !r.tier) return r.goalMet ? t('leagues.result.personalMet') : t('leagues.result.personal');
  const after = r.tierAfter ?? r.tier;
  if (r.outcome === 'promoted') return t('leagues.result.promoted', { tier: leagueName(t, after) });
  // moving down is said as where you are now, never as a loss
  if (r.outcome === 'demoted') return t('leagues.result.demoted', { tier: leagueName(t, after) });
  return t('leagues.result.stayed', { tier: leagueName(t, r.tier) });
}

/**
 * Personal mode: "You vs last week". The same ring, this week against the
 * last few, and the way into the leagues for anyone who wants one — said once,
 * without anything that reads as missing out.
 */
function PersonalWeek({ league, onJoin, joining }: { league: LeagueView; onJoin: () => void; joining: boolean }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const weeks = league.recentWeeks.slice(-6);
  const peak = Math.max(league.goalXp, ...weeks.map((w) => w.xp), 1);
  const last = weeks.length >= 2 ? weeks[weeks.length - 2] : null;
  return (
    <section className="league-page league-personal" aria-labelledby="league-heading">
      <div className="league-head">
        <div className="league-head-text">
          <h2 id="league-heading" className="league-card-title">
            {t('leagues.personal.title')}
          </h2>
          <p className="league-head-meta">
            <span>{t('leagues.weekEnds', { when: weekEnds(league.endsAt, locale) })}</span>
          </p>
          {last && <p className="league-head-meaning">{t('leagues.personal.vsLast', { xp: last.xp.toLocaleString() })}</p>}
        </div>
        <GoalRing xp={league.weeklyXp} goal={league.goalXp} size={92} />
      </div>
      {league.goalMet && (
        <p className="league-status is-safe" role="status">
          <ShieldIcon size={16} />
          <strong>{t('leagues.personal.met')}</strong>
        </p>
      )}
      {weeks.length > 0 && (
        <figure className="league-weeks">
          <figcaption className="league-weeks-title">{t('leagues.personal.history')}</figcaption>
          <ol className="league-weeks-bars">
            {weeks.map((w, i) => (
              <li key={w.weekKey} className={`league-week${w.goalMet ? ' is-met' : ''}${i === weeks.length - 1 ? ' is-now' : ''}`}>
                <span className="league-week-bar" style={{ height: `${Math.max(4, (w.xp / peak) * 100)}%` }} />
                <span className="league-week-xp">{w.xp.toLocaleString()}</span>
                <span className="sr-only">{t('leagues.personal.weekXp', { xp: w.xp.toLocaleString(), week: w.weekKey })}</span>
              </li>
            ))}
          </ol>
        </figure>
      )}
      {league.lastWeek && <LastWeek result={league.lastWeek} />}
      <div className="league-personal-join">
        <p className="muted">{t('leagues.optedOut.body')}</p>
        <Button variant="secondary" size="sm" disabled={joining} onClick={onJoin}>
          {t('leagues.optedOut.join')}
        </Button>
      </div>
    </section>
  );
}

