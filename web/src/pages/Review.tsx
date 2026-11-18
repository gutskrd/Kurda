import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PRACTICE_MODES, type PracticeMode } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { LinkButton } from '../components/Button';
import { EmptyState, ErrorState } from '../components/states';
import { useT } from '../i18n/I18nProvider';
import { LessonPlaceholder } from '../learn/LessonPlaceholder';
import { PRACTICE_PATHS, SessionPlayer } from '../learn/SessionPlayer';
import type { EmptyPractice, PracticeSessionView } from '../learn/types';
import type { MessageKey } from '../i18n/en';
import { practiceHref } from '../practice/hub';

/** The practice page, where a session of another kind than review starts and ends. */
const PRACTICE_PAGE = '/app/learn/practice';

/** Each kind's name over its questions; review keeps the player's own. */
const KIND_TITLE: Record<Exclude<PracticeMode, 'review'>, MessageKey> = {
  mistakes: 'practice.hub.mistakes',
  words: 'practice.hub.words',
  listen: 'practice.hub.listen',
  speak: 'practice.hub.speak',
  unit: 'practice.hub.unit',
};

interface Passed {
  /** "Practise these now": the exercises to practise, from a results screen. */
  exerciseIds?: string[];
  /** The session just started, handed to its own address so it is not fetched twice. */
  session?: PracticeSessionView;
  /** The kind the session is, when the practice page started it, so it ends there. */
  mode?: PracticeMode;
}

function isMode(value: unknown): value is PracticeMode {
  return (PRACTICE_MODES as readonly unknown[]).includes(value);
}

function passedState(state: unknown): Passed {
  if (!state || typeof state !== 'object') return {};
  const s = state as Record<string, unknown>;
  const ids = Array.isArray(s.exerciseIds) ? s.exerciseIds.filter((x): x is string => typeof x === 'string') : undefined;
  const session = s.session && typeof s.session === 'object' ? (s.session as PracticeSessionView) : undefined;
  return { exerciseIds: ids && ids.length > 0 ? ids : undefined, session, mode: isMode(s.mode) ? s.mode : undefined };
}

/**
 * The kind of session an address asks for (`?mode=listen`, a chapter's `?mode=unit&unit=…`), or null for review. A
 * chapter's review without its chapter is review.
 */
function askedKind(params: URLSearchParams): { mode: PracticeMode; unitId?: string } | null {
  const mode = params.get('mode');
  if (!isMode(mode) || mode === 'review') return null;
  if (mode !== 'unit') return { mode };
  const unitId = params.get('unit');
  return unitId ? { mode, unitId } : null;
}

/**
 * Review (/app/learn/review): a practice session in the lesson player over what is due (padded with the weakest
 * items), from a results screen exactly the mistakes just made, or another kind the practice page asked for
 * (`?mode=`). The session then gets its own address (/app/learn/review/:sessionId), so leaving or reloading resumes it.
 * Both addresses render this element, keyed by session (or by visit before one exists), so a new session is not fetched
 * again and "practise these now" starts a new review.
 */
export function Review(): React.JSX.Element {
  const { sessionId } = useParams();
  const { key } = useLocation();
  return <ReviewPage key={sessionId ?? `start:${key}`} sessionId={sessionId} />;
}

function ReviewPage({ sessionId }: { sessionId: string | undefined }): React.JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const { client } = useAuth();
  const { state } = useLocation();
  const [params] = useSearchParams();
  const passed = passedState(state);
  const [view, setView] = useState<PracticeSessionView | null>(
    sessionId && passed.session?.sessionId === sessionId ? passed.session : null,
  );
  const [empty, setEmpty] = useState<EmptyPractice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // One start per attempt, even when an effect runs twice.
  const started = useRef<number | null>(null);
  const exerciseIds = passed.exerciseIds;
  const asked = exerciseIds ? null : askedKind(params);
  // A session the practice page started goes back there; review goes back to Learn.
  const kind = asked?.mode ?? passed.mode ?? null;
  const exitTo = kind ? PRACTICE_PAGE : '/app/learn';
  const exitLabel = kind ? t('practice.back') : t('review.backToLearn');

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
    const body = exerciseIds ? { exerciseIds } : asked ? { mode: asked.mode, ...(asked.unitId ? { unitId: asked.unitId } : {}) } : undefined;
    void client.post<PracticeSessionView | EmptyPractice>('/practice/session', body).then((res) => {
      if (!res.ok) {
        setError(describeError(res.error, t));
        return;
      }
      if ('empty' in res.data) {
        setEmpty(res.data);
        return;
      }
      navigate(`/app/learn/review/${res.data.sessionId}`, { replace: true, state: { session: res.data, mode: asked?.mode } });
    });
    // `view`, the passed ids and the asked kind are read, not followed: having the session is no reason to refetch, and
    // a start happens once per attempt.
  }, [sessionId, attempt, client, navigate, t]);

  if (error) {
    return (
      <div className="container">
        <ErrorState title={t('review.startFailed')} message={error} onRetry={() => setAttempt((n) => n + 1)} />
      </div>
    );
  }
  if (empty) {
    // Nothing of another kind: back to the other kinds. Nothing to review: the next lesson.
    if (asked) {
      return (
        <div className="container">
          <EmptyState
            title={t('practice.emptyKind.title')}
            message={t('practice.emptyKind.body')}
            action={
              <div className="learn-empty-action">
                <LinkButton to={PRACTICE_PAGE}>{t('practice.back')}</LinkButton>
              </div>
            }
          />
        </div>
      );
    }
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
  // A review plays in the lesson's frame, so that frame is what waits for it.
  if (!view) return <LessonPlaceholder label={t('review.loading')} />;
  return (
    <SessionPlayer
      key={view.sessionId}
      session={view}
      kind="practice"
      paths={PRACTICE_PATHS}
      title={kind && kind !== 'review' ? t(KIND_TITLE[kind]) : undefined}
      exitTo={exitTo}
      exitLabel={exitLabel}
      onPractise={(ids) => navigate('/app/learn/review', { state: { exerciseIds: ids, mode: kind ?? undefined } })}
      // A closed session starts afresh as the same kind; a chapter's review, which needs its chapter, starts from the list.
      onRestart={() => navigate(kind && kind !== 'unit' ? practiceHref(kind) : kind ? PRACTICE_PAGE : '/app/learn/review')}
    />
  );
}
