import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { compactCount, gameEmblemNamed } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { ActivityEntry, FeedItem, ProfileSection, ProfileSections } from '../lib/types';
import { PROFILE_SECTIONS } from '../lib/types';
import { BookIcon, BookmarkIcon, EyeIcon, FeatherIcon, GameIcon, HeartIcon, LockIcon, RepostIcon, StatementIcon, TilesIcon, WallIcon } from '../components/icons';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { CARD_LABEL_KEY, cardKind } from '../feed/postKinds';
import { GameArt } from '../games/GameArt';
import { ProfileGridSkeleton } from '../components/skeletons';

const PAGE = 12;

/** What each tab is called, said for its icon. */
const LABEL_KEY: Record<ProfileSection, MessageKey> = {
  posts: 'profile.tab.posts',
  games: 'nav.games',
  likes: 'profile.tab.likes',
  reposts: 'repost.tab',
  saved: 'saved.title',
};

function SectionGlyph({ kind, size = 24 }: { kind: ProfileSection; size?: number }): React.JSX.Element {
  if (kind === 'posts') return <WallIcon size={size} />;
  if (kind === 'likes') return <HeartIcon size={size} />;
  if (kind === 'reposts') return <RepostIcon size={size} />;
  if (kind === 'saved') return <BookmarkIcon size={size} />;
  return <GameIcon size={size} />;
}

/** The mark a post of words wears in its corner, so a poem, a story and a saying tell apart at a glance. */
function WordsMark({ kind }: { kind: string }): React.JSX.Element | null {
  if (kind === 'poem') return <FeatherIcon size={16} />;
  if (kind === 'story') return <BookIcon size={16} />;
  if (kind === 'gotin') return <StatementIcon size={16} />;
  return null;
}

