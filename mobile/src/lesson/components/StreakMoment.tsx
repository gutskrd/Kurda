import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type TextStyle } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import {
  FIRE_VIEW,
  FLAME_IGNITE,
  STREAK_LEAVE_MS,
  STREAK_LEAVE_POSE,
  fireFrame,
  fireLevel,
  fireSizeToFit,
  flameMoment,
  freezeLine,
  nextFireStage,
  smoothPoses,
  streakReveal,
  streakSpeech,
  streakWeek,
  weekStartsOn,
  type StreakMood,
  type StreakReveal,
  type WeekDay,
} from '@kurda/shared';
import { useMotionAlive } from '../../a11y/useMotionAlive';
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
import { timing } from '../../theme/animate';
import { BURST } from '../../theme/celebration';
import { ConfettiBurst, GlowRing, SoftGlow, useCelebration } from '../../theme/CelebrationParts';
import { Fire } from '../../theme/Fire';
import { display } from '../../theme/fonts';
import { ClayButton } from '../../theme/glass';
import { Icon } from '../../theme/Icon';
import { duration, easeOut } from '../../theme/motion';
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
/** The streak's medal, which stands half over the top edge of the streak's card, and the point it squashes onto and hops off: its foot. */
const MEDAL = 132;
const MEDAL_FOOT = '50% 88%';
/** The ring that bursts out of the medal as it turns to gold, the light behind it for that moment, and how far its flecks fly. */
const MEDAL_RING = 150;
const MEDAL_GLOW = 240;
const MEDAL_REACH = 120;
/** A day of the week: its medal or its date. */
const DAY = 36;
/** How long the number takes to roll on, the streak's words to take their full ink, today's medal to pop in and the card to open. */
const ROLL_MS = 480;
const INK_MS = 260;
const DAY_POP_MS = 520;
const OPEN_MS = 240;
/** How quiet the streak's words are while they are still yesterday's. */
const YESTERDAY_INK = 0.45;
/** How long after what stands under the card arrives the freeze bar starts to fill. */
const FREEZE_AFTER_MS = 260;
/** The lit medal's slow ride up and down, and the sparks that rise off it now and then: how long each takes, and where each spark goes. */
const FLOAT_MS = 3400;
const FLOAT_RISE = 3;
const SPARK_MS = 2600;
const SPARK_RISE = 46;
const SPARKS = [
  { dx: -34, size: 5, afterMs: 200 },
  { dx: 30, size: 4, afterMs: 1100 },
  { dx: 6, size: 3, afterMs: 1900 },
] as const;

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
 * On the day the fire grew (shared `flameMoment`) the flame comes first, on
 * a screen of its own. It opens dim and cool on yesterday, the fire as it was
 * and yesterday's number, and then the fire lights (shared `FLAME_IGNITE`):
 * it squashes and pops up, a ring of gold bursts out of it, the warm light
 * floods out from it over the screen, a few sparks fly, the day's number
 * rolls on to today's, and the pop leaps on up into the fire's new stage,
 * felt and heard as that lands, with a line under the day saying what it grew
 * into. It stays until the line has been read; a tap moves on sooner.
 *
 * Then, and on every other day straight away, the streak itself, on one
 * card: the streak's medal standing half over its top edge, the streak in
 * words, a few words from Hevalo about the day (a first day, a comeback, a
 * longest run yet, or another day) and the week, each day a small medal if it
 * was learned and its date if it is still to come. Under the card are the
 * fire's stage with the next one and how near the next freeze is, and one
 * button — "See you tomorrow" once today's goal is done.
 *
 * The card comes alive as it opens (shared `streakReveal`): it opens on
 * yesterday, the medal grey and the number as it was; the medal gathers
 * itself, hops, turns to gold as the app's one celebration bursts out of it,
 * and lands as the number rolls on to today's; then the word, the week day
 * by day, what stands under the card and the way on arrive in turn. A tap on
 * the card finishes it at once. Leaving, its words fade and the medal gathers
 * itself and is gone.
 *
 * The week needs the learner's own today and recent days from the server; an
 * older server sends neither, and then the week is left out rather than
 * guessed. No countdown, nothing about losing it: a kept day is said as what
 * it is. Under Reduce Motion it all fades and nothing travels: the dim screen
 * cross-fades to the warm one, the grey medal to the gold one, and the rest
 * is simply there.
 */
