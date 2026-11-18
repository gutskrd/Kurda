import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { Link } from 'react-router-dom';
import { useT } from '../i18n/I18nProvider';
import { useGrowsInto } from '../lib/viewTransition';
import { EmptyState, ErrorState } from '../components/states';
import { DictRowsSkeleton } from '../components/skeletons';
import { BookmarkIcon, CloseIcon } from '../components/icons';
import { SearchField } from '../components/SearchField';
import { EntryView } from '../dictionary/EntryView';
import { SourceLine } from '../dictionary/SourceLine';
import { pushRecent } from '../dictionary/recents';
import { useDebouncedValue } from '../dictionary/useDebouncedValue';
import type { SavedWord, SearchResult } from '../dictionary/types';

/**
 * The dictionary: search as you type against the phone's endpoints, with the same debounce and closest-match fallback.
 * Recent searches last only for the session, since a lasting history would record what someone did not know.
 */
export function Dictionary(): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();

  const [query, setQuery] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [recents, setRecents] = useState<string[]>([]);
  const [saved, setSaved] = useState<SavedWord[]>([]);
  const [openEntry, setOpenEntry] = useState<string | null>(null);
  const debounced = useDebouncedValue(query, 250);
  // Where the tool's card on Learn lands, and what goes back to it.
  const head = useGrowsInto('learn:dictionary', { shape: 'card' });

  const loadSaved = useCallback(() => {
    void client.get<{ words: SavedWord[] }>('/me/saved-words').then((res) => {
      if (res.ok) setSaved(res.data.words);
    });
  }, [client]);

  useEffect(loadSaved, [loadSaved]);

  useEffect(() => {
    const q = debounced.trim();
    if (q.length === 0) {
      setResult(null);
      setFailed(null);
      return;
    }
    let active = true;
    setSearching(true);
    setFailed(null);
    void client.get<SearchResult>(`/dictionary/search?q=${encodeURIComponent(q)}`).then((res) => {
      if (!active) return;
      setSearching(false);
      if (res.ok) setResult(res.data);
      else setFailed(describeError(res.error, t));
    });
    return () => {
      active = false;
    };
  }, [client, debounced, t]);

  const open = (entryId: string, headword?: string): void => {
    if (headword) setRecents((r) => pushRecent(r, headword));
    setOpenEntry(entryId);
  };

  const removeSaved = async (entryId: string): Promise<void> => {
    setSaved((s) => s.filter((w) => w.entryId !== entryId));
    await client.delete(`/dictionary/entries/${entryId}/save`);
  };

  if (openEntry) {
    return (
      <div className="container dict">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpenEntry(null)}>
          {t('dictionary.backToSearch')}
        </button>
        <EntryView
          entryId={openEntry}
          onOpenEntry={(id) => setOpenEntry(id)}
          onSavedChange={loadSaved}
        />
        <SourceLine />
      </div>
    );
  }

  const results = result?.results ?? [];
  const idle = query.trim().length === 0;

  return (
    <div className="container dict">
      <h1 className="page-title" ref={head}>
        {t('nav.dictionary')}
      </h1>

      <SearchField
        icon
        inputClassName="dict-search"
        value={query}
        onValueChange={setQuery}
        placeholder={t('dictionary.searchPlaceholder')}
        aria-label={t('dictionary.searchLabel')}
        autoComplete="off"
        spellCheck={false}
      />

      {idle && (
        <Link to="/app/alphabet" className="doc-link reach-line dict-alphabet">
          {t('alphabet.link')}
        </Link>
      )}

      {result?.fuzzy ? <p className="muted dict-fuzzy">{t('dictionary.noExactMatch')}</p> : null}
      {failed ? <ErrorState message={failed} onRetry={() => setQuery((q) => q)} /> : null}

      {idle && recents.length > 0 ? (
        <section className="dict-section">
          <h2 className="dict-section-title">{t('dictionary.recent')}</h2>
          <div className="dict-chip-row">
            {recents.map((r) => (
              <button key={r} type="button" className="btn btn-ghost btn-sm" onClick={() => setQuery(r)}>
                {r}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {idle && saved.length > 0 ? (
        <section className="dict-section">
          <h2 className="dict-section-title">
            <BookmarkIcon size={14} /> {t('saved.title')}
          </h2>
          <ul className="dict-list">
            {saved.map((w) => (
              <li key={w.entryId} className="dict-row">
                <button type="button" className="dict-row-main" onClick={() => open(w.entryId, w.headword)}>
                  <span className="dict-row-word">{w.headword}</span>
                  <span className="dict-row-def">{w.definitionEn ?? w.definitionKu ?? ''}</span>
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => void removeSaved(w.entryId)}
                  aria-label={t('dictionary.removeSaved', { word: w.headword })}
                >
                  <CloseIcon size={14} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* "No results" only once an answer says so, not before the first search goes out. */}
      {!idle && !searching && result !== null && results.length === 0 && !failed ? (
        <EmptyState title={t('dictionary.noResults', { query: query.trim() })} message="" />
      ) : null}

      {/* The first search's placeholder rows; later searches keep the last rows up meanwhile. */}
      {!idle && !result && !failed ? <DictRowsSkeleton /> : null}

      {results.length > 0 ? (
        <ul className="dict-list">
          {results.map((hit) => (
            <li key={hit.entryId} className="dict-row">
              <button type="button" className="dict-row-main" onClick={() => open(hit.entryId, hit.headword)}>
                <span className="dict-row-word">{hit.headword}</span>
                <span className="dict-row-def">
                  {hit.pos ? `${hit.pos} · ` : ''}
                  {hit.definitionEn ?? hit.definitionKu ?? ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <SourceLine />
    </div>
  );
}
