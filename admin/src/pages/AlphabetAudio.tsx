import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ALPHABET_CLIPS,
  ALPHABET_CLIP_GROUPS,
  ALPHABET_CLIP_MAX_SECONDS,
  type AlphabetClip,
} from '@kurda/shared';
import { api, apiUpload, ApiError } from '../api';
import { ClipRecorder, ShortcutHint } from '../recorder';

interface Recording {
  key: string;
  url: string;
  durationMs: number | null;
  updatedAt: string;
}

type Filter = 'missing' | 'recorded' | 'all';

/**
 * Recording the alphabet page's sounds: the Letters side of the audio studio.
 *
 * Every letter and example word ships with a synthesised clip, which is a guide
 * and no more. This is where a person replaces them: pick a sound, press Record,
 * say exactly what is written, and stop. The page trims the silence, levels the
 * volume and plays it back; Save puts it live, and the next sound still missing
 * comes up. A file from a phone works the same way, through Upload.
 *
 * Removing a recording brings the synthesised clip back, so nothing here can
 * leave a letter silent.
 */
export function AlphabetAudio(): React.JSX.Element {
  const [recordings, setRecordings] = useState<Record<string, Recording>>({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('missing');
  const [selected, setSelected] = useState<string>(ALPHABET_CLIPS[0]!.key);

  const load = useCallback(async () => {
    try {
      const res = await api<{ recordings: Recording[] }>('/admin/alphabet/audio');
      setRecordings(Object.fromEntries(res.recordings.map((r) => [r.key, r])));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the recordings');
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // start on the first sound still missing, once we know which those are
  const started = useRef(false);
  useEffect(() => {
    if (!loaded || started.current) return;
    started.current = true;
    const first = ALPHABET_CLIPS.find((c) => !recordings[c.key]);
    if (first) setSelected(first.key);
    else setFilter('all');
  }, [loaded, recordings]);

  const done = ALPHABET_CLIPS.filter((c) => recordings[c.key]).length;
  const shown = useMemo(
    () =>
      ALPHABET_CLIPS.filter((c) => (filter === 'all' ? true : filter === 'recorded' ? !!recordings[c.key] : !recordings[c.key] || c.key === selected)),
    [filter, recordings, selected],
  );
  const clip = ALPHABET_CLIPS.find((c) => c.key === selected)!;

  /** After a save: the next sound with no recording, in page order, wrapping round. */
  const nextMissing = (after: string, have: Record<string, Recording>): string | null => {
    const at = ALPHABET_CLIPS.findIndex((c) => c.key === after);
    for (let i = 1; i <= ALPHABET_CLIPS.length; i++) {
      const c = ALPHABET_CLIPS[(at + i) % ALPHABET_CLIPS.length]!;
      if (!have[c.key]) return c.key;
    }
    return null;
  };

  const move = (step: number): void => {
    const at = shown.findIndex((c) => c.key === selected);
    const next = shown[Math.max(0, Math.min(shown.length - 1, at + step))];
    if (next) setSelected(next.key);
  };

  return (
    <div>
      <div className="card aa-summary">
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <strong>
            {done} of {ALPHABET_CLIPS.length} recorded
          </strong>
          <span className="subtle">The sounds on the alphabet page. The rest use the synthesised voice until they are recorded.</span>
        </div>
        <div className="progress" style={{ marginTop: 10 }} aria-label="Recorded so far">
          <div className="progress-bar" style={{ width: `${(done / ALPHABET_CLIPS.length) * 100}%` }} />
        </div>
      </div>

      {error && <div className="error" style={{ margin: '12px 0' }}>{error}</div>}

      <div className="aa-layout">
        <div>
          <div className="tabs" role="tablist" aria-label="Show">
            {(
              [
                ['missing', `Still to record (${ALPHABET_CLIPS.length - done})`],
                ['recorded', `Recorded (${done})`],
                ['all', 'All'],
              ] as const
            ).map(([f, label]) => (
              <button key={f} type="button" role="tab" aria-selected={filter === f} className={`tab${filter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>
                {label}
              </button>
            ))}
          </div>

          {shown.length === 0 && <div className="empty">{filter === 'missing' ? 'Every sound has a recording.' : 'Nothing recorded yet.'}</div>}

          {ALPHABET_CLIP_GROUPS.map(({ group, title }) => {
            const items = shown.filter((c) => c.group === group);
            if (items.length === 0) return null;
            return (
              <section key={group} className="aa-group">
                <div className="section-title">{title}</div>
                <div className="aa-list">
                  {items.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      className={`aa-item${c.key === selected ? ' is-on' : ''}`}
                      onClick={() => setSelected(c.key)}
                      aria-current={c.key === selected}
                    >
                      <span className="aa-item-say" dir={c.script === 'ckb' ? 'rtl' : 'ltr'} lang={c.script === 'ckb' ? 'ckb' : 'ku'}>
                        {c.say}
                      </span>
                      <span className={`aa-dot${recordings[c.key] ? ' is-done' : ''}`} aria-label={recordings[c.key] ? 'recorded' : 'not recorded'} />
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <Studio
          key={clip.key}
          clip={clip}
          recording={recordings[clip.key] ?? null}
          onPrev={() => move(-1)}
          onNext={() => move(1)}
          onSaved={(r) => {
            const have = { ...recordings, [r.key]: r };
            setRecordings(have);
            const next = nextMissing(r.key, have);
            if (next) setSelected(next);
          }}
          onRemoved={(key) => {
            const have = { ...recordings };
            delete have[key];
            setRecordings(have);
          }}
        />
      </div>
    </div>
  );
}

function Studio({
  clip,
  recording,
  onPrev,
  onNext,
  onSaved,
  onRemoved,
}: {
  clip: AlphabetClip;
  recording: Recording | null;
  onPrev: () => void;
  onNext: () => void;
  onSaved: (r: Recording) => void;
  onRemoved: (key: string) => void;
}): React.JSX.Element {
  const group = ALPHABET_CLIP_GROUPS.find((g) => g.group === clip.group)!.title;

  return (
    <aside className="card aa-studio" aria-label="Record this sound">
      <div className="aa-studio-head">
        <span className="subtle">{group}</span>
        <span className={`badge${recording ? ' ok' : ''}`}>{recording ? 'Recorded' : 'Synthesised voice'}</span>
      </div>

      <div className="aa-say-label">Say</div>
      <div className="aa-say" dir={clip.script === 'ckb' ? 'rtl' : 'ltr'} lang={clip.script === 'ckb' ? 'ckb' : 'ku'}>
        {clip.say}
      </div>
      {clip.hint && <div className="aa-hint">{clip.hint}</div>}
      {clip.group !== 'pair' && clip.letter !== clip.say && (
        <div className="subtle aa-for">
          for the letter <strong dir="auto">{clip.letter}</strong>
        </div>
      )}

      <ClipRecorder
        say={clip.say}
        maxSeconds={ALPHABET_CLIP_MAX_SECONDS}
        what="one letter or one word"
        recording={recording}
        shortcuts
        onPrev={onPrev}
        onNext={onNext}
        onSave={async (wav) => {
          const res = await apiUpload<{ key: string; url: string; durationMs: number }>(
            `/admin/alphabet/audio?key=${encodeURIComponent(clip.key)}`,
            wav,
            'audio/wav',
          );
          onSaved({ key: res.key, url: res.url, durationMs: res.durationMs, updatedAt: new Date().toISOString() });
        }}
        removePrompt={`Remove the recording of “${clip.say}”?\n\nThe synthesised voice plays there again until a new one is saved.`}
        onRemove={async () => {
          await api(`/admin/alphabet/audio?key=${encodeURIComponent(clip.key)}`, { method: 'DELETE' });
          onRemoved(clip.key);
        }}
      />

      <div className="aa-tips subtle">
        <p>
          Say it once, at a normal pace, as you would to a learner. Silence before and after is cut, and the volume is levelled, so
          start whenever you are ready.
        </p>
        <p>
          A quiet room and a phone or headset microphone held a hand’s width away work best. Files from a phone (m4a, mp3, wav) work
          too; up to {ALPHABET_CLIP_MAX_SECONDS} seconds once trimmed.
        </p>
        <ShortcutHint />
      </div>
    </aside>
  );
}
