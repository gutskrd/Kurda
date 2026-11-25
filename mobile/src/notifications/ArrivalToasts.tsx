import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, PanResponder, Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { NavigationContainerRefContext } from '@react-navigation/native';
import { noticePicture } from '@kurda/shared';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import type { RootNavigation } from '../navigation/rootStack';
import { openPushTarget, pushTarget } from '../push/routing';
import { useDirection } from '../reports/direction';
import { springTo, timing } from '../theme/animate';
import { Icon } from '../theme/Icon';
import { duration } from '../theme/motion';
import { Pressable } from '../theme/Pressable';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { onArrival, type Arrival } from './arrivals';
import { notificationText } from './followLink';
import { noticeKind } from './inbox';
import { NoticeArt } from './NotificationRow';

/** How long an arrival stays, and how many show at once, as on the website (web/src/social/RailToasts.tsx). */
export const ARRIVAL_MS = 8000;
const MAX_ARRIVALS = 3;
/** How far up a toast is pushed before letting go sends it away. */
const FLING_PX = 28;

/**
 * Pushes that arrive while the app is open (arrivals.ts), each as Hevalo's own toast: the notification's picture or its
 * kind's glyph, its words in the reader's language, and a thin bar running down its time. A badge or league result is a
 * reward: its medal pops in and three sparkles light round it. A tap opens what it is about; a flick up or the close button
 * sends it away sooner. At most three at once, the newest last.
 */
export function useArrivals(): { arrivals: Arrival[]; dismiss: (id: string) => void } {
  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setArrivals((list) => list.filter((a) => a.id !== id));
  }, []);

  useEffect(() => {
    const live = timers.current;
    const stop = onArrival((arrival) => {
      if (live.has(arrival.id)) return;
      live.set(arrival.id, setTimeout(() => dismiss(arrival.id), ARRIVAL_MS));
      setArrivals((list) => [...list, arrival].slice(-MAX_ARRIVALS));
    });
    return () => {
      stop();
      for (const timer of live.values()) clearTimeout(timer);
      live.clear();
    };
  }, [dismiss]);

  return { arrivals, dismiss };
}

export function ArrivalCard({ arrival, onClose }: { arrival: Arrival; onClose: () => void }): React.JSX.Element {
  const nav = useContext(NavigationContainerRefContext);
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const reduce = useReducedMotion();
  const item = useMemo(() => ({ title: arrival.title, body: arrival.body, data: arrival.data, category: '' }), [arrival]);
  const text = notificationText(item, t, locale);
  const kind = noticeKind(item);
  const picture = noticePicture(item);
  const reward = picture?.kind === 'badge' || picture?.kind === 'league';

  const arrive = useRef(new Animated.Value(0)).current;
  const drag = useRef(new Animated.Value(0)).current;
  const left = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    haptic('select');
    // Android reads the live region as it appears; iOS needs telling.
    if (Platform.OS !== 'android') AccessibilityInfo.announceForAccessibility?.([text.title, text.body].filter(Boolean).join('. '));
    const runs = [reduce ? timing(arrive, 1, duration.base) : springTo(arrive, 1, 'arrive'), timing(left, 0, ARRIVAL_MS, { easing: (x) => x })];
    for (const run of runs) run.start();
    return () => runs.forEach((run) => run.stop());
  }, [arrive, left, reduce]);

  const away = useCallback(() => {
    timing(drag, -120, duration.base).start(() => onClose());
  }, [drag, onClose]);
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dy < -6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_, g) => drag.setValue(Math.min(0, g.dy)),
        onPanResponderRelease: (_, g) => (g.dy < -FLING_PX || g.vy < -0.5 ? away() : springTo(drag, 0, 'release').start()),
        onPanResponderTerminate: () => springTo(drag, 0, 'release').start(),
      }),
    [drag, away],
  );

  const open = (): void => {
    haptic('tap');
    onClose();
    if (nav?.isReady()) openPushTarget(pushTarget(arrival.data), nav as unknown as RootNavigation, client);
  };
  const slide = reduce ? 0 : arrive.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] });

  return (
    <Animated.View
      {...pan.panHandlers}
      accessibilityLiveRegion="polite"
      style={[
        styles.card,
        { backgroundColor: colors.surfaceRaised, borderColor: colors.separator, shadowColor: colors.softShadow },
        { opacity: arrive, transform: [{ translateY: Animated.add(slide, drag) }] },
      ]}
      testID="arrival-toast"
    >
      <View style={[styles.row, { flexDirection: dir.row }]}>
        <Pressable
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel={[text.title, text.body].filter(Boolean).join(', ')}
          style={[styles.main, { flexDirection: dir.row }]}
          testID="arrival-open"
        >
          <View style={styles.art} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Pop on={reward && !reduce}>
              {picture ? (
                <NoticeArt picture={picture} />
              ) : (
                <View style={[styles.glyph, { backgroundColor: colors.controlTrack }]}>
                  <Icon name={kind.icon} size={22} color={colors.textPrimary} />
                </View>
              )}
            </Pop>
            {reward ? <Sparkles color={colors.gold} reduce={reduce} /> : null}
          </View>
          <View style={styles.words}>
            <Text style={[styles.title, dir.text, { color: colors.textPrimary }]} numberOfLines={2}>
              {text.title}
            </Text>
            {text.body ? (
              <Text style={[styles.body, dir.text, { color: colors.textSecondary }]} numberOfLines={2}>
                {text.body}
              </Text>
            ) : null}
          </View>
        </Pressable>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} style={styles.close} testID="arrival-close">
          <Icon name="close" size={16} tone="secondary" />
        </Pressable>
      </View>
      {/* The time left, running down from the side reading starts on. */}
      {reduce ? null : (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.timer,
            { backgroundColor: colors.textSecondary, transform: [{ scaleX: left }], transformOrigin: dir.row === 'row-reverse' ? 'right center' : 'left center' },
          ]}
        />
      )}
    </Animated.View>
  );
}

