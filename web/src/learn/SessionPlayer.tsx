import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
// a Soranî lesson's letters in a face made for Arabic script (fetched only when used)
import '@fontsource-variable/vazirmatn';
import { Link } from 'react-router-dom';
import {
  currentExercise,
  initPlayer,
  isReask,
  progress,
  reduce,
  type DeliveredExercise,
  type Feedback,
  type PlayableSession,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { CloseIcon } from '../components/icons';
import { Modal } from '../components/Modal';
import { ErrorState, Loading } from '../components/states';
import { describeError } from '../lib/api';
import { stop } from '../lib/sound';
import { useT } from '../i18n/I18nProvider';
import { MatchPairs, MultipleChoice, Listening, TypedExercise, type ExerciseProps } from './Exercises';
import { FeedbackPanel, announce } from './FeedbackPanel';
import { GrammarNote } from './GrammarNote';
import { Results } from './Results';
import { Speaking } from './Speaking';
import type { AnswerResult, RetryResult, SessionResults } from './types';

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
  }
}

function ProgressBar({ value, label }: { value: number; label: string }): React.JSX.Element {
  const pct = Math.round(value * 100);
  return (
    <div className="lesson-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

interface Problem {
  message: string;
  /** try the same thing again, when that could work */
  retry: (() => void) | null;
}

/**
 * The lesson player, for a lesson and for a review alike: one exercise at a
 * time, graded by the server, with feedback after each and the results at the
 * end. What comes next is decided by the shared player (@kurda/shared
 * lesson-player.ts) the phone runs too: no hearts, and a miss asked once more
 * a few exercises later through `/retry`, which records nothing.
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
  const { client } = useAuth();
  const sessionId = session.sessionId;
  const [state, dispatch] = useReducer(reduce, session, (s) => initPlayer(s, { reasked: readReasked(s.sessionId) }));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [closed, setClosed] = useState(false);
  const [results, setResults] = useState<SessionResults | null>(null);
  const [completeTry, setCompleteTry] = useState(0);
  const [tips, setTips] = useState(false);

  const ex: DeliveredExercise | null = currentExercise(state);
  const reask = isReask(state);
  const exDialect = ex?.dialect ?? dialect;

  useEffect(() => writeReasked(sessionId, state.reasked), [sessionId, state.reasked]);
  // leaving mid-sentence should not leave the sentence playing
  useEffect(() => () => stop(), []);

  const submit = useCallback(
    async (answer: unknown, given?: string): Promise<void> => {
      if (!ex || state.status !== 'answering') return;
      setBusy(true);
      setProblem(null);
      const body = { exerciseId: ex.id, answer };
      const res = reask
        ? await client.post<RetryResult>(paths.retry(sessionId), body)
        : await client.post<AnswerResult>(paths.answers(sessionId), body);
      setBusy(false);
      if (res.ok) {
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
    [ex, state.status, reask, client, paths, sessionId, t],
  );

  const skip = useCallback(() => {
    setProblem(null);
    dispatch({ type: 'SKIP' });
  }, []);
  const next = useCallback(() => dispatch({ type: 'CONTINUE' }), []);

  // the end: finish the session on the server and show what it says
  const completing = useRef(false);
  useEffect(() => {
    if (state.status !== 'finished' || results || completing.current) return;
    completing.current = true;
    void client.post<SessionResults>(paths.complete(sessionId)).then((res) => {
      completing.current = false;
      if (res.ok) {
        setResults(res.data);
        setProblem(null);
        writeReasked(sessionId, null);
      } else {
        setProblem({ message: describeError(res.error, t), retry: () => setCompleteTry((n) => n + 1) });
      }
    });
  }, [state.status, results, client, paths, sessionId, t, completeTry]);

  const feedback: Feedback | null = state.status === 'feedback' ? state.feedback : null;
  const heading = title ?? (kind === 'lesson' ? t('lesson.title') : t('review.title'));

  return (
    <div className="lesson">
      <h1 className="sr-only">{heading}</h1>
      <header className="lesson-top">
        <Link to={exitTo} className="lesson-leave" aria-label={t('lesson.leave')}>
          <CloseIcon size={20} />
        </Link>
        <ProgressBar value={progress(state)} label={t('lesson.progress')} />
        {grammarMd && (
          <Button variant="ghost" size="sm" onClick={() => setTips(true)}>
            {t('lesson.tips')}
          </Button>
        )}
      </header>

      {/* said once per answer; the region is always here so the change is heard */}
      <p className="sr-only" aria-live="polite">
        {feedback ? announce(feedback, t) : ''}
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
          {feedback && <FeedbackPanel key={`feedback-${state.index}`} feedback={feedback} dialect={exDialect} onContinue={next} />}
          <p className="lesson-saved">{t('lesson.savedAsYouGo')}</p>
        </div>
      ) : results ? (
        <Results
          results={results}
          exercises={state.exercises}
          skipped={state.skipped.length}
          kind={kind}
          dialect={dialect}
          exitTo={exitTo}
          exitLabel={exitLabel}
          onPractise={onPractise}
        />
      ) : problem ? (
        <ErrorState message={problem.message} onRetry={problem.retry ?? undefined} />
      ) : (
        <Loading label={t('lesson.tallying')} />
      )}

      {grammarMd && (
        <Modal open={tips} onClose={() => setTips(false)} label={t('lesson.tips')}>
          <h2 className="grammar-title">{t('lesson.tips')}</h2>
          <GrammarNote source={grammarMd} />
        </Modal>
      )}
    </div>
  );
}
