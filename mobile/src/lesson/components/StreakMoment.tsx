import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, ScrollView, StyleSheet, Text, View, useWindowDimensions, type TextStyle } from 'react-native';
import { Pressable } from '../../theme/Pressable';
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
  streakMilestone,
  streakReveal,
  reactionDelayMs,
  streakMoment,
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
import { sayReactionLater } from '../../characters/reactions';
import { useI18n } from '../../i18n/I18nContext';
import { formatNumber } from '../../i18n/format';
import type { TranslationKey } from '../../i18n/translations';
import { useScreenBottomInset, useScreenTopInset } from '../../navigation/tabBarLayout';
import { DayMedalArt, StreakMedal } from '../../ranks/art';
import { useDirection } from '../../reports/direction';
import { ShareWin } from '../../share/ShareWin';
import { streakShare } from '../../share/winText';
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

/** Room the flame screen keeps for the day's number, its words and the line under them; and the fire's maximum size. */
const FLAME_WORDS = 330;
const FLAME_MOST = 400;
/** The ring that bursts from the fire as it lights, and the glow behind it. */
const RING = 168;
const GLOW = RING * 1.6;
/** The day's number on the flame screen. */
const NUMBER = 112;
/** The streak medal, standing half over the card's top edge; it squashes and hops about its foot. */
const MEDAL = 132;
const MEDAL_FOOT = '50% 88%';
/** The ring that bursts from the medal as it turns gold, the light behind it, and how far its flecks fly. */
const MEDAL_RING = 150;
const MEDAL_GLOW = 240;
const MEDAL_REACH = 120;
/** A week day's medal or date. */
const DAY = 36;
/** Durations: the number's roll, the words reaching full ink, today's medal popping in, and the card opening. */
const ROLL_MS = 480;
const INK_MS = 260;
const DAY_POP_MS = 520;
const OPEN_MS = 240;
/** The streak words' opacity while they still show yesterday. */
const YESTERDAY_INK = 0.45;
/** The delay after the content under the card arrives before the freeze bar fills. */
const FREEZE_AFTER_MS = 260;
/** The lit medal's slow float and the occasional sparks off it: durations, and where each spark goes. */
const FLOAT_MS = 3400;
const FLOAT_RISE = 3;
const SPARK_MS = 2600;
const SPARK_RISE = 46;
const SPARKS = [
  { dx: -34, size: 5, afterMs: 200 },
  { dx: 30, size: 4, afterMs: 1100 },
  { dx: 6, size: 3, afterMs: 1900 },
] as const;

/** Hevalo's two lines per kind of day (shared `streakSpeech`). */
const SPEECH: Record<StreakMood, readonly [TranslationKey, TranslationKey]> = {
  start: ['lesson.streak.say.start0', 'lesson.streak.say.start1'],
  comeback: ['lesson.streak.say.comeback0', 'lesson.streak.say.comeback1'],
  best: ['lesson.streak.say.best0', 'lesson.streak.say.best1'],
  ordinary: ['lesson.streak.say.ordinary0', 'lesson.streak.say.ordinary1'],
};

/**
 * The streak kept today, shown after the results of the day's first lesson on the way to whichever way on was
 * chosen.
 *
 * On a day the fire grew (shared `flameMoment`) a flame screen comes first: it opens dim on yesterday's fire and
 * number, then the fire lights (shared `FLAME_IGNITE`) with a gold ring, a flood of warm light and sparks, the number
 * rolls to today's, and the fire grows into its new stage with a haptic and sound, captioned with what it became. It
 * stays until read; a tap moves on sooner.
 *
 * Then, or straight away on other days, one card: the medal half over its top edge, the streak in words, Hevalo's
 * words about the day, and the week as medals for learned days and dates for days to come. Under it, the fire's
 * stage and the next, the freeze progress, and one button. The card animates in (shared `streakReveal`): the grey
 * medal hops and turns gold in the app's one celebration as the number rolls on, then the rest arrives in turn; a tap
 * finishes it at once.
 *
 * The week needs the server's today and recent days, and is left out on an older server. No countdowns or talk of
 * losing it. Under Reduce Motion everything cross-fades and nothing travels. On milestone days (shared
 * `streakMilestone`) a quiet Share appears over the way on.
 */
