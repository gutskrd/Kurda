import { useCallback, useEffect, useMemo, useState } from 'react';
// Soranî titles in a face made for Arabic script
import '@fontsource-variable/vazirmatn';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  CEFR_LEVELS,
  STORY_DIALECTS,
  categoryName,
  isStoryDialect,
  levelOfCefr,
  normalizeJoinCode,
  parseInvite,
  invitePath,
  storyQueryString,
  storyTextDirection,
  type CefrLevel,
  type StoryCategory,
  type StoryDialect,
  type StoryGameSummary,
  type StoryGameView,
  type StoryLibrary,
  type StoryListItem,
  type StoryQuery,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { ErrorState, EmptyState, Loading } from '../components/states';
import { SearchField } from '../components/SearchField';
import { StoryLibrarySkeleton, StoryListSkeleton } from '../components/skeletons';
import { ChevronIcon } from '../components/icons';
import { RequireAccount } from '../components/RequireAccount';
import { useLocale, usePageMeta, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { describeError } from '../lib/api';
import { dialectName } from '../learn/map';
import { LearnHeader } from '../learn/LearnHeader';
import { useDebouncedValue } from '../dictionary/useDebouncedValue';
import { STORIES_LIBRARY, gamePath, storyError } from './api';
import { useStoryList } from './catalogue';
import { CEFR_WORD_KEY, categoryNames } from './labels';
import { defaultVariety, rememberedExtraTime } from './prefs';
import { MODE_KEY, SetupSheet } from './SetupSheet';
import { StoryCard } from './StoryCard';

/** How many stories a filtered page brings, and how many more each "More" adds. */
export const PAGE = 24;

/**
 * The library (/app/learn/stories), Learn's Stories group: what there is to
 * read, and the ways in (design notes §5).
 *
 * `?id=<game>` is an invite link from before the stories moved here: the page
 * joins that game (if the join rule lets you) and opens it.
 */
export function StoriesLibrary(): React.JSX.Element {
  const [params] = useSearchParams();
  const t = useT();
  usePageMeta(t('meta.stories.title'), t('meta.stories.description'));
  const id = params.get('id');
  if (id) {
    return (
      <RequireAccount what="gate.what.playOthers">
        <OpenGame key={id} target={{ id }} />
      </RequireAccount>
    );
  }
  return (
    <div className="container learn-page story-library">
      <LearnHeader view="stories" />
      <Library />
    </div>
  );
}

/** Joining a game from a link or a code, then into it. */
function OpenGame({ target }: { target: { id: string } | { code: string } }): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    // your remembered Extra time comes with you, however you got in
    void client.post<StoryGameView>('/story-games/join', { ...target, extraTime: rememberedExtraTime() }).then((res) => {
      if (!live) return;
      if (res.ok) navigate(gamePath(res.data.id), { replace: true });
      else setError(storyError(res.error, t));
    });
    return () => {
      live = false;
    };
  }, []); // one join per link: the target is read once

  return (
    <div className="container container-narrow game-page">
      {error ? <ErrorState title={t('stories.join.failed')} message={error} /> : <Loading label={t('games.joining')} />}
      {error && (
        <p className="story-back-row">
          <Link to={STORIES_LIBRARY} className="btn btn-secondary">
            {t('stories.backToStories')}
          </Link>
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// what the page asks for

/** `GET /stories/library`, asked again when the reader signs in (their rows join the shelves) and on demand. */
function useLibrary(ready: boolean, signedIn: boolean): {
  library: StoryLibrary | null;
  error: string | null;
  reload: () => void;
  patch: (fn: (library: StoryLibrary) => StoryLibrary) => void;
} {
  const { client } = useAuth();
  const t = useT();
  const [library, setLibrary] = useState<StoryLibrary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!ready) return;
    let live = true;
    setError(null);
    void client.get<StoryLibrary>('/stories/library').then((res) => {
      if (!live) return;
      if (res.ok && Array.isArray(res.data.featured)) setLibrary(res.data);
      else if (!res.ok) setError(describeError(res.error, t));
    });
    return () => {
      live = false;
    };
  }, [client, ready, signedIn, nonce, t]);
  return {
    library,
    error,
    reload: useCallback(() => setNonce((n) => n + 1), []),
    patch: useCallback((fn) => setLibrary((l) => (l ? fn(l) : l)), []),
  };
}

/**
 * `GET /stories?…` for a search or a filter: the first page when the query
 * changes, and the next page on `more`. A page that is already on its way
 * when the query changes is let go.
 */
