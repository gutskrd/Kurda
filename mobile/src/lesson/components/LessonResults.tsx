import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RESULTS_TIMING, resultsActions, resultsGrade, type ResultsAction } from '@kurda/shared';
import { radii, spacing, typography } from '../../theme/tokens';
import { display } from '../../theme/fonts';
import { Icon } from '../../theme/Icon';
import { useTheme } from '../../theme/ThemeProvider';
import { ClayButton } from '../../theme/glass';
import { useI18n } from '../../i18n/I18nContext';
import { formatNumber } from '../../i18n/format';
import { useCelebrationHold } from '../../badges/BadgeCelebrationHost';
import { ConfettiBurst, GlowRing, SoftGlow, useCelebration } from '../../theme/CelebrationParts';
import { BURST } from '../../theme/celebration';
import { timing, useCountUp } from '../../theme/animate';
import { duration } from '../../theme/motion';
import { AnswerMotion } from '../../theme/MotionParts';
import { MIN_TOUCH_TARGET } from '../../a11y/a11y';
import { NO_MOMENTS, type LessonMoments } from '../moments';
import { useDirection } from '../../reports/direction';
import { ReminderOffer } from '../../push/ReminderOffer';
import { useScreenBottomInset, useScreenTopInset } from '../../navigation/tabBarLayout';
import { SpeakingCharacter } from '../../characters/SpeakingCharacter';
import { GoalRing } from '../../leagues/GoalRing';
import { knownTier, leagueName } from '../../leagues/format';
import type { TranslationKey } from '../../i18n/translations';
import type { Exercise, SessionResults } from '../types';
import { StreakDay } from './StreakDay';

interface Props {
  results: SessionResults;
  exercises: Exercise[];
  /** exercises put off ("can't listen now") and never answered this time */
  skipped?: number;
  /** what else the lesson did: today's goal, the streak, a new level, the league */
  moments?: LessonMoments;
  /** a lesson (not practice) may end with the one offer of reminders the app makes (push/ReminderOffer.tsx) */
  offerReminders?: boolean;
  /** the course's next lesson, when there is one to offer */
  next?: { lessonId: string; title: string } | null;
  /** today's goal is met: the results say this is a good place to stop, and "Done" leads */
  goalDone?: boolean;
  /** the mistakes practice can take ("Practise these now"); empty for none */
  practise?: string[];
  onDone: () => void;
  onNext?: (lessonId: string) => void;
  onPractise?: (exerciseIds: string[]) => void;
  /** to the lesson path, wherever the lesson was opened from */
  onPath?: () => void;
}

/** How big the stage Hevalo arrives on is, and how tall he is drawn on it. */
const STAGE = 200;
const HEVALO = 168;

/** A list of mistakes this long or shorter is open; a longer one starts folded, so the results still fit one screen. */
const MISTAKES_OPEN = 3;

const ACTION_WORDS: Record<ResultsAction, TranslationKey> = {
  next: 'lesson.results.next',
  practise: 'lesson.results.practise',
  done: 'common.done',
};

/**
 * End of a lesson: what changed, and what comes next, on one screen.
 *
 * It opens as the app's one celebration (theme/celebration.ts): Hevalo
 * springs in and cheers as the buzz lands, a ring widens once, a light handful
 * of gold flecks — however many things this lesson did at once, it is one
 * moment, felt once. Then three tiles side by side, one after another: the XP
 * counting up, how many were right first time with a kind word for it (never a
 * negative one), and the days in a row, which hop when today kept them. Under
 * them today's goal moves from where it stood to where it is, and the week's
 * league place and a new level arrive. A tap on Hevalo skips to the end, and
 * while it plays a badge the lesson earned waits its turn.
 *
 * The ways on sit at the foot, where Check was: the next lesson while today's
 * goal is still to meet, or "Done" once it is met — with a line saying it is a
 * good place to stop — and practising the mistakes now when there are any.
 * When this lesson kept the streak, the first of them opens the "Day N" card
 * (StreakDay) on the way. Nothing moves on by itself, and nothing here ever
 * asks for money.
 *
 * Every mistake is listed with the question and its right answer, folded away
 * when there are more than three. An exercise put off is neither a mistake
 * nor a right answer: the server leaves it out of the score, and the note
 * says how many were put off, as the web's does.
 */
