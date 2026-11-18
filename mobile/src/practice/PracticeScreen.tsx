import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { PracticeMode, RecordedAnswer } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { SessionLoading, SessionPlayer, type SessionPaths } from '../lesson/LessonPlayerScreen';
import type { Exercise, SessionView } from '../lesson/types';
import type { RootNavigation } from '../navigation/rootStack';
import type { ApiError } from '../api/types';
import { describeError, isRetryable } from '../api/errors';
import { EmptyState } from '../theme/EmptyState';
import { GradientBackground } from '../theme/glass';
import { useI18n } from '../i18n/I18nContext';

/** A practice session's endpoints; a test to jump ahead is answered through them too. */
export const PRACTICE_PATHS: SessionPaths = {
  answers: (id) => `/practice/sessions/${id}/answers`,
  retry: (id) => `/practice/sessions/${id}/retry`,
  complete: (id) => `/practice/sessions/${id}/complete`,
};

interface PracticeStart {
  sessionId?: string;
  exercises?: Exercise[];
  /** What a session opened again already has answered (GET /practice/sessions/:id). */
  answered?: Record<string, RecordedAnswer>;
  completed?: boolean;
  empty?: boolean;
  suggestion?: { lessonId: string; title: string } | null;
}

/**
 * Practice and review: the lesson player over the review queue, over `exerciseIds` (a finished lesson's mistakes,
 * from which the server builds a session), or over another kind the hub started (`mode`, and `unitId` for a
 * unit's review).
 *
 * With `sessionId` it resumes a review left part-way (Learn's "Continue review", from GET /practice/due's
 * `open`), reading the session back with its answers rather than starting a new one beside it.
 *
 * Nothing to practise, or a session that would not start, shows the shared empty state (theme/EmptyState) with
 * Back beside the way on, since a full-screen modal has no other exit.
 */
export function PracticeScreen({
  navigation,
  onExit,
  exerciseIds,
  mode,
  unitId,
  sessionId,
}: {
  navigation: RootNavigation;
  onExit: () => void;
  exerciseIds?: string[];
  mode?: PracticeMode;
  unitId?: string;
  /** An unfinished review to pick up, in place of starting one. */
  sessionId?: string;
}) {
  const { client } = useAuth();
  const { t } = useI18n();
  const [start, setStart] = useState<PracticeStart | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // The ids by value: the same mistakes passed again are the same session to start.
  const chosen = exerciseIds && exerciseIds.length > 0 ? exerciseIds.join(',') : null;
  useEffect(() => {
    let active = true;
    setError(null);
    setStart(null);
    const body = chosen ? { exerciseIds: chosen.split(',') } : mode ? { mode, ...(unitId ? { unitId } : {}) } : undefined;
    const opened = sessionId
      ? client.get<PracticeStart>(`/practice/sessions/${encodeURIComponent(sessionId)}`)
      : client.post<PracticeStart>('/practice/session', body);
    void opened.then((res) => {
      if (!active) return;
      if (res.ok) setStart(res.data);
      else setError(res.error);
    });
    return () => {
      active = false;
    };
  }, [client, reloadKey, chosen, mode, unitId, sessionId]);

  // A full-screen modal with no header: every state that is not the session has a way back out of it.
  const back = { label: t('common.back'), onPress: onExit };
  if (error) {
    const retry = isRetryable(error) ? { label: t('common.retry'), onPress: () => setReloadKey((k) => k + 1) } : null;
    return (
      <Centered>
        <EmptyState art="offline" title={t('practice.startFailed')} body={describeError(error, t)} action={retry ?? back} secondary={retry ? back : undefined} />
      </Centered>
    );
  }
  if (!start) return <SessionLoading onExit={onExit} />;

  // Nothing due: point to the next new lesson; nothing of another kind: back to the hub's other kinds.
  if (start.empty || !start.sessionId || !start.exercises?.length) {
    const kind = !chosen && mode && mode !== 'review';
    const suggestion = !kind ? start.suggestion : null;
    const next = suggestion
      ? { label: t('practice.startLabel', { title: suggestion.title }), onPress: () => navigation.replace('Lesson', { lessonId: suggestion.lessonId }) }
      : null;
    return (
      <Centered>
        <EmptyState
          title={t(kind ? 'practice.emptyKind.title' : 'practice.empty.title')}
          body={t(kind ? 'practice.emptyKind.body' : 'practice.empty.body')}
          action={next ?? back}
          secondary={next ? back : undefined}
        />
      </Centered>
    );
  }

  // Adapt the practice payload to the shared player's SessionView shape.
  const view: SessionView = {
    sessionId: start.sessionId,
    lessonId: '',
    expiresAt: '2999-01-01T00:00:00Z',
    completed: start.completed === true,
    exercises: start.exercises.map((ex, i) => ({ ...ex, position: i + 1 })),
    // A resumed review carries what was answered, and the player continues from there.
    answered: start.answered ?? {},
  };
  return (
    <SessionPlayer
      view={view}
      paths={PRACTICE_PATHS}
      kind="practice"
      onExit={onExit}
      // What was missed here can be practised again at once, in this session's place.
      onPractise={(ids) => navigation.replace('Practice', { exerciseIds: ids })}
      onPath={() => navigation.popTo('Tabs', { screen: 'Learn', params: { view: 'lessons' } })}
    />
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <GradientBackground>
      <View style={styles.centered}>{children}</View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  // The empty state keeps its own margins.
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
