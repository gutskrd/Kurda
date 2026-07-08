import { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { RootNavigation } from '../navigation/rootStack';
import { colors, radii, spacing, typography } from '../theme/tokens';

/**
 * Learn tab. The lesson map / skill tree is a later issue (KUR-032); until
 * it lands this screen is the entry point into the lesson player — you can
 * open any published lesson by id.
 */
export function LearnScreen() {
  const navigation = useNavigation<RootNavigation>();
  const [lessonId, setLessonId] = useState('');
  const trimmed = lessonId.trim();

  return (
    <View style={styles.screen}>
      <Text style={styles.emoji}>📚</Text>
      <Text style={styles.title}>Learn</Text>
      <Text style={styles.subtitle}>The lesson map is coming soon. For now, open a lesson by id.</Text>

      <TextInput
        value={lessonId}
        onChangeText={setLessonId}
        placeholder="Lesson id"
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
        accessibilityLabel="Lesson id"
      />
      <Pressable
        disabled={trimmed.length === 0}
        onPress={() => navigation.navigate('Lesson', { lessonId: trimmed })}
        style={[styles.start, trimmed.length === 0 && styles.disabled]}
      >
        <Text style={styles.startText}>Start lesson</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.xl,
    gap: spacing.md,
  },
  emoji: { fontSize: typography.sizes.xxl },
  title: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: colors.primary },
  subtitle: { fontSize: typography.sizes.md, color: colors.textSecondary, textAlign: 'center' },
  input: {
    alignSelf: 'stretch',
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    fontSize: typography.sizes.md,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    marginTop: spacing.md,
  },
  start: {
    alignSelf: 'stretch',
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  disabled: { opacity: 0.4 },
  startText: { color: colors.textOnPrimary, fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
});
