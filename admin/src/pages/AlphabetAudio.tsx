import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ALPHABET_CLIPS,
  ALPHABET_CLIP_GROUPS,
  ALPHABET_CLIP_MAX_SECONDS,
  SYNTHESISED_ALPHABET_CLIPS,
  SYNTHESISED_WORD_CLIPS,
  isWordSetClipKey,
  type AlphabetClip,
  type LipsyncData,
  type SpeakerId,
} from '@kurda/shared';
import { api } from '../api';
import { ClipRecorder, ShortcutHint } from '../recorder';
import { EmptyState, ErrorState, Tabs } from '../ui';
import { SpeakerPicker, useSpeakerChange } from '../ui/SpeakerPicker';
import { SpeakingPreview } from '../ui/SpeakingPreview';
import { rememberSpeaker, rememberedSpeaker, scriptOfClip, uploadWithVoice, type Speaker } from '../voice';

interface Recording {
  key: string;
  url: string;
  durationMs: number | null;
  updatedAt: string;
  /** who is shown saying it, or null for no character */
  speaker?: SpeakerId | null;
  hasLipsync?: boolean;
  /** the stored timeline, null for none, as the list and a save made here send it */
  lipsync?: LipsyncData | null;
}

export type Filter = 'missing' | 'recorded' | 'all';

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
 *
 * The word sets' words (colours, numbers, days, months) are recorded here
 * too, in groups of their own after the letters. A few of them have no
 * synthesised clip, where no voice could say them accurately: until they are
 * recorded, they have no sound at all.
 *
 * The studio also says who is shown saying the sound, as the sentences' does:
 * a new take goes up with that character and a timeline read in the sound's
 * own script (voice.ts).
 */
