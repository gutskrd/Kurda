import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { PlayGame } from '@kurda/shared';
import { Avatar } from '../components/Avatar';
import { ConfirmButton } from '../components/ConfirmButton';
import { HostIcon } from '../components/icons';
import { useT, type Translate } from '../i18n/I18nProvider';
import { useRail } from '../social/RailProvider';
import { PlayerReport } from '../reports/PlayerReport';
import type { MessageKey } from '../i18n/en';

/**
 * A player in a Peyvok Battle or Rhyme Match by seat, as the server lets this viewer see them: a name only for yourself,
 * your friends, or anyone in a game open to adults, otherwise "Player 3". Another player's `userId` is an opaque
 * `seat:N`.
 */
export interface SeatPlayer {
  seat: number;
  userId: string;
  name: string | null;
  avatarUrl: string | null;
  isMe: boolean;
  isHost: boolean;
  /** Left after the start; still listed so seats do not move. */
  gone: boolean;
}

/** "You", a friend's name, or "Player 3". */
export function seatName(p: Pick<SeatPlayer, 'seat' | 'name' | 'isMe'>, t: Translate): string {
  if (p.isMe) return t('games.you');
  return p.name ?? t('stories.game.playerN', { seat: p.seat });
}

/**
 * Who is in the lobby by seat, the host marked, with Remove beside the others for the host (confirmed twice). The same
 * panel as a story game's lobby.
 */
export function LobbyRoster({
  players,
  max,
  canRemove,
  onRemove,
  game,
  gameId,
}: {
  players: readonly SeatPlayer[];
  max: number;
  canRemove: boolean;
  onRemove: (seat: number) => Promise<void>;
  /** The game and lobby, so a ⋯ beside each other player can report them by seat. */
  game: PlayGame;
  gameId: string;
}): React.JSX.Element {
  const t = useT();
  // The server leaves your own face to the client, which has it already.
  const myAvatar = useRail().data.you?.avatarUrl ?? null;
  const present = players.filter((p) => !p.gone);
  return (
    <div className="sg-panel lobby-roster">
      <div className="sg-panel-head">
        <h2 className="sg-panel-title" id="lobby-players-title">
          {t('stories.game.players', { count: present.length, max })}
        </h2>
      </div>
      <ul className="sg-players" aria-labelledby="lobby-players-title">
        {present.map((p) => (
          <li key={p.seat} className="sg-player">
            <Avatar url={p.isMe ? myAvatar : p.avatarUrl} glyphSize={18} />
            <span className="sg-player-name">
              {seatName(p, t)}
              {p.isHost && (
                <span className="sg-host">
                  <HostIcon size={12} />
                  {t('stories.game.host')}
                </span>
              )}
            </span>
            {!p.isMe && <PlayerReport game={game} gameId={gameId} seat={p.seat} name={seatName(p, t)} />}
            {canRemove && !p.isMe && (
              <ConfirmButton
                className="btn btn-ghost btn-sm sg-remove"
                label={t('stories.game.remove')}
                title={t('stories.game.removeWho', { name: seatName(p, t) })}
                onConfirm={() => onRemove(p.seat)}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Leaving a lobby; the host is warned that leaving calls the game off for everyone. */
export function LeaveLobby({ isHost, onLeave }: { isHost: boolean; onLeave: () => Promise<void> }): React.JSX.Element {
  const t = useT();
  return (
    <ConfirmButton
      className="btn btn-ghost btn-sm"
      label={t('stories.game.leave')}
      confirmLabel={isHost ? t('stories.game.leaveCloses') : t('common.sure')}
      title={t('stories.game.leave')}
      onConfirm={onLeave}
    />
  );
}

/** Why a game page has no game to show. */
export type RoomGone = 'started' | 'gone' | 'cancelled';

const GONE_KEY: Record<RoomGone, { title: MessageKey; body: MessageKey }> = {
  // A latecomer: the game is running, just not theirs to join any more.
  started: { title: 'play.room.startedTitle', body: 'stories.error.started' },
  // Not found, not allowed or removed: one answer, as the server gives one.
  gone: { title: 'stories.game.goneTitle', body: 'stories.error.notFound' },
  cancelled: { title: 'stories.game.cancelledTitle', body: 'stories.game.cancelled' },
};

/**
 * A game this person cannot be in (started without them, gone, or called off), said plainly with a way to start their
 * own. The heading takes focus, since the page changed under them.
 */
export function RoomUnavailable({
  why,
  newPath,
  newLabel,
}: {
  why: RoomGone;
  newPath: string;
  newLabel: string;
}): React.JSX.Element {
  const t = useT();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const { title, body } = GONE_KEY[why];
  return (
    <div className="state sg-ended">
      <h2 ref={heading} tabIndex={-1}>
        {t(title)}
      </h2>
      <p>{t(body)}</p>
      <div className="sg-ended-actions">
        <Link to={newPath} className="btn btn-primary">
          {newLabel}
        </Link>
        <Link to="/app/games" className="btn btn-secondary">
          {t('games.back')}
        </Link>
      </div>
    </div>
  );
}