export function StreakMoment({ streak, goalDone, onContinue }: { streak: Streak; goalDone: boolean; onContinue: () => void }): React.JSX.Element {
  // The flame screen is for the day the fire grew; otherwise the card is the whole moment.
  const [grew] = useState(() => flameMoment(Math.max(1, streak.current)).grew !== null);
  const [phase, setPhase] = useState<'flame' | 'week'>(grew ? 'flame' : 'week');
  return phase === 'flame' ? (
    <FlameMoment streak={streak} onDone={() => setPhase('week')} />
  ) : (
    <StreakWeekScreen streak={streak} goalDone={goalDone} afterFlame={grew} onContinue={onContinue} />
  );
}

/** "day streak", for the number before it. */
function unitFor(n: number): TranslationKey {
  return n === 1 ? 'lesson.streak.unitOne' : 'lesson.streak.unit';
}

function FlameMoment({ streak, onDone }: { streak: Streak; onDone: () => void }): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const { t, locale } = useI18n();
  const { width, height } = useWindowDimensions();
  const day = Math.max(1, streak.current);
  const [fire] = useState(() => flameMoment(day));
  // The one celebration plays as it lights, or on a growth day as the growth lands.
  const moment = useCelebration({ sound: 'reward', feel: !fire.grew, delayMs: FLAME_IGNITE.atMs });
  useCelebrationHold(moment.playing || fire.grew !== null);
  const { plan } = moment;
  const said = `${formatNumber(day, locale)} ${t(unitFor(day))}`;
  const grewWords = fire.grew ? t(FIRE_GREW[fire.grew]) : null;
  const ink = scheme === 'dark' ? colors.gold : colors.textOnGold;
  // As big as the screen allows the biggest fire, the same frame at every stage (a young fire drawn closer).
  const size = Math.min(FLAME_MOST, fireSizeToFit('newroz', width - layout.gutter * 2, height - FLAME_WORDS)) * fire.zoom;
  const frame = fireFrame(fire.level.stage);
  const stage = { width: (frame.w * size) / FIRE_VIEW.h, height: (frame.h * size) / FIRE_VIEW.h };
  // Its lighting (shared FLAME_IGNITE): the pop, the number's roll, and the warm light flooding out.
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
    // Moves on by itself once seen, or once the growth caption is read; a tap goes sooner.
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
    // Only once, as it opens.
  }, []);

  // Faint until it lights, brightening as it squashes; under Reduce Motion only brightening, with the warm light cross-fading.
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
        // Skipped before it landed: the growth is still felt.
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
          {/* The warm light, flooding out from the fire over the whole screen as it lights, and staying. */}
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
          {/* The glow round the fire, in its own box centred on it, since a young fire's frame is smaller than its glow. */}
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
        {/* What the fire grew into, laid out from the start so nothing moves when it appears. */}
        {grewWords ? (
          <Animated.Text style={[styles.grew, { color: ink, opacity: line, transform: [{ translateY: rise }] }]} testID="lesson-streak-grew">
            {grewWords}
          </Animated.Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** How far the warm light reaches round the fire, as a multiple of the screen: past every edge, so its rim never shows. */
const FLOOD = 1.25;

/**
 * The light behind the moment. Warm once lit: the sun's gold at the edges softening to a pale glow (light) or an
 * ember (dark) in the middle, spread `FLOOD` times the screen so its rim fades far past the edges. Dim before:
 * a cool evening grey.
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
  // The screen's own light reaches three quarters across from the fire, within a light FLOOD times as big.
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
 * A number rolling on: each changing digit slides up and away as the new one slides in, the rest stay put. Driven by
 * `progress` (0 → 1); under Reduce Motion the two cross-fade. `maxScale` is how far the reader's text size may
 * enlarge it, which grows each digit's roll room.
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

/** A card part on the card's clock: an animated value, or a plain number where nothing moves. */
type Clocked = Animated.AnimatedInterpolation<number> | number;

/** An ease-out that overshoots slightly and settles back, like the website's spring curve. */
function settleOut(t: number): number {
  const k = Math.max(0, Math.min(1, t)) - 1;
  return 1 + 2.4 * k * k * k + 1.4 * k * k;
}

/**
 * A card part arriving on the card's clock: 0 until `at`, 1 from `ms` later, eased between. Drawn as a few straight
 * pieces, since the native driver interpolates linearly between points.
 */
function arriving(clock: Animated.Value, at: number, ms: number, curve: (t: number) => number = easeOut): Animated.AnimatedInterpolation<number> {
  const steps = 6;
  const inputRange = Array.from({ length: steps + 1 }, (_, k) => at + (ms * k) / steps);
  return clock.interpolate({ inputRange, outputRange: inputRange.map((_, k) => curve(k / steps)), extrapolate: 'clamp' });
}

/** Rises a few points into place for an `arriving` part; stays put where nothing travels. */
function risen(arrival: Clocked): Clocked {
  return typeof arrival === 'number' ? 0 : arrival.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });
}

