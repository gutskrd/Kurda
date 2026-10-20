import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { useApiGet } from '../lib/useApi';
import type { SuggestedFriend, UserSummary } from '../lib/types';
import type { SearchResult } from '../dictionary/types';
import { useDebouncedValue } from '../dictionary/useDebouncedValue';
import { EntryView } from '../dictionary/EntryView';
import { SourceLine } from '../dictionary/SourceLine';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { EmptyState, ErrorState } from '../components/states';
import { FriendListSkeleton } from '../components/skeletons';
import { ChevronIcon, CloseIcon, DictionaryIcon, SearchIcon, TrophyIcon, UsersIcon } from '../components/icons';
import { useProfileModal } from '../profile/ProfileModal';
import { useLocale, useT } from '../i18n/I18nProvider';
import { publishedDictionary } from '../layouts/navLinks';
import { addRecentSearch, clearRecentSearches, readRecentSearches } from '../search/recentSearches';

/**
 * What a search looks through. People and words are what the API can search
 * (GET /users/search, GET /dictionary/search); posts have no search of their
 * own yet, so there is no chip promising one.
 */
type Scope = 'people' | 'words';
const SCOPES: readonly Scope[] = ['people', 'words'];
const asScope = (v: string | null): Scope => (v === 'words' ? 'words' : 'people');

/** The people search takes at most thirty characters; the server refuses more. */
const PEOPLE_MAX = 30;

/**
 * Search (/app/search): every result for people and words, from one field.
 *
 * The everyday way to search is the field in the bar (search/NavSearch.tsx),
 * which shows a few of each as you type; its "See all results" lands here.
 * The field is the page's first thing and stays pinned while results scroll
 * under it. What is typed, which kind is being searched and the word open
 * live in the address, so a search can be shared, reloaded and gone back to.
 *
 * With nothing typed it is not a blank page: the searches made on this visit,
 * people you may know, and the ways into the dictionary and the rankings.
 *
 * Both searches need an account. A visitor without one is not shown a field
 * that cannot answer: words are looked up in the published dictionary, which
 * is open to everyone, and finding people says what an account is for.
 */
export function Search(): React.JSX.Element {
  const t = useT();
  const { status } = useAuth();
  const [params, setParams] = useSearchParams();
  const scope = asScope(params.get('type'));
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [recents, setRecents] = useState<string[]>(readRecentSearches);
  // the word open, from the address, so a word from the bar's search opens here and Back closes it
  const entry = params.get('entry');
  const debounced = useDebouncedValue(query.trim(), 300);
  const field = useRef<HTMLInputElement>(null);
  const signedIn = status === 'signedIn';

  /*
   * The address and the field follow each other, each only when the other has
   * actually moved.
   *
   * What is typed goes into the address once typing settles, without a history
   * entry per letter. A search started somewhere else — the field in the bar,
   * while this page is open — arrives as a new address, and the field takes it
   * up, so the page shows what was asked rather than what it was showing.
   */
  const asked = params.get('q') ?? '';
  const settled = useRef(debounced);
  useEffect(() => {
    if (debounced === settled.current) return;
    settled.current = debounced;
    if (debounced === asked) return;
    const next = new URLSearchParams(params);
    if (debounced) next.set('q', debounced);
    else next.delete('q');
    setParams(next, { replace: true });
  }, [debounced, asked, params, setParams]);
  const seen = useRef(asked);
  useEffect(() => {
    if (asked === seen.current) return;
    seen.current = asked;
    if (asked !== debounced) setQuery(asked);
  }, [asked, debounced]);

  const setEntry = (id: string | null): void => {
    const p = new URLSearchParams(params);
    if (id) p.set('entry', id);
    else p.delete('entry');
    // opening a word is a step Back can undo; closing one goes back to the list without adding one
    setParams(p, { replace: !id });
  };

  const choose = (next: Scope): void => {
    const p = new URLSearchParams(params);
    if (next === 'people') p.delete('type');
    else p.set('type', next);
    p.delete('entry');
    setParams(p, { replace: true });
  };

  const remember = (term: string): void => setRecents(addRecentSearch(term));

  const clear = (): void => {
    setQuery('');
    field.current?.focus();
  };

  if (entry && signedIn) {
    return (
      <div className="container container-narrow search-page">
        <button type="button" className="btn btn-ghost btn-sm search-back" onClick={() => setEntry(null)}>
          <ChevronIcon size={16} className="back-chevron" />
          {t('dictionary.backToSearch')}
        </button>
        <EntryView entryId={entry} onOpenEntry={(id) => setEntry(id)} />
        <SourceLine />
      </div>
    );
  }

  return (
    <div className="container container-narrow search-page">
      <h1 className="page-title search-title">{t('nav.search')}</h1>

      <div className="search-bar">
        <form
          role="search"
          className="search-field"
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim()) remember(query);
          }}
        >
          <label htmlFor="search-q" className="sr-only">
            {t('search.label')}
          </label>
          <SearchIcon size={20} className="search-field-icon" />
          <input
            id="search-q"
            ref={field}
            className="input search-input"
            type="search"
            value={query}
            maxLength={scope === 'people' ? PEOPLE_MAX : 100}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={scope === 'people' ? t('friends.searchPlaceholder') : t('dictionary.searchPlaceholder')}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
          />
          {query && (
            <button type="button" className="search-clear" onClick={clear} aria-label={t('search.clear')}>
              <CloseIcon size={16} />
            </button>
          )}
        </form>
        <div className="search-scopes" role="group" aria-label={t('search.scopeLabel')}>
          {SCOPES.map((s) => (
            <button
              key={s}
              type="button"
              className={`chip${scope === s ? ' active' : ''}`}
              aria-pressed={scope === s}
              onClick={() => choose(s)}
            >
              {s === 'people' ? t('search.scope.people') : t('search.scope.words')}
            </button>
          ))}
        </div>
      </div>

      {!signedIn ? (
        <GuestSearch scope={scope} />
      ) : !debounced ? (
        <Explore
          recents={recents}
          onRecent={(term) => setQuery(term)}
          onClearRecents={() => {
            clearRecentSearches();
            setRecents([]);
          }}
        />
      ) : scope === 'people' ? (
        <PeopleResults query={debounced} onOpen={() => remember(debounced)} />
      ) : (
        <WordResults
          query={debounced}
          onOpen={(id) => {
            remember(debounced);
            setEntry(id);
          }}
        />
      )}
    </div>
  );
}