/** "3 Sep" / "3 Sep 2024": a year only when it is not this one. */
function when(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

/**
 * What someone has posted, played, liked, reposted and saved, as a row of icon tabs over a grid of tiles. The tabs stay
 * under the top bar while the grid scrolls, and a line slides under the open one. Tabs come from the profile's
 * `sections`, so hidden ones never appear to others; the owner sees every tab, a hidden one marked with a lock. Each tab
 * fetches when first opened, and the grid asks for more as its end comes into view.
 */
export function ProfileActivity({
  userId,
  sections,
  own = false,
}: {
  userId: string;
  sections?: ProfileSections | null;
  /** viewing your own profile: show hidden sections too, marked */
  own?: boolean;
}): React.JSX.Element | null {
  const t = useT();
  const shown = PROFILE_SECTIONS.filter((s) => own || sections?.[s] !== false);
  const [tab, setTab] = useState<ProfileSection | null>(null);

  // The first visible section is open, recomputed if the owner hides the current tab.
  const active = tab && shown.includes(tab) ? tab : (shown[0] ?? null);

  if (!sections || shown.length === 0 || !active) return null;
  const at = shown.indexOf(active);

  return (
    <section className="pg" aria-label={t('profile.activityOf')}>
      <div className="pg-tabs" role="tablist" aria-label={t('profile.activityOf')} style={{ '--n': shown.length, '--at': at } as React.CSSProperties}>
        {shown.map((s) => {
          const hidden = sections[s] === false;
          return (
            <button
              key={s}
              type="button"
              role="tab"
              id={`pg-tab-${s}`}
              aria-selected={s === active}
              aria-controls={`pg-panel-${s}`}
              aria-label={hidden ? `${t(LABEL_KEY[s])}, ${t('profile.hidden')}` : t(LABEL_KEY[s])}
              title={t(LABEL_KEY[s])}
              className={`pg-tab${s === active ? ' is-active' : ''}`}
              onClick={() => setTab(s)}
            >
              <SectionGlyph kind={s} />
              {hidden && (
                <span className="pg-tab-lock" aria-hidden="true">
                  <LockIcon size={12} />
                </span>
              )}
            </button>
          );
        })}
        <span className="pg-ink" aria-hidden="true" />
      </div>

      {/* Keyed so a tab switch starts a fresh grid rather than showing the previous tab's tiles. */}
      <ActivityPanel key={active} userId={userId} kind={active} />
    </section>
  );
}

/** One tab's grid, paged: posts as tiles of their picture or words, games as tiles of their cover. */
function ActivityPanel({ userId, kind }: { userId: string; kind: ProfileSection }): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const fetching = useRef(false);
  const games = kind === 'games';

  const load = useCallback(
    async (offset: number): Promise<void> => {
      if (fetching.current) return;
      fetching.current = true;
      const res = await client.get<{ entries?: ActivityEntry[]; items?: FeedItem[] }>(`/users/${userId}/activity?kind=${kind}&limit=${PAGE}&offset=${offset}`);
      fetching.current = false;
      if (!res.ok) {
        setError(describeError(res.error, t));
        setState('error');
        return;
      }
      const rows = res.data.entries ?? [];
      const posts = res.data.items ?? [];
      setEntries((prev) => (offset === 0 ? rows : [...prev, ...rows]));
      setItems((prev) => (offset === 0 ? posts : [...prev, ...posts]));
      // a short page means the end; asking again would return nothing
      setMore((rows.length || posts.length) === PAGE);
      setState('ready');
    },
    [client, userId, kind, t],
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  const count = games ? entries.length : items.length;

  // The next page as the grid's end comes into view; where nothing can watch for that, a button asks for it.
  const end = useRef<HTMLDivElement>(null);
  const canWatch = typeof IntersectionObserver === 'function';
  useEffect(() => {
    const el = end.current;
    if (!el || !more || !canWatch) return;
    const watcher = new IntersectionObserver((seen) => {
      if (seen.some((e) => e.isIntersecting)) void load(count);
    }, { rootMargin: '0px 0px 100% 0px' });
    watcher.observe(el);
    return () => watcher.disconnect();
  }, [more, canWatch, load, count]);

  if (state === 'loading') return <ProfileGridSkeleton games={games} />;
  if (state === 'error') return <p className="muted pg-note">{error}</p>;
  if (count === 0) {
    return (
      <div className="pg-empty">
        <span className="pg-empty-mark" aria-hidden="true">
          <SectionGlyph kind={kind} size={34} />
        </span>
        <p className="pg-empty-title">{t('profile.nothingHere')}</p>
      </div>
    );
  }

  return (
    <div id={`pg-panel-${kind}`} role="tabpanel" aria-labelledby={`pg-tab-${kind}`}>
      <ul className="pg-grid">
        {games
          ? entries.map((e) => (
              <li key={e.id}>
                <GameTile entry={e} />
              </li>
            ))
          : items.map((item) => (
              <li key={item.key}>
                <PostTile item={item} />
              </li>
            ))}
      </ul>
      <div ref={end} />
      {more && !canWatch && (
        <button type="button" className="mkp-more" onClick={() => void load(count)}>
          {t('common.showMore')}
        </button>
      )}
    </div>
  );
}

/** A post as a tile: its first picture, or its title and opening words, with how often it was seen. */
function PostTile({ item }: { item: FeedItem }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const kind = cardKind(item);
  const label = CARD_LABEL_KEY[kind] ? t(CARD_LABEL_KEY[kind]!) : kind;
  const picture = item.images?.[0]?.url ?? item.imageUrl;
  const several = (item.images?.length ?? 0) > 1;
  const name = item.title || item.excerpt || label;
  return (
    <Link to={item.href} className={`pg-tile${picture ? '' : ' is-words'}${item.review === 'held' ? ' is-held' : ''}`} aria-label={`${label}: ${name}`}>
      {picture ? (
        <img className="pg-tile-img" src={picture} alt="" loading="lazy" decoding="async" />
      ) : (
        <span className="pg-tile-words" dir="auto">
          {item.title && <span className="pg-tile-title">{item.title}</span>}
          {item.excerpt && <span className="pg-tile-excerpt">{item.excerpt}</span>}
        </span>
      )}
      {several ? (
        <span className="pg-tile-mark" aria-hidden="true">
          <TilesIcon size={18} />
        </span>
      ) : !picture ? (
        <span className="pg-tile-mark is-words" aria-hidden="true">
          <WordsMark kind={kind} />
        </span>
      ) : null}
      {item.viewCount > 0 && (
        <span className="pg-tile-foot" aria-hidden="true">
          <EyeIcon size={15} />
          {compactCount(item.viewCount, locale)}
        </span>
      )}
    </Link>
  );
}

/** A game played, as its cover with the result under it. */
function GameTile({ entry }: { entry: ActivityEntry }): React.JSX.Element {
  const locale = useLocale();
  const emblem = gameEmblemNamed(entry.title);
  const date = when(entry.at, locale);
  const said = [entry.title, entry.detail, date].filter(Boolean).join(', ');
  const inner = (
    <>
      {emblem ? (
        <GameArt game={emblem} size={160} />
      ) : (
        <span className="pg-tile-glyph" aria-hidden="true">
          <GameIcon size={32} />
        </span>
      )}
      <span className="pg-tile-foot is-game" aria-hidden="true">
        <span className="pg-tile-game">{entry.detail ?? entry.title}</span>
        <time dateTime={entry.at}>{date}</time>
      </span>
    </>
  );
  return entry.href ? (
    <Link to={entry.href} className="pg-tile is-game" aria-label={said}>
      {inner}
    </Link>
  ) : (
    <div className="pg-tile is-game" role="img" aria-label={said}>
      {inner}
    </div>
  );
}
