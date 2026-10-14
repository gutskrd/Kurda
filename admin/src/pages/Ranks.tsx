import { useState } from 'react';
import {
  FEW_PLAYERS,
  RANKED_GAMES,
  RANK_TIERS,
  STERK_RULE,
  divisionOf,
  isRankedGame,
  tierOf,
  type AdminPlayerRanks,
  type RankedGame,
  type SuspiciousPair,
  type TierSpread,
} from '@kurda/shared';
import { api } from '../api';
import { useRoute } from '../nav';
import { href } from '../navigation';
import {
  ActionMenu,
  Badge,
  Drawer,
  EmptyState,
  ErrorState,
  Loading,
  PageHeader,
  Section,
  Table,
  Tabs,
  Time,
  UserLink,
  useLoad,
  type Column,
  type Tone,
} from '../ui';
import { GAME_NAME, percent, rankTierName, rankTierShort, type TopPlayer } from '../progress';
import { PairGamesDrawer, PlayerGamesTable, RankCell, RankEmblem, useResetRating } from './RankParts';

type View = 'spread' | 'top' | 'pairs';

/**
 * Game Ranks for staff (contract 4, §R3, §R4, §U): how the active players
 * spread over the tiers in each game — to tune the one tier table in
 * @kurda/shared — the top of each game, and the pairs whose rated games
 * together look unusual, with the two things an admin can do about a rating:
 * void a game's effect and reset a player.
 *
 * #/ranks (the spread), #/ranks/top/<game>, #/ranks/pairs.
 */
export function Ranks(): React.JSX.Element {
  const route = useRoute();
  const view: View = route.rest[0] === 'top' ? 'top' : route.rest[0] === 'pairs' ? 'pairs' : 'spread';
  const game: RankedGame = isRankedGame(route.rest[1]) ? route.rest[1] : RANKED_GAMES[0];
  return (
    <div>
      <PageHeader
        title="Game ranks"
        subtitle="One rating per online game, shown as points and a tier. Nothing here acts on anyone by itself: the signals are for a person to read."
      />
      <Tabs
        label="Show"
        idBase="ranks"
        value={view}
        items={[
          { key: 'spread', label: 'Tier spread', href: href('ranks') },
          { key: 'top', label: 'Top players', href: href('ranks', 'top', game) },
          { key: 'pairs', label: 'Suspicious pairs', href: href('ranks', 'pairs') },
        ]}
      />
      <div role="tabpanel" id="ranks-panel" aria-labelledby={`ranks-tab-${view}`}>
        {view === 'spread' && <Spread />}
        {view === 'top' && <Top game={game} />}
        {view === 'pairs' && <Pairs />}
      </div>
    </div>
  );
}

// ---- the spread -----------------------------------------------------------------------

function Spread(): React.JSX.Element {
  const loaded = useLoad(() => api<{ games: TierSpread[] }>('/admin/ranks/spread').then((r) => r.games), []);
  if (loaded.error != null && !loaded.data) return <ErrorState error={loaded.error} onRetry={() => void loaded.reload()} what="game ranks" />;
  if (!loaded.data) return <Loading rows={6} label="Counting the players…" />;
  const games = loaded.data;
  return (
    <>
      <div className="spread-grid">
        {games.map((g) => (
          <SpreadChart key={g.game} spread={g} />
        ))}
      </div>
      <Section
        title="The tiers side by side"
        description={`Active players are placed and have played a rated game in the last 28 days. Stêrk needs ${STERK_RULE.minGames} rated games, a game in the last ${STERK_RULE.activeDays} days and a place in the top ${STERK_RULE.topShare * 100}% (at least the top ${STERK_RULE.minTop}), and is only awarded once a game has ${FEW_PLAYERS} active players.`}
        flush
      >
        <Table
          caption="Players per tier in each game"
          columns={spreadColumns(games)}
          rows={[...RANK_TIERS.map((t) => t.key), 'sterk' as const].reverse()}
          rowKey={(t) => t}
          wide="medium"
        />
      </Section>
      <p className="note">The tier table (where each tier starts) is one list in shared/src/ranks.ts; changing it changes every app at once.</p>
    </>
  );
}

function spreadColumns(games: TierSpread[]): ReadonlyArray<Column<TierSpread['tiers'][number]['tier']>> {
  return [
    {
      key: 'tier',
      header: 'Tier',
      card: 'title',
      cell: (t) => (
        <span className="tier-cell">
          <RankEmblem tier={t} size={28} />
          <span>
            {rankTierName(t)}
            <span className="cell-sub">{t === 'sterk' ? 'by standing' : `from ${RANK_TIERS.find((r) => r.key === t)!.floor.toLocaleString()} points`}</span>
          </span>
        </span>
      ),
    },
    ...games.map((g) => ({
      key: g.game,
      header: GAME_NAME[g.game],
      align: 'end' as const,
      cell: (t: TierSpread['tiers'][number]['tier']) => {
        const row = g.tiers.find((x) => x.tier === t);
        return row ? (
          <span>
            <strong>{row.players.toLocaleString()}</strong> <span className="subtle">{percent(row.share)}</span>
          </span>
        ) : (
          '—'
        );
      },
    })),
  ];
}

