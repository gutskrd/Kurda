import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import type { Feedback } from '../player';

interface Props {
  /** null while the learner is still answering */
  feedback: Feedback | null;
  canCheck: boolean;
  submitting: boolean;
  onCheck: () => void;
  onContinue: () => void;
}

/**
 * Bottom action bar. While answering it shows a Check button; once graded
 * it slides up a coloured banner (green accepted / red wrong) with the
 * correction, plus a Continue button.
 */
export function FeedbackFooter({ feedback, canCheck, submitting, onCheck, onContinue }: Props) {
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: feedback ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [feedback, slide]);

  if (!feedback) {
    return (
      <View style={styles.footer}>
        <Pressable
          disabled={!canCheck || submitting}
          onPress={onCheck}
          style={[styles.button, styles.check, (!canCheck || submitting) && styles.disabled]}
        >
          <Text style={styles.buttonText}>{submitting ? 'Checking…' : 'Check'}</Text>
        </Pressable>
      </View>
    );
  }

  const good = feedback.accepted;
  const title = feedback.verdict === 'typo' ? 'Almost — typo accepted' : good ? 'Correct!' : 'Not quite';
  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });

  return (
    <Animated.View
      style={[styles.banner, good ? styles.bannerGood : styles.bannerBad, { opacity: slide, transform: [{ translateY }] }]}
    >
      <Text style={[styles.bannerTitle, good ? styles.textGood : styles.textBad]}>{title}</Text>
      {feedback.correction ? (
        <Text style={styles.correction}>
          Answer: <Text style={styles.correctionValue}>{feedback.correction}</Text>
        </Text>
      ) : null}
      <Pressable onPress={onContinue} style={[styles.button, good ? styles.continueGood : styles.continueBad]}>
        <Text style={styles.buttonText}>Continue</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  footer: { padding: spacing.lg },
  button: {
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  check: { backgroundColor: colors.primary },
  disabled: { opacity: 0.4 },
  buttonText: { color: colors.textOnPrimary, fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  banner: {
    padding: spacing.lg,
    gap: spacing.sm,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
  },
  bannerGood: { backgroundColor: '#E6F4EA' },
  bannerBad: { backgroundColor: '#FBE9E7' },
  bannerTitle: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  textGood: { color: colors.success },
  textBad: { color: colors.danger },
  correction: { fontSize: typography.sizes.md, color: colors.textPrimary },
  correctionValue: { fontWeight: typography.weights.bold },
  continueGood: { backgroundColor: colors.success },
  continueBad: { backgroundColor: colors.danger },
});
