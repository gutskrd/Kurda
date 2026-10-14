import { useState } from 'react';
import {
  RANK_TIER_KEYS,
  SEASON_REWARD_GEMS,
  SEASON_REWARD_MIN_GAMES,
  isSeasonId,
  seasonById,
  seasonDaysLeft,
  seasonFrameSku,
  type AdminSeasonReward,
  type AdminSeasonRewards,
} from '@kurda/shared';
import { api } from '../api';
import { useRoute } from '../nav';
import { href } from '../navigation';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Loading,
  PageHeader,
  Section,
  Stat,
  Table,
  Tabs,
  Time,
  UserLink,
  absoluteTime,
  errorLine,
  useDialogs,
  useLoad,
  useToast,
  type Column,
  type Tone,
} from '../ui';
import { GAME_NAME, rankTierName, seasonName, type SeasonList } from '../progress';
import { RankEmblem, SeasonFrame } from './RankParts';

/**
 * Seasons for staff (contract 4, §R5): the season now and what it would hand
 * out if it closed today, the seasons before it and what each handed out, and
 * closing the ones that have ended — which the server does by itself every
 * six hours, so the button is for a close that has not happened yet.
 *
 * #/seasons, #/seasons/<id> (e.g. 2026-Q3).
 */
export function Seasons(): React.JSX.Element {
  const route = useRoute();
  const id = route.rest[0];
  const list = useLoad(() => api<SeasonList>('/admin/seasons'), []);
  if (id) return <SeasonPage id={id} list={list.data} />;
  return <SeasonsOverview list={list.data} error={list.error} reload={() => void list.reload()} />;
}

