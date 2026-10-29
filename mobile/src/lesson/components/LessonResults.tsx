import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  RESULTS_TIMING,
  afterResults,
  isSoraniDialect,
  resultsActions,
  resultsGrade,
  sittingClock,
  sittingPace,
  type AfterResults,
  type ResultsAction,
} from '@kurda/shared';
import { radii, spacing, typography } from '../../theme/tokens';
import { display } from '../../theme/fonts';
import { Icon, type IconName } from '../../theme/Icon';
import { useTheme } from '../../theme/ThemeProvider';
import { ClayButton } from '../../theme/glass';
import { useI18n } from '../../i18n/I18nContext';
import { formatNumber } from '../../i18n/format';
import { useCelebrationHold } from '../../badges/BadgeCelebrationHost';
import { ConfettiBurst, GlowRing, SoftGlow, useCelebration } from '../../theme/CelebrationParts';
import { BURST } from '../../theme/celebration';
import { timing, useCountUp } from '../../theme/animate';
import { duration } from '../../theme/motion';
import { MIN_TOUCH_TARGET } from '../../a11y/a11y';
import { GOLD_INK, TONES, type ToneColors } from '../../coursemap/path';
import { NO_MOMENTS, type LessonMoments } from '../moments';
import { useDirection } from '../../reports/direction';
import { ReminderOffer } from '../../push/ReminderOffer';
import { useScreenBottomInset, useScreenTopInset } from '../../navigation/tabBarLayout';
import { SpeakingCharacter } from '../../characters/SpeakingCharacter';
import { GoalRing } from '../../leagues/GoalRing';
import { knownTier, leagueName } from '../../leagues/format';
import { QuestsScreen } from '../../quests/QuestsScreen';
import type { Locale, TranslationKey } from '../../i18n/translations';
import type { Exercise, SessionResults } from '../types';
import { StreakMoment } from './StreakMoment';

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
  /** the course's variety of Kurdish, for the line under the title; absent on a practice session */
  dialect?: string | null;
  /** this sitting: how long it took from the first exercise shown to the last answer, and how many answers it took; null when not measured */
  sitting?: { ms: number; answers: number } | null;
  onDone: () => void;
  onNext?: (lessonId: string) => void;
  onPractise?: (exerciseIds: string[]) => void;
  /** to the lesson path, wherever the lesson was opened from */
  onPath?: () => void;
}