/**
 * The card's parts, each read off one clock from opening until everything is still (shared `streakReveal`). One
 * native-driver clock plays even while the JS thread is busy, and finishing early is one `setValue`.
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
      /** The card itself, as the screen opens. */
      open: after(0, OPEN_MS),
      /** The medal's motion about its foot: gathering, leaving the card, and landing. */
      turn: travel ? [{ translateY: pose((p) => p.lift * MEDAL) }, { scaleX: pose((p) => p.sx) }, { scaleY: pose((p) => p.sy) }] : [],
      /** The gold medal over the grey one. */
      lit: clock.interpolate({ inputRange: [plan.lightAtMs, plan.lightAtMs + plan.lightMs], outputRange: [0, 1], extrapolate: 'clamp' }),
      /** The burst's light: present as the medal turns gold, then gone, so the card stays clean. */
      glow: travel ? clock.interpolate({ inputRange: [plan.burstAtMs, plan.burstAtMs + 200, plan.burstAtMs + 900], outputRange: [0, 1, 0], extrapolate: 'clamp' }) : 0,
      /** The streak's words reaching full ink as the number rolls on. */
      ink: clock.interpolate({ inputRange: [plan.countAtMs, plan.countAtMs + INK_MS], outputRange: [YESTERDAY_INK, 1], extrapolate: 'clamp' }),
      roll: travel
        ? arriving(clock, plan.countAtMs, ROLL_MS, settleOut)
        : clock.interpolate({ inputRange: [plan.countAtMs, plan.overMs], outputRange: [0, 1], extrapolate: 'clamp' }),
      words: after(plan.wordsAtMs),
      dayNames: after(plan.weekAtMs),
      /** The `order`-th week day to arrive: it grows into place, and today's pops. */
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
  /** The flame screen played first (a growth day), so the number has rolled and the moment was felt already. */
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
  // The app's one celebration bursts from the medal as it turns gold, with haptic and sound once.
  const moment = useCelebration({ sound: 'reward', feel: !afterFlame, delayMs: plan.burstAtMs });
  const clock = useRef(new Animated.Value(0)).current;
  const leave = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;
  const playing = useRef<Animated.CompositeAnimation | null>(null);
  const going = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [settled, setSettled] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const show = useReveal(plan, clock);
  // A badge earned meanwhile waits until the card has had its moment.
  useCelebrationHold(!settled);
  // Only a server that sends today and the learned days has a week to show.
  const week = streak.today && streak.recent ? streakWeek({ today: streak.today, recent: streak.recent, startsOn: weekStartsOn(locale) }) : null;
  const unit = t(unitFor(day));
  const title = `${formatNumber(day, locale)} ${unit}`;

  useEffect(() => {
    // The flame screen already announced the day, where there was one.
    if (!afterFlame) AccessibilityInfo.announceForAccessibility?.(title);
    // Only once, as it opens.
  }, []);

  // Hevalo says the day's word aloud after the medal's chime (shared reactions.ts): a first day, a return, a best, a day kept.
  const [mood] = useState(speech.mood);
  useEffect(() => sayReactionLater(plan.burstAtMs + reactionDelayMs('verdict', reduce), { moment: streakMoment(mood), character: 'hevalo' }), [plan, mood, reduce]);

  useEffect(() => {
    clock.setValue(0);
    const run = Animated.timing(clock, { toValue: plan.overMs, duration: plan.overMs, easing: Easing.linear, useNativeDriver: true });
    playing.current = run;
    run.start(({ finished }) => {
      if (finished) setSettled(true);
    });
    return () => run.stop();
    // The Reduce Motion answer can arrive late; then it replays, as a fade.
  }, [plan, clock]);

  // Once lit and landed it floats gently while the screen is in front.
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

  /** A tap on the card while it plays: everything to its end state at once. */
  const finish = useCallback(() => {
    if (settled) return;
    playing.current?.stop();
    clock.setValue(plan.overMs);
    moment.skip();
    setSettled(true);
  }, [settled, clock, plan, moment]);

  /** The way on: the card's words fade and the medal gathers itself and leaves, then on. */
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
        {/* A tap anywhere finishes it; screen readers skip it and read the card's final state. */}
        <Pressable onPress={finish} accessible={false} focusable={false} style={styles.weekTap} testID="streak-card">
          {/* A quiet panel named at the top, holding the card with the medal half over its top edge. */}
          <Animated.View style={[styles.panel, { backgroundColor: colors.controlTrack, opacity: show.open, transform: [{ translateY: risen(show.open) }] }]}>
            <Animated.Text style={[styles.panelName, { color: colors.textSecondary, opacity: stay }]}>{t('profile.stat.streak')}</Animated.Text>
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              {/* A picture beside the words that say it, so not read twice. */}
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
                      {/* Yesterday's grey medal with today's over it: one medal changing colour. */}
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
                {/* The streak in words, the number separate so it can roll; quiet while it shows yesterday. */}
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
              {/* The fire's stage and the next as a near goal; never a countdown, and at the Newroz fire just its name. */}
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
      {/* The way on: last to arrive, but tappable from the first frame. */}
      <Animated.View style={[styles.bar, { paddingBottom: bottom, opacity: show.onward, transform: [{ translateY: risen(show.onward) }] }]} testID="streak-onward">
        {/* On milestone days, a quiet Share over the way on, which keeps the foot of the screen. */}
        {streakMilestone(day) ? <ShareWin text={streakShare(t, locale, day)} testID="streak-share" /> : null}
        <ClayButton label={t(goalDone ? 'lesson.streak.seeYou' : 'common.continue')} tone="primary" size="large" onPress={onward} />
      </Animated.View>
    </View>
  );
}

