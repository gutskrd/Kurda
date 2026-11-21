import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Pressable } from '../../theme/Pressable';
import {
  RESULTS_TIMING,
  WORD_PICTURES,
  afterResults,
  endMoment,
  hueSteps,
  isSoraniDialect,
  reactionDelayMs,
  resultsActions,
  resultsGrade,
  resultsOutcome,
  sittingClock,
  sittingPace,
  type AfterResults,
  type ResultsAction,
  type WordPictureId,
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
import { duration, pressedDim } from '../../theme/motion';
import { MIN_TOUCH_TARGET } from '../../a11y/a11y';
import { TONES, type ToneColors } from '../../coursemap/path';
import { NO_MOMENTS, lessonMoments, type LessonMoments } from '../moments';
import { useDirection } from '../../reports/direction';
import { ReminderOffer, useReminderOffer } from '../../push/ReminderOffer';
import { useScreenBottomInset, useScreenTopInset } from '../../navigation/tabBarLayout';
import { HevaloWindow } from '../../characters/HevaloWindow';
import { sayReactionLater } from '../../characters/reactions';
import { GoalRing } from '../../leagues/GoalRing';
import { knownTier, leagueName } from '../../leagues/format';
import { QuestsScreen } from '../../quests/QuestsScreen';
import type { Locale, TranslationKey } from '../../i18n/translations';
import type { Exercise, SessionResults } from '../types';
import { WaterDrop } from '../../tree/TreeArt';
import { ShareWin } from '../../share/ShareWin';
import { lessonShare } from '../../share/winText';
import { StreakMoment } from './StreakMoment';
import { PlayDisc } from './ModelButton';
import { useAudio } from '../useAudio';
import { CARD } from '../valley';

interface Props {
  results: SessionResults;
  exercises: Exercise[];
  /** Exercises put off ("can't listen now") and never answered this time. */
  skipped?: number;
  /** The lesson these results are for, named for its Share; absent for a review, which has no Share. */
  lesson?: { title: string | null } | null;
  /** What else the lesson did: today's goal, the streak, a new level, the league. */
  moments?: LessonMoments;
  /** A lesson (not practice) may end with the screen before the phone's notification question (push/ReminderOffer.tsx). */
  offerReminders?: boolean;
  /** The course's next lesson, when there is one to offer. */
  next?: { lessonId: string; title: string } | null;
  /** Today's goal is met, so the results suggest stopping and "Done" leads. */
  goalDone?: boolean;
  /** The mistakes practice can take ("Practise these now"); empty for none. */
  practise?: string[];
  /** The course's variety of Kurdish, for the line under the title; absent on a practice session. */
  dialect?: string | null;
  /** This sitting: time from the first exercise shown to the last answer, and the answer count; null when not measured. */
  sitting?: { ms: number; answers: number } | null;
  onDone: () => void;
  onNext?: (lessonId: string) => void;
  onPractise?: (exerciseIds: string[]) => void;
  /** To the lesson path, wherever the lesson was opened from. */
  onPath?: () => void;
}

/** The stage Hevalo arrives on, and his window's height on it. */
const STAGE = { width: 280, height: 232 };
const WINDOW = 224;

/** Mistake lists up to this long start open; longer ones start folded so the results fit one screen. */
const MISTAKES_OPEN = 3;

const ACTION_WORDS: Record<ResultsAction, TranslationKey> = {
  next: 'lesson.results.next',
  practise: 'lesson.results.practise',
  done: 'common.done',
};

/**
 * The end of a lesson on one screen. It opens as the app's one celebration (theme/celebration.ts): Hevalo's window
 * springs in and he cheers as the haptic lands, however many things the lesson did. The title says how it went, then
 * three cards count up the XP (gold), first-time right answers (green, always with a kind word) and the sitting's
 * time (blue). Under them today's goal moves to its new place and the league place and any new level arrive. A tap
 * on Hevalo skips to the end, and a badge earned waits its turn.
 *
 * The ways on sit at the foot where Check was: the next lesson, or "Done" once today's goal is met, plus practising
 * the mistakes. Before the first of them come the after-results moments (shared `afterResults`), each once: the
 * streak (StreakMoment), today's quests (QuestsScreen), and on a phone never asked, the screen before the
 * notification question (push/ReminderOffer.tsx), which is a screen of its own so the ways on cannot sit beside it.
 * Nothing moves on by itself, and nothing asks for money. A lesson's results have a quiet Share (share/ShareWin.tsx)
 * over the buttons.
 *
 * Every mistake is listed with its question and right answer, folded when there are more than three; a listening
 * mistake shows its clip to replay. Put-off exercises are left out of the score and counted in a note, as on the
 * website.
 */
export function LessonResults({
  results,
  exercises,
  skipped = 0,
  lesson = null,
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
  // In right-to-left languages the cards and the lines under them start from the right.
  const dir = useDirection();
  const top = useScreenTopInset();
  const bottom = useScreenBottomInset(spacing.lg);
  const moment = useCelebration({ sound: 'complete' });
  useCelebrationHold(moment.playing);
  const { plan } = moment;
  const pct = Math.round(results.accuracy * 100);
  const mistakes = results.mistakes ?? [];
  const promptFor = (id: string, prompt?: string) => prompt ?? exercises.find((e) => e.id === id)?.prompt ?? '';
  // A picture answer is named by its catalogue id, so say what it shows instead.
  const answerFor = (id: string, correction: string): string =>
    exercises.find((e) => e.id === id)?.ask === 'picture' && Object.prototype.hasOwnProperty.call(WORD_PICTURES, correction)
      ? WORD_PICTURES[correction as WordPictureId].en
      : correction;
  const [folded, setFolded] = useState(mistakes.length > MISTAKES_OPEN);
  // Every band as tall as the tallest, so the numbers stay level when one band's label wraps.
  const [band, setBand] = useState(0);
  const fitBand = useCallback((height: number) => setBand((was) => Math.max(was, Math.ceil(height))), []);

  // Hevalo cheers as the haptic lands (`hapticAtMs`), or at once when the moment is skipped.
  const [cheer, setCheer] = useState(false);
  useEffect(() => {
    if (!moment.playing) {
      setCheer(true);
      return;
    }
    const id = setTimeout(() => setCheer(true), plan.hapticAtMs);
    return () => clearTimeout(id);
  }, [moment.playing, plan.hapticAtMs]);
  // And says his word for the lesson once the title has landed (shared reactions.ts); a perfect lesson is known from the results alone.
  const [perfect] = useState(() => lessonMoments(null, null, null, { kind: lesson ? 'lesson' : 'practice', accuracy: results.accuracy, skipped }).perfect === true);
  useEffect(() => sayReactionLater(reactionDelayMs('celebration', !plan.travel), { moment: endMoment(perfect), character: 'hevalo', drawn: true }), [perfect, plan.travel]);

  // Whether the notification question is due, found out while the results are read (null until known).
  const remindersDue = useReminderOffer(offerReminders);
  // The after-results moments, opened on the way to whichever way on is chosen first.
  const [after, setAfter] = useState<{ steps: AfterResults[]; then: () => void } | null>(null);
  const afterShown = useRef(false);
  const go = (then: () => void) => () => {
    const steps = afterShown.current
      ? []
      : afterResults({ streakKept: moments.streakKept, questsMoved: (results.quests ?? []).length > 0, remindersDue: remindersDue === true });
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
  // The sun's golds (the website's tone-zer), and a little of the right-answer green.
  const flecks = [colors.gold, '#FFE16A', '#FFBD1F', colors.success];

  if (after?.steps[0] === 'streak') return <StreakMoment streak={results.streak} goalDone={goalDone} onContinue={onward} />;
  if (after?.steps[0] === 'quests') return <QuestsScreen place="lesson" steps={results.quests} onDone={onward} />;
  if (after?.steps[0] === 'reminders') return <ReminderOffer onDone={onward} />;

  const canPractise = practise.length > 0 && !!onPractise;
  const actions = resultsActions({ next: next !== null && !!onNext, practise: canPractise, goalDone });
  // "Back to the path", where the results offer it and there is a path.
  const backLink = actions.backLink && onPath ? onPath : null;
  const run = (action: ResultsAction): (() => void) =>
    go(() => {
      if (action === 'next' && next && onNext) onNext(next.lessonId);
      else if (action === 'practise' && onPractise) onPractise(practise);
      else onDone();
    });
  const grade = resultsGrade(results.accuracy);
  const gradeWord = t(`lesson.results.grade.${grade}` as TranslationKey);
  const outcome = resultsOutcome({ perfect: moments.perfect === true, accuracy: results.accuracy });
  const title = t(outcome === 'perfect' ? 'lesson.results.perfect' : outcome === 'great' ? 'lesson.results.great' : 'lesson.complete');
  const stronger: TranslationKey = !dialect
    ? 'lesson.results.stronger'
    : isSoraniDialect(dialect)
      ? 'lesson.results.strongerSorani'
      : 'lesson.results.strongerKurmanci';
  const tones = TONES[scheme];
  const gold: ToneColors = { fill: colors.gold, lip: colors.gold, ink: colors.textOnGold, text: colors.goldText };
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
            <HevaloWindow size={WINDOW} flip={dir.rtl} reaction={cheer ? 'cheer' : null} />
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
              band={band}
              onBand={fitBand}
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
              band={band}
              onBand={fitBand}
              travel={plan.travel}
              tone={tones.meadow}
              icon="target"
              label={gradeWord}
              to={pct}
              show={(n) => `${formatNumber(n, locale)}%`}
              a11yLabel={t('lesson.results.accuracy')}
              a11yValue={`${pct}%, ${gradeWord}, ${t('lesson.results.firstTries', { correct: formatNumber(results.correct, locale), total: formatNumber(results.total, locale) })}`}
            />
            {sitting && clock ? (
              <StatCard
                index={2}
                band={band}
                onBand={fitBand}
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

          <Rows moments={moments} travel={plan.travel} water={results.tree?.gained ?? 0} />

          {actions.stopHere ? <Text style={[styles.note, { color: colors.textPrimary }]}>{t('lesson.results.goalDoneStop')}</Text> : null}

          {skipped > 0 ? <Text style={[styles.note, { color: colors.textSecondary }]}>{t('lesson.skipped', { count: formatNumber(skipped, locale) })}</Text> : null}

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
                : mistakes.map((m) => {
                    const prompt = promptFor(m.exerciseId, m.prompt);
                    const exercise = exercises.find((e) => e.id === m.exerciseId);
                    const clip = exercise?.type === 'listening' ? exercise.audioUrl : undefined;
                    return (
                      <View key={m.exerciseId} style={styles.mistakeRow}>
                        {prompt ? <Text style={[styles.mistakePrompt, dir.free, { color: colors.textSecondary }]}>{prompt}</Text> : null}
                        {m.correction ? (
                          <View style={[styles.answerLine, { flexDirection: dir.row }]}>
                            {clip ? <HearAgain url={clip} /> : null}
                            <Text style={[styles.mistakeAnswer, styles.answerWords, dir.text, { color: colors.textPrimary }]}>
                              {/* The answer is isolated from the words round it, so an English answer in a Soranî line keeps its full stop at its end. */}
                              {t('lesson.answer')} <Text style={styles.mistakeAnswerValue}>{`⁨${answerFor(m.exerciseId, m.correction)}⁩`}</Text>
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
            </View>
          ) : null}
        </Animated.View>
      </ScrollView>

      {/* Where Check was: the main way on at the foot, under the other. */}
      <View style={[styles.bar, { paddingBottom: bottom, backgroundColor: colors.barFill, borderTopColor: colors.separator }]}>
        {/* The quiet actions on one line over the buttons: back to the path, and a lesson's Share. */}
        {backLink || lesson ? (
          <View style={[styles.quiet, { flexDirection: dir.row }]}>
            {backLink ? (
              <Pressable onPress={go(backLink)} accessibilityRole="button" hitSlop={4} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
                <Text style={[styles.backText, { color: colors.textSecondary }]}>{t('lesson.results.backToPath')}</Text>
              </Pressable>
            ) : null}
            {lesson ? <ShareWin text={lessonShare(t, lesson.title)} testID="lesson-share" /> : null}
          </View>
        ) : null}
        {actions.secondary ? <ClayButton label={t(ACTION_WORDS[actions.secondary])} tone="primary" variant="outline" size="large" onPress={run(actions.secondary)} /> : null}
        <ClayButton label={t(ACTION_WORDS[actions.primary])} tone="primary" size="large" onPress={run(actions.primary)} />
      </View>
    </View>
  );
}

/** Whole seconds as m:ss, in the reader's own digits. */
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

/** The narrowest phone whose cards have room for an icon beside a number as wide as "100%". */
const ICON_ROOM = 360;

/** The play mark beside a listening mistake's answer, drawn smaller than a fingertip but reaching one. */
const HEAR = 32;

/** A listening mistake's clip as a play mark beside its answer. Nothing where this host cannot play it or it fails to load. */
function HearAgain({ url }: { url: string }): React.JSX.Element | null {
  const { t } = useI18n();
  const audio = useAudio(url);
  if (!audio.supported || audio.error) return null;
  return (
    <Pressable
      onPress={() => audio.play(1)}
      accessibilityRole="button"
      accessibilityLabel={t('lesson.listen.play')}
      reachSize={{ width: HEAR, height: HEAR }}
      style={({ pressed }) => pressed && styles.pressed}
      testID="mistake-hear"
    >
      <PlayDisc size={HEAR} playing={audio.playing} />
    </Pressable>
  );
}

/**
 * One of the three cards: a coloured band naming what it counts, over a framed icon and number counting up. They
 * rise in one after another; under Reduce Motion they show the final number at once. A long band label wraps (every
 * band matching the tallest), below `ICON_ROOM` the icon steps aside so "100%" is never cut, and a number still too
 * wide is set a little smaller.
 */
function StatCard({
  index,
  band,
  onBand,
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
  /** The height every band is given: the tallest one's. */
  band: number;
  /** Reports each band's own height once laid out. */
  onBand: (height: number) => void;
  travel: boolean;
  tone: ToneColors;
  icon: IconName;
  label: string;
  /** The number it counts up to. */
  to: number;
  /** How a number in progress is written. */
  show: (n: number) => string;
  /** The screen-reader name, where the band's label is not enough. */
  a11yLabel?: string;
  /** Read as the final number, not the one it is counting through. */
  a11yValue: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  const roomy = useWindowDimensions().width >= ICON_ROOM;
  const delayMs = RESULTS_TIMING.tilesAtMs + index * RESULTS_TIMING.tileStaggerMs;
  const shown = useCountUp(to, { delayMs: travel ? delayMs : 0 });
  const rise = useRef(new Animated.Value(travel ? 0 : 1)).current;
  useEffect(() => {
    // Under Reduce Motion (the answer may arrive just after the results open) it is simply there.
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
      <View style={[styles.cardBand, { minHeight: band }]} onLayout={(e) => onBand(e.nativeEvent.layout.height)}>
        <Text style={[styles.cardLabel, { color: tone.ink }]} numberOfLines={2} maxFontSizeMultiplier={1.2}>
          {label}
        </Text>
      </View>
      <View style={[styles.cardBody, { flexDirection: dir.row, backgroundColor: colors.surface }]}>
        {roomy ? <Icon name={icon} size={20} color={tone.text} /> : null}
        <Text style={[styles.cardValue, { color: tone.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} maxFontSizeMultiplier={1.3}>
          {show(shown)}
        </Text>
      </View>
    </Animated.View>
  );
}

/**
 * What else the lesson moved: today's goal from its old to its new place (at `goalAtMs`), then the league place and a
 * new level fading in. A row whose numbers could not be read is left out, never guessed.
 */
function Rows({ moments, travel, water }: { moments: LessonMoments; travel: boolean; water: number }): React.JSX.Element | null {
  const { colors, scheme } = useTheme();
  // A goal met is earned, so it is gold.
  const gold = hueSteps(scheme, 'gold');
  const { t, locale } = useI18n();
  const dir = useDirection();
  const goal = moments.goal ?? null;
  const tier = moments.league ? knownTier(moments.league.tier) : null;
  const league = moments.league && tier ? moments.league : null;
  const opened = useRef(Date.now());
  const [goalXp, setGoalXp] = useState<number | null>(goal ? (travel ? goal.from : goal.to) : null);
  const rows = useRef(new Animated.Value(travel ? 0 : 1)).current;

  // The goal ring moves on once the tiles are in, or as soon as the numbers arrive after that.
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

  // The league and the level fade in after the goal, whenever their numbers arrive.
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

  if (!goal && !moments.goalMet && !league && moments.level === null && water <= 0) return null;
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
        <View style={[styles.row, { flexDirection: dir.row, backgroundColor: met ? gold.wash : colors.controlTrack }]} accessible accessibilityLabel={goalWords}>
          {goal && goalXp !== null ? (
            <GoalRing xp={goalXp} goal={goal.target} size={36} tint={[colors.gold, colors.goldText]} showNumbers={false} />
          ) : (
            <Icon name="seal-check" size={18} color={gold.deep} />
          )}
          <Text style={[styles.rowText, dir.text, { color: colors.textPrimary }]}>{goalWords}</Text>
        </View>
      ) : null}
      {league ? (
        <Animated.View style={[styles.row, { flexDirection: dir.row, backgroundColor: colors.controlTrack, opacity: rows }]} accessible accessibilityLabel={leagueWords!}>
          <Icon name="trophy" size={18} color={colors.goldText} />
          <Text style={[styles.rowText, dir.text, { color: colors.textPrimary }]}>{leagueWords}</Text>
          {league.toRank < league.fromRank ? (
            // A place won is earned, in the trophy's gold beside it.
            <Text style={[styles.rowUp, { color: colors.goldText }]}>{t('lesson.results.leagueUp', { rank: formatNumber(league.toRank, locale) })}</Text>
          ) : null}
        </Animated.View>
      ) : null}
      {moments.level !== null ? (
        <Animated.View style={[styles.row, { flexDirection: dir.row, backgroundColor: colors.controlTrack, opacity: rows }]}>
          <Icon name="star-fill" size={18} color={colors.gold} />
          <Text style={[styles.rowText, dir.text, { color: colors.textPrimary }]}>{t('lesson.levelUp', { level: formatNumber(moments.level, locale) })}</Text>
        </Animated.View>
      ) : null}
      {/* The water this session earned the learner's tree. */}
      {water > 0 ? (
        <Animated.View style={[styles.row, { flexDirection: dir.row, backgroundColor: colors.controlTrack, opacity: rows }]} testID="lesson-water">
          <WaterDrop size={18} />
          <Text style={[styles.rowText, dir.text, { color: colors.textPrimary }]}>{t('tree.results.water', { count: formatNumber(water, locale) })}</Text>
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
  title: { ...display(typography.sizes.title), textAlign: 'center' },
  subtitle: { fontSize: typography.sizes.text, lineHeight: 23, textAlign: 'center' },
  note: { fontSize: typography.sizes.text, textAlign: 'center' },
  cards: { alignSelf: 'stretch', gap: spacing.sm + 2, marginTop: spacing.xs },
  // A coloured band over the framed body; the band's fill is the frame.
  card: { flex: 1, minWidth: 0, borderRadius: radii.lg, padding: 3, paddingTop: 0 },
  cardBand: { justifyContent: 'center', paddingVertical: 5, paddingHorizontal: 4 },
  cardLabel: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, letterSpacing: 0.6, textTransform: 'uppercase', textAlign: 'center' },
  cardBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radii.lg - 3, paddingVertical: spacing.sm + 6, paddingHorizontal: spacing.xs },
  cardValue: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  rows: { alignSelf: 'stretch', gap: spacing.sm },
  row: { alignItems: 'center', gap: spacing.sm, borderRadius: radii.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, minHeight: 48 },
  rowText: { flex: 1, fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  rowUp: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  mistakes: { alignSelf: 'stretch', gap: spacing.md, borderRadius: radii.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  mistakesHead: { alignItems: 'center', justifyContent: 'space-between', minHeight: MIN_TOUCH_TARGET },
  turned: { transform: [{ rotate: '180deg' }] },
  mistakesTitle: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  mistakeRow: { gap: spacing.xs },
  mistakePrompt: { fontSize: typography.sizes.text },
  mistakeAnswer: { fontSize: typography.sizes.text },
  // A listening mistake's play mark at the start of its answer, the words wrapping beside it.
  answerLine: { alignItems: 'center', gap: spacing.sm },
  answerWords: { flex: 1 },
  mistakeAnswerValue: { fontWeight: typography.weights.bold },
  pressed: { opacity: pressedDim },
  // The lesson's bar at the foot, under its hairline, where Check was.
  bar: { paddingHorizontal: spacing.md, paddingTop: spacing.md - 2, gap: spacing.sm, borderTopWidth: CARD.edge },
  // Side by side and centred, or stacked when the text size leaves no room.
  quiet: { alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', columnGap: spacing.md, rowGap: spacing.xs },
  back: { alignSelf: 'center', minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: spacing.md },
  backText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold, textDecorationLine: 'underline' },
});
