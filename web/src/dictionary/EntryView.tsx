import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { useT } from '../i18n/I18nProvider';
import { ErrorState } from '../components/states';
import { BookmarkIcon, WaveformIcon } from '../components/icons';
import type { Entry } from './types';

/**
 * One dictionary entry: its senses, their examples, a pronunciation if the
 * entry has one, and the words it points at.
 *
 * Bookmarking is optimistic. The star is the whole interaction, so waiting a
 * round trip to fill it in makes the button feel broken; if the write fails the
 * star goes back and says why, which is rarer and cheaper than the delay.
 */
export function EntryView({
  entryId,
  onOpenEntry,
  onSavedChange,
}: {
  entryId: string;
  onOpenEntry: (id: string) => void;
  onSavedChange?: (entryId: string, saved: boolean) => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const [entry, setEntry] = useState<Entry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const load = useCallback(() => {
    setError(null);
    void client.get<Entry>(`/dictionary/entries/${entryId}`).then((res) => {
      if (res.ok) setEntry(res.data);
      else setError(describeError(res.error, t));
    });
  }, [client, entryId, t]);

  useEffect(load, [load]);

  const toggleSave = async (): Promise<void> => {
    if (!entry || saving) return;
    const next = !entry.saved;
    setSaving(true);
    setEntry({ ...entry, saved: next });
    // PUT, not POST: bookmarking is idempotent and the server says so
    const res = next
      ? await client.put(`/dictionary/entries/${entry.id}/save`)
      : await client.delete(`/dictionary/entries/${entry.id}/save`);
    setSaving(false);
    if (res.ok) {
      onSavedChange?.(entry.id, next);
      return;
    }
    setEntry({ ...entry, saved: !next });
    setError(describeError(res.error, t));
  };

  const play = (url: string): void => {
    audioRef.current?.pause();
    const audio = new Audio(url);
    audioRef.current = audio;
    void audio.play().catch(() => {
      // autoplay policies and missing files both land here; the word is still
      // readable, so this is not worth an error state
    });
  };

  if (error && !entry) return <ErrorState message={error} onRetry={load} />;
  if (!entry) return <p className="muted">{t('common.loading')}</p>;

  return (
    <article className="dict-entry">
      <header className="dict-entry-head">
        <div>
          <h2 className="dict-headword">{entry.headword}</h2>
          <span className="badge">{entry.dialect}</span>
        </div>
        <div className="dict-entry-actions">
          {entry.audio.map((a) => (
            <button
              key={a.url}
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => play(a.url)}
              aria-label={t('dictionary.playPronunciation')}
            >
              <WaveformIcon size={16} />
            </button>
          ))}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void toggleSave()}
            aria-pressed={entry.saved === true}
            aria-label={entry.saved ? t('dictionary.removeBookmark') : t('dictionary.bookmark')}
          >
            <BookmarkIcon size={16} />
            <span>{entry.saved ? t('dictionary.savedWord') : t('dictionary.saveWord')}</span>
          </button>
        </div>
      </header>

      {error ? <p className="msg msg-error">{error}</p> : null}

      <ol className="dict-senses">
        {entry.senses.map((s) => (
          <li key={s.id} className="dict-sense">
            <span className="dict-pos">{s.pos}</span>
            <p className="dict-def">{s.definitionEn}</p>
            {s.definitionKu ? <p className="dict-def-ku">{s.definitionKu}</p> : null}
            {s.examples.length > 0 ? (
              <ul className="dict-examples">
                {s.examples.map((e, i) => (
                  <li key={i}>
                    <span className="dict-example-ku">{e.textKu}</span>
                    {e.textEn ? <span className="dict-example-en">{e.textEn}</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>

      {entry.xrefs.length > 0 ? (
        <section className="dict-xrefs">
          <h3 className="dict-xrefs-title">{t('dictionary.related')}</h3>
          <div className="dict-xref-row">
            {entry.xrefs.map((x) => (
              <button key={x.entryId} type="button" className="btn btn-ghost btn-sm" onClick={() => onOpenEntry(x.entryId)}>
                {x.headword}
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </article>
  );
}