export function LessonResults({
  results,
  exercises,
  skipped = 0,
  moments = NO_MOMENTS,
  offerReminders = false,
  next = null,
  goalDone = false,
  practise = [],
  onDone,
  onNext,
  onPractise,
  onPath,
}: Props) {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  // in Soranî and Arabic the tiles and the lines under them read from the right
  const dir = useDirection();
  const top = useScreenTopInset();
  const bottom = useScreenBottomInset(spacing.lg);
  const moment = useCelebration({ sound: 'complete' });
  useCelebrationHold(moment.playing);
  const { plan } = moment;
  const pct = Math.round(results.accuracy * 100);
  const mistakes = results.mistakes ?? [];
  const promptFor = (id: string, prompt?: string) => prompt ?? exercises.find((e) => e.id === id)?.prompt ?? '';
  const xp = useCountUp(results.xpAwarded, { delayMs: plan.travel ? RESULTS_TIMING.xpAtMs : 0 });
  const [folded, setFolded] = useState(mistakes.length > MISTAKES_OPEN);

  // Hevalo cheers as the buzz lands (`hapticAtMs`), or at once when the moment is skipped
  const [cheer, setCheer] = useState(false);
  useEffect(() => {
    if (!moment.playing) {
      setCheer(true);
      return;
    }
    const id = setTimeout(() => setCheer(true), plan.hapticAtMs);
    return () => clearTimeout(id);
  }, [moment.playing, plan.hapticAtMs]);

  // the "Day N" card, opened on the way to whichever way on is chosen first
  const [day, setDay] = useState<(() => void) | null>(null);
  const dayShown = useRef(false);
  const go = (then: () => void) => () => {
    if (moments.streakKept && !dayShown.current) {
      dayShown.current = true;
      setDay(() => then);
      return;
    }
    then();
  };

  const scale = plan.travel ? moment.art.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) : 1;
  const opacity = moment.art.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' });
  const lift = plan.travel ? moment.details.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) : 0;
  // the sun's golds (the website's tone-zer), and a little of the green a right answer wears
  const flecks = [colors.gold, '#FFE16A', '#FFBD1F', colors.success];

  if (day) return <StreakDay streak={results.streak} onContinue={day} />;

  const canPractise = practise.length > 0 && !!onPractise;
  const actions = resultsActions({ next: next !== null && !!onNext, practise: canPractise, goalDone });
  const run = (action: ResultsAction): (() => void) =>
    go(() => {
      if (action === 'next' && next && onNext) onNext(next.lessonId);
      else if (action === 'practise' && onPractise) onPractise(practise);
      else onDone();
    });
  const grade = t(`lesson.results.grade.${resultsGrade(results.accuracy)}` as TranslationKey);
  const title = moments.perfect ? t('lesson.results.perfect') : t('lesson.complete');

  return (
    <View style={[styles.screen, { paddingTop: top }]}>
      <ScrollView contentContainerStyle={styles.body}>
        <Pressable
          onPress={moment.playing ? moment.skip : undefined}
          disabled={!moment.playing}
          accessible={moment.playing}
          accessibilityRole={moment.playing ? 'button' : undefined}
          accessibilityLabel={moment.playing ? t('common.skip') : undefined}
          style={styles.stage}
        >
          <SoftGlow colour={colors.gold} size={STAGE} id="lesson-glow" />
          {plan.travel ? <GlowRing progress={moment.ring} colour={colors.gold} size={STAGE * 0.55} /> : null}
          {plan.travel ? <ConfettiBurst progress={moment.burst} count={BURST.lesson} seed={results.correct * 31 + results.total} colours={flecks} reach={110} /> : null}
          <Animated.View style={{ opacity, transform: [{ scale }] }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <SpeakingCharacter speaker="hevalo" player={null} playing={false} crop="half" height={HEVALO} flip={dir.rtl} reaction={cheer ? 'cheer' : null} />
          </Animated.View>
        </Pressable>

        <Animated.View style={[styles.details, { opacity: moment.details, transform: [{ translateY: lift }] }]}>
          <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header">
            {title}
          </Text>

          <View style={[styles.tiles, { flexDirection: dir.row }]}>
            <Tile index={0} travel={plan.travel} band={colors.gold} label={t('lesson.results.xp')} a11yValue={`+${formatNumber(results.xpAwarded, locale)}`}>
              <Text style={[styles.tileValue, { color: colors.textPrimary }]}>+{formatNumber(xp, locale)}</Text>
            </Tile>
            <Tile
              index={1}
              travel={plan.travel}
              band={colors.success}
              label={t('lesson.results.accuracy')}
              a11yValue={`${pct}%, ${grade}, ${t('lesson.results.firstTries', { correct: results.correct, total: results.total })}`}
              note={grade}
            >
              <Text style={[styles.tileValue, { color: colors.textPrimary }]}>{formatNumber(pct, locale)}%</Text>
            </Tile>
            <Tile index={2} travel={plan.travel} band={colors.gold} label={t('lesson.results.streak')} a11yValue={formatNumber(results.streak.current, locale)}>
              {/* a streak kept today gives a little hop once the moment has settled */}
              <AnswerMotion verdict={moments.streakKept && !moment.playing ? 'right' : null} style={[styles.streakValue, { flexDirection: dir.row }]}>
                <Icon name="flame" size={20} color={colors.goldText} />
                <Text style={[styles.tileValue, { color: colors.textPrimary }]}>{formatNumber(results.streak.current, locale)}</Text>
              </AnswerMotion>
            </Tile>
          </View>

          <Rows moments={moments} travel={plan.travel} />

          {/* after the moment, never during it */}
          {offerReminders ? <ReminderOffer ready={!moment.playing} /> : null}

          {actions.stopHere ? <Text style={[styles.note, { color: colors.textPrimary }]}>{t('lesson.results.goalDoneStop')}</Text> : null}

          {skipped > 0 ? <Text style={[styles.note, { color: colors.textSecondary }]}>{t('lesson.skipped', { count: skipped })}</Text> : null}

          {mistakes.length > 0 ? (
            <View style={[styles.mistakes, { backgroundColor: colors.controlTrack }]}>
              <Pressable
                onPress={() => setFolded((f) => !f)}
                accessibilityRole="button"
                accessibilityState={{ expanded: !folded }}
                style={({ pressed }) => [styles.mistakesHead, { flexDirection: dir.row }, pressed && styles.pressed]}
              >
                <Text style={[styles.mistakesTitle, dir.text, { color: colors.textPrimary }]}>
                  {t('lesson.review')} · {formatNumber(mistakes.length, locale)}
                </Text>
                <View style={folded ? null : styles.turned}>
                  <Icon name="chevron-down" size={18} color={colors.textSecondary} />
                </View>
              </Pressable>
              {folded
                ? null
                : mistakes.map((m) => (
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
        </Animated.View>
      </ScrollView>

      {/* where Check was: the main way on at the foot, under the other */}
      <View style={[styles.bar, { paddingBottom: bottom }]}>
        {actions.backLink && onPath ? (
          <Pressable onPress={go(onPath)} accessibilityRole="button" hitSlop={4} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
            <Text style={[styles.backText, { color: colors.textSecondary }]}>{t('lesson.results.backToPath')}</Text>
          </Pressable>
        ) : null}
        {actions.secondary ? <ClayButton label={t(ACTION_WORDS[actions.secondary])} tone="primary" variant="outline" size="large" onPress={run(actions.secondary)} /> : null}
        <ClayButton label={t(ACTION_WORDS[actions.primary])} tone="primary" size="large" onPress={run(actions.primary)} />
      </View>
    </View>
  );
}

/**
 * One of the three tiles: a band of colour along its top, the number, and what
 * it is. They rise in one after another as the words land; under Reduce
 * Motion they are simply there.
 */
function Tile({
  index,
  travel,
  band,
  label,
  a11yValue,
  note,
  children,
}: {
  index: number;
  travel: boolean;
  band: string;
  label: string;
  /** read as the final number, not the one it is counting through */
  a11yValue: string;
  /** a kind word under the number */
  note?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const { colors } = useTheme();
  const rise = useRef(new Animated.Value(travel ? 0 : 1)).current;
  useEffect(() => {
    if (!travel) return;
    const run = timing(rise, 1, duration.slow, { delay: RESULTS_TIMING.tilesAtMs + index * RESULTS_TIMING.tileStaggerMs });
    run.start();
    return () => run.stop();
    // once, as the results open
  }, []);
  const translateY = rise.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });
  return (
    <Animated.View
      style={[styles.tile, { backgroundColor: colors.surface, opacity: rise, transform: [{ translateY }] }]}
      accessible
      accessibilityLabel={`${label}: ${a11yValue}`}
    >
      <View style={[styles.band, { backgroundColor: band }]} />
      {children}
      {note ? <Text style={[styles.tileNote, { color: colors.success }]}>{note}</Text> : null}
      <Text style={[styles.tileLabel, { color: colors.textSecondary }]} numberOfLines={2}>
        {label}
      </Text>
    </Animated.View>
  );
}

/**
 * What else the lesson moved: today's goal from where it stood to where it is
 * now (at `goalAtMs`), and the week's league place and a new level fading in
 * after it. A row whose numbers could not be read is left out, never guessed.
 */
function Rows({ moments, travel }: { moments: LessonMoments; travel: boolean }): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const goal = moments.goal ?? null;
  const tier = moments.league ? knownTier(moments.league.tier) : null;
  const league = moments.league && tier ? moments.league : null;
  const opened = useRef(Date.now());
  const [goalXp, setGoalXp] = useState<number | null>(goal ? (travel ? goal.from : goal.to) : null);
  const rows = useRef(new Animated.Value(travel ? 0 : 1)).current;

  // the goal ring moves on from where it stood, once the tiles are in (or as soon as the numbers arrive after that)
  const from = goal?.from ?? null;
  const to = goal?.to ?? null;
  useEffect(() => {
    if (from === null || to === null) return;
    if (!travel) {
      setGoalXp(to);
      return;
    }
    setGoalXp((was) => was ?? from);
    const id = setTimeout(() => setGoalXp(to), Math.max(duration.progress, RESULTS_TIMING.goalAtMs - (Date.now() - opened.current)));
    return () => clearTimeout(id);
  }, [from, to, travel]);

  // the league and the level fade in after the goal, whenever their numbers arrive
  const later = league !== null || moments.level !== null;
  useEffect(() => {
    if (!later) return;
    if (!travel) {
      rows.setValue(1);
      return;
    }
    const run = timing(rows, 1, RESULTS_TIMING.rowsMs, { delay: Math.max(0, RESULTS_TIMING.rowsAtMs - (Date.now() - opened.current)) });
    run.start();
    return () => run.stop();
  }, [later, travel, rows]);

  if (!goal && !moments.goalMet && !league && moments.level === null) return null;
  const met = goal ? goal.to >= goal.target : moments.goalMet;
  const goalWords = met
    ? t('learn.today.goalMet')
    : goal
      ? t('lesson.results.goal', { earned: formatNumber(goal.to, locale), goal: formatNumber(goal.target, locale) })
      : null;
  const leagueWords = league
    ? t('lesson.results.league', {
        xp: formatNumber(league.gainedXp, locale),
        rank: formatNumber(league.toRank, locale),
        league: t('leagues.leagueName', { tier: leagueName(t, tier!) }),
      })
    : null;

  return (
    <View style={styles.rows} accessibilityLiveRegion="polite">
      {goalWords ? (
        <View style={[styles.row, { flexDirection: dir.row, backgroundColor: met ? colors.successFill : colors.controlTrack }]} accessible accessibilityLabel={goalWords}>
          {goal && goalXp !== null ? (
            <GoalRing xp={goalXp} goal={goal.target} size={36} tint={[colors.gold, colors.goldText]} showNumbers={false} />
          ) : (
            <Icon name="seal-check" size={18} color={colors.success} />
          )}
          <Text style={[styles.rowText, dir.text, { color: colors.textPrimary }]}>{goalWords}</Text>
        </View>
      ) : null}
      {league ? (
        <Animated.View style={[styles.row, { flexDirection: dir.row, backgroundColor: colors.controlTrack, opacity: rows }]} accessible accessibilityLabel={leagueWords!}>
          <Icon name="trophy" size={18} color={colors.goldText} />
          <Text style={[styles.rowText, dir.text, { color: colors.textPrimary }]}>{leagueWords}</Text>
          {league.toRank < league.fromRank ? (
            <Text style={[styles.rowUp, { color: colors.success }]}>{t('lesson.results.leagueUp', { rank: formatNumber(league.toRank, locale) })}</Text>
          ) : null}
        </Animated.View>
      ) : null}
      {moments.level !== null ? (
        <Animated.View style={[styles.row, { flexDirection: dir.row, backgroundColor: colors.controlTrack, opacity: rows }]}>
          <Icon name="star-fill" size={18} color={colors.gold} />
          <Text style={[styles.rowText, dir.text, { color: colors.textPrimary }]}>{t('lesson.levelUp', { level: formatNumber(moments.level, locale) })}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  stage: { width: STAGE, height: STAGE, alignItems: 'center', justifyContent: 'center' },
  details: { alignSelf: 'stretch', alignItems: 'center', gap: spacing.md },
  title: { ...display(typography.sizes.xxl), textAlign: 'center' },
  note: { fontSize: typography.sizes.sm, textAlign: 'center' },
  tiles: { alignSelf: 'stretch', gap: spacing.sm },
  tile: { flex: 1, minWidth: 0, alignItems: 'center', gap: 2, borderRadius: radii.md, paddingTop: spacing.md, paddingBottom: spacing.sm + 4, paddingHorizontal: spacing.sm, overflow: 'hidden' },
  band: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  tileValue: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  tileNote: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold },
  tileLabel: { fontSize: typography.sizes.xs, textAlign: 'center' },
  streakValue: { alignItems: 'center', gap: 4 },
  rows: { alignSelf: 'stretch', gap: spacing.sm },
  row: { alignItems: 'center', gap: spacing.sm, borderRadius: radii.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, minHeight: 48 },
  rowText: { flex: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  rowUp: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  mistakes: { alignSelf: 'stretch', gap: spacing.md, borderRadius: radii.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  mistakesHead: { alignItems: 'center', justifyContent: 'space-between', minHeight: MIN_TOUCH_TARGET },
  turned: { transform: [{ rotate: '180deg' }] },
  mistakesTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  mistakeRow: { gap: spacing.xs },
  mistakePrompt: { fontSize: typography.sizes.sm },
  mistakeAnswer: { fontSize: typography.sizes.md },
  mistakeAnswerValue: { fontWeight: typography.weights.bold },
  pressed: { opacity: 0.6 },
  bar: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
  back: { alignSelf: 'center', minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: spacing.md },
  backText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, textDecorationLine: 'underline' },
});
