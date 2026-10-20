import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { radii, spacing, typography } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { ClayButton } from '../../theme/glass';
import { useI18n } from '../../i18n/I18nContext';
import { feedbackTitle, type Feedback } from '../player';
import { useAudio } from '../useAudio';
import { useReducedMotion } from '../../a11y/useReducedMotion';
import { timing } from '../../theme/animate';
import { duration } from '../../theme/motion';
import { Icon } from '../../theme/Icon';
import { DrawnCheck } from '../../theme/MotionParts';
import { useScreenBottomInset } from '../../navigation/tabBarLayout';

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
 * correction, the native recording to hear when there is one, and a
 * Continue button. A miss says it will come back.
 *
 * The verdict is a mark as well as a colour: a check that draws in, or a
 * cross. Under Reduce Motion the banner fades in where it is.
 *
 * Both sit clear of the home indicator: the lesson is full screen, and the
 * bottom edge of a phone without a home button belongs to the system's swipe.
 */
export function FeedbackFooter({ feedback, canCheck, submitting, onCheck, onContinue }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const slide = useRef(new Animated.Value(0)).current;
  const model = useAudio(feedback?.modelAudioUrl);
  const bottom = useScreenBottomInset(spacing.lg);

  useEffect(() => {
    if (!feedback) {
      slide.setValue(0);
      return;
    }
    timing(slide, 1, duration.base).start();
  }, [feedback, slide]);

  if (!feedback) {
    return (
      <View style={[styles.footer, { paddingBottom: bottom }]}>
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
  const title = t(feedbackTitle(feedback));
  const translateY = reduce ? 0 : slide.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });

  return (
    <Animated.View
      style={[
        styles.banner,
        { paddingBottom: bottom, backgroundColor: good ? colors.successFill : colors.dangerFill },
        { opacity: slide, transform: [{ translateY }] },
      ]}
    >
      <View style={styles.titleRow}>
        {good ? <DrawnCheck size={24} color={colors.success} delayMs={120} /> : <Icon name="close" size={24} color={colors.danger} />}
        <Text accessibilityLiveRegion="polite" style={[styles.bannerTitle, { color: good ? colors.success : colors.danger }]}>
          {title}
        </Text>
      </View>
      {feedback.correction ? (
        <Text style={[styles.correction, { color: colors.textPrimary }]}>
          {t('lesson.answer')} <Text style={styles.correctionValue}>{feedback.correction}</Text>
        </Text>
      ) : null}
      {feedback.comesBack ? <Text style={[styles.note, { color: colors.textPrimary }]}>{t('lesson.comesBack')}</Text> : null}
      {model.supported ? (
        <ClayButton label={t('lesson.hearIt')} icon="speaker" variant="outline" tone={good ? 'success' : 'danger'} onPress={() => model.play(1)} />
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
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  bannerTitle: { flexShrink: 1, fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  correction: { fontSize: typography.sizes.md },
  correctionValue: { fontWeight: typography.weights.bold },
  note: { fontSize: typography.sizes.sm },
});
