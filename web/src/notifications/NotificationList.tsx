import { useCallback, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import {
  BellIcon,
  CareIcon,
  FlameIcon,
  GameIcon,
  GiftIcon,
  MedalIcon,
  PersonGlyph,
  SafetyIcon,
  TrophyIcon,
  UsersIcon,
} from '../components/icons';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { socialNotification, type NoteView } from '../reports/notifications';
import { playNotification } from '../play/notifications';
import { progressNotification } from '../ranks/notifications';
import { usePlayInvites } from '../play/PlayProvider';
import { useRail } from '../social/RailProvider';
import { lastSeen } from '../social/time';
import type { RailNotification } from '../social/useSocialRail';
import { groupByTime, noteKind, splitAtName, type NoteGroupKey, type NoteKind } from './rows';

/**
 * Which notifications are still new, and the two ways to be done with them.
 *
 * Marking one read, or all of them, is said to the server and shown at once:
 * the list does not wait for the next poll to stop calling something new that
 * you have just seen. There is no separate "dismissed" state — read is the one
 * thing kept, so a phone and a browser agree on it.
 */
export function useNotificationReads(
  items: readonly RailNotification[],
  onActed: () => void,
): {
  isUnread: (n: RailNotification) => boolean;
  unread: number;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
} {
  const { client } = useAuth();
  const [read, setRead] = useState<Set<string>>(() => new Set());
  const isUnread = useCallback((n: RailNotification) => n.readAt === null && !read.has(n.id), [read]);

  const markRead = useCallback(
    async (id: string) => {
      setRead((prev) => new Set(prev).add(id));
      await client.post(`/me/notifications/${id}/read`);
      onActed();
    },
    [client, onActed],
  );

  const markAllRead = useCallback(async () => {
    setRead(new Set(items.map((n) => n.id)));
    await client.post('/me/notifications/read-all');
    onActed();
  }, [client, items, onActed]);

  return { isUnread, unread: items.filter(isUnread).length, markRead, markAllRead };
}

const GROUP_LABEL: Record<NoteGroupKey, MessageKey> = {
  today: 'notifications.group.today',
  week: 'notifications.group.week',
  earlier: 'notifications.group.earlier',
};

const KIND_ICON: Record<NoteKind, (p: { size?: number }) => React.JSX.Element> = {
  game: GameIcon,
  gift: GiftIcon,
  badge: MedalIcon,
  league: TrophyIcon,
  streak: FlameIcon,
  safety: SafetyIcon,
  care: CareIcon,
  friends: UsersIcon,
  notice: BellIcon,
};

/** Who a notification is from, where the app knows: a face and a name to set in bold. */
interface Actor {
  name: string;
  avatarUrl: string | null;
}

/**
 * The notifications, under Today, This week and Earlier.
 *
 * Each says what happened in the reader's own words, with the person it is
 * from in bold and their face beside it — a small glyph on its corner says
 * what kind of thing it is — or, for news from Hevalo itself, the glyph alone.
 * The kinds are said in reports/notifications.ts, play/notifications.ts and
 * ranks/notifications.ts; one that has a page opens it, and opening it counts
 * as reading it. A game invite and a gift show the one thing to do about them.
 */
export function NotificationList({
  items,
  reads,
  onFollow,
}: {
  items: RailNotification[];
  reads: Pick<ReturnType<typeof useNotificationReads>, 'isUnread' | 'markRead'>;
  /** called when one is followed to its page, so whatever holds the list can close */
  onFollow?: () => void;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const base = useId();
  // who sent a game invite, in the reader's words, while the app still has it
  const incoming = usePlayInvites().lists?.incoming;
  // who sent a gift: the server names them by id, and they are almost always a friend
  const { data } = useRail();
  const people = [...data.friends, ...data.requests];

  const actorOf = (n: RailNotification): Actor | null => {
    const kind = n.data?.kind;
    if (kind === 'play_invite') {
      const invite = incoming?.find((i) => i.id === n.data?.inviteId);
      return invite ? { name: invite.from.name, avatarUrl: invite.from.avatarUrl } : null;
    }
    if (kind === 'gift' && typeof n.data?.fromUserId === 'string') {
      const who = people.find((p) => p.userId === n.data?.fromUserId);
      return who ? { name: who.displayName || who.username, avatarUrl: who.avatarUrl } : null;
    }
    return null;
  };

  const groups = groupByTime(items);
  const shortDate = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });

  return (
    <div className="note-groups">
      {groups.map((group) => (
        <section key={group.key} className="note-group" aria-labelledby={`${base}-${group.key}`}>
          <h3 className="note-group-title" id={`${base}-${group.key}`}>
            {t(GROUP_LABEL[group.key])}
          </h3>
          <ul className="note-list">
            {group.items.map((n) => {
              const actor = actorOf(n);
              const view: NoteView | null =
                socialNotification(n, t, locale) ?? playNotification(n, t, incoming) ?? progressNotification(n, t);
              // a gift from somebody the app can name says who it is from
              const title = n.data?.kind === 'gift' && actor ? t('gift.fromLabel', { name: actor.name }) : (view?.title ?? n.title);
              const when =
                group.key === 'earlier' && !Number.isNaN(Date.parse(n.createdAt))
                  ? shortDate.format(new Date(n.createdAt))
                  : lastSeen(n.createdAt, t);
              return (
                <NoteRow
                  key={n.id}
                  note={n}
                  kind={noteKind(n)}
                  actor={actor}
                  title={title}
                  body={view ? view.body : n.body}
                  to={view?.to}
                  href={view?.href}
                  when={when}
                  unread={reads.isUnread(n)}
                  onRead={() => void reads.markRead(n.id)}
                  onFollow={() => {
                    if (reads.isUnread(n)) void reads.markRead(n.id);
                    onFollow?.();
                  }}
                />
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function NoteRow({
  note,
  kind,
  actor,
  title,
  body,
  to,
  href,
  when,
  unread,
  onRead,
  onFollow,
}: {
  note: RailNotification;
  kind: NoteKind;
  actor: Actor | null;
  title: string;
  body: string | null;
  to?: string;
  href?: string;
  when: string;
  unread: boolean;
  onRead: () => void;
  onFollow: () => void;
}): React.JSX.Element {
  const t = useT();
  const parts = splitAtName(title, actor?.name);
  const words = parts ? (
    <>
      {parts[0]}
      <strong>{parts[1]}</strong>
      {parts[2]}
    </>
  ) : (
    title
  );
  // the one thing to do about it, where there is one; the whole row goes there
  const act = to && kind === 'game' ? t('play.banner.join') : to && kind === 'gift' ? t('gift.open') : null;
  const linked = Boolean(to || href);

  return (
    <li className={`note-row${unread ? ' is-unread' : ''}${linked ? ' is-linked' : ''}`}>
      <NoteFace kind={kind} actor={actor} />
      <div className="note-main">
        <p className="note-text">
          {to ? (
            <Link to={to} className="note-link" onClick={onFollow}>
              {words}
            </Link>
          ) : href ? (
            <a href={href} className="note-link" target="_blank" rel="noopener noreferrer" onClick={onFollow}>
              {words}
            </a>
          ) : (
            words
          )}
        </p>
        {body && <p className="note-body">{body}</p>}
        <p className="note-meta">
          <time dateTime={note.createdAt}>{when}</time>
        </p>
        {/* drawn as a button, and the row's own link is what it does: one stop for a keyboard, not two */}
        {act && (
          <span className="note-act" aria-hidden="true">
            {act}
          </span>
        )}
      </div>
      {unread && (
        <button
          type="button"
          className="note-read"
          aria-label={t('notifications.markReadWhat', { what: title })}
          title={t('notifications.markRead')}
          onClick={onRead}
        >
          <span className="note-dot" />
        </button>
      )}
    </li>
  );
}

/** The face of whoever it is from with the kind on its corner, or the kind alone for news from Hevalo. */
function NoteFace({ kind, actor }: { kind: NoteKind; actor: Actor | null }): React.JSX.Element {
  const Glyph = KIND_ICON[kind];
  if (actor) {
    return (
      <span className="note-face" aria-hidden="true">
        <span className="note-avatar">
          {actor.avatarUrl ? <img src={actor.avatarUrl} alt="" loading="lazy" /> : <PersonGlyph size={22} />}
        </span>
        <span className="note-badge">
          <Glyph size={12} />
        </span>
      </span>
    );
  }
  return (
    <span className="note-face" aria-hidden="true">
      <span className="note-avatar note-tile">
        <Glyph size={20} />
      </span>
    </span>
  );
}
