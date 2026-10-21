import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LESSON_AUDIO_MAX_SECONDS, LESSON_AUDIO_TEXT_MAX } from '@kurda/shared';
import { api, ApiError } from '../api';
import { ClipRecorder, ShortcutHint } from '../recorder';
import {
  addPhrase,
  counts,
  describeUsage,
  displayOrder,
  group,
  inScope,
  isLoose,
  isStoryUsage,
  matches,
  neededForListening,
  neighbour,
  nextMissing,
  progress,
  scriptOf,
  withRecording,
  withVoice,
  withoutRecording,
  type Filter,
  type Item,
  type Listing,
  type Saved,
  type Scope,
} from '../lessonAudio';
import { Banner, Button, EmptyState, ErrorState, Icon, Loading, Tabs, useDialogs } from '../ui';
import { SpeakerPicker, bustUrl, speakerName, useSpeakerChange } from '../ui/SpeakerPicker';
import { SpeakingPreview } from '../ui/SpeakingPreview';
import { rememberSpeaker, rememberedSpeaker, uploadWithVoice, type Speaker } from '../voice';

const FILTER_LABEL: Record<Filter, string> = {
  missing: 'Still to record',
  recorded: 'Recorded',
  unused: 'Not used anywhere',
  all: 'All',
};

/**
 * Recording the Kurdish the lessons and the stories use: two sides of the
 * audio studio ("Record lesson sentences", "Record story sentences") over the
 * one list the API reads off every lesson and story — published or still a
 * draft — so an editor can record before anything goes live.
 *
 * For a lesson: each item's `say`, the first accepted answer of a translation,
 * writing or listening item, a speaking item's model sentence, and every
 * match-pairs card. For a story: every sentence, as the story reader cuts it.
 * A sentence recorded once is sent with everything that uses it — with the
 * exercise, or once it is answered where hearing it first would give the
 * answer away (api/src/lessonaudio/delivery.ts).
 *
 * "Record next missing" walks the missing items in course order: save one and
 * the next comes up. A "Record" link from the lesson or story list opens this
 * on that one lesson or story (`focus`). Anything else can be recorded too,
 * through "Add a phrase".
 *
 * Each row's studio also says who is shown saying it: a new take goes up with
 * that character and a mouth timeline made from it (voice.ts), and a change
 * to a saved one is sent at once.
 */
