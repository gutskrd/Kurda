import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { ClipSpeaker } from '../characters/ClipSpeaker';
import type { SpokenClip } from '../characters/clips';
import { describeError } from '../lib/api';
import { play } from '../lib/sound';
import { useT } from '../i18n/I18nProvider';
import { ErrorState } from '../components/states';
import { BookmarkIcon, WaveformIcon } from '../components/icons';
import type { Entry } from './types';
import { EntrySkeleton } from '../components/skeletons';

/**
 * One dictionary entry: its senses, their examples, a pronunciation if the
 * entry has one, and the words it points at. A pronunciation an editor gave a
 * character has that character beside its button, saying the word as it
 * plays; it plays through the app's one player, so it never talks over a
 * lesson or a letter.
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
  // who says each pronunciation that has a character, by its URL; kept while only the bookmark changes
  const audio = entry?.audio;
  const headword = entry?.headword;
  const spoken = useMemo(() => {
    const out = new Map<string, SpokenClip>();
    for (const a of audio ?? []) {
      if (a.speaker) out.set(a.url, { src: a.url, voice: { speaker: a.speaker, ...(a.lipsync ? { lipsync: a.lipsync } : {}) }, text: headword });
    }
    return out;
  }, [audio, headword]);

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

  if (error && !entry) return <ErrorState message={error} onRetry={load} />;
  if (!entry) return <EntrySkeleton />;

  return (
    <article className="dict-entry">
      <header className="dict-entry-head">
        <div>
          <h2 className="dict-headword">{entry.headword}</h2>
          <span className="badge">{entry.dialect}</span>
        </div>
        <div className="dict-entry-actions">
          {entry.audio.map((a) => {
            const button = (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => play(a.url)} aria-label={t('dictionary.playPronunciation')}>
                <WaveformIcon size={16} />
              </button>
            );
            const clip = spoken.get(a.url);
            if (!clip) return <Fragment key={a.url}>{button}</Fragment>;
            return (
              <span key={a.url} className="dict-voice">
                <ClipSpeaker clips={[clip]} decorative className="speaker-tile dict-voice-face" />
                {button}
              </span>
            );
          })}
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
            {/*
              English on top when there is one, and the Kurdish under it. A word
              that is only defined in Kurdish — which is most of Wîkîferheng —
              puts that definition here rather than leaving an empty line above
              it, so the sense reads as a definition rather than as a gap.
            */}
            <p className="dict-def" dir="auto">{s.definitionEn ?? s.definitionKu}</p>
            {s.definitionEn && s.definitionKu ? <p className="dict-def-ku" dir="auto">{s.definitionKu}</p> : null}
            {s.examples.length > 0 ? (
              <ul className="dict-examples">
                {s.examples.map((e, i) => (
                  <li key={i}>
                    <span className="dict-example-ku" dir="auto">{e.textKu}</span>
                    {e.textEn ? <span className="dict-example-en" dir="auto">{e.textEn}</span> : null}
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