function useStoryResults(query: StoryQuery | null): {
  items: StoryListItem[] | null;
  total: number;
  error: string | null;
  loadingMore: boolean;
  more: () => void;
  reload: () => void;
} {
  const { client } = useAuth();
  const t = useT();
  const [state, setState] = useState<{ key: string; items: StoryListItem[] | null; total: number; error: string | null }>({
    key: '',
    items: null,
    total: 0,
    error: null,
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const [nonce, setNonce] = useState(0);
  const key = query ? storyQueryString(query) : '';

  useEffect(() => {
    if (!query) return;
    let live = true;
    setState({ key, items: null, total: 0, error: null });
    void client.get<{ stories: StoryListItem[]; total: number }>(`/stories${storyQueryString({ ...query, limit: PAGE })}`).then((res) => {
      if (!live) return;
      if (res.ok) setState({ key, items: Array.isArray(res.data.stories) ? res.data.stories : [], total: res.data.total ?? 0, error: null });
      else setState({ key, items: null, total: 0, error: describeError(res.error, t) });
    });
    return () => {
      live = false;
    };
  }, [client, key, nonce, t]); // the query is read through its string, which is what names a page

  const more = useCallback(() => {
    if (!query || !state.items || loadingMore) return;
    const have = state.items.length;
    setLoadingMore(true);
    void client.get<{ stories: StoryListItem[]; total: number }>(`/stories${storyQueryString({ ...query, limit: PAGE, offset: have })}`).then((res) => {
      setLoadingMore(false);
      if (!res.ok) return;
      setState((s) => {
        if (s.key !== key || !s.items) return s;
        const seen = new Set(s.items.map((i) => i.id));
        return { ...s, items: [...s.items, ...(res.data.stories ?? []).filter((i) => !seen.has(i.id))], total: res.data.total ?? s.total };
      });
    });
  }, [client, key, query, state.items, loadingMore]);

  return { items: state.key === key ? state.items : null, total: state.total, error: state.error, loadingMore, more, reload: useCallback(() => setNonce((n) => n + 1), []) };
}

// ---------------------------------------------------------------------------
// the filters, kept in the address so a category's shelf can be linked to

interface Filters {
  q: string;
  cefr: CefrLevel | null;
  dialect: StoryDialect | null;
  narrated: boolean;
  category: string | null;
}

function readFilters(params: URLSearchParams): Filters {
  const cefr = params.get('level');
  const dialect = params.get('dialect');
  return {
    q: params.get('q') ?? '',
    cefr: cefr && levelOfCefr(cefr) ? (cefr.toUpperCase() as CefrLevel) : null,
    dialect: isStoryDialect(dialect) ? dialect : null,
    narrated: params.get('audio') === '1',
    category: params.get('category'),
  };
}

function writeFilters(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.cefr) p.set('level', f.cefr);
  if (f.dialect) p.set('dialect', f.dialect);
  if (f.narrated) p.set('audio', '1');
  if (f.category) p.set('category', f.category);
  return p;
}

const filtering = (f: Filters): boolean => f.q.trim() !== '' || f.cefr !== null || f.dialect !== null || f.narrated || f.category !== null;

function queryOf(f: Filters): StoryQuery {
  return {
    q: f.q.trim() || undefined,
    level: f.cefr ? (levelOfCefr(f.cefr) ?? undefined) : undefined,
    dialect: f.dialect ?? undefined,
    audio: f.narrated || undefined,
    category: f.category ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// the page

function Library(): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const { client, status } = useAuth();
  const signedIn = status === 'signedIn';
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => readFilters(params), [params]);
  // what is typed waits a moment before it becomes the address and a request
  const [typed, setTyped] = useState(filters.q);
  const settled = useDebouncedValue(typed, 300);
  useEffect(() => {
    if (settled.trim() === filters.q.trim()) return;
    setParams(writeFilters({ ...filters, q: settled }), { replace: true });
  }, [settled]); // the typed words alone: the other filters change through their own chips

  const { library, error, reload, patch } = useLibrary(status !== 'restoring', signedIn);
  const active = filtering(filters);
  const results = useStoryResults(active ? queryOf(filters) : null);
  const names = useMemo(() => categoryNames(library?.categories, locale), [library?.categories, locale]);
  const [games, setGames] = useState<StoryGameSummary[]>([]);

  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    void client.get<{ games: StoryGameSummary[] }>('/story-games/active').then((r) => {
      if (live && r.ok) setGames(r.data.games ?? []);
    });
    return () => {
      live = false;
    };
  }, [client, signedIn]);

  const set = (next: Partial<Filters>): void => setParams(writeFilters({ ...filters, q: typed, ...next }), { replace: true });
  const clear = (): void => {
    setTyped('');
    setParams(new URLSearchParams(), { replace: true });
  };

  /** A bookmark toggled on any shelf: the same story everywhere follows, and the Bookmarks shelf gains or loses it. */
  const bookmarked = (story: StoryListItem, on: boolean): void =>
    patch((l) => {
      const follow = (list: StoryListItem[]): StoryListItem[] =>
        list.map((s) => (s.id === story.id && s.me ? { ...s, me: { ...s.me, bookmarked: on } } : s));
      const marked = { ...story, me: story.me ? { ...story.me, bookmarked: on } : story.me };
      const bookmarks = on
        ? l.bookmarks.some((s) => s.id === story.id)
          ? follow(l.bookmarks)
          : [marked, ...l.bookmarks]
        : l.bookmarks.filter((s) => s.id !== story.id);
      return { ...l, featured: follow(l.featured), recent: follow(l.recent), continue: follow(l.continue), bookmarks };
    });

  return (
    <>
      {signedIn && library?.me && <ProgressCard me={library.me} />}
      <FilterBar filters={filters} typed={typed} onType={setTyped} onChange={set} categories={library?.categories ?? []} />
      {!signedIn && status !== 'restoring' && <GuestLine />}

      {active ? (
        <Results filters={filters} results={results} names={names} onClear={clear} onBookmarked={bookmarked} />
      ) : error ? (
        <ErrorState title={t('stories.loadFailed')} message={error} onRetry={reload} />
      ) : !library ? (
        <StoryLibrarySkeleton label="stories.loading" />
      ) : library.total === 0 ? (
        <EmptyState title={t('stories.library.empty')} />
      ) : (
        <>
          {games.length > 0 && <UnfinishedGames games={games} />}
          <Shelf id="continue" title="stories.library.continue" stories={library.continue} names={names} onBookmarked={bookmarked} />
          <Shelf id="featured" title="stories.library.featured" stories={library.featured} names={names} onBookmarked={bookmarked} />
          <Shelf id="recent" title="stories.library.recent" stories={library.recent} names={names} onBookmarked={bookmarked} />
          <Categories categories={library.categories} onPick={(slug) => set({ category: slug })} />
          <Shelf id="bookmarks" title="stories.library.bookmarks" stories={library.bookmarks} names={names} onBookmarked={bookmarked} />
        </>
      )}

      {signedIn && <PlayRow dialect={filters.dialect ?? defaultVariety(locale)} />}
    </>
  );
}

