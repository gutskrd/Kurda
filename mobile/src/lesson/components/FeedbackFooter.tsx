import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';
import { isSoraniDialect, letterDiff, type DiffSegment, type ExerciseType, type RecordingVoice } from '@kurda/shared';
import { radii, spacing, typography } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { ClayButton } from '../../theme/glass';
import { useI18n } from '../../i18n/I18nContext';
import { RUN_SHOWN_FROM, VERDICT_TIMING, feedbackTitle, type Feedback } from '../player';
import { useAudio, type AudioControls } from '../useAudio';
import { useReducedMotion } from '../../a11y/useReducedMotion';
import { MIN_TOUCH_TARGET } from '../../a11y/a11y';
import { springTo, timing } from '../../theme/animate';
import { duration } from '../../theme/motion';
import { Icon } from '../../theme/Icon';
import { DrawnCheck } from '../../theme/MotionParts';
import { useScreenBottomInset } from '../../navigation/tabBarLayout';
import { useDirection } from '../../reports/direction';
import { autoplayOn } from '../../feedback/autoplayPref';
import { CHARACTER_SIZE, SpeakingCharacter, knownVoice, type CharacterReaction } from '../../characters/SpeakingCharacter';

/** How tall Hevalo stands in the sheet when he comes in to react: head to waist, smaller than a voice's character. */
const STAND_IN = 88;

/** Answers that are Kurdish typed by the learner, set letter by letter against the right one (as the website does). */
const TYPED: ReadonlySet<ExerciseType | undefined> = new Set<ExerciseType | undefined>(['translate', 'writing', 'listening']);

interface Props {
  /** null while the learner is still answering */
  feedback: Feedback | null;
  canCheck: boolean;
  submitting: boolean;
  onCheck: () => void;
  onContinue: () => void;
  /** right answers in a row, this one included: named from the third, a small "keep going" */
  inARow?: number;
  /** the run has just reached one of its milestones (5, 10, …): the headline says so and the pill pops */
  milestone?: number | null;
  /** the exercise's character is on its stage above and reacts there, so the banner needs no second one */
  staged?: boolean;
  /** Hevalo, in to react where nobody else is on screen: a cheer, or a curious tilt of the head at a miss */
  standIn?: CharacterReaction | null;
  /** the course's variety of Kurdish, so the answers are set in its direction */
  dialect?: string | null;
  /** what kind of slip a typed miss was, in words: "Only the marks differ: e → ê" */
  hint?: string | null;
  /** a word of praise in Kurdish for a right answer, with its meaning under it */
  praise?: string | null;
  /** the skill's tips, offered after a miss: "Why? Read the tips" */
  onWhy?: () => void;
  /** "Can't listen now" / "Can't speak now", at the start of the bar while answering */
  putOff?: { label: string; onPress: () => void } | null;
  /** what was just put off for the rest of the lesson, said for a few seconds with a way to undo it */
  putAway?: { label: string; onUndo: () => void } | null;
}

/**
 * The lesson's action bar. While answering it holds Check, and the way to put
 * off what cannot be done here and now; once graded it becomes the verdict
 * sheet, rising in the verdict's colour with Continue exactly where Check
 * was — so the thumb never moves and the rhythm is tap, tap.
 *
 * The sheet says the verdict in words and a mark (a check that draws in, or a
 * cross), never colour alone, and a screen reader hears it as one sentence. A
 * typed answer is set above the right one with the letters that differ
 * marked, and what kind of slip it was in a line under them; a miss says it
 * will come back, and offers the skill's tips. The native recording is there
 * to hear, and says itself a moment after the verdict unless that is turned
 * off (Settings → Sounds). A run of right answers is named from the third,
 * and at 5, 10 and every 5 after that the headline says so.
 *
 * Hevalo comes in to react only where nobody else is on screen to: on the
 * first answer, on a miss (curious, never sad) and at a run's milestone.
 * Under Reduce Motion the sheet fades in where it is, and the pill does not
 * pop.
 *
 * Both sit clear of the home indicator: the lesson is full screen, and the
 * bottom edge of a phone without a home button belongs to the system's swipe.
 */
