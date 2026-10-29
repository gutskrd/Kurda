import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type TextStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { STREAK_DAY_TIMING, freezeLine, streakSpeech, streakWeek, weekStartsOn, type StreakMood, type WeekDay } from '@kurda/shared';
import { useReducedMotion } from '../../a11y/useReducedMotion';
import { useCelebrationHold } from '../../badges/BadgeCelebrationHost';
import { SpeakingCharacter } from '../../characters/SpeakingCharacter';
import { GOLD_INK, REST, TONES } from '../../coursemap/path';
import { useI18n } from '../../i18n/I18nContext';
import { formatNumber } from '../../i18n/format';
import type { TranslationKey } from '../../i18n/translations';
import { useScreenBottomInset, useScreenTopInset } from '../../navigation/tabBarLayout';
import { useDirection } from '../../reports/direction';
import { springTo, timing } from '../../theme/animate';
import { BURST, CELEBRATE_MS } from '../../theme/celebration';
import { ConfettiBurst, GlowRing, SoftGlow, useCelebration } from '../../theme/CelebrationParts';
import { display } from '../../theme/fonts';
import { ClayButton } from '../../theme/glass';
import { Icon } from '../../theme/Icon';
import { duration } from '../../theme/motion';
import { useTheme } from '../../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../../theme/tokens';
import type { Streak } from '../types';

/** How big the flame is drawn on its own screen, and beside Hevalo after it. */
const FLAME = 168;
const FLAME_SMALL = 112;
/** The day's number on the flame's screen, and on the streak's. */
const NUMBER = 112;
const NUMBER_SMALL = 88;
/** How tall Hevalo stands under his words. */
const HEVALO = 168;
/** A day of the week: the circle, and when the circles arrive one after another, today's last. */
const DAY = 36;
const DAY_STAGGER_MS = 50;

/** Hevalo's words, by the day the streak was kept and which of its two lines (shared `streakSpeech`). */
const SPEECH: Record<StreakMood, readonly [TranslationKey, TranslationKey]> = {
  start: ['lesson.streak.say.start0', 'lesson.streak.say.start1'],
  comeback: ['lesson.streak.say.comeback0', 'lesson.streak.say.comeback1'],
  best: ['lesson.streak.say.best0', 'lesson.streak.say.best1'],
  ordinary: ['lesson.streak.say.ordinary0', 'lesson.streak.say.ordinary1'],
};

/**
 * The streak kept today, after the results: shown when this lesson was the
 * first today, on the way to whichever way on the learner chose.
 *
 * First the moment itself, a screen of warm light: the flame grows in with a
 * glow and a few sparks, and the day's number rolls on from yesterday's, felt
 * and heard once. A tap, or a second and a half, moves on to the streak
 * itself: Hevalo with a few words about the day (a first day, a comeback, a
 * longest run yet, or another day), the number, the week with the days
 * learned in it, how near the next freeze is, and one button — "See you
 * tomorrow" once today's goal is done.
 *
 * The week needs the learner's own today and recent days from the server; an
 * older server sends neither, and then the week is left out rather than
 * guessed. No countdown, nothing about losing it: a kept day is said as what
 * it is. Under Reduce Motion it all fades and nothing travels.
 */
export function StreakMoment({ streak, goalDone, onContinue }: { streak: Streak; goalDone: boolean; onContinue: () => void }): React.JSX.Element {
  const [phase, setPhase] = useState<'flame' | 'week'>('flame');
  return phase === 'flame' ? <FlameMoment streak={streak} onDone={() => setPhase('week')} /> : <StreakWeekScreen streak={streak} goalDone={goalDone} onContinue={onContinue} />;
}

/** "day streak", for the number in front of it. */
function unitFor(n: number): TranslationKey {
  return n === 1 ? 'lesson.streak.unitOne' : 'lesson.streak.unit';
}

