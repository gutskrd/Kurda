import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { radii, spacing, typography } from '../../theme/tokens';
import { display } from '../../theme/fonts';
import { Icon } from '../../theme/Icon';
import { useTheme } from '../../theme/ThemeProvider';
import { ClayButton } from '../../theme/glass';
import { useI18n } from '../../i18n/I18nContext';
import { formatNumber } from '../../i18n/format';
import { StreakBadge } from '../../streak/StreakBadge';
import { useCelebrationHold } from '../../badges/BadgeCelebrationHost';
import { ConfettiBurst, GlowRing, SoftGlow, useCelebration } from '../../theme/CelebrationParts';
import { BURST } from '../../theme/celebration';
import { useCountUp } from '../../theme/animate';
import { AnswerMotion } from '../../theme/MotionParts';
import { NO_MOMENTS, type LessonMoments } from '../moments';
import { useDirection } from '../../reports/direction';
import { ReminderOffer } from '../../push/ReminderOffer';
import type { Exercise, SessionResults } from '../types';

interface Props {
  results: SessionResults;
  exercises: Exercise[];
  /** exercises put off ("can't listen now") and never answered this time */
  skipped?: number;
  /** what else the lesson did: today's goal, the streak, a new level */
  moments?: LessonMoments;
  /** a lesson (not practice) may end with the one offer of reminders the app makes (push/ReminderOffer.tsx) */
  offerReminders?: boolean;
  onDone: () => void;
}

/** How big the stage the trophy arrives on is. */
const STAGE = 200;

/**
 * End-of-lesson summary: XP, accuracy, streak, and every mistake with the
 * question and its right answer — a list of misses without their answers
 * told the learner what they got wrong and not what was right.
 *
 * It opens as the app's one celebration (theme/celebration.ts): the trophy
 * springs in, a ring widens once, a light handful of gold flecks, one buzz —
 * however many things this lesson did at once (finished, today's goal, the
 * streak, a new level), it is one moment, felt once — then the numbers fade in
 * and the XP counts up. A tap on the trophy skips to the end, and while it
 * plays a badge the lesson earned waits its turn.
 *
 * An exercise put off is neither a mistake nor a right answer: the server
 * leaves it out of the score, so "3/3" with one put off is a perfect score of
 * the three answered. The note says how many were put off, as the web's does.
 */