/** A spark rising off the lit medal now and then: up, out to its side, and gone. It waits `afterMs` past `startMs` and repeats while in front. */
function Spark({ dx, size, afterMs, startMs, colour }: { dx: number; size: number; afterMs: number; startMs: number; colour: string }): React.JSX.Element {
  const alive = useMotionAlive();
  const rise = useRef(new Animated.Value(0)).current;
  const since = useRef(Date.now()).current;
  useEffect(() => {
    if (!alive) return;
    const loop = Animated.loop(Animated.timing(rise, { toValue: 1, duration: SPARK_MS, easing: Easing.linear, useNativeDriver: true }));
    // The first only after the medal lights; when back in front later, at its own beat straight away.
    const wait = setTimeout(() => loop.start(), Math.max(afterMs % 900, startMs + afterMs - (Date.now() - since)));
    return () => {
      clearTimeout(wait);
      loop.stop();
      rise.setValue(0);
    };
  }, [alive, rise, afterMs, startMs, since]);
  // Quick off the medal and slowing as it climbs, then nothing until it repeats.
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
 * The streak's week: day initials over seven places from the learner's first weekday (Saturday in Kurdish and
 * Arabic). A learned day wears a small gold laurel medal, a frozen day an ice-blue snowflake medal; days to come and
 * missed days show their date (missed ones more quietly, never a cross), and today, still to learn, its date in a
 * gold ring. Each has a sign, never colour alone. They arrive in order, today's popping in last.
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
          {/* In order, with today's after the whole week. */}
          <DayMark day={d} arrival={day(d.isToday ? week.length : i, d.isToday)} />
        </View>
      ))}
    </View>
  );
}

