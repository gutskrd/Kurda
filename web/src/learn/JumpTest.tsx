import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { PATH_JUMP } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Button, LinkButton } from '../components/Button';
import { useLocale, useT } from '../i18n/I18nProvider';
import { describeError } from '../lib/api';
import type { ApiError } from '../lib/types';
import { JumpResults } from './JumpResults';
import { LessonPlaceholder } from './LessonPlaceholder';
import { PRACTICE_PATHS, SessionPlayer } from './SessionPlayer';
import type { JumpTestStart } from './types';
import './jump.css';

/** Where the test was started from (the path on Learn or on a course's page), to go back to; Learn otherwise. */
function fromState(state: unknown): string {
  const from = state && typeof state === 'object' ? (state as { from?: unknown }).from : null;
  return typeof from === 'string' && from.startsWith('/app/') ? from : '/app/learn';
}

/**
 * A test that jumps ahead to a chapter (/app/learn/jump/:courseId/:unitId), from the "Jump here?" offer on the path. It
 * starts here, or opens today's unfinished one again, so a reload resumes it; it plays in the lesson player with the
 * same grading and ends on its own result (JumpResults). A test that cannot start says why, with the way back.
 */
export function JumpTest(): React.JSX.Element {
  const { courseId = '', unitId = '' } = useParams();
  const { key } = useLocation();
  // Each visit is its own start, so "Try again" starts a new test.
  return <JumpTestPage key={key} courseId={courseId} unitId={unitId} />;
}

function JumpTestPage({ courseId, unitId }: { courseId: string; unitId: string }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const navigate = useNavigate();
  const { client } = useAuth();
  const { pathname, state } = useLocation();
  const from = fromState(state);
  const [start, setStart] = useState<JumpTestStart | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0);
  // One start per attempt, even when an effect runs twice.
  const asked = useRef<number | null>(null);

  useEffect(() => {
    if (asked.current === attempt) return;
    asked.current = attempt;
    setError(null);
    void client.post<JumpTestStart>(`/courses/${encodeURIComponent(courseId)}/jump`, { unitId }).then((res) => {
      if (res.ok) setStart(res.data);
      else setError(res.error);
    });
  }, [client, courseId, unitId, attempt]);

  if (error) {
    const limit = error.code === 'JUMP_LIMIT';
    const empty = error.code === 'JUMP_EMPTY';
    const again = !limit && !empty && error.kind !== 'client';
    return (
      <div className="container jump-end" role="alert">
        <h1 className="jump-end-title">{limit ? t('coursemap.jump.limitTitle') : empty ? t('coursemap.jump.emptyTitle') : t('coursemap.jump.startFailed')}</h1>
        <p className="jump-end-line">
          {limit
            ? t('coursemap.jump.limit', { count: PATH_JUMP.triesPerDay.toLocaleString(locale) })
            : empty
              ? t('coursemap.jump.empty')
              : describeError(error, t)}
        </p>
        <div className="jump-end-actions">
          {again && (
            <Button size="lg" block onClick={() => setAttempt((n) => n + 1)}>
              {t('common.retry')}
            </Button>
          )}
          <LinkButton to={from} variant={again ? 'secondary' : 'primary'} size="lg" block>
            {t('coursemap.jump.keepLearning')}
          </LinkButton>
        </div>
      </div>
    );
  }
  // The test plays in the lesson's frame, so that frame is what waits for it.
  if (!start) return <LessonPlaceholder label={t('coursemap.jump.loading')} />;
  return (
    <SessionPlayer
      session={{ ...start, answered: start.answered ?? {} }}
      kind="practice"
      paths={PRACTICE_PATHS}
      title={t('coursemap.jump.title', { n: start.jump.unitNumber.toLocaleString(locale) })}
      exitTo={from}
      exitLabel={t('coursemap.jump.keepLearning')}
      onPractise={(ids) => navigate('/app/learn/review', { state: { exerciseIds: ids } })}
      renderResults={(results) => (
        <JumpResults
          test={start.jump}
          outcome={results.jump ?? null}
          onPath={() => navigate(from)}
          onAgain={() => navigate(pathname, { replace: true, state: { from } })}
        />
      )}
    />
  );
}