/** A reward's medal landing: it grows a little past its size and settles, once. */
function Pop({ on, children }: { on: boolean; children: React.ReactNode }): React.JSX.Element {
  const p = useRef(new Animated.Value(on ? 0 : 1)).current;
  useEffect(() => {
    if (!on) return;
    const run = springTo(p, 1, 'release');
    run.start();
    return () => run.stop();
  }, [p, on]);
  const scale = p.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });
  return <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>;
}

/** Where the three sparkles sit round the medal, and when each lights. */
const SPARKS = [
  { top: -4, right: -3, size: 10, delay: 120 },
  { bottom: 0, left: -5, size: 8, delay: 260 },
  { top: 6, left: -7, size: 6, delay: 400 },
] as const;

/** Three four-point sparkles round a reward's medal, each lighting in turn and settling a little dimmer. */
function Sparkles({ color, reduce }: { color: string; reduce: boolean }): React.JSX.Element {
  const lights = useRef(SPARKS.map(() => new Animated.Value(reduce ? 0.8 : 0))).current;
  useEffect(() => {
    if (reduce) return;
    const runs = lights.map((v, i) =>
      Animated.sequence([Animated.delay(SPARKS[i]!.delay), timing(v, 1, duration.base), timing(v, 0.7, duration.slow)]),
    );
    Animated.parallel(runs).start();
    return () => runs.forEach((r) => r.stop());
  }, [lights, reduce]);
  return (
    <>
      {SPARKS.map(({ delay: _delay, size, ...at }, i) => (
        <Animated.View key={i} pointerEvents="none" style={[styles.spark, at, { width: size, height: size, opacity: lights[i] }]}>
          <Svg width={size} height={size} viewBox="0 0 10 10">
            <Path d="M5 0C5.4 3.2 6.8 4.6 10 5C6.8 5.4 5.4 6.8 5 10C4.6 6.8 3.2 5.4 0 5C3.2 4.6 4.6 3.2 5 0Z" fill={color} />
          </Svg>
        </Animated.View>
      ))}
    </>
  );
}

const ART = 44;

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    maxWidth: 420,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 8,
  },
  row: { alignItems: 'center' },
  main: { flex: 1, alignItems: 'center', gap: spacing.sm + 4, paddingVertical: spacing.sm + 2, paddingStart: spacing.sm + 2 },
  art: { width: ART, height: ART, alignItems: 'center', justifyContent: 'center' },
  glyph: { width: ART, height: ART, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  spark: { position: 'absolute' },
  words: { flex: 1, gap: 2 },
  title: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold, lineHeight: 20 },
  body: { fontSize: typography.sizes.text, lineHeight: 20 },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginHorizontal: spacing.xs },
  timer: { height: 2, opacity: 0.35 },
});
