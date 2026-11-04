import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LESSON_AUDIO_MAX_SECONDS, LESSON_AUDIO_TEXT_MAX, type SpeakerId } from '@kurda/shared';
import { api } from '../api';
import { ShortcutHint } from '../recorder';
import { conversationHref } from '../conversations';
import {
  addPhrase,
  counts,
  coursesOf,
  describeUsage,
  displayOrder,
  group,
  inCourse,
  inScope,
  isLoose,
  isStoryUsage,
  matches,
  matchesVoice,
  neededForListening,
  neighbour,
  nextMissing,
  progress,
  recordPath,
  recordingPlan,
  scriptHref,
  scriptOf,
  voiceCounts,
  voiceOf,
  withRecording,
  withTimelines,
  withVoice,
  withoutRecording,
  type CoursePlan,
  type Filter,
  type Item,
  type Listing,
  type Saved,
  type Scope,
  type VoiceFilter,
} from '../lessonAudio';
import { Banner, Button, EmptyState, ErrorState, Icon, Loading, Tabs, useDialogs } from '../ui';
import { bustUrl, speakerName, useSpeakerChange } from '../ui/SpeakerPicker';
import { rememberSpeaker, rememberedSpeaker, type Speaker } from '../voice';
import { VOICE_ORDER, voiceName } from '../voicePlan';
import { SentenceStudio, usePlayer, type Player } from './SentenceStudio';

const FILTER_LABEL: Record<Filter, string> = {
  missing: 'Still to record',
  recorded: 'Recorded',
  unused: 'Not used anywhere',
  all: 'All',
};

const VOICE_FILTERS: readonly VoiceFilter[] = ['all', ...VOICE_ORDER];

/** The lessons' side of the studio, every sentence in it, narrowed to one course or not: #/audio/lessons[?course=…]. */
function studioHref(course: string | null): string {
  return `#/audio/lessons${course ? `?course=${encodeURIComponent(course)}` : ''}`;
}

/**
 * Recording the Kurdish the lessons and the stories use: two sides of the
 * audio studio ("Record lesson sentences", "Record story sentences") over the
 * one list the API reads off every lesson and story — published or still a
 * draft — so an editor can record before anything goes live.
 *
 * For a lesson: each item's `say`, the first accepted answer of a writing or
 * listening item and of a translation without `say` (one with it goes from
 * Kurdish to English, and its answers are English), a speaking item's model
 * sentence, and every match-pairs card. For a story: every sentence, as the story reader cuts it.
 * A sentence recorded once is sent with everything that uses it — with the
 * exercise, or once it is answered where hearing it first would give the
 * answer away (api/src/lessonaudio/delivery.ts).
 *
 * "Record next missing" walks the missing items in course order: save one and
 * the next comes up. A "Record" link from the lesson or story list opens this
 * on that one lesson or story (`focus`). Anything else can be recorded too,
 * through "Add a phrase".
 *
 * Each row's studio (SentenceStudio, which the story editor shares) also says
 * who is shown saying it: a new take goes up with that character and a mouth
 * timeline made from it (voice.ts), and a change to a saved one is sent at once.
 *
 * The lessons say who records what (`voice` on an exercise, a conversation
 * line's character), and the studio follows that plan: a row still to record
 * says who it is for, with their bust, and its picker opens on them; the Voice
 * filter shows one character's lines, counting what is left for each; the
 * Recording plan card gives each character's progress, course by course. A
 * character's script (`voice`, #/audio/lessons?voice=hamo&course=…) lists
 * their lines alone, recorded or not, numbered in course order under each
 * lesson's heading, so the person who voices them can sit down and say them
 * in a row with the same recorder and keys. The course filter narrows any of
 * this to one course — the road, say, apart from the older lessons.
 */
