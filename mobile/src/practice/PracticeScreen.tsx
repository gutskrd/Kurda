import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { SessionPlayer, type SessionPaths } from '../lesson/LessonPlayerScreen';
import type { Exercise, SessionView } from '../lesson/types';
import type { RootNavigation } from '../navigation/rootStack';
import type { ApiError } from '../api/types';
import { describeError, isRetryable } from '../api/errors';
import { radii, spacing, typography } from '../theme/tokens';
import { display } from '../theme/fonts';
import { ClayButton, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { Skeleton, SkeletonLines } from '../theme/Skeleton';
import { useI18n } from '../i18n/I18nContext';

const PRACTICE_PATHS: SessionPaths = {
  answers: (id) => `/practice/sessions/${id}/answers`,
  complete: (id) => `/practice/sessions/${id}/complete`,
};

interface PracticeStart {
  sessionId?: string;
  exercises?: Exercise[];
  empty?: boolean;
  suggestion?: { lessonId: string; title: string } | null;
}

/** Practice/review mode (KUR-034): reuses the lesson player over the SR queue. */
export function PracticeScreen({ navigation, onExit }: { navigation: RootNavigation; onExit: () => void }) {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const [start, setStart] = useState<PracticeStart | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setError(null);
    setStart(null);
    void client.post<PracticeStart>('/practice/session').then((res) => {
      if (!active) return;
      if (res.ok) setStart(res.data);
      else setError(res.error);
    });
    return () => {
      active = false;
    };
  }, [client, reloadKey]);

  if (error) {
    const message = describeError(error, t);
    const retryable = isRetryable(error);
    return (
      <Centered>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{t('practice.startFailed')}</Text>
        <Text style={[styles.detail, { color: colors.textSecondary }]}>{message}</Text>
        {retryable ? <Primary label={t('common.retry')} onPress={() => setReloadKey((k) => k + 1)} /> : null}
        <Primary label={t('common.back')} onPress={onExit} />
      </Centered>
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

  // nothing due → nudge toward the next new lesson
  if (start.empty || !start.sessionId || !start.exercises?.length) {
    return (
      <Centered>
        <Icon name="check" size={56} color={colors.gold} />
        <Text style={[styles.title, { color: colors.textPrimary }]}>{t('practice.empty.title')}</Text>
        <Text style={[styles.detail, { color: colors.textSecondary }]}>{t('practice.empty.body')}</Text>
        {start.suggestion ? (
          <Primary
            label={t('practice.startLabel', { title: start.suggestion.title })}
            onPress={() => navigation.replace('Lesson', { lessonId: start.suggestion!.lessonId })}
          />
        ) : (
          <Primary label={t('common.back')} onPress={onExit} />
        )}
      </Centered>
    );
  }

  // adapt the practice payload to the shared player's SessionView shape
  const view: SessionView = {
    sessionId: start.sessionId,
    lessonId: '',
    expiresAt: '2999-01-01T00:00:00Z',
    completed: false,
    exercises: start.exercises.map((ex, i) => ({ ...ex, position: i + 1 })),
    answered: {},
  };
  return <SessionPlayer view={view} paths={PRACTICE_PATHS} onExit={onExit} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <GradientBackground>
      <View style={styles.centered}>{children}</View>
    </GradientBackground>
  );
}

function Primary({ label, onPress }: { label: string; onPress: () => void }) {
  return <ClayButton label={label} tone="primary" size="large" onPress={onPress} />;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  loading: { flex: 1, gap: spacing.lg, padding: spacing.xl, paddingTop: spacing.xxl },
  title: { ...display(typography.sizes.xl), textAlign: 'center' },
  detail: { fontSize: typography.sizes.md, textAlign: 'center' },
});