export function FeedbackFooter({
  feedback,
  canCheck,
  submitting,
  onCheck,
  onContinue,
  inARow = 0,
  milestone = null,
  staged = false,
  standIn = null,
  dialect,
  hint = null,
  praise = null,
  onWhy,
  putOff = null,
  putAway = null,
}: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const slide = useRef(new Animated.Value(0)).current;
  const model = useAudio(feedback?.modelAudioUrl);
  const bottom = useScreenBottomInset(spacing.lg);
  const dir = useDirection();
  const kurdish: TextStyle = isSoraniDialect(dialect) ? { writingDirection: 'rtl' } : { writingDirection: 'ltr' };

  useEffect(() => {
    if (!feedback) {
      slide.setValue(0);
      return;
    }
    timing(slide, 1, duration.base).start();
  }, [feedback, slide]);

  // the native recording says itself a moment after the verdict, once it has loaded — not for a spoken answer,
  // which was just heard beside it, and not when the learner has asked for quiet
  const verdictAt = useRef(0);
  const said = useRef<Feedback | null>(null);
  useEffect(() => {
    if (feedback) verdictAt.current = Date.now();
  }, [feedback]);
  const loaded = model.clock !== null;
  const { play } = model;
  useEffect(() => {
    if (!feedback || !loaded || said.current === feedback || feedback.exerciseType === 'speaking' || !autoplayOn()) return;
    const id = setTimeout(() => {
      said.current = feedback;
      play(1);
    }, Math.max(0, VERDICT_TIMING.modelAtMs - (Date.now() - verdictAt.current)));
    return () => clearTimeout(id);
  }, [feedback, loaded, play]);

  if (!feedback) {
    return (
      <View style={[styles.footer, { paddingBottom: bottom }]}>
        {putAway ? (
          // said where the learner is looking, for long enough to change their mind
          <View style={[styles.aside, { flexDirection: dir.row }]} accessibilityLiveRegion="polite">
            <Text style={[styles.asideText, dir.text, { color: colors.textSecondary }]}>{putAway.label}</Text>
            <Pressable onPress={putAway.onUndo} accessibilityRole="button" hitSlop={6} style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
              <Text style={[styles.undo, { color: colors.textPrimary }]}>{t('common.undo')}</Text>
            </Pressable>
          </View>
        ) : putOff ? (
          <View style={[styles.aside, { flexDirection: dir.row }]}>
            <Pressable
              onPress={putOff.onPress}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityState={{ disabled: submitting }}
              hitSlop={6}
              style={({ pressed }) => [styles.link, pressed && styles.pressed]}
            >
              <Text style={[styles.linkText, dir.text, { color: colors.textSecondary }]}>{putOff.label}</Text>
            </Pressable>
          </View>
        ) : null}
        <ClayButton label={t('lesson.check')} tone="primary" size="large" busy={submitting} disabled={!canCheck} onPress={onCheck} />
      </View>
    );
  }

  const good = feedback.accepted;
  const showRun = good && inARow >= RUN_SHOWN_FROM;
  const verdict = t(feedbackTitle(feedback));
  const headline = milestone !== null ? t('lesson.run.milestone', { count: milestone }) : (praise ?? verdict);
  // one sentence for a screen reader: the verdict in the reader's words, then the praise or the run
  const spoken = milestone !== null ? `${verdict}. ${headline}` : praise ? `${verdict}. ${praise}` : verdict;
  const translateY = reduce ? 0 : slide.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });
  const typed = TYPED.has(feedback.exerciseType) && feedback.given !== undefined && !!feedback.correction;
  const diff = typed ? letterDiff(feedback.given!, feedback.correction!) : null;
  const voice = staged ? null : knownVoice(feedback.modelAudioVoice);

  const verdictBlock = (
    <View style={styles.verdict}>
      <View style={[styles.titleRow, { flexDirection: dir.row }]}>
        {good ? <DrawnCheck size={24} color={colors.success} delayMs={120} /> : <Icon name="close" size={24} color={colors.danger} />}
        <Text
          accessibilityLiveRegion="polite"
          accessibilityLabel={spoken}
          style={[styles.bannerTitle, praise && milestone === null ? kurdish : dir.text, { color: good ? colors.success : colors.danger }]}
        >
          {headline}
        </Text>
        {/* a run of right answers, named from the third: the chime has been climbing, and this says why */}
        {showRun ? <RunPill count={inARow} pop={milestone !== null} end={dir.rtl} /> : null}
      </View>
      {praise && milestone === null ? (
        <Text style={[styles.gloss, dir.text, { color: colors.textSecondary }]} importantForAccessibility="no" accessibilityElementsHidden>
          {t('lesson.fb.praiseGloss')}
        </Text>
      ) : null}
      {diff ? (
        <View style={styles.compare}>
          <Compared label={t('lesson.fb.yours')} segments={diff.given} kurdish={kurdish} row={dir.row} />
          <Compared label={t('lesson.fb.right')} segments={diff.expected} kurdish={kurdish} row={dir.row} />
        </View>
      ) : feedback.correction ? (
        <Text style={[styles.correction, dir.free, { color: colors.textPrimary }]}>
          {t('lesson.answer')} <Text style={styles.correctionValue}>{feedback.correction}</Text>
        </Text>
      ) : null}
      {hint ? <Text style={[styles.note, dir.text, { color: colors.textPrimary }]}>{hint}</Text> : null}
      {feedback.comesBack ? <Text style={[styles.note, dir.text, { color: colors.textPrimary }]}>{t('lesson.comesBack')}</Text> : null}
    </View>
  );

  return (
    <Animated.View
      style={[
        styles.banner,
        { paddingBottom: bottom, backgroundColor: good ? colors.successFill : colors.dangerFill },
        { opacity: slide, transform: [{ translateY }] },
      ]}
      testID="lesson-verdict"
    >
      {standIn && !voice ? (
        <View style={[styles.withFace, { flexDirection: dir.row }]}>
          {/* he reacts beside the verdict, which says it in words: nothing for a screen reader to hear twice */}
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="lesson-stand-in">
            <SpeakingCharacter speaker="hevalo" player={null} playing={false} crop="half" height={STAND_IN} flip={dir.rtl} reaction={standIn} />
          </View>
          {verdictBlock}
        </View>
      ) : (
        verdictBlock
      )}
      {model.supported ? (
        <HearIt
          voice={voice}
          model={model}
          source={feedback.modelAudioUrl}
          text={feedback.correction}
          tone={good ? 'success' : 'danger'}
          row={dir.row}
          rtl={dir.rtl}
        />
      ) : null}
      {onWhy && !good ? (
        <Pressable
          onPress={onWhy}
          accessibilityRole="button"
          hitSlop={4}
          style={({ pressed }) => [styles.why, { flexDirection: dir.row, alignSelf: dir.rtl ? 'flex-end' : 'flex-start' }, pressed && styles.pressed]}
        >
          <Icon name="lightbulb" size={18} color={colors.goldText} />
          <Text style={[styles.whyText, { color: colors.textPrimary }]}>{t('lesson.fb.why')}</Text>
        </Pressable>
      ) : null}
      <ClayButton label={t('common.continue')} tone={good ? 'success' : 'danger'} size="large" onPress={onContinue} />
    </Animated.View>
  );
}