export function StreakMoment({ streak, goalDone, onContinue }: { streak: Streak; goalDone: boolean; onContinue: () => void }): React.JSX.Element {
  // the flame is for the day the fire grew; on any other day the card is the whole of the moment
  const [grew] = useState(() => flameMoment(Math.max(1, streak.current)).grew !== null);
  const [phase, setPhase] = useState<'flame' | 'week'>(grew ? 'flame' : 'week');
  return phase === 'flame' ? (
    <FlameMoment streak={streak} onDone={() => setPhase('week')} />
  ) : (
    <StreakWeekScreen streak={streak} goalDone={goalDone} afterFlame={grew} onContinue={onContinue} />
  );
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
          <RollingNumber from={day - 1} to={day} progress={roll} travel={plan.travel} text={display(NUMBER)} colour={ink} />
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
 * `progress` (0 → 1); under Reduce Motion the two cross-fade instead. `text`
 * is how it is written, and `maxScale` how far the reader's own text size may
 * enlarge it — the room each digit rolls in grows with it.
 */
function RollingNumber({
  from,
  to,
  progress,
  travel,
  text,
  colour,
  maxScale = 1,
}: {
  from: number;
  to: number;
  progress: Animated.AnimatedInterpolation<number>;
  travel: boolean;
  text: TextStyle;
  colour: string;
  maxScale?: number;
}): React.JSX.Element {
  const { locale } = useI18n();
  const { fontScale } = useWindowDimensions();
  const style: TextStyle = { ...text, color: colour, fontVariant: ['tabular-nums'] };
  const line = (style.lineHeight ?? style.fontSize ?? 0) * Math.min(maxScale, fontScale);
  const before = formatNumber(Math.max(0, from), locale);
  const after = formatNumber(to, locale);
  const width = Math.max(before.length, after.length);
  const old = before.padStart(width, ' ');
  const now = after.padStart(width, ' ');
  return (
    <View style={styles.rolling} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from(now).map((digit, i) =>
        old[i] === digit ? (
          <Text key={i} style={style} maxFontSizeMultiplier={maxScale}>
            {digit}
          </Text>
        ) : (
          <View key={i} style={{ height: line, overflow: 'hidden' }}>
            <Animated.Text
              style={[style, { opacity: progress, transform: [{ translateY: travel ? progress.interpolate({ inputRange: [0, 1], outputRange: [line, 0] }) : 0 }] }]}
              maxFontSizeMultiplier={maxScale}
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
              maxFontSizeMultiplier={maxScale}
            >
              {old[i]!.trim()}
            </Animated.Text>
          </View>
        ),
      )}
    </View>
  );
}

/** A part of the card on the card's clock: a value that follows the clock's own, or a number where nothing moves. */
type Clocked = Animated.AnimatedInterpolation<number> | number;

/** An ease-out that goes a little past where it is going and settles back, as the website's spring curve does. */
function settleOut(t: number): number {
  const k = Math.max(0, Math.min(1, t)) - 1;
  return 1 + 2.4 * k * k * k + 1.4 * k * k;
}

/**
 * A part of the card arriving on the card's clock: 0 until `at`, 1 from `ms`
 * later, and eased in between. Drawn as a few straight pieces, because the
 * native driver joins the points of an interpolation with straight lines.
 */
function arriving(clock: Animated.Value, at: number, ms: number, curve: (t: number) => number = easeOut): Animated.AnimatedInterpolation<number> {
  const steps = 6;
  const inputRange = Array.from({ length: steps + 1 }, (_, k) => at + (ms * k) / steps);
  return clock.interpolate({ inputRange, outputRange: inputRange.map((_, k) => curve(k / steps)), extrapolate: 'clamp' });
}

