import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type TextStyle } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import {
  FIRE_VIEW,
  FLAME_IGNITE,
  STREAK_DAY_TIMING,
  fireFrame,
  fireLevel,
  fireSizeToFit,
  flameMoment,
  freezeLine,
  nextFireStage,
  streakSpeech,
  streakWeek,
  weekStartsOn,
  type StreakMood,
  type WeekDay,
} from '@kurda/shared';
import { useReducedMotion } from '../../a11y/useReducedMotion';
import { useCelebrationHold } from '../../badges/BadgeCelebrationHost';
import { haptic } from '../../feedback/haptics';
import { playSound } from '../../feedback/sounds';
import { useI18n } from '../../i18n/I18nContext';
import { formatNumber } from '../../i18n/format';
import type { TranslationKey } from '../../i18n/translations';
import { useScreenBottomInset, useScreenTopInset } from '../../navigation/tabBarLayout';
import { DayMedalArt, StreakMedal } from '../../ranks/art';
import { useDirection } from '../../reports/direction';
import { FIRE_GREW, FIRE_NEXT, FIRE_STAGE_NAME } from '../../streak/fireWords';
import { springTo, timing } from '../../theme/animate';
import { BURST } from '../../theme/celebration';
import { ConfettiBurst, GlowRing, SoftGlow, useCelebration } from '../../theme/CelebrationParts';
import { Fire } from '../../theme/Fire';
import { display } from '../../theme/fonts';
import { ClayButton } from '../../theme/glass';
import { Icon } from '../../theme/Icon';
import { duration } from '../../theme/motion';
import { useTheme } from '../../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../../theme/tokens';
import type { Streak } from '../types';

