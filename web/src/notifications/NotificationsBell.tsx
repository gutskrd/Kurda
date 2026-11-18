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
import { lockPageScroll } from '../lib/scrollLock';
import { useRail, useRailPresent } from '../social/RailProvider';
import { NotificationList, useNotificationReads } from './NotificationList';

/** Below this the panel is a sheet that fills the screen under the bar; above it, a panel hanging from the bell. */
const PHONE = '(max-width: 560px)';

/** The notification settings page in Settings (NotificationPrefsCard). */
const NOTIFICATION_SETTINGS_PATH = '/app/settings/notifications';

/**
 * The bell at the end of the top bar, with a dot when something is new. Messages are not listed, since conversations
 * have their own place. On a wide screen the list hangs from the bell in a panel; on a phone it is a sheet under the
 * bar and the page behind holds still. Escape, a click outside or following a notification closes it and returns
 * focus to the bell; while open, Tab cycles inside it, since it is drawn at the end of the page.
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
  /** The distance from the bell's end edge to the window's, so the panel's end lines up with it. */
  const [anchor, setAnchor] = useState<number | null>(null);

  const unread = reads.unread || (data.notifications.length === 0 ? data.unread.notifications : 0);

  // Moving to another page closes the panel.
  useEffect(() => setOpen(false), [pathname]);

  const close = (): void => {
    setOpen(false);
    buttonRef.current?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!open) return;
    // The panel takes focus without scrolling, since it floats over the page and the bell stays in sight.
    panelRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus({ preventScroll: true });
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
    // On a phone the sheet covers the screen, so the page below must not scroll.
    const sheet = typeof window.matchMedia === 'function' && window.matchMedia(PHONE).matches;
    const unlock = sheet ? lockPageScroll() : null;
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
      unlock?.();
    };
  }, [open]);

  // Hang from the bell wherever the bar put it, in either direction.
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
  // A removed one leaves the list at once, and the empty state shows when the last goes.
  const items = data.notifications.filter((n) => !reads.isRemoved(n));

  let body: React.ReactNode;
  if (items.length > 0) {
    body = <NotificationList items={items} reads={reads} onFollow={() => setOpen(false)} settingsTo={NOTIFICATION_SETTINGS_PATH} />;
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
          // Refresh as the list is opened.
          if (!open) refresh();
          setOpen((v) => !v);
        }}
      >
        <BellIcon size={22} />
        {unread > 0 && <span className="nav-bell-dot" aria-hidden="true" />}
      </button>

      {/* Drawn at the end of <body> rather than in the bar, so it is above everything whatever the bar's layer. */}
      {open &&
        createPortal(
          <div
            id={panelId}
            ref={panelRef}
            className="bell-panel"
            role="dialog"
            aria-labelledby={titleId}
            tabIndex={-1}
            // Hangs from the bell's end of the bar: the right, or the left in right-to-left languages.
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