/** Up a few points and into place, for a part that is `arriving`; where it is, where nothing travels. */
function risen(arrival: Clocked): Clocked {
  return typeof arrival === 'number' ? 0 : arrival.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });
}

/**
 * The card's parts, each read off one clock that runs from when the card
 * opens to when everything stands still (shared `streakReveal`). One clock,
 * on the native driver: the whole of it plays while the JS thread is busy,
 * and finishing it early is one `setValue`.
 */
function useReveal(plan: StreakReveal, clock: Animated.Value) {
  return useMemo(() => {
    const { travel } = plan;
    const after = (at: number, ms: number = duration.slow): Clocked => (travel ? arriving(clock, at, ms) : 1);
    const track = smoothPoses(plan.poses);
    const when = track.map((p) => plan.medalAtMs + p.at * plan.medalMs);
    const pose = (of: (p: (typeof track)[number]) => number): Animated.AnimatedInterpolation<number> =>
      clock.interpolate({ inputRange: when, outputRange: track.map(of), extrapolate: 'clamp' });
    return {
      /** the card itself, as the screen opens */
      open: after(0, OPEN_MS),
      /** the medal's turn about its foot: gathered, off the card, and down again */
      turn: travel ? [{ translateY: pose((p) => p.lift * MEDAL) }, { scaleX: pose((p) => p.sx) }, { scaleY: pose((p) => p.sy) }] : [],
      /** the gold medal over the grey one */
      lit: clock.interpolate({ inputRange: [plan.lightAtMs, plan.lightAtMs + plan.lightMs], outputRange: [0, 1], extrapolate: 'clamp' }),
      /** the light of the burst: there as the medal turns to gold, and gone again, so the card under it stays clean */
      glow: travel ? clock.interpolate({ inputRange: [plan.burstAtMs, plan.burstAtMs + 200, plan.burstAtMs + 900], outputRange: [0, 1, 0], extrapolate: 'clamp' }) : 0,
      /** the streak's words taking their full ink, and its number rolling on */
      ink: clock.interpolate({ inputRange: [plan.countAtMs, plan.countAtMs + INK_MS], outputRange: [YESTERDAY_INK, 1], extrapolate: 'clamp' }),
      roll: travel
        ? arriving(clock, plan.countAtMs, ROLL_MS, settleOut)
        : clock.interpolate({ inputRange: [plan.countAtMs, plan.overMs], outputRange: [0, 1], extrapolate: 'clamp' }),
      words: after(plan.wordsAtMs),
      dayNames: after(plan.weekAtMs),
      /** one day of the week, the `order`-th to arrive: it grows into its place, and today's pops */
      day: (order: number, pops: boolean): { opacity: Clocked; scale: Clocked } => {
        if (!travel) return { opacity: 1, scale: 1 };
        const at = plan.weekAtMs + order * plan.dayStepMs;
        if (!pops) {
          const grow = arriving(clock, at, duration.slow, settleOut);
          return { opacity: arriving(clock, at, duration.base), scale: grow.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) };
        }
        return {
          opacity: arriving(clock, at, DAY_POP_MS * 0.4),
          scale: clock.interpolate({
            inputRange: [0, 0.3, 0.6, 0.8, 1].map((k) => at + k * DAY_POP_MS),
            outputRange: [0.3, 0.86, 1.18, 1.05, 1],
            extrapolate: 'clamp',
          }),
        };
      },
      under: after(plan.afterAtMs),
      freeze: after(plan.afterAtMs + FREEZE_AFTER_MS, duration.progress),
      onward: after(plan.onwardAtMs),
    };
  }, [plan, clock]);
}

