import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { LinkButton } from '../components/Button';
import { EmptyState, ErrorState, Loading } from '../components/states';
import { useT } from '../i18n/I18nProvider';
import { PRACTICE_PATHS, SessionPlayer } from '../learn/SessionPlayer';
import type { EmptyPractice, PracticeSessionView } from '../learn/types';

interface Passed {
  /** "practise these now": the exercises to practise, from a results screen */
  exerciseIds?: string[];
  /** the session just started, handed to its own address so it is not fetched twice */
  session?: PracticeSessionView;
}

function passedState(state: unknown): Passed {
  if (!state || typeof state !== 'object') return {};
  const s = state as Record<string, unknown>;
  const ids = Array.isArray(s.exerciseIds) ? s.exerciseIds.filter((x): x is string => typeof x === 'string') : undefined;
  const session = s.session && typeof s.session === 'object' ? (s.session as PracticeSessionView) : undefined;
  return { exerciseIds: ids && ids.length > 0 ? ids : undefined, session };
}

/**
 * Review (/app/learn/review): a practice session over what is due, played in
 * the lesson player. Starting one asks the server for the items — the due ones
 * first, padded with the weakest — or, from a results screen, exactly the
 * mistakes just made. The session then gets its own address
 * (/app/learn/review/:sessionId), so leaving and coming back, or a reload,
 * picks it up where it stopped instead of starting another.
 */
export function Review(): React.JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const { client } = useAuth();
  const { sessionId } = useParams();
  const { state } = useLocation();
  const passed = passedState(state);
  const [view, setView] = useState<PracticeSessionView | null>(
    sessionId && passed.session?.sessionId === sessionId ? passed.session : null,
  );
  const [empty, setEmpty] = useState<EmptyPractice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // one start per attempt, even when an effect runs twice
  const started = useRef<number | null>(null);
  const exerciseIds = passed.exerciseIds;

  useEffect(() => {
    let live = true;
    if (sessionId) {
      if (view?.sessionId === sessionId) return;
      setError(null);
      void client.get<PracticeSessionView>(`/practice/sessions/${encodeURIComponent(sessionId)}`).then((res) => {
        if (!live) return;
        if (res.ok) setView(res.data);
        else setError(describeError(res.error, t));
      });
      return () => {
        live = false;
      };
    }
    if (started.current === attempt) return;
    started.current = attempt;
    setError(null);
    void client
      .post<PracticeSessionView | EmptyPractice>('/practice/session', exerciseIds ? { exerciseIds } : undefined)
      .then((res) => {
        if (!res.ok) {
          setError(describeError(res.error, t));
          return;
        }
        if ('empty' in res.data) {
          setEmpty(res.data);
          return;
        }
        navigate(`/app/learn/review/${res.data.sessionId}`, { replace: true, state: { session: res.data } });
      });
    // `view` and the passed ids are read, not followed: the session in hand is
    // not a reason to fetch it again, and a start happens once per attempt
  }, [sessionId, attempt, client, navigate, t]);

  if (error) {
    return (
      <div className="container">
        <ErrorState title={t('review.startFailed')} message={error} onRetry={() => setAttempt((n) => n + 1)} />
      </div>
    );
  }
  if (empty) {
    return (
      <div className="container">
        <EmptyState
          title={t('review.empty.title')}
          message={t('review.empty.body')}
          action={
            <div className="learn-empty-action">
              {empty.suggestion ? (
                <LinkButton to={`/app/learn/lesson/${empty.suggestion.lessonId}`}>{t('review.empty.lesson')}</LinkButton>
              ) : (
                <LinkButton to="/app/learn">{t('review.backToLearn')}</LinkButton>
              )}
            </div>
          }
        />
      </div>
    );
  }
  if (!view) return <Loading label={t('review.loading')} />;
  return (
    <SessionPlayer
      key={view.sessionId}
      session={view}
      kind="practice"
      paths={PRACTICE_PATHS}
      exitTo="/app/learn"
      exitLabel={t('review.backToLearn')}
      onPractise={(ids) => navigate('/app/learn/review', { state: { exerciseIds: ids } })}
      onRestart={() => navigate('/app/learn/review')}
    />
  );
}
