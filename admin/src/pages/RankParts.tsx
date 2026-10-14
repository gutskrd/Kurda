/**
 * Parts the Ranks, Seasons, Leagues and Badges pages share, and the person
 * page's Ranks tab: the art (drawn by @kurda/shared, the same strings the web
 * and the phone draw), where a weekly run stands, and the two actions that
 * change a rating — voiding a game's effect and resetting a player — asked
 * the same way wherever they are offered.
 */
import { useId } from 'react';
import {
  badgeSvg,
  hasBadgeArt,
  leagueEmblemSvg,
  placementEmblemSvg,
  rankEmblemSvg,
  seasonFrameSvg,
  type AdminPairGame,
  type AdminPlayerGame,
  type ArtBadgeKey,
  type ArtBadgeTier,
  type Division,
  type LeagueTier,
  type RankTier,
  type RankedGame,
} from '@kurda/shared';
import { api } from '../api';
import {
  Badge,
  Button,
  Drawer,
  EmptyState,
  ErrorState,
  Loading,
  Table,
  Time,
  UserLink,
  absoluteTime,
  errorLine,
  useDialogs,
  useLoad,
  useToast,
  type Column,
} from '../ui';
import {
  GAME_NAME,
  REASON_MAX,
  leagueTierName,
  rankLine,
  reasonProblem,
  reasonText,
  runState,
  signed,
  type LeagueRunStatus,
} from '../progress';

// ---- the art ----------------------------------------------------------------------

