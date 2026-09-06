import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { UsersIcon } from '../components/icons';
import { badgeLabel } from './time';
import { useRail, useRailPresent } from './RailProvider';

/**
 * The nav's way into the rail, and its badge.
 *
 * On a wide screen the rail is always open and this disappears (CSS); on a
 * narrow one it is the only way in, which is why it carries the count.
 */
export function RailToggle(): React.JSX.Element | null {
  const { status } = useAuth();
  const present = useRailPresent();
  const { open, setOpen, total } = useRail();

  // the pop should fire when the number goes up, not every time the poll
  // returns the same number again
  const [popKey, setPopKey] = useState(0);
  const previous = useRef(total);
  useEffect(() => {
    if (total > previous.current) setPopKey((n) => n + 1);
    previous.current = total;
  }, [total]);

  if (!present || status !== 'signedIn') return null;

  return (
    <button
      type="button"
      className={`rail-toggle${total > 0 ? ' has-unread' : ''}`}
      aria-label={total > 0 ? `Social — ${total} waiting` : 'Social'}
      aria-expanded={open}
      onClick={() => setOpen(!open)}
    >
      {/* two people, not one — this is your friends, not your profile */}
      <UsersIcon size={19} />
      {total > 0 && (
        <span key={popKey} className="rail-badge rail-badge-pop">
          {badgeLabel(total)}
        </span>
      )}
    </button>
  );
}