function FlameMoment({ streak, onDone }: { streak: Streak; onDone: () => void }): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const { t, locale } = useI18n();
  const { width, height } = useWindowDimensions();
  const moment = useCelebration({ sound: 'reward' });
  useCelebrationHold(moment.playing);
  const { plan } = moment;
  const day = Math.max(1, streak.current);
  const said = `${formatNumber(day, locale)} ${t(unitFor(day))}`;
  const ink = scheme === 'dark' ? colors.gold : GOLD_INK;
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility?.(said);
    // on by itself once the moment has been seen; a tap goes sooner
    const id = setTimeout(() => done.current(), CELEBRATE_MS);
    return () => clearTimeout(id);
    // once, as it opens
  }, []);

  const scale = plan.travel ? moment.art.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) : 1;
  const opacity = moment.art.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' });

  return (
    <Pressable
      onPress={() => {
        moment.skip();
        onDone();
      }}
      accessibilityRole="button"
      accessibilityLabel={said}
      accessibilityHint={t('common.continue')}
      style={styles.screen}
      testID="lesson-streak-flame"
    >
      <WarmLight width={width} height={height} />
      <View style={styles.flameMiddle}>
        <View style={[styles.flameStage, { width: FLAME * 2, height: FLAME * 1.6 }]}>
          <SoftGlow colour={colors.gold} size={FLAME * 1.6} id="streak-glow" />
          {plan.travel ? <GlowRing progress={moment.ring} colour={colors.gold} size={FLAME} /> : null}
          {plan.travel ? (
            <ConfettiBurst progress={moment.burst} count={BURST.lesson} seed={day * 17 + 5} colours={[colors.gold, '#FFE16A', '#FF9A3C', '#FFFFFF']} reach={FLAME * 0.85} />
          ) : null}
          <Animated.View style={{ opacity, transform: [{ scale }] }}>
            <FlameArt size={FLAME} />
          </Animated.View>
        </View>
        <RollingNumber from={day - 1} to={day} progress={moment.details} travel={plan.travel} size={NUMBER} colour={ink} />
        <Animated.Text style={[styles.flameUnit, { color: ink, opacity: moment.details }]}>{t(unitFor(day))}</Animated.Text>
      </View>
    </Pressable>
  );
}

/**
 * The warm light behind the moment: the sun's gold at the edges, softening
 * to a pale glow in the middle on the light page and to an ember on the dark.
 */
function WarmLight({ width, height }: { width: number; height: number }): React.JSX.Element {
  const { scheme } = useTheme();
  const stops = scheme === 'dark' ? ['#2B1E0B', '#6B4410', '#C98512'] : ['#FFF6DE', '#FFD978', '#EFA312'];
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient id="streak-light" cx="50%" cy="45%" r="75%">
            <Stop offset="0" stopColor={stops[0]} />
            <Stop offset="0.55" stopColor={stops[1]} />
            <Stop offset="1" stopColor={stops[2]} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={height} fill="url(#streak-light)" />
      </Svg>
    </View>
  );
}