/** A plain identifier for the art's gradient ids, unique on the page (React's ids carry colons). */
function useArtId(): string {
  return `a${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
}

/**
 * One drawing, inline. The SVG comes from our own deterministic builders, not
 * from anything a person typed, so it is safe to set as markup. With a label
 * it is an image of that name; without one it is decoration beside text that
 * already says it.
 */
function Art({ svg, label, className }: { svg: string; label?: string; className?: string }): React.JSX.Element {
  return (
    <span
      className={`art${className ? ` ${className}` : ''}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/** A rank emblem: the tier's crest (with its division when given), or the placement emblem while placing. */
export function RankEmblem({
  tier,
  division,
  placing,
  size = 40,
  label,
}: {
  tier: RankTier | null;
  division?: Division | null;
  /** placement games played, when there is no tier yet */
  placing?: number;
  size?: number;
  label?: string;
}): React.JSX.Element {
  const id = useArtId();
  const svg =
    tier === null
      ? placementEmblemSvg({ done: Math.min(Math.max(placing ?? 0, 0), 5), size, idPrefix: id })
      : rankEmblemSvg({ tier, division: tier === 'sterk' ? undefined : (division ?? undefined), size, idPrefix: id });
  return <Art svg={svg} label={label} className="art-emblem" />;
}

export function LeagueEmblem({ tier, size = 36, label }: { tier: LeagueTier; size?: number; label?: string }): React.JSX.Element {
  const id = useArtId();
  return <Art svg={leagueEmblemSvg({ tier, size, idPrefix: id, title: leagueTierName(tier) })} label={label} className="art-emblem" />;
}

export function SeasonFrame({ tier, size = 40 }: { tier: RankTier; size?: number }): React.JSX.Element {
  const id = useArtId();
  return <Art svg={seasonFrameSvg({ tier, size, shine: tier === 'lutke' || tier === 'sterk', idPrefix: id })} className="art-emblem" />;
}

/**
 * A badge medallion at a tier (1–4), or locked at 0. A key the art has no
 * drawing for — a retired achievement kept on an old account — shows a plain
 * placeholder rather than failing the page.
 */
export function BadgeArt({ badgeKey, tier, tiers, size = 56, label }: { badgeKey: string; tier: number; tiers: number; size?: number; label?: string }): React.JSX.Element {
  const id = useArtId();
  if (!hasBadgeArt(badgeKey)) {
    return (
      <span className="art art-missing" style={{ width: size, height: size }} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
        ?
      </span>
    );
  }
  const shown = Math.min(Math.max(tier, 1), tiers) as ArtBadgeTier;
  const svg = badgeSvg({ key: badgeKey as ArtBadgeKey, tier: shown, tiers, size, state: tier > 0 ? 'earned' : 'locked', idPrefix: id });
  return <Art svg={svg} label={label} className="art-badge" />;
}

// ---- a weekly run -------------------------------------------------------------------

/** Where a settle or merge stands, with when, and what it did or why it failed. */
export function RunLine({ title, run, now }: { title: string; run: LeagueRunStatus | null; now?: Date }): React.JSX.Element {
  const state = runState(run, now);
  return (
    <div className="run-line">
      <div className="run-head">
        <strong>{title}</strong>
        <Badge tone={state.tone}>{state.label}</Badge>
      </div>
      {run && (
        <div className="run-meta subtle">
          {run.finishedAt ? (
            <>
              Finished <Time value={run.finishedAt} />
            </>
          ) : run.startedAt ? (
            <>
              Started <Time value={run.startedAt} />
            </>
          ) : null}
          {run.attempts > 1 && <> · {run.attempts} attempts</>}
        </div>
      )}
      {state.detail && <div className={state.tone === 'bad' ? 'field-error' : 'run-detail'}>{state.detail}</div>}
    </div>
  );
}

// ---- changing a rating ----------------------------------------------------------------

/** What `POST /admin/ranks/games/:game/:ref/void` answers. */
interface VoidResult {
  replayedGames: number;
  players: number;
}

/** "Voided. 3 later games were worked out again for 4 players." */
export function voidSaid(r: VoidResult): string {
  if (r.players === 0) return 'Voided. Nothing after it needed working out again.';
  const games = r.replayedGames === 1 ? '1 later game was' : `${r.replayedGames} later games were`;
  return `Voided. ${games} worked out again for ${r.players} ${r.players === 1 ? 'player' : 'players'}.`;
}

/**
 * Void a game's rating effect, asked with a reason (the audit log keeps it).
 * Resolves true when it was voided.
 */
export function useVoidGame(): (game: RankedGame, ref: string, players: number) => Promise<boolean> {
  const dialogs = useDialogs();
  const toast = useToast();
  return async (game, ref, players) => {
    const reason = await dialogs.prompt({
      title: `Void this ${GAME_NAME[game]} game’s rating effect?`,
      body: (
        <div className="dialog-text">
          <p>
            The game stops counting for its {players} {players === 1 ? 'player' : 'players'}, and every rated game they played after it is worked out again
            from history, in order. Players it never reached keep their numbers exactly.
          </p>
          <p>Season rewards already handed out stay. The panel cannot undo a void.</p>
        </div>
      ),
      label: 'Why (kept in the audit log)',
      multiline: true,
      maxLength: REASON_MAX,
      validate: reasonProblem,
      confirmLabel: 'Void its effect',
      tone: 'danger',
    });
    if (reason === null) return false;
    try {
      const r = await api<VoidResult>(`/admin/ranks/games/${encodeURIComponent(game)}/${encodeURIComponent(ref)}/void`, { method: 'POST', body: { reason } });
      toast.success(voidSaid(r));
      return true;
    } catch (err) {
      toast.error(errorLine(err, 'game ranks'));
      return false;
    }
  };
}

/** Reset a player's rating in one game to the start, asked with a reason. Resolves true when it was reset. */
export function useResetRating(): (user: { id: string; username: string }, game: RankedGame) => Promise<boolean> {
  const dialogs = useDialogs();
  const toast = useToast();
  return async (user, game) => {
    const reason = await dialogs.prompt({
      title: `Reset @${user.username}’s ${GAME_NAME[game]} rating?`,
      body: (
        <div className="dialog-text">
          <p>It goes back to the start: 0 points, and five placement games again before a tier shows.</p>
          <p>Their rated games, their history and the season emblems they have earned stay. The panel cannot undo a reset.</p>
        </div>
      ),
      label: 'Why (kept in the audit log)',
      multiline: true,
      maxLength: REASON_MAX,
      validate: reasonProblem,
      confirmLabel: 'Reset the rating',
      tone: 'danger',
    });
    if (reason === null) return false;
    try {
      await api(`/admin/ranks/players/${encodeURIComponent(user.id)}/${encodeURIComponent(game)}/reset`, { method: 'POST', body: { reason } });
      toast.success(`@${user.username} starts ${GAME_NAME[game]} from placement again.`);
      return true;
    } catch (err) {
      toast.error(errorLine(err, 'game ranks'));
      return false;
    }
  };
}

// ---- rated games ------------------------------------------------------------------------

function GameState({ g }: { g: { voided: boolean; voidReason: string | null; weight: number } }): React.JSX.Element {
  if (g.voided) {
    return (
      <Badge tone="neutral" title={g.voidReason ?? undefined}>
        Voided
      </Badge>
    );
  }
  return g.weight < 1 ? <Badge tone="info">Counted ×{g.weight}</Badge> : <Badge tone="ok">Counted</Badge>;
}

function placeText(place: number | null, players: number): string {
  return place === null ? '—' : `${place} of ${players}`;
}

/** A player's latest rated games, each voidable: the Ranks tab and the top list's drawer. */
export function PlayerGamesTable({ games, onVoided }: { games: AdminPlayerGame[]; onVoided: () => void }): React.JSX.Element {
  const voidGame = useVoidGame();
  const columns: ReadonlyArray<Column<AdminPlayerGame>> = [
    { key: 'when', header: 'When', card: 'title', cell: (g) => <Time value={g.at} /> },
    { key: 'game', header: 'Game', cell: (g) => GAME_NAME[g.game] },
    { key: 'place', header: 'Place', cell: (g) => `${placeText(g.place, g.players)}${g.left ? ' · left' : ''}` },
    {
      key: 'change',
      header: 'Change',
      cell: (g) =>
        g.pointsBefore === null || g.pointsAfter === null ? (
          '—'
        ) : (
          <span>
            <strong className="nowrap">{signed(g.pointsAfter - g.pointsBefore)}</strong> <span className="subtle">{reasonText(g.reason)}</span>
          </span>
        ),
    },
    { key: 'state', header: 'State', cell: (g) => <GameState g={g} /> },
  ];
  return (
    <Table
      caption="Rated games"
      columns={columns}
      rows={games}
      rowKey={(g) => `${g.game}:${g.gameRef}`}
      empty="No rated games yet."
      actions={(g) =>
        g.voided ? null : (
          <Button variant="ghost" onClick={() => void voidGame(g.game, g.gameRef, g.players).then((done) => done && onVoided())}>
            Void…
          </Button>
        )
      }
    />
  );
}

/** The rated games a suspicious pair played together, each voidable. */
export function PairGamesDrawer({
  pair,
  onClose,
}: {
  pair: { game: RankedGame; a: { userId: string; username: string }; b: { userId: string; username: string } };
  onClose: () => void;
}): React.JSX.Element {
  const loaded = useLoad(
    () =>
      api<{ games: AdminPairGame[] }>(
        `/admin/ranks/pairs/${encodeURIComponent(pair.game)}/${encodeURIComponent(pair.a.userId)}/${encodeURIComponent(pair.b.userId)}`,
      ).then((r) => r.games),
    [pair.game, pair.a.userId, pair.b.userId],
  );
  const voidGame = useVoidGame();
  const columns: ReadonlyArray<Column<AdminPairGame>> = [
    { key: 'when', header: 'When', card: 'title', cell: (g) => <span title={absoluteTime(new Date(g.at))}><Time value={g.at} /></span> },
    { key: 'a', header: `@${pair.a.username}`, cell: (g) => placeText(g.aPlace, g.players) },
    { key: 'b', header: `@${pair.b.username}`, cell: (g) => placeText(g.bPlace, g.players) },
    { key: 'state', header: 'State', cell: (g) => <GameState g={g} /> },
  ];
  return (
    <Drawer open onClose={onClose} title={`${GAME_NAME[pair.game]}: @${pair.a.username} and @${pair.b.username}`} className="drawer-wide">
      <p className="section-text">
        <UserLink user={{ id: pair.a.userId, username: pair.a.username }} /> and <UserLink user={{ id: pair.b.userId, username: pair.b.username }} /> — their
        rated games together, newest first. Voiding one works out everything after it again.
      </p>
      {loaded.error != null && !loaded.data ? (
        <ErrorState error={loaded.error} onRetry={() => void loaded.reload()} what="game ranks" compact />
      ) : !loaded.data ? (
        <Loading rows={3} />
      ) : loaded.data.length === 0 ? (
        <EmptyState title="No rated games together" compact>
          Their friendly games are not listed: those never moved a rating.
        </EmptyState>
      ) : (
        <Table
          caption="Their rated games together"
          columns={columns}
          rows={loaded.data}
          rowKey={(g) => g.gameRef}
          actions={(g) =>
            g.voided ? null : (
              <Button variant="ghost" onClick={() => void voidGame(g.game, g.gameRef, g.players).then((done) => done && void loaded.reload())}>
                Void…
              </Button>
            )
          }
        />
      )}
    </Drawer>
  );
}

/** "Çiya II · 1,040 points" with the emblem, for a list row. */
export function RankCell({ tier, division, points, placement }: { tier: RankTier | null; division: Division | null; points: number; placement?: { played: number; of: number } | null }): React.JSX.Element {
  return (
    <span className="rank-cell">
      <RankEmblem tier={tier} division={division} placing={placement?.played} size={28} />
      <span>
        <span className="rank-cell-name">{rankLine(tier, division, placement)}</span>
        <span className="subtle"> · {points.toLocaleString()} pts</span>
      </span>
    </span>
  );
}