function StreakWeekScreen({
  streak,
  goalDone,
  afterFlame,
  onContinue,
}: {
  streak: Streak;
  goalDone: boolean;
  /** the flame played before this (the day the fire grew): the number has rolled and the moment been felt and heard already */
  afterFlame: boolean;
  onContinue: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const reduce = useReducedMotion();
  const alive = useMotionAlive();
  const top = useScreenTopInset();
  const bottom = useScreenBottomInset(spacing.lg);
  const day = Math.max(1, streak.current);
  const level = fireLevel(day);
  const next = nextFireStage(day);
  const speech = streakSpeech(streak);
  const words = t(SPEECH[speech.mood][speech.line], { count: formatNumber(day, locale) });
  const plan = useMemo(() => streakReveal(reduce), [reduce]);
  // the app's one celebration, bursting out of the medal as it turns to gold: felt and heard there, once
  const moment = useCelebration({ sound: 'reward', feel: !afterFlame, delayMs: plan.burstAtMs });
  const clock = useRef(new Animated.Value(0)).current;
  const leave = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;
  const playing = useRef<Animated.CompositeAnimation | null>(null);
  const going = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [settled, setSettled] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const show = useReveal(plan, clock);
  // a badge earned meanwhile waits until the card has had its moment
  useCelebrationHold(!settled);
  // only a server that says what today is, and which days were learned, has a week to show
  const week = streak.today && streak.recent ? streakWeek({ today: streak.today, recent: streak.recent, startsOn: weekStartsOn(locale) }) : null;
  const unit = t(unitFor(day));
  const title = `${formatNumber(day, locale)} ${unit}`;

  useEffect(() => {
    // the flame said the day already, where there was one
    if (!afterFlame) AccessibilityInfo.announceForAccessibility?.(title);
    // once, as it opens
  }, []);

  useEffect(() => {
    clock.setValue(0);
    const run = Animated.timing(clock, { toValue: plan.overMs, duration: plan.overMs, easing: Easing.linear, useNativeDriver: true });
    playing.current = run;
    run.start(({ finished }) => {
      if (finished) setSettled(true);
    });
    return () => run.stop();
    // the Reduce Motion answer can arrive a moment late; then it simply plays again, as a fade
  }, [plan, clock]);

  // lit and landed, it is never quite still: it rides up and down a little, while there is somebody to see it
  useEffect(() => {
    if (!settled || leaving || !alive || !plan.travel) return;
    const half = { duration: FLOAT_MS / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true };
    const ride = Animated.loop(Animated.sequence([Animated.timing(float, { toValue: 1, ...half }), Animated.timing(float, { toValue: 0, ...half })]));
    ride.start();
    return () => ride.stop();
  }, [settled, leaving, alive, plan, float]);

  useEffect(
    () => () => {
      if (going.current) clearTimeout(going.current);
    },
    [],
  );

  /** A tap on the card while it plays: everything where it ends, at once. */
  const finish = useCallback(() => {
    if (settled) return;
    playing.current?.stop();
    clock.setValue(plan.overMs);
    moment.skip();
    setSettled(true);
  }, [settled, clock, plan, moment]);

  /** The way on: the card's words go and the medal gathers itself and is gone, and then on. */
  const onward = useCallback(() => {
    if (going.current) return;
    if (!plan.travel) {
      onContinue();
      return;
    }
    finish();
    setLeaving(true);
    timing(leave, 1, STREAK_LEAVE_MS, { easing: Easing.in(Easing.quad) }).start();
    going.current = setTimeout(onContinue, STREAK_LEAVE_MS);
  }, [plan, finish, leave, onContinue]);

  const stay = leave.interpolate({ inputRange: [0, 0.8], outputRange: [1, 0], extrapolate: 'clamp' });
  const gather = [
    { scaleX: leave.interpolate({ inputRange: [0, 1], outputRange: [1, STREAK_LEAVE_POSE.sx * STREAK_LEAVE_POSE.scale] }) },
    { scaleY: leave.interpolate({ inputRange: [0, 1], outputRange: [1, STREAK_LEAVE_POSE.sy * STREAK_LEAVE_POSE.scale] }) },
  ];
  const titleText = StyleSheet.flatten(styles.title);

  return (
    <View style={[styles.screen, { paddingTop: top }]} testID="lesson-streak-day">
      <ScrollView contentContainerStyle={styles.weekBody}>
        {/* a tap anywhere on it finishes it; nothing to a screen reader, which is read the card as it will stand */}
        <Pressable onPress={finish} accessible={false} focusable={false} style={styles.weekTap} testID="streak-card">
          {/* a quiet panel with its name at the top, and on it the card, the medal half over the card's top edge */}
          <Animated.View style={[styles.panel, { backgroundColor: colors.controlTrack, opacity: show.open, transform: [{ translateY: risen(show.open) }] }]}>
            <Animated.Text style={[styles.panelName, { color: colors.textSecondary, opacity: stay }]}>{t('profile.stat.streak')}</Animated.Text>
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              {/* a picture beside the words that say it: not read out a second time */}
              <View style={styles.medal} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="streak-medal">
                <Animated.View style={[styles.medalGlow, { opacity: show.glow }]} pointerEvents="none">
                  <SoftGlow colour={colors.gold} size={MEDAL_GLOW} id="streak-medal-glow" />
                </Animated.View>
                {plan.travel ? <GlowRing progress={moment.ring} colour={colors.gold} size={MEDAL_RING} testID="streak-medal-ring" /> : null}
                {plan.travel ? (
                  <ConfettiBurst
                    progress={moment.burst}
                    count={BURST.lesson}
                    seed={day * 11 + 7}
                    colours={[colors.gold, '#FFE16A', '#FF9A3C', '#FFFFFF']}
                    reach={MEDAL_REACH}
                    testID="streak-medal-flecks"
                  />
                ) : null}
                <Animated.View style={{ transform: [{ translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -FLOAT_RISE] }) }] }}>
                  <Animated.View style={{ opacity: leave.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transformOrigin: MEDAL_FOOT, transform: gather }}>
                    <Animated.View style={{ transformOrigin: MEDAL_FOOT, transform: show.turn }} testID="streak-medal-turn">
                      {/* yesterday's, in grey, and today's over it: one medal changing colour */}
                      <StreakMedal size={MEDAL} label="" unlit />
                      <Animated.View style={[StyleSheet.absoluteFill, { opacity: show.lit }]} testID="streak-medal-lit">
                        <StreakMedal size={MEDAL} label="" />
                      </Animated.View>
                    </Animated.View>
                  </Animated.View>
                </Animated.View>
                {plan.travel && !leaving ? SPARKS.map((spark) => <Spark key={spark.dx} {...spark} startMs={plan.countAtMs} colour={colors.gold} />) : null}
              </View>
              <Animated.View style={[styles.cardWords, { opacity: stay }]}>
                {/* the streak in words, its number on its own so that it can roll on: quiet while it is yesterday's */}
                <Animated.View style={[styles.titleRow, { flexDirection: dir.row, opacity: show.ink }]} accessible accessibilityRole="header" accessibilityLabel={title}>
                  <RollingNumber from={afterFlame ? day : day - 1} to={day} progress={show.roll} travel={plan.travel} text={titleText} colour={colors.textPrimary} maxScale={1.3} />
                  <Text style={[styles.title, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3}>
                    {unit}
                  </Text>
                </Animated.View>
                <Animated.Text style={[styles.cheer, { color: colors.textSecondary, opacity: show.words, transform: [{ translateY: risen(show.words) }] }]} testID="streak-cheer">
                  {words}
                </Animated.Text>
                {week ? <WeekRow week={week} names={show.dayNames} day={show.day} /> : null}
              </Animated.View>
            </View>
          </Animated.View>
          <Animated.View style={[styles.under, { opacity: stay }]}>
            <Animated.View style={[styles.under, { opacity: show.under, transform: [{ translateY: risen(show.under) }] }]}>
              {/* the fire's stage, and the next as a near goal: never a countdown, and at the Newroz fire simply its name */}
              {level.stage !== 'cold' ? (
                <Text style={[styles.stage, { color: colors.textSecondary }]} testID="streak-stage">
                  <Text style={[styles.stageName, { color: colors.textPrimary }]}>{t(FIRE_STAGE_NAME[level.stage])}</Text>
                  {next && next.stage !== 'cold' && next.stage !== 'spark' ? ` · ${t(FIRE_NEXT[next.stage], { count: formatNumber(next.at, locale) })}` : null}
                </Text>
              ) : null}
              <FreezeLine streak={streak} filled={show.freeze} />
            </Animated.View>
          </Animated.View>
        </Pressable>
      </ScrollView>
      {/* the way on: the last thing to arrive, and answering from the first frame */}
      <Animated.View style={[styles.bar, { paddingBottom: bottom, opacity: show.onward, transform: [{ translateY: risen(show.onward) }] }]} testID="streak-onward">
        <ClayButton label={t(goalDone ? 'lesson.streak.seeYou' : 'common.continue')} tone="primary" size="large" onPress={onward} />
      </Animated.View>
    </View>
  );
}