/** How big the stage Hevalo arrives on is, and how tall he stands on it, head to hooves. */
const STAGE = { width: 280, height: 232 };
const HEVALO = 208;

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
 * It opens as the app's one celebration (theme/celebration.ts): Hevalo,
 * standing whole on a stage of light, springs in and cheers as the buzz
 * lands, a ring widens once, a light handful of gold flecks — however many
 * things this lesson did at once, it is one moment, felt once. The title says
 * how it went (a perfect lesson, great work, or a lesson done), with a warm
 * line about the course's Kurdish under it. Then three framed cards side by
 * side, one after another, each a band of colour naming what it counts over
 * an icon and the number counting up: the XP in gold, how many were right
 * first time in green under a kind word for it (never a negative one), and
 * how long this sitting took in blue — "Quick" when it was. Under them
 * today's goal moves from where it stood to where it is, and the week's
 * league place and a new level arrive. A tap on Hevalo skips to the end, and
 * while it plays a badge the lesson earned waits its turn.
 *
 * The ways on sit at the foot, where Check was: the next lesson while today's
 * goal is still to meet, or "Done" once it is met — with a line saying it is a
 * good place to stop — and practising the mistakes now when there are any.
 * On the way to the first of them come the moments that follow the results
 * (shared `afterResults`), each once: the streak's when this lesson kept it
 * (StreakMoment), then today's quests when it moved any (QuestsScreen).
 * Nothing moves on by itself, and nothing here ever asks for money.
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
  dialect = null,
  sitting = null,
  onDone,
  onNext,
  onPractise,
  onPath,
}: Props) {
  const { colors, scheme } = useTheme();
  const { t, locale } = useI18n();
  // in Soranî and Arabic the cards and the lines under them read from the right
  const dir = useDirection();
  const top = useScreenTopInset();
  const bottom = useScreenBottomInset(spacing.lg);
  const moment = useCelebration({ sound: 'complete' });
  useCelebrationHold(moment.playing);
  const { plan } = moment;
  const pct = Math.round(results.accuracy * 100);
  const mistakes = results.mistakes ?? [];
  const promptFor = (id: string, prompt?: string) => prompt ?? exercises.find((e) => e.id === id)?.prompt ?? '';
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

  // the moments after the results, opened on the way to whichever way on is chosen first
  const [after, setAfter] = useState<{ steps: AfterResults[]; then: () => void } | null>(null);
  const afterShown = useRef(false);
  const go = (then: () => void) => () => {
    const steps = afterShown.current ? [] : afterResults({ streakKept: moments.streakKept, questsMoved: (results.quests ?? []).length > 0 });
    afterShown.current = true;
    if (steps.length > 0) setAfter({ steps, then });
    else then();
  };
  const onward = () => {
    if (!after) return;
    if (after.steps.length > 1) setAfter({ ...after, steps: after.steps.slice(1) });
    else after.then();
  };

  const scale = plan.travel ? moment.art.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) : 1;
  const opacity = moment.art.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' });
  const lift = plan.travel ? moment.details.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) : 0;
  // the sun's golds (the website's tone-zer), and a little of the green a right answer wears
  const flecks = [colors.gold, '#FFE16A', '#FFBD1F', colors.success];

  if (after?.steps[0] === 'streak') return <StreakMoment streak={results.streak} goalDone={goalDone} onContinue={onward} />;
  if (after?.steps[0] === 'quests') return <QuestsScreen place="lesson" steps={results.quests} onDone={onward} />;

  const canPractise = practise.length > 0 && !!onPractise;
  const actions = resultsActions({ next: next !== null && !!onNext, practise: canPractise, goalDone });
  const run = (action: ResultsAction): (() => void) =>
    go(() => {
      if (action === 'next' && next && onNext) onNext(next.lessonId);
      else if (action === 'practise' && onPractise) onPractise(practise);
      else onDone();
    });
  const grade = resultsGrade(results.accuracy);
  const gradeWord = t(`lesson.results.grade.${grade}` as TranslationKey);
  const title = moments.perfect ? t('lesson.results.perfect') : grade === 'practice' ? t('lesson.complete') : t('lesson.results.great');
  const stronger: TranslationKey = !dialect
    ? 'lesson.results.stronger'
    : isSoraniDialect(dialect)
      ? 'lesson.results.strongerSorani'
      : 'lesson.results.strongerKurmanci';
  const tones = TONES[scheme];
  const gold: ToneColors = { fill: colors.gold, lip: colors.gold, ink: GOLD_INK, text: colors.goldText };
  const clock = sitting ? sittingClock(sitting.ms) : null;

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
          <SoftGlow colour={colors.gold} size={STAGE.height} id="lesson-glow" />
          {plan.travel ? <GlowRing progress={moment.ring} colour={colors.gold} size={STAGE.height * 0.6} /> : null}
          {plan.travel ? <ConfettiBurst progress={moment.burst} count={BURST.lesson} seed={results.correct * 31 + results.total} colours={flecks} reach={130} /> : null}
          <Animated.View style={{ opacity, transform: [{ scale }] }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <SpeakingCharacter speaker="hevalo" player={null} playing={false} crop="full" height={HEVALO} flip={dir.rtl} reaction={cheer ? 'cheer' : null} />
          </Animated.View>
        </Pressable>

        <Animated.View style={[styles.details, { opacity: moment.details, transform: [{ translateY: lift }] }]}>
          <View style={styles.heading}>
            <Text style={[styles.title, { color: colors.goldText }]} accessibilityRole="header">
              {title}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t(stronger)}</Text>
          </View>

          <View style={[styles.cards, { flexDirection: dir.row }]}>
            <StatCard
              index={0}
              travel={plan.travel}
              tone={gold}
              icon="bolt"
              label={t('lesson.results.xp')}
              to={results.xpAwarded}
              show={(n) => formatNumber(n, locale)}
              a11yValue={`+${formatNumber(results.xpAwarded, locale)}`}
            />
            <StatCard
              index={1}
              travel={plan.travel}
              tone={tones.meadow}
              icon="target"
              label={gradeWord}
              to={pct}
              show={(n) => `${formatNumber(n, locale)}%`}
              a11yLabel={t('lesson.results.accuracy')}
              a11yValue={`${pct}%, ${gradeWord}, ${t('lesson.results.firstTries', { correct: results.correct, total: results.total })}`}
            />
            {sitting && clock ? (
              <StatCard
                index={2}
                travel={plan.travel}
                tone={tones.river}
                icon="clock"
                label={t(sittingPace(sitting.ms, sitting.answers) === 'quick' ? 'lesson.results.quick' : 'lesson.results.time')}
                to={clock.minutes * 60 + clock.seconds}
                show={(n) => clockWords(n, locale)}
                a11yValue={t('lesson.results.timeSpoken', { minutes: formatNumber(clock.minutes, locale), seconds: formatNumber(clock.seconds, locale) })}
              />
            ) : null}
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

