import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import {
  BellIcon,
  BlockIcon,
  CareIcon,
  ChatsIcon,
  CheckIcon,
  FlameIcon,
  GameIcon,
  GearIcon,
  GiftIcon,
  InviteIcon,
  MedalIcon,
  PersonGlyph,
  RemovePersonIcon,
  SafetyIcon,
  TicketIcon,
  TrashIcon,
  TrophyIcon,
  UsersIcon,
} from '../components/icons';
import {
  badgeSvg,
  gameEmblemSvg,
  isPlayGame,
  leagueEmblemSvg,
  letterEnvelopeSvg,
  noticeFiltersFor,
  noticePicture,
  noticeShows,
  type NoticeFilter,
  type NoticePicture,
} from '@kurda/shared';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { socialNotification, type NoteView } from '../reports/notifications';
import { playNotification } from '../play/notifications';
import { progressNotification } from '../ranks/notifications';
import { groupNotification } from '../groups/notifications';
import { usePlayInvites } from '../play/PlayProvider';
import { useRail } from '../social/RailProvider';
import { railEdits, type RailNotification } from '../social/useSocialRail';
import { useOptimisticSend } from '../lib/optimistic';
import { groupByTime, noteKind, noteWhen, splitAtName, type NoteGroupKey, type NoteKind } from './rows';
import { useAvatarSrc } from '../art/overrides';
import { seasonalLogo } from '../brand/season';
import { Fire } from '../components/Fire';
import { GiftBox } from '../gifts/GiftArt';
import { prefersReducedMotion } from '../lib/motion';
import { ticketToneClass, type TicketTone } from '../ui/Ticket';
import { useSwipe } from './swipe';

/**
 * Marking notifications read and removing them. Each change shows at once on the rail's copy, so the bell and every
 * count agree, and is taken back with a notice if the server refuses (lib/optimistic.ts); the server keeps them, so
 * the phone agrees.
 */
export function useNotificationReads(): {
  isUnread: (n: RailNotification) => boolean;
  unread: number;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  remove: (id: string) => Promise<void>;
} {
  const { client } = useAuth();
  const { data, adjust } = useRail();
  const sendShown = useOptimisticSend();
  const isUnread = useCallback((n: RailNotification) => n.readAt === null, []);

  const markRead = useCallback(
    async (id: string) => {
      await sendShown(() => client.post(`/me/notifications/${id}/read`), adjust(railEdits.notificationRead(id)), { goneIsDone: true });
    },
    [client, adjust, sendShown],
  );

  const markAllRead = useCallback(async () => {
    await sendShown(() => client.post('/me/notifications/read-all'), adjust(railEdits.allNotificationsRead()));
  }, [client, adjust, sendShown]);

  const remove = useCallback(
    async (id: string) => {
      // One already gone from the server is gone here too.
      await sendShown(() => client.delete(`/me/notifications/${id}`), adjust(railEdits.notificationRemoved(id)), { goneIsDone: true });
    },
    [client, adjust, sendShown],
  );

  return { isUnread, unread: data.notifications.filter(isUnread).length, markRead, markAllRead, remove };
}

const GROUP_LABEL: Record<NoteGroupKey, MessageKey> = {
  today: 'notifications.group.today',
  week: 'notifications.group.week',
  earlier: 'notifications.group.earlier',
};

const FILTER_LABEL: Record<NoticeFilter, MessageKey> = {
  all: 'notifications.filter.all',
  people: 'notifications.filter.people',
  games: 'notifications.filter.games',
  progress: 'notifications.filter.progress',
  hevalo: 'notifications.filter.hevalo',
};

const KIND_ICON: Record<NoteKind, (p: { size?: number }) => React.JSX.Element> = {
  invite: TicketIcon,
  friendRequest: TicketIcon,
  game: GameIcon,
  gift: GiftIcon,
  badge: MedalIcon,
  league: TrophyIcon,
  streak: FlameIcon,
  safety: SafetyIcon,
  care: CareIcon,
  friends: UsersIcon,
  group: ChatsIcon,
  groupOut: RemovePersonIcon,
  groupBan: BlockIcon,
  groupAsk: InviteIcon,
  notice: BellIcon,
};

/** Who a notification is from, where the app knows: a face and a name to set in bold. */
interface Actor {
  name: string;
  avatarUrl: string | null;
}

/**
 * The notifications under Today, This week and Earlier, with filters when there is more than one kind. Each row shows
 * who it is from with a glyph for the kind, what happened and when, and a picture of what it is about. New rows are
 * lighter with a dot. The wording comes from the reports, play, ranks and groups notification modules; opening a row
 * marks it read, and invites and gifts show their one action.
 *
 * Swiping a row reveals the notification settings and a remove button, and a long swipe removes it at once; with a
 * mouse or keyboard the same two are buttons at the row's end.
 */
