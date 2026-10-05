import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ALPHABET_CLIPS,
  ALPHABET_CLIP_GROUPS,
  ALPHABET_CLIP_MAX_SECONDS,
  type AlphabetClip,
} from '@kurda/shared';
import { api, apiUpload, ApiError } from '../api';
import { ClipError, prepare, type Clip } from '../audioClip';

interface Recording {
  key: string;
  url: string;
  durationMs: number | null;
  updatedAt: string;
}

type Filter = 'missing' | 'recorded' | 'all';

/** A raw take may start and end with silence; it is trimmed to ALPHABET_CLIP_MAX_SECONDS afterwards. */
const MAX_TAKE_MS = 8000;

/**
 * Recording the alphabet page's sounds.
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
      <div className="toolbar">
        <div>
          <h1>Alphabet audio</h1>
          <div className="subtle">The sounds learners hear on the alphabet page. A recording replaces the synthesised voice.</div>
        </div>
      </div>

      <div className="card aa-summary">
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <strong>
            {done} of {ALPHABET_CLIPS.length} recorded
          </strong>
          <span className="subtle">The rest use the synthesised voice until they are recorded.</span>
        </div>
        <div className="progress" style={{ marginTop: 10 }} aria-label="Recorded so far">
          <div className="progress-bar" style={{ width: `${(done / ALPHABET_CLIPS.length) * 100}%` }} />
        </div>
      </div>

      {error && <div className="error" style={{ margin: '12px 0' }}>{error}</div>}

      <div className="aa-layout">
        <div>
          <div className="tabs" role="tablist">
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

type Phase = { name: 'idle' } | { name: 'recording'; started: number } | { name: 'working' } | { name: 'ready'; clip: Clip } | { name: 'saving'; clip: Clip };

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
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const [problem, setProblem] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stopTimer = useRef<number | null>(null);
  const preview = useRef<HTMLAudioElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // let go of a preview URL once it is no longer shown
  const previewUrl = phase.name === 'ready' || phase.name === 'saving' ? phase.clip.url : null;
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  // and of the microphone, if the editor moves on mid-take
  useEffect(() => () => {
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop();
  }, []);

  const process = async (data: ArrayBuffer): Promise<void> => {
    setPhase({ name: 'working' });
    try {
      const ready = await prepare(data, ALPHABET_CLIP_MAX_SECONDS);
      setPhase({ name: 'ready', clip: ready });
      // hear it straight away: that is the moment to judge it
      requestAnimationFrame(() => void preview.current?.play().catch(() => undefined));
    } catch (err) {
      setProblem(err instanceof ClipError ? err.message : 'Could not read that recording.');
      setPhase({ name: 'idle' });
    }
  };

  const record = async (): Promise<void> => {
    setProblem(null);
    let stream: MediaStream;
    try {
      // the browser's own gain control would undo the levelling, so it is off
      stream = await navigator.mediaDevices.getUserMedia({ audio: { autoGainControl: false, noiseSuppression: true, echoCancellation: true } });
    } catch {
      setProblem('The browser did not allow the microphone. Allow it in the address bar, or upload a file instead.');
      return;
    }
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream);
    recorder.current = rec;

    // a live level, so a muted or wrong microphone shows before the take is wasted
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    const started = performance.now();
    let frame = 0;
    const tick = (): void => {
      analyser.getFloatTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v));
      setLevel(peak);
      setElapsed(performance.now() - started);
      frame = requestAnimationFrame(tick);
    };
    tick();

    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = () => {
      cancelAnimationFrame(frame);
      if (stopTimer.current !== null) window.clearTimeout(stopTimer.current);
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
      setLevel(0);
      recorder.current = null;
      void new Blob(chunks, { type: rec.mimeType }).arrayBuffer().then(process);
    };
    rec.start();
    setPhase({ name: 'recording', started });
    stopTimer.current = window.setTimeout(() => rec.state !== 'inactive' && rec.stop(), MAX_TAKE_MS);
  };

  const stop = (): void => {
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop();
  };

  const upload = async (file: File): Promise<void> => {
    setProblem(null);
    await process(await file.arrayBuffer());
  };

  const save = async (): Promise<void> => {
    if (phase.name !== 'ready') return;
    const ready = phase.clip;
    setPhase({ name: 'saving', clip: ready });
    try {
      const res = await apiUpload<{ key: string; url: string; durationMs: number }>(
        `/admin/alphabet/audio?key=${encodeURIComponent(clip.key)}`,
        ready.wav,
        'audio/wav',
      );
      onSaved({ key: res.key, url: res.url, durationMs: res.durationMs, updatedAt: new Date().toISOString() });
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not save it. Try again.');
      setPhase({ name: 'ready', clip: ready });
    }
  };

  const remove = async (): Promise<void> => {
    if (!recording || !confirm(`Remove the recording of “${clip.say}”?\n\nThe synthesised voice plays there again until a new one is saved.`)) return;
    try {
      await api(`/admin/alphabet/audio?key=${encodeURIComponent(clip.key)}`, { method: 'DELETE' });
      onRemoved(clip.key);
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not remove it.');
    }
  };

  // R records and stops, Enter saves, Space replays, arrows move — so a whole
  // session can go by without reaching for the mouse
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).closest('input, textarea, select')) return;
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        if (phase.name === 'recording') stop();
        else if (phase.name === 'idle' || phase.name === 'ready') void record();
      } else if (e.key === 'Enter' && phase.name === 'ready') {
        e.preventDefault();
        void save();
      } else if (e.key === ' ' && phase.name === 'ready') {
        e.preventDefault();
        void preview.current?.play();
      } else if ((e.key === 'ArrowDown' || e.key === 'ArrowRight') && phase.name === 'idle') {
        e.preventDefault();
        onNext();
      } else if ((e.key === 'ArrowUp' || e.key === 'ArrowLeft') && phase.name === 'idle') {
        e.preventDefault();
        onPrev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const group = ALPHABET_CLIP_GROUPS.find((g) => g.group === clip.group)!.title;
  const seconds = Math.min(elapsed, MAX_TAKE_MS) / 1000;

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

      {recording && phase.name === 'idle' && (
        <div className="aa-current">
          <audio controls src={recording.url} preload="none" />
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="subtle">
              Saved {new Date(recording.updatedAt).toLocaleDateString()}
              {recording.durationMs ? ` · ${(recording.durationMs / 1000).toFixed(1)} s` : ''}
            </span>
            <button type="button" className="danger" onClick={() => void remove()}>
              Remove
            </button>
          </div>
        </div>
      )}

      {phase.name === 'recording' && (
        <div className="aa-live" role="status">
          <span className="aa-rec-dot" aria-hidden="true" />
          <span>Recording… {seconds.toFixed(1)} s</span>
          <div className="aa-meter" aria-hidden="true">
            <div style={{ width: `${Math.min(100, level * 140)}%` }} />
          </div>
        </div>
      )}

      {phase.name === 'working' && <div className="subtle aa-live">Trimming and levelling…</div>}

      {(phase.name === 'ready' || phase.name === 'saving') && (
        <div className="aa-preview">
          <div className="aa-say-label">Listen back · {phase.clip.seconds.toFixed(1)} s</div>
          <audio ref={preview} controls src={phase.clip.url} />
        </div>
      )}

      {problem && <div className="error aa-problem">{problem}</div>}

      <div className="aa-actions">
        {phase.name === 'recording' ? (
          <button type="button" className="primary aa-big" onClick={stop}>
            Stop
          </button>
        ) : phase.name === 'ready' || phase.name === 'saving' ? (
          <>
            <button type="button" className="primary aa-big" onClick={() => void save()} disabled={phase.name === 'saving'}>
              {phase.name === 'saving' ? 'Saving…' : recording ? 'Save, replacing the old one' : 'Save'}
            </button>
            <button type="button" onClick={() => void record()} disabled={phase.name === 'saving'}>
              Record again
            </button>
          </>
        ) : (
          <button type="button" className="primary aa-big" onClick={() => void record()} disabled={phase.name === 'working'}>
            {recording ? 'Record a new one' : 'Record'}
          </button>
        )}
        {phase.name !== 'recording' && (
          <>
            <button type="button" className="ghost" onClick={() => fileInput.current?.click()} disabled={phase.name === 'working' || phase.name === 'saving'}>
              Upload a file
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="audio/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void upload(f);
              }}
            />
          </>
        )}
      </div>

      <div className="aa-tips subtle">
        <p>
          Say it once, at a normal pace, as you would to a learner. Silence before and after is cut, and the volume is levelled, so
          start whenever you are ready.
        </p>
        <p>
          A quiet room and a phone or headset microphone held a hand’s width away work best. Files from a phone (m4a, mp3, wav) work
          too; up to {ALPHABET_CLIP_MAX_SECONDS} seconds once trimmed.
        </p>
        <p className="aa-keys">
          <kbd>R</kbd> record / stop · <kbd>Space</kbd> listen · <kbd>Enter</kbd> save · <kbd>↑</kbd>
          <kbd>↓</kbd> previous / next
        </p>
      </div>
    </aside>
  );
}
