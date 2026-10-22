import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import type { RecordingVoice } from '@kurda/shared';
import { radii, spacing, typography } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { ClayButton } from '../../theme/glass';
import { useI18n } from '../../i18n/I18nContext';
import { feedbackTitle, type Feedback } from '../player';
import { useAudio, type AudioControls } from '../useAudio';
import { useReducedMotion } from '../../a11y/useReducedMotion';
import { timing } from '../../theme/animate';
import { duration } from '../../theme/motion';
import { Icon } from '../../theme/Icon';
import { DrawnCheck } from '../../theme/MotionParts';
import { useScreenBottomInset } from '../../navigation/tabBarLayout';
import { useDirection } from '../../reports/direction';
import { CHARACTER_SIZE, SpeakingCharacter, knownVoice } from '../../characters/SpeakingCharacter';

/** A run of right answers is named once it is three long: two in a row is common, three is a run. */
const RUN_SHOWN_FROM = 3;

interface Props {
  /** null while the learner is still answering */
  feedback: Feedback | null;
  canCheck: boolean;
  submitting: boolean;
  onCheck: () => void;
  onContinue: () => void;
  /** right answers in a row, this one included: named from the third, a small "keep going" */
  inARow?: number;
  /** the exercise's character is on its stage above and reacts there, so the banner needs no second one */
  staged?: boolean;
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
export function FeedbackFooter({ feedback, canCheck, submitting, onCheck, onContinue, inARow = 0, staged = false }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const slide = useRef(new Animated.Value(0)).current;
  const model = useAudio(feedback?.modelAudioUrl);
  const bottom = useScreenBottomInset(spacing.lg);
  const dir = useDirection();

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
  const showRun = good && inARow >= RUN_SHOWN_FROM;
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
        {/* a run of right answers, named from the third: the chime has been climbing, and this says why */}
        {showRun ? (
          <View style={[styles.run, { backgroundColor: colors.background }]} testID="lesson-in-a-row">
            <Icon name="flame" size={14} color={colors.goldText} />
            <Text style={[styles.runText, { color: colors.goldText }]}>{t('lesson.inARow', { count: inARow })}</Text>
          </View>
        ) : null}
      </View>
      {feedback.correction ? (
        <Text style={[styles.correction, { color: colors.textPrimary }]}>
          {t('lesson.answer')} <Text style={styles.correctionValue}>{feedback.correction}</Text>
        </Text>
      ) : null}
      {feedback.comesBack ? <Text style={[styles.note, { color: colors.textPrimary }]}>{t('lesson.comesBack')}</Text> : null}
      {model.supported ? (
        <HearIt
          voice={staged ? null : knownVoice(feedback.modelAudioVoice)}
          model={model}
          source={feedback.modelAudioUrl}
          text={feedback.correction}
          tone={good ? 'success' : 'danger'}
          row={dir.row}
          rtl={dir.rtl}
        />
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

/** The native recording, with whoever says it beside the button when an editor has chosen somebody. */
function HearIt({
  voice,
  model,
  source,
  text,
  tone,
  row,
  rtl,
}: {
  voice: RecordingVoice | null;
  model: AudioControls;
  source?: string;
  /** what the recording says, when the answer shows it */
  text?: string;
  tone: 'success' | 'danger';
  row: ViewStyle['flexDirection'];
  rtl: boolean;
}): React.JSX.Element {
  const { t } = useI18n();
  const button = <ClayButton label={t('lesson.hearIt')} icon="speaker" variant="outline" tone={tone} onPress={() => model.play(1)} style={voice ? styles.grow : null} />;
  if (!voice) return button;
  return (
    <View style={[styles.hearRow, { flexDirection: row }]}>
      {/* head to waist, cheering a right answer and tilting its head at one that was not yet; a tap says it again */}
      <SpeakingCharacter
        speaker={voice.speaker}
        voice={voice}
        text={text}
        player={model.clock}
        playing={model.playing}
        source={source}
        crop="half"
        height={CHARACTER_SIZE.answer}
        flip={rtl}
        reaction={tone === 'success' ? 'cheer' : 'hmm'}
        onPress={() => model.play(1)}
      />
      {button}
    </View>
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
  // at the end of the title's line, a small pill on the banner's tint
  run: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginStart: 'auto',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  runText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  correction: { fontSize: typography.sizes.md },
  correctionValue: { fontWeight: typography.weights.bold },
  note: { fontSize: typography.sizes.sm },
  hearRow: { alignItems: 'flex-end', gap: spacing.md },
  grow: { flex: 1 },
});