/**
 * A spark rising off the lit medal now and then, the way one rises off a
 * fire: up, out to its side, and gone. It waits `afterMs` past `startMs` (the
 * medal is gold by then) and comes round again for as long as the screen is
 * the one in front.
 */
function Spark({ dx, size, afterMs, startMs, colour }: { dx: number; size: number; afterMs: number; startMs: number; colour: string }): React.JSX.Element {
  const alive = useMotionAlive();
  const rise = useRef(new Animated.Value(0)).current;
  const since = useRef(Date.now()).current;
  useEffect(() => {
    if (!alive) return;
    const loop = Animated.loop(Animated.timing(rise, { toValue: 1, duration: SPARK_MS, easing: Easing.linear, useNativeDriver: true }));
    // the first only once the medal has lit; back in front later, at its own beat straight away
    const wait = setTimeout(() => loop.start(), Math.max(afterMs % 900, startMs + afterMs - (Date.now() - since)));
    return () => {
      clearTimeout(wait);
      loop.stop();
      rise.setValue(0);
    };
  }, [alive, rise, afterMs, startMs, since]);
  // quick off the medal and slowing as it climbs, then nothing until it comes round again
  const climb = [0, 0.15, 0.3, 0.6, 1];
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.spark,
        {
          width: size,
          height: size,
          marginLeft: -size / 2,
          backgroundColor: colour,
          opacity: rise.interpolate({ inputRange: [0, 0.12, 0.6, 1], outputRange: [0, 0.9, 0, 0] }),
          transform: [
            { translateX: rise.interpolate({ inputRange: climb, outputRange: [dx * 0.6, dx * 0.8, dx * 0.9, dx, dx] }) },
            { translateY: rise.interpolate({ inputRange: climb, outputRange: [0, -SPARK_RISE * 0.5, -SPARK_RISE * 0.78, -SPARK_RISE, -SPARK_RISE] }) },
            { scale: rise.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.6, 1, 1] }) },
          ],
        },
      ]}
    />
  );
}

