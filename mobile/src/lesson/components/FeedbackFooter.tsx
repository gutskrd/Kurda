import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { radii, spacing, typography } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { ClayButton } from '../../theme/glass';
import { useI18n } from '../../i18n/I18nContext';
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
  const { colors } = useTheme();
  const { t } = useI18n();
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
        <ClayButton
          label={t('lesson.check')}
          tone="primary"
          size="large"
          busy={submitting}
          disabled={!canCheck}
          onPress={onCheck}
        />
      </View>
    );
  }

  const good = feedback.accepted;
  const title = feedback.verdict === 'typo' ? t('lesson.almostTypo') : good ? t('lesson.correct') : t('lesson.notQuite');
  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });

  return (
    <Animated.View
      style={[styles.banner, { backgroundColor: good ? colors.successFill : colors.dangerFill }, { opacity: slide, transform: [{ translateY }] }]}
    >
      <Text style={[styles.bannerTitle, { color: good ? colors.success : colors.danger }]}>{title}</Text>
      {feedback.correction ? (
        <Text style={[styles.correction, { color: colors.textPrimary }]}>
          {t('lesson.answer')} <Text style={styles.correctionValue}>{feedback.correction}</Text>
        </Text>
      ) : null}
      <ClayButton
        label={t('common.continue')}
        tone={good ? 'success' : 'danger'}
        size="large"
        onPress={onContinue}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  footer: { padding: spacing.lg },
  banner: {
    padding: spacing.lg,
    gap: spacing.sm,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
  },
  bannerTitle: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  correction: { fontSize: typography.sizes.md },
  correctionValue: { fontWeight: typography.weights.bold },
});