/** "Your progress": how many stories are finished of all there are, drawn round, and the mean of the best check scores beside it. */
function ProgressCard({ me }: { me: NonNullable<StoryLibrary['me']> }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const share = me.total > 0 ? Math.min(1, me.finished / me.total) : 0;
  const r = 26;
  const c = 2 * Math.PI * r;
  const number = (n: number): string => n.toLocaleString(locale);
  return (
    <section className="story-progress-card" aria-labelledby="story-progress-title">
      <h2 className="story-section-title" id="story-progress-title">
        {t('stories.library.progressTitle')}
      </h2>
      <div className="story-progress-row">
        <p
          className="story-progress-ring-wrap"
          role="progressbar"
          aria-label={t('stories.library.finishedLabel')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(share * 100)}
          aria-valuetext={t('stories.library.finishedOf', { finished: number(me.finished), total: number(me.total) })}
        >
          <svg className="story-progress-ring" width="64" height="64" viewBox="-32 -32 64 64" aria-hidden="true" focusable="false">
            <circle className="story-progress-ring-track" r={r} />
            {share > 0 && <circle className="story-progress-ring-fill" r={r} strokeDasharray={`${c * share} ${c}`} />}
          </svg>
          <span className="story-progress-text" aria-hidden="true">
            <strong>{t('stories.library.finishedShort', { finished: number(me.finished), total: number(me.total) })}</strong>
            <span>{t('stories.library.finishedWord')}</span>
          </span>
        </p>
        <p className="story-progress-tile">
          <strong>{me.averageScore === null ? '—' : `${Math.round(me.averageScore * 100)}%`}</strong>
          <span>{me.averageScore === null ? t('stories.library.noScore') : t('stories.library.averageScore')}</span>
        </p>
      </div>
    </section>
  );
}

/** Reading is open; a shelf and a place in a story need somebody to keep them for. */
function GuestLine(): React.JSX.Element {
  const t = useT();
  const location = useLocation();
  return (
    <p className="story-guest-line">
      {t('stories.library.guest')}{' '}
      <Link to="/login" state={{ from: `${location.pathname}${location.search}` }}>
        {t('nav.login')}
      </Link>
    </p>
  );
}

