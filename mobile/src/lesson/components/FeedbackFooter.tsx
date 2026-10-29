import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';
import { isSoraniDialect, letterDiff, type DiffSegment, type ExerciseType, type RecordingVoice } from '@kurda/shared';
import { radii, spacing, typography } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { ClayButton } from '../../theme/glass';
import { TileButton } from '../../theme/Tile';
import { display } from '../../theme/fonts';
import { useI18n } from '../../i18n/I18nContext';
import { VERDICT_TIMING, feedbackTitle, type Feedback } from '../player';
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
  /** the exercise sends its answer by itself as it is completed (pairs answered as they are made): no Check */
  answersItself?: boolean;
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
 * sheet, sliding up on a spring in the verdict's tint with Continue exactly
 * where Check was — so the thumb never moves and the rhythm is tap, tap. An
 * exercise that answers itself (pairs answered as they are made) has no Check.
 *
 * The sheet says the verdict in words and a mark — a round badge with a check
 * that pops in and draws itself for a right answer, or a quiet cross — never
 * colour alone, and a screen reader hears it as one sentence. A typed answer
 * is set above the right one with the letters that differ marked, and what
 * kind of slip it was in a line under them; a miss says it will come back, and
 * offers the skill's tips. The native recording is there to hear, and says
 * itself a moment after the verdict unless that is turned off (Settings →
 * Sounds).
 *
 * Hevalo comes in to react only where nobody else is on screen to: on the
 * first answer, on a miss (curious, never sad) and at a run's milestone.
 * Under Reduce Motion the sheet fades in where it is, and the badge does not
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
  answersItself = false,
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
  const [height, setHeight] = useState(0);
  const model = useAudio(feedback?.modelAudioUrl);
  const bottom = useScreenBottomInset(spacing.lg);
  const dir = useDirection();
  const kurdish: TextStyle = isSoraniDialect(dialect) ? { writingDirection: 'rtl' } : { writingDirection: 'ltr' };

  // up from below the screen on a spring as the verdict arrives; a fade where it is under Reduce Motion
  useEffect(() => {
    slide.stopAnimation();
    slide.setValue(0);
    if (!feedback) return;
    const run = reduce ? timing(slide, 1, duration.base) : springTo(slide, 1, 'release');
    run.start();
    return () => run.stop();
  }, [feedback, slide, reduce]);

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
          <View style={[styles.aside, styles.centred]}>
            <Pressable
              onPress={putOff.onPress}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityState={{ disabled: submitting }}
              hitSlop={6}
              style={({ pressed }) => [styles.link, pressed && styles.pressed]}
            >
              <Text style={[styles.linkText, { color: colors.textSecondary }]}>{putOff.label}</Text>
            </Pressable>
          </View>
        ) : null}
        {answersItself ? null : <TileButton label={t('lesson.check')} busy={submitting} disabled={!canCheck} onPress={onCheck} />}
      </View>
    );
  }

  const good = feedback.accepted;
  const tint = good ? colors.success : colors.danger;
  const verdict = t(feedbackTitle(feedback));
  const headline = praise ?? verdict;
  // one sentence for a screen reader: the verdict in the reader's words, then the praise
  const spoken = praise ? `${verdict}. ${praise}` : verdict;
  // from just below the screen: its own height once measured, and further than any sheet is tall until then
  const translateY = reduce ? 0 : slide.interpolate({ inputRange: [0, 1], outputRange: [height || 600, 0] });
  const typed = TYPED.has(feedback.exerciseType) && feedback.given !== undefined && !!feedback.correction;
  const diff = typed ? letterDiff(feedback.given!, feedback.correction!) : null;
  const voice = staged ? null : knownVoice(feedback.modelAudioVoice);

  const verdictBlock = (
    <View style={styles.verdict}>
      <View style={[styles.titleRow, { flexDirection: dir.row }]}>
        <Badge good={good} colour={tint} />
        <View style={styles.titles}>
          <Text accessibilityLiveRegion="polite" accessibilityLabel={spoken} style={[styles.bannerTitle, praise ? kurdish : dir.text, { color: tint }]}>
            {headline}
          </Text>
          {praise ? (
            <Text style={[styles.gloss, dir.text, { color: colors.textSecondary }]} importantForAccessibility="no" accessibilityElementsHidden>
              {t('lesson.fb.praiseGloss')}
            </Text>
          ) : null}
        </View>
      </View>
      {diff ? (
        <View style={styles.compare}>
          <Compared label={t('lesson.fb.yours')} segments={diff.given} kurdish={kurdish} row={dir.row} />
          <Compared label={t('lesson.fb.right')} segments={diff.expected} kurdish={kurdish} row={dir.row} />
        </View>
      ) : feedback.correction ? (
        <View style={styles.answer}>
          <Text style={[styles.answerLabel, dir.text, { color: tint }]}>{t('lesson.answer')}</Text>
          <Text style={[styles.answerValue, dir.free, { color: colors.textPrimary }]}>{feedback.correction}</Text>
        </View>
      ) : null}
      {hint ? <Text style={[styles.note, dir.text, { color: colors.textPrimary }]}>{hint}</Text> : null}
      {feedback.comesBack ? <Text style={[styles.note, dir.text, { color: colors.textPrimary }]}>{t('lesson.comesBack')}</Text> : null}
    </View>
  );

  return (
    <Animated.View
      onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
      style={[
        styles.banner,
        { paddingBottom: bottom, backgroundColor: good ? colors.successFill : colors.dangerFill },
        { opacity: reduce ? slide : 1, transform: [{ translateY }] },
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
      <TileButton label={t('common.continue')} tone={good ? 'success' : 'danger'} onPress={onContinue} />
    </Animated.View>
  );
}

/** The badge beside the verdict: a check that pops in and draws itself, or a cross that simply fades in. */
function Badge({ good, colour }: { good: boolean; colour: string }): React.JSX.Element {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const p = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) {
      p.setValue(1);
      return;
    }
    const run = good ? springTo(p, 1, 'bouncy', VERDICT_TIMING.actAtMs) : timing(p, 1, duration.base, { delay: VERDICT_TIMING.actAtMs });
    run.start();
    return () => run.stop();
  }, [good, reduce, p]);
  const scale = good && !reduce ? p.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) : 1;
  const opacity = p.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' });
  return (
    <Animated.View
      style={[styles.badge, { backgroundColor: colour, opacity, transform: [{ scale }] }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {good ? <DrawnCheck size={18} color={colors.textOnPrimary} delayMs={VERDICT_TIMING.actAtMs + 80} /> : <Icon name="close" size={18} color={colors.textOnPrimary} />}
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
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
  aside: { alignItems: 'center', gap: spacing.md, minHeight: MIN_TOUCH_TARGET },
  centred: { justifyContent: 'center' },
  asideText: { flexShrink: 1, fontSize: typography.sizes.sm },
  link: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
  linkText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, letterSpacing: 0.3 },
  undo: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, textDecorationLine: 'underline' },
  pressed: { opacity: 0.6 },
  banner: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.md,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
  },
  withFace: { alignItems: 'flex-end', gap: spacing.md },
  verdict: { flex: 1, gap: spacing.sm },
  titleRow: { alignItems: 'center', gap: spacing.sm + 4 },
  badge: { width: 32, height: 32, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  titles: { flexShrink: 1 },
  bannerTitle: { ...display(typography.sizes.xl) },
  gloss: { fontSize: typography.sizes.xs },
  answer: { gap: 2 },
  answerLabel: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  answerValue: { fontSize: typography.sizes.md },
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
