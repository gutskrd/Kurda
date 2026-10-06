import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LESSON_AUDIO_MAX_SECONDS, LESSON_AUDIO_TEXT_MAX } from '@kurda/shared';
import { api, apiUpload, ApiError } from '../api';
import { ClipRecorder, ShortcutHint } from '../recorder';
import {
  addPhrase,
  counts,
  describeUsage,
  displayOrder,
  group,
  isLoose,
  matches,
  neededForListening,
  neighbour,
  nextMissing,
  progress,
  scriptOf,
  withRecording,
  withoutRecording,
  type Filter,
  type Item,
  type Listing,
} from '../lessonAudio';

const FILTERS: ReadonlyArray<[Filter, string]> = [
  ['missing', 'Still to record'],
  ['recorded', 'Recorded'],
  ['unused', 'Not in any lesson'],
  ['all', 'All'],
];

/**
 * Recording the Kurdish the lessons use: the Lessons side of the audio studio.
 *
 * The list is what the API reads off every lesson — published or still a
 * draft — so an editor can record before a lesson goes live: each item's `say`,
 * the first accepted answer of a translation, writing or listening item, a
 * speaking item's model sentence, and every match-pairs card. A sentence
 * recorded once plays wherever it is used.
 *
 * "Record next missing" walks the missing items in course order: save one and
 * the next comes up. Anything else can be recorded too, through "Add a phrase".
 */
