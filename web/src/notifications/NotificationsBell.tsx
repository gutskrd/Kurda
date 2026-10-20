import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { localeDir } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { BellIcon, CloseIcon } from '../components/icons';
import { useLocale, useT } from '../i18n/I18nProvider';
import { useRail, useRailPresent } from '../social/RailProvider';
import { NotificationList } from './NotificationList';

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
 * The list opens in a panel under the bell rather than on a page of its own,
 * so reading what is new does not cost you the page you were on. Escape, a
 * click outside it, or following one of them closes it, and the focus goes
 * back to the bell.
 */
export function NotificationsBell(): React.JSX.Element | null {
  const { status } = useAuth();
  const t = useT();
  const locale = useLocale();
  const present = useRailPresent();
  const { data, refresh } = useRail();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();

  const unread = data.notifications.filter((n) => n.readAt === null).length || data.unread.notifications;

  // moving to another page puts the panel away
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    // the panel takes the focus, so a keyboard is already inside what it opened
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onDown = (e: PointerEvent): void => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  if (!present || status !== 'signedIn') return null;

  const label = unread > 0 ? t('notifications.bellUnread', { count: unread }) : t('notifications.title');

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
        Drawn at the end of <body> rather than inside the bar. The bar is
        frosted glass, and glass makes itself the frame of everything fixed
        inside it: the panel was cut off at the bar's own layer, under the
        social column, and the page showed through it.
      */}
      {open &&
        createPortal(
          <div
            id={panelId}
            ref={panelRef}
            className="bell-panel"
            role="dialog"
            aria-label={t('notifications.title')}
            tabIndex={-1}
            // the bar is drawn left to right in every language; the list is not
            dir={localeDir(locale)}
          >
            <div className="bell-panel-head">
              <h2 className="bell-panel-title">{t('notifications.title')}</h2>
              <button
                type="button"
                className="icon-btn"
                aria-label={t('common.close')}
                onClick={() => {
                  setOpen(false);
                  buttonRef.current?.focus();
                }}
              >
                <CloseIcon size={18} />
              </button>
            </div>
            <div className="bell-panel-body">
              {data.notifications.length === 0 ? (
                <div className="bell-empty">
                  <BellIcon size={28} />
                  <p className="bell-empty-title">{t('notifications.emptyTitle')}</p>
                  <p className="bell-empty-body">{t('notifications.emptyBody')}</p>
                </div>
              ) : (
                <NotificationList items={data.notifications} onActed={refresh} onFollow={() => setOpen(false)} />
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
