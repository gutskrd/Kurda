import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { useT } from '../i18n/I18nProvider';
import { EmptyState, ErrorState } from '../components/states';
import { BookmarkIcon, CloseIcon } from '../components/icons';
import { EntryView } from '../dictionary/EntryView';
import { pushRecent } from '../dictionary/recents';
import { useDebouncedValue } from '../dictionary/useDebouncedValue';
import type { SavedWord, SearchResult } from '../dictionary/types';

/**
 * The dictionary (KUR-045), which the browser did not have at all — a Kurdish
 * site where you could not look a word up, while the phone had a whole tab of
 * it.
 *
 * Search-as-you-type against the same endpoints the phone uses, the same
 * debounce, and the same closest-matches fallback when nothing matches exactly.
 * Recents live for the session only: a search history that outlives the visit
 * is a record of what someone did not know, and nobody asked us to keep one.
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
      </div>
    );
  }

  const results = result?.results ?? [];
  const idle = query.trim().length === 0;

  return (
    <div className="container dict">
      <h1 className="page-title">{t('nav.dictionary')}</h1>

      <input
        className="input dict-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('dictionary.searchPlaceholder')}
        aria-label={t('dictionary.searchLabel')}
        autoComplete="off"
        spellCheck={false}
      />

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
                  <span className="dict-row-def">{w.definitionEn ?? ''}</span>
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

      {!idle && !searching && results.length === 0 && !failed ? (
        <EmptyState title={t('dictionary.noResults', { query: query.trim() })} message="" />
      ) : null}

      {results.length > 0 ? (
        <ul className="dict-list">
          {results.map((hit) => (
            <li key={hit.entryId} className="dict-row">
              <button type="button" className="dict-row-main" onClick={() => open(hit.entryId, hit.headword)}>
                <span className="dict-row-word">{hit.headword}</span>
                <span className="dict-row-def">
                  {hit.pos ? `${hit.pos} · ` : ''}
                  {hit.definitionEn ?? ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
