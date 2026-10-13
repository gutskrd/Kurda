import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { ConfirmButton } from '../components/ConfirmButton';
import { HostIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/**
 * One player in a Wordle Battle or Rhyme Match, by seat, as the server lets
 * this viewer see them (contract §B2): a name only for yourself, your friends,
 * or anyone in a game open to adults; otherwise "Player 3". Another player's
 * `userId` is an opaque `seat:N`, never their account.
 */
export interface SeatPlayer {
  seat: number;
  userId: string;
  name: string | null;
  avatarUrl: string | null;
  isMe: boolean;
  isHost: boolean;
  /** left after the start; still listed so seats do not move */
  gone: boolean;
}

/** "You", a friend's name, or "Player 3". */
export function seatName(p: Pick<SeatPlayer, 'seat' | 'name' | 'isMe'>, t: Translate): string {
  if (p.isMe) return t('games.you');
  return p.name ?? t('stories.game.playerN', { seat: p.seat });
}

/**
 * Who is in the lobby, by seat — with the host marked, and Remove beside the
 * others for the host (asked twice: it cannot be taken back). The same panel
 * as a story game's lobby, so the three games' lobbies read alike.
 */
export function LobbyRoster({
  players,
  max,
  canRemove,
  onRemove,
}: {
  players: readonly SeatPlayer[];
  max: number;
  canRemove: boolean;
  onRemove: (seat: number) => Promise<void>;
}): React.JSX.Element {
  const t = useT();
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
            <Avatar url={p.avatarUrl} glyphSize={18} />
            <span className="sg-player-name">
              {seatName(p, t)}
              {p.isHost && (
                <span className="sg-host">
                  <HostIcon size={12} />
                  {t('stories.game.host')}
                </span>
              )}
            </span>
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

/**
 * Leaving a lobby. The host leaving calls the game off for everyone (the
 * others were let in as the host's friends), so the host is asked that.
 */
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
  // a latecomer: the game is running, it just is not theirs to join any more
  started: { title: 'play.room.startedTitle', body: 'stories.error.started' },
  // not found, not allowed, removed — one answer, as the server gives one
  gone: { title: 'stories.game.goneTitle', body: 'stories.error.notFound' },
  cancelled: { title: 'stories.game.cancelledTitle', body: 'stories.game.cancelled' },
};

/**
 * A game this person cannot be in: one that started without them, one that
 * is gone or not theirs to see, or one the host called off — said plainly,
 * with a way to start their own. The heading takes the focus, as the page's
 * content changed under them.
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
