import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { CloseIcon } from '../components/icons';
import { useLocale, useT } from '../i18n/I18nProvider';
import { socialNotification, type NoteView } from '../reports/notifications';
import { playNotification } from '../play/notifications';
import { progressNotification } from '../ranks/notifications';
import { usePlayInvites } from '../play/PlayProvider';
import { lastSeen } from '../social/time';
import type { RailNotification } from '../social/useSocialRail';

/**
 * The notifications, and a way to be done with them.
 *
 * A notification you have read but cannot clear is a badge that never goes
 * away, so each one can be dismissed and the whole list can be cleared at once.
 * Dismissing marks it read on the server — there is no separate "ignored"
 * state, and inventing one would mean a second thing to keep in step.
 *
 * Each kind is said in the reader's own words and opens the page that has the
 * rest of it where there is one (reports/notifications.ts,
 * play/notifications.ts, ranks/notifications.ts); following it counts as
 * reading it.
 */
export function NotificationList({
  items,
  onActed,
  onFollow,
}: {
  items: RailNotification[];
  onActed: () => void;
  /** called when one is followed to its page, so whatever holds the list can close */
  onFollow?: () => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const locale = useLocale();
  const [going, setGoing] = useState<Set<string>>(new Set());
  const unread = items.filter((n) => n.readAt === null && !going.has(n.id)).length;
  // who sent a game invite, in the reader's words, while the app still has it
  const incoming = usePlayInvites().lists?.incoming;

  async function dismiss(id: string): Promise<void> {
    setGoing((prev) => new Set(prev).add(id));
    await client.post(`/me/notifications/${id}/read`);
    onActed();
  }

  async function dismissAll(): Promise<void> {
    setGoing(new Set(items.map((n) => n.id)));
    await client.post('/me/notifications/read-all');
    onActed();
  }

  const follow = (n: RailNotification): void => {
    if (n.readAt === null) void dismiss(n.id);
    onFollow?.();
  };

  return (
    <>
      {unread > 1 && (
        <div className="note-list-head">
          <button type="button" className="rail-note-clear" onClick={() => void dismissAll()}>
            {t('rail.dismissAll')}
          </button>
        </div>
      )}
      <ul className="note-list">
        {items.map((n) => {
          const view: NoteView | null =
            socialNotification(n, t, locale) ?? playNotification(n, t, incoming) ?? progressNotification(n, t);
          const title = view?.title ?? n.title;
          const body = view ? view.body : n.body;
          const isUnread = n.readAt === null && !going.has(n.id);
          return (
            <li key={n.id} className={`rail-note${isUnread ? ' is-unread' : ''}`}>
              <span className="rail-note-title">
                {view?.to ? (
                  <Link to={view.to} className="rail-note-link" onClick={() => follow(n)}>
                    {title}
                  </Link>
                ) : view?.href ? (
                  <a href={view.href} className="rail-note-link" target="_blank" rel="noopener noreferrer" onClick={() => follow(n)}>
                    {title}
                  </a>
                ) : (
                  title
                )}
              </span>
              {body && <span className="rail-note-body">{body}</span>}
              <span className="rail-note-foot">
                <time className="rail-note-when" dateTime={n.createdAt}>{lastSeen(n.createdAt, t)}</time>
                {isUnread && (
                  <button
                    type="button"
                    className="rail-note-dismiss"
                    aria-label={t('rail.dismissWhat', { what: title })}
                    onClick={() => void dismiss(n.id)}
                  >
                    <CloseIcon size={14} />
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