function EndSeasons({ onDone }: { onDone: () => void }): React.JSX.Element {
  const dialogs = useDialogs();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function end(): Promise<void> {
    const yes = await dialogs.confirm({
      title: 'End the seasons that are due?',
      body: (
        <div className="dialog-text">
          <p>
            Every season that has already ended is closed now: each rating rolls into the new season, the season’s Stêrk players are marked, and the rewards
            are handed out — the frame, the title and the Gems.
          </p>
          <p>A season still running is not touched. It is safe to run twice: nobody is rewarded twice. The server also does it by itself every six hours.</p>
        </div>
      ),
      confirmLabel: 'End them now',
    });
    if (!yes) return;
    setBusy(true);
    try {
      const r = await api<{ processed: number }>('/admin/seasons/end', { method: 'POST' });
      toast.success(r.processed === 0 ? 'No season was due: nothing changed.' : `Closed ${r.processed} ${r.processed === 1 ? 'season' : 'seasons'}.`);
      onDone();
    } catch (err) {
      toast.error(errorLine(err, 'seasons'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button onClick={() => void end()} busy={busy} icon="check">
      {busy ? 'Ending…' : 'End seasons that are due…'}
    </Button>
  );
}

function SeasonsOverview({ list, error, reload }: { list: SeasonList | undefined; error: unknown; reload: () => void }): React.JSX.Element {
  return (
    <div>
      <PageHeader
        title="Seasons"
        subtitle="Quarterly, on the calendar quarters (UTC). At the close each player keeps the emblem of their peak tier, and those with enough rated games are rewarded."
        actions={<EndSeasons onDone={reload} />}
      />
      {error != null && !list ? <ErrorState error={error} onRetry={reload} what="seasons" /> : !list ? <Loading rows={4} /> : <Current id={list.current} />}
      <RewardTable />
      <Section title="Seasons before" description="Each closed season and what it handed out. Open one to see who was rewarded." flush>
        <Table
          caption="Closed seasons"
          columns={PAST_COLUMNS}
          rows={list?.seasons.filter((s) => s.id !== list.current) ?? null}
          rowKey={(s) => s.id}
          error={list ? undefined : error}
          onRetry={reload}
          what="seasons"
          empty="No season has closed yet."
          actions={(s) => (
            <a className="button-link" href={href('seasons', s.id)}>
              Open
            </a>
          )}
        />
      </Section>
    </div>
  );
}

type PastSeason = SeasonList['seasons'][number];

function seasonState(s: PastSeason): { label: string; tone: Tone } {
  if (s.rewardedAt) return { label: 'Rewarded', tone: 'ok' };
  if (s.closedAt) return { label: 'Closed, rewards still to hand out', tone: 'warn' };
  return { label: 'Closing', tone: 'info' };
}

const PAST_COLUMNS: ReadonlyArray<Column<PastSeason>> = [
  { key: 'season', header: 'Season', card: 'title', cell: (s) => <a href={href('seasons', s.id)}>{seasonName(s.id)}</a> },
  {
    key: 'state',
    header: 'State',
    cell: (s) => {
      const st = seasonState(s);
      return <Badge tone={st.tone}>{st.label}</Badge>;
    },
  },
  { key: 'rewards', header: 'Players rewarded', align: 'end', cell: (s) => s.rewards.toLocaleString() },
  { key: 'gems', header: 'Gems paid', align: 'end', cell: (s) => s.gems.toLocaleString() },
  { key: 'closed', header: 'Closed', cell: (s) => (s.closedAt ? <Time value={s.closedAt} mode="date" /> : '—') },
];

function Current({ id }: { id: string }): React.JSX.Element {
  const preview = useLoad(() => api<AdminSeasonRewards>(`/admin/seasons/${encodeURIComponent(id)}/rewards`), [id]);
  const season = isSeasonId(id) ? seasonById(id) : null;
  const rewards = preview.data?.rewards;
  const gems = rewards?.reduce((sum, r) => sum + r.gems, 0) ?? 0;
  return (
    <Section
      title={`Now: ${seasonName(id)}`}
      description={
        season ? (
          <>
            {absoluteDay(season.startsAt)} to {absoluteDay(new Date(new Date(season.endsAt).getTime() - 1).toISOString())} ·{' '}
            {seasonDaysLeft(season, new Date())} days left
          </>
        ) : undefined
      }
      actions={
        <a className="button-link" href={href('seasons', id)}>
          Who would be rewarded
        </a>
      }
    >
      <div className="stats is-flat">
        <Stat
          label="Rewarded if it closed now"
          value={preview.error ? '—' : rewards ? rewards.length.toLocaleString() : '…'}
          hint={`Players with ${SEASON_REWARD_MIN_GAMES}+ rated games in a game`}
        />
        <Stat label="Gems it would pay" value={preview.error ? '—' : rewards ? gems.toLocaleString() : '…'} hint="One payout per player, by their best tier" />
      </div>
      {preview.error != null && <ErrorState error={preview.error} onRetry={() => void preview.reload()} what="seasons" compact />}
    </Section>
  );
}

function absoluteDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** What each tier earns at a season's close (the one table in @kurda/shared). */
function RewardTable(): React.JSX.Element {
  const rows = [...RANK_TIER_KEYS].reverse();
  const columns: ReadonlyArray<Column<(typeof rows)[number]>> = [
    {
      key: 'tier',
      header: 'Best peak tier',
      card: 'title',
      cell: (t) => (
        <span className="tier-cell">
          <RankEmblem tier={t} size={28} />
          {rankTierName(t)}
        </span>
      ),
    },
    {
      key: 'frame',
      header: 'Profile frame',
      cell: (t) => (
        <span className="tier-cell">
          <SeasonFrame tier={t} size={32} />
          <span>
            <span className="mono">{seasonFrameSku(t)}</span>
            {(t === 'lutke' || t === 'sterk') && <span className="cell-sub">with a moving shine</span>}
          </span>
        </span>
      ),
    },
    { key: 'title', header: 'Title', cell: (t) => (t === 'sterk' ? '“Stêrkê <season>”' : <span className="subtle">None</span>) },
    { key: 'gems', header: 'Gems', align: 'end', cell: (t) => SEASON_REWARD_GEMS[t].toLocaleString() },
  ];
  return (
    <Section
      title="What a season hands out"
      description={`To players with ${SEASON_REWARD_MIN_GAMES} or more rated games that season in a game, by their best peak tier across games, once per player — never to a closed or banned account. The season emblem of each game's peak tier is kept by everyone who placed.`}
      flush
    >
      <Table caption="Season rewards by tier" columns={columns} rows={rows} rowKey={(t) => t} />
    </Section>
  );
}

// ---- one season ---------------------------------------------------------------------

type Given = AdminSeasonRewards['given'][number];

function rewardColumns(withWhen: boolean): ReadonlyArray<Column<AdminSeasonReward & { grantedAt?: string }>> {
  return [
    { key: 'who', header: 'Player', card: 'title', cell: (r) => <UserLink user={{ id: r.userId, username: r.username }} /> },
    {
      key: 'tier',
      header: 'Best tier',
      cell: (r) => (
        <span className="tier-cell">
          <RankEmblem tier={r.tier} size={24} />
          {rankTierName(r.tier)}
        </span>
      ),
    },
    { key: 'game', header: 'In', cell: (r) => GAME_NAME[r.game] },
    { key: 'gems', header: 'Gems', align: 'end', cell: (r) => r.gems.toLocaleString() },
    { key: 'frame', header: 'Frame', cell: (r) => (r.frameSku ? <span className="mono">{r.frameSku}</span> : '—') },
    { key: 'title', header: 'Title', cell: (r) => r.title ?? <span className="subtle">None</span> },
    ...(withWhen ? [{ key: 'when', header: 'Handed out', cell: (r: AdminSeasonReward & { grantedAt?: string }) => (r.grantedAt ? <Time value={r.grantedAt} /> : '—') }] : []),
  ];
}

function SeasonPage({ id, list }: { id: string; list: SeasonList | undefined }): React.JSX.Element {
  const route = useRoute();
  const loaded = useLoad(() => api<AdminSeasonRewards>(`/admin/seasons/${encodeURIComponent(id)}/rewards`), [id]);
  const back = { href: href('seasons'), label: 'Seasons' };
  const isCurrent = list?.current === id;
  const past = list?.seasons.find((s) => s.id === id);
  const tab: 'preview' | 'given' = route.query.get('show') === 'given' ? 'given' : (loaded.data && loaded.data.rewards.length === 0 && loaded.data.given.length > 0) ? 'given' : 'preview';

  if (!isSeasonId(id)) {
    return (
      <div>
        <PageHeader back={back} title="Season" />
        <EmptyState title="There is no season by that name" icon="search" action={<a href={href('seasons')}>Go to the seasons</a>}>
          Seasons are named like 2026-Q4.
        </EmptyState>
      </div>
    );
  }
  const state = isCurrent ? { label: 'Running now', tone: 'info' as Tone } : past ? seasonState(past) : { label: 'Not closed yet', tone: 'neutral' as Tone };
  const data = loaded.data;
  return (
    <div>
      <PageHeader
        back={back}
        title={seasonName(id)}
        subtitle={`${absoluteDay(seasonById(id).startsAt)} to ${absoluteDay(new Date(new Date(seasonById(id).endsAt).getTime() - 1).toISOString())} (UTC)`}
        meta={<Badge tone={state.tone}>{state.label}</Badge>}
      />
      {past?.closedAt && (
        <p className="note">
          Closed {absoluteTime(new Date(past.closedAt))}
          {past.rewardedAt ? `; rewards handed out ${absoluteTime(new Date(past.rewardedAt))}.` : '; its rewards are still to be handed out — “End seasons that are due” finishes it.'}
        </p>
      )}
      <Tabs
        label="Show"
        idBase="season"
        value={tab}
        items={[
          { key: 'preview', label: isCurrent ? 'If it closed now' : 'Still to hand out', count: data?.rewards.length, href: `${href('seasons', id)}?show=preview` },
          { key: 'given', label: 'Handed out', count: data?.given.length, href: `${href('seasons', id)}?show=given` },
        ]}
      />
      <div role="tabpanel" id="season-panel" aria-labelledby={`season-tab-${tab}`}>
        <Section
          flush
          title={tab === 'given' ? 'Handed out' : isCurrent ? 'If it closed now' : 'Still to hand out'}
          description={
            tab === 'given'
              ? 'One reward per player: the frame and the Gems of their best peak tier across games, and the title for a Stêrk.'
              : isCurrent
                ? 'Who would be rewarded if the season closed now, by their best tier so far. Stêrk is judged only at the close, so nobody shows as Stêrk here yet.'
                : 'Who the close will reward and has not yet.'
          }
        >
          <Table<AdminSeasonReward & { grantedAt?: string }>
            caption={tab === 'given' ? 'Rewards handed out' : 'Rewards to hand out'}
            columns={rewardColumns(tab === 'given')}
            rows={data ? (tab === 'given' ? (data.given as Given[]) : data.rewards) : null}
            rowKey={(r) => r.userId}
            loading={loaded.loading}
            error={loaded.error}
            onRetry={() => void loaded.reload()}
            what="seasons"
            empty={tab === 'given' ? 'Nothing handed out for this season.' : 'Nobody is due a reward.'}
            wide="medium"
          />
        </Section>
      </div>
    </div>
  );
}
