import { useState } from 'react';
import {
  LEAGUE_GROUP_MIN,
  LEAGUE_TIERS,
  nextWeek,
  previousWeek,
  weekMergeAt,
  weekStart,
  type LeagueTier,
} from '@kurda/shared';
import { api } from '../api';
import { useRoute } from '../nav';
import { href } from '../navigation';
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  EmptyState,
  ErrorState,
  Icon,
  Loading,
  PageHeader,
  Section,
  Select,
  Table,
  UserLink,
  errorLine,
  useLoad,
  useToast,
  type Column,
  type Tone,
} from '../ui';
import { leagueTierName, runResult, utcOffset, weekLabel, xpBandText, type LeagueGroupDetail, type LeagueGroupRow, type LeagueOverview, type LeagueRunStatus } from '../progress';
import { LeagueEmblem, RunLine } from './RankParts';

const WEEK = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Learning Leagues for staff (contract 4, §L): a week's groups and the runs
 * that shape it — the Monday settle that closes the week before (promotions,
 * the Pêla trophy, personal weeks, the season's drop) and the Wednesday merge
 * of groups still under eight — with a way to run either again. Both run by
 * themselves; running one now is for a week whose run failed or never came.
 *
 * #/leagues (this week), #/leagues?week=2026-10-05, #/leagues/group/<id>.
 */
export function Leagues(): React.JSX.Element {
  const route = useRoute();
  if (route.rest[0] === 'group' && route.rest[1]) return <GroupPage id={route.rest[1]} />;
  const asked = route.query.get('week');
  const thisWeek = weekStart(new Date());
  // any day of a week names that week; the API wants its Monday
  const week = asked && WEEK.test(asked) ? weekStart(new Date(`${asked}T12:00:00Z`)) : thisWeek;
  return <WeekPage week={week} thisWeek={thisWeek} />;
}

function weekHref(week: string, thisWeek: string): string {
  return week === thisWeek ? href('leagues') : `${href('leagues')}?week=${week}`;
}

function WeekPage({ week, thisWeek }: { week: string; thisWeek: string }): React.JSX.Element {
  const loaded = useLoad(() => api<LeagueOverview>(`/admin/leagues?week=${week}`), [week]);
  const [tier, setTier] = useState<'' | LeagueTier>('');
  const [running, setRunning] = useState<'settle' | 'merge' | null>(null);
  const o = loaded.data;
  const groups = o ? o.groups.filter((g) => !tier || g.tier === tier) : null;
  const live = o ? o.groups.filter((g) => !g.mergedInto) : [];

  return (
    <div>
      <PageHeader
        title="Leagues"
        subtitle="Weekly groups of up to 20 learners in the same league, racing on learning XP. Promotion needs the weekly goal met; a missed goal is the only way down."
        actions={
          <>
            <Button onClick={() => setRunning('settle')}>Run the settle…</Button>
            <Button onClick={() => setRunning('merge')}>Run the merge…</Button>
          </>
        }
      />

      <nav className="week-nav" aria-label="Week">
        <a className="button-link" href={weekHref(previousWeek(week), thisWeek)} aria-label="The week before">
          <Icon name="arrowLeft" size={16} />
          <span className="week-nav-word">Before</span>
        </a>
        <div className="week-nav-at">
          <strong>{weekLabel(week)}</strong>
          <span className="subtle">{week === thisWeek ? 'This week' : week < thisWeek ? 'A past week' : 'Not started'}</span>
        </div>
        {week < thisWeek ? (
          <a className="button-link" href={weekHref(nextWeek(week), thisWeek)} aria-label="The week after">
            <span className="week-nav-word">After</span>
            <Icon name="arrowRight" size={16} />
          </a>
        ) : (
          <span className="week-nav-spacer" />
        )}
      </nav>

      {loaded.error != null && !o ? (
        <ErrorState error={loaded.error} onRetry={() => void loaded.reload()} what="leagues" />
      ) : !o ? (
        <Loading rows={6} />
      ) : (
        <>
          <Section title="The week’s runs" description={`Weekly goal: ${o.goalXp.toLocaleString()} XP. Times are in your time zone; the week runs Monday to Monday, 00:00 UTC.`}>
            <div className="run-grid">
              <RunLine title="Monday settle (opened this week)" run={o.settle} />
              <RunLine title={`Wednesday merge (${weekMergeAt(week).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })})`} run={o.merge} />
              <RunLine title="Settle that closes this week" run={o.closedBy} />
            </div>
          </Section>

          <Section title="Learners per league" description="Where every learner who has joined a league stands now, whatever the week shown.">
            <ul className="league-tiers">
              {[...LEAGUE_TIERS].reverse().map((t) => (
                <li key={t}>
                  <LeagueEmblem tier={t} size={40} />
                  <span>
                    <span className="league-tier-name">{leagueTierName(t)}</span>
                    <strong>{(o.tiers[t] ?? 0).toLocaleString()}</strong>
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          <Section
            title="Groups"
            description={`${live.length.toLocaleString()} ${live.length === 1 ? 'group' : 'groups'} this week${o.groups.length > live.length ? `, and ${o.groups.length - live.length} merged into others` : ''}.`}
            flush
            actions={
              <Select
                label="League"
                value={tier}
                onChange={(e) => setTier(e.target.value as '' | LeagueTier)}
                options={[{ value: '', label: 'Every league' }, ...LEAGUE_TIERS.map((t) => ({ value: t, label: leagueTierName(t) }))]}
              />
            }
          >
            <Table
              caption="League groups"
              columns={GROUP_COLUMNS}
              rows={groups}
              rowKey={(g) => g.id}
              loading={loaded.loading}
              error={loaded.error}
              onRetry={() => void loaded.reload()}
              what="leagues"
              empty={
                <EmptyState title={tier ? 'No group in this league this week' : 'No groups this week'} icon="waves" compact>
                  A learner joins a week’s league when they earn learning XP in it.
                </EmptyState>
              }
              wide="medium"
              actions={(g) => (
                <a className="button-link" href={href('leagues', 'group', g.id)} aria-label={`Open the ${leagueTierName(g.tier)} group`}>
                  Open
                </a>
              )}
            />
          </Section>
        </>
      )}
      {running && <RunDialog kind={running} onClose={() => setRunning(null)} onDone={() => void loaded.reload()} />}
    </div>
  );
}

function groupState(g: LeagueGroupRow): { label: string; tone: Tone } {
  if (g.mergedInto) return { label: 'Merged', tone: 'neutral' };
  if (g.settled) return { label: 'Settled', tone: 'ok' };
  if (g.active < LEAGUE_GROUP_MIN) return { label: `Under ${LEAGUE_GROUP_MIN}`, tone: 'warn' };
  return { label: 'Racing', tone: 'info' };
}

const GROUP_COLUMNS: ReadonlyArray<Column<LeagueGroupRow>> = [
  {
    key: 'tier',
    header: 'League',
    card: 'title',
    cell: (g) => (
      <span className="tier-cell">
        <LeagueEmblem tier={g.tier} size={28} />
        {leagueTierName(g.tier)}
      </span>
    ),
  },
  {
    key: 'members',
    header: 'Learners',
    align: 'end',
    sort: (a, b) => a.active - b.active,
    cell: (g) => (
      <span title={`${g.active} still in it, of ${g.members} who joined`}>
        {g.active.toLocaleString()}
        {g.members !== g.active && <span className="subtle"> of {g.members}</span>}
      </span>
    ),
  },
  { key: 'band', header: 'XP, last 4 weeks', cell: (g) => xpBandText(g.xpBand) },
  { key: 'clock', header: 'Clock', cell: (g) => utcOffset(g.tzOffsetMin) },
  {
    key: 'state',
    header: 'State',
    cell: (g) => {
      const s = groupState(g);
      return (
        <span className="badges">
          <Badge tone={s.tone}>{s.label}</Badge>
          {g.mergedInto && (
            <a href={href('leagues', 'group', g.mergedInto)} className="subtle">
              into its group
            </a>
          )}
        </span>
      );
    },
  },
];

/**
 * Run the settle or the merge now, for the current week. Without "force" a
 * run that has finished this week does nothing; with it every step runs
 * again — each is idempotent, so nobody is moved or paid twice — which is
 * what finishes a run that failed or stopped half way.
 */
function RunDialog({ kind, onClose, onDone }: { kind: 'settle' | 'merge'; onClose: () => void; onDone: () => void }): React.JSX.Element {
  const toast = useToast();
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const settle = kind === 'settle';
  async function run(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const r = await api<LeagueRunStatus>(`/admin/leagues/${kind}`, { method: 'POST', body: force ? { force: true } : {} });
      toast.success(r.lastError ? `It failed: ${r.lastError}` : r.finishedAt ? `${runResult(r)}.` : 'Started; it is still running.');
      onDone();
      onClose();
    } catch (err) {
      setError(errorLine(err, 'leagues'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={settle ? 'Run the weekly settle now?' : 'Run Wednesday’s merge now?'}
      dismissable={!busy}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <Button variant="primary" onClick={() => void run()} busy={busy}>
            {busy ? 'Running…' : settle ? 'Run the settle' : 'Run the merge'}
          </Button>
        </>
      }
    >
      <div className="dialog-text">
        {settle ? (
          <p>
            It settles every group of the weeks that have ended — promotions and their Gems, the Pêla trophy, the season’s drop — and records the personal weeks.
            It runs for this week, whatever week the page shows.
          </p>
        ) : (
          <p>
            Groups of this week still under {LEAGUE_GROUP_MIN} learners join the nearest open group: the same league first, then a neighbouring one, never past
            twenty. It can only run from Wednesday 00:00 UTC.
          </p>
        )}
        <p>Done once this week already, it does nothing more — unless you force it.</p>
      </div>
      <Checkbox
        label="Force it to run again"
        hint="Every step is safe to repeat: nobody moves or is paid twice. For a run that failed or stopped half way."
        checked={force}
        onChange={setForce}
      />
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}

// ---- one group --------------------------------------------------------------------------

type Standing = LeagueGroupDetail['standings'][number];

const ZONE: Readonly<Record<Standing['zone'], { label: string; icon: 'arrowRight' | 'chevronUp' | 'chevronDown'; tone: Tone }>> = {
  promotion: { label: 'Promotion zone', icon: 'chevronUp', tone: 'ok' },
  demotion: { label: 'Demotion zone', icon: 'chevronDown', tone: 'warn' },
  stay: { label: 'Staying', icon: 'arrowRight', tone: 'neutral' },
};

const OUTCOME: Readonly<Record<Standing['outcome'], string>> = { promoted: 'Moves up to', demoted: 'Moves down to', stayed: 'Stays in' };

function GroupPage({ id }: { id: string }): React.JSX.Element {
  const loaded = useLoad(() => api<LeagueGroupDetail>(`/admin/leagues/groups/${encodeURIComponent(id)}`), [id]);
  const g = loaded.data;
  const thisWeek = weekStart(new Date());
  const back = { href: g ? weekHref(g.weekKey, thisWeek) : href('leagues'), label: 'Leagues' };
  const mixed = g ? new Set(g.standings.map((s) => s.tier)).size > 1 : false;
  const columns: ReadonlyArray<Column<Standing>> = [
    {
      key: 'who',
      header: 'Learner',
      card: 'title',
      cell: (s) => (
        <span>
          <span className="mono subtle top-place">{s.rank}.</span> <UserLink user={{ id: s.userId, username: s.username }} />
        </span>
      ),
    },
    ...(mixed
      ? [{ key: 'tier', header: 'Racing in', cell: (s: Standing) => `${leagueTierName(s.tier)} · ${s.tierRank}.` }]
      : []),
    { key: 'xp', header: 'Weekly XP', align: 'end', cell: (s) => s.weeklyXp.toLocaleString() },
    { key: 'goal', header: 'Goal', cell: (s) => (s.goalMet ? <Badge tone="ok">Met</Badge> : <span className="subtle">Not yet</span>) },
    {
      key: 'zone',
      header: 'Zone',
      cell: (s) => (
        <span className={`zone zone-${s.zone}`}>
          <Icon name={ZONE[s.zone].icon} size={16} />
          {ZONE[s.zone].label}
          {s.trophy && <Badge tone="info">Pêla</Badge>}
        </span>
      ),
    },
    { key: 'after', header: g?.settled ? 'Result' : 'If it ended now', cell: (s) => `${OUTCOME[s.outcome]} ${leagueTierName(s.tierAfter)}` },
  ];
  if (loaded.error != null && !g) {
    return (
      <div>
        <PageHeader back={back} title="League group" />
        <ErrorState error={loaded.error} onRetry={() => void loaded.reload()} what="leagues" />
      </div>
    );
  }
  if (!g) {
    return (
      <div>
        <PageHeader back={back} title="League group" />
        <Loading rows={6} />
      </div>
    );
  }
  return (
    <div>
      <PageHeader
        back={back}
        title={
          <span className="title-with-art">
            <LeagueEmblem tier={g.tier} size={36} />
            {leagueTierName(g.tier)} group
          </span>
        }
        subtitle={`Week of ${weekLabel(g.weekKey)} · ${g.standings.length} ${g.standings.length === 1 ? 'learner' : 'learners'}`}
        meta={<Badge tone={g.settled ? 'ok' : 'info'}>{g.settled ? 'Settled' : 'Racing'}</Badge>}
      />
      <Section
        flush
        title="The table"
        description={`The whole group is one table by weekly XP; ${mixed ? 'each league in it is scored on its own. ' : ''}promotion needs the weekly goal met, and only a missed goal moves anyone down.`}
      >
        <Table
          caption="The group's table"
          columns={columns}
          rows={g.standings}
          rowKey={(s) => s.userId}
          rowClassName={(s) => `zone-row zone-row-${s.zone}`}
          empty="Nobody is left in this group."
          wide="medium"
        />
      </Section>
    </div>
  );
}