export function AlphabetAudio({ initialFilter }: { initialFilter?: Filter } = {}): React.JSX.Element {
  const [recordings, setRecordings] = useState<Record<string, Recording>>({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState<Filter>(initialFilter ?? 'missing');
  const [selected, setSelectedKey] = useState<string>(ALPHABET_CLIPS[0]!.key);
  const studio = useRef<HTMLElement>(null);
  // who says the next new recording: the last choice made for one
  const [nextSpeaker, setNextSpeaker] = useState<Speaker>(rememberedSpeaker);
  const changeSpeaker = useSpeakerChange('alphabet', (key, speaker) =>
    setRecordings((all) => (all[key] ? { ...all, [key]: { ...all[key], speaker } } : all)),
  );

  // on a phone the studio sits above the list: a tap on a letter far down brings it back into view
  const setSelected = (key: string, reveal = false): void => {
    setSelectedKey(key);
    if (!reveal || typeof matchMedia !== 'function' || !matchMedia('(max-width: 899px)').matches) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => studio.current?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' }));
  };

  const load = useCallback(async () => {
    try {
      const res = await api<{ recordings: Recording[] }>('/admin/alphabet/audio');
      setRecordings(Object.fromEntries(res.recordings.map((r) => [r.key, r])));
      setError(null);
    } catch (err) {
      setError(err);
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
    if (first) setSelectedKey(first.key);
    else if (!initialFilter) setFilter('all');
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
        <div className="aa-summary-head">
          <div>
            <strong className="aa-count">
              {done} of {ALPHABET_CLIPS.length} recorded
            </strong>
            <div className="subtle">
              The sounds on the alphabet page, and the colours, numbers, days and months. The rest use the synthesised voice until they are
              recorded, or have no sound where there is none.
            </div>
          </div>
        </div>
        <div className="progress" role="progressbar" aria-label="Recorded so far" aria-valuemin={0} aria-valuemax={ALPHABET_CLIPS.length} aria-valuenow={done}>
          <div className="progress-bar" style={{ width: `${(done / ALPHABET_CLIPS.length) * 100}%` }} />
        </div>
      </div>

      {error != null && <ErrorState error={error} onRetry={() => void load()} what="the alphabet’s recordings" compact />}

      <div className="aa-layout">
        <div>
          <Tabs
            label="Show"
            value={filter}
            onChange={setFilter}
            items={[
              { key: 'missing', label: 'Still to record', count: ALPHABET_CLIPS.length - done },
              { key: 'recorded', label: 'Recorded', count: done },
              { key: 'all', label: 'All' },
            ]}
          />

          {shown.length === 0 && (
            <div className="card">
              <EmptyState title={filter === 'missing' ? 'Every sound has a recording.' : 'Nothing recorded yet.'} icon={filter === 'missing' ? 'check' : 'mic'} compact />
            </div>
          )}

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
                      onClick={() => setSelected(c.key, true)}
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
          ref={studio}
          clip={clip}
          recording={recordings[clip.key] ?? null}
          nextSpeaker={nextSpeaker}
          onSpeaker={(speaker) => {
            const recording = recordings[clip.key];
            if (recording) {
              changeSpeaker({ key: clip.key, from: recording.speaker ?? null, to: speaker, label: clip.say });
            } else {
              setNextSpeaker(speaker);
              rememberSpeaker(speaker);
            }
          }}
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
  ref,
  clip,
  recording,
  nextSpeaker,
  onSpeaker,
  onPrev,
  onNext,
  onSaved,
  onRemoved,
}: {
  ref: React.Ref<HTMLElement>;
  clip: AlphabetClip;
  recording: Recording | null;
  /** who says it when it is recorded now, if it has no recording yet */
  nextSpeaker: Speaker;
  onSpeaker: (speaker: Speaker) => void;
  onPrev: () => void;
  onNext: () => void;
  onSaved: (r: Recording) => void;
  onRemoved: (key: string) => void;
}): React.JSX.Element {
  const group = ALPHABET_CLIP_GROUPS.find((g) => g.group === clip.group)!.title;
  const speaker = recording ? (recording.speaker ?? null) : nextSpeaker;
  const word = isWordSetClipKey(clip.key);
  // a few words no voice could say accurately have no synthesised clip: until recorded they are silent
  const synthesised = Object.hasOwn(SYNTHESISED_ALPHABET_CLIPS, clip.key) || Object.hasOwn(SYNTHESISED_WORD_CLIPS, clip.key);

  return (
    <aside ref={ref} className="card aa-studio" aria-label="Record this sound">
      <div className="aa-studio-head">
        <span className="subtle">{group}</span>
        <span className={`badge${recording ? ' ok' : ''}`}>{recording ? 'Recorded' : synthesised ? 'Synthesised voice' : 'No sound yet'}</span>
      </div>

      <div className="aa-say-label">Say</div>
      <div className="aa-say" dir={clip.script === 'ckb' ? 'rtl' : 'ltr'} lang={clip.script === 'ckb' ? 'ckb' : 'ku'}>
        {clip.say}
      </div>
      {clip.hint && <div className="aa-hint">{clip.hint}</div>}
      {clip.group !== 'pair' && !word && clip.letter !== clip.say && (
        <div className="subtle aa-for">
          for the letter <strong dir="auto">{clip.letter}</strong>
        </div>
      )}

      <SpeakerPicker
        value={speaker}
        onChange={onSpeaker}
        hint={recording ? 'Changed as soon as you choose.' : 'Saved with the recording, and kept for the next one.'}
      />
      {recording?.speaker && (
        <SpeakingPreview
          key={`${recording.url}|${recording.speaker}`}
          speaker={recording.speaker}
          url={recording.url}
          text={clip.say}
          lipsync={recording.lipsync ?? (recording.hasLipsync ? undefined : null)}
          durationMs={recording.durationMs}
        />
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
          const res = await uploadWithVoice<{ key: string; url: string; durationMs: number; speaker?: SpeakerId | null; lipsync?: LipsyncData | null }>(
            `/admin/alphabet/audio?key=${encodeURIComponent(clip.key)}`,
            wav,
            { speaker, text: clip.say, script: scriptOfClip(clip.script) },
          );
          onSaved({
            key: res.key,
            url: res.url,
            durationMs: res.durationMs,
            updatedAt: new Date().toISOString(),
            speaker: res.speaker ?? null,
            hasLipsync: Boolean(res.lipsync),
            lipsync: res.lipsync ?? null,
          });
        }}
        removePrompt={`Remove the recording of “${clip.say}”?\n\n${
          synthesised ? 'The synthesised voice plays there again until a new one is saved.' : 'It has no sound until a new one is saved.'
        }`}
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
