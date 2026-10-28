import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radii, spacing, typography } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import {
  isLeftMatched,
  isRightMatched,
  tapLeft,
  tapRight,
  type MatchState,
} from '../match';
import type { Exercise } from '../types';
import { useI18n } from '../../i18n/I18nContext';
import { AnswerMotion } from '../../theme/MotionParts';
import { useAudio } from '../useAudio';

interface Props {
  exercise: Exercise;
  state: MatchState;
  onChange: (state: MatchState) => void;
  disabled: boolean;
  /** how the pairs were graded, once they have been: they pop, or shake once */
  verdict?: 'right' | 'wrong' | null;
}

/**
 * Tap a Kurdish card, then its meaning. A Kurdish card with a recording says
 * it as it is chosen — hearing the word while deciding what it means — as the
 * website's cards do; tapping a made pair to undo it says nothing.
 */
export function MatchPairsExercise({ exercise, state, onChange, disabled, verdict = null }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const say = useCardSound();
  const tapKurdish = (left: string): void => {
    if (!isLeftMatched(state, left)) say(exercise.audio?.[left]);
    onChange(tapLeft(state, left));
  };
  const token = (
    label: string,
    matched: boolean,
    selected: boolean,
    onPress: () => void,
  ) => (
    <Pressable
      key={label}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: selected || matched, disabled }}
      style={[
        styles.token,
        {
          backgroundColor: matched ? colors.success : colors.controlTrack,
          borderColor: matched ? colors.success : selected ? colors.primary : colors.glassBorder,
        },
        disabled && styles.dim,
      ]}
    >
      <Text style={[styles.tokenText, { color: matched ? colors.textOnPrimary : colors.textPrimary }, (matched || selected) && styles.tokenTextActive]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{t('lesson.match.prompt')}</Text>
      <AnswerMotion verdict={verdict} style={styles.columns}>
        <View style={styles.column}>
          {(exercise.lefts ?? []).map((left) =>
            token(left, isLeftMatched(state, left), state.selectedLeft === left, () => tapKurdish(left)),
          )}
        </View>
        <View style={styles.column}>
          {(exercise.rights ?? []).map((right) =>
            token(right, isRightMatched(state, right), false, () => onChange(tapRight(state, right))),
          )}
        </View>
      </AnswerMotion>
    </View>
  );
}

/**
 * One player for the cards: a tap loads that card's recording and plays it as
 * soon as it has loaded, and the same card tapped again plays it again.
 */
function useCardSound(): (url: string | undefined) => void {
  const [wanted, setWanted] = useState<{ url: string; n: number } | null>(null);
  const { source, play } = useAudio(wanted?.url);
  const played = useRef(0);
  useEffect(() => {
    if (!wanted || source !== wanted.url || played.current === wanted.n) return;
    played.current = wanted.n;
    play(1);
  }, [wanted, source, play]);
  return useCallback((url: string | undefined) => {
    if (url) setWanted((was) => ({ url, n: (was?.n ?? 0) + 1 }));
  }, []);
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  label: { fontSize: typography.sizes.sm, textTransform: 'uppercase' },
  columns: { flexDirection: 'row', gap: spacing.md },
  column: { flex: 1, gap: spacing.sm },
  token: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 2,
    alignItems: 'center',
  },
  tokenText: { fontSize: typography.sizes.md },
  tokenTextActive: { fontWeight: typography.weights.bold },
  dim: { opacity: 0.6 },
});