/**
 * "3 in a row", at the end of the verdict's line; at a milestone it pops in
 * (0.6 → 1, a beat after the sheet). `end` is a mirrored line's: its end is on
 * the left.
 */
function RunPill({ count, pop, end }: { count: number; pop: boolean; end: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const scale = useRef(new Animated.Value(pop && !reduce ? 0.6 : 1)).current;
  useEffect(() => {
    if (!pop || reduce) return;
    const run = springTo(scale, 1, 'bouncy', VERDICT_TIMING.runAtMs);
    run.start();
    return () => run.stop();
  }, [pop, reduce, scale]);
  return (
    <Animated.View style={[styles.run, end ? styles.runLeft : styles.runRight, { backgroundColor: colors.background, transform: [{ scale }] }]} testID="lesson-in-a-row">
      <Icon name="flame" size={14} color={colors.goldText} />
      <Text style={[styles.runText, { color: colors.goldText }]}>{t('lesson.inARow', { count })}</Text>
    </Animated.View>
  );
}

/** A typed answer, or the right one, with the letters that differ marked: underlined, in gold, never colour alone. */
function Compared({ label, segments, kurdish, row }: { label: string; segments: DiffSegment[]; kurdish: TextStyle; row: ViewStyle['flexDirection'] }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.compareRow, { flexDirection: row }]}>
      <Text style={[styles.compareLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.compareValue, kurdish, { color: colors.textPrimary }]}>
        {segments.map((s, i) =>
          s.differs ? (
            <Text key={i} style={[styles.marked, { color: colors.goldText }]}>
              {s.text}
            </Text>
          ) : (
            s.text
          ),
        )}
      </Text>
    </View>
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
  footer: { padding: spacing.lg, gap: spacing.sm },
  aside: { alignItems: 'center', gap: spacing.md, minHeight: MIN_TOUCH_TARGET },
  asideText: { flexShrink: 1, fontSize: typography.sizes.sm },
  link: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
  linkText: { fontSize: typography.sizes.sm, textDecorationLine: 'underline' },
  undo: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, textDecorationLine: 'underline' },
  pressed: { opacity: 0.6 },
  banner: {
    padding: spacing.lg,
    gap: spacing.sm,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
  },
  withFace: { alignItems: 'flex-end', gap: spacing.md },
  verdict: { flex: 1, gap: spacing.sm },
  titleRow: { alignItems: 'center', gap: spacing.sm },
  bannerTitle: { flexShrink: 1, fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  gloss: { fontSize: typography.sizes.xs, marginTop: -spacing.xs },
  // at the end of the title's line, a small pill on the banner's tint
  run: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  runRight: { marginLeft: 'auto' },
  runLeft: { marginRight: 'auto' },
  runText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  correction: { fontSize: typography.sizes.md },
  correctionValue: { fontWeight: typography.weights.bold },
  compare: { gap: 2 },
  compareRow: { alignItems: 'baseline', gap: spacing.sm, flexWrap: 'wrap' },
  compareLabel: { fontSize: typography.sizes.sm, minWidth: 96 },
  compareValue: { flexShrink: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  marked: { textDecorationLine: 'underline', fontWeight: typography.weights.bold },
  note: { fontSize: typography.sizes.sm },
  why: { alignItems: 'center', gap: spacing.xs + 2, minHeight: MIN_TOUCH_TARGET },
  whyText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  hearRow: { alignItems: 'flex-end', gap: spacing.md },
  grow: { flex: 1 },
});
