import { useEffect } from 'react';
import { Avatar } from '../components/Avatar';
import { CloseButton } from '../components/CloseButton';
import { BellIcon, GameIcon, TicketIcon } from '../components/icons';
import { NotePicture } from '../notifications/NotificationList';
import type { Arrival } from './useSocialRail';
import { useT } from '../i18n/I18nProvider';

/** How long a toast stays before it takes itself away. */
const LINGER_MS = 8_000;

/**
 * New arrivals announced in the corner, since a game invite expires in two minutes and a badge alone is too easy to
 * miss. Toasts stack up to three, and each opens the rail.
 */
export function RailToasts({
  arrivals,
  onDismiss,
  onOpen,
}: {
  arrivals: Arrival[];
  onDismiss: (key: string) => void;
  onOpen: () => void;
}): React.JSX.Element | null {
  if (arrivals.length === 0) return null;
  return (
    <div className="rail-toasts" role="status" aria-live="polite">
      {arrivals.map((a) => (
        <Toast key={a.key} arrival={a} onDismiss={() => onDismiss(a.key)} onOpen={onOpen} />
      ))}
    </div>
  );
}

/** A four-point sparkle, drawn round a reward's medal. */
function Sparkle({ at }: { at: 'a' | 'b' | 'c' }): React.JSX.Element {
  return (
    <svg className={`rail-toast-spark rail-toast-spark--${at}`} viewBox="0 0 10 10" aria-hidden>
      <path d="M5 0C5.4 3.2 6.8 4.6 10 5C6.8 5.4 5.4 6.8 5 10C4.6 6.8 3.2 5.4 0 5C3.2 4.6 4.6 3.2 5 0Z" />
    </svg>
  );
}

function Toast({
  arrival,
  onDismiss,
  onOpen,
}: {
  arrival: Arrival;
  onDismiss: () => void;
  onOpen: () => void;
}): React.JSX.Element {
  const t = useT();
  useEffect(() => {
    const timer = setTimeout(onDismiss, LINGER_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const picture = arrival.who ? null : (arrival.picture ?? null);
  // A badge or a league is a reward: its medal is drawn large, lit by its own colours, with a shine as it lands.
  const reward = picture?.kind === 'badge' || picture?.kind === 'league';
  // Only an invite and a friend request carry a mark on their corner; anything else has nothing to say there.
  const mark = arrival.kind === 'challenge' ? <GameIcon size={11} /> : arrival.kind === 'request' ? <TicketIcon size={11} /> : null;

  return (
    <div className={`rail-toast${reward ? ' is-reward' : ''}`}>
      {reward && picture && (
        <span className="rail-toast-glow" aria-hidden>
          <NotePicture picture={picture} />
        </span>
      )}
      <button
        type="button"
        className="rail-toast-main"
        onClick={() => {
          onOpen();
          onDismiss();
        }}
      >
        <span className={`rail-toast-icon${picture ? ' has-picture' : ''}`}>
          {arrival.who ? <Avatar url={arrival.who.avatarUrl} glyphSize={16} /> : picture ? <NotePicture picture={picture} /> : <BellIcon size={18} />}
          {reward && (
            <>
              <span className="rail-toast-shine" aria-hidden />
              <Sparkle at="a" />
              <Sparkle at="b" />
              <Sparkle at="c" />
            </>
          )}
          {/* A friend request is a ticket in the heart colour, as everywhere (ui/Ticket.tsx). */}
          {mark && (
            <span className={`rail-toast-kind${arrival.kind === 'request' ? ' ticket--friend is-ticket' : ''}`} aria-hidden>
              {mark}
            </span>
          )}
        </span>
        <span className="rail-toast-text">
          <span className="rail-toast-title">{arrival.title}</span>
          {arrival.body && <span className="rail-toast-body">{arrival.body}</span>}
        </span>
      </button>
      <CloseButton className="rail-toast-x" label={t('rail.dismiss')} onClick={onDismiss} />
      {/* A draining bar shows the toast's remaining time. */}
      <span className="rail-toast-timer" aria-hidden />
    </div>
  );
}