/**
 * One game's spread as bars: a bar per tier, longest for the fullest tier, with
 * the count and share written beside it — the bar is never the only way to
 * read the number.
 */
function SpreadChart({ spread }: { spread: TierSpread }): React.JSX.Element {
  const max = Math.max(...spread.tiers.map((t) => t.players), 1);
  const few = spread.activePlayers < FEW_PLAYERS;
  return (
    <Section
      title={GAME_NAME[spread.game]}
      description={
        <>
          {spread.activePlayers.toLocaleString()} active {spread.activePlayers === 1 ? 'player' : 'players'} · {spread.placing.toLocaleString()} still placing
        </>
      }
      className="spread-card"
      actions={
        <a className="button-link" href={href('ranks', 'top', spread.game)}>
          Top players
        </a>
      }
    >
      {few && (
        <p className="note">
          Under {FEW_PLAYERS} active players: the apps hide percentiles and the top list for this game, and nobody is Stêrk yet.
        </p>
      )}
      <ul className="spread-bars" aria-label={`${GAME_NAME[spread.game]}: players per tier`}>
        {[...spread.tiers].reverse().map((t) => (
          <li key={t.tier} className="spread-row">
            <RankEmblem tier={t.tier} size={32} />
            <span className="spread-name">{rankTierShort(t.tier)}</span>
            <span className="spread-track" aria-hidden="true">
              <span className={`spread-fill tier-${t.tier}${t.players > 0 ? " is-some" : ""}`} style={{ width: `${(t.players / max) * 100}%` }} />
            </span>
            <span className="spread-n">
              <strong>{t.players.toLocaleString()}</strong> <span className="subtle">{percent(t.share)}</span>
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ---- the top ---------------------------------------------------------------------------

function Top({ game }: { game: RankedGame }): React.JSX.Element {
  const loaded = useLoad(() => api<{ players: TopPlayer[] }>(`/admin/ranks/top/${encodeURIComponent(game)}`).then((r) => r.players), [game]);
  const reset = useResetRating();
  const [open, setOpen] = useState<TopPlayer | null>(null);
  const columns: ReadonlyArray<Column<TopPlayer & { place: number }>> = [
    {
      key: 'who',
      header: 'Player',
      card: 'title',
      cell: (p) => (
        <span>
          <span className="mono subtle top-place">{p.place}.</span> <UserLink user={{ id: p.userId, username: p.username }} />
        </span>
      ),
    },
    { key: 'rank', header: 'Rank', cell: (p) => <RankCell tier={tierOf(p.points)} division={divisionOf(p.points)} points={p.points} /> },
    { key: 'games', header: 'Rated games', align: 'end', sort: (a, b) => a.ratedGames - b.ratedGames, cell: (p) => p.ratedGames.toLocaleString() },
    {
      key: 'wins',
      header: 'Wins',
      align: 'end',
      cell: (p) => (
        <span>
          {p.wins.toLocaleString()} <span className="subtle">{p.ratedGames ? percent(p.wins / p.ratedGames) : ''}</span>
        </span>
      ),
    },
    { key: 'last', header: 'Last rated game', cell: (p) => (p.lastRatedAt ? <Time value={p.lastRatedAt} /> : '—') },
  ];
  return (
    <Section
      title={`Top of ${GAME_NAME[game]}`}
      description="Everyone placed, by points, minors included and by name: the apps' own top list shows known adults only."
      flush
      actions={
        <Tabs
          label="Game"
          value={game}
          items={RANKED_GAMES.map((g) => ({ key: g, label: GAME_NAME[g], href: href('ranks', 'top', g) }))}
          className="is-compact"
        />
      }
    >
      <Table
        caption={`Top players of ${GAME_NAME[game]}`}
        columns={columns}
        rows={loaded.data?.map((p, i) => ({ ...p, place: i + 1 })) ?? null}
        rowKey={(p) => p.userId}
        loading={loaded.loading}
        error={loaded.error}
        onRetry={() => void loaded.reload()}
        what="game ranks"
        empty="Nobody has finished placement in this game yet."
        wide="medium"
        actions={(p) => (
          <ActionMenu
            label={`More for @${p.username}`}
            items={[
              { label: 'Rated games…', onSelect: () => setOpen(p) },
              {
                label: 'Reset rating…',
                tone: 'danger',
                onSelect: () => void reset({ id: p.userId, username: p.username }, game).then((done) => done && void loaded.reload()),
              },
            ]}
          />
        )}
      />
      {open && <PlayerGamesDrawer player={open} onClose={() => setOpen(null)} onChanged={() => void loaded.reload()} />}
    </Section>
  );
}

function PlayerGamesDrawer({ player, onClose, onChanged }: { player: TopPlayer; onClose: () => void; onChanged: () => void }): React.JSX.Element {
  const loaded = useLoad(() => api<AdminPlayerRanks>(`/admin/ranks/players/${encodeURIComponent(player.userId)}`), [player.userId]);
  return (
    <Drawer open onClose={onClose} title={`@${player.username}’s rated games`} className="drawer-wide">
      <p className="section-text">
        The latest 30, every game. <UserLink user={{ id: player.userId, username: player.username }} /> has a Ranks tab with the same and their rank in each game.
      </p>
      {loaded.error != null && !loaded.data ? (
        <ErrorState error={loaded.error} onRetry={() => void loaded.reload()} what="game ranks" compact />
      ) : !loaded.data ? (
        <Loading rows={3} />
      ) : (
        <PlayerGamesTable
          games={loaded.data.games}
          onVoided={() => {
            void loaded.reload();
            onChanged();
          }}
        />
      )}
    </Drawer>
  );
}

// ---- the pairs --------------------------------------------------------------------------

/** The score adds the signals up (a shared device 3, many games in a day 2, lopsided results 2, a shared network 1). */
function scoreTone(score: number): Tone {
  return score >= 5 ? 'bad' : score >= 3 ? 'warn' : 'neutral';
}

function Pairs(): React.JSX.Element {
  const loaded = useLoad(() => api<{ pairs: SuspiciousPair[] }>('/admin/ranks/suspicious-pairs').then((r) => r.pairs), []);
  const [open, setOpen] = useState<SuspiciousPair | null>(null);
  const columns: ReadonlyArray<Column<SuspiciousPair>> = [
    {
      key: 'pair',
      header: 'Pair',
      card: 'title',
      cell: (p) => (
        <span>
          <span className="pair-cell">
            <UserLink user={{ id: p.a.userId, username: p.a.username }} />
            <span className="subtle">and</span>
            <UserLink user={{ id: p.b.userId, username: p.b.username }} />
          </span>
          <span className="cell-sub">{GAME_NAME[p.game]}</span>
        </span>
      ),
    },
    { key: 'games', header: 'Games', align: 'end', sort: (a, b) => a.games - b.games, cell: (p) => p.games.toLocaleString() },
    {
      key: 'split',
      header: 'Win split',
      cell: (p) => (
        <span title={`@${p.a.username} won ${p.aWins}, @${p.b.username} won ${p.bWins}, ${p.draws} drawn`}>
          {p.aWins}–{p.bWins}
          {p.draws ? <span className="subtle"> · {p.draws} drawn</span> : null}
        </span>
      ),
    },
    { key: 'peak', header: 'Busiest 24 h', align: 'end', sort: (a, b) => a.peak24h - b.peak24h, cell: (p) => `${p.peak24h} ${p.peak24h === 1 ? 'game' : 'games'}` },
    {
      key: 'shared',
      header: 'Shared',
      cell: (p) =>
        p.sharedDevice || p.sharedIp ? (
          <span className="badges">
            {p.sharedDevice && <Badge tone="bad">Same device</Badge>}
            {p.sharedIp && <Badge tone="warn">Same network</Badge>}
          </span>
        ) : (
          <span className="subtle">Nothing</span>
        ),
    },
    { key: 'score', header: 'Score', align: 'end', sort: (a, b) => a.score - b.score, cell: (p) => <Badge tone={scoreTone(p.score)}>{p.score}</Badge> },
    { key: 'last', header: 'Last game', cell: (p) => <Time value={p.lastGameAt} /> },
  ];
  return (
    <Section
      title="Pairs worth a look"
      description="Signals, not verdicts: a shared device (3), many rated games in one day (2), one side winning nearly every game of six or more (2), a shared network (1) — a school or a family shares a network. Open a pair to see their games and void one."
      flush
    >
      <Table
        caption="Suspicious rating pairs"
        columns={columns}
        rows={loaded.data ?? null}
        rowKey={(p) => `${p.game}:${p.a.userId}:${p.b.userId}`}
        loading={loaded.loading}
        error={loaded.error}
        onRetry={() => void loaded.reload()}
        what="game ranks"
        empty={
          <EmptyState title="No pair stands out" icon="shield" compact>
            Pairs show here once their rated games together raise a signal.
          </EmptyState>
        }
        wide="medium"
        actions={(p) => (
          <button type="button" onClick={() => setOpen(p)} aria-label={`Games of @${p.a.username} and @${p.b.username}`}>
            Games…
          </button>
        )}
      />
      {open && <PairGamesDrawer pair={open} onClose={() => setOpen(null)} />}
    </Section>
  );
}