export function LessonResults({ results, exercises, skipped = 0, moments = NO_MOMENTS, offerReminders = false, onDone }: Props) {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  // in Soranî and Arabic the numbers and the lines under them read from the right
  const dir = useDirection();
  const moment = useCelebration();
  useCelebrationHold(moment.playing);
  const pct = Math.round(results.accuracy * 100);
  const mistakes = results.mistakes ?? [];
  const promptFor = (id: string, prompt?: string) => prompt ?? exercises.find((e) => e.id === id)?.prompt ?? '';
  const xp = useCountUp(results.xpAwarded, { delayMs: moment.plan.detailsDelayMs });

  const scale = moment.plan.travel ? moment.art.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) : 1;
  const opacity = moment.art.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' });
  const lift = moment.plan.travel ? moment.details.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) : 0;
  // the sun's golds (the website's tone-zer), and a little of the green a right answer wears
  const flecks = [colors.gold, '#FFE16A', '#FFBD1F', colors.success];

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Pressable
        onPress={moment.playing ? moment.skip : undefined}
        disabled={!moment.playing}
        accessible={moment.playing}
        accessibilityRole={moment.playing ? 'button' : undefined}
        accessibilityLabel={moment.playing ? t('common.skip') : undefined}
        style={styles.stage}
      >
        <SoftGlow colour={colors.gold} size={STAGE} id="lesson-glow" />
        {moment.plan.travel ? <GlowRing progress={moment.ring} colour={colors.gold} size={STAGE * 0.55} /> : null}
        {moment.plan.travel ? <ConfettiBurst progress={moment.burst} count={BURST.lesson} seed={results.correct * 31 + results.total} colours={flecks} reach={110} /> : null}
        <Animated.View style={{ opacity, transform: [{ scale }] }}>
          <Icon name="trophy" size={72} color={colors.gold} />
        </Animated.View>
      </Pressable>

      <Animated.View style={[styles.details, { opacity: moment.details, transform: [{ translateY: lift }] }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header">
          {t('lesson.complete')}
        </Text>

        <View style={[styles.stats, { flexDirection: dir.row }]}>
          <Stat label="XP" value={`+${formatNumber(xp, locale)}`} tone="accent" a11yValue={`+${results.xpAwarded}`} />
          <Stat label={t('lesson.accuracy')} value={`${pct}%`} tone="primary" />
          <Stat label={t('lesson.correct')} value={`${results.correct}/${results.total}`} tone="primary" />
        </View>

        {/* a streak kept today gives a little hop once the moment has settled */}
        <AnswerMotion verdict={moments.streakKept && !moment.playing ? 'right' : null}>
          <StreakBadge streak={results.streak} />
        </AnswerMotion>

        {moments.goalMet || moments.level !== null ? (
          <View style={styles.moments} accessibilityLiveRegion="polite">
            {moments.goalMet ? (
              <View style={[styles.moment, { flexDirection: dir.row, backgroundColor: colors.successFill }]}>
                <Icon name="seal-check" size={18} color={colors.success} />
                <Text style={[styles.momentText, dir.text, { color: colors.textPrimary }]}>{t('learn.today.goalMet')}</Text>
              </View>
            ) : null}
            {moments.level !== null ? (
              <View style={[styles.moment, { flexDirection: dir.row, backgroundColor: colors.controlTrack }]}>
                <Icon name="star-fill" size={18} color={colors.gold} />
                <Text style={[styles.momentText, dir.text, { color: colors.textPrimary }]}>{t('lesson.levelUp', { level: formatNumber(moments.level, locale) })}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* after the moment, never during it */}
        {offerReminders ? <ReminderOffer ready={!moment.playing} /> : null}

        {skipped > 0 ? (
          <Text style={[styles.note, { color: colors.textSecondary }]}>{t('lesson.skipped', { count: skipped })}</Text>
        ) : null}

        {mistakes.length > 0 ? (
          <View style={[styles.mistakes, { backgroundColor: colors.controlTrack }]}>
            <Text style={[styles.mistakesTitle, dir.text, { color: colors.textPrimary }]}>{t('lesson.review')}</Text>
            {mistakes.map((m) => (
              <View key={m.exerciseId} style={styles.mistakeRow}>
                {promptFor(m.exerciseId, m.prompt) ? (
                  <Text style={[styles.mistakePrompt, dir.free, { color: colors.textSecondary }]}>{promptFor(m.exerciseId, m.prompt)}</Text>
                ) : null}
                {m.correction ? (
                  <Text style={[styles.mistakeAnswer, dir.text, { color: colors.textPrimary }]}>
                    {t('lesson.answer')} <Text style={styles.mistakeAnswerValue}>{m.correction}</Text>
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        <ClayButton label={t('common.done')} tone="primary" size="large" onPress={onDone} style={styles.done} />
      </Animated.View>
    </ScrollView>
  );
}

function Stat({ label, value, tone, a11yValue }: { label: string; value: string; tone: 'accent' | 'primary'; a11yValue?: string }) {
  const { colors } = useTheme();
  return (
    // read as the final number, not the one it is counting through
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${a11yValue ?? value}`}>
      <Text style={[styles.statValue, { color: tone === 'accent' ? colors.accent : colors.primary }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  stage: { width: STAGE, height: STAGE, alignItems: 'center', justifyContent: 'center' },
  details: { alignSelf: 'stretch', alignItems: 'center', gap: spacing.lg },
  title: { ...display(typography.sizes.xxl), textAlign: 'center' },
  note: { fontSize: typography.sizes.sm, textAlign: 'center' },
  stats: { flexDirection: 'row', gap: spacing.lg },
  stat: { alignItems: 'center', minWidth: 72 },
  statValue: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: typography.sizes.sm },
  moments: { alignSelf: 'stretch', gap: spacing.sm },
  moment: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  momentText: { flex: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  mistakes: {
    alignSelf: 'stretch',
    gap: spacing.md,
    borderRadius: radii.md,
    padding: spacing.lg,
  },
  mistakesTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  mistakeRow: { gap: spacing.xs },
  mistakePrompt: { fontSize: typography.sizes.sm },
  mistakeAnswer: { fontSize: typography.sizes.md },
  mistakeAnswerValue: { fontWeight: typography.weights.bold },
  done: { alignSelf: 'stretch' },
});
