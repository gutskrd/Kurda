import { useEffect } from 'react';
import { Avatar } from '../components/Avatar';
import { CloseIcon, GameIcon, UserIcon, SparkIcon } from '../components/icons';
import type { Arrival } from './useSocialRail';

/** How long a toast stays before it takes itself away. */
const LINGER_MS = 8_000;

/**
 * What just arrived, announced in the corner.
 *
 * A game invite expires in two minutes, so the badge alone is not enough — you
 * have to be told while it is still worth acting on. Toasts stack, cap at three,
 * and each one is a button that opens the rail, because being told about
 * something you then have to go find is only half a notification.
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
  useEffect(() => {
    const t = setTimeout(onDismiss, LINGER_MS);
    return () => clearTimeout(t);
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
            <SparkIcon size={18} />
          )}
          <span className="rail-toast-kind" aria-hidden>
            {arrival.kind === 'challenge' ? <GameIcon size={11} /> : arrival.kind === 'request' ? <UserIcon size={11} /> : null}
          </span>
        </span>
        <span className="rail-toast-text">
          <span className="rail-toast-title">{arrival.title}</span>
          {arrival.body && <span className="rail-toast-body">{arrival.body}</span>}
        </span>
      </button>
      <button type="button" className="rail-toast-x" onClick={onDismiss} aria-label="Dismiss">
        <CloseIcon size={14} />
      </button>
      {/* a bar that drains, so the toast's remaining time is visible rather than
          a surprise when it vanishes mid-read */}
      <span className="rail-toast-timer" aria-hidden />
    </div>
  );
}
