import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { MultiGame, MultiResult, MultiSeat, MultiView } from '@kurda/shared';
import { Button } from '../components/Button';
import { ConfirmButton } from '../components/ConfirmButton';
import { TrophyIcon } from '../components/icons';
import { ErrorState, Loading } from '../components/states';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { useRail } from '../social/RailProvider';
import { PlayerReport } from '../reports/PlayerReport';
import { LobbyRated, RatedBadge, shownRated } from '../ranks/rated';
import { RankResult } from '../ranks/RankResult';
import { RankList, RankRow } from '../ui/RankRow';
import { useGameFinished } from '../feedback/gameFinished';
import { CodeTicket } from './CodeTicket';
import { LeaveLobby, LobbyRoster, RoomUnavailable } from './GameRoom';
import { InviteFriendsButton, InvitedList } from './LobbyInvites';
import { RematchPanel } from './RematchPanel';
import { TeamPicker } from './TeamPicker';
import { playError } from './playApi';
import { useQuietInvites } from './quietInvites';
import type { GameViewHandle } from './useGameView';

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** "You", Hevalo, a friend's name, or "Player 3": a seat's name in a multiplayer learning game. */
export function multiSeatName(p: Pick<MultiSeat, 'seat' | 'name' | 'isMe' | 'bot'>, t: Translate): string {
  if (p.isMe) return t('games.you');
  if (p.bot) return t('play.room.hevalo');
  return p.name ?? t('stories.game.playerN', { seat: p.seat });
}

/** A seat's name by its number in a view. */
export function seatNamer(view: Pick<MultiView, 'players'>, t: Translate): (seat: number) => string {
  return (seat) => {
    const p = view.players.find((x) => x.seat === seat);
    return p ? multiSeatName(p, t) : t('stories.game.playerN', { seat });
  };
}

export interface GameRoomProps<Board> {
  game: MultiGame;
  id: string;
  room: GameViewHandle<Board>;
  /** Where a new game of this kind is made, and what that link says. */
  newPath: string;
  newLabel: string;
  /** What the lobby says about the game's settings, above the roster. */
  lobbyNote?: (view: MultiView<Board>) => ReactNode;
  /** The game itself while under way. */
  playing: (view: MultiView<Board>) => ReactNode;
  /** The game's own word on how it ended, above the places. */
  ending?: (view: MultiView<Board>) => ReactNode;
  /** A place's score in the game's words ("Words: 12"). */
  scoreOf: (result: MultiResult, view: MultiView<Board>) => string;
  /** Why the lobby cannot start yet (a team too small), in the reader's words; null when it can. */
  startProblem?: (view: MultiView<Board>) => string | null;
  /** What a team game says about its teams, inside the team picker. */
  teamNote?: (view: MultiView<Board>) => ReactNode;
}

/**
 * The room around any multiplayer learning game: lobby, game and results, built from the play layer's parts so every
 * game reads alike (join code and Invite friends, the roster by seat with Remove and report, Rated or Friendly, Start
 * and Join, then places, rank change and Play again). A game against Hevalo pays no XP and says so once. The game
 * supplies only `playing` and how a score reads; everything else works from `MultiView`, kept current by `useGameView`.
 */