export function LessonAudio({
  scope = 'lessons',
  initialFilter,
  focus = null,
}: {
  scope?: Scope;
  /** from the address (?show=missing): the dashboard's link opens on what is missing */
  initialFilter?: Filter;
  /** one lesson (<skillId>:<position>) or story (<storyId>:0) to show alone */
  focus?: string | null;
}): React.JSX.Element {
  const dialogs = useDialogs();
  const [items, setItems] = useState<Item[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState<Filter>(initialFilter ?? 'missing');
  const [selected, setSelected] = useState<string | null>(null);
  const [walking, setWalking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [phrase, setPhrase] = useState('');
  const [phraseProblem, setPhraseProblem] = useState<string | null>(null);
  const rows = useRef(new Map<string, HTMLElement>());
  const player = usePlayer();
  // who says the next new recording: the last choice made for one
  const [nextSpeaker, setNextSpeaker] = useState<Speaker>(rememberedSpeaker);
  const changeSpeaker = useSpeakerChange('lesson', (key, speaker) => setItems((all) => withVoice(all, key, speaker)));

  // this side's view of the list: only its own uses of each text
  const scoped = useMemo(() => items.flatMap((i) => inScope(i, scope, focus) ?? []), [items, scope, focus]);
  const full = useMemo(() => new Map(items.map((i) => [i.key, i])), [items]);

  // a save resolves after the upload; by then the list may have moved on
  const latest = useRef({ items, scoped, walking });
  latest.current = { items, scoped, walking };

  const load = useCallback(async () => {
    try {
      const res = await api<Listing>('/admin/lesson-audio');
      setItems(res.items);
      setError(null);
      return res.items;
    } catch (err) {
      setError(err);
      return null;
    } finally {
      setLoaded(true);
    }
  }, []);

  // open on what is missing, or on everything when nothing is
  const started = useRef(false);
  useEffect(() => {
    void load().then((loadedItems) => {
      if (started.current || !loadedItems || initialFilter) return;
      started.current = true;
      if (!loadedItems.some((i) => !i.recorded && inScope(i, scope, focus))) setFilter('all');
    });
  }, [load, initialFilter, scope, focus]);

  const ordered = useMemo(() => displayOrder(scoped), [scoped]);
  // the selected item stays on screen even when the filter would hide it — it
  // was just recorded, say, and the editor should see that it worked
  const shown = useMemo(() => ordered.filter((i) => matches(i, filter) || i.key === selected), [ordered, filter, selected]);
  const grouped = useMemo(() => group(shown), [shown]);
  const done = progress(scoped);
  const n = counts(scoped);
  const focusTitle = focus ? scoped.find((i) => i.usedIn[0])?.usedIn[0]?.lessonTitle : null;

  const select = (key: string | null): void => {
    setSelected(key);
    setNote(null);
  };

  // bring the selected row into view, for the keyboard and for the walk
  useEffect(() => {
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (selected) rows.current.get(selected)?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [selected]);

  const startWalk = (): void => {
    // start on the row the editor has open, if it is one still to record
    const open = !walking ? ordered.find((i) => i.key === selected && !i.recorded) : undefined;
    const first = open ?? nextMissing(ordered, selected);
    if (!first) {
      setWalking(false);
      setNote('Everything here is recorded.');
      return;
    }
    setWalking(true);
    select(first.key);
  };

  const onSaved = (saved: Saved): void => {
    const next = withRecording(latest.current.items, saved);
    setItems(next);
    if (!latest.current.walking) return;
    const after = nextMissing(displayOrder(next.flatMap((i) => inScope(i, scope, focus) ?? [])), saved.key);
    if (after) {
      select(after.key);
    } else {
      setWalking(false);
      setNote('That was the last one: everything here is recorded.');
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
  const filters: Filter[] = scope === 'lessons' && !focus ? ['missing', 'recorded', 'unused', 'all'] : ['missing', 'recorded', 'all'];
  const renderRow = (item: Item): React.JSX.Element => (
    <Row
      key={item.key}
      item={item}
      full={full.get(item.key) ?? item}
      selected={item.key === selected}
      rowRef={(el) => (el ? rows.current.set(item.key, el) : rows.current.delete(item.key))}
      onSelect={() => select(item.key === selected ? null : item.key)}
      player={player}
      nextSpeaker={nextSpeaker}
      onSpeaker={(speaker) => {
        if (item.recorded) {
          changeSpeaker({ key: item.key, from: item.speaker ?? null, to: speaker, label: item.text });
        } else {
          setNextSpeaker(speaker);
          rememberSpeaker(speaker);
        }
      }}
      onSaved={onSaved}
      onRemoved={onRemoved}
      onPrev={() => move(-1)}
      onNext={() => move(1)}
      confirm={dialogs.confirm}
    />
  );

  if (error && !loaded) return <ErrorState error={error} onRetry={() => void load()} what="the audio studio" />;

  return (
    <div>
      {focus && (
        <Banner
          tone="info"
          title={focusTitle ? `Only “${focusTitle}”` : scope === 'stories' ? 'One story' : 'One lesson'}
          actions={
            <a className="button-link" href={`#/audio/${scope}`}>
              Show every {scope === 'stories' ? 'story' : 'lesson'}
            </a>
          }
        >
          {loaded && scoped.length === 0
            ? `It has no Kurdish to record yet${scope === 'stories' ? ': write its text first' : ''}.`
            : `The sentences ${scope === 'stories' ? 'this story' : 'this lesson'} uses.`}
        </Banner>
      )}

      <div className="card aa-summary">
        <div className="aa-summary-head">
          <div>
            <strong className="aa-count">
              {done.recorded} of {done.needed} recorded
            </strong>
            <div className="subtle">
              {scope === 'stories'
                ? 'Every sentence of every story not archived, drafts included. A story is sent with the recordings of its sentences.'
                : `Every Kurdish word and sentence the lessons use, drafts included, up to ${LESSON_AUDIO_TEXT_MAX} characters.`}
            </div>
          </div>
          <Button variant="primary" icon="mic" onClick={startWalk} disabled={!loaded || left === 0}>
            {walking ? 'Skip to the next missing' : 'Record next missing'}
          </Button>
        </div>
        <div className="progress" role="progressbar" aria-label="Recorded so far" aria-valuemin={0} aria-valuemax={done.needed} aria-valuenow={done.recorded}>
          <div className="progress-bar" style={{ width: `${done.needed ? (done.recorded / done.needed) * 100 : 0}%` }} />
        </div>
        {scope === 'lessons' && (
          <details className="aa-more">
            <summary>What is on this list</summary>
            <p className="subtle">
              Each item’s “say”, the first accepted answer of a translation, writing or listening item, a speaking item’s model
              sentence, and every match-pairs card. One recording is sent with every exercise that uses its sentence, in any lesson:
              with the exercise, or once it is answered where hearing it first would give the answer away. A listening item without a
              clip of its own uses the recording as its clip, so its lesson cannot be published until the recording is made.
            </p>
          </details>
        )}
      </div>

      {walking && (
        <Banner tone="info" actions={<Button onClick={() => setWalking(false)}>Stop</Button>}>
          <span role="status">Recording what is missing — {left} left. Save and the next one comes up.</span>
        </Banner>
      )}
      {note && (
        <Banner tone="ok" actions={<Button variant="ghost" onClick={() => setNote(null)}>Close</Button>}>
          <span role="status">{note}</span>
        </Banner>
      )}

      {error != null && loaded && <ErrorState error={error} onRetry={() => void load()} compact />}

      <Tabs label="Show" value={filter} onChange={setFilter} items={filters.map((f) => ({ key: f, label: FILTER_LABEL[f], count: n[f] }))} />

      {!loaded && <Loading rows={4} />}

      {loaded && shown.length === 0 && (
        <div className="card">
          <EmptyState
            title={
              scoped.length === 0
                ? scope === 'stories'
                  ? 'No story has sentences to record yet.'
                  : 'No lesson has any Kurdish to record yet.'
                : filter === 'missing'
                  ? 'Everything here is recorded.'
                  : filter === 'unused'
                    ? 'Every recording is used by a lesson or a story.'
                    : 'Nothing recorded yet.'
            }
            icon={filter === 'missing' && scoped.length > 0 ? 'check' : 'mic'}
          />
        </div>
      )}

      {grouped.courses.map((course) => (
        <section key={course.id} className="la-course">
          <h2 className="la-course-title">{course.title}</h2>
          {course.units.map((unit) => (
            <div key={unit.id}>
              {/* a story is its own unit and lesson: its card says its title once */}
              {!unit.lessons.every((l) => l.story) && <div className="section-title">{unit.title}</div>}
              {unit.lessons.map((lesson) => (
                <div key={lesson.id} className="card la-lesson">
                  <div className="la-lesson-head">
                    <strong lang={lesson.story ? scriptOf(lesson.title).lang : undefined} dir={lesson.story ? scriptOf(lesson.title).dir : undefined}>
                      {lesson.title}
                    </strong>
                    <span className="subtle">{lesson.story ? 'Story' : lesson.skillTitle}</span>
                    <span className={`badge${lesson.live ? ' ok' : ''}`}>{lesson.live ? 'Published' : 'Not published yet'}</span>
                  </div>
                  {lesson.items.map(renderRow)}
                </div>
              ))}
            </div>
          ))}
        </section>
      ))}

      {grouped.loose.length > 0 && (
        <section className="la-course">
          <h2 className="la-course-title">Not in a lesson or story</h2>
          <div className="card la-lesson">
            <div className="subtle">
              Phrases added here, and recordings whose text no lesson or story uses any more. They are sent with nothing until a
              lesson or a story uses the same text.
            </div>
            {grouped.loose.map(renderRow)}
          </div>
        </section>
      )}

      {scope === 'lessons' && !focus && (
        <div className="card la-add">
          <label htmlFor="la-phrase" className="aa-say-label">
            Add a phrase
          </label>
          <div className="subtle">Record something before a lesson or a story uses it. Kurmancî or Soranî, as learners will read it.</div>
          <form
            className="la-add-form"
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
              aria-invalid={phraseProblem ? true : undefined}
              aria-describedby={phraseProblem ? 'la-phrase-problem' : undefined}
              onChange={(e) => setPhrase(e.target.value)}
            />
            <Button type="submit" icon="plus">
              Add
            </Button>
          </form>
          {phraseProblem && (
            <div id="la-phrase-problem" className="field-error">
              {phraseProblem}
            </div>
          )}
        </div>
      )}

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
  full,
  selected,
  rowRef,
  onSelect,
  player,
  nextSpeaker,
  onSpeaker,
  onSaved,
  onRemoved,
  onPrev,
  onNext,
  confirm,
}: {
  /** the item as this side of the studio sees it */
  item: Item;
  /** the item with every use, lessons and stories alike: what a removal affects */
  full: Item;
  selected: boolean;
  rowRef: (el: HTMLElement | null) => void;
  onSelect: () => void;
  player: Player;
  /** who says it when it is recorded now, if it has no recording yet */
  nextSpeaker: Speaker;
  onSpeaker: (speaker: Speaker) => void;
  onSaved: (saved: Saved) => void;
  onRemoved: (key: string) => void;
  onPrev: () => void;
  onNext: () => void;
  confirm: ReturnType<typeof useDialogs>['confirm'];
}): React.JSX.Element {
  const script = scriptOf(item.text);
  const speaker = item.recorded ? (item.speaker ?? null) : nextSpeaker;
  const [first, ...more] = full.usedIn;
  const listening = neededForListening(full);
  const status = item.recorded
    ? { label: 'Recorded', tone: ' ok' }
    : isLoose(full)
      ? { label: 'Not recorded', tone: '' }
      : listening
        ? { label: 'Missing · listening needs it', tone: ' danger' }
        : { label: 'Missing', tone: ' mid' };
  const removePrompt = `Remove the recording of “${item.text}”?\n\n${
    isLoose(full)
      ? 'No lesson or story uses it, so it leaves this list.'
      : listening
        ? 'A listening item uses it as its clip: until a new one is saved, that item has nothing to play.'
        : full.usedIn.every(isStoryUsage)
          ? 'The stories that use it go without a recording of it until a new one is saved.'
          : 'The exercises that use it go without a recording until a new one is saved.'
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
          <Icon name={item.url && player.playing === item.url ? 'stop' : 'play'} size={16} />
        </button>
        <button type="button" className="ghost la-row-main" onClick={onSelect} aria-expanded={selected}>
          <span className="la-text" lang={script.lang} dir={script.dir}>
            {item.text}
          </span>
          <span className="subtle la-used">
            {first ? describeUsage(first) : 'Not in a lesson or story'}
            {more.length > 0 &&
              ` · also ${
                more.length === 1
                  ? describeUsage(more[0]!)
                  : `in ${more.length} more ${
                      more.every(isStoryUsage) ? 'stories' : more.some(isStoryUsage) ? 'lessons and stories' : 'lessons'
                    }`
              }`}
          </span>
        </button>
        {item.recorded && item.speaker && (
          <img className="voice-tag" src={bustUrl(item.speaker)} width={28} height={28} alt={`Said by ${speakerName(item.speaker)}`} title={`Said by ${speakerName(item.speaker)}`} />
        )}
        <span className={`badge${status.tone}`}>{status.label}</span>
      </div>
      {selected && (
        <div className="la-studio">
          <div className="voice-row">
            <SpeakerPicker
              value={speaker}
              onChange={onSpeaker}
              hint={item.recorded ? 'Changed as soon as you choose.' : 'Saved with the recording, and kept for the next one.'}
            />
            {item.recorded && item.url && item.speaker && (
              <SpeakingPreview
                key={`${item.url}|${item.speaker}`}
                speaker={item.speaker}
                url={item.url}
                text={item.text}
                lipsync={item.lipsync}
                durationMs={item.durationMs}
              />
            )}
          </div>
          <ClipRecorder
            say={item.text}
            maxSeconds={LESSON_AUDIO_MAX_SECONDS}
            what="one sentence"
            recording={item.url ? { url: item.url, durationMs: item.durationMs, updatedAt: item.updatedAt } : null}
            shortcuts
            onPrev={onPrev}
            onNext={onNext}
            onSave={async (wav) => {
              const res = await uploadWithVoice<Saved>(`/admin/lesson-audio?text=${encodeURIComponent(item.text)}`, wav, { speaker, text: item.text });
              onSaved({ ...res, key: item.key });
            }}
            removePrompt={removePrompt}
            onRemove={async () => {
              const remove = (force: boolean) =>
                api(`/admin/lesson-audio?key=${encodeURIComponent(item.key)}${force ? '&force=1' : ''}`, { method: 'DELETE' });
              try {
                // the prompt the editor just confirmed already said what a listening item loses
                await remove(listening);
              } catch (err) {
                // a lesson published since the list was loaded: ask again, with what the server knows
                if (!(err instanceof ApiError && err.code === 'LISTENING_AUDIO_IN_USE')) throw err;
                const yes = await confirm({ title: 'A listening item plays this', body: err.message, confirmLabel: 'Remove anyway', tone: 'danger' });
                if (!yes) return;
                await remove(true);
              }
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
