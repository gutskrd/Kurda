import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useLocale, useT } from '../i18n/I18nProvider';
import { useProfileModal } from '../profile/ProfileModal';
import { useDebouncedValue } from '../dictionary/useDebouncedValue';
import { publishedDictionary } from '../layouts/navLinks';
import { Avatar } from '../components/Avatar';
import { ArrowIcon, ChevronIcon, CloseIcon, DictionaryIcon, SearchIcon, UserIcon } from '../components/icons';
import type { UserSummary } from '../lib/types';
import type { SearchHit } from '../dictionary/types';
import { addRecentSearch, clearRecentSearches, readRecentSearches } from './recentSearches';
import { useQuickSearch } from './useQuickSearch';
import { Highlighted } from './Highlighted';

/** Below this the bar has no room for a field, and a button opens one over the bar. */
const NARROW = '(max-width: 768px)';
const isNarrow = (): boolean => globalThis.matchMedia?.(NARROW).matches ?? false;

/** How long typing has to pause before a search goes out. */
const DEBOUNCE_MS = 250;
/** Past searches offered in the panel; the Search page has room for the rest. */
const RECENT_SHOWN = 6;

/** The Search page at a query, where "See all results" goes and where a word opens. */
export function searchPath(q: string, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams({ q, ...extra });
  return `/app/search?${params.toString()}`;
}

/** What pressing an option does. */
type Choice =
  | { kind: 'recent'; term: string }
  | { kind: 'person'; user: UserSummary }
  | { kind: 'word'; hit: SearchHit }
  | { kind: 'all' }
  | { kind: 'dictionary' }
  | { kind: 'login' };

interface Option {
  id: string;
  choice: Choice;
  /** Where the option leads, so a middle click or a long press can open it in a new tab. */
  href: string;
}

/**
 * The search in the bar: a field on a wide screen, or a button that opens one on a phone, with results in a panel
 * below. A few people and words come back as you type, "See all results" opens the Search page, and an empty field
 * offers this visit's past searches.
 *
 * It is an ARIA combobox: focus stays in the field, the arrow keys move through options (`aria-activedescendant`),
 * Enter takes the highlighted one or opens all results, and Escape closes the panel (and on a phone the field,
 * returning focus to its button). "/" outside a field jumps here. Visitors can look words up in the published
 * dictionary; finding people needs an account, which the panel says.
 */