export function GameRoom<Board>({
  game,
  id,
  room,
  newPath,
  newLabel,
  lobbyNote,
  playing,
  ending,
  scoreOf,
  startProblem,
  teamNote,
}: GameRoomProps<Board>): React.JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const myAvatar = useRail().data.you?.avatarUrl ?? null;
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { load } = room;
  const view = load.state === 'ready' ? load.view : null;
  const active = view?.status === 'active' && view.me !== null;
  // While playing, an invite to something else waits as a chip.
  useQuietInvites(active);
  // The rating box hears of a game that ended while you played it.
  useGameFinished(game, view?.me ? id : null, view?.status === 'finished');

  async function control(path: string, body?: unknown): Promise<void> {
    setBusy(true);
    setNotice(null);
    const res = await room.act(path, body);
    setBusy(false);
    if (!res.ok) setNotice(playError(res.error, t));
  }
  async function leave(): Promise<void> {
    await room.act('leave');
    navigate('/app/games');
  }

  if (load.state === 'gone') return <RoomUnavailable why={load.why === 'started' ? 'started' : 'gone'} newPath={newPath} newLabel={newLabel} />;
  if (load.state === 'error') return <ErrorState message={playError({ kind: 'server', code: load.code, message: '' }, t)} onRetry={room.refresh} />;
  if (!view) return <Loading />;
  if (view.status === 'cancelled') return <RoomUnavailable why="cancelled" newPath={newPath} newLabel={newLabel} />;

  const name = seatNamer(view, t);
  const present = view.players.filter((p) => !p.gone);
  const room_ = Math.max(0, view.maxPlayers - present.length);

  if (view.status === 'lobby') {
    const short = present.length < view.minPlayers;
    const problem = short ? null : (startProblem?.(view) ?? null);
    return (
      <div className="match-lobby match-room mp-room">
        <CodeTicket
          game={game}
          code={view.code}
          access={view.access}
          invite={view.isHost ? <InviteFriendsButton game={game} lobbyId={id} room={room_} /> : undefined}
        />
        {lobbyNote?.(view)}
        {view.teams > 0 && view.me !== null ? (
          <TeamPicker
            players={view.players}
            teams={view.teams}
            max={view.maxPlayers}
            isHost={view.isHost}
            game={game}
            gameId={id}
            note={teamNote?.(view)}
            onTeam={(seat, team) => control('team', { seat, team })}
            onRemove={(seat) => control('remove', { seat })}
          />
        ) : (
          <LobbyRoster players={view.players} max={view.maxPlayers} canRemove={view.isHost} onRemove={(seat) => control('remove', { seat })} game={game} gameId={id} />
        )}
        <LobbyRated
          game={game}
          lobbyId={id}
          state={view.rated}
          isHost={view.isHost}
          member={view.me !== null}
          playerCount={present.length}
          seatName={name}
        />
        {view.isHost && <InvitedList game={game} lobbyId={id} room={room_} headingLevel={2} />}
        {notice && (
          <div className="wordle-notice" role="status">
            {notice}
          </div>
        )}
        {view.me === null ? (
          <Button size="lg" disabled={busy} onClick={() => void control('join')}>
            {busy ? t('games.joining') : t('play.room.join')}
          </Button>
        ) : view.isHost ? (
          <>
            {problem && (
              <p className="mp-start-problem" role="status">
                {problem}
              </p>
            )}
            <Button size="lg" disabled={busy || short || problem !== null} onClick={() => void control('start')}>
              {short ? t('play.room.waiting') : busy ? t('games.starting') : t('play.room.start')}
            </Button>
          </>
        ) : (
          <p className="muted">{t('play.room.waitingHost')}</p>
        )}
        {view.me !== null && <LeaveLobby isHost={view.isHost} onLeave={leave} />}
      </div>
    );
  }

  if (view.status === 'active') {
    return (
      <div className="match-play mp-room">
        {view.mode === 'group' && <RatedBadge rated={shownRated(view.rated)} size="sm" className="match-rated" />}
        {view.canControl && !view.isHost && view.mode === 'group' && (
          <p className="mp-standin" role="status">
            {t('play.room.standIn')}
          </p>
        )}
        {playing(view)}
        {view.me !== null && (
          <div className="mp-leave">
            <ConfirmButton
              className="btn btn-ghost btn-sm"
              label={t('play.room.leaveGame')}
              confirmLabel={t('play.room.leaveGameConfirm')}
              title={t('play.room.leaveGame')}
              onConfirm={leave}
            />
          </div>
        )}
      </div>
    );
  }

  // Finished.
  const mine = view.results?.find((r) => r.seat === view.me?.seat);
  const others = view.players.filter((p) => !p.isMe && !p.bot);
  return (
    <div className="match-results mp-room">
      <Verdict won={mine?.place === 1} label={mine?.place === 1 ? t('games.youWon') : t('play.room.over')} />
      {view.mode === 'group' && <RatedBadge rated={shownRated(view.rated)} size="sm" className="match-rated" />}
      {view.me !== null && view.mode === 'group' && <RankResult game={game} gameRef={id} />}
      {ending?.(view)}
      <RankList label={t('play.room.results')}>
        {(view.results ?? []).map((r) => {
          const p = view.players.find((x) => x.seat === r.seat);
          const me = p?.isMe ?? false;
          return (
            <RankRow
              key={r.seat}
              rank={r.place}
              name={name(r.seat)}
              avatarUrl={me ? myAvatar : (p?.avatarUrl ?? null)}
              me={me}
              score={scoreOf(r, view)}
              trailing={
                <>
                  {/* Only earned XP shows, so a row never reads "+0 XP". */}
                  {r.xpAwarded ? <span className="rank-xp">+{r.xpAwarded} XP</span> : null}
                  {p && !me && !p.bot && <PlayerReport game={game} gameId={id} seat={r.seat} name={name(r.seat)} />}
                </>
              }
            />
          );
        })}
      </RankList>
      {/* Against Hevalo there is no XP on the rows above: say so once, and where it is earned. */}
      {view.mode === 'solo' && <p className="gs-alone">{t('games.noXpAlone')}</p>}
      {view.me !== null && view.mode === 'group' && (
        <RematchPanel game={game} lobbyId={id} otherName={others[0] ? name(others[0].seat) : t('games.opponent')} isHost={view.canControl} />
      )}
      <Link to={newPath} className="btn btn-ghost">
        {newLabel}
      </Link>
    </div>
  );
}

/** A finished game's headline, focused because the screen just changed. */
function Verdict({ won, label }: { won: boolean; label: string }): React.JSX.Element {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <h2 ref={heading} tabIndex={-1} className={`match-verdict${won ? ' is-won' : ''}`}>
      {won && <TrophyIcon size={26} className="verdict-icon" />}
      {label}
    </h2>
  );
}