/** The streak's flame, drawn: gold at the tip deepening to orange, a bright heart, and a lick of light down one side. */
function FlameArt({ size }: { size: number }): React.JSX.Element {
  const id = `flame-${size}`;
  return (
    <Svg width={size} height={size * 1.2} viewBox="0 0 100 120" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFC531" />
          <Stop offset="1" stopColor="#F07B16" />
        </LinearGradient>
      </Defs>
      <Path d="M52 4 C60 24 84 40 86 70 C88 96 70 116 50 116 C30 116 12 98 14 72 C15 56 24 46 32 38 C32 50 38 58 46 60 C40 44 42 22 52 4 Z" fill={`url(#${id})`} />
      <Path d="M50 56 C58 70 70 78 70 94 C70 107 61 114 50 114 C39 114 30 107 30 94 C30 80 42 72 50 56 Z" fill="#FFE27A" />
      <Path d="M24 76 C24 64 29 55 35 49" stroke="#FFFFFF" strokeOpacity={0.35} strokeWidth={4} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

/**
 * A number rolling on: each digit that changes slides up and away as the new
 * one slides up into its place, the ones that stay put staying put. Driven by
 * `progress` (0 → 1); under Reduce Motion the two cross-fade instead.
 */
function RollingNumber({
  from,
  to,
  progress,
  travel,
  size,
  colour,
}: {
  from: number;
  to: number;
  progress: Animated.Value;
  travel: boolean;
  size: number;
  colour: string;
}): React.JSX.Element {
  const { locale } = useI18n();
  const style: TextStyle = { ...display(size), color: colour, fontVariant: ['tabular-nums'] };
  const line = style.lineHeight ?? size;
  const before = formatNumber(Math.max(0, from), locale);
  const after = formatNumber(to, locale);
  const width = Math.max(before.length, after.length);
  const old = before.padStart(width, ' ');
  const now = after.padStart(width, ' ');
  return (
    <View style={styles.rolling} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from(now).map((digit, i) =>
        old[i] === digit ? (
          <Text key={i} style={style} maxFontSizeMultiplier={1}>
            {digit}
          </Text>
        ) : (
          <View key={i} style={{ height: line, overflow: 'hidden' }}>
            <Animated.Text
              style={[style, { opacity: progress, transform: [{ translateY: travel ? progress.interpolate({ inputRange: [0, 1], outputRange: [line, 0] }) : 0 }] }]}
              maxFontSizeMultiplier={1}
            >
              {digit}
            </Animated.Text>
            <Animated.Text
              style={[
                style,
                styles.leaving,
                {
                  opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
                  transform: [{ translateY: travel ? progress.interpolate({ inputRange: [0, 1], outputRange: [0, -line] }) : 0 }],
                },
              ]}
              maxFontSizeMultiplier={1}
            >
              {old[i]!.trim()}
            </Animated.Text>
          </View>
        ),
      )}
    </View>
  );
}

function StreakWeekScreen({ streak, goalDone, onContinue }: { streak: Streak; goalDone: boolean; onContinue: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const reduce = useReducedMotion();
  const top = useScreenTopInset();
  const bottom = useScreenBottomInset(spacing.lg);
  const day = Math.max(1, streak.current);
  const speech = streakSpeech(streak);
  const words = t(SPEECH[speech.mood][speech.line], { count: formatNumber(day, locale) });
  const arrive = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  // only a server that says what today is, and which days were learned, has a week to show
  const week = streak.today && streak.recent ? streakWeek({ today: streak.today, recent: streak.recent, startsOn: weekStartsOn(locale) }) : null;

  useEffect(() => {
    if (reduce) {
      arrive.setValue(1);
      return;
    }
    const run = timing(arrive, 1, duration.slow);
    run.start();
    return () => run.stop();
  }, [reduce, arrive]);
  const rise = arrive.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });

  return (
    <View style={[styles.screen, { paddingTop: top }]} testID="lesson-streak-day">
      <ScrollView contentContainerStyle={styles.weekBody}>
        <Animated.View style={[styles.speaker, { opacity: arrive, transform: [{ translateY: rise }] }]}>
          <View style={[styles.bubble, { backgroundColor: colors.surface, borderColor: colors.separator }]}>
            <Text style={[styles.bubbleText, dir.text, { color: colors.textPrimary }]}>{words}</Text>
            <View style={[styles.tail, { backgroundColor: colors.surface, borderColor: colors.separator }]} />
          </View>
          {/* Hevalo under his words, the flame burning just behind him on the side the reading starts from */}
          <View style={styles.hevalo} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={[styles.behind, { transform: [{ translateX: (dir.rtl ? 1 : -1) * FLAME_SMALL * 0.42 }] }]}>
              <FlameArt size={FLAME_SMALL} />
            </View>
            <SpeakingCharacter speaker="hevalo" player={null} playing={false} crop="full" height={HEVALO} flip={dir.rtl} reaction="cheer" />
          </View>
        </Animated.View>
        <View
          style={styles.count}
          accessible
          accessibilityRole="header"
          accessibilityLabel={`${formatNumber(day, locale)} ${t(unitFor(day))}`}
        >
          <Text style={[styles.bigNumber, { color: colors.goldText }]} maxFontSizeMultiplier={1}>
            {formatNumber(day, locale)}
          </Text>
          <Text style={[styles.unit, { color: colors.goldText }]}>{t(unitFor(day))}</Text>
        </View>
        {week ? <WeekRow week={week} travel={!reduce} /> : null}
        <FreezeLine streak={streak} />
      </ScrollView>
      <View style={[styles.bar, { paddingBottom: bottom }]}>
        <ClayButton label={t(goalDone ? 'lesson.streak.seeYou' : 'common.continue')} tone="primary" size="large" onPress={onContinue} />
      </View>
    </View>
  );
}