export function LessonAudio({
  scope = 'lessons',
  initialFilter,
  focus = null,
  course: initialCourse = null,
  voice: scriptVoice = null,
}: {
  scope?: Scope;
  /** from the address (?show=missing): the dashboard's link opens on what is missing */
  initialFilter?: Filter;
  /** one lesson (<skillId>:<position>) or story (<storyId>:0) to show alone */
  focus?: string | null;
  /** from the address (?course=kurmanji-road): open on one course's sentences */
  course?: string | null;
  /** from the address (?voice=hamo): that character's script */
  voice?: SpeakerId | null;
}): React.JSX.Element {
  const dialogs = useDialogs();
  // a course and a script are the lessons' whole list narrowed, not one lesson's or a story's
  const wide = scope === 'lessons' && !focus;
  const script = wide ? scriptVoice : null;
  const [items, setItems] = useState<Item[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // a script lists every line, recorded or not, so the numbers stay put as they are recorded
  const [filter, setFilter] = useState<Filter>(initialFilter ?? (script ? 'all' : 'missing'));
  const [course, setCourse] = useState<string | null>(wide ? initialCourse : null);
  const [voice, setVoice] = useState<VoiceFilter>('all');
  // who records a row the plan gives to someone, when the editor chooses another for it
  const [picks, setPicks] = useState<ReadonlyMap<string, Speaker>>(() => new Map());
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
  const timelines = useRef<'unasked' | 'asked'>('unasked');

  // this side's view of the list: only its own uses of each text, in the course chosen, then the voice chosen
  const scoped = useMemo(() => items.flatMap((i) => inScope(i, scope, focus) ?? []), [items, scope, focus]);
  const inThisCourse = useMemo(() => scoped.flatMap((i) => inCourse(i, course) ?? []), [scoped, course]);
  const view = useCallback(
    (all: readonly Item[]): Item[] =>
      all.flatMap((i) => {
        const seen = inScope(i, scope, focus);
        const here = seen ? inCourse(seen, course) : null;
        return here && (script ? voiceOf(here) === script : matchesVoice(here, voice)) ? [here] : [];
      }),
    [scope, focus, course, script, voice],
  );
  const listed = useMemo(() => view(items), [view, items]);
  const full = useMemo(() => new Map(items.map((i) => [i.key, i])), [items]);

  // a save resolves after the upload; by then the list may have moved on
  const latest = useRef({ items, view, walking });
  latest.current = { items, view, walking };

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
      if (started.current || !loadedItems || initialFilter || script) return;
      started.current = true;
      if (!loadedItems.some((i) => !i.recorded && inScope(i, scope, focus))) setFilter('all');
    });
  }, [load, initialFilter, scope, focus, script]);

  const ordered = useMemo(() => displayOrder(listed), [listed]);
  // the selected item stays on screen even when the filter would hide it — it
  // was just recorded, say, and the editor should see that it worked
  const shown = useMemo(() => ordered.filter((i) => matches(i, filter) || i.key === selected), [ordered, filter, selected]);
  const grouped = useMemo(() => group(shown), [shown]);
  // a script's numbers are each line's place among all of the character's lines
  const numbers = useMemo(() => new Map(ordered.map((i, at) => [i.key, at + 1])), [ordered]);
  const done = progress(listed);
  const n = counts(listed);
  const focusTitle = focus ? scoped.find((i) => i.usedIn[0])?.usedIn[0]?.lessonTitle : null;
  const courseOptions = useMemo(() => {
    const listedCourses = coursesOf(scoped);
    // a course asked for by the address that has nothing here yet is still the one chosen
    return course && !listedCourses.some((c) => c.slug === course) ? [...listedCourses, { slug: course, title: course }] : listedCourses;
  }, [scoped, course]);
  const courseTitle = course ? (courseOptions.find((c) => c.slug === course)?.title ?? course) : null;
  const leftFor = voiceCounts(inThisCourse);
  const planned = inThisCourse.some((i) => i.plannedSpeaker);
  const plan = useMemo(() => recordingPlan(inThisCourse), [inThisCourse]);

  const select = (key: string | null): void => {
    setSelected(key);
    setNote(null);
  };

  // The stored timelines, for the preview of a recording saved before: the
  // list is read without them, since every sentence's would make it much
  // heavier, and read once more with them only when an opened row needs one.
  useEffect(() => {
    const open = items.find((i) => i.key === selected);
    if (!open?.recorded || !open.speaker || !open.hasLipsync || open.lipsync !== undefined || timelines.current !== 'unasked') return;
    timelines.current = 'asked';
    api<Listing>('/admin/lesson-audio?withLipsync=1').then(
      (res) => setItems((all) => withTimelines(all, res.items)),
      () => {
        // the preview times the mouth from the words meanwhile; the next row opened asks again
        timelines.current = 'unasked';
      },
    );
  }, [selected, items]);

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
    const after = nextMissing(displayOrder(latest.current.view(next)), saved.key);
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
  // what no lesson uses is in no course and no one's script
  const filters: Filter[] = wide && !course && voice === 'all' ? ['missing', 'recorded', 'unused', 'all'] : ['missing', 'recorded', 'all'];
  const emptyTitle = (): string => {
    if (script) return `Nothing ${courseTitle ? `in ${courseTitle} ` : ''}is planned for ${voiceName(script)} yet.`;
    if (scoped.length === 0) return scope === 'stories' ? 'No story has sentences to record yet.' : 'No lesson has any Kurdish to record yet.';
    if (listed.length === 0) return voice === 'all' ? 'No lesson in this course has any Kurdish to record yet.' : `Nothing here is planned for ${voiceName(voice)}.`;
    if (filter === 'missing') return 'Everything here is recorded.';
    return filter === 'unused' ? 'Every recording is used by a lesson or a story.' : 'Nothing recorded yet.';
  };
  const chooseCourse = (next: string | null): void => {
    setCourse(next);
    setWalking(false);
  };
  const renderRow = (item: Item): React.JSX.Element => (
    <Row
      key={item.key}
      item={item}
      full={full.get(item.key) ?? item}
      selected={item.key === selected}
      rowRef={(el) => (el ? rows.current.set(item.key, el) : rows.current.delete(item.key))}
      onSelect={() => select(item.key === selected ? null : item.key)}
      player={player}
      number={script ? numbers.get(item.key) : undefined}
      showPlan={!script}
      nextSpeaker={nextSpeaker}
      picked={picks.get(item.key)}
      onSpeaker={(speaker) => {
        if (item.recorded) {
          changeSpeaker({ key: item.key, from: item.speaker ?? null, to: speaker, label: item.text });
        } else if (item.line || item.plannedSpeaker) {
          // a choice against the plan is for this row alone; the plan stays the default for the rest
          setPicks((all) => new Map(all).set(item.key, speaker));
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

      {script ? (
        <ScriptHead
          voice={script}
          course={course}
          courseTitle={courseTitle}
          courses={courseOptions}
          onCourse={chooseCourse}
          lines={ordered.length}
          done={done}
          walking={walking}
          canWalk={loaded && left > 0}
          onWalk={startWalk}
        />
      ) : (
        <StudioSummary scope={scope} done={done} walking={walking} canWalk={loaded && left > 0} onWalk={startWalk} />
      )}

      {wide && !script && plan.length > 0 && <RecordingPlan plan={plan} />}

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

      {wide && !script && (courseOptions.length > 1 || course || planned) && (
        <div className="la-filters">
          {(courseOptions.length > 1 || course) && <CoursePick value={course} courses={courseOptions} onChange={chooseCourse} />}
          {planned && (
            <div className="la-voice-filter">
              <Tabs
                label="Voice"
                value={voice}
                onChange={(next) => {
                  setVoice(next);
                  setWalking(false);
                }}
                items={VOICE_FILTERS.map((v) => ({ key: v, label: v === 'all' ? 'All' : voiceName(v), count: leftFor[v] }))}
              />
              <span className="subtle la-voice-note">Counted: what is still to record for each.</span>
              {voice !== 'all' && (
                <a className="button-link" href={scriptHref(voice, course)}>
                  <Icon name="list" />
                  Open {voiceName(voice)}’s script
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {!script && <Tabs label="Show" value={filter} onChange={setFilter} items={filters.map((f) => ({ key: f, label: FILTER_LABEL[f], count: n[f] }))} />}

      {!loaded && <Loading rows={4} />}

      {loaded && shown.length === 0 && (
        <div className="card">
          <EmptyState title={emptyTitle()} icon={filter === 'missing' && listed.length > 0 ? 'check' : 'mic'} />
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

      {wide && !script && !course && (
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

/** The lessons' or the stories' side at its head: how far the recording has got, the walk through what is missing, and what is listed. */
function StudioSummary({
  scope,
  done,
  walking,
  canWalk,
  onWalk,
}: {
  scope: Scope;
  done: { recorded: number; needed: number };
  walking: boolean;
  canWalk: boolean;
  onWalk: () => void;
}): React.JSX.Element {
  return (
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
        <Button variant="primary" icon="mic" onClick={onWalk} disabled={!canWalk}>
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
            Each item’s “say”, the first accepted answer of a writing or listening item and of a translation into Kurdish (one
            from Kurdish names its Kurdish in “say”, and its English answers are not recorded), a speaking item’s model sentence,
            and every match-pairs card. One recording is sent with every exercise that uses its sentence, in any lesson:
            with the exercise, or once it is answered where hearing it first would give the answer away. A listening item without a
            clip of its own uses the recording as its clip, so its lesson cannot be published until the recording is made.
          </p>
        </details>
      )}
    </div>
  );
}

/** The course filter: every course the list uses, or one of them. */
function CoursePick({
  value,
  courses,
  onChange,
}: {
  value: string | null;
  courses: ReadonlyArray<{ slug: string; title: string }>;
  onChange: (course: string | null) => void;
}): React.JSX.Element {
  return (
    <div className="la-course-pick">
      <label htmlFor="la-course">Course</label>
      <select id="la-course" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">Every course</option>
        {courses.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.title}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * The recording plan, course by course: for each character, how much of what
 * the lessons give them is recorded, and the way to their script.
 */
function RecordingPlan({ plan }: { plan: readonly CoursePlan[] }): React.JSX.Element {
  return (
    <section className="card la-plan" aria-labelledby="la-plan-title">
      <div className="la-plan-head">
        <h2 id="la-plan-title" className="la-plan-title">
          Recording plan
        </h2>
        <span className="subtle">Who records what, as the lessons plan it. A script lists one character’s lines to say in a row.</span>
      </div>
      {plan.map((course) => (
        <div key={course.slug} className="la-plan-course">
          <h3 className="la-plan-course-title">{course.title}</h3>
          <ul className="la-plan-lines">
            {course.lines.map((line) => {
              const who = line.voice ? voiceName(line.voice) : 'Planned for no one yet';
              return (
                <li key={line.voice ?? 'none'} className="la-plan-line">
                  {line.voice ? (
                    <img className="voice-tag" src={bustUrl(line.voice)} alt="" width={28} height={28} />
                  ) : (
                    <span className="voice-tag la-plan-nobody" aria-hidden="true" />
                  )}
                  <span className="la-plan-who">{who}</span>
                  <span className="la-plan-count">
                    {line.recorded} / {line.total} recorded
                  </span>
                  <div
                    className="progress la-plan-bar"
                    role="progressbar"
                    aria-label={`${who}: recorded in ${course.title}`}
                    aria-valuemin={0}
                    aria-valuemax={line.total}
                    aria-valuenow={line.recorded}
                  >
                    <div className="progress-bar" style={{ width: `${line.total ? (line.recorded / line.total) * 100 : 0}%` }} />
                  </div>
                  {line.voice && line.total > 0 ? (
                    <a className="button-link la-plan-script" href={scriptHref(line.voice, course.slug)} aria-label={`${who}’s script for ${course.title}`}>
                      Script
                    </a>
                  ) : (
                    <span className="la-plan-script" />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}

/** A character's script, at its head: whose it is, how far it has got, the walk, and the other scripts. */
function ScriptHead({
  voice,
  course,
  courseTitle,
  courses,
  onCourse,
  lines,
  done,
  walking,
  canWalk,
  onWalk,
}: {
  voice: SpeakerId;
  course: string | null;
  courseTitle: string | null;
  courses: ReadonlyArray<{ slug: string; title: string }>;
  onCourse: (course: string | null) => void;
  lines: number;
  done: { recorded: number; needed: number };
  walking: boolean;
  canWalk: boolean;
  onWalk: () => void;
}): React.JSX.Element {
  const name = voiceName(voice);
  return (
    <div className="card aa-summary la-script-head">
      <div className="aa-summary-head">
        <div className="la-script-who">
          <img className="la-script-bust" src={bustUrl(voice)} alt="" width={48} height={48} />
          <div>
            <h2 className="la-script-title">{name}’s script</h2>
            <div className="subtle">
              {courseTitle ?? 'Every course'} · {lines} {lines === 1 ? 'line' : 'lines'} in course order, recorded or not. Record next missing,
              save, and the next of {name}’s lines comes up.
            </div>
          </div>
        </div>
        <Button variant="primary" icon="mic" onClick={onWalk} disabled={!canWalk}>
          {walking ? 'Skip to the next missing' : 'Record next missing'}
        </Button>
      </div>
      <strong className="aa-count">
        {done.recorded} of {done.needed} recorded
      </strong>
      <div className="progress" role="progressbar" aria-label={`${name}’s lines recorded`} aria-valuemin={0} aria-valuemax={done.needed} aria-valuenow={done.recorded}>
        <div className="progress-bar" style={{ width: `${done.needed ? (done.recorded / done.needed) * 100 : 0}%` }} />
      </div>
      <div className="la-filters">
        {(courses.length > 1 || course) && <CoursePick value={course} courses={courses} onChange={onCourse} />}
        <nav className="la-script-links" aria-label="Other scripts">
          {VOICE_ORDER.filter((v) => v !== voice).map((v) => (
            <a key={v} className="button-link" href={scriptHref(v, course)}>
              {voiceName(v)}’s script
            </a>
          ))}
          <a className="button-link" href={studioHref(course)}>
            Every sentence
          </a>
        </nav>
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
  number,
  showPlan,
  nextSpeaker,
  picked,
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
  /** its place in a script, counted from 1 */
  number?: number;
  /** say who a row still to record is for: a script, all one character's, has no need to */
  showPlan: boolean;
  /** who says it when it is recorded now, if it has no recording yet and no plan says who */
  nextSpeaker: Speaker;
  /** who the editor chose for it against its plan, if they did */
  picked?: Speaker;
  onSpeaker: (speaker: Speaker) => void;
  onSaved: (saved: Saved) => void;
  onRemoved: (key: string) => void;
  onPrev: () => void;
  onNext: () => void;
  confirm: ReturnType<typeof useDialogs>['confirm'];
}): React.JSX.Element {
  const script = scriptOf(item.text);
  // who it is for: a conversation's part is its own character's, another text the plan's — whatever was picked
  // last for other sentences. A recording keeps whoever was heard in it.
  const planned: Speaker | undefined = item.line ? item.line.character : (item.plannedSpeaker ?? undefined);
  const speaker = item.recorded ? (item.speaker ?? null) : picked !== undefined ? picked : planned !== undefined ? planned : nextSpeaker;
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
            {number !== undefined && <span className="la-n">{number}. </span>}
            {item.line && <span className="la-who">{item.line.name}: </span>}
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
        {!item.recorded && showPlan && planned && (
          <span className="la-for">
            <img className="voice-tag" src={bustUrl(planned)} width={28} height={28} alt="" />
            For {voiceName(planned)}
          </span>
        )}
        <span className={`badge${status.tone}`}>{status.label}</span>
      </div>
      {selected && (
        <SentenceStudio
          text={item.text}
          recordKey={item.key}
          path={recordPath(item)}
          recording={
            item.url
              ? { url: item.url, durationMs: item.durationMs, updatedAt: item.updatedAt, speaker: item.speaker ?? null, lipsync: item.lipsync, hasLipsync: item.hasLipsync }
              : null
          }
          speaker={speaker}
          speakerHint={!item.recorded && planned ? `The lesson plans it for ${voiceName(planned)}. Saved with the recording.` : undefined}
          onSpeaker={onSpeaker}
          onSaved={onSaved}
          onRemoved={() => onRemoved(item.key)}
          removePrompt={removePrompt}
          listeningNeedsIt={listening}
          confirm={confirm}
          shortcuts
          onPrev={onPrev}
          onNext={onNext}
        >
          {item.line && first && (
            <p className="la-conversation">
              A line of a conversation: it is best recorded with the rest of it, where the line before can be heard first.{' '}
              <a href={conversationHref(item.line.conversation, first.lessonId, item.line.part)}>Record {item.line.name}’s part</a>
            </p>
          )}
        </SentenceStudio>
      )}
    </div>
  );
}