export function NavSearch(): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const { status } = useAuth();
  const signedIn = status === 'signedIn';
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const { openProfile } = useProfileModal();
  const base = useId();
  const listId = `${base}-list`;
  const panelId = `${base}-panel`;

  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  /** Where the focus was before "/" brought it here, to return it on Escape. */
  const returnTo = useRef<HTMLElement | null>(null);

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [recents, setRecents] = useState<string[]>(readRecentSearches);
  /** The centre of the phone's search button, which the field and its results open out of (shell.css). */
  const [from, setFrom] = useState<{ x: number; y: number } | null>(null);

  const term = query.trim();
  const debounced = useDebouncedValue(term, DEBOUNCE_MS);
  const quick = useQuickSearch(signedIn && open ? debounced : '');

  /*
   * Opens the search and focuses the field. The open state is committed first (`flushSync`) because on a phone the
   * field is not on screen until then, and a phone only raises its keyboard for a focus given in the same tap. The
   * button's position is read before the field covers it.
   */
  const show = useCallback((): void => {
    const button = openerRef.current?.getBoundingClientRect();
    flushSync(() => {
      if (button && button.width > 0) setFrom({ x: Math.round(button.left + button.width / 2), y: Math.round(button.top + button.height / 2) });
      setOpen(true);
    });
    // The field is always in sight in the bar, so focusing it must not scroll the page.
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  /** Closes the panel; on a phone the field closes too and the button gets the focus back. */
  const hide = useCallback((): void => {
    setOpen(false);
    setActive(-1);
    if (isNarrow()) openerRef.current?.focus({ preventScroll: true });
  }, []);

  // Moving to another page closes and empties the search.
  useEffect(() => {
    setOpen(false);
    setActive(-1);
    setQuery('');
  }, [pathname]);

  // A press anywhere outside closes it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent): void => {
      if (boxRef.current?.contains(e.target as Node)) return;
      setOpen(false);
      setActive(-1);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  // "/" from anywhere that is not itself a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const at = e.target instanceof HTMLElement ? e.target : null;
      if (at && (at.isContentEditable || at.closest('input, textarea, select, [role="dialog"]'))) return;
      e.preventDefault();
      returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      show();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [show]);

  // The option highlighted by the arrow keys stays in view in a long list.
  const options = buildOptions();
  const lit = open && active >= 0 ? options[active] : undefined;
  const litId = lit?.id;
  useEffect(() => {
    if (litId) document.getElementById(litId)?.scrollIntoView({ block: 'nearest' });
  }, [litId]);

  function buildOptions(): Option[] {
    const out: Option[] = [];
    const add = (key: string, choice: Choice, href: string): void => {
      out.push({ id: `${base}-${key}`, choice, href });
    };
    if (!term) {
      recents.slice(0, RECENT_SHOWN).forEach((r, i) => add(`r${i}`, { kind: 'recent', term: r }, searchPath(r)));
      return out;
    }
    if (!signedIn) {
      add('dictionary', { kind: 'dictionary' }, publishedDictionary(locale));
      add('login', { kind: 'login' }, '/login');
      return out;
    }
    const found = quick.results;
    found?.people.forEach((u) => add(`p-${u.userId}`, { kind: 'person', user: u }, `/app/users/${u.userId}`));
    found?.words.forEach((w) =>
      add(`w-${w.entryId}`, { kind: 'word', hit: w }, searchPath(found.query, { type: 'words', entry: w.entryId })),
    );
    add('all', { kind: 'all' }, searchPath(term.slice(0, 100)));
    return out;
  }

  /** Ends the search: empties and closes it, and optionally remembers the query. */
  const finish = (remember: boolean): void => {
    if (remember && term) setRecents(addRecentSearch(term));
    setOpen(false);
    setActive(-1);
    setQuery('');
    inputRef.current?.blur();
  };

  const choose = (option: Option): void => {
    const { choice } = option;
    switch (choice.kind) {
      case 'recent':
        // A past search is typed back in and searched again.
        setQuery(choice.term);
        setActive(-1);
        inputRef.current?.focus({ preventScroll: true });
        return;
      case 'person':
        finish(true);
        openProfile({ kind: 'user', userId: choice.user.userId, username: choice.user.username });
        return;
      case 'word':
      case 'all':
        finish(true);
        navigate(option.href);
        return;
      case 'dictionary':
        // The published dictionary is static files, not a route in this app.
        finish(false);
        window.location.assign(option.href);
        return;
      case 'login':
        finish(false);
        navigate('/login', { state: { from: pathname + search } });
        return;
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    const count = options.length;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) setOpen(true);
        else if (count) setActive((i) => (i + 1) % count);
        return;
      case 'ArrowUp':
        e.preventDefault();
        if (!open) setOpen(true);
        else if (count) setActive((i) => (i <= 0 ? count - 1 : i - 1));
        return;
      case 'Enter': {
        e.preventDefault();
        const pick = lit ?? (term ? options.find((o) => o.choice.kind === 'all') ?? options[0] : undefined);
        if (pick) choose(pick);
        return;
      }
      case 'Escape': {
        e.preventDefault();
        if (open) {
          hide();
          return;
        }
        if (query) {
          setQuery('');
          return;
        }
        // Nothing left to close, so the focus goes back to where "/" took it from.
        const back = returnTo.current;
        returnTo.current = null;
        if (back && back.isConnected && back !== document.body) back.focus();
        else inputRef.current?.blur();
        return;
      }
      default:
        return;
    }
  };

  const onOptionClick = (e: React.MouseEvent<HTMLAnchorElement>, option: Option): void => {
    // Modified clicks are left to the browser, which opens the link's own address.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    choose(option);
  };

  const people = options.filter((o) => o.choice.kind === 'person');
  const words = options.filter((o) => o.choice.kind === 'word');
  const found = quick.results;
  const settled = Boolean(found && found.query === term && !quick.loading);
  const nothing = settled && people.length === 0 && words.length === 0;
  const hasList = options.length > 0;

  const renderOption = (option: Option): React.JSX.Element => {
    const index = options.indexOf(option);
    return (
      <a
        key={option.id}
        id={option.id}
        role="option"
        aria-selected={index === active}
        href={option.href}
        tabIndex={-1}
        className={`nav-search-option is-${option.choice.kind}`}
        // The field keeps the focus while an option is pressed.
        onMouseDown={(e) => e.preventDefault()}
        onMouseMove={() => index !== active && setActive(index)}
        onClick={(e) => onOptionClick(e, option)}
      >
        <OptionBody option={option} term={term} />
      </a>
    );
  };

  return (
    <div
      ref={boxRef}
      className={`nav-search${open ? ' is-open' : ''}`}
      style={from ? ({ '--search-from-x': `${from.x}px`, '--search-from-y': `${from.y}px` } as React.CSSProperties) : undefined}
      onBlur={(e) => {
        // Tabbing out closes the search; a press elsewhere is handled by the pointer listener.
        const next = e.relatedTarget as Node | null;
        if (next && !boxRef.current?.contains(next)) {
          setOpen(false);
          setActive(-1);
        }
      }}
    >
      {/* On a phone the bar has no room for a field until this button opens one. */}
      <button
        ref={openerRef}
        type="button"
        className="icon-btn icon-btn-lg nav-search-open"
        aria-label={t('nav.search')}
        title={t('nav.search')}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={show}
      >
        <SearchIcon size={22} />
      </button>

      <form
        role="search"
        className="nav-search-bar"
        aria-label={t('nav.search')}
        onSubmit={(e) => e.preventDefault()}
      >
        <button type="button" className="icon-btn nav-search-back" aria-label={t('search.close')} onClick={hide}>
          <ChevronIcon size={20} className="back-chevron" />
        </button>
        <div className="nav-search-field">
          <SearchIcon size={18} className="nav-search-icon" />
          <label htmlFor="nav-search-input" className="sr-only">
            {t('search.label')}
          </label>
          <input
            ref={inputRef}
            id="nav-search-input"
            className="nav-search-input"
            type="search"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open && hasList}
            aria-controls={open && hasList ? listId : undefined}
            aria-activedescendant={litId}
            value={query}
            maxLength={100}
            placeholder={t('nav.search')}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="search"
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(-1);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onKeyDown={onKeyDown}
          />
          {query && (
            <button
              type="button"
              className="nav-search-clear"
              aria-label={t('search.clear')}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setQuery('');
                setActive(-1);
                setOpen(true);
                inputRef.current?.focus({ preventScroll: true });
              }}
            >
              <CloseIcon size={16} />
            </button>
          )}
        </div>
      </form>

      {open && (
        <div id={panelId} className="nav-search-panel" tabIndex={-1}>
          {!term && recents.length > 0 && (
            <div className="nav-search-head">
              <span className="nav-search-head-title">{t('rail.recent')}</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  clearRecentSearches();
                  setRecents([]);
                  setActive(-1);
                }}
              >
                {t('search.clearRecent')}
              </button>
            </div>
          )}
          {!term && recents.length === 0 && <p className="nav-search-note">{t('search.hint')}</p>}

          {/* The search status, announced once to screen readers. */}
          <div role="status" className="nav-search-status">
            {term && signedIn && quick.error && <p className="nav-search-note">{quick.error}</p>}
            {term && signedIn && !quick.error && !found && quick.loading && (
              <p className="nav-search-note is-loading">{t('common.loading')}</p>
            )}
            {term && signedIn && !quick.error && nothing && (
              <p className="nav-search-note">{t('dictionary.noResults', { query: term })}</p>
            )}
          </div>

          {hasList && (
            <div
              id={listId}
              role="listbox"
              aria-label={t('search.label')}
              className={`nav-search-list${quick.loading && found ? ' is-stale' : ''}`}
            >
              {!term && options.map(renderOption)}
              {term && !signedIn && options.map(renderOption)}
              {term && signedIn && (
                <>
                  {people.length > 0 && (
                    <div role="group" aria-labelledby={`${base}-people`} className="nav-search-group">
                      <div role="presentation" id={`${base}-people`} className="nav-search-group-title">
                        {t('search.scope.people')}
                      </div>
                      {people.map(renderOption)}
                    </div>
                  )}
                  {words.length > 0 && (
                    <div role="group" aria-labelledby={`${base}-words`} className="nav-search-group">
                      <div role="presentation" id={`${base}-words`} className="nav-search-group-title">
                        {t('search.scope.words')}
                      </div>
                      {words.map(renderOption)}
                    </div>
                  )}
                  {options.filter((o) => o.choice.kind === 'all').map(renderOption)}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** What an option shows: a face or a glyph, a line, and a second line where there is one. */
function OptionBody({ option, term }: { option: Option; term: string }): React.JSX.Element {
  const t = useT();
  const { choice } = option;
  switch (choice.kind) {
    case 'recent':
      return (
        <>
          <span className="nav-search-glyph is-small" aria-hidden="true">
            <SearchIcon size={16} />
          </span>
          <span className="nav-search-text">
            <span className="nav-search-title" dir="auto">
              {choice.term}
            </span>
          </span>
        </>
      );
    case 'person':
      return (
        <>
          <Avatar url={choice.user.avatarUrl} online={choice.user.online} />
          <span className="nav-search-text">
            <span className="nav-search-title" dir="auto">
              <Highlighted text={choice.user.displayName || choice.user.username} query={term} />
            </span>
            {/* A username reads left to right on any page, "@" first. */}
            <span className="nav-search-sub" dir="ltr">
              @<Highlighted text={choice.user.username} query={term} />
              {choice.user.friend && <span dir="auto"> · {t('search.friend')}</span>}
            </span>
          </span>
        </>
      );
    case 'word':
      return (
        <>
          <span className="nav-search-glyph" aria-hidden="true">
            <DictionaryIcon size={18} />
          </span>
          <span className="nav-search-text">
            <span className="nav-search-title" lang="ku">
              <Highlighted text={choice.hit.headword} query={term} />
            </span>
            <span className="nav-search-sub">
              {choice.hit.pos ? `${choice.hit.pos} · ` : ''}
              {choice.hit.definitionEn ?? choice.hit.definitionKu ?? ''}
            </span>
          </span>
        </>
      );
    case 'all':
      return (
        <>
          <span className="nav-search-glyph" aria-hidden="true">
            <SearchIcon size={18} />
          </span>
          <span className="nav-search-text">
            <span className="nav-search-title">{t('search.seeAll', { query: term })}</span>
          </span>
          <ArrowIcon size={16} className="nav-search-go flip-rtl" />
        </>
      );
    case 'dictionary':
      return (
        <>
          <span className="nav-search-glyph" aria-hidden="true">
            <DictionaryIcon size={18} />
          </span>
          <span className="nav-search-text">
            <span className="nav-search-title">{t('search.openDictionary')}</span>
            <span className="nav-search-sub">{t('search.guestWords')}</span>
          </span>
        </>
      );
    case 'login':
      return (
        <>
          <span className="nav-search-glyph" aria-hidden="true">
            <UserIcon size={18} />
          </span>
          <span className="nav-search-text">
            <span className="nav-search-title">{t('search.guestPeople')}</span>
          </span>
        </>
      );
  }
}
