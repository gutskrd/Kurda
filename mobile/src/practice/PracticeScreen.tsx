import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { SessionPlayer, type SessionPaths } from '../lesson/LessonPlayerScreen';
import type { Exercise, SessionView } from '../lesson/types';
import type { RootNavigation } from '../navigation/rootStack';
import type { ApiError } from '../api/types';
import { describeError } from '../api/errors';
import { colors, radii, spacing, typography } from '../theme/tokens';

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
    const { message, retryable } = describeError(error);
    return (
      <Centered>
        <Text style={styles.title}>Couldn’t start practice.</Text>
        <Text style={styles.detail}>{message}</Text>
        {retryable ? <Primary label="Try again" onPress={() => setReloadKey((k) => k + 1)} /> : null}
        <Primary label="Back" onPress={onExit} />
      </Centered>
    );
  }
  if (!start) {
    return (
      <Centered>
        <ActivityIndicator size="large" color={colors.primary} />
      </Centered>
    );
  }

  // nothing due → nudge toward the next new lesson
  if (start.empty || !start.sessionId || !start.exercises?.length) {
    return (
      <Centered>
        <Text style={styles.emoji}>🌱</Text>
        <Text style={styles.title}>Nothing to review yet</Text>
        <Text style={styles.detail}>Finish a lesson to start building your review deck.</Text>
        {start.suggestion ? (
          <Primary
            label={`Start: ${start.suggestion.title}`}
            onPress={() => navigation.replace('Lesson', { lessonId: start.suggestion!.lessonId })}
          />
        ) : (
          <Primary label="Back" onPress={onExit} />
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
  return <View style={styles.centered}>{children}</View>;
}

function Primary({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.button}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  emoji: { fontSize: 56 },
  title: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: colors.textPrimary, textAlign: 'center' },
  detail: { fontSize: typography.sizes.md, color: colors.textSecondary, textAlign: 'center' },
  button: {
    marginTop: spacing.md,
    alignSelf: 'stretch',
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  buttonText: { color: colors.textOnPrimary, fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
});
