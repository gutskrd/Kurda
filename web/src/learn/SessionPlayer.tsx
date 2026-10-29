import { useCallback, useEffect, useId, useLayoutEffect, useReducer, useRef, useState } from 'react';
// a Soranî lesson's letters in a face made for Arabic script (fetched only when used)
import '@fontsource-variable/vazirmatn';
import { Link, useNavigate } from 'react-router-dom';
import {
  NO_LESSON_MOMENTS,
  RUN_SHOWN_FROM,
  currentExercise,
  initPlayer,
  isReask,
  lessonMoments,
  nextLaunch,
  nextRun,
  pairKey,
  praiseFor,
  progress,
  reduce,
  runMilestone,
  type DeliveredExercise,
  type ExerciseType,
  type Feedback,
  type LeagueView,
  type LessonMoments,
  type LessonStanding,
  type PlayableSession,
  type PutAwayType,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import type { CharacterReaction } from '../characters/SpeakingCharacter';
import { Button } from '../components/Button';
import { CloseIcon } from '../components/icons';
import { Modal } from '../components/Modal';
import { ErrorState, Loading } from '../components/states';
import { describeError } from '../lib/api';
import { prefersReducedMotion } from '../lib/motion';
import { play as playSound, stop } from '../lib/sound';
import { haptic } from '../lib/haptics';
import { playLessonSound } from '../lib/sounds';
import type { ApiClient } from '../lib/api';
import { useT } from '../i18n/I18nProvider';
import { ActionBar, BarRow } from './ActionBar';
import { Conversation } from './Conversation';
import { MatchPairs, MultipleChoice, Listening, TypedExercise, type ExerciseProps } from './Exercises';
import { FeedbackPanel, announce, type RunMark } from './FeedbackPanel';
import { GrammarNote } from './GrammarNote';
import { kurdishText } from './map';
import { Results, type NextLesson } from './Results';
import { RunLabel, RunMoment } from './Run';
import { Speaking } from './Speaking';
import { exerciseClips, feedbackClip } from './Voice';
import type { AnswerResult, CourseMap, RetryResult, SessionResults } from './types';

/** Where a session's answers go — a lesson and a review differ only here. */
export interface SessionPaths {
  answers: (sessionId: string) => string;
  /** a second try at a miss: graded, never recorded */
  retry: (sessionId: string) => string;
  complete: (sessionId: string) => string;
}

export const LESSON_PATHS: SessionPaths = {
  answers: (id) => `/sessions/${id}/answers`,
  retry: (id) => `/sessions/${id}/retry`,
  complete: (id) => `/sessions/${id}/complete`,
};

export const PRACTICE_PATHS: SessionPaths = {
  answers: (id) => `/practice/sessions/${id}/answers`,
  retry: (id) => `/practice/sessions/${id}/retry`,
  complete: (id) => `/practice/sessions/${id}/complete`,
};

/*
 * The server keeps every answer, and a lesson resumes from it; it does not keep
 * the second tries, which count for nothing. Which of those were asked is kept
 * for the tab, so a reload does not ask one again (the shared player's
 * `ResumeMemory`). Losing it costs one extra question, never an answer.
 */
const reaskedKey = (sessionId: string): string => `hevalo:reasked:${sessionId}`;

function readReasked(sessionId: string): string[] {
  try {
    const raw = sessionStorage.getItem(reaskedKey(sessionId));
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeReasked(sessionId: string, ids: string[] | null): void {
  try {
    if (ids === null || ids.length === 0) sessionStorage.removeItem(reaskedKey(sessionId));
    else sessionStorage.setItem(reaskedKey(sessionId), JSON.stringify(ids));
  } catch {
    // storage blocked: a reload may ask a second try again, which is harmless
  }
}

/*
 * "Every answer is saved as you give it" is said once on a device, under the
 * first exercise of the first lesson, rather than under every exercise of
 * every lesson: the ✕ says it too, every time ("Leave for now — your answers
 * are saved").
 */
const SAVED_NOTE_KEY = 'hevalo_saved_note_seen';

function savedNoteDue(): boolean {
  try {
    if (localStorage.getItem(SAVED_NOTE_KEY)) return false;
    localStorage.setItem(SAVED_NOTE_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

/** How long "No more listening in this lesson" stays, with its Undo. */
const PUT_AWAY_MS = 5000;

/** Not a key for the lesson: one typed into a field, pressed on a control or inside a dialog (the Tips) over it. */
function ownedElsewhere(target: EventTarget | null): boolean {
  return !!(target as HTMLElement | null)?.closest?.('button, a, input, textarea, select, [contenteditable], [role="dialog"]');
}

function ExerciseView(props: ExerciseProps): React.JSX.Element | null {
  switch (props.exercise.type) {
    case 'multiple_choice':
      return <MultipleChoice {...props} />;
    case 'translate':
    case 'writing':
      return <TypedExercise {...props} />;
    case 'listening':
      return <Listening {...props} />;
    case 'speaking':
      return <Speaking {...props} />;
    case 'match_pairs':
      return <MatchPairs {...props} />;
    case 'conversation':
      return <Conversation {...props} />;
  }
}

/**
 * The lesson's bar: it slides to each new value on the out-curve, a light
 * running along it as it does (styles/motion.css), and warms to gold while a
 * run is shown, going back to green on a miss. The run itself is named over
 * it (`RunLabel`).
 */
function ProgressBar({ value, label, run }: { value: number; label: string; run: number }): React.JSX.Element {
  const pct = Math.round(value * 100);
  return (
    <div className="lesson-progress-wrap">
      <RunLabel key={run} run={run} />
      <div
        className={`lesson-progress${run >= RUN_SHOWN_FROM ? ' is-run' : ''}`}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <span style={{ '--p': Math.max(0, Math.min(1, value)) } as React.CSSProperties}>
          {pct > 0 && <span key={pct} className="lesson-progress-sheen" />}
        </span>
      </div>
    </div>
  );
}

/**
 * Felt as the verdict arrives, on a touch screen that can (lib/haptics.ts):
 * one short pulse when right, a gentle double when not. A spoken answer is the
 * learner's own rating of their recording, not a grade, so it is not felt.
 * Heard too (lib/sounds.ts): a right answer's chime climbs with the run it
 * extends (`step`, the run before it); a miss is two soft low notes.
 */
function feelAnswer(type: ExerciseType | undefined, accepted: boolean, step: number): void {
  if (type === 'speaking') return;
  haptic(accepted ? 'correct' : 'wrong');
  if (accepted) playLessonSound('correct', step);
  else playLessonSound('wrong');
}

/**
 * `/me`, `/me/daily-goal` and `/me/league`, read together: where the learner
 * stands, for `lessonMoments`. The league counts only while the learner races
 * in one — not in personal mode, not before joining, never once opted out.
 */
async function readStanding(client: ApiClient): Promise<LessonStanding | null> {
  const [me, goal, league] = await Promise.all([
    client.get<{ user: { level?: { level?: number; progress?: number }; streak?: { current: number; lastActiveOn?: string | null } } }>('/me'),
    client.get<{ completed?: boolean; earnedXp?: number; goal?: number; effectiveGoal?: number }>('/me/daily-goal'),
    client.get<Partial<LeagueView>>('/me/league'),
  ]);
  if (!me.ok) return null;
  const user = me.data.user;
  const g = goal.ok ? goal.data : null;
  const target = g?.effectiveGoal || g?.goal;
  const l = league.ok ? league.data : null;
  const racing = l?.mode === 'league' && l.joined === true && l.optedOut !== true && typeof l.rank === 'number' && !!l.tier;
  return {
    level: typeof user.level?.level === 'number' ? user.level.level : null,
    streak: user.streak ? { current: user.streak.current, lastActiveOn: user.streak.lastActiveOn ?? null } : null,
    goalCompleted: typeof g?.completed === 'boolean' ? g.completed : null,
    goal: typeof g?.earnedXp === 'number' && typeof target === 'number' && target > 0 ? { earned: g.earnedXp, target } : null,
    league: racing ? { rank: l.rank!, weeklyXp: l.weeklyXp ?? 0, tier: l.tier! } : null,
    levelProgress: typeof user.level?.progress === 'number' ? user.level.progress : null,
  };
}

interface Problem {
  message: string;
  /** try the same thing again, when that could work */
  retry: (() => void) | null;
}

/** What the verdict sheet shows beside the verdict itself, decided as the answer is graded. */
interface Extras {
  run: RunMark | null;
  hevalo: CharacterReaction | null;
  praise: string | null;
}

/**
 * The lesson player, for a lesson and for a review alike: one exercise at a
 * time, graded by the server, with the verdict after each and the results at
 * the end. What comes next is decided by the shared player (@kurda/shared
 * lesson-player.ts) the phone runs too: no hearts, and a miss asked once more
 * a few exercises later through `/retry`, which records nothing.
 *
 * Check and Continue are in one place, the action bar at the foot of the
 * screen (ActionBar.tsx): an exercise is answered there, the verdict sheet
 * rises into it, and Enter, Enter plays a whole lesson from the keyboard.
 * Escape leaves, as the ✕ does; Space hears the item's recording again.
 *
 * Every answer is saved as it is given, so leaving costs nothing: the lesson
 * picks up at the first unanswered exercise when it is opened again — within a
 * day, while its session lasts (SESSION_TTL_HOURS on the server); after that
 * opening it starts a new one.
 */
export function SessionPlayer({
  session,
  kind,
  paths,
  title,
  dialect,
  grammarMd,
  courseId = null,
  lessonId,
  exitTo,
  exitLabel,
  onPractise,
  onRestart,
}: {
  session: PlayableSession;
  kind: 'lesson' | 'practice';
  paths: SessionPaths;
  /** the lesson's name, when the page knows it */
  title?: string;
  /** the course the lesson is in, for the next lesson the results offer */
  courseId?: string | null;
  /** the lesson being played, so the next one offered is never it again */
  lessonId?: string;
  /** the course's variety of Kurdish; a practice item says its own */
  dialect?: string | null;
  /** the skill's grammar note, opened from "Tips" */
  grammarMd?: string | null;
  exitTo: string;
  exitLabel: string;
  onPractise: (exerciseIds: string[]) => void;
  /** open the lesson afresh, when the server has closed this session */
  onRestart?: () => void;
}): React.JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const { client } = useAuth();
  const sessionId = session.sessionId;
  const formId = `lesson-answer-${useId().replace(/[^A-Za-z0-9]/g, '')}`;
  const [state, dispatch] = useReducer(reduce, session, (s) => initPlayer(s, { reasked: readReasked(s.sessionId) }));
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [closed, setClosed] = useState(false);
  const [results, setResults] = useState<SessionResults | null>(null);
  // how long this sitting took, for the results: from opening the player to the session's end
  const [startedAt] = useState(Date.now);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [completeTry, setCompleteTry] = useState(0);
  const [tips, setTips] = useState(false);
  const [savedNote] = useState(savedNoteDue);
  // which step's exercise has an answer ready to check (-1: none)
  const [readyStep, setReadyStep] = useState(-1);
  const stepNow = useRef(state.index);
  stepNow.current = state.index;
  const onReady = useCallback((ready: boolean) => setReadyStep(ready ? stepNow.current : -1), []);
  // right answers in a row: the chime climbs with it, the bar warms, it is named at a milestone
  const [run, setRun] = useState(0);
  const runNow = useRef(0);
  const graded = useRef(0);
  const lastPraise = useRef<string | null>(null);
  const [extras, setExtras] = useState<Extras>({ run: null, hevalo: null, praise: null });
  // a milestone named across the screen after its Continue, before the next exercise
  const [moment, setMoment] = useState<number | null>(null);
  // "No more listening in this lesson", for a few seconds after it is chosen, with Undo
  const [awayNote, setAwayNote] = useState<PutAwayType | null>(null);
  // what a finished lesson is compared with: the level, the streak and today's goal as the lesson opened
  const before = useRef<LessonStanding | null>(null);
  const [moments, setMoments] = useState<LessonMoments>(NO_LESSON_MOMENTS);
  // the course's next lesson, read from its map once this one is finished
  const [nextLesson, setNextLesson] = useState<NextLesson | null>(null);
  useEffect(() => {
    let live = true;
    void readStanding(client).then((standing) => {
      if (live) before.current = standing;
    });
    return () => {
      live = false;
    };
  }, [client]);

  const ex: DeliveredExercise | null = currentExercise(state);
  const reask = isReask(state);
  const exDialect = ex?.dialect ?? dialect;
  const answering = state.status === 'answering' && !!ex && !closed;
  const ready = answering && readyStep === state.index;

  useEffect(() => writeReasked(sessionId, state.reasked), [sessionId, state.reasked]);
  // each exercise opens at its top, its headline in view, wherever the last one was scrolled to
  useLayoutEffect(() => {
    if (window.scrollY > 0) window.scrollTo({ top: 0 });
  }, [state.index]);
  // leaving mid-sentence should not leave the sentence playing
  useEffect(() => () => stop(), []);

  const submit = useCallback(
    async (answer: unknown, given?: string): Promise<void> => {
      // one answer at a time: Check and Enter can both arrive before "Checking…" is drawn
      if (!ex || state.status !== 'answering' || sending.current) return;
      sending.current = true;
      setBusy(true);
      setProblem(null);
      const body = { exerciseId: ex.id, answer };
      const res = reask
        ? await client.post<RetryResult>(paths.retry(sessionId), body)
        : await client.post<AnswerResult>(paths.answers(sessionId), body);
      sending.current = false;
      setBusy(false);
      if (res.ok) {
        const { accepted, verdict } = res.data;
        const spoken = ex.type === 'speaking';
        const was = runNow.current;
        const now = nextRun(was, { accepted, exerciseType: ex.type });
        runNow.current = now;
        feelAnswer(ex.type, accepted, was);
        const milestone = now > was ? runMilestone(now) : null;
        // Hevalo stands in only where nobody already says the item, and only now and then
        const onStage = exerciseClips(ex).length > 0 || feedbackClip(ex, res.data) !== null;
        const first = graded.current === 0;
        graded.current += 1;
        const hevalo: CharacterReaction | null = onStage
          ? null
          : !accepted
            ? 'hmm'
            : first || milestone !== null
              ? 'cheer'
              : null;
        const praise =
          accepted && verdict === 'correct' && !spoken ? praiseFor(exDialect, { index: state.index, run: was, previous: lastPraise.current }) : null;
        if (praise) lastPraise.current = praise;
        setRun(now);
        setExtras({ run: accepted && !spoken ? { count: now, milestone: milestone !== null } : null, hevalo, praise });
        dispatch({ type: 'ANSWERED', result: res.data, given });
        return;
      }
      // a second try the server will not grade counts for nothing anyway: let it go
      if (reask && res.error.kind === 'client') {
        dispatch({ type: 'SKIP' });
        return;
      }
      if (res.error.code === 'SESSION_EXPIRED' || res.error.code === 'SESSION_COMPLETED' || res.error.code === 'PRACTICE_SESSION_COMPLETED') {
        setClosed(true);
        return;
      }
      setProblem({
        message: describeError(res.error, t),
        // answers are recorded once per exercise, so sending the same one again is safe
        retry: res.error.kind === 'client' ? null : () => void submit(answer, given),
      });
    },
    [ex, state.status, state.index, reask, client, paths, sessionId, t, exDialect],
  );

  const skip = useCallback(() => {
    setProblem(null);
    dispatch({ type: 'SKIP' });
  }, []);
  // "Can't listen now": this one and every listening item after it, for the rest of the lesson
  const putAway = (type: PutAwayType): void => {
    setProblem(null);
    stop();
    dispatch({ type: 'SKIP', all: type });
    setAwayNote(type);
  };
  const undoPutAway = (): void => {
    dispatch({ type: 'UNSKIP' });
    setAwayNote(null);
  };
  useEffect(() => {
    if (!awayNote) return;
    const id = window.setTimeout(() => setAwayNote(null), PUT_AWAY_MS);
    return () => window.clearTimeout(id);
  }, [awayNote]);

  const next = useCallback(() => {
    if (moment !== null) return;
    // the recording heard after the verdict ends with it
    stop();
    if (extras.run?.milestone) setMoment(extras.run.count);
    else dispatch({ type: 'CONTINUE' });
  }, [moment, extras.run]);
  const momentOver = useCallback(() => {
    setMoment(null);
    dispatch({ type: 'CONTINUE' });
  }, []);

  // Enter checks, from the answer's own field and from anywhere that has no
  // Enter of its own: a link or another button does what it does, and a
  // dialog over the lesson keeps its keys. An option or a rating already
  // chosen is the answer, so Enter on it checks too. The exercise's form
  // decides whether there is anything to check yet — it knows at once, where
  // Check's own state follows a moment later — and a word still being
  // composed on a keyboard that builds letters is not sent half-made.
  useEffect(() => {
    if (!answering) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Enter' || e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.isComposing || e.defaultPrevented) return;
      const form = document.getElementById(formId);
      if (!(form instanceof HTMLFormElement)) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[role="dialog"]')) return;
      const field = !!target && form.contains(target) && target.matches('input');
      const chosen = !!target?.closest?.('[aria-pressed="true"]');
      if (!field && !chosen && ownedElsewhere(target)) return;
      e.preventDefault();
      form.requestSubmit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [answering, formId]);

  // Escape leaves, as the ✕ does: every answer is saved already. Space says
  // the item's recording again — never from a field or a button, which have
  // their own use for it.
  const mainAudio = state.status === 'feedback' ? (state.feedback?.modelAudioUrl ?? null) : (ex?.audioUrl ?? ex?.modelAudioUrl ?? null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || tips) return;
      if (e.key === 'Escape') {
        if ((e.target as HTMLElement | null)?.closest?.('[role="dialog"]')) return;
        e.preventDefault();
        navigate(exitTo);
      } else if (e.key === ' ' && mainAudio && !ownedElsewhere(e.target)) {
        e.preventDefault();
        playSound(mainAudio);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, exitTo, mainAudio, tips]);

  // the verdict rises over the foot of the page: what was answered is kept in view above it
  useEffect(() => {
    if (state.status !== 'feedback') return;
    const frame = requestAnimationFrame(() => {
      const answered = document.querySelector<HTMLElement>('.lesson-option.is-chosen, .lesson-input, .lesson-answer-line, .lesson-match, .lesson-rate');
      answered?.scrollIntoView?.({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [state.status]);

  // the end: finish the session on the server and show what it says
  const completing = useRef(false);
  useEffect(() => {
    if (state.status !== 'finished' || results || completing.current) return;
    completing.current = true;
    void client.post<SessionResults>(paths.complete(sessionId)).then((res) => {
      completing.current = false;
      if (res.ok) {
        // a perfect lesson is known from the results alone; the rest waits for where things stand now
        const outcome = { kind, accuracy: res.data.accuracy, skipped: state.skipped.length };
        setResults(res.data);
        setElapsedMs(Date.now() - startedAt);
        setMoments(lessonMoments(null, null, null, outcome));
        setProblem(null);
        writeReasked(sessionId, null);
        // and what else it did: a goal met, the streak kept today, a new level, the league
        const streakNow = { current: res.data.streak.current, lastActiveOn: res.data.streak.lastActiveOn ?? null };
        void readStanding(client).then((after) => setMoments(lessonMoments(before.current, after, streakNow, outcome)));
        // and what comes next: the course's map as it is now, this lesson counted
        if (kind === 'lesson' && courseId) {
          void client.get<CourseMap>(`/courses/${encodeURIComponent(courseId)}/map`).then((map) => {
            if (map.ok) setNextLesson(nextLaunch(map.data, lessonId ?? null));
          });
        }
      } else {
        setProblem({ message: describeError(res.error, t), retry: () => setCompleteTry((n) => n + 1) });
      }
    });
  }, [state.status, state.skipped.length, results, client, paths, sessionId, t, completeTry, kind, courseId, lessonId, startedAt]);

  const feedback: Feedback | null = state.status === 'feedback' ? state.feedback : null;
  const heading = title ?? (kind === 'lesson' ? t('lesson.title') : t('review.title'));
  const tone = feedback ? (!feedback.accepted ? 'notyet' : feedback.verdict === 'correct' ? 'right' : 'almost') : null;
  const putOffKind: PutAwayType | null = ex?.type === 'speaking' ? 'speaking' : ex?.type === 'listening' && ex.audioUrl ? 'listening' : null;
  // pairs answered as they are made: the last one answers, so there is no Check
  const liveMatch = ex?.type === 'match_pairs' && pairKey(ex.lefts ?? [], ex.rights ?? [], ex.pairOf) !== null;
  const { lang } = kurdishText(exDialect);

  // the end: the results have the screen, and the lesson's own header goes
  if (results && state.status === 'finished' && !closed) {
    return (
      <div className="lesson is-done">
        <Results
          title={heading}
          results={results}
          exercises={state.exercises}
          skipped={state.skipped.length}
          kind={kind}
          dialect={dialect}
          moments={moments}
          next={nextLesson}
          elapsedMs={elapsedMs}
          exitTo={exitTo}
          exitLabel={exitLabel}
          onNext={(lesson) =>
            navigate(`/app/learn/lesson/${encodeURIComponent(lesson.lessonId)}${courseId ? `?course=${encodeURIComponent(courseId)}` : ''}`, {
              // and from there back to where this one would have gone
              state: { title: lesson.title, from: exitTo },
            })
          }
          onPractise={onPractise}
        />
      </div>
    );
  }

  return (
    <div className="lesson">
      <div className="lesson-body">
        <h1 className="sr-only">{heading}</h1>
        <header className="lesson-top">
          <Link to={exitTo} className="lesson-leave" aria-label={t('lesson.leave')}>
            <CloseIcon size={20} />
          </Link>
          <ProgressBar value={progress(state)} label={t('lesson.progress')} run={run} />
          {grammarMd && (
            <Button variant="ghost" size="sm" onClick={() => setTips(true)}>
              {t('lesson.tips')}
            </Button>
          )}
        </header>

        {/* said once per answer; the region is always here so the change is heard */}
        <p className="sr-only" aria-live="polite">
          {feedback ? announce(feedback, t) : ''}
          {feedback && extras.praise && <span lang={lang}> {extras.praise}</span>}
        </p>

        {closed ? (
          <ErrorState
            title={t('lesson.closed.title')}
            // a lesson's session lapses after a day (SESSION_TTL_HOURS); a review's
            // never does, and closes only when it is finished
            message={kind === 'lesson' ? t('lesson.closed.body') : t('review.closed.body')}
            onRetry={onRestart}
          />
        ) : state.status !== 'finished' && ex ? (
          <div className="lesson-stage">
            {reask && <p className="lesson-badge">{t('lesson.secondTry')}</p>}
            <ExerciseView
              // each turn starts afresh — a second try too
              key={`exercise-${state.index}`}
              exercise={ex}
              dialect={exDialect}
              locked={state.status === 'feedback'}
              busy={busy}
              feedback={feedback}
              formId={formId}
              onReady={onReady}
              onAnswer={(answer, given) => void submit(answer, given)}
              onSkip={skip}
            />
            {problem && (
              <div className="msg msg-error lesson-problem" role="alert">
                <span>{problem.message}</span>
                {problem.retry && (
                  <Button variant="secondary" size="sm" onClick={problem.retry}>
                    {t('common.retry')}
                  </Button>
                )}
              </div>
            )}
            {savedNote && state.index === 0 && <p className="lesson-saved">{t('lesson.savedAsYouGo')}</p>}
          </div>
        ) : problem ? (
          <ErrorState message={problem.message} onRetry={problem.retry ?? undefined} />
        ) : (
          <Loading label={t('lesson.tallying')} />
        )}
      </div>

      {feedback && ex && !closed ? (
        <ActionBar tone={tone}>
          <FeedbackPanel
            key={`feedback-${state.index}`}
            feedback={feedback}
            dialect={exDialect}
            speaker={feedbackClip(ex, feedback)}
            hevalo={extras.hevalo}
            praise={extras.praise}
            run={extras.run}
            onWhy={grammarMd ? () => setTips(true) : null}
            onContinue={next}
          />
        </ActionBar>
      ) : answering && !(liveMatch && !awayNote) ? (
        <ActionBar>
          <BarRow
            start={
              <>
                {/* said as it changes: what was put off, and the way to have it back */}
                <p className="lesson-bar-note" role="status">
                  {awayNote && (
                    <>
                      {t(awayNote === 'listening' ? 'lesson.skipAll.listening' : 'lesson.skipAll.speaking')}
                      {state.putAway && (
                        <button type="button" className="link-btn" onClick={undoPutAway}>
                          {t('common.undo')}
                        </button>
                      )}
                    </>
                  )}
                </p>
                {!awayNote && putOffKind && (
                  <button type="button" className="link-btn lesson-skip" onClick={() => putAway(putOffKind)} disabled={busy}>
                    {t(putOffKind === 'listening' ? 'lesson.listen.skip' : 'lesson.speak.skip')}
                  </button>
                )}
              </>
            }
          >
            {!liveMatch && (
              <Button type="submit" form={formId} size="lg" className="lesson-bar-go" disabled={!ready || busy}>
                {busy ? t('lesson.checking') : t('lesson.check')}
              </Button>
            )}
          </BarRow>
        </ActionBar>
      ) : null}

      {moment !== null && <RunMoment count={moment} onDone={momentOver} />}

      {grammarMd && (
        <Modal open={tips} onClose={() => setTips(false)} label={t('lesson.tips')}>
          <h2 className="grammar-title">{t('lesson.tips')}</h2>
          <GrammarNote source={grammarMd} />
        </Modal>
      )}
    </div>
  );
}