/**
 * The week the streak was kept in: the days' initials over seven circles,
 * from the day the learner's week starts on (Saturday in Kurdish and Arabic).
 * A day learned is gold with a check, one a freeze kept is ice blue with a
 * check, today not learned yet is a gold ring, a missed day a muted disc and a
 * day still ahead an empty ring — a shape for each, never the colour alone.
 * The circles arrive one after another and today's pops in last.
 */
function WeekRow({ week, travel }: { week: WeekDay[]; travel: boolean }): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const initials = t('lesson.streak.weekdays').split(' ');
  const learned = week.filter((d) => d.state === 'learned').length;
  const frozen = week.filter((d) => d.state === 'frozen').length;
  const summary = [
    t('lesson.streak.weekLearned', { count: formatNumber(learned, locale) }),
    frozen > 0 ? t('lesson.streak.weekFrozen', { count: formatNumber(frozen, locale) }) : null,
  ]
    .filter(Boolean)
    .join(', ');
  const others = week.filter((d) => !d.isToday).length;
  let order = 0;
  return (
    <View
      style={[styles.week, { flexDirection: dir.row, backgroundColor: colors.surface }]}
      accessible
      accessibilityLabel={summary}
      testID="streak-week"
    >
      {week.map((d) => {
        const at = d.isToday ? others : order++;
        return (
          <View key={d.date} style={styles.dayColumn} testID={`week-${d.date}`}>
            <Text style={[styles.dayName, { color: d.isToday ? colors.goldText : colors.textSecondary }, d.isToday && styles.dayNameToday]} maxFontSizeMultiplier={1.3}>
              {initials[d.weekday] ?? ''}
            </Text>
            <DayCircle day={d} delayMs={at * DAY_STAGGER_MS + (d.isToday ? STREAK_DAY_TIMING.countAtMs : 0)} travel={travel} scheme={scheme} />
          </View>
        );
      })}
    </View>
  );
}

function DayCircle({ day, delayMs, travel, scheme }: { day: WeekDay; delayMs: number; travel: boolean; scheme: 'light' | 'dark' }): React.JSX.Element {
  const { colors } = useTheme();
  const pop = useRef(new Animated.Value(travel ? 0 : 1)).current;
  useEffect(() => {
    if (!travel) {
      pop.setValue(1);
      return;
    }
    const run = day.isToday ? springTo(pop, 1, 'bouncy', delayMs) : timing(pop, 1, duration.base, { delay: delayMs });
    run.start();
    return () => run.stop();
  }, [travel, pop, delayMs, day.isToday]);
  const ice = TONES[scheme].river;
  const rest = REST[scheme];
  const look =
    day.state === 'learned'
      ? { backgroundColor: colors.gold, borderColor: colors.gold, mark: GOLD_INK }
      : day.state === 'frozen'
        ? { backgroundColor: ice.fill, borderColor: ice.fill, mark: ice.ink }
        : day.state === 'today'
          ? { backgroundColor: 'transparent', borderColor: colors.gold, mark: null }
          : day.state === 'missed'
            ? { backgroundColor: rest.fill, borderColor: rest.fill, mark: null }
            : { backgroundColor: 'transparent', borderColor: rest.fill, mark: null };
  const scale = day.isToday && travel ? pop.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) : 1;
  return (
    <Animated.View
      style={[styles.day, { backgroundColor: look.backgroundColor, borderColor: look.borderColor, opacity: pop, transform: [{ scale }] }]}
      testID={`day-${day.state}`}
    >
      {look.mark ? (
        // a check as bold as the circle it sits in; the icon set's is a hairline
        <Svg width={18} height={18} viewBox="0 0 24 24">
          <Path d="M5 12.5 L10 17.5 L19 7.5" stroke={look.mark} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </Svg>
      ) : null}
    </Animated.View>
  );
}