/** Room the flame's screen keeps for the day's number, its words and the line under them, and round the fire; and the most it gives the fire. */
const FLAME_WORDS = 330;
const FLAME_MOST = 400;
/** The ring that bursts out of the fire as it lights, and the glow behind it. */
const RING = 168;
const GLOW = RING * 1.6;
/** The day's number on the flame's screen. */
const NUMBER = 112;
/** The streak's medal, which stands half over the top edge of the streak's card. */
const MEDAL = 132;
/** A day of the week: its medal or its date, and when they arrive one after another, today's last. */
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
 * First the moment itself. It opens dim and cool on yesterday, the fire
 * faint and yesterday's number, and then the fire lights (shared
 * `FLAME_IGNITE`): it squashes and pops up, a ring of gold bursts out of it,
 * the warm light floods out from it over the screen, a few sparks fly, and
 * the day's number rolls on to today's, felt and heard once. On the day the
 * fire grew (shared `flameMoment`) it opens on the fire as it was yesterday
 * and the pop leaps on up into its new stage, felt and heard as that lands,
 * with a line under the day saying what it grew into, and it stays until the
 * line has been read. A tap, or a second and a half after it lights, moves on to
 * the streak itself, on one card: the streak's medal standing half over its
 * top edge, the streak in words, a few words from Hevalo about the day (a
 * first day, a comeback, a longest run yet, or another day) and the week,
 * each day a small medal if it was learned and its date if it is still to
 * come. Under the card are the fire's stage with the next one and how near
 * the next freeze is, and one button — "See you tomorrow" once today's goal
 * is done.
 *
 * The week needs the learner's own today and recent days from the server; an
 * older server sends neither, and then the week is left out rather than
 * guessed. No countdown, nothing about losing it: a kept day is said as what
 * it is. Under Reduce Motion it all fades and nothing travels: the dim screen
 * cross-fades to the warm one.
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
  const day = Math.max(1, streak.current);
  const [fire] = useState(() => flameMoment(day));
  // the one celebration plays as it lights, felt and heard then — or, on the day the fire grew, as the growth lands
  const moment = useCelebration({ sound: 'reward', feel: !fire.grew, delayMs: FLAME_IGNITE.atMs });
  useCelebrationHold(moment.playing || fire.grew !== null);
  const { plan } = moment;
  const said = `${formatNumber(day, locale)} ${t(unitFor(day))}`;
  const grewWords = fire.grew ? t(FIRE_GREW[fire.grew]) : null;
  const ink = scheme === 'dark' ? colors.gold : colors.textOnGold;
  // as big as the screen lets the biggest fire there is be, the same at every stage (a young one drawn closer), framed
  const size = Math.min(FLAME_MOST, fireSizeToFit('newroz', width - layout.gutter * 2, height - FLAME_WORDS)) * fire.zoom;
  const frame = fireFrame(fire.level.stage);
  const stage = { width: (frame.w * size) / FIRE_VIEW.h, height: (frame.h * size) / FIRE_VIEW.h };
  // its lighting (shared FLAME_IGNITE): the pop and the number's roll, and the warm light flooding out
  const lit = useRef(new Animated.Value(0)).current;
  const flood = useRef(new Animated.Value(0)).current;
  const line = useRef(new Animated.Value(0)).current;
  const felt = useRef(false);
  const done = useRef(onDone);
  done.current = onDone;

  const feelGrowth = useCallback(() => {
    if (felt.current) return;
    felt.current = true;
    haptic('celebrate');
    playSound('reward');
  }, []);

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility?.(said);
    const lighting = Animated.parallel([
      timing(lit, 1, FLAME_IGNITE.popMs, { delay: FLAME_IGNITE.atMs, easing: Easing.linear }),
      timing(flood, 1, FLAME_IGNITE.floodMs, { delay: FLAME_IGNITE.atMs, easing: Easing.out(Easing.cubic) }),
    ]);
    lighting.start();
    // on by itself once the moment has been seen, or what the fire grew into read; a tap goes sooner
    const over = setTimeout(() => done.current(), fire.overMs);
    const lands = grewWords
      ? setTimeout(() => {
          feelGrowth();
          AccessibilityInfo.announceForAccessibility?.(grewWords);
          timing(line, 1, duration.slow).start();
        }, fire.landsAtMs)
      : undefined;
    return () => {
      lighting.stop();
      clearTimeout(over);
      clearTimeout(lands);
    };
    // once, as it opens
  }, []);

  // faint until it lights, brightening as it squashes; under Reduce Motion only brightening, the warm light cross-fading in
  const { pop, dim } = FLAME_IGNITE;
  const bright = lit.interpolate({ inputRange: [0, plan.travel ? pop[1].at : 1], outputRange: [dim, 1], extrapolate: 'clamp' });
  const squash = plan.travel
    ? [
        { scaleX: lit.interpolate({ inputRange: pop.map((p) => p.at), outputRange: pop.map((p) => p.sx) }) },
        { scaleY: lit.interpolate({ inputRange: pop.map((p) => p.at), outputRange: pop.map((p) => p.sy) }) },
      ]
    : [];
  const warm = flood.interpolate({ inputRange: [0, plan.travel ? 0.15 : 1], outputRange: [0, 1], extrapolate: 'clamp' });
  const spread = plan.travel ? flood.interpolate({ inputRange: [0, 1], outputRange: [0.04, 1] }) : 1;
  const roll = lit.interpolate({ inputRange: [0, 0.6], outputRange: [0, 1], easing: Easing.out(Easing.cubic), extrapolate: 'clamp' });
  const rise = plan.travel ? line.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) : 0;

  return (
    <Pressable
      onPress={() => {
        moment.skip();
        // skipped before it landed: the day it grew is still felt
        if (fire.grew) feelGrowth();
        onDone();
      }}
      accessibilityRole="button"
      accessibilityLabel={said}
      accessibilityHint={t('common.continue')}
      style={styles.screen}
      testID="lesson-streak-flame"
    >
      <Light width={width} height={height} tone="dim" />
      <View style={styles.flameMiddle}>
        <View style={[styles.flameStage, stage]}>
          {/* the warm light, flooding out from the fire over the whole screen as it lights, and staying */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.flood,
              {
                left: stage.width / 2 - width * FLOOD,
                top: stage.height / 2 - height * FLOOD,
                width: width * FLOOD * 2,
                height: height * FLOOD * 2,
                opacity: warm,
                transform: [{ scale: spread }],
              },
            ]}
            testID="lesson-streak-flood"
          >
            <Light width={width * FLOOD * 2} height={height * FLOOD * 2} tone="warm" />
          </Animated.View>
          {/* the glow round the fire, in a box of its own size centred on it: a young fire's frame is smaller than its glow */}
          <Animated.View
            style={{ position: 'absolute', left: stage.width / 2 - GLOW / 2, top: stage.height / 2 - GLOW / 2, width: GLOW, height: GLOW, opacity: warm }}
            pointerEvents="none"
          >
            <SoftGlow colour={colors.gold} size={GLOW} id="streak-glow" />
          </Animated.View>
          {plan.travel ? <GlowRing progress={moment.ring} colour={colors.gold} size={RING} testID="lesson-streak-ring" /> : null}
          {plan.travel ? (
            <ConfettiBurst
              progress={moment.burst}
              count={BURST.lesson}
              seed={day * 17 + 5}
              colours={[colors.gold, '#FFE16A', '#FF9A3C', '#FFFFFF']}
              reach={Math.max(RING * 0.85, Math.max(stage.width, stage.height) * 0.6)}
              testID="lesson-streak-sparks"
            />
          ) : null}
          <Animated.View style={{ opacity: bright, transformOrigin: 'bottom', transform: squash }} testID="lesson-streak-fire">
            <Fire size={size} level={fire.level} from={fire.from} framed />
          </Animated.View>
        </View>
        <Animated.View style={{ opacity: bright }}>
          <RollingNumber from={day - 1} to={day} progress={roll} travel={plan.travel} size={NUMBER} colour={ink} />
        </Animated.View>
        <Animated.Text style={[styles.flameUnit, { color: ink, opacity: moment.details }]}>{t(unitFor(day))}</Animated.Text>
        {/* what the fire grew into, in its place from the start so nothing moves when it arrives */}
        {grewWords ? (
          <Animated.Text style={[styles.grew, { color: ink, opacity: line, transform: [{ translateY: rise }] }]} testID="lesson-streak-grew">
            {grewWords}
          </Animated.Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** How far the warm light reaches round the fire, as a share of the screen either way: past every edge, its soft rim never seen once it has flooded. */
const FLOOD = 1.25;

/**
 * The light behind the moment. Warm once the fire has lit: the sun's gold at
 * the edges, softening to a pale glow in the middle on the light page and to
 * an ember on the dark, laid round the fire `FLOOD` times the screen either
 * way, so the screen is only its middle and its rim fades out far past the
 * edges. Dim before it lights: a cool evening grey over the screen.
 */
function Light({ width, height, tone }: { width: number; height: number; tone: 'dim' | 'warm' }): React.JSX.Element {
  const { scheme } = useTheme();
  const id = `streak-${tone}`;
  if (tone === 'dim') {
    const stops = scheme === 'dark' ? ['#222B35', '#161D24', '#0F1419'] : ['#D3DAE2', '#B9C4CF', '#A1AEBC'];
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width={width} height={height}>
          <Defs>
            <RadialGradient id={id} cx="50%" cy="45%" r="75%">
              {stops.map((colour, i) => (
                <Stop key={colour} offset={i / 2} stopColor={colour} />
              ))}
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width={width} height={height} fill={`url(#${id})`} />
        </Svg>
      </View>
    );
  }
  const stops = scheme === 'dark' ? ['#2B1E0B', '#6B4410', '#C98512'] : ['#FFF6DE', '#FFD978', '#EFA312'];
  // the screen's own light, reaching three quarters of the way across it from the fire, in a light FLOOD times as big
  const k = 0.75 / FLOOD;
  return (
    <Svg width={width} height={height}>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={stops[0]} />
          <Stop offset={0.55 * k} stopColor={stops[1]} />
          <Stop offset={k} stopColor={stops[2]} />
          <Stop offset={0.8} stopColor={stops[2]} />
          <Stop offset="1" stopColor={stops[2]} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width={width} height={height} fill={`url(#${id})`} />
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
  progress: Animated.AnimatedInterpolation<number>;
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
  const reduce = useReducedMotion();
  const top = useScreenTopInset();
  const bottom = useScreenBottomInset(spacing.lg);
  const day = Math.max(1, streak.current);
  const level = fireLevel(day);
  const next = nextFireStage(day);
  const speech = streakSpeech(streak);
  const words = t(SPEECH[speech.mood][speech.line], { count: formatNumber(day, locale) });
  const arrive = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  const land = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  // only a server that says what today is, and which days were learned, has a week to show
  const week = streak.today && streak.recent ? streakWeek({ today: streak.today, recent: streak.recent, startsOn: weekStartsOn(locale) }) : null;

  useEffect(() => {
    if (reduce) {
      arrive.setValue(1);
      land.setValue(1);
      return;
    }
    // the card rises into place, and the medal lands on it the way anything earned arrives here
    const run = Animated.parallel([timing(arrive, 1, duration.slow), springTo(land, 1, 'bouncy', 120)]);
    run.start();
    return () => run.stop();
  }, [reduce, arrive, land]);
  const rise = arrive.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });
  const title = `${formatNumber(day, locale)} ${t(unitFor(day))}`;

  return (
    <View style={[styles.screen, { paddingTop: top }]} testID="lesson-streak-day">
      <ScrollView contentContainerStyle={styles.weekBody}>
        {/* a quiet panel with its name at the top, and on it the card, the medal half over the card's top edge */}
        <Animated.View style={[styles.panel, { backgroundColor: colors.controlTrack, opacity: arrive, transform: [{ translateY: rise }] }]}>
          <Text style={[styles.panelName, { color: colors.textSecondary }]}>{t('profile.stat.streak')}</Text>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            {/* a picture beside the words that say it: not read out a second time */}
            <Animated.View
              style={[styles.medal, { opacity: land.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }), transform: [{ scale: land.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              testID="streak-medal"
            >
              <StreakMedal size={MEDAL} label="" />
            </Animated.View>
            <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header" maxFontSizeMultiplier={1.3}>
              {title}
            </Text>
            <Text style={[styles.cheer, { color: colors.textSecondary }]}>{words}</Text>
            {week ? <WeekRow week={week} travel={!reduce} /> : null}
          </View>
        </Animated.View>
        {/* the fire's stage, and the next as a near goal: never a countdown, and at the Newroz fire simply its name */}
        {level.stage !== 'cold' ? (
          <Text style={[styles.stage, { color: colors.textSecondary }]} testID="streak-stage">
            <Text style={[styles.stageName, { color: colors.textPrimary }]}>{t(FIRE_STAGE_NAME[level.stage])}</Text>
            {next && next.stage !== 'cold' && next.stage !== 'spark' ? ` · ${t(FIRE_NEXT[next.stage], { count: formatNumber(next.at, locale) })}` : null}
          </Text>
        ) : null}
        <FreezeLine streak={streak} />
      </ScrollView>
      <View style={[styles.bar, { paddingBottom: bottom }]}>
        <ClayButton label={t(goalDone ? 'lesson.streak.seeYou' : 'common.continue')} tone="primary" size="large" onPress={onContinue} />
      </View>
    </View>
  );
}

/**
 * The week the streak was kept in: the days' initials over seven places,
 * from the day the learner's week starts on (Saturday in Kurdish and Arabic).
 * A day learned wears a small gold medal with the laurel, one a freeze kept an
 * ice-blue one with a snowflake; a day still to come is its date, and so is
 * one that went by without a lesson, more quietly — never a cross. Today,
 * still to learn, is its date in a gold ring. A sign for each, never the
 * colour alone. They arrive one after another and today's pops in last.
 */
function WeekRow({ week, travel }: { week: WeekDay[]; travel: boolean }): React.JSX.Element {
  const { colors } = useTheme();
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
    <View style={[styles.week, { flexDirection: dir.row }]} accessible accessibilityLabel={summary} testID="streak-week">
      {week.map((d) => {
        const at = d.isToday ? others : order++;
        return (
          <View key={d.date} style={styles.dayColumn} testID={`week-${d.date}`}>
            <Text style={[styles.dayName, { color: d.isToday ? colors.textPrimary : colors.textSecondary }, d.isToday && styles.dayNameToday]} maxFontSizeMultiplier={1.3}>
              {initials[d.weekday] ?? ''}
            </Text>
            <DayMark day={d} delayMs={at * DAY_STAGGER_MS + (d.isToday ? STREAK_DAY_TIMING.countAtMs : 0)} travel={travel} />
          </View>
        );
      })}
    </View>
  );
}

/** One day's place in the week: its medal, or its date. */
function DayMark({ day, delayMs, travel }: { day: WeekDay; delayMs: number; travel: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  const { locale } = useI18n();
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
  const scale = day.isToday && travel ? pop.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) : 1;
  const medal = day.state === 'learned' || day.state === 'frozen' ? day.state : null;
  // the day of the month, from the date as the server wrote it: no time zone moves it
  const date = Number(day.date.slice(8, 10));
  return (
    <Animated.View
      style={[styles.day, day.state === 'today' ? [styles.dayRing, { borderColor: colors.gold }] : null, { opacity: pop, transform: [{ scale }] }]}
      testID={`day-${day.state}`}
    >
      {medal ? (
        <DayMedalArt kind={medal} size={DAY} label="" />
      ) : (
        <Text style={[styles.dayDate, { color: day.state === 'missed' ? colors.textSecondary : colors.textPrimary }, day.state === 'missed' && styles.dayGone]} maxFontSizeMultiplier={1.2}>
          {formatNumber(date, locale)}
        </Text>
      )}
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
    const run = timing(fill, share, STREAK_DAY_TIMING.freezeMs, { delay: STREAK_DAY_TIMING.freezeAtMs });
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
  flood: { position: 'absolute' },
  flameUnit: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, marginTop: -spacing.xs },
  // narrow enough that a sentence wraps into two lines of a size, rather than a full one and a word left over
  grew: { maxWidth: 320, fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, lineHeight: 26, textAlign: 'center', marginTop: spacing.md, paddingHorizontal: layout.gutter },
  rolling: { flexDirection: 'row', justifyContent: 'center' },
  leaving: { position: 'absolute', top: 0, left: 0, right: 0, textAlign: 'center' },
  weekBody: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: layout.gutter, paddingVertical: spacing.md, gap: spacing.md, maxWidth: layout.column, width: '100%', alignSelf: 'center' },
  // the panel leaves the medal its room above the card
  panel: { borderRadius: radii.xl, paddingTop: spacing.md + 4, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
  panelName: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, textAlign: 'center', marginBottom: MEDAL / 2 + spacing.sm },
  card: { alignItems: 'center', gap: spacing.xs + 2, borderRadius: radii.lg, paddingTop: MEDAL / 2 + spacing.sm, paddingBottom: spacing.md + 4, paddingHorizontal: spacing.sm },
  // half over the card's top edge
  medal: { position: 'absolute', top: -MEDAL / 2, alignSelf: 'center' },
  title: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, textAlign: 'center', letterSpacing: -0.4 },
  cheer: { fontSize: typography.sizes.md, lineHeight: 23, textAlign: 'center', paddingHorizontal: spacing.sm },
  stage: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, textAlign: 'center' },
  stageName: { fontWeight: typography.weights.bold },
  week: { alignSelf: 'stretch', justifyContent: 'space-between', marginTop: spacing.md },
  dayColumn: { flex: 1, alignItems: 'center', gap: spacing.sm },
  dayName: { fontSize: typography.sizes.xs, fontWeight: typography.weights.medium },
  dayNameToday: { fontWeight: typography.weights.bold },
  day: { width: DAY, height: DAY, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  // today, still to learn: its date in a ring
  dayRing: { borderWidth: 2 },
  dayDate: { fontSize: typography.sizes.md + 1, fontWeight: typography.weights.semibold, fontVariant: ['tabular-nums'] },
  dayGone: { opacity: 0.7 },
  freeze: { alignSelf: 'stretch', gap: spacing.sm },
  freezeHead: { alignItems: 'center', gap: spacing.sm },
  freezeText: { flex: 1, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  track: { height: 10, borderRadius: radii.pill, overflow: 'hidden' },
  fill: { width: '100%', height: '100%', borderRadius: radii.pill },
  bar: { paddingHorizontal: layout.gutter, paddingTop: spacing.sm },
});