/** Whole seconds as a clock, m:ss, in the reader's own digits. */
function clockWords(totalSeconds: number, locale: Locale): string {
  const { minutes, seconds } = sittingClock(totalSeconds * 1000);
  let ss: string;
  try {
    ss = new Intl.NumberFormat(locale, { minimumIntegerDigits: 2 }).format(seconds);
  } catch {
    ss = String(seconds).padStart(2, '0');
  }
  return `${formatNumber(minutes, locale)}:${ss}`;
}

/**
 * One of the three cards: a band of its colour naming what it counts, and
 * under it, framed in the same colour, an icon and the number counting up to
 * where it ends. They rise in one after another as the words land; under
 * Reduce Motion they are simply there, with the final number.
 */
function StatCard({
  index,
  travel,
  tone,
  icon,
  label,
  to,
  show,
  a11yLabel,
  a11yValue,
}: {
  index: number;
  travel: boolean;
  tone: ToneColors;
  icon: IconName;
  label: string;
  /** the number it counts up to */
  to: number;
  /** how a number on the way is written */
  show: (n: number) => string;
  /** what a screen reader calls it, where the band's word is not enough */
  a11yLabel?: string;
  /** read as the final number, not the one it is counting through */
  a11yValue: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  const delayMs = RESULTS_TIMING.tilesAtMs + index * RESULTS_TIMING.tileStaggerMs;
  const shown = useCountUp(to, { delayMs: travel ? delayMs : 0 });
  const rise = useRef(new Animated.Value(travel ? 0 : 1)).current;
  useEffect(() => {
    // under Reduce Motion — an answer that may arrive a moment after the results open — simply there
    if (!travel) {
      rise.setValue(1);
      return;
    }
    const run = timing(rise, 1, duration.slow, { delay: delayMs });
    run.start();
    return () => run.stop();
  }, [travel, delayMs, rise]);
  const translateY = rise.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });
  return (
    <Animated.View
      style={[styles.card, { backgroundColor: tone.fill, opacity: rise, transform: [{ translateY }] }]}
      accessible
      accessibilityLabel={`${a11yLabel ?? label}: ${a11yValue}`}
    >
      <Text style={[styles.cardLabel, { color: tone.ink }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
        {label}
      </Text>
      <View style={[styles.cardBody, { flexDirection: dir.row, backgroundColor: colors.surface }]}>
        <Icon name={icon} size={20} color={tone.text} />
        <Text style={[styles.cardValue, { color: tone.text }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {show(shown)}
        </Text>
      </View>
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
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  stage: { width: STAGE.width, height: STAGE.height, alignItems: 'center', justifyContent: 'flex-end' },
  details: { alignSelf: 'stretch', alignItems: 'center', gap: spacing.md },
  heading: { alignItems: 'center', gap: spacing.xs },
  title: { ...display(typography.sizes.xxl), textAlign: 'center' },
  subtitle: { fontSize: typography.sizes.md, lineHeight: 23, textAlign: 'center' },
  note: { fontSize: typography.sizes.sm, textAlign: 'center' },
  cards: { alignSelf: 'stretch', gap: spacing.sm + 2, marginTop: spacing.xs },
  // a band of colour, and the framed body under it: the band's fill is the frame
  card: { flex: 1, minWidth: 0, borderRadius: radii.lg, padding: 3, paddingTop: 0 },
  cardLabel: { fontSize: 12, fontWeight: typography.weights.bold, letterSpacing: 0.6, textTransform: 'uppercase', textAlign: 'center', paddingVertical: 5, paddingHorizontal: 4 },
  cardBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radii.lg - 3, paddingVertical: spacing.sm + 6, paddingHorizontal: spacing.xs },
  cardValue: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
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