/** How near the next freeze is, or how many are saved: the line the "Day N" card had, under the week. */
function FreezeLine({ streak }: { streak: Streak }): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const reduce = useReducedMotion();
  const freeze = freezeLine(streak);
  const share = freeze?.kind === 'toward' ? freeze.done / freeze.per : 1;
  const fill = useRef(new Animated.Value(reduce ? share : 0)).current;
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (reduce) {
      fill.setValue(share);
      return;
    }
    const run = Animated.timing(fill, { toValue: share, duration: STREAK_DAY_TIMING.freezeMs, delay: STREAK_DAY_TIMING.freezeAtMs, useNativeDriver: true });
    run.start();
    return () => run.stop();
  }, [reduce, share, fill]);
  if (!freeze) return null;
  // the bar slides in from the reading side, as every bar's fill does
  const translateX = fill.interpolate({ inputRange: [0, 1], outputRange: [dir.rtl ? width : -width, 0] });
  const words =
    freeze.kind === 'ready'
      ? freeze.count === 1
        ? t('lesson.streak.freezeReadyOne')
        : t('lesson.streak.freezeReady', { count: formatNumber(freeze.count, locale) })
      : t('lesson.streak.freeze', { done: formatNumber(freeze.done, locale), per: formatNumber(freeze.per, locale) });
  return (
    <View style={styles.freeze} accessible accessibilityLabel={words}>
      <View style={[styles.freezeHead, { flexDirection: dir.row }]}>
        <Icon name="ice" size={18} color={colors.textSecondary} />
        <Text style={[styles.freezeText, dir.text, { color: colors.textPrimary }]}>{words}</Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.controlTrack }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <Animated.View style={[styles.fill, { backgroundColor: colors.gold, opacity: width > 0 ? 1 : 0, transform: [{ translateX }] }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flameMiddle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  flameStage: { alignItems: 'center', justifyContent: 'center' },
  flameUnit: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, marginTop: -spacing.xs },
  rolling: { flexDirection: 'row', justifyContent: 'center' },
  leaving: { position: 'absolute', top: 0, left: 0, right: 0, textAlign: 'center' },
  weekBody: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: layout.gutter, paddingVertical: spacing.md, gap: spacing.md, maxWidth: layout.column, width: '100%', alignSelf: 'center' },
  speaker: { alignItems: 'center', gap: spacing.md },
  bubble: { alignSelf: 'stretch', borderRadius: radii.lg, borderWidth: 1.5, paddingVertical: spacing.md, paddingHorizontal: spacing.md + 4 },
  bubbleText: { fontSize: typography.sizes.md, lineHeight: 24 },
  // the bubble's point, towards Hevalo under it
  tail: { position: 'absolute', bottom: -8, alignSelf: 'center', width: 16, height: 16, borderRightWidth: 1.5, borderBottomWidth: 1.5, transform: [{ rotate: '45deg' }] },
  hevalo: { alignItems: 'center', justifyContent: 'flex-end' },
  behind: { position: 'absolute', bottom: spacing.xs },
  count: { alignItems: 'center' },
  bigNumber: { ...display(NUMBER_SMALL), fontVariant: ['tabular-nums'], textAlign: 'center' },
  unit: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, textAlign: 'center', marginTop: -spacing.xs },
  week: { justifyContent: 'space-between', borderRadius: radii.lg, paddingVertical: spacing.md - 2, paddingHorizontal: spacing.sm },
  dayColumn: { flex: 1, alignItems: 'center', gap: spacing.xs + 2 },
  dayName: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  dayNameToday: { fontWeight: typography.weights.bold },
  day: { width: DAY, height: DAY, borderRadius: radii.pill, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  freeze: { alignSelf: 'stretch', gap: spacing.sm },
  freezeHead: { alignItems: 'center', gap: spacing.sm },
  freezeText: { flex: 1, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  track: { height: 10, borderRadius: radii.pill, overflow: 'hidden' },
  fill: { width: '100%', height: '100%', borderRadius: radii.pill },
  bar: { paddingHorizontal: layout.gutter, paddingTop: spacing.sm },
});