export function NotificationList({
  items,
  reads,
  onFollow,
  settingsTo,
}: {
  items: RailNotification[];
  reads: Pick<ReturnType<typeof useNotificationReads>, 'isUnread' | 'markRead' | 'remove'>;
  /** Called when one is followed to its page, so the holder can close. */
  onFollow?: () => void;
  /** The notification settings page, for each row's link there. */
  settingsTo: string;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const base = useId();
  // Who sent each game invite, while the app still has it.
  const incoming = usePlayInvites().lists?.incoming;
  // Who sent a gift or a letter: the server gives an id, and the sender is almost always a friend.
  const { data } = useRail();
  const people = [...data.friends, ...data.requests];
  const [filter, setFilter] = useState<NoticeFilter>('all');
  // One row open at a time.
  const [open, setOpen] = useState<string | null>(null);
  // Rows being removed, animated out before they leave the list.
  const [leaving, setLeaving] = useState<Set<string>>(() => new Set());

  const filters = noticeFiltersFor(items);
  // A filter whose last notification was removed falls back to all.
  const current = filters.includes(filter) ? filter : 'all';
  const shown = items.filter((n) => noticeShows(n, current));

  const actorOf = (n: RailNotification): Actor | null => {
    const kind = n.data?.kind;
    if (kind === 'play_invite') {
      const invite = incoming?.find((i) => i.id === n.data?.inviteId);
      return invite ? { name: invite.from.name, avatarUrl: invite.from.avatarUrl } : null;
    }
    if ((kind === 'gift' || kind === 'letter') && typeof n.data?.fromUserId === 'string') {
      const who = people.find((p) => p.userId === n.data?.fromUserId);
      return who ? { name: who.displayName || who.username, avatarUrl: who.avatarUrl } : null;
    }
    return null;
  };

  const takeAway = (id: string): void => {
    setOpen(null);
    setLeaving((prev) => new Set(prev).add(id));
    // The row slides out and closes up first, unless Reduce Motion is on; one the server keeps comes back whole.
    const settle = (): void =>
      setLeaving((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    window.setTimeout(() => void reads.remove(id).then(settle), prefersReducedMotion() ? 0 : 280);
  };

  const groups = groupByTime(shown);
  const shortDate = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
  let index = 0;

  return (
    <div className="note-groups">
      {filters.length > 2 && (
        <div className="note-filters" role="group" aria-label={t('notifications.filter.label')}>
          {filters.map((f) => (
            <button key={f} type="button" className={`note-filter${f === current ? ' is-on' : ''}`} aria-pressed={f === current} onClick={() => setFilter(f)}>
              {t(FILTER_LABEL[f])}
            </button>
          ))}
        </div>
      )}
      {groups.map((group) => (
        <section key={`${current}-${group.key}`} className="note-group" aria-labelledby={`${base}-${group.key}`}>
          <h3 className="note-group-title" id={`${base}-${group.key}`}>
            {t(GROUP_LABEL[group.key])}
          </h3>
          <ul className="note-list">
            {group.items.map((n) => {
              const actor = actorOf(n);
              const view: NoteView | null =
                socialNotification(n, t, locale) ?? playNotification(n, t, incoming) ?? progressNotification(n, t) ?? groupNotification(n, t, locale);
              // A gift from somebody the app can name says who it is from.
              const title = n.data?.kind === 'gift' && actor ? t('gift.fromLabel', { name: actor.name }) : (view?.title ?? n.title);
              const when = noteWhen(n.createdAt, group.key, t, shortDate);
              return (
                <NoteRow
                  key={n.id}
                  order={index++}
                  note={n}
                  kind={noteKind(n)}
                  actor={actor}
                  picture={noticePicture(n)}
                  title={title}
                  body={view ? view.body : n.body}
                  to={view?.to}
                  href={view?.href}
                  when={when}
                  unread={reads.isUnread(n)}
                  open={open === n.id}
                  leaving={leaving.has(n.id)}
                  settingsTo={settingsTo}
                  onOpen={(on) => setOpen(on ? n.id : null)}
                  onRead={() => void reads.markRead(n.id)}
                  onRemove={() => takeAway(n.id)}
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
  order,
  note,
  kind,
  actor,
  picture,
  title,
  body,
  to,
  href,
  when,
  unread,
  open,
  leaving,
  settingsTo,
  onOpen,
  onRead,
  onRemove,
  onFollow,
}: {
  order: number;
  note: RailNotification;
  kind: NoteKind;
  actor: Actor | null;
  picture: NoticePicture | null;
  title: string;
  body: string | null;
  to?: string;
  href?: string;
  when: string;
  unread: boolean;
  open: boolean;
  leaving: boolean;
  settingsTo: string;
  onOpen: (open: boolean) => void;
  onRead: () => void;
  onRemove: () => void;
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
  // The row's one action, where there is one; the whole row links there.
  const act = to && (kind === 'invite' || kind === 'game') ? t('play.banner.join') : to && kind === 'gift' ? t('gift.open') : null;
  const linked = Boolean(to || href);
  const row = useRef<HTMLLIElement>(null);
  const { slide, handlers, dragging } = useSwipe(open, onOpen, onRemove, row);

  // A row being removed holds its height briefly, then closes up so the rows below rise into place.
  useEffect(() => {
    const el = row.current;
    if (!leaving || !el) return;
    el.style.height = `${el.offsetHeight}px`;
    void el.offsetHeight;
    el.classList.add('is-closing');
  }, [leaving]);

  const link = to ? (
    <Link to={to} className="note-link" onClick={onFollow}>
      {words}
    </Link>
  ) : href ? (
    <a href={href} className="note-link" target="_blank" rel="noopener noreferrer" onClick={onFollow}>
      {words}
    </a>
  ) : (
    words
  );

  return (
    <li
      ref={row}
      className={`note-row${unread ? ' is-unread' : ''}${linked ? ' is-linked' : ''}${open ? ' is-open' : ''}${leaving ? ' is-leaving' : ''}`}
      style={{ '--i': Math.min(order, 10) } as React.CSSProperties}
    >
      {/* What a swipe reveals under the row: the settings and the remove button. */}
      <div className="note-under" aria-hidden={!open}>
        <Link to={settingsTo} className="note-under-btn note-under-settings" tabIndex={open ? 0 : -1} onClick={onFollow}>
          <GearIcon size={18} />
          {t('nav.settings')}
        </Link>
        <button type="button" className="note-under-btn note-under-delete" tabIndex={open ? 0 : -1} onClick={onRemove}>
          <TrashIcon size={18} />
          {t('notifications.delete')}
        </button>
      </div>
      <div className={`note-slide${dragging ? ' is-dragging' : ''}`} style={slide} {...handlers}>
        {unread && <span className="note-new" aria-hidden="true" />}
        <NoteFace kind={kind} actor={actor} tone={noteTone(note, kind)} />
        <div className="note-main">
          <p className="note-text">
            {link}
            <time className="note-when" dateTime={note.createdAt}>
              {when}
            </time>
          </p>
          {body && <p className="note-body">{body}</p>}
          {/* Drawn as a button, but the row's link does the work, so the keyboard has one stop. */}
          {act && (
            <span className="note-act" aria-hidden="true">
              {act}
            </span>
          )}
        </div>
        {picture && <NotePicture picture={picture} />}
        {/* For mouse and keyboard, the same actions a swipe reveals. */}
        <div className="note-tools">
          {unread && (
            <button type="button" className="note-tool" aria-label={t('notifications.markReadWhat', { what: title })} title={t('notifications.markRead')} onClick={onRead}>
              <CheckIcon size={16} />
            </button>
          )}
          <button type="button" className="note-tool" aria-label={t('notifications.deleteWhat', { what: title })} title={t('notifications.delete')} onClick={onRemove}>
            <TrashIcon size={16} />
          </button>
        </div>
      </div>
    </li>
  );
}

/** An invitation's ticket colour: the game's for a game invite, the heart's for a friend request. */
function noteTone(note: RailNotification, kind: NoteKind): TicketTone | null {
  if (kind === 'friendRequest') return 'friend';
  if (kind === 'invite' && isPlayGame(note.data?.game)) return note.data.game;
  return null;
}

/** The sender's face, or Hevalo's mark for news from Hevalo, with the kind on its corner. */
function NoteFace({ kind, actor, tone }: { kind: NoteKind; actor: Actor | null; tone: TicketTone | null }): React.JSX.Element {
  const Glyph = KIND_ICON[kind];
  const face = useAvatarSrc(actor?.avatarUrl);
  const toned = tone ? ` is-ticket ${ticketToneClass(tone)}` : '';
  return (
    <span className="note-face" aria-hidden="true">
      {actor ? (
        <span className="note-avatar">{face ? <img src={face} alt="" loading="lazy" /> : <PersonGlyph size={22} />}</span>
      ) : (
        <span className="note-avatar note-hevalo">
          <img src={seasonalLogo()} alt="" loading="lazy" />
        </span>
      )}
      <span className={`note-badge${toned}`}>
        <Glyph size={12} />
      </span>
    </span>
  );
}

/** What a notification is about, drawn small at the end of its row. */
function NotePicture({ picture }: { picture: NoticePicture }): React.JSX.Element {
  const id = `np${useId().replace(/[^A-Za-z0-9]/g, '')}`;
  const svg = useMemo(() => {
    switch (picture.kind) {
      case 'badge':
        return badgeSvg({ key: picture.key as Parameters<typeof badgeSvg>[0]['key'], tier: picture.tier, size: 88, idPrefix: id });
      case 'league':
        return leagueEmblemSvg({ tier: picture.tier, size: 88, idPrefix: id });
      case 'game':
        return gameEmblemSvg({ game: picture.game, size: 88, idPrefix: id });
      case 'letter':
        return letterEnvelopeSvg({ size: 88, idPrefix: id });
      default:
        return null;
    }
  }, [picture, id]);
  return (
    <span className={`note-picture note-picture--${picture.kind}`} aria-hidden="true">
      {svg ? (
        <span className="note-picture-art" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : picture.kind === 'gift' ? (
        <GiftBox tier="rare" size={34} />
      ) : (
        <Fire size={32} level={{ stage: 'campfire', growth: 0.5 }} still />
      )}
    </span>
  );
}
