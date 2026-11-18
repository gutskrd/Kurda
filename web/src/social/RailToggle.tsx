import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { UsersIcon } from '../components/icons';
import { badgeLabel } from './time';
import { useRail, useRailPresent } from './RailProvider';
import { useT } from '../i18n/I18nProvider';

/** The nav button that opens the rail, with its badge; hidden on wide screens, where the rail is always open. */
export function RailToggle(): React.JSX.Element | null {
  const { status } = useAuth();
  const t = useT();
  const present = useRailPresent();
  const { open, setOpen, total } = useRail();

  // Pop only when the number goes up, not on every poll.
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
      aria-label={total > 0 ? t('rail.titleWaiting', { count: total }) : t('rail.title')}
      aria-expanded={open}
      onClick={() => setOpen(!open)}
    >
      {/* Two people, for friends rather than the profile. */}
      <UsersIcon size={19} />
      {total > 0 && (
        <span key={popKey} className="rail-badge rail-badge-pop">
          {badgeLabel(total)}
        </span>
      )}
    </button>
  );
}