/** One person in a list: their face and name open their profile, where the actions are. */
function PersonRow({ user, meta, action, onOpen }: { user: UserSummary; meta?: string; action?: React.ReactNode; onOpen?: () => void }): React.JSX.Element {
  const { openProfile } = useProfileModal();
  return (
    <li className="list-row">
      <button
        type="button"
        className="list-row-main"
        onClick={() => {
          onOpen?.();
          openProfile({ kind: 'user', userId: user.userId, username: user.username });
        }}
      >
        <Avatar url={user.avatarUrl} online={user.online} />
        <span className="list-row-text">
          <span className="list-row-title" dir="auto">{user.displayName || user.username}</span>
          <span className="list-row-sub" dir="auto">{meta ?? `@${user.username}`}</span>
        </span>
      </button>
      {action}
    </li>
  );
}

function PeopleResults({ query, onOpen }: { query: string; onOpen: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const [results, setResults] = useState<UserSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    setResults(null);
    setError(null);
    void client.get<{ results: UserSummary[] }>(`/users/search?q=${encodeURIComponent(query.slice(0, PEOPLE_MAX))}`).then((res) => {
      if (!live) return;
      if (res.ok) setResults(res.data.results ?? []);
      else setError(describeError(res.error, t));
    });
    return () => {
      live = false;
    };
  }, [client, query, t, nonce]);

  if (error) return <ErrorState message={error} onRetry={() => setNonce((n) => n + 1)} />;
  if (!results) return <FriendListSkeleton count={3} />;
  if (results.length === 0)
    return <EmptyState title={t('friends.noResults')} message={t('search.noPeopleBody')} />;
  return (
    <section aria-label={t('search.scope.people')}>
      <ul className="list">
        {results.map((u) => (
          <PersonRow key={u.userId} user={u} onOpen={onOpen} />
        ))}
      </ul>
    </section>
  );
}