/** The search field and the filter chips: a chip pressed again lets its filter go. */
function FilterBar({
  filters,
  typed,
  onType,
  onChange,
  categories,
}: {
  filters: Filters;
  typed: string;
  onType: (q: string) => void;
  onChange: (next: Partial<Filters>) => void;
  categories: readonly StoryCategory[];
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const chip = (on: boolean, label: string, onClick: () => void, title?: string): React.JSX.Element => (
    <button key={label} type="button" className={`story-chip${on ? ' is-on' : ''}`} aria-pressed={on} title={title} onClick={onClick}>
      {label}
    </button>
  );
  return (
    <section className="story-filters" aria-label={t('stories.filter.label')}>
      <SearchField
        icon
        className="story-search"
        value={typed}
        onValueChange={onType}
        aria-label={t('stories.library.searchLabel')}
        placeholder={t('stories.library.searchPlaceholder')}
        autoComplete="off"
      />
      <div className="story-chip-rows">
        <div className="story-chip-row" role="group" aria-label={t('stories.level')}>
          {CEFR_LEVELS.map((cefr) =>
            chip(filters.cefr === cefr, cefr, () => onChange({ cefr: filters.cefr === cefr ? null : cefr }), t(CEFR_WORD_KEY[cefr])),
          )}
        </div>
        <div className="story-chip-row" role="group" aria-label={t('stories.variety')}>
          {STORY_DIALECTS.map((d) => chip(filters.dialect === d, dialectName(d), () => onChange({ dialect: filters.dialect === d ? null : d })))}
          {chip(filters.narrated, t('stories.filter.narrated'), () => onChange({ narrated: !filters.narrated }))}
        </div>
        {categories.length > 0 && (
          <div className="story-chip-row" role="group" aria-label={t('stories.filter.category')}>
            {categories.map((c) =>
              chip(filters.category === c.slug, categoryName(c, locale), () => onChange({ category: filters.category === c.slug ? null : c.slug })),
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/** A filtered or searched list: a grid, a count, and More until the server has no more. */
function Results({
  filters,
  results,
  names,
  onClear,
  onBookmarked,
}: {
  filters: Filters;
  results: ReturnType<typeof useStoryResults>;
  names: ReadonlyMap<string, string>;
  onClear: () => void;
  onBookmarked: (story: StoryListItem, on: boolean) => void;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  if (results.error) return <ErrorState title={t('stories.loadFailed')} message={results.error} onRetry={results.reload} />;
  if (!results.items) return <StoryListSkeleton label="stories.loading" count={6} />;
  if (results.items.length === 0) {
    return (
      <EmptyState
        title={t('stories.library.noMatch')}
        action={
          <Button variant="secondary" onClick={onClear}>
            {t('stories.library.clearFilters')}
          </Button>
        }
      />
    );
  }
  const more = results.items.length < results.total;
  return (
    <section className="story-results" aria-labelledby="story-results-title">
      <h2 id="story-results-title" className="story-section-title story-results-title">
        {t('stories.library.found', { count: results.total.toLocaleString(locale) })}
        {filtering(filters) && (
          <button type="button" className="link-btn story-results-clear" onClick={onClear}>
            {t('stories.library.clearFilters')}
          </button>
        )}
      </h2>
      <ul className="story-grid">
        {results.items.map((s) => (
          <li key={s.id}>
            <StoryCard story={s} category={s.category ? (names.get(s.category) ?? null) : null} onBookmarked={onBookmarked} />
          </li>
        ))}
      </ul>
      {more && (
        <p className="story-more">
          <Button variant="secondary" disabled={results.loadingMore} onClick={results.more}>
            {t('stories.library.more')}
          </Button>
        </p>
      )}
    </section>
  );
}

/** One row of the library, scrolled sideways: nothing when the row has nothing (a visitor's shelves, a new library). */
function Shelf({
  id,
  title,
  stories,
  names,
  onBookmarked,
}: {
  id: string;
  title: MessageKey;
  stories: StoryListItem[];
  names: ReadonlyMap<string, string>;
  onBookmarked: (story: StoryListItem, on: boolean) => void;
}): React.JSX.Element | null {
  const t = useT();
  if (stories.length === 0) return null;
  return (
    <section className="story-shelf" aria-labelledby={`story-shelf-${id}`}>
      <h2 className="story-section-title" id={`story-shelf-${id}`}>
        {t(title)}
      </h2>
      <ul className="story-shelf-row">
        {stories.map((s) => (
          <li key={s.id}>
            <StoryCard story={s} category={s.category ? (names.get(s.category) ?? null) : null} onBookmarked={onBookmarked} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The categories as chips, each with how many stories it holds; one opens that shelf as a filtered list. */
function Categories({ categories, onPick }: { categories: Array<StoryCategory & { count: number }>; onPick: (slug: string) => void }): React.JSX.Element | null {
  const t = useT();
  const locale = useLocale();
  const filled = categories.filter((c) => c.count > 0);
  if (filled.length === 0) return null;
  return (
    <section className="story-shelf story-categories" aria-labelledby="story-shelf-categories">
      <h2 className="story-section-title" id="story-shelf-categories">
        {t('stories.library.categories')}
      </h2>
      <div className="story-chip-row">
        {filled.map((c) => (
          <button key={c.slug} type="button" className="story-chip story-chip-category" onClick={() => onPick(c.slug)}>
            {categoryName(c, locale)}
            <span className="story-chip-count" aria-hidden="true">
              {c.count.toLocaleString(locale)}
            </span>
            <span className="sr-only">{t('stories.library.categoryCount', { count: c.count })}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

const STATUS_KEY: Record<'lobby' | 'reading', MessageKey> = {
  lobby: 'stories.status.lobby',
  reading: 'stories.status.reading',
};

/** Games on a story left part-way through, to go back to. */
function UnfinishedGames({ games }: { games: StoryGameSummary[] }): React.JSX.Element {
  const t = useT();
  return (
    <section className="story-continue" aria-labelledby="story-continue-title">
      <h2 id="story-continue-title" className="story-section-title">
        {t('stories.hub.continueTitle')}
      </h2>
      <ul className="story-continue-list">
        {games.map((g) => {
          const { lang, dir } = storyTextDirection(g.dialect);
          const where =
            g.status === 'lobby' || g.status === 'reading'
              ? t(STATUS_KEY[g.status])
              : t('stories.status.question', { index: g.currentIndex + 1, total: g.total });
          return (
            <li key={g.id}>
              <Link to={gamePath(g.id)} className="story-continue-card">
                <span className="story-continue-text">
                  <span className="story-continue-title" lang={lang} dir={dir}>
                    {g.storyTitle}
                  </span>
                  <span className="story-continue-meta">
                    {t(MODE_KEY[g.mode])} · {where}
                  </span>
                </span>
                <span className="story-continue-go">
                  {t('stories.continue')}
                  <ChevronIcon size={16} className="story-chevron" />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Playing with others, at the foot of the library: set up a game on a story
 * of the variety in view, or join a friend's game with its code. A link
 * pasted in works too — it is tried first, so a whole invite link is as good
 * as the code in it. The catalogue the sheet picks from is asked for only
 * once the sheet opens.
 */
function PlayRow({ dialect }: { dialect: StoryDialect }): React.JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const { client } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState(false);
  const { stories } = useStoryList(dialect, setup);

  async function join(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    const invite = parseInvite(code);
    if (invite && invite.type !== 'stories') {
      navigate(invitePath(invite));
      return;
    }
    const normalized = invite ? null : normalizeJoinCode(code);
    if (!invite && !normalized) {
      setError(t('stories.join.invalid'));
      return;
    }
    setBusy(true);
    const res = await client.post<StoryGameView>('/story-games/join', {
      ...(invite ? { id: invite.id } : { code: normalized }),
      extraTime: rememberedExtraTime(),
    });
    setBusy(false);
    if (res.ok) navigate(gamePath(res.data.id));
    else setError(storyError(res.error, t));
  }

  return (
    <section className="story-play" aria-labelledby="story-play-title">
      <h2 id="story-play-title" className="story-section-title story-play-title">
        {t('stories.library.playTogether')}
      </h2>
      <Button variant="secondary" onClick={() => setSetup(true)}>
        {t('stories.playFriends')}
      </Button>
      <form className="story-join" onSubmit={(e) => void join(e)} noValidate>
        <label htmlFor="story-join-code" className="story-join-label">
          {t('stories.join.label')}
        </label>
        <div className="story-join-row">
          <input
            id="story-join-code"
            className="input story-join-input"
            dir="ltr"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t('stories.join.placeholder')}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            aria-describedby={error ? 'story-join-error' : undefined}
            aria-invalid={error ? true : undefined}
          />
          <Button type="submit" disabled={busy || code.trim() === ''}>
            {busy ? t('games.joining') : t('stories.join.go')}
          </Button>
        </div>
        {error && (
          <p id="story-join-error" className="story-join-error" role="alert">
            {error}
          </p>
        )}
      </form>
      {setup && stories && <SetupSheet open onClose={() => setSetup(false)} dialect={dialect} initialMode="duo" catalogue={stories} />}
    </section>
  );
}