/**
 * The week the streak was kept in: the days' initials over seven places,
 * from the day the learner's week starts on (Saturday in Kurdish and Arabic).
 * A day learned wears a small gold medal with the laurel, one a freeze kept an
 * ice-blue one with a snowflake; a day still to come is its date, and so is
 * one that went by without a lesson, more quietly — never a cross. Today,
 * still to learn, is its date in a gold ring. A sign for each, never the
 * colour alone. They arrive one after another (`day`, by the order each has)
 * and today's pops in last.
 */
function WeekRow({ week, names, day }: { week: WeekDay[]; names: Clocked; day: (order: number, pops: boolean) => { opacity: Clocked; scale: Clocked } }): React.JSX.Element {
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
  return (
    <View style={[styles.week, { flexDirection: dir.row }]} accessible accessibilityLabel={summary} testID="streak-week">
      {week.map((d, i) => (
        <View key={d.date} style={styles.dayColumn} testID={`week-${d.date}`}>
          <Animated.Text
            style={[styles.dayName, { color: d.isToday ? colors.textPrimary : colors.textSecondary, opacity: names }, d.isToday && styles.dayNameToday]}
            maxFontSizeMultiplier={1.3}
          >
            {initials[d.weekday] ?? ''}
          </Animated.Text>
          {/* in the order they stand, and today's after the whole week */}
          <DayMark day={d} arrival={day(d.isToday ? week.length : i, d.isToday)} />
        </View>
      ))}
    </View>
  );
}

