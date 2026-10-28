import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PATH_JUMP, type RecordedAnswer } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { describeError, isRetryable } from '../api/errors';
import type { ApiError } from '../api/types';
import { formatNumber } from '../i18n/format';
import { useI18n } from '../i18n/I18nContext';
import { SessionPlayer } from '../lesson/LessonPlayerScreen';
import type { Exercise, SessionView } from '../lesson/types';
import { PRACTICE_PATHS } from '../practice/PracticeScreen';
import { display } from '../theme/fonts';
import { ClayButton, GradientBackground } from '../theme/glass';
import { Skeleton, SkeletonLines } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { JumpResults } from './JumpResults';

/** What starting a test answers (api/src/jump/service.ts `JumpTest`). */
export interface JumpTestStart {
  sessionId: string;
  exercises: Exercise[];
  answered: Record<string, RecordedAnswer>;
  jump: { unitId: string; unitNumber: number; unitTitle: string; mistakesAllowed: number; triesLeft: number };
}

/**
 * The short test that jumps ahead to a unit. It is started here (or the one
 * left unfinished today opened again), played in the player lessons and
 * reviews use — graded the same way, second tries counting for nothing — and
 * ends on its own results (JumpResults): the unit open, or not yet.
 *
 * A test that cannot start says why in words: the day's tries at this unit
 * used up, nothing to test, or a plain failure with a retry.
 */
export function JumpTestScreen({
  courseId,
  unitId,
  onExit,
  onPath,
  onAgain,
}: {
  courseId: string;
  unitId: string;
  onExit: () => void;
  /** back to the lesson path, which shows what the test opened */
  onPath: () => void;
  /** start another test at the same unit, in this one's place */
  onAgain: () => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const [start, setStart] = useState<JumpTestStart | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setError(null);
    void client.post<JumpTestStart>(`/courses/${courseId}/jump`, { unitId }).then((res) => {
      if (!active) return;
      if (res.ok) setStart(res.data);
      else setError(res.error);
    });
    return () => {
      active = false;
    };
  }, [client, courseId, unitId, attempt]);

  if (error) {
    const code = error.code;
    const title =
      code === 'JUMP_LIMIT' ? t('coursemap.jump.limitTitle') : code === 'JUMP_EMPTY' ? t('coursemap.jump.emptyTitle') : t('coursemap.jump.startFailed');
    const detail =
      code === 'JUMP_LIMIT'
        ? t('coursemap.jump.limit', { count: formatNumber(PATH_JUMP.triesPerDay, locale) })
        : code === 'JUMP_EMPTY'
          ? t('coursemap.jump.empty')
          : describeError(error, t);
    const again = code !== 'JUMP_LIMIT' && code !== 'JUMP_EMPTY' && isRetryable(error);
    return (
      <GradientBackground>
        <View style={styles.centered}>
          <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header">
            {title}
          </Text>
          <Text style={[styles.detail, { color: colors.textSecondary }]}>{detail}</Text>
          <View style={styles.actions}>
            {again ? <ClayButton label={t('common.retry')} tone="primary" size="large" onPress={() => setAttempt((n) => n + 1)} /> : null}
            <ClayButton label={t('coursemap.jump.keepLearning')} tone={again ? 'neutral' : 'primary'} size="large" onPress={onPath} />
          </View>
        </View>
      </GradientBackground>
    );
  }

  if (!start) {
    return (
      <GradientBackground>
        <View style={styles.loading}>
          <Skeleton width="55%" height={22} />
          <SkeletonLines count={3} />
          <Skeleton height={140} radius={radii.lg} />
        </View>
      </GradientBackground>
    );
  }

  const view: SessionView = {
    sessionId: start.sessionId,
    lessonId: '',
    expiresAt: '2999-01-01T00:00:00Z',
    completed: false,
    exercises: start.exercises.map((ex, i) => ({ ...ex, position: i + 1 })),
    answered: start.answered,
  };
  return (
    <SessionPlayer
      view={view}
      paths={PRACTICE_PATHS}
      kind="practice"
      onExit={onExit}
      renderResults={(results) => <JumpResults test={start.jump} outcome={results.jump ?? null} onPath={onPath} onAgain={onAgain} />}
    />
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  loading: { flex: 1, gap: spacing.lg, padding: spacing.xl, paddingTop: spacing.xxl },
  title: { ...display(typography.sizes.xl), textAlign: 'center' },
  detail: { fontSize: typography.sizes.md, lineHeight: 22, textAlign: 'center' },
  actions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.sm },
});