function WordResults({ query, onOpen }: { query: string; onOpen: (entryId: string) => void }): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    setResult(null);
    setError(null);
    void client.get<SearchResult>(`/dictionary/search?q=${encodeURIComponent(query)}&limit=20`).then((res) => {
      if (!live) return;
      if (res.ok) setResult(res.data);
      else setError(describeError(res.error, t));
    });
    return () => {
      live = false;
    };
  }, [client, query, t, nonce]);

  if (error) return <ErrorState message={error} onRetry={() => setNonce((n) => n + 1)} />;
  if (!result) return <FriendListSkeleton count={3} />;
  const hits = result.results ?? [];
  if (hits.length === 0) return <EmptyState title={t('dictionary.noResults', { query })} message={t('search.noWordsBody')} />;
  return (
    <section aria-label={t('search.scope.words')}>
      {result.fuzzy && <p className="muted search-note">{t('dictionary.noExactMatch')}</p>}
      <ul className="list">
        {hits.map((hit) => (
          <li key={hit.entryId} className="list-row">
            <button type="button" className="list-row-main" onClick={() => onOpen(hit.entryId)}>
              <span className="list-row-text">
                <span className="list-row-title" lang="ku">
                  {hit.headword}
                </span>
                <span className="list-row-sub">
                  {hit.pos ? `${hit.pos} · ` : ''}
                  {hit.definitionEn ?? hit.definitionKu ?? ''}
                </span>
              </span>
              <ChevronIcon size={16} className="list-row-go flip-rtl" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The page before anything is typed: where you were, who you might know, and
 * the two places people most often come here looking for.
 */
function Explore({
  recents,
  onRecent,
  onClearRecents,
}: {
  recents: string[];
  onRecent: (term: string) => void;
  onClearRecents: () => void;
}): React.JSX.Element {
  const t = useT();
  return (
    <>
      {recents.length > 0 && (
        <section className="search-section" aria-labelledby="search-recent">
          <div className="search-section-head">
            <h2 className="learn-section-title" id="search-recent">
              {t('rail.recent')}
            </h2>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClearRecents}>
              {t('search.clearRecent')}
            </button>
          </div>
          <div className="search-recents">
            {recents.map((r) => (
              <button key={r} type="button" className="chip" onClick={() => onRecent(r)}>
                {r}
              </button>
            ))}
          </div>
        </section>
      )}
      <Suggestions />
      <ExploreLinks signedIn />
    </>
  );
}

/** People you may know, with the one action that matters here. */
function Suggestions(): React.JSX.Element | null {
  const { client } = useAuth();
  const t = useT();
  const suggestions = useApiGet<{ suggestions: SuggestedFriend[] }>('/friends/suggestions');
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const list = suggestions.data?.suggestions ?? [];
  if (suggestions.loading || list.length === 0) return null;

  async function add(userId: string): Promise<void> {
    const res = await client.post('/friends/requests', { userId });
    if (res.ok) setRequested((prev) => new Set(prev).add(userId));
  }

  return (
    <section className="search-section" aria-labelledby="search-suggested">
      <div className="search-section-head">
        <h2 className="learn-section-title" id="search-suggested">
          {t('friends.suggestions')}
        </h2>
        <Link to="/app/friends" className="btn btn-ghost btn-sm">
          {t('friends.yours')}
        </Link>
      </div>
      <ul className="list">
        {list.slice(0, 6).map((u) => (
          <PersonRow
            key={u.userId}
            user={u}
            meta={t('friends.mutual', { count: u.mutualCount })}
            action={
              requested.has(u.userId) ? (
                <Button size="sm" variant="secondary" disabled>
                  {t('friends.requested')}
                </Button>
              ) : (
                // a row's action is a secondary pill: a column of white buttons
                // down a list would outshout everything else on the page
                <Button size="sm" variant="secondary" onClick={() => void add(u.userId)}>
                  {t('friends.add')}
                </Button>
              )
            }
          />
        ))}
      </ul>
    </section>
  );
}

function ExploreLinks({ signedIn }: { signedIn: boolean }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const dictionary = (
    <>
      <DictionaryIcon size={22} />
      <span className="list-row-text">
        <span className="list-row-title">{t('nav.dictionary')}</span>
        <span className="list-row-sub">{t('learn.tools.dictionary')}</span>
      </span>
      <ChevronIcon size={16} className="list-row-go flip-rtl" />
    </>
  );
  return (
    <section className="search-section" aria-labelledby="search-explore">
      <h2 className="learn-section-title" id="search-explore">
        {t('search.explore')}
      </h2>
      <ul className="list">
        <li className="list-row">
          {signedIn ? (
            <Link to="/app/dictionary" className="list-row-main">
              {dictionary}
            </Link>
          ) : (
            <a href={publishedDictionary(locale)} className="list-row-main">
              {dictionary}
            </a>
          )}
        </li>
        <li className="list-row">
          <Link to="/app/rankings" className="list-row-main">
            <TrophyIcon size={22} />
            <span className="list-row-text">
              <span className="list-row-title">{t('nav.rankings')}</span>
              <span className="list-row-sub">{t('learn.rankingsSub')}</span>
            </span>
            <ChevronIcon size={16} className="list-row-go flip-rtl" />
          </Link>
        </li>
      </ul>
    </section>
  );
}

/**
 * Search, for a visitor without an account. Words go to the published
 * dictionary, which is open to everyone; people are found by people, so that
 * half says what an account is for and offers one.
 */
function GuestSearch({ scope }: { scope: Scope }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  if (scope === 'words') {
    return (
      <>
        <div className="search-guest">
          <DictionaryIcon size={28} />
          <p className="search-guest-title">{t('search.guestWords')}</p>
          <a href={publishedDictionary(locale)} className="btn btn-primary">
            {t('search.openDictionary')}
          </a>
        </div>
        <ExploreLinks signedIn={false} />
      </>
    );
  }
  return (
    <>
      <div className="search-guest">
        <UsersIcon size={28} />
        <p className="search-guest-title">{t('gate.title')}</p>
        <p className="muted">{t('gate.body', { what: t('gate.what.addFriends') })}</p>
        <div className="gate-actions">
          <Link to="/register" className="btn btn-primary" state={{ from: '/app/search' }}>
            {t('auth.login.createAccount')}
          </Link>
          <Link to="/login" className="btn btn-secondary" state={{ from: '/app/search' }}>
            {t('nav.login')}
          </Link>
        </div>
      </div>
      <ExploreLinks signedIn={false} />
    </>
  );
}