export function LessonAudio(): React.JSX.Element {
  const [items, setItems] = useState<Item[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('missing');
  const [selected, setSelected] = useState<string | null>(null);
  const [walking, setWalking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [phrase, setPhrase] = useState('');
  const [phraseProblem, setPhraseProblem] = useState<string | null>(null);
  const rows = useRef(new Map<string, HTMLElement>());
  const player = usePlayer();
  // a save resolves after the upload; by then the list may have moved on
  const latest = useRef({ items, walking });
  latest.current = { items, walking };

  const load = useCallback(async () => {
    try {
      const res = await api<Listing>('/admin/lesson-audio');
      setItems(res.items);
      setError(null);
      return res.items;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load what the lessons need');
      return null;
    } finally {
      setLoaded(true);
    }
  }, []);

  // open on what is missing, or on everything when nothing is
  const started = useRef(false);
  useEffect(() => {
    void load().then((loadedItems) => {
      if (started.current || !loadedItems) return;
      started.current = true;
      if (!loadedItems.some((i) => !i.recorded)) setFilter('all');
    });
  }, [load]);

  const ordered = useMemo(() => displayOrder(items), [items]);
  // the selected item stays on screen even when the filter would hide it — it
  // was just recorded, say, and the editor should see that it worked
  const shown = useMemo(() => ordered.filter((i) => matches(i, filter) || i.key === selected), [ordered, filter, selected]);
  const grouped = useMemo(() => group(shown), [shown]);
  const done = progress(items);
  const n = counts(items);

  const select = (key: string | null): void => {
    setSelected(key);
    setNote(null);
  };

  // bring the selected row into view, for the keyboard and for the walk
  useEffect(() => {
    if (selected) rows.current.get(selected)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selected]);

  const startWalk = (): void => {
    const first = nextMissing(ordered, selected);
    if (!first) {
      setWalking(false);
      setNote('Everything is recorded.');
      return;
    }
    setWalking(true);
    select(first.key);
  };

  const onSaved = (saved: { key: string; url: string; durationMs: number; updatedAt: string }): void => {
    const next = withRecording(latest.current.items, saved);
    setItems(next);
    if (!latest.current.walking) return;
    const after = nextMissing(displayOrder(next), saved.key);
    if (after) {
      select(after.key);
    } else {
      setWalking(false);
      setNote('That was the last one: everything is recorded.');
    }
  };

  const onRemoved = (key: string): void => {
    const removed = latest.current.items.find((i) => i.key === key);
    setItems(withoutRecording(latest.current.items, key));
    if (removed && isLoose(removed)) select(null);
  };

  const add = (): void => {
    const res = addPhrase(items, phrase);
    if (!res.ok) {
      setPhraseProblem(res.problem);
      return;
    }
    setPhraseProblem(null);
    setPhrase('');
    setItems(res.items);
    setWalking(false);
    select(res.key);
    if (res.existed) setNote('That is already on the list: it is selected below.');
  };

  const move = (step: number): void => {
    const next = neighbour(shown, selected, step);
    if (next) select(next.key);
  };

  const left = n.missing;

  return (
    <div>
      <div className="card aa-summary">
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <strong>
            {done.recorded} of {done.needed} recorded
          </strong>
          <button type="button" className="primary" onClick={startWalk} disabled={!loaded || left === 0}>
            {walking ? 'Skip to the next missing' : 'Record next missing'}
          </button>
        </div>
        <div className="progress" style={{ marginTop: 10 }} aria-label="Recorded so far">
          <div className="progress-bar" style={{ width: `${done.needed ? (done.recorded / done.needed) * 100 : 0}%` }} />
        </div>
        <p className="subtle la-what">
          Every Kurdish word and sentence the lessons use, drafts included: each item’s “say”, the first accepted answer of a
          translation, writing or listening item, a speaking item’s model sentence, and every match-pairs card. One recording plays
          wherever its sentence is used. Until a text is recorded, learners hear nothing for it — and a listening item cannot be
          played at all.
        </p>
      </div>

      {walking && (
        <div className="card la-walk" role="status">
          <span>
            Recording what is missing — {left} left. Save and the next one comes up.
          </span>
          <button type="button" onClick={() => setWalking(false)}>
            Stop
          </button>
        </div>
      )}
      {note && (
        <div className="card la-walk" role="status">
          <span>{note}</span>
          <button type="button" className="ghost" onClick={() => setNote(null)}>
            Close
          </button>
        </div>
      )}

      {error && <div className="error" style={{ margin: '12px 0' }}>{error}</div>}

      <div className="tabs" role="tablist" aria-label="Show">
        {FILTERS.map(([f, label]) => (
          <button key={f} type="button" role="tab" aria-selected={filter === f} className={`tab${filter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>
            {label} ({n[f]})
          </button>
        ))}
      </div>

      {loaded && shown.length === 0 && (
        <div className="empty">
          {items.length === 0
            ? 'No lesson has any Kurdish to record yet.'
            : filter === 'missing'
              ? 'Everything is recorded.'
              : filter === 'unused'
                ? 'Every recording is used by a lesson.'
                : 'Nothing recorded yet.'}
        </div>
      )}

      {grouped.courses.map((course) => (
        <section key={course.id} className="la-course">
          <h2 className="la-course-title">{course.title}</h2>
          {course.units.map((unit) => (
            <div key={unit.id}>
              <div className="section-title">{unit.title}</div>
              {unit.lessons.map((lesson) => (
                <div key={lesson.id} className="card la-lesson">
                  <div className="la-lesson-head">
                    <strong>{lesson.title}</strong>
                    <span className="subtle">{lesson.skillTitle}</span>
                    <span className={`badge${lesson.live ? ' ok' : ''}`}>{lesson.live ? 'Live' : 'Draft'}</span>
                  </div>
                  {lesson.items.map((item) => (
                    <Row
                      key={item.key}
                      item={item}
                      selected={item.key === selected}
                      rowRef={(el) => (el ? rows.current.set(item.key, el) : rows.current.delete(item.key))}
                      onSelect={() => select(item.key === selected ? null : item.key)}
                      player={player}
                      onSaved={onSaved}
                      onRemoved={onRemoved}
                      onPrev={() => move(-1)}
                      onNext={() => move(1)}
                    />
                  ))}
                </div>
              ))}
            </div>
          ))}
        </section>
      ))}

      {grouped.loose.length > 0 && (
        <section className="la-course">
          <h2 className="la-course-title">Not in any lesson</h2>
          <div className="card la-lesson">
            <div className="subtle">
              Phrases added here, and recordings whose text no lesson uses any more. They play nowhere until a lesson uses the same
              text.
            </div>
            {grouped.loose.map((item) => (
              <Row
                key={item.key}
                item={item}
                selected={item.key === selected}
                rowRef={(el) => (el ? rows.current.set(item.key, el) : rows.current.delete(item.key))}
                onSelect={() => select(item.key === selected ? null : item.key)}
                player={player}
                onSaved={onSaved}
                onRemoved={onRemoved}
                onPrev={() => move(-1)}
                onNext={() => move(1)}
              />
            ))}
          </div>
        </section>
      )}

      <div className="card la-add">
        <label htmlFor="la-phrase" className="aa-say-label">
          Add a phrase
        </label>
        <div className="subtle">Record something before a lesson uses it. Kurmancî or Soranî, as learners will read it.</div>
        <form
          className="row la-add-form"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input
            id="la-phrase"
            dir="auto"
            value={phrase}
            maxLength={LESSON_AUDIO_TEXT_MAX}
            placeholder="Newroz pîroz be"
            onChange={(e) => setPhrase(e.target.value)}
          />
          <button type="submit">Add</button>
        </form>
        {phraseProblem && <div className="error">{phraseProblem}</div>}
      </div>

      <div className="aa-tips subtle la-tips">
        <p>
          Say it once, at a natural pace a learner can follow, exactly as written. Silence before and after is cut and the volume is
          levelled. Up to {LESSON_AUDIO_MAX_SECONDS} seconds once trimmed; files from a phone (m4a, mp3, wav) work too.
        </p>
        <ShortcutHint />
      </div>
    </div>
  );
}

function Row({
  item,
  selected,
  rowRef,
  onSelect,
  player,
  onSaved,
  onRemoved,
  onPrev,
  onNext,
}: {
  item: Item;
  selected: boolean;
  rowRef: (el: HTMLElement | null) => void;
  onSelect: () => void;
  player: Player;
  onSaved: (saved: { key: string; url: string; durationMs: number; updatedAt: string }) => void;
  onRemoved: (key: string) => void;
  onPrev: () => void;
  onNext: () => void;
}): React.JSX.Element {
  const script = scriptOf(item.text);
  const [first, ...more] = item.usedIn;
  const listening = neededForListening(item);
  const status = item.recorded
    ? { label: 'Recorded', tone: ' ok' }
    : isLoose(item)
      ? { label: 'Not recorded', tone: '' }
      : listening
        ? { label: 'Missing · listening needs it', tone: ' danger' }
        : { label: 'Missing', tone: ' mid' };
  const removePrompt = `Remove the recording of “${item.text}”?\n\n${
    isLoose(item)
      ? 'No lesson uses it, so it leaves this list.'
      : listening
        ? 'Its listening item cannot be played until a new one is saved.'
        : 'Learners hear no recording of it until a new one is saved.'
  }`;

  return (
    <div ref={rowRef} className={`la-row${selected ? ' is-on' : ''}`}>
      <div className="la-row-line">
        <button
          type="button"
          className="ghost la-play"
          onClick={() => item.url && player.toggle(item.url)}
          disabled={!item.url}
          aria-label={item.url ? `Play “${item.text}”` : 'No recording yet'}
          title={item.url ? 'Play' : 'No recording yet'}
        >
          {item.url && player.playing === item.url ? '■' : '▶'}
        </button>
        <button type="button" className="ghost la-row-main" onClick={onSelect} aria-expanded={selected}>
          <span className="la-text" lang={script.lang} dir={script.dir}>
            {item.text}
          </span>
          <span className="subtle la-used">
            {first ? describeUsage(first) : 'Not in any lesson'}
            {more.length > 0 && ` · also ${more.length === 1 ? describeUsage(more[0]!) : `in ${more.length} more lessons`}`}
          </span>
        </button>
        <span className={`badge${status.tone}`}>{status.label}</span>
      </div>
      {selected && (
        <div className="la-studio">
          <ClipRecorder
            say={item.text}
            maxSeconds={LESSON_AUDIO_MAX_SECONDS}
            what="one sentence"
            recording={item.url ? { url: item.url, durationMs: item.durationMs, updatedAt: item.updatedAt } : null}
            shortcuts
            onPrev={onPrev}
            onNext={onNext}
            onSave={async (wav) => {
              const res = await apiUpload<{ key: string; url: string; durationMs: number; updatedAt: string }>(
                `/admin/lesson-audio?text=${encodeURIComponent(item.text)}`,
                wav,
                'audio/wav',
              );
              onSaved({ key: item.key, url: res.url, durationMs: res.durationMs, updatedAt: res.updatedAt });
            }}
            removePrompt={removePrompt}
            onRemove={async () => {
              await api(`/admin/lesson-audio?key=${encodeURIComponent(item.key)}`, { method: 'DELETE' });
              onRemoved(item.key);
            }}
          />
        </div>
      )}
    </div>
  );
}

interface Player {
  playing: string | null;
  toggle: (url: string) => void;
}

/** One audio element for the whole list, so starting a row stops the last one. */
function usePlayer(): Player {
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(
    () => () => {
      audio.current?.pause();
    },
    [],
  );
  const toggle = (url: string): void => {
    const el = (audio.current ??= new Audio());
    if (playing === url && !el.paused) {
      el.pause();
      setPlaying(null);
      return;
    }
    el.onended = () => setPlaying(null);
    el.onerror = () => setPlaying(null);
    el.src = url;
    setPlaying(url);
    void el.play().catch(() => setPlaying(null));
  };
  return { playing, toggle };
}
