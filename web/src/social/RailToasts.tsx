import { useEffect } from 'react';
import { Avatar } from '../components/Avatar';
import { CloseButton } from '../components/CloseButton';
import { BellIcon, GameIcon, TicketIcon } from '../components/icons';
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

  return (
    <div className="rail-toast">
      <button
        type="button"
        className="rail-toast-main"
        onClick={() => {
          onOpen();
          onDismiss();
        }}
      >
        <span className="rail-toast-icon">
          {arrival.who ? (
            <Avatar url={arrival.who.avatarUrl} glyphSize={16} />
          ) : (
            <BellIcon size={18} />
          )}
          {/* A friend request is a ticket in the heart colour, as everywhere (ui/Ticket.tsx). */}
          <span className={`rail-toast-kind${arrival.kind === 'request' ? ' ticket--friend is-ticket' : ''}`} aria-hidden>
            {arrival.kind === 'challenge' ? <GameIcon size={11} /> : arrival.kind === 'request' ? <TicketIcon size={11} /> : null}
          </span>
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