/** One day's place in the week: its medal, or its date. */
function DayMark({ day, arrival }: { day: WeekDay; arrival: { opacity: Clocked; scale: Clocked } }): React.JSX.Element {
  const { colors } = useTheme();
  const { locale } = useI18n();
  const medal = day.state === 'learned' || day.state === 'frozen' ? day.state : null;
  // the day of the month, from the date as the server wrote it: no time zone moves it
  const date = Number(day.date.slice(8, 10));
  return (
    <Animated.View
      style={[styles.day, day.state === 'today' ? [styles.dayRing, { borderColor: colors.gold }] : null, { opacity: arrival.opacity, transform: [{ scale: arrival.scale }] }]}
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

/**
 * How near the next freeze is, or how many are saved: the line the "Day N"
 * card had, under the week. `filled` is how far its bar has got in filling to
 * where it now stands, on the card's clock.
 */
function FreezeLine({ streak, filled }: { streak: Streak; filled: Clocked }): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const freeze = freezeLine(streak);
  const share = freeze?.kind === 'toward' ? freeze.done / freeze.per : 1;
  const [width, setWidth] = useState(0);
  if (!freeze) return null;
  // the bar slides in from the reading side, as every bar's fill does
  const away = dir.rtl ? width : -width;
  const translateX = typeof filled === 'number' ? away * (1 - share * filled) : filled.interpolate({ inputRange: [0, 1], outputRange: [away, away * (1 - share)] });
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
  weekBody: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: layout.gutter, paddingVertical: spacing.md, maxWidth: layout.column, width: '100%', alignSelf: 'center' },
  weekTap: { gap: spacing.md },
  // the panel leaves the medal its room above the card
  panel: { borderRadius: radii.xl, paddingTop: spacing.md + 4, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
  panelName: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, textAlign: 'center', marginBottom: MEDAL / 2 + spacing.sm },
  card: { alignItems: 'center', borderRadius: radii.lg, paddingTop: MEDAL / 2 + spacing.sm, paddingBottom: spacing.md + 4, paddingHorizontal: spacing.sm },
  cardWords: { alignSelf: 'stretch', alignItems: 'center', gap: spacing.xs + 2 },
  // half over the card's top edge
  medal: { position: 'absolute', top: -MEDAL / 2, alignSelf: 'center', width: MEDAL, height: MEDAL },
  // the burst's light, centred on the medal and wider than it
  medalGlow: { position: 'absolute', left: (MEDAL - MEDAL_GLOW) / 2, top: (MEDAL - MEDAL_GLOW) / 2, width: MEDAL_GLOW, height: MEDAL_GLOW },
  // a spark starts in the laurel, a little above the medal's middle
  spark: { position: 'absolute', top: '26%', left: '50%', borderRadius: radii.pill },
  // the number and its words on one line, a space apart
  titleRow: { alignItems: 'flex-end', justifyContent: 'center', columnGap: 7, flexWrap: 'wrap' },
  title: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, lineHeight: 34, textAlign: 'center', letterSpacing: -0.4 },
  cheer: { fontSize: typography.sizes.md, lineHeight: 23, textAlign: 'center', paddingHorizontal: spacing.sm },
  under: { gap: spacing.md },
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
