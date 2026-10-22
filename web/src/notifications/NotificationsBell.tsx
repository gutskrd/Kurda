import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { localeDir } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { BellIcon, CloseIcon, GearIcon, ReadAllIcon } from '../components/icons';
import { NotificationsSkeleton } from '../components/skeletons';
import { wrapTab } from '../components/Sheet';
import { useLocale, useT } from '../i18n/I18nProvider';
import { useRail, useRailPresent } from '../social/RailProvider';
import { NotificationList, useNotificationReads } from './NotificationList';

/** Below this the panel is a sheet that fills the screen under the bar; above it, a panel hanging from the bell. */
const PHONE = '(max-width: 560px)';

/** Where the notification settings are: their own page in Settings (NotificationPrefsCard). */
export const NOTIFICATION_SETTINGS_PATH = '/app/settings/notifications';

/**
 * The bell: what happened while you were elsewhere.
 *
 * Likes, comments, gifts, game invites and notices from Hevalo used to sit at
 * the bottom of the social column, folded shut under "Recent" — on a phone,
 * two taps and a scroll away, and easy never to find. They are one press away
 * from every page now, at the end of the top bar where a phone keeps them,
 * with a dot when something is new. Messages are not here: a conversation has
 * its own place, and a notice about one would only be a second badge for the
 * same thing.
 *
 * On a wide screen the list opens in a panel hanging from the bell, so reading
 * what is new does not cost you the page you were on. On a phone a panel that
 * size was a cramped box over the page; there it is a sheet filling the screen
 * under the bar, the way the search results are, and the page behind it holds
 * still. Escape, a click outside it, or following one of them closes it, and
 * the focus goes back to the bell. While it is open, Tab goes round inside it:
 * it is drawn at the end of the page, so Tab past its last button used to fall
 * out of the window and on through the page, with the panel still open over it.
 */
export function NotificationsBell(): React.JSX.Element | null {
  const { status } = useAuth();
  const t = useT();
  const locale = useLocale();
  const present = useRailPresent();
  const { data, loading, failed, refresh } = useRail();
  const reads = useNotificationReads(data.notifications, refresh);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const titleId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  /** how far the bell's end edge is from the window's, so the panel's end lines up with it */
  const [anchor, setAnchor] = useState<number | null>(null);

  const unread = reads.unread || (data.notifications.length === 0 ? data.unread.notifications : 0);

  // moving to another page puts the panel away
  useEffect(() => setOpen(false), [pathname]);

  const close = (): void => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    // the panel takes the focus, so a keyboard is already inside what it opened
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      } else if (panelRef.current) {
        wrapTab(e, panelRef.current);
      }
    };
    const onDown = (e: PointerEvent): void => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    // a sheet over the whole screen: the page under it should not scroll away behind it
    const sheet = typeof window.matchMedia === 'function' && window.matchMedia(PHONE).matches;
    const before = document.body.style.overflow;
    if (sheet) document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
      if (sheet) document.body.style.overflow = before;
    };
  }, [open]);

  // hang from the bell itself, wherever the bar has put it, in either direction
  useLayoutEffect(() => {
    if (!open) return;
    const place = (): void => {
      const r = buttonRef.current?.getBoundingClientRect();
      if (!r) return;
      const width = document.documentElement.clientWidth;
      setAnchor(localeDir(locale) === 'rtl' ? r.left : width - r.right);
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, locale]);

  if (!present || status !== 'signedIn') return null;

  const label = unread > 0 ? t('notifications.bellUnread', { count: unread }) : t('notifications.title');
  const items = data.notifications;

  let body: React.ReactNode;
  if (items.length > 0) {
    body = <NotificationList items={items} reads={reads} onFollow={() => setOpen(false)} />;
  } else if (loading) {
    body = <NotificationsSkeleton />;
  } else if (failed) {
    body = (
      <div className="bell-state" role="alert">
        <p className="bell-state-title">{t('notifications.loadFailed')}</p>
        <Button variant="secondary" size="sm" onClick={refresh}>
          {t('common.retry')}
        </Button>
      </div>
    );
  } else {
    body = (
      <div className="bell-state">
        <span className="bell-state-icon" aria-hidden="true">
          <BellIcon size={24} />
        </span>
        <p className="bell-state-title">{t('notifications.emptyTitle')}</p>
        <p className="bell-state-body">{t('notifications.emptyBody')}</p>
        <Link to="/app/friends" className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>
          {t('play.invite.findFriends')}
        </Link>
      </div>
    );
  }

  return (
    <div className="nav-bell-wrap">
      <button
        ref={buttonRef}
        type="button"
        className={`nav-bell${open ? ' is-open' : ''}`}
        aria-label={label}
        title={t('notifications.title')}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => {
          // reading the list is the moment it should be current
          if (!open) refresh();
          setOpen((v) => !v);
        }}
      >
        <BellIcon size={22} />
        {unread > 0 && <span className="nav-bell-dot" aria-hidden="true" />}
      </button>

      {/*
        Drawn at the end of <body> rather than inside the bar, so it is above
        everything the page and the social column draw, whatever layer the bar
        itself is on.
      */}
      {open &&
        createPortal(
          <div
            id={panelId}
            ref={panelRef}
            className="bell-panel"
            role="dialog"
            aria-labelledby={titleId}
            tabIndex={-1}
            // hangs from the bell's end of the bar: the right, or in Arabic and Soranî the left
            dir={localeDir(locale)}
            style={anchor === null ? undefined : ({ '--bell-end': `${Math.round(anchor)}px` } as React.CSSProperties)}
          >
            <header className="bell-head">
              <div className="bell-head-row">
                <h2 className="bell-title" id={titleId}>
                  {t('notifications.title')}
                </h2>
                <Link
                  to={NOTIFICATION_SETTINGS_PATH}
                  className="icon-btn"
                  aria-label={t('notifications.settings')}
                  title={t('notifications.settings')}
                  onClick={() => setOpen(false)}
                >
                  <GearIcon size={20} />
                </Link>
                <button type="button" className="icon-btn" aria-label={t('common.close')} onClick={close}>
                  <CloseIcon size={20} />
                </button>
              </div>
              {reads.unread > 0 && (
                <div className="bell-head-row bell-toolbar">
                  <span className="bell-count">{t('nav.unreadCount', { count: reads.unread })}</span>
                  <button type="button" className="bell-read-all" onClick={() => void reads.markAllRead()}>
                    <ReadAllIcon size={16} />
                    {t('notifications.markAllRead')}
                  </button>
                </div>
              )}
            </header>
            <div className="bell-body">{body}</div>
          </div>,
          document.body,
        )}
    </div>
  );
}
