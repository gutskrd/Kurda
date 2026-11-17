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
import type { RailNotification } from '../social/useSocialRail';
import { groupByTime, noteKind, noteWhen, splitAtName, type NoteGroupKey, type NoteKind } from './rows';
import { useAvatarSrc } from '../art/overrides';
import { seasonalLogo } from '../brand/season';
import { Fire } from '../components/Fire';
import { GiftBox } from '../gifts/GiftArt';
import { prefersReducedMotion } from '../lib/motion';
import { ticketToneClass, type TicketTone } from '../ui/Ticket';
import { useSwipe } from './swipe';

/**
 * Which notifications are still new, which have been taken away, and the
 * ways to be done with them.
 *
 * Marking one read, or all of them, and taking one away are said to the
 * server and shown at once: the list does not wait for the next poll to stop
 * calling something new that you have just seen, or to stop showing one you
 * have just taken away. Read is kept on the server, so a phone and a browser
 * agree on it; one taken away is gone from both.
 */
export function useNotificationReads(
  items: readonly RailNotification[],
  onActed: () => void,
): {
  isUnread: (n: RailNotification) => boolean;
  isRemoved: (n: RailNotification) => boolean;
  unread: number;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  remove: (id: string) => Promise<void>;
} {
  const { client } = useAuth();
  const [read, setRead] = useState<Set<string>>(() => new Set());
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const isUnread = useCallback((n: RailNotification) => n.readAt === null && !read.has(n.id), [read]);
  const isRemoved = useCallback((n: RailNotification) => removed.has(n.id), [removed]);

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

  const remove = useCallback(
    async (id: string) => {
      setRemoved((prev) => new Set(prev).add(id));
      const res = await client.delete(`/me/notifications/${id}`);
      // one that did not go (and was not already gone) comes back, rather than seeming gone until the next look
      if (!res.ok && res.error.status !== 404) {
        setRemoved((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
      onActed();
    },
    [client, onActed],
  );

  const live = items.filter((n) => !removed.has(n.id));
  return { isUnread, isRemoved, unread: live.filter(isUnread).length, markRead, markAllRead, remove };
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
 * The notifications, under Today, This week and Earlier, with a row of
 * filters over them when there is more than one kind to choose between.
 *
 * Each row says who it is from on the one side — their face, or Hevalo's own
 * mark for news from Hevalo, with a small glyph on its corner for the kind —
 * what happened in the reader's own words with the time after it, and on the
 * other side a picture of what it is about where there is one: the badge, the
 * league, the game, the letter, the gift, the streak's fire. A new one is
 * washed a little lighter and has a dot at its start. The kinds are said in
 * reports/notifications.ts, play/notifications.ts, ranks/notifications.ts and
 * groups/notifications.ts; one that has a page opens it, and opening it
 * counts as reading it. A game invite and a gift show the one thing to do
 * about them.
 *
 * Pulled sideways by a finger, a row slides open on the notification
 * settings and the way to take it away, and pulled far enough it goes at
 * once; with a mouse or a keyboard the same two are buttons at its end.
 */
export function NotificationList({
  items,
  reads,
  onFollow,
  settingsTo,
}: {
  items: RailNotification[];
  reads: Pick<ReturnType<typeof useNotificationReads>, 'isUnread' | 'isRemoved' | 'markRead' | 'remove'>;
  /** called when one is followed to its page, so whatever holds the list can close */
  onFollow?: () => void;
  /** where the notification settings are, for a row's own way there */
  settingsTo: string;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const base = useId();
  // who sent a game invite, in the reader's words, while the app still has it
  const incoming = usePlayInvites().lists?.incoming;
  // who sent a gift or a letter: the server names them by id, and they are almost always a friend
  const { data } = useRail();
  const people = [...data.friends, ...data.requests];
  const [filter, setFilter] = useState<NoticeFilter>('all');
  // one row open at a time, as a finger leaves it
  const [open, setOpen] = useState<string | null>(null);
  // the rows on their way out, drawn going before they are gone from the list
  const [leaving, setLeaving] = useState<Set<string>>(() => new Set());

  const live = items.filter((n) => !reads.isRemoved(n));
  const filters = noticeFiltersFor(live);
  // a filter whose last notification was taken away falls back to everything
  const current = filters.includes(filter) ? filter : 'all';
  const shown = live.filter((n) => noticeShows(n, current));

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
    // the row slides out and closes up first, unless motion is to be kept still
    window.setTimeout(() => void reads.remove(id), prefersReducedMotion() ? 0 : 280);
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
              // a gift from somebody the app can name says who it is from
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
  // the one thing to do about it, where there is one; the whole row goes there
  const act = to && (kind === 'invite' || kind === 'game') ? t('play.banner.join') : to && kind === 'gift' ? t('gift.open') : null;
  const linked = Boolean(to || href);
  const row = useRef<HTMLLIElement>(null);
  const { slide, handlers, dragging } = useSwipe(open, onOpen, onRemove, row);

  // a row on its way out holds its height for a moment and then closes up, so the rows under it rise into its place
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
      {/* what a finger finds under the row as it is pulled aside: the settings, and taking it away */}
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
          {/* drawn as a button, and the row's own link is what it does: one stop for a keyboard, not two */}
          {act && (
            <span className="note-act" aria-hidden="true">
              {act}
            </span>
          )}
        </div>
        {picture && <NotePicture picture={picture} />}
        {/* with a mouse or a keyboard, the same things a finger finds by pulling the row aside */}
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

/** An invitation's colour, as its ticket wears it: the game's for a game invite, a heart's for a friend request. */
function noteTone(note: RailNotification, kind: NoteKind): TicketTone | null {
  if (kind === 'friendRequest') return 'friend';
  if (kind === 'invite' && isPlayGame(note.data?.game)) return note.data.game;
  return null;
}

/** The face of whoever it is from, or Hevalo's own mark for news from Hevalo, with the kind on its corner. */
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