/** One day's place in the week: its medal or its date. */
function DayMark({ day, arrival }: { day: WeekDay; arrival: { opacity: Clocked; scale: Clocked } }): React.JSX.Element {
  const { colors } = useTheme();
  const { locale } = useI18n();
  const medal = day.state === 'learned' || day.state === 'frozen' ? day.state : null;
  // The day of the month from the server's date string, so no time zone shifts it.
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

/** How near the next freeze is, or how many are saved, under the week. `filled` is the bar's progress on the card's clock. */
function FreezeLine({ streak, filled }: { streak: Streak; filled: Clocked }): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const freeze = freezeLine(streak);
  const share = freeze?.kind === 'toward' ? freeze.done / freeze.per : 1;
  const [width, setWidth] = useState(0);
  if (!freeze) return null;
  // The bar slides in from the reading side, as every bar's fill does.
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
  flameUnit: { fontSize: typography.sizes.title, fontWeight: typography.weights.bold, marginTop: -spacing.xs },
  // Narrow enough that a sentence wraps into two even lines rather than leaving one word over.
  grew: { maxWidth: 320, fontSize: typography.sizes.text, fontWeight: typography.weights.bold, lineHeight: 26, textAlign: 'center', marginTop: spacing.md, paddingHorizontal: layout.gutter },
  rolling: { flexDirection: 'row', justifyContent: 'center' },
  leaving: { position: 'absolute', top: 0, left: 0, right: 0, textAlign: 'center' },
  weekBody: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: layout.gutter, paddingVertical: spacing.md, maxWidth: layout.column, width: '100%', alignSelf: 'center' },
  weekTap: { gap: spacing.md },
  // The panel leaves the medal room above the card.
  panel: { borderRadius: radii.xl, paddingTop: spacing.md + 4, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
  panelName: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, textAlign: 'center', marginBottom: MEDAL / 2 + spacing.sm },
  card: { alignItems: 'center', borderRadius: radii.lg, paddingTop: MEDAL / 2 + spacing.sm, paddingBottom: spacing.md + 4, paddingHorizontal: spacing.sm },
  cardWords: { alignSelf: 'stretch', alignItems: 'center', gap: spacing.xs + 2 },
  // Half over the card's top edge.
  medal: { position: 'absolute', top: -MEDAL / 2, alignSelf: 'center', width: MEDAL, height: MEDAL },
  // The burst's light, centred on the medal and wider than it.
  medalGlow: { position: 'absolute', left: (MEDAL - MEDAL_GLOW) / 2, top: (MEDAL - MEDAL_GLOW) / 2, width: MEDAL_GLOW, height: MEDAL_GLOW },
  // A spark starts in the laurel, a little above the medal's centre.
  spark: { position: 'absolute', top: '26%', left: '50%', borderRadius: radii.pill },
  // The number and its words on one line, a space apart.
  titleRow: { alignItems: 'flex-end', justifyContent: 'center', columnGap: 7, flexWrap: 'wrap' },
  title: { fontSize: typography.sizes.title, fontWeight: typography.weights.bold, lineHeight: 34, textAlign: 'center', letterSpacing: -0.4 },
  cheer: { fontSize: typography.sizes.text, lineHeight: 23, textAlign: 'center', paddingHorizontal: spacing.sm },
  under: { gap: spacing.md },
  stage: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold, textAlign: 'center' },
  stageName: { fontWeight: typography.weights.bold },
  week: { alignSelf: 'stretch', justifyContent: 'space-between', marginTop: spacing.md },
  dayColumn: { flex: 1, alignItems: 'center', gap: spacing.sm },
  dayName: { fontSize: typography.sizes.text, fontWeight: typography.weights.medium },
  dayNameToday: { fontWeight: typography.weights.bold },
  day: { width: DAY, height: DAY, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  // Today, still to learn: its date in a ring.
  dayRing: { borderWidth: 2 },
  dayDate: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold, fontVariant: ['tabular-nums'] },
  dayGone: { opacity: 0.7 },
  freeze: { alignSelf: 'stretch', gap: spacing.sm },
  freezeHead: { alignItems: 'center', gap: spacing.sm },
  freezeText: { flex: 1, fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  track: { height: 10, borderRadius: radii.pill, overflow: 'hidden' },
  fill: { width: '100%', height: '100%', borderRadius: radii.pill },
  bar: { paddingHorizontal: layout.gutter, paddingTop: spacing.sm, gap: spacing.sm },
});
